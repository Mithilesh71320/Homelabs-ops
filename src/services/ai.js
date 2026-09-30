import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Custom error class for Bedrock AI service failures.
 */
export class BedrockError extends Error {
  /**
   * @param {string} message - Internal technical error message.
   * @param {string} [userMessage] - Spoken-friendly message for user fallback.
   */
  constructor(message, userMessage) {
    super(message);
    this.name = 'BedrockError';
    this.userMessage = userMessage || 'Bedrock AI service encountered an issue.';
  }
}

/**
 * Lazy-initialized BedrockRuntimeClient instance.
 * @type {BedrockRuntimeClient | null}
 */
let bedrockClient = null;

/**
 * Get or initialize the BedrockRuntimeClient instance.
 * @returns {BedrockRuntimeClient}
 */
export function getBedrockClient() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: config.AWS_REGION
    });
  }
  return bedrockClient;
}

/**
 * Override the BedrockRuntimeClient instance (primarily for testing/mocking).
 * @param {BedrockRuntimeClient | null} client 
 */
export function setBedrockClient(client) {
  bedrockClient = client;
}

/**
 * Analyzes container log output using AWS Bedrock Converse API to extract
 * a root-cause explanation and a suggested fix in plain English.
 *
 * @param {string} logsText - The raw log tail text from the container.
 * @returns {Promise<{ explanation: string, suggestedFix: string }>}
 * @throws {BedrockError} If the AI call fails, times out (8s), or returns an unparseable response.
 */
export async function analyzeLogs(logsText) {
  const startTime = Date.now();
  const modelId = config.BEDROCK_MODEL_ID;
  const client = getBedrockClient();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 8000);

  const systemPrompt = `You are an expert DevOps assistant analyzing container logs to troubleshoot issues.
Analyze the container log output and identify why the container failed, crashed, or encountered errors.
Provide your analysis in plain English without technical jargon.
You MUST output exactly two lines in the following format:
EXPLANATION: <one plain English sentence explaining why the container failed or crashed>
SUGGESTED_FIX: <one plain English sentence recommending how to fix or prevent the issue>`;

  const promptText = `Container Logs:\n${logsText || '(No log output available)'}`;

  try {
    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: promptText }]
        }
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 300,
        temperature: 0.2
      }
    });

    const response = await client.send(command, { abortSignal: controller.signal });
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    const outputMessage = response.output?.message?.content?.[0]?.text || '';

    const explanationMatch = outputMessage.match(/EXPLANATION:\s*(.+)/i);
    const fixMatch = outputMessage.match(/SUGGESTED_FIX:\s*(.+)/i);

    let explanation = explanationMatch ? explanationMatch[1].trim() : '';
    let suggestedFix = fixMatch ? fixMatch[1].trim() : '';

    if (!explanation || !suggestedFix) {
      // Fallback parser if regex doesn't match strictly
      const lines = outputMessage.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!explanation) explanation = lines[0] || 'The container encountered an unexpected error during execution';
      if (!suggestedFix) suggestedFix = lines[1] || 'Check the container configuration and check recent log events';
    }

    // Strip any trailing period so host template slotting doesn't cause double periods ("..")
    explanation = explanation.replace(/\.+$/, '').trim();
    suggestedFix = suggestedFix.replace(/\.+$/, '').trim();


    logger.info({
      service: 'homelab-ops-mcp',
      action: 'analyzeLogs',
      modelId,
      durationMs,
      success: true,
      msg: `Bedrock log analysis completed in ${durationMs}ms`
    });

    return { explanation, suggestedFix };
  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError' || controller.signal.aborted;

    const technicalMsg = isTimeout
      ? `Bedrock Converse API call timed out after 8000ms for model ${modelId}`
      : `Bedrock Converse API call failed for model ${modelId}: ${err.message}`;

    const userMsg = isTimeout
      ? 'the AI analysis service timed out'
      : `the AI service encountered an error (${err.message || 'service unavailable'})`;

    logger.error({
      service: 'homelab-ops-mcp',
      action: 'analyzeLogs',
      modelId,
      durationMs,
      success: false,
      isTimeout,
      error: technicalMsg,
      msg: `Bedrock log analysis failed in ${durationMs}ms: ${technicalMsg}`
    });

    throw new BedrockError(technicalMsg, userMsg);
  }
}
