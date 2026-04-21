// src/auth/index.js – Coinbase Advanced Trade v3 JWT authentication
// Uses ES256 JWT as required by CB Advanced Trade API.
// Reference: https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth

import { SignJWT, importPKCS8 } from 'jose';
import { createPrivateKey, randomBytes } from 'crypto';
import config from '../../config/index.js';
import log from '../logging/index.js';

// CB Advanced Trade uses ES256 JWT signing.
// Accept both SEC1 EC PEM and PKCS#8 PEM from env, including escaped newlines.

let _privateKey = null;
let _privateKeyImportLogged = false;
let _normalizedSigningKey = null;
let _keyNameDiagnosticLogged = false;
let _authModeLogged = false;
let _startupAuthDebugLogged = false;
const API_KEY_RESOURCE_NAME_PATTERN = /^organizations\/[^/]+\/apiKeys\/[^/]+$/;
const TOKEN_EXPIRY_SECONDS = 120;
const AUTH_HEADER_SCHEME = 'Bearer';
export const AUTH_DIAGNOSTIC_PATH = '/api/v3/brokerage/accounts?limit=1';

function normalizePrivateKey(rawValue) {
  return rawValue.includes('\\n') ? rawValue.replace(/\\n/g, '\n') : rawValue;
}

function maskSegment(value) {
  if (!value) return '<empty>';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function describeSigningKeyIdentifier(rawValue) {
  const value = (rawValue || '').trim();
  const result = {
    shape: 'empty',
    masked: '<empty>',
    length: value.length,
  };

  if (!value) return result;

  if (API_KEY_RESOURCE_NAME_PATTERN.test(value)) {
    const [, orgId, , keyId] = value.split('/');
    return {
      shape: 'full_resource_name',
      masked: `organizations/${maskSegment(orgId)}/apiKeys/${maskSegment(keyId)}`,
      length: value.length,
    };
  }

  if (!value.includes('/') && /^[A-Za-z0-9_-]{8,}$/.test(value)) {
    return {
      shape: 'short_key_id',
      masked: maskSegment(value),
      length: value.length,
    };
  }

  return {
    shape: 'other_malformed',
    masked: maskSegment(value),
    length: value.length,
  };
}

function logSigningKeyNameShape() {
  if (_keyNameDiagnosticLogged) return;
  const info = describeSigningKeyIdentifier(config.cbApiKeyName);
  log.info('AUTH_KEY_NAME_SHAPE', {
    shape: info.shape,
    maskedKeyName: info.masked,
    length: info.length,
    expectedShape: 'organizations/{org_id}/apiKeys/{key_id}',
  });
  _keyNameDiagnosticLogged = true;
}

function logAuthMode() {
  if (_authModeLogged) return;
  log.info('AUTH_MODE', {
    mode: 'coinbase_advanced_trade_cdp_jwt',
    jwtAlg: 'ES256',
    jwtIss: 'cdp',
    restHost: getRestHost(),
  });
  _authModeLogged = true;
}

function normalizeSigningKeyIdentifier(rawValue) {
  const value = (rawValue || '').trim();
  if (!value) {
    throw new Error('[AUTH] Missing CB_API_KEY_NAME. Expected Coinbase API key resource name: organizations/{org_id}/apiKeys/{key_id}.');
  }
  if (!API_KEY_RESOURCE_NAME_PATTERN.test(value)) {
    const info = describeSigningKeyIdentifier(value);
    throw new Error(
      `[AUTH] Invalid CB_API_KEY_NAME for Coinbase Advanced Trade auth. Detected shape=${info.shape}, masked=${info.masked}. Expected full resource name: organizations/{org_id}/apiKeys/{key_id}. If shape is short_key_id, the key source is likely wrong (Coinbase app key instead of CDP Advanced Trade key).`
    );
  }
  return value;
}

function getSigningKeyIdentifier() {
  if (_normalizedSigningKey) return _normalizedSigningKey;
  logSigningKeyNameShape();
  _normalizedSigningKey = normalizeSigningKeyIdentifier(config.cbApiKeyName);
  return _normalizedSigningKey;
}

export function normalizeRequestPath(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('[AUTH] Request path must be a non-empty string.');
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const u = new URL(path);
    return `${u.pathname}${u.search}`;
  }
  if (!path.startsWith('/')) {
    throw new Error(`[AUTH] Request path must start with "/". Got: "${path}"`);
  }
  return path;
}

export function getJwtBoundPath(path) {
  const requestPath = normalizeRequestPath(path);
  const q = requestPath.indexOf('?');
  return q === -1 ? requestPath : requestPath.slice(0, q);
}

export function getRestHost() {
  try {
    return new URL(config.cbRestBase).host;
  } catch {
    return 'api.coinbase.com';
  }
}

function detectPrivateKeyFormat(pem) {
  if (pem.includes('-----BEGIN EC PRIVATE KEY-----')) return 'EC_PRIVATE_KEY';
  if (pem.includes('-----BEGIN PRIVATE KEY-----')) return 'PKCS8_PRIVATE_KEY';
  if (!pem.trim()) return 'EMPTY';
  return 'UNKNOWN';
}

function convertEcPemToPkcs8Pem(ecPem) {
  try {
    const keyObj = createPrivateKey({ key: ecPem, format: 'pem', type: 'sec1' });
    return keyObj.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch (err) {
    throw new Error(`[AUTH] SEC1-to-PKCS8 conversion failed: ${err.message}`);
  }
}

async function getPrivateKey() {
  if (_privateKey) return _privateKey;
  const rawKey = config.cbApiPrivateKey;
  const normalizedKey = normalizePrivateKey(rawKey);
  const keyFormat = detectPrivateKeyFormat(normalizedKey);

  if (keyFormat === 'EMPTY') {
    throw new Error('[AUTH] Failed to import private key. Detected format: EMPTY. Private key is empty or missing.');
  }

  if (keyFormat === 'UNKNOWN') {
    throw new Error('[AUTH] Failed to import private key. Detected format: UNKNOWN. Expected EC_PRIVATE_KEY or PKCS8_PRIVATE_KEY.');
  }

  try {
    if (keyFormat === 'PKCS8_PRIVATE_KEY') {
      _privateKey = await importPKCS8(normalizedKey, 'ES256');
      if (!_privateKeyImportLogged) {
        log.info('AUTH_KEY_IMPORT_SUCCESS', { keyFormat });
        _privateKeyImportLogged = true;
      }
      return _privateKey;
    }

    if (keyFormat === 'EC_PRIVATE_KEY') {
      const pkcs8Pem = convertEcPemToPkcs8Pem(normalizedKey);
      _privateKey = await importPKCS8(pkcs8Pem, 'ES256');
      if (!_privateKeyImportLogged) {
        log.info('AUTH_KEY_IMPORT_SUCCESS', { keyFormat, convertedTo: 'PKCS8_PRIVATE_KEY' });
        _privateKeyImportLogged = true;
      }
      return _privateKey;
    }

    throw new Error(`[AUTH] Unsupported private key format after detection: ${keyFormat}.`);
  } catch (err) {
    throw new Error(`[AUTH] Failed to convert or import private key. Detected format: ${keyFormat}. ${err.message}`);
  }
}

/**
 * Build a signed JWT for one REST request.
 * @param {string} method  HTTP method e.g. 'GET'
 * @param {string} path    URL path e.g. '/api/v3/brokerage/accounts'
 * @returns {Promise<string>} Bearer token
 */
export async function buildJWT(method, path) {
  const key = await getPrivateKey();
  const signingKeyIdentifier = getSigningKeyIdentifier();
  const methodUpper = method.toUpperCase();
  const uriPath = getJwtBoundPath(path);
  const uri = `${methodUpper} ${getRestHost()}${uriPath}`;
  const nonce = randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    sub: signingKeyIdentifier,
    iss: 'cdp',
    nbf: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
    uri,
  })
    .setProtectedHeader({
      alg: 'ES256',
      kid: signingKeyIdentifier,
      nonce,
    })
    .sign(key);

  return jwt;
}

/**
 * Return headers for an authenticated REST call.
 */
export async function authHeaders(method, path) {
  const token = await buildJWT(method, path);
  return {
    Authorization: `${AUTH_HEADER_SCHEME} ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'CB-VERSION': '2024-02-14',
  };
}

function logStartupAuthDebug(method, path) {
  if (_startupAuthDebugLogged) return;
  const keyInfo = describeSigningKeyIdentifier(config.cbApiKeyName);
  log.info('STARTUP_AUTH_DEBUG', {
    keyNameShape: keyInfo.shape,
    keyNameMasked: keyInfo.masked,
    jwtCreationSuccess: true,
    requestMethod: method.toUpperCase(),
    requestHost: getRestHost(),
    requestPath: normalizeRequestPath(path),
    jwtBoundPath: getJwtBoundPath(path),
    authHeaderScheme: AUTH_HEADER_SCHEME,
  });
  _startupAuthDebugLogged = true;
}

/**
 * Validate that credentials can produce a signed JWT.
 * Called at startup – throws on any failure.
 */
export async function validateCredentials() {
  try {
    logAuthMode();
    logSigningKeyNameShape();
    await buildJWT('GET', AUTH_DIAGNOSTIC_PATH);
    logStartupAuthDebug('GET', AUTH_DIAGNOSTIC_PATH);
    const keyInfo = describeSigningKeyIdentifier(getSigningKeyIdentifier());
    log.info('AUTH_TOKEN_CREATION_SUCCESS', {
      keyNameShape: keyInfo.shape,
      keyNameMasked: keyInfo.masked,
    });
    log.authSuccess({
      keyNameShape: keyInfo.shape,
      keyNameMasked: keyInfo.masked,
    });
  } catch (err) {
    log.authFailure({ error: err.message });
    throw err;
  }
}
