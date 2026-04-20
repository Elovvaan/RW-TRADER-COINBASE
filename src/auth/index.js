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

function normalizePrivateKey(rawValue) {
  return rawValue.includes('\\n') ? rawValue.replace(/\\n/g, '\n') : rawValue;
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
      return _privateKey;
    }

    if (keyFormat === 'EC_PRIVATE_KEY') {
      const pkcs8Pem = convertEcPemToPkcs8Pem(normalizedKey);
      _privateKey = await importPKCS8(pkcs8Pem, 'ES256');
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
  const uri = `${method} api.coinbase.com${path}`;
  const nonce = randomBytes(16).toString('hex');

  const jwt = await new SignJWT({
    sub: config.cbApiKeyName,
    iss: 'cdp',
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120, // 2-minute expiry
    uri,
  })
    .setProtectedHeader({
      alg: 'ES256',
      kid: config.cbApiKeyName,
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
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'CB-VERSION': '2024-02-14',
  };
}

/**
 * Validate that credentials can produce a signed JWT.
 * Called at startup – throws on any failure.
 */
export async function validateCredentials() {
  try {
    await buildJWT('GET', '/api/v3/brokerage/accounts');
    log.authSuccess({ keyName: config.cbApiKeyName });
  } catch (err) {
    log.authFailure({ error: err.message });
    throw err;
  }
}
