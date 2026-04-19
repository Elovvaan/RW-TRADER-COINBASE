// src/auth/index.js – Coinbase Advanced Trade v3 JWT authentication
// Uses ES256 JWT as required by CB Advanced Trade API.
// Reference: https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth

import { SignJWT, importPKCS8 } from 'jose';
import { createHash, randomBytes } from 'crypto';
import config from '../../config/index.js';
import log from '../logging/index.js';

// CB Advanced Trade requires the private key in PKCS8 format.
// The .env stores it as EC PEM; jose handles the import.

let _privateKey = null;

async function getPrivateKey() {
  if (_privateKey) return _privateKey;
  try {
    _privateKey = await importPKCS8(config.cbApiPrivateKey, 'ES256');
    return _privateKey;
  } catch (err) {
    throw new Error(`[AUTH] Failed to import private key: ${err.message}`);
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
