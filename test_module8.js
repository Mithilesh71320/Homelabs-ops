import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';

console.log('=== RUNNING MODULE 8 COMPREHENSIVE VERIFICATION ===\n');

const testDbPath = './test_audit_m8.db';
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

const serverPort = 3095;
const mockPortainerPort = 9895;
let portainerCallCount = 0;

// Set process env BEFORE importing internal app modules
process.env.SQLITE_DB_PATH = testDbPath;
process.env.PORTAINER_URL = `http://127.0.0.1:${mockPortainerPort}`;
process.env.PORTAINER_API_TOKEN = 'test_token_m8';
process.env.PORTAINER_ENDPOINT_ID = '1';
process.env.OAUTH_CLIENT_ID = 'e2e_client_id';
process.env.OAUTH_CLIENT_SECRET = 'e2e_client_secret';
process.env.JWT_SIGNING_SECRET = 'e2e_jwt_secret_key_123';
process.env.ALEXA_SKILL_ID = 'amzn1.ask.skill.11111111-2222-3333-4444-555555555555';

const { createInProcessMcpClient } = await import('./src/mcp/server.js');
const { runWithSource } = await import('./src/utils/auditContext.js');
const { logEntry } = await import('./src/utils/audit.js');

// 1. Setup Mock Portainer API
const mockPortainer = http.createServer((req, res) => {
  portainerCallCount++;
  if (req.url.includes('/docker/containers/json')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { Id: '111111111111', Names: ['/plex-server'], State: 'running', Status: 'Up 3 days' },
      { Id: '222222222222', Names: ['/home-assistant'], State: 'running', Status: 'Up 5 days' },
      { Id: '333333333333', Names: ['/backup-job'], State: 'exited', Status: 'Exited (0) 2 hours ago' }
    ]));
  } else if (req.url.includes('/docker/containers/') && req.url.includes('/logs')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('2026-10-09T12:00:00Z [INFO] Plex Media Server started\n2026-10-09T12:05:00Z [WARN] High memory usage detected');
  } else if (req.url.includes('/restart')) {
    res.writeHead(204);
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'ok' }));
  }
});

await new Promise(r => mockPortainer.listen(mockPortainerPort, '127.0.0.1', r));

try {
  // 2. Test In-Process MCP Client Creation & Tool List Annotations
  console.log('--- 1. Testing In-Process MCP Client & Annotations ---');
  const mcpClient = await createInProcessMcpClient();
  const toolsResult = await mcpClient.listTools();
  const tools = toolsResult.tools;

  console.log(`Discovered ${tools.length} tools via in-process MCP Client.`);
  if (tools.length !== 9) {
    throw new Error(`Expected 9 registered MCP tools, found ${tools.length}`);
  }

  const toolMap = new Map(tools.map(t => [t.name, t]));
  const requiredTools = [
    'ping',
    'get_homelab_summary',
    'get_container_status',
    'get_container_logs',
    'get_container_stats',
    'diagnose_container_issue',
    'request_restart_container',
    'request_stop_container',
    'confirm_action'
  ];
  for (const name of requiredTools) {
    if (!toolMap.has(name)) throw new Error(`Missing required tool: ${name}`);
  }

  // Assert annotations
  const summaryTool = toolMap.get('get_homelab_summary');
  if (summaryTool.annotations?.readOnlyHint !== true) {
    throw new Error('get_homelab_summary missing readOnlyHint: true');
  }

  const restartTool = toolMap.get('request_restart_container');
  if (restartTool.annotations?.readOnlyHint !== false) {
    throw new Error('request_restart_container missing readOnlyHint: false');
  }

  const confirmTool = toolMap.get('confirm_action');
  if (confirmTool.annotations?.destructiveHint !== true) {
    throw new Error('confirm_action missing destructiveHint: true');
  }

  const analyseTool = toolMap.get('diagnose_container_issue');
  if (analyseTool.annotations?.openWorldHint !== true) {
    throw new Error('diagnose_container_issue missing openWorldHint: true');
  }

  console.log('✔ In-process MCP client creation and tool annotations verified!');

  // 3. Test get_homelab_summary Handler Directly
  console.log('\n--- 2. Testing get_homelab_summary Handler Output ---');
  const summaryRes = await mcpClient.callTool({ name: 'get_homelab_summary', arguments: {} });
  const summaryText = summaryRes.content[0].text;
  console.log('Summary Output:\n', summaryText);

  if (summaryText.length >= 300) {
    throw new Error(`get_homelab_summary output exceeded 300 chars: ${summaryText.length} chars`);
  }
  if (!summaryText.includes('running') || !summaryText.includes('stopped')) {
    throw new Error('get_homelab_summary missing expected status metrics');
  }
  console.log(`✔ get_homelab_summary output concise (${summaryText.length} chars) and accurate!`);

  // 4. Test Source Propagation via AsyncLocalStorage runWithSource
  console.log('\n--- 3. Testing Audit Source Propagation with runWithSource ---');
  await runWithSource('alexa-skill', async () => {
    await mcpClient.callTool({ name: 'get_container_status', arguments: { name: 'plex-server' } });
  });

  const db = new Database(testDbPath);
  const auditRows = db.prepare('SELECT tool_name, source FROM audit_log WHERE tool_name = ?').all('get_container_status');
  if (auditRows.length === 0 || auditRows[0].source !== 'alexa-skill') {
    throw new Error(`Audit row source mismatch! Expected "alexa-skill", got: ${JSON.stringify(auditRows)}`);
  }
  console.log('✔ Audit source "alexa-skill" correctly set via AsyncLocalStorage context!');

  // 5. Start Server for Alexa Adapter HTTP requests & E2E script test
  console.log('\n--- 4. Starting Live Express Server for E2E Proof Script ---');
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(serverPort),
    PORTAINER_URL: `http://127.0.0.1:${mockPortainerPort}`,
    PORTAINER_API_TOKEN: 'test_token_m8',
    PORTAINER_ENDPOINT_ID: '1',
    SQLITE_DB_PATH: testDbPath,
    AWS_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    MCP_SERVER_PUBLIC_URL: `http://127.0.0.1:${serverPort}/mcp`,
    OAUTH_CLIENT_ID: 'e2e_client_id',
    OAUTH_CLIENT_SECRET: 'e2e_client_secret',
    ACCESS_TOKEN_TTL_SECONDS: '3600',
    JWT_SIGNING_SECRET: 'e2e_jwt_secret_key_123',
    ALEXA_SKILL_ID: 'amzn1.ask.skill.11111111-2222-3333-4444-555555555555',
    ALEXA_VERIFY_REQUESTS: 'false',
    DOTENV_CONFIG_PATH: 'non_existent_file'
  };

  const serverProc = spawn('node', ['src/index.js'], { env: serverEnv, stdio: 'pipe' });
  let serverLogs = '';
  serverProc.stdout.on('data', d => serverLogs += d.toString());
  serverProc.stderr.on('data', d => serverLogs += d.toString());
  serverProc.on('exit', code => console.log(`[SERVER PROC EXITED with code ${code}]`));

  await new Promise(r => setTimeout(r, 2500));
  console.log('Server process output logs:\n', serverLogs);
  if (serverProc.exitCode !== null) {
    console.error('Server process exited prematurely with code:', serverProc.exitCode);
    throw new Error('Server process exited before tests could run');
  }

  try {
    console.log(`Checking server health at http://127.0.0.1:${serverPort}/health...`);
    const healthRes = await fetch(`http://127.0.0.1:${serverPort}/health`);
    console.log('Health check status:', healthRes.status);

    // 5a. Test Alexa Skill Adapter calls for GetHomelabSummaryIntent
    console.log('Testing Alexa adapter for GetHomelabSummaryIntent...');
    const alexaEnvelope = {
      version: '1.0',
      session: { new: false, sessionId: 's-m8', application: { applicationId: serverEnv.ALEXA_SKILL_ID } },
      request: { type: 'IntentRequest', requestId: 'r-m8', timestamp: new Date().toISOString(), intent: { name: 'GetHomelabSummaryIntent' } }
    };

    const alexaRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alexaEnvelope)
    });
    const alexaData = await alexaRes.json();
    console.log('Alexa response speech:', alexaData.response.outputSpeech.ssml);
    if (!alexaData.response.outputSpeech.ssml.includes('running')) {
      throw new Error('Alexa GetHomelabSummaryIntent response speech invalid');
    }
    console.log('✔ Alexa adapter routed GetHomelabSummaryIntent through MCP client successfully!');

    // 5b. Run e2e_mcp_proof.js script against the server
    console.log('\n--- 5. Executing e2e_mcp_proof.js Against Live Server ---');
    const e2eEnv = {
      ...process.env,
      MCP_E2E_URL: `http://127.0.0.1:${serverPort}/mcp`,
      OAUTH_TOKEN_URL: `http://127.0.0.1:${serverPort}/token`,
      OAUTH_CLIENT_ID: 'e2e_client_id',
      OAUTH_CLIENT_SECRET: 'e2e_client_secret'
    };

    const e2eProc = spawn('node', ['e2e_mcp_proof.js'], { env: e2eEnv, stdio: 'pipe' });
    let e2eOut = '';
    let e2eErr = '';
    e2eProc.stdout.on('data', d => e2eOut += d.toString());
    e2eProc.stderr.on('data', d => e2eErr += d.toString());

    const e2eCode = await new Promise(r => e2eProc.on('exit', r));
    console.log(e2eOut);

    if (e2eCode !== 0) {
      console.error('E2E Proof Error Output:', e2eErr);
      throw new Error(`e2e_mcp_proof.js failed with exit code ${e2eCode}`);
    }
    console.log('✔ e2e_mcp_proof.js executed cleanly with 0 exit code!');

  } finally {
    serverProc.kill();
  }

  console.log('\n=== ALL MODULE 8 VERIFICATION TESTS PASSED! ===');
} catch (err) {
  console.error('\n❌ MODULE 8 VERIFICATION FAILED:', err);
  process.exitCode = 1;
} finally {
  mockPortainer.close();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
}
