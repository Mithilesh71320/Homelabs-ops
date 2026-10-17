/**
 * test_module11.js — Module 11: Fail-Soft Bedrock Diagnosis & Health Check Verification
 *
 * Validates:
 *   1. checkBedrockHealth returns OK on success and handles failures gracefully
 *   2. handleDiagnoseContainerIssue fail-soft fallback on:
 *      - AccessDeniedException
 *      - ResourceNotFoundException (model not found / EOL)
 *      - ThrottlingException
 *      - AbortError (timeout after 10s)
 *   3. Assert fallback includes OOMKilled fact (exit code 137) for demo-crashy
 *   4. Assert tool output is always a valid MCP response ({ content: [{ type: 'text', text: ... }] })
 *   5. Assert handleDiagnoseContainerIssue never throws to caller
 */

import assert from 'assert';
import { setBedrockClient, checkBedrockHealth } from './src/services/ai.js';
import { handleDiagnoseContainerIssue, buildDeterministicDiagnosis } from './src/mcp/handlers.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('=== RUNNING MODULE 11 COMPREHENSIVE VERIFICATION ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. checkBedrockHealth unit tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('[1. Bedrock Startup Health Check]');

await testAsync('checkBedrockHealth returns { ok: true } when client succeeds', async () => {
  const mockClient = {
    send: async () => ({
      output: { message: { content: [{ text: 'pong' }] } }
    })
  };
  const result = await checkBedrockHealth(mockClient, 'test-model-id');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.modelId, 'test-model-id');
  assert.ok(result.region);
});

await testAsync('checkBedrockHealth returns { ok: false, error: ... } on failure without throwing', async () => {
  const mockClient = {
    send: async () => {
      const err = new Error('Model is retired / End of Life');
      err.name = 'ResourceNotFoundException';
      throw err;
    }
  };
  const result = await checkBedrockHealth(mockClient, 'retired-model-id');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.modelId, 'retired-model-id');
  assert.ok(result.error.includes('Model is retired / End of Life'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildDeterministicDiagnosis unit tests
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2. Deterministic Diagnosis Builder]');

test('buildDeterministicDiagnosis handles OOMKilled state correctly', () => {
  const state = {
    status: 'exited',
    exitCode: 137,
    oomKilled: true,
    restartCount: 0,
    startedAt: '2026-10-17T10:00:00Z',
    finishedAt: '2026-10-17T10:00:30Z'
  };
  const diag = buildDeterministicDiagnosis('demo-crashy', state, 'Allocating 8MB...\nOut of memory');
  assert.ok(diag.includes('Generated without AI (Bedrock unavailable)'));
  assert.ok(diag.includes('Out-Of-Memory (OOM) killer'));
  assert.ok(diag.includes('137'));
  assert.ok(diag.includes('Increase the container\'s memory limit'));
});

test('buildDeterministicDiagnosis handles non-zero exit code with restart count', () => {
  const state = {
    status: 'exited',
    exitCode: 1,
    oomKilled: false,
    restartCount: 3,
    startedAt: '',
    finishedAt: ''
  };
  const diag = buildDeterministicDiagnosis('api-worker', state, 'Fatal error: database unreachable');
  assert.ok(diag.includes('Generated without AI (Bedrock unavailable)'));
  assert.ok(diag.includes('exit code 1'));
  assert.ok(diag.includes('restarted 3 time(s)'));
  assert.ok(!diag.includes('OOM'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. handleDiagnoseContainerIssue Fail-Soft Tests with Mocked Bedrock Failures
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3. Fail-Soft Diagnosis Tool with Mocked Bedrock Errors]');

/**
 * Helper to test Bedrock error fail-soft behavior
 */
async function assertFailSoftOnBedrockError(testName, errorToThrow) {
  await testAsync(`Fail-soft on ${testName}: returns valid MCP response with OOM fact`, async () => {
    const mockClient = {
      send: async () => {
        throw errorToThrow;
      }
    };
    setBedrockClient(mockClient);

    // Call diagnose tool on demo-crashy (which simulates an OOM exit 137 container)
    const result = await handleDiagnoseContainerIssue({ container_name: 'demo-crashy' });

    // 1. Must be a valid MCP tool response shape
    assert.ok(result, 'Result must exist');
    assert.ok(Array.isArray(result.content), 'Result must have content array');
    assert.strictEqual(result.content[0].type, 'text', 'Content type must be text');

    const text = result.content[0].text;

    // 2. Must be labeled "Generated without AI (Bedrock unavailable)"
    assert.ok(
      text.includes('Generated without AI (Bedrock unavailable)'),
      `Text should be labeled Generated without AI. Got:\n${text}`
    );

    // 3. Must include the OOMKilled ground-truth fact
    assert.ok(
      text.includes('Out-Of-Memory') || text.includes('OOM'),
      `Text should include OOM fact. Got:\n${text}`
    );
    assert.ok(
      text.includes('137'),
      `Text should include exit code 137. Got:\n${text}`
    );
  });
}

// Case A: AccessDeniedException
const accessDeniedErr = new Error('User is not authorized to perform: bedrock:InvokeModel');
accessDeniedErr.name = 'AccessDeniedException';
await assertFailSoftOnBedrockError('AccessDeniedException', accessDeniedErr);

// Case B: ResourceNotFoundException / EOL model
const modelNotFoundErr = new Error('The provided model ID is not available or has reached End-of-Life');
modelNotFoundErr.name = 'ResourceNotFoundException';
await assertFailSoftOnBedrockError('ResourceNotFoundException (Model EOL/Not Found)', modelNotFoundErr);

// Case C: ThrottlingException
const throttlingErr = new Error('Too many requests, rate limit exceeded');
throttlingErr.name = 'ThrottlingException';
await assertFailSoftOnBedrockError('ThrottlingException', throttlingErr);

// Case D: Timeout / AbortError after 10s
const timeoutErr = new Error('Bedrock Converse API call timed out after 10000ms');
timeoutErr.name = 'AbortError';
await assertFailSoftOnBedrockError('AbortError (10s Timeout)', timeoutErr);

// Reset Bedrock Client
setBedrockClient(null);

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Module 11 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Module 11 verification tests PASSED!\n');
}
