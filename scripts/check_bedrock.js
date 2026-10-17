#!/usr/bin/env node

/**
 * scripts/check_bedrock.js
 * Verifies Bedrock model access and credentials by issuing a minimal Converse request.
 * Exits with code 0 on success, or code 1 on error.
 */

import { checkBedrockHealth } from '../src/services/ai.js';
import { config } from '../src/config.js';

console.log('--- Checking Amazon Bedrock Model Availability ---');
console.log(`Target Model ID: ${config.BEDROCK_MODEL_ID}`);
console.log(`AWS Region:      ${config.AWS_REGION}`);

const result = await checkBedrockHealth();

if (result.ok) {
  console.log(`\nBedrock check: model=${result.modelId}, region=${result.region}, status=OK`);
  console.log('✔ Amazon Bedrock model check passed successfully!');
  process.exit(0);
} else {
  console.error(`\nBedrock check: model=${result.modelId}, region=${result.region}, status=ERROR: ${result.error}`);
  console.error('❌ Amazon Bedrock model check failed.');
  process.exit(1);
}
