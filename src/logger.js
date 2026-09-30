import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'homelab-ops-mcp' },
  timestamp: pino.stdTimeFunctions.isoTime
});
