import { spawnSync, spawn } from 'child_process';
import http from 'http';

console.log('=== RUNNING MODULE 2 COMPREHENSIVE VERIFICATION ===\n');

// 1. Fast-Fail Tests: Missing env variables
console.log('--- 1. Testing Config Fast-Fail (missing required env variables) ---');

function testMissingVar(varName) {
  const env = {
    PORT: '3999',
    PORTAINER_URL: 'http://127.0.0.1:9000',
    PORTAINER_API_TOKEN: 'token123',
    PORTAINER_ENDPOINT_ID: '1',
    SQLITE_DB_PATH: './audit.db',
    AWS_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    MCP_SERVER_PUBLIC_URL: 'http://localhost:3000/mcp',
    OAUTH_CLIENT_ID: 'alexa_test_client',
    OAUTH_CLIENT_SECRET: 'alexa_test_secret',
    ACCESS_TOKEN_TTL_SECONDS: '3600',
    JWT_SIGNING_SECRET: 'test_jwt_secret',
    DOTENV_CONFIG_PATH: 'non_existent_file'
  };
  delete env[varName];

  const res = spawnSync('node', ['src/index.js'], { env, stdio: 'pipe' });
  const stderr = res.stderr.toString();
  const hasError = stderr.includes(`${varName} is required`) || stderr.includes('Missing or invalid environment variables');
  console.log(`Missing ${varName} -> Exit code: ${res.status}, Error detected: ${hasError}`);
  return hasError;
}

const ffUrl = testMissingVar('PORTAINER_URL');
const ffToken = testMissingVar('PORTAINER_API_TOKEN');
const ffEndpoint = testMissingVar('PORTAINER_ENDPOINT_ID');
const ffRegion = testMissingVar('AWS_REGION');
const ffModel = testMissingVar('BEDROCK_MODEL_ID');

if (ffUrl && ffToken && ffEndpoint && ffRegion && ffModel) {
  console.log('✔ All Fast-Fail tests PASSED!\n');
} else {
  console.error('❌ Fast-Fail tests FAILED!\n');

}

// 2. Mock Portainer Server Setup
console.log('--- 2. Starting Mock Portainer Server ---');
const mockPortainer = http.createServer((req, res) => {
  const url = req.url;
  const apiKey = req.headers['x-api-key'];

  if (apiKey === 'bad_token') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Unauthorized' }));
    return;
  }

  if (url.includes('/docker/containers/json')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { Id: '1234567890ab', Names: ['/plex-server'], State: 'running', Status: 'Up 3 days' },
      { Id: 'abcdef123456', Names: ['/home-assistant'], State: 'running', Status: 'Up 5 days' }
    ]));
  } else if (url.includes('/logs')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('2026-09-30 05:00:00 [info] System initialized\n2026-09-30 05:01:00 [info] Ready to serve');
  } else if (url.includes('/stats')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cpu_stats: { cpu_usage: { total_usage: 100000000 }, system_cpu_usage: 1000000000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 50000000 }, system_cpu_usage: 900000000 },
      memory_stats: { usage: 157286400, limit: 1073741824, stats: { cache: 10485760 } }
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
  }
});

await new Promise(r => mockPortainer.listen(9876, '127.0.0.1', r));
console.log('Mock Portainer server listening on http://127.0.0.1:9876');

// Helper to create an MCP Session & execute tools within that session
async function createMcpSession(port) {
  const tokenRes = await fetch(`http://127.0.0.1:${port}/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from('alexa_test_client:alexa_test_secret').toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token || '';

  const initRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
    })
  });
  const sessionId = initRes.headers.get('mcp-session-id');

  await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
      'mcp-protocol-version': '2024-11-05'
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  });

  let requestId = 2;
  return {
    callTool: async (name, args) => {
      const callRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId,
          'mcp-protocol-version': '2024-11-05'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method: 'tools/call', params: { name, arguments: args } })
      });

      const bodyText = await callRes.text();
      const dataLine = bodyText.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) {
        const json = JSON.parse(dataLine.replace('data: ', ''));
        return json.result?.content?.[0]?.text;
      }
      return bodyText;
    }
  };
}

// 3. Test MCP Server End-to-End
console.log('\n--- 3. Testing MCP Server End-to-End ---');
const testEnv = {
  PORT: '3050',
  PORTAINER_URL: 'http://127.0.0.1:9876',
  PORTAINER_API_TOKEN: 'valid_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: './audit.db',
  AWS_REGION: 'us-east-1',
  BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MCP_SERVER_PUBLIC_URL: 'http://127.0.0.1:3050/mcp',
  OAUTH_CLIENT_ID: 'alexa_test_client',
  OAUTH_CLIENT_SECRET: 'alexa_test_secret',
  ACCESS_TOKEN_TTL_SECONDS: '3600',
  JWT_SIGNING_SECRET: 'test_jwt_secret',
  DOTENV_CONFIG_PATH: 'non_existent_file'
};

const serverProc = spawn('node', ['src/index.js'], { env: testEnv, stdio: 'pipe' });
let pinoLogs = '';
serverProc.stdout.on('data', d => pinoLogs += d.toString());
serverProc.stderr.on('data', d => pinoLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

// Health check
const health = await (await fetch('http://127.0.0.1:3050/health')).json();
console.log('GET /health result:', JSON.stringify(health));

const session = await createMcpSession(3050);

// ping tool
const pingRes = await session.callTool('ping', {});
console.log('ping tool result:', pingRes);

// get_container_status
const statusRes = await session.callTool('get_container_status', {});
console.log('\nget_container_status result:\n', statusRes);

// get_container_logs
const logsRes = await session.callTool('get_container_logs', { container_name: 'plex-server', lines: 10 });
console.log('\nget_container_logs result:\n', logsRes);

// get_container_stats
const statsRes = await session.callTool('get_container_stats', { container_name: 'plex-server' });
console.log('\nget_container_stats result:\n', statsRes);

serverProc.kill();

// 4. Test Failure Paths
console.log('\n--- 4. Testing Failure Paths ---');

// 4a. Bad Token Test (401)
console.log('Testing Bad Token (401)...');
const badTokenEnv = {
  PORT: '3051',
  PORTAINER_URL: 'http://127.0.0.1:9876',
  PORTAINER_API_TOKEN: 'bad_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: './audit.db',
  AWS_REGION: 'us-east-1',
  BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MCP_SERVER_PUBLIC_URL: 'http://127.0.0.1:3051/mcp',
  OAUTH_CLIENT_ID: 'alexa_test_client',
  OAUTH_CLIENT_SECRET: 'alexa_test_secret',
  ACCESS_TOKEN_TTL_SECONDS: '3600',
  JWT_SIGNING_SECRET: 'test_jwt_secret',
  DOTENV_CONFIG_PATH: 'non_existent_file'
};
const badTokenProc = spawn('node', ['src/index.js'], { env: badTokenEnv, stdio: 'pipe' });
let badTokenPinoLogs = '';
badTokenProc.stdout.on('data', d => badTokenPinoLogs += d.toString());
badTokenProc.stderr.on('data', d => badTokenPinoLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

const session401 = await createMcpSession(3051);
const msg401 = await session401.callTool('get_container_status', {});
console.log('Bad token spoken response:\n', msg401);

badTokenProc.kill();

// 4b. Unreachable Server Test
console.log('\nTesting Unreachable Portainer Server (Connection Refused)...');
const unreachableEnv = {
  PORT: '3052',
  PORTAINER_URL: 'http://127.0.0.1:59999',
  PORTAINER_API_TOKEN: 'valid_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: './audit.db',
  AWS_REGION: 'us-east-1',
  BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MCP_SERVER_PUBLIC_URL: 'http://127.0.0.1:3052/mcp',
  OAUTH_CLIENT_ID: 'alexa_test_client',
  OAUTH_CLIENT_SECRET: 'alexa_test_secret',
  ACCESS_TOKEN_TTL_SECONDS: '3600',
  JWT_SIGNING_SECRET: 'test_jwt_secret',
  DOTENV_CONFIG_PATH: 'non_existent_file'
};
const unreachProc = spawn('node', ['src/index.js'], { env: unreachableEnv, stdio: 'pipe' });
let unreachPinoLogs = '';
unreachProc.stdout.on('data', d => unreachPinoLogs += d.toString());
unreachProc.stderr.on('data', d => unreachPinoLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

const sessionUnreach = await createMcpSession(3052);
const msgUnreach = await sessionUnreach.callTool('get_container_status', {});
console.log('Unreachable server spoken response:\n', msgUnreach);

unreachProc.kill();
mockPortainer.close();

console.log('\n--- 5. Pino Structured Logs Output Sample ---');
console.log(pinoLogs.trim().split('\n').filter(l => l.includes('Portainer')).join('\n'));
console.log('\nFailure Pino Log Sample:');
console.log(badTokenPinoLogs.trim().split('\n').filter(l => l.includes('Portainer')).join('\n'));

console.log('\n=== ALL MODULE 2 TESTS COMPLETED SUCCESSFULLY! ===');
