// src/rest.js – Shared authenticated REST client for CB Advanced Trade v3

import config from '../config/index.js';
import { authHeaders, normalizeRequestPath, getRestHost } from './auth/index.js';
import log from './logging/index.js';

const BASE = config.cbRestBase;

/**
 * Authenticated fetch wrapper.
 * Throws a descriptive error on non-2xx responses.
 */
export async function cbFetch(method, path, body = null) {
  const requestPath = normalizeRequestPath(path);
  const url = `${BASE}${requestPath}`;
  log.debug('REST_REQUEST', {
    method: method.toUpperCase(),
    host: getRestHost(),
    path: requestPath,
  });

  const headers = await authHeaders(method, requestPath);
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

export default cbFetch;
