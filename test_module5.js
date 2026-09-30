import Database from 'better-sqlite3';
import http from 'node:http';
import fs from 'node:fs';

console.log('=== RUNNING MODULE 5 COMPREHENSIVE VERIFICATION ===\n');

// 1. Setup Environment BEFORE importing config-dependent modules
const dbPath = './test_audit_m5.db';
if (fs.existsSync(dbPath)) {
  try { fs.unlinkSync(dbPath); } catch {}
}

process.env.SQLITE_DB_PATH = dbPath;
process.env.PORTAINER_URL = 'http://127.0.0.1:9879';
process.env.PORTAINER_API_TOKEN = 'test_token';
process.env.PORTAINER_ENDPOINT_ID = '1';
process.env.AWS_REGION = 'us-east-1';
process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

const { handleDiagnoseContainerIssue } = await import('./src/mcp/handlers.js');
const { setBedrockClient, BedrockError } = await import('./src/services/ai.js');

// 2. Start Mock Portainer Server
const mockPortainer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url.includes('/docker/containers/json')) {
    res.writeHead(200);
    res.end(JSON.stringify([
      { Id: 'c1', Names: ['/plex-server'], Status: 'Up 3 days', State: 'running' },
      { Id: 'c2', Names: ['/crashed-app'], Status: 'Exited (1) 2 minutes ago', State: 'exited' }
    ]));
    return;
  }

  if (req.url.includes('/logs')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(
      '2026-09-30 05:00:00 [info] Starting application...\n' +
      '2026-09-30 05:00:02 [error] Fatal: Out of memory allocated for database buffer pool.\n' +
      '2026-09-30 05:00:03 [fatal] Process exited with status code 137\n'
    );
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

mockPortainer.listen(9879, '127.0.0.1', async () => {
  console.log('--- 1. Mock Portainer Server Listening on http://127.0.0.1:9879 ---');

  try {
    // --- 2. Test Happy Path with Mocked Bedrock Client ---
    console.log('\n--- 2. Testing Happy Path AI Diagnosis & Formatting ---');

    const mockHappyClient = {
      send: async (command) => {
        return {
          output: {
            message: {
              content: [
                {
                  text: 'EXPLANATION: The application process ran out of allocated RAM buffer memory and was terminated by the operating system OOM killer.\nSUGGESTED_FIX: Increase the container memory limit or decrease the database buffer pool allocation size.'
                }
              ]
            }
          }
        };
      }
    };

    setBedrockClient(mockHappyClient);

    const happyResult = await handleDiagnoseContainerIssue({ container_name: 'crashed-app' });
    const textOutput = happyResult.content[0].text;
    console.log('Happy Path Result:\n', textOutput);

    if (textOutput.includes('..')) {
      throw new Error('Double period formatting bug detected in text output');
    }

    if (!textOutput.includes('crashed-app crashed because') || !textOutput.includes('I recommend')) {
      throw new Error('Happy path response format did not match expected structure');
    }
    console.log('✔ Happy Path AI Diagnosis & Formatting PASSED (zero double periods)!');

    // --- 3. Test Bedrock Error / Invalid Model ID Fallback ---
    console.log('\n--- 3. Testing Bedrock Failure Fallback (Invalid Model ID / API Error) ---');

    const mockErrorClient = {
      send: async (command) => {
        const error = new Error('ResourceNotFoundException: The provided model ID is invalid or not available in this region.');
        error.name = 'ResourceNotFoundException';
        throw error;
      }
    };

    setBedrockClient(mockErrorClient);

    const fallbackResult = await handleDiagnoseContainerIssue({ container_name: 'crashed-app' });
    console.log('Fallback Result:\n', fallbackResult.content[0].text);

    if (!fallbackResult.content[0].text.includes("I couldn't run deeper AI analysis right now") || !fallbackResult.content[0].text.includes('Here is the raw log tail for crashed-app')) {
      throw new Error('Fallback path response did not return expected raw logs and user note');
    }
    console.log('✔ Bedrock Failure Fallback PASSED without crashing!');

    // --- 4. Test Bedrock Timeout Fallback ---
    console.log('\n--- 4. Testing Bedrock Timeout Fallback & AbortSignal ---');

    const mockTimeoutClient = {
      send: async (command, options) => {
        // Assert that abortSignal was passed cleanly by client
        if (options?.abortSignal) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        throw new Error('AbortSignal was not provided to send command');
      }
    };

    setBedrockClient(mockTimeoutClient);

    const timeoutResult = await handleDiagnoseContainerIssue({ container_name: 'crashed-app' });
    console.log('Timeout Result:\n', timeoutResult.content[0].text);

    if (!timeoutResult.content[0].text.includes('timed out')) {
      throw new Error('Timeout response did not specify timeout user message');
    }
    console.log('✔ Bedrock Timeout Fallback PASSED!');

    // --- 5. Verify Full Audit Log Table Statuses in SQLite ---
    console.log('\n--- 5. Verifying Audit Log Table Statuses in SQLite ---');
    const db = new Database(dbPath, { readonly: true });
    const logs = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    console.log(`Total audit rows logged: ${logs.length}`);
    console.log(JSON.stringify(logs, null, 2));
    db.close();

    if (logs.length !== 3) {
      throw new Error(`Expected 3 audit log rows, found ${logs.length}`);
    }

    if (logs[0].status !== 'success') {
      throw new Error(`Expected Row 1 status to be 'success', got '${logs[0].status}'`);
    }

    if (logs[1].status !== 'degraded') {
      throw new Error(`Expected Row 2 status to be 'degraded', got '${logs[1].status}'`);
    }

    if (logs[2].status !== 'degraded') {
      throw new Error(`Expected Row 3 status to be 'degraded', got '${logs[2].status}'`);
    }

    console.log('✔ Audit Log Status Verification PASSED (Row 1: success, Row 2: degraded, Row 3: degraded)!');

    console.log('\n=== ALL MODULE 5 TESTS COMPLETED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\n❌ MODULE 5 VERIFICATION FAILED:', err);
    process.exitCode = 1;
  } finally {
    mockPortainer.close();
    setBedrockClient(null);
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch {}
    }
  }
});
