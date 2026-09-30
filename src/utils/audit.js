import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * @typedef {Object} AuditEntry
 * @property {string} [action_id] - Optional action identifier
 * @property {string} tool_name - Name of the MCP tool executed
 * @property {string} [target] - Target container or resource name
 * @property {string} status - Execution status ('success' or 'failure')
 * @property {string} [api_call] - API endpoint hit
 * @property {string} [result_summary] - Brief summary of successful result
 * @property {string} [error_message] - Error message on failure
 * @property {string} [timestamp] - ISO 8601 timestamp string
 */

/** @type {any} */
let dbInstance = null;

/**
 * Lazy initializer for the SQLite database instance.
 * @returns {any}
 */
function getDbInstance() {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    const dbPath = path.resolve(config.SQLITE_DB_PATH);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dbInstance = new Database(dbPath);

    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action_id TEXT,
        tool_name TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL,
        api_call TEXT,
        result_summary TEXT,
        error_message TEXT
      );
    `);
    return dbInstance;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ dbPath: config.SQLITE_DB_PATH, error: errorMsg }, `Failed to initialize SQLite audit database at ${config.SQLITE_DB_PATH}: ${errorMsg}`);
    dbInstance = null;
    return null;
  }
}

// Close DB cleanly on process exit
process.on('exit', () => {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore cleanup errors
    }
  }
});

// Initial attempt on startup
getDbInstance();

/**
 * Inserts a single audit entry into the SQLite audit database.
 * If database insertion fails for any reason, it logs a warning via pino and returns safely without throwing.
 *
 * @param {AuditEntry} entry - The audit record to insert
 * @returns {void}
 */
export function logEntry(entry) {
  try {
    const db = getDbInstance();
    if (!db) {
      logger.warn({ entry }, 'Audit log bypassed: database instance is unavailable.');
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO audit_log (
        timestamp,
        action_id,
        tool_name,
        target,
        status,
        api_call,
        result_summary,
        error_message
      ) VALUES (
        @timestamp,
        @action_id,
        @tool_name,
        @target,
        @status,
        @api_call,
        @result_summary,
        @error_message
      )
    `);

    stmt.run({
      timestamp: entry.timestamp || new Date().toISOString(),
      action_id: entry.action_id || null,
      tool_name: entry.tool_name,
      target: entry.target || null,
      status: entry.status,
      api_call: entry.api_call || null,
      result_summary: entry.result_summary || null,
      error_message: entry.error_message || null
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ entry, error: errorMsg }, `Failed to write audit log entry: ${errorMsg}`);
  }
}
