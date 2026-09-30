import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const oauthRouter = Router();

/**
 * Get canonical issuer URL derived from MCP_SERVER_PUBLIC_URL.
 * @returns {string}
 */
function getIssuerUrl() {
  try {
    return new URL(config.MCP_SERVER_PUBLIC_URL).origin;
  } catch {
    return config.MCP_SERVER_PUBLIC_URL;
  }
}

/**
 * RFC 8414 Authorization Server Metadata endpoint.
 * Exposes server OAuth capabilities, token endpoint, PKCE (S256), and supported flows.
 */
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  const issuerUrl = getIssuerUrl();
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    issuer: issuerUrl,
    authorization_endpoint: `${issuerUrl}/token`,
    token_endpoint: `${issuerUrl}/token`,
    grant_types_supported: ['client_credentials'],
    response_types_supported: ['token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:full']
  });
});

/**
 * RFC 9728 Protected Resource Metadata endpoint.
 * Exposes resource identifier and authorized issuer URLs for dynamic discovery.
 */
oauthRouter.get('/.well-known/oauth-protected-resource', (req, res) => {
  const issuerUrl = getIssuerUrl();
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    resource: config.MCP_SERVER_PUBLIC_URL,
    authorization_servers: [issuerUrl],
    scopes_supported: ['mcp:full'],
    bearer_methods_supported: ['header']
  });
});

/**
 * OAuth 2.1 Token Endpoint (/token).
 * Validates client_credentials grant type and Basic Auth, and returns a signed Bearer JWT.
 */
oauthRouter.post('/token', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  let clientId = '';
  let clientSecret = '';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentialsBase64 = authHeader.slice(6).trim();
    const credentials = Buffer.from(credentialsBase64, 'base64').toString('utf8');
    const colonIdx = credentials.indexOf(':');
    if (colonIdx !== -1) {
      clientId = credentials.slice(0, colonIdx);
      clientSecret = credentials.slice(colonIdx + 1);
    }
  } else {
    clientId = req.body?.client_id || req.query?.client_id || '';
    clientSecret = req.body?.client_secret || req.query?.client_secret || '';
  }

  // 1. Validate Client Credentials
  if (!clientId || !clientSecret || clientId !== config.OAUTH_CLIENT_ID || clientSecret !== config.OAUTH_CLIENT_SECRET) {
    logger.warn({ clientId }, 'OAuth token issuance failed: invalid client credentials');
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials'
    });
  }

  // 2. Validate Grant Type
  const grantType = req.body?.grant_type || req.query?.grant_type;
  if (grantType !== 'client_credentials') {
    logger.warn({ grantType }, 'OAuth token issuance failed: unsupported grant type');
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant_type is supported'
    });
  }

  // 3. Validate Resource Parameter (if provided)
  const resourceParam = req.body?.resource || req.query?.resource;
  if (resourceParam) {
    const targetNorm = config.MCP_SERVER_PUBLIC_URL.replace(/\/+$/, '');
    const paramNorm = String(resourceParam).replace(/\/+$/, '');
    if (paramNorm !== targetNorm) {
      logger.warn({ resourceParam, expected: config.MCP_SERVER_PUBLIC_URL }, 'OAuth token issuance failed: invalid resource target');
      return res.status(400).json({
        error: 'invalid_target',
        error_description: 'Resource parameter does not match protected resource URI'
      });
    }
  }

  // 4. Issue Signed JWT Access Token
  const issuerUrl = getIssuerUrl();
  const token = jwt.sign(
    {
      iss: issuerUrl,
      sub: clientId,
      aud: config.MCP_SERVER_PUBLIC_URL,
      scope: 'mcp:full'
    },
    config.JWT_SIGNING_SECRET,
    {
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS
    }
  );

  logger.info({ clientId, ttl: config.ACCESS_TOKEN_TTL_SECONDS }, 'OAuth Bearer access token issued successfully');

  return res.status(200).json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: config.ACCESS_TOKEN_TTL_SECONDS,
    scope: 'mcp:full'
  });
});
