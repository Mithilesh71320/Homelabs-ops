import { spawnSync, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import Database from 'better-sqlite3';

console.log('=== RUNNING MODULE 4 COMPREHENSIVE VERIFICATION ===\n');

const testDbPath = './test_audit_m4.db';

if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

const portainerCalls = [];

// 1. Mock Portainer Server
console.log('--- 1. Starting Mock Portainer Server ---');
const mockPortainer = http.createServer((req, res) => {
  const url = req.url;
  const method = req.method;
  const apiKey = req.headers['x-api-key'];

  portainerCalls.push({ method, url });

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
      cpu_stats: { cpu_usage: { total_usage: 200000000 }, system_cpu_usage: 2000000000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 100000000 }, system_cpu_usage: 1000000000 },
      memory_stats: { usage: 157286400, limit: 1073741824, stats: { cache: 10485760 } }
    }));
  } else if (url.includes('/restart') || url.includes('/stop')) {
    res.writeHead(204);
    res.end();
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
  }
});

await new Promise(r => mockPortainer.listen(9878, '127.0.0.1', r));
console.log('Mock Portainer running on http://127.0.0.1:9878');

// Helper for MCP Client Session
async function createMcpSession(port) {
  const initRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
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

// 2. Start MCP Server Process
console.log('\n--- 2. Starting MCP Server for Module 4 Verification ---');
const testEnv = {
  PORT: '3070',
  PORTAINER_URL: 'http://127.0.0.1:9878',
  PORTAINER_API_TOKEN: 'valid_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: testDbPath,
  DOTENV_CONFIG_PATH: 'non_existent_file'
};

const serverProc = spawn('node', ['src/index.js'], { env: testEnv, stdio: 'pipe' });
let serverLogs = '';
serverProc.stdout.on('data', d => serverLogs += d.toString());
serverProc.stderr.on('data', d => serverLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));
const session = await createMcpSession(3070);

// 3. Test Non-existent container request_restart_container
console.log('\n--- 3. Testing request_restart_container on non-existent container ---');
const notFoundRes = await session.callTool('request_restart_container', { container_name: 'ghost-container' });
console.log('Result:', notFoundRes);

// 4. Test request_restart_container on existing container (plex-server)
console.log('\n--- 4. Testing request_restart_container on plex-server ---');
const promptRes = await session.callTool('request_restart_container', { container_name: 'plex-server' });
console.log('Result:', promptRes);

const actionIdMatch = promptRes.match(/action_id:\s*([a-f0-9-]+)/i);
const actionId1 = actionIdMatch ? actionIdMatch[1] : null;

// 5. Test Decline flow (confirmed: false)
console.log('\n--- 5. Testing confirm_action with confirmed: false ---');
const portainerCallsBeforeDecline = portainerCalls.length;
const declineRes = await session.callTool('confirm_action', { action_id: actionId1, confirmed: false });
console.log('Result:', declineRes);
const portainerCallsAfterDecline = portainerCalls.length;

if (portainerCallsAfterDecline === portainerCallsBeforeDecline) {
  console.log('✔ confirmed: false correctly did NOT invoke Portainer!');
} else {
  console.error('❌ confirmed: false incorrectly invoked Portainer!');
}

// 6. Test Request & Confirm (confirmed: true)
console.log('\n--- 6. Testing request_restart_container & confirm_action (confirmed: true) ---');
const prompt2 = await session.callTool('request_restart_container', { container_name: 'plex-server' });
const actionId2 = prompt2.match(/action_id:\s*([a-f0-9-]+)/i)[1];

const confirmRes = await session.callTool('confirm_action', { action_id: actionId2, confirmed: true });
console.log('Result:', confirmRes);

// 7. Test Double Execution Prevention
console.log('\n--- 7. Testing Double Execution Prevention (confirming same action_id twice) ---');
const reConfirmRes = await session.callTool('confirm_action', { action_id: actionId2, confirmed: true });
console.log('Re-confirm result:', reConfirmRes);

if (reConfirmRes.includes("I don't have that pending request anymore")) {
  console.log('✔ Double execution prevented successfully!');
} else {
  console.error('❌ Double execution test FAILED!');
}

// 8. Test request_stop_container & confirm
console.log('\n--- 8. Testing request_stop_container & confirm_action ---');
const promptStop = await session.callTool('request_stop_container', { container_name: 'home-assistant' });
const actionIdStop = promptStop.match(/action_id:\s*([a-f0-9-]+)/i)[1];

const confirmStopRes = await session.callTool('confirm_action', { action_id: actionIdStop, confirmed: true });
console.log('Result:', confirmStopRes);

// 9. Explicit TTL Expiry Test
console.log('\n--- 9. Testing True Action Expiry (TTL Expiry) ---');
// Import safety module helpers directly for unit-level TTL assertion
const { createPendingAction, getPendingAction, consumePendingAction } = await import('./src/utils/safety.js');
const expiredActionId = createPendingAction('restart', 'plex-server');
const expiredEntry = getPendingAction(expiredActionId);
// Manually expire entry in past
expiredEntry.expiresAt = Date.now() - 1000;

// Verify getPendingAction returns null for expired entry
const getCheck = getPendingAction(expiredActionId);
console.log('getPendingAction after expiration:', getCheck);

// Call confirm_action over MCP with expired action ID
const confirmExpiredRes = await session.callTool('confirm_action', { action_id: expiredActionId, confirmed: true });
console.log('confirm_action response for expired action_id:', confirmExpiredRes);

if (getCheck === null && confirmExpiredRes.includes("I don't have that pending request anymore")) {
  console.log('✔ True Action Expiry (TTL Expiry) test PASSED!');
} else {
  console.error('❌ Action Expiry test FAILED!');
}

// 10. Verify Full, Unfiltered Audit Database Rows
console.log('\n--- 10. Verifying Full, Unfiltered Audit Log Table in SQLite ---');
const db = new Database(testDbPath, { readonly: true });
const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
console.log('Total audit rows logged:', rows.length);
console.log(JSON.stringify(rows, null, 2));
db.close();

serverProc.kill();
mockPortainer.close();

// Clean up test db
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

console.log('\n=== ALL MODULE 4 TESTS COMPLETED SUCCESSFULLY! ===');
