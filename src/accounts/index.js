// src/accounts/index.js – Accounts & balances via CB Advanced Trade v3

import cbFetch from '../rest.js';
import log from '../logging/index.js';

/**
 * Fetch all brokerage accounts (paginated, collects all pages).
 * Returns array of account objects.
 */
export async function listAccounts() {
  const results = [];
  let cursor = null;

  do {
    const path = cursor
      ? `/api/v3/brokerage/accounts?limit=250&cursor=${cursor}`
      : '/api/v3/brokerage/accounts?limit=250';

    const data = await cbFetch('GET', path);
    const accounts = data.accounts || [];
    results.push(...accounts);
    cursor = data.has_next ? data.cursor : null;
  } while (cursor);

  log.debug('ACCOUNTS_FETCHED', { count: results.length });
  return results;
}

/**
 * Return a map of { currency → { available, hold, total } } for non-zero balances.
 */
export async function getBalances() {
  const accounts = await listAccounts();
  const balances = {};

  for (const acct of accounts) {
    const avail = parseFloat(acct.available_balance?.value ?? '0');
    const hold  = parseFloat(acct.hold?.value ?? '0');
    const total = avail + hold;
    if (total > 0) {
      balances[acct.currency] = { available: avail, hold, total, uuid: acct.uuid };
    }
  }

  return balances;
}

/**
 * Return total portfolio value in USD (USD balance + USD-paired asset values).
 * Uses provided price map { 'BTC-USD': price, ... } to value crypto holdings.
 */
export function portfolioValueUSD(balances, priceMap) {
  let total = balances['USD']?.available ?? 0;
  for (const [currency, bal] of Object.entries(balances)) {
    if (currency === 'USD') continue;
    const productId = `${currency}-USD`;
    const price = priceMap[productId];
    if (price) total += bal.available * price;
  }
  return total;
}
