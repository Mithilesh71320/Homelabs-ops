import http from 'node:http';
import fs from 'node:fs';
import { spawnSync, spawn } from 'child_process';
import Database from 'better-sqlite3';

console.log('=== RUNNING MODULE 7 COMPREHENSIVE VERIFICATION ===\n');

const testDbPath = './test_audit_m7.db';
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch {}
}

// 1. Config & Verification Fast-Fail Tests
console.log('--- 1. Testing Config Fast-Fail for Module 7 Env Vars ---');

function testEnvConfig(envOverlay) {
  const env = {
    NODE_ENV: 'development',
    PORT: '3997',
    PORTAINER_URL: 'http://127.0.0.1:9000',
    PORTAINER_API_TOKEN: 'token123',
    PORTAINER_ENDPOINT_ID: '1',
    SQLITE_DB_PATH: testDbPath,
    AWS_REGION: 'us-east-1',
    BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    MCP_SERVER_PUBLIC_URL: 'http://127.0.0.1:3090/mcp',
    OAUTH_CLIENT_ID: 'alexa_test_client',
    OAUTH_CLIENT_SECRET: 'alexa_test_secret',
    ACCESS_TOKEN_TTL_SECONDS: '3600',
    JWT_SIGNING_SECRET: 'test_jwt_secret_key_123',
    ALEXA_SKILL_ID: 'amzn1.ask.skill.valid-skill-id',
    ALEXA_VERIFY_REQUESTS: 'true',
    DOTENV_CONFIG_PATH: 'non_existent_file',
    ...envOverlay
  };

  const res = spawnSync('node', ['src/index.js'], { env, stdio: 'pipe' });
  const stderr = res.stderr.toString();
  return { status: res.status, stderr };
}

// Test 1a: Missing ALEXA_SKILL_ID
const res1a = testEnvConfig({ ALEXA_SKILL_ID: '' });
if (!res1a.stderr.includes('ALEXA_SKILL_ID is required')) {
  throw new Error('Missing ALEXA_SKILL_ID did not trigger fast-fail error');
}
console.log('✔ Missing ALEXA_SKILL_ID fast-fail PASSED!');

// Test 1b: ALEXA_VERIFY_REQUESTS=false in production (should refuse to start)
const res1b = testEnvConfig({ NODE_ENV: 'production', ALEXA_VERIFY_REQUESTS: 'false' });
if (!res1b.stderr.includes('ALEXA_VERIFY_REQUESTS can only be set to false when NODE_ENV=development')) {
  throw new Error('ALEXA_VERIFY_REQUESTS=false in production did not refuse startup');
}
console.log('✔ Refuse startup for ALEXA_VERIFY_REQUESTS=false in non-dev environment PASSED!');

// 2. Start Server Process for E2E Module 7 Tests
console.log('\n--- 2. Starting MCP Server Process for Hardening Verification ---');
const serverPort = 3090;
const validSkillId = 'amzn1.ask.skill.11111111-2222-3333-4444-555555555555';
let portainerCallCount = 0;

const mockPortainer = http.createServer((req, res) => {
  portainerCallCount++;
  if (req.url.includes('/docker/containers/json')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { Id: '1234567890ab', Names: ['/plex-server'], State: 'running', Status: 'Up 3 days' }
    ]));
  } else if (req.url.includes('/restart')) {
    res.writeHead(204);
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'ok' }));
  }
});

await new Promise(r => mockPortainer.listen(9890, '127.0.0.1', r));

const serverEnv = {
  NODE_ENV: 'development',
  PORT: String(serverPort),
  PORTAINER_URL: 'http://127.0.0.1:9890',
  PORTAINER_API_TOKEN: 'test_token',
  PORTAINER_ENDPOINT_ID: '1',
  SQLITE_DB_PATH: testDbPath,
  AWS_REGION: 'us-east-1',
  BEDROCK_MODEL_ID: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  MCP_SERVER_PUBLIC_URL: `http://127.0.0.1:${serverPort}/mcp`,
  OAUTH_CLIENT_ID: 'test_client_id',
  OAUTH_CLIENT_SECRET: 'test_client_secret',
  ACCESS_TOKEN_TTL_SECONDS: '3600',
  JWT_SIGNING_SECRET: 'test_jwt_secret_key_123',
  ALEXA_SKILL_ID: validSkillId,
  ALEXA_VERIFY_REQUESTS: 'true',
  DOTENV_CONFIG_PATH: 'non_existent_file'
};

const serverProc = spawn('node', ['src/index.js'], { env: serverEnv, stdio: 'pipe' });
let serverLogs = '';
serverProc.stdout.on('data', d => serverLogs += d.toString());
serverProc.stderr.on('data', d => serverLogs += d.toString());

await new Promise(r => setTimeout(r, 1500));

try {
  // 3. Test Signature & Timestamp & Application ID Verification
  console.log('\n--- 3. Testing Alexa Request Signature & Timestamp & App ID Verification ---');

  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 300 * 1000).toISOString(); // 300 seconds old (>150s tolerance)

  function makeAlexaEnvelope(intentName, appId = validSkillId, timestamp = nowIso, sessionAttributes = {}) {
    return {
      version: '1.0',
      session: {
        new: false,
        sessionId: 'test-session-123',
        application: { applicationId: appId },
        attributes: sessionAttributes
      },
      request: {
        type: 'IntentRequest',
        requestId: 'req-123',
        timestamp,
        intent: { name: intentName }
      }
    };
  }

  // 3a. Forged Alexa request with no/invalid signature
  console.log('Testing forged Alexa request (missing signature headers)...');
  portainerCallCount = 0;
  const badSigRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeAlexaEnvelope('GetContainerStatusIntent'))
  });
  console.log('Bad signature response status:', badSigRes.status);
  if (badSigRes.status !== 400) throw new Error(`Expected HTTP 400 for bad signature, got ${badSigRes.status}`);
  if (portainerCallCount !== 0) throw new Error(`Expected 0 Portainer calls for invalid signature, got ${portainerCallCount}`);
  console.log('✔ Forged Alexa request with missing signature rejected with 400 and zero Portainer calls!');

  // 3b. Replayed request with a stale timestamp (>150s)
  console.log('Testing replayed Alexa request with stale timestamp (>150s)...');
  const staleRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'signaturecertchainurl': 'https://s3.amazonaws.com/echo.api/echo-api-cert.pem',
      'signature': 'invalid_signature_string'
    },
    body: JSON.stringify(makeAlexaEnvelope('GetContainerStatusIntent', validSkillId, staleIso))
  });
  console.log('Stale timestamp response status:', staleRes.status);
  if (staleRes.status !== 400) throw new Error(`Expected HTTP 400 for stale timestamp, got ${staleRes.status}`);
  console.log('✔ Replayed request with stale timestamp rejected with 400!');

  // 3c. Valid-shaped request with the wrong applicationId
  console.log('Testing request with wrong applicationId...');
  const wrongAppRes = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makeAlexaEnvelope('GetContainerStatusIntent', 'amzn1.ask.skill.wrong-app-id'))
  });
  console.log('Wrong applicationId response status:', wrongAppRes.status);
  if (wrongAppRes.status !== 400) throw new Error(`Expected HTTP 400 for wrong applicationId, got ${wrongAppRes.status}`);
  console.log('✔ Wrong applicationId request rejected with 400!');

  // 3d. Isolated TimestampVerifier Unit Test (Isolates timestamp check from signature check)
  console.log('Testing isolated TimestampVerifier unit test (>150s tolerance)...');
  const { TimestampVerifier } = await import('ask-sdk-express-adapter');
  const tsVerifier = new TimestampVerifier();
  let tsFailed = false;
  try {
    const staleEnvelope = JSON.stringify(makeAlexaEnvelope('GetContainerStatusIntent', validSkillId, staleIso));
    await tsVerifier.verify(staleEnvelope);
  } catch (err) {
    tsFailed = err.message.includes('Timestamp verification failed');
  }
  if (!tsFailed) throw new Error('TimestampVerifier failed to reject stale timestamp (>150s)');
  console.log('✔ Isolated TimestampVerifier test PASSED!');

  // 4. Session-Bound Confirmation Tests (run with ALEXA_VERIFY_REQUESTS=false)
  console.log('\n--- 4. Testing Session-Bound Confirmation Safety Lock ---');

  const devPort = 3091;
  const devEnv = { ...serverEnv, PORT: String(devPort), ALEXA_VERIFY_REQUESTS: 'false' };
  const devProc = spawn('node', ['src/index.js'], { env: devEnv, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 1500));

  try {
    // 4a. "Yes" with no pending action in the session
    console.log('Sending "yes" intent without pending_action_id in session...');
    portainerCallCount = 0;
    const noPendingRes = await fetch(`http://127.0.0.1:${devPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeAlexaEnvelope('AMAZON.YesIntent'))
    });
    const noPendingData = await noPendingRes.json();
    console.log('No pending response:', JSON.stringify(noPendingData));

    if (portainerCallCount !== 0) {
      throw new Error(`Expected 0 Portainer calls for un-bound "yes", got ${portainerCallCount}`);
    }
    if (!noPendingData.response.outputSpeech.ssml.includes('There is no pending request to confirm')) {
      throw new Error('Expected speech informing user there is no pending request');
    }
    console.log('✔ "Yes" with no pending action in session executed nothing and informed user!');

    // 4b. Full session restart flow (RestartContainerIntent -> YesIntent with bound session attribute)
    console.log('Sending RestartContainerIntent to get session-bound action_id...');
    const restartReqRes = await fetch(`http://127.0.0.1:${devPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeAlexaEnvelope('RestartContainerIntent'))
    });
    const restartReqData = await restartReqRes.json();
    const sessionAttrs = restartReqData.sessionAttributes;
    console.log('Returned sessionAttributes:', sessionAttrs);

    if (!sessionAttrs?.pending_action_id) {
      throw new Error('RestartContainerIntent failed to set pending_action_id in sessionAttributes');
    }

    // Now confirm with session attributes attached
    console.log('Confirming action with bound sessionAttributes...');
    portainerCallCount = 0;
    const confirmRes = await fetch(`http://127.0.0.1:${devPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeAlexaEnvelope('AMAZON.YesIntent', validSkillId, nowIso, sessionAttrs))
    });
    const confirmData = await confirmRes.json();
    console.log('Confirm response:', JSON.stringify(confirmData));

    if (portainerCallCount !== 1) {
      throw new Error(`Expected 1 Portainer call for confirmed session action, got ${portainerCallCount}`);
    }
    if (!confirmData.response.outputSpeech.ssml.includes('Successfully restarted container')) {
      throw new Error('Confirm action did not return success speech');
    }
    console.log('✔ Session-bound confirmation executed successfully!');

  } finally {
    devProc.kill();
  }

  // 5. Rate Limit Test (/token 10 req/min)
  console.log('\n--- 5. Testing Rate Limiting on /token Endpoint ---');
  const tokenUrl = `http://127.0.0.1:${serverPort}/token`;
  const authHeader = 'Basic ' + Buffer.from('test_client_id:test_client_secret').toString('base64');

  let hitRateLimit = false;
  for (let i = 1; i <= 12; i++) {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials'
    });

    if (i <= 10) {
      if (res.status !== 200) {
        throw new Error(`Expected HTTP 200 for request ${i}, got ${res.status}`);
      }
    } else {
      if (res.status === 429) {
        hitRateLimit = true;
        console.log(`Request ${i} correctly rate-limited with HTTP 429!`);
      }
    }
  }

  if (!hitRateLimit) {
    throw new Error('Rate limit did not trip on 11th request to /token');
  }
  console.log('✔ /token rate limit tripped on 11th request within a minute PASSED!');

  // 6. Source-Tagged Audit Log Rows Test
  console.log('\n--- 6. Testing Audit Log `source` Tagging in SQLite ---');
  const db = new Database(testDbPath);
  const rows = db.prepare('SELECT id, tool_name, target, status, source FROM audit_log').all();
  console.log('Audit log table contents:\n', JSON.stringify(rows, null, 2));

  const alexaRows = rows.filter(r => r.source === 'alexa-skill');
  if (alexaRows.length === 0) {
    throw new Error('Expected audit_log rows with source="alexa-skill"');
  }
  console.log(`Found ${alexaRows.length} audit entries tagged with source="alexa-skill"!`);
  console.log('✔ Source-tagged audit log verification PASSED!');

  console.log('\n=== ALL MODULE 7 TESTS COMPLETED SUCCESSFULLY! ===');
} catch (err) {
  console.error('\n❌ MODULE 7 VERIFICATION FAILED:', err);
  process.exitCode = 1;
} finally {
  serverProc.kill();
  mockPortainer.close();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }
}
