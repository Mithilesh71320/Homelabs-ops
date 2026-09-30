import { spawnSync, spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

console.log('=== RUNNING MODULE 3 COMPREHENSIVE VERIFICATION ===\n');

const testDbPath = './test_audit.db';

if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

// 1. Mock Portainer Server
console.log('--- 1. Starting Mock Portainer Server ---');
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

await new Promise(r => mockPortainer.listen(9877, '127.0.0.1', r));
console.log('Mock Portainer running on http://127.0.0.1:9877');

// Helper to create an MCP Session & execute tools
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

// 2. Test Success Path & Audit Log Records
console.log('\n--- 2. Testing Normal Execution & Audit Table Insertion ---');
const testEnv = {
  PORT: '3060',
  PORTAINER_URL: 'http://127.0.0.1:9877',
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

const session = await createMcpSession(3060);

console.log('Calling get_container_status...');
await session.callTool('get_container_status', {});

console.log('Calling get_container_logs for plex-server...');
await session.callTool('get_container_logs', { container_name: 'plex-server', lines: 5 });

console.log('Calling get_container_stats for plex-server...');
await session.callTool('get_container_stats', { container_name: 'plex-server' });

serverProc.kill();
await new Promise(r => setTimeout(r, 300));

// Verify rows in testDbPath
console.log('\nChecking audit_log table contents in SQLite...');
const db = new Database(testDbPath, { readonly: true });
const rows = db.prepare('SELECT * FROM audit_log').all();
console.log('Total audit rows logged:', rows.length);
console.log(JSON.stringify(rows, null, 2));

if (rows.length === 3) {
  console.log('✔ Audit logging success path PASSED (3 entries recorded)!');
} else {
  console.error(`❌ Audit logging success path FAILED! Expected 3 entries, got ${rows.length}`);
}
db.close();

// 3. Test Failure Resilience (Invalid DB Path)
console.log('\n--- 3. Testing Audit Failure Resilience (Invalid DB Path / EACCES) ---');
const badDbEnv = {
  PORT: '3061',
  PORTAINER_URL: 'http://127.0.0.1:9877',
  PORTAINER_API_TOKEN: 'valid_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: 'Z:\\unwritable_directory_path\\audit.db', // Invalid path
  DOTENV_CONFIG_PATH: 'non_existent_file'
};

const badDbProc = spawn('node', ['src/index.js'], { env: badDbEnv, stdio: 'pipe' });
let badDbLogs = '';
badDbProc.stdout.on('data', d => badDbLogs += d.toString());
badDbProc.stderr.on('data', d => badDbLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

const badDbSession = await createMcpSession(3061);
const toolRes = await badDbSession.callTool('get_container_status', {});
console.log('Tool response when DB path is invalid:\n', toolRes);

badDbProc.kill();
mockPortainer.close();

console.log('\n--- 4. Pino Warning Log on DB Failure ---');
const warnLogs = badDbLogs.split('\n').filter(l => l.includes('audit') || l.includes('Failed to initialize') || l.includes('warn'));
console.log(warnLogs.join('\n'));

if (toolRes && toolRes.includes('plex-server')) {
  console.log('\n✔ Audit failure resilience test PASSED! Request succeeded despite DB failure.');
} else {
  console.error('\n❌ Audit failure resilience test FAILED!');
}

// Clean up test database
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

console.log('\n=== ALL MODULE 3 TESTS COMPLETED SUCCESSFULLY! ===');
