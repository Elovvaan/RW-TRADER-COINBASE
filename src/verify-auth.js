// src/verify-auth.js – Standalone Coinbase Advanced Trade auth verifier
// Performs exactly one authenticated GET:
//   /api/v3/brokerage/accounts?limit=1

import 'dotenv/config';
import config from '../config/index.js';
import { authHeaders, normalizeRequestPath, getRestHost } from './auth/index.js';

const METHOD = 'GET';
const PATH = '/api/v3/brokerage/accounts?limit=1';

async function run() {
  const path = normalizeRequestPath(PATH);
  const url = `${config.cbRestBase}${path}`;
  const host = getRestHost();

  try {
    const headers = await authHeaders(METHOD, path);
    const authHeader = headers.Authorization || '';
    const authHeaderScheme = authHeader.split(' ')[0] || '<missing>';

    let res;
    try {
      res = await fetch(url, { method: METHOD, headers });
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ok: false,
        stage: 'request',
        method: METHOD,
        host,
        path,
        authHeaderScheme,
        error: err.message,
      }) + '\n');
      process.exit(1);
    }

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    const out = {
      ok: res.ok,
      method: METHOD,
      host,
      path,
      url,
      status: res.status,
      statusText: res.statusText,
      authHeaderScheme,
      body,
    };

    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(res.ok ? 0 : 1);
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false,
      stage: 'jwt_or_header_build',
      method: METHOD,
      host,
      path,
      error: err.message,
    }) + '\n');
    process.exit(1);
  }
}

run();
