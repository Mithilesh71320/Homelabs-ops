import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'child_process';

console.log('=== RUNNING MODULE 6 COMPREHENSIVE VERIFICATION ===\n');

const testDbPath = './test_audit_m6.db';
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

// 1. Fast-Fail Environment Validation Tests for Module 6
console.log('--- 1. Testing Config Fast-Fail for Module 6 OAuth Env Vars ---');
const { spawnSync } = await import('child_process');

function testMissingOAuthVar(varName) {
  const env = {
    PORT: '3998',
    PORTAINER_URL: 'http://127.0.0.1:9000',
    PORTAINER_API_TOKEN: 'token123',
    PORTAINER_ENDPOINT_ID: '1',
    SQLITE_DB_PATH: testDbPath,
    AWS_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    MCP_SERVER_PUBLIC_URL: 'http://127.0.0.1:3080/mcp',
    OAUTH_CLIENT_ID: 'alexa_test_client',
    OAUTH_CLIENT_SECRET: 'alexa_test_secret',
    ACCESS_TOKEN_TTL_SECONDS: '3600',
    JWT_SIGNING_SECRET: 'test_jwt_secret_key_123',
    DOTENV_CONFIG_PATH: 'non_existent_file'
  };
  delete env[varName];

  const res = spawnSync('node', ['src/index.js'], { env, stdio: 'pipe' });
  const stderr = res.stderr.toString();
  const hasError = stderr.includes(`${varName} is required`) || stderr.includes('Missing or invalid environment variables');
  console.log(`Missing ${varName} -> Exit code: ${res.status}, Error detected: ${hasError}`);
  return hasError;
}

const ffMcpUrl = testMissingOAuthVar('MCP_SERVER_PUBLIC_URL');
const ffClientId = testMissingOAuthVar('OAUTH_CLIENT_ID');
const ffClientSecret = testMissingOAuthVar('OAUTH_CLIENT_SECRET');
const ffJwtSecret = testMissingOAuthVar('JWT_SIGNING_SECRET');

if (ffMcpUrl && ffClientId && ffClientSecret && ffJwtSecret) {
  console.log('✔ All Module 6 Config Fast-Fail tests PASSED!\n');
} else {
  throw new Error('Module 6 Config Fast-Fail tests FAILED');
}

// 2. Start Full MCP Server Process for Module 6 E2E Testing
console.log('--- 2. Starting MCP Server Process with OAuth Enforced ---');
const serverPort = 3080;
const serverPublicUrl = `http://127.0.0.1:${serverPort}/mcp`;
const clientId = 'alexa_test_client';
const clientSecret = 'alexa_test_secret';
const jwtSecret = 'test_jwt_secret_key_123';

const serverEnv = {
  PORT: String(serverPort),
  PORTAINER_URL: 'http://127.0.0.1:9880',
  PORTAINER_API_TOKEN: 'test_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: testDbPath,
  AWS_REGION: 'us-east-1',
  BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MCP_SERVER_PUBLIC_URL: serverPublicUrl,
  OAUTH_CLIENT_ID: clientId,
  OAUTH_CLIENT_SECRET: clientSecret,
  ACCESS_TOKEN_TTL_SECONDS: '3600',
  JWT_SIGNING_SECRET: jwtSecret,
  DOTENV_CONFIG_PATH: 'non_existent_file'
};

const serverProc = spawn('node', ['src/index.js'], { env: serverEnv, stdio: 'pipe' });
let serverLogs = '';
serverProc.stdout.on('data', d => serverLogs += d.toString());
serverProc.stderr.on('data', d => serverLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

try {
  // 3. Test /.well-known/oauth-authorization-server
  console.log('\n--- 3. Testing /.well-known/oauth-authorization-server Endpoint ---');
  const authServerRes = await fetch(`http://127.0.0.1:${serverPort}/.well-known/oauth-authorization-server`);
  const authServerData = await authServerRes.json();
  console.log('Auth Server Metadata Output:\n', JSON.stringify(authServerData, null, 2));

  if (authServerRes.status !== 200) throw new Error(`Expected HTTP 200, got ${authServerRes.status}`);
  if (!authServerData.grant_types_supported.includes('client_credentials')) throw new Error('Missing client_credentials in grant_types_supported');
  if (!authServerData.code_challenge_methods_supported.includes('S256')) throw new Error('Missing S256 in code_challenge_methods_supported');
  console.log('✔ /.well-known/oauth-authorization-server PASSED!');

  // 4. Test /.well-known/oauth-protected-resource
  console.log('\n--- 4. Testing /.well-known/oauth-protected-resource Endpoint ---');
  const protectedRes = await fetch(`http://127.0.0.1:${serverPort}/.well-known/oauth-protected-resource`);
  const protectedData = await protectedRes.json();
  console.log('Protected Resource Metadata Output:\n', JSON.stringify(protectedData, null, 2));

  if (protectedRes.status !== 200) throw new Error(`Expected HTTP 200, got ${protectedRes.status}`);
  if (protectedData.resource !== serverPublicUrl) throw new Error(`Expected resource ${serverPublicUrl}, got ${protectedData.resource}`);
  console.log('✔ /.well-known/oauth-protected-resource PASSED!');

  // 5. Test POST /token Endpoint
  console.log('\n--- 5. Testing POST /token Endpoint ---');

  // 5a. Invalid Client Credentials
  console.log('Testing invalid client credentials...');
  const badAuthHeader = 'Basic ' + Buffer.from('wrong_client:wrong_secret').toString('base64');
  const badTokenRes = await fetch(`http://127.0.0.1:${serverPort}/token`, {
    method: 'POST',
    headers: { 'Authorization': badAuthHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const badTokenData = await badTokenRes.json();
  console.log('Bad token response:', badTokenRes.status, badTokenData);

  if (badTokenRes.status !== 401 || badTokenData.error !== 'invalid_client') {
    throw new Error('Invalid client did not return 401 invalid_client');
  }

  // 5b. Unsupported Grant Type
  console.log('Testing unsupported grant_type...');
  const validAuthHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const badGrantRes = await fetch(`http://127.0.0.1:${serverPort}/token`, {
    method: 'POST',
    headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=authorization_code'
  });
  const badGrantData = await badGrantRes.json();
  console.log('Bad grant_type response:', badGrantRes.status, badGrantData);

  if (badGrantRes.status !== 400 || badGrantData.error !== 'unsupported_grant_type') {
    throw new Error('Unsupported grant_type did not return 400 unsupported_grant_type');
  }

  // 5c. Valid Token Issuance
  console.log('Testing valid token issuance...');
  const tokenRes = await fetch(`http://127.0.0.1:${serverPort}/token`, {
    method: 'POST',
    headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&resource=${encodeURIComponent(serverPublicUrl)}`
  });
  const tokenData = await tokenRes.json();
  console.log('Valid token response:', tokenRes.status, tokenData);

  if (tokenRes.status !== 200 || !tokenData.access_token || tokenData.token_type !== 'Bearer') {
    throw new Error('Token issuance failed to return access_token and token_type Bearer');
  }
  const accessToken = tokenData.access_token;
  console.log('✔ POST /token PASSED!');

  // 6. Test /mcp Protection & Unauthenticated 401 Header Absence
  console.log('\n--- 6. Testing /mcp Protection & Bare 401 Response ---');

  // 6a. Unauthenticated /mcp Call
  console.log('Calling /mcp without Authorization header...');
  const noAuthRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
  });
  const noAuthWwwHeader = noAuthRes.headers.get('www-authenticate');
  console.log('No-auth status:', noAuthRes.status, '| WWW-Authenticate header:', noAuthWwwHeader);

  if (noAuthRes.status !== 401) {
    throw new Error(`Expected HTTP 401, got ${noAuthRes.status}`);
  }
  if (noAuthWwwHeader !== null) {
    throw new Error(`WWW-Authenticate header MUST NOT be present on unauthenticated 401 response (got "${noAuthWwwHeader}")`);
  }
  console.log('✔ Unauthenticated /mcp returned bare 401 without WWW-Authenticate header!');

  // 6b. Authenticated /mcp Call with Valid Bearer Token
  console.log('Calling /mcp with valid Bearer token...');
  const mcpSessionInit = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'alexa-test', version: '1.0' } }
    })
  });
  const mcpSessionId = mcpSessionInit.headers.get('mcp-session-id');
  console.log('MCP Session initialized cleanly, sessionId:', mcpSessionId);

  const mcpPingRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': mcpSessionId,
      'mcp-protocol-version': '2024-11-05'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ping', arguments: {} } })
  });
  const pingBodyText = await mcpPingRes.text();
  console.log('Authenticated ping tool result:\n', pingBodyText);

  if (mcpPingRes.status !== 200 || !pingBodyText.includes('HomeLab Ops MCP server is alive.')) {
    throw new Error('Authenticated /mcp request failed to execute ping tool');
  }
  console.log('✔ Authenticated /mcp request with Bearer JWT PASSED!');

  // 6c. Expired Token Rejection Test
  console.log('Testing expired token rejection...');
  const jwt = (await import('jsonwebtoken')).default;
  const expiredToken = jwt.sign(
    { iss: serverPublicUrl, sub: clientId, aud: serverPublicUrl, scope: 'mcp:full' },
    jwtSecret,
    { expiresIn: '1s' }
  );

  console.log('Waiting 2 seconds for token to expire...');
  await new Promise(r => setTimeout(r, 2000));

  const expiredRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${expiredToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })
  });
  const expiredWwwHeader = expiredRes.headers.get('www-authenticate');
  console.log('Expired token response status:', expiredRes.status, '| WWW-Authenticate:', expiredWwwHeader);

  if (expiredRes.status !== 401) {
    throw new Error(`Expected HTTP 401 for expired token, got ${expiredRes.status}`);
  }
  if (expiredWwwHeader !== null) {
    throw new Error(`WWW-Authenticate header MUST NOT be present on expired token 401 response (got "${expiredWwwHeader}")`);
  }
  console.log('✔ Expired token correctly rejected with HTTP 401 and no WWW-Authenticate header!');

  console.log('\n=== ALL MODULE 6 TESTS COMPLETED SUCCESSFULLY! ===');
} catch (err) {
  console.error('\n❌ MODULE 6 VERIFICATION FAILED:', err);
  process.exitCode = 1;
} finally {
  serverProc.kill();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
}
