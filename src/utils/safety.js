import { randomUUID } from 'crypto';

/**
 * @typedef {Object} PendingAction
 * @property {string} action_id - Unique UUID v4 for confirmation
 * @property {'restart' | 'stop'} actionType - Type of write action
 * @property {string} target - Name or ID of container target
 * @property {number} createdAt - Unix timestamp (ms) when created
 * @property {number} expiresAt - Unix timestamp (ms) when expires
 */

/** @type {Map<string, PendingAction>} */
const pendingActionsMap = new Map();

/**
 * Creates a new pending confirmation action with a 120-second TTL.
 * @param {'restart' | 'stop'} actionType - Type of action ('restart' or 'stop')
 * @param {string} target - Target container name or ID
 * @returns {string} Generated action_id
 */
export function createPendingAction(actionType, target) {
  const action_id = randomUUID();
  const now = Date.now();
  const entry = {
    action_id,
    actionType,
    target,
    createdAt: now,
    expiresAt: now + 120 * 1000 // 120 seconds TTL
  };
  pendingActionsMap.set(action_id, entry);
  return action_id;
}

/**
 * Retrieves a pending action if valid and unexpired. Auto-deletes if expired.
 * @param {string} action_id - Action ID to look up
 * @returns {PendingAction | null}
 */
export function getPendingAction(action_id) {
  if (!action_id || !pendingActionsMap.has(action_id)) {
    return null;
  }
  const entry = pendingActionsMap.get(action_id);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    pendingActionsMap.delete(action_id);
    return null;
  }

  return entry;
}

/**
 * Consumes (deletes) a pending action entry immediately so it can never be executed twice.
 * @param {string} action_id - Action ID to consume
 * @returns {PendingAction | null}
 */
export function consumePendingAction(action_id) {
  if (!action_id || !pendingActionsMap.has(action_id)) {
    return null;
  }
  const entry = pendingActionsMap.get(action_id);
  pendingActionsMap.delete(action_id);

  if (entry && Date.now() > entry.expiresAt) {
    return null;
  }

  return entry || null;
}

// Background cleanup every 30s to purge expired pending actions
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingActionsMap.entries()) {
    if (now > entry.expiresAt) {
      pendingActionsMap.delete(key);
    }
  }
}, 30000);

cleanupInterval.unref();
