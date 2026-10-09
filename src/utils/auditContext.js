import { AsyncLocalStorage } from 'async_hooks';

export const auditContextStorage = new AsyncLocalStorage();

/**
 * Runs a function within an AsyncLocalStorage context specifying the audit source.
 * @template T
 * @param {'mcp' | 'alexa-skill'} source
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T> | T}
 */
export function runWithSource(source, fn) {
  return auditContextStorage.run({ source }, fn);
}

/**
 * Retrieves the current audit source from AsyncLocalStorage, defaulting to 'mcp'.
 * @returns {'mcp' | 'alexa-skill'}
 */
export function getAuditSource() {
  const store = auditContextStorage.getStore();
  return store?.source || 'mcp';
}
