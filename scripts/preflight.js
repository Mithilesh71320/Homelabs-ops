#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';
import { checkBedrockHealth } from '../src/services/ai.js';
import dotenv from 'dotenv';
dotenv.config();

console.log('==================================================');
console.log('   HomeLab Ops MCP Server — Preflight Check       ');
console.log('==================================================\n');

let failed = false;

// 1. Run npm test
process.stdout.write('[1/5] Running automated test suites (npm test)... ');
try {
  const testRes = spawnSync('npm', ['test'], { stdio: 'pipe', shell: true });
  if (testRes.status === 0) {
    console.log('PASS');
  } else {
    console.log('FAIL');
    failed = true;
  }
} catch (e) {
  console.log('FAIL:', e.message);
  failed = true;
}

// 2. Secret Scan
process.stdout.write('[2/5] Scanning for secrets (Module 10 regexes)... ');
try {
  const diff = execSync('git log -p', { maxBuffer: 20 * 1024 * 1024 }).toString();
  const patterns = [
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'Private Key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
    { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g }
  ];
  let secretFound = false;
  for (const p of patterns) {
    const matches = diff.match(p.regex);
    if (matches && matches.length > 0) {
      console.log(`FAIL (${p.name} pattern detected in git history)`);
      secretFound = true;
      failed = true;
      break;
    }
  }
  if (!secretFound) {
    console.log('PASS');
  }
} catch (e) {
  console.log('FAIL:', e.message);
  failed = true;
}

// 3. Untracked .env and *.db
process.stdout.write('[3/5] Verifying .env and *.db are not tracked in git... ');
try {
  const tracked = execSync('git ls-files .env "*.db"', { encoding: 'utf8' }).trim();
  if (tracked) {
    console.log(`FAIL (Sensitive files tracked: ${tracked})`);
    failed = true;
  } else {
    console.log('PASS');
  }
} catch (e) {
  console.log('FAIL:', e.message);
  failed = true;
}

// 4. Bedrock check
process.stdout.write('[4/5] Checking Amazon Bedrock model connectivity (check:bedrock)... ');
try {
  const bedrockRes = await checkBedrockHealth();
  if (bedrockRes.ok) {
    console.log(`PASS (model=${bedrockRes.modelId}, region=${bedrockRes.region})`);
  } else {
    console.log(`FAIL (model=${bedrockRes.modelId}, region=${bedrockRes.region}, error=${bedrockRes.error})`);
    failed = true;
  }
} catch (e) {
  console.log(`FAIL (${e.message})`);
  failed = true;
}

// 5. Public URL health check (if PUBLIC_URL or MCP_SERVER_PUBLIC_URL is set)
const targetUrl = process.env.PUBLIC_URL || process.env.MCP_SERVER_PUBLIC_URL;
if (targetUrl) {
  const baseUrl = targetUrl.replace(/\/mcp\/?$/, '');
  const healthUrl = `${baseUrl.replace(/\/+$/, '')}/health`;
  process.stdout.write(`[5/5] Checking public URL health (${healthUrl})... `);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      console.log('PASS');
    } else {
      console.log(`FAIL (HTTP ${res.status})`);
      failed = true;
    }
  } catch (e) {
    console.log(`FAIL (${e.message})`);
    failed = true;
  }
} else {
  console.log('[5/5] Checking public URL health... SKIP (PUBLIC_URL not set)');
}

console.log('');
if (!failed) {
  console.log('=== PREFLIGHT PASSED: ALL CHECKS CLEAN ===');
  process.exit(0);
} else {
  console.log('=== PREFLIGHT FAILED: ONE OR MORE CHECKS DID NOT PASS ===');
  process.exit(1);
}
