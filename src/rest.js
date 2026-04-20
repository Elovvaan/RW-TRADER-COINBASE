// src/rest.js – Shared authenticated REST client for CB Advanced Trade v3

import config from '../config/index.js';
import { authHeaders } from './auth/index.js';
import log from './logging/index.js';

const BASE = config.cbRestBase;

/**
 * Authenticated fetch wrapper.
 * Throws a descriptive error on non-2xx responses.
 */
export async function cbFetch(method, path, body = null) {
  const requestPath = normalizeRequestPath(path);
  const url = `${BASE}${requestPath}`;
  const parsed = new URL(url);
  log.debug('REST_REQUEST', {
    method: method.toUpperCase(),
    host: parsed.host,
    path: parsed.pathname,
    query: parsed.search || '',
  });

  const headers = await authHeaders(method, path);
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(`[REST] Network error ${method} ${requestPath}: ${err.message}`);
  }

  let json;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || json?.raw || res.statusText;
    const preview_id = json?.preview_failure_reason;
    throw Object.assign(
      new Error(`[REST] ${method} ${requestPath} → ${res.status}: ${msg}${preview_id ? ` (${preview_id})` : ''}`),
      { status: res.status, body: json }
    );
  }

  log.debug('REST_OK', { method: method.toUpperCase(), path: requestPath, status: res.status });
  return json;
}

function normalizeRequestPath(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('[REST] path must be a non-empty string');
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const u = new URL(path);
    return `${u.pathname}${u.search}`;
  }
  if (!path.startsWith('/')) {
    throw new Error(`[REST] path must start with "/". Got: "${path}"`);
  }
  return path;
}

export default cbFetch;
