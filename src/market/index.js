// src/market/index.js – WebSocket market data feed + REST fallback
// Subscribes to CB Advanced Trade WebSocket for ticker and user order updates.
// On disconnect, falls back to periodic REST polling until reconnected.

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { buildJWT } from '../auth/index.js';
import { getPriceSnapshots } from '../products/index.js';
import config from '../../config/index.js';
import log from '../logging/index.js';

const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;
const REST_POLL_INTERVAL_MS = 10000;

export class MarketFeed extends EventEmitter {
  constructor(productIds) {
    super();
    this.productIds = productIds;
    this.ws = null;
    this.connected = false;
    this.heartbeatTimer = null;
    this.restPollTimer = null;
    this.reconnectTimer = null;
    this.stopped = false;

    // Latest snapshots: { productId → snapshot }
    this.snapshots = {};
  }

  async start() {
    this.stopped = false;
    await this._connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.restPollTimer);
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    this.connected = false;
  }

  getSnapshot(productId) {
    return this.snapshots[productId] ?? null;
  }

  getAllSnapshots() {
    return { ...this.snapshots };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  async _connect() {
    if (this.stopped) return;

    try {
      const jwt = await buildJWT('GET', '/api/v3/brokerage/accounts');
      this.ws = new WebSocket(config.cbWsUrl);

      this.ws.on('open', () => this._onOpen(jwt));
      this.ws.on('message', data => this._onMessage(data));
      this.ws.on('close', () => this._onClose());
      this.ws.on('error', err => this._onError(err));
    } catch (err) {
      log.error('WS_CONNECT_ERROR', { error: err.message });
      this._scheduleReconnect();
    }
  }

  _onOpen(jwt) {
    this.connected = true;
    clearInterval(this.restPollTimer);
    this.restPollTimer = null;
    log.wsConnected({ url: config.cbWsUrl, products: this.productIds });

    // Subscribe to ticker and user channels
    const sub = {
      type: 'subscribe',
      product_ids: this.productIds,
      channel: 'ticker',
      jwt,
    };
    this.ws.send(JSON.stringify(sub));

    const userSub = {
      type: 'subscribe',
      product_ids: this.productIds,
      channel: 'user',
      jwt,
    };
    this.ws.send(JSON.stringify(userSub));

    this._resetHeartbeat();
  }

  _onMessage(raw) {
    this._resetHeartbeat();
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const channel = msg.channel;
    const events  = msg.events || [];

    if (channel === 'ticker') {
      for (const ev of events) {
        for (const tick of (ev.tickers || [])) {
          const pid   = tick.product_id;
          const price = parseFloat(tick.price);
          const bid   = parseFloat(tick.best_bid);
          const ask   = parseFloat(tick.best_ask);
          if (!pid || isNaN(price)) continue;

          const spread    = ask - bid;
          const spreadPct = bid > 0 ? spread / bid : 0;
          const snap = { productId: pid, price, bid, ask, spread, spreadPct, ts: Date.now() };
          this.snapshots[pid] = snap;
          this.emit('ticker', snap);
        }
      }
    }

    if (channel === 'user') {
      for (const ev of events) {
        for (const order of (ev.orders || [])) {
          this.emit('orderUpdate', order);
        }
      }
    }

    if (channel === 'subscriptions') {
      log.debug('WS_SUBSCRIBED', { channels: msg.events });
    }

    if (msg.type === 'error') {
      log.error('WS_SERVER_ERROR', { message: msg.message });
    }
  }

  _onClose() {
    this.connected = false;
    log.wsDisconnected({ products: this.productIds });
    this._startRestFallback();
    this._scheduleReconnect();
  }

  _onError(err) {
    log.error('WS_ERROR', { error: err.message });
    // close will fire after error
  }

  _resetHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      log.warn('WS_HEARTBEAT_TIMEOUT', {});
      if (this.ws) this.ws.terminate();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  _scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._connect(), RECONNECT_DELAY_MS);
  }

  _startRestFallback() {
    if (this.restPollTimer) return;
    log.wsFallback({ interval: REST_POLL_INTERVAL_MS });

    this.restPollTimer = setInterval(async () => {
      if (this.connected) {
        clearInterval(this.restPollTimer);
        this.restPollTimer = null;
        return;
      }
      try {
        const snaps = await getPriceSnapshots(this.productIds);
        for (const [pid, snap] of Object.entries(snaps)) {
          this.snapshots[pid] = snap;
          this.emit('ticker', snap);
        }
      } catch (err) {
        log.error('REST_FALLBACK_ERROR', { error: err.message });
      }
    }, REST_POLL_INTERVAL_MS);
  }
}

export default MarketFeed;
