import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Express middleware for protecting the /mcp endpoint.
 * Validates Bearer JWT tokens issued by this server.
 *
 * CRITICAL AUTHENTICATION REQUIREMENT (Alexa+ MCP Spec):
 * Unauthenticated requests MUST return a bare 401 response explicitly WITHOUT
 * setting a WWW-Authenticate header.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({ path: req.path }, 'MCP Auth Failure: Missing or malformed Bearer authorization header');
    res.removeHeader('WWW-Authenticate');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid access token'
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, config.JWT_SIGNING_SECRET);

    // Verify audience matches MCP_SERVER_PUBLIC_URL
    if (typeof decoded === 'object' && decoded !== null && decoded.aud) {
      const targetNorm = config.MCP_SERVER_PUBLIC_URL.replace(/\/+$/, '');
      const tokenAudNorm = String(decoded.aud).replace(/\/+$/, '');
      if (tokenAudNorm !== targetNorm) {
        logger.warn({ tokenAud: decoded.aud, expectedAud: config.MCP_SERVER_PUBLIC_URL }, 'MCP Auth Failure: Token audience mismatch');
        res.removeHeader('WWW-Authenticate');
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Token audience does not match server public URL'
        });
      }
    }

    req.tokenPayload = decoded;
    return next();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ error: errMsg }, `MCP Auth Failure: JWT verification failed (${errMsg})`);
    res.removeHeader('WWW-Authenticate');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid access token'
    });
  }
}
