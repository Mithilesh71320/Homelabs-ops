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
 * Build a plain-English summary of container state facts for grounding Bedrock.
 * @param {{ status: string, exitCode: number, oomKilled: boolean, restartCount: number, startedAt: string, finishedAt: string } | null} state
 * @returns {string}
 */
function buildStateSummary(state) {
  if (!state) return '';
  const lines = [`Container state: ${state.status}`];
  lines.push(`Exit code: ${state.exitCode}`);
  lines.push(`OOM killed: ${state.oomKilled}`);
  lines.push(`Restart count: ${state.restartCount}`);
  if (state.startedAt) lines.push(`Started at: ${state.startedAt}`);
  if (state.finishedAt && state.finishedAt !== '0001-01-01T00:00:00Z') {
    lines.push(`Finished at: ${state.finishedAt}`);
  }
  return lines.join('\n');
}

/**
 * Analyzes container log output using AWS Bedrock Converse API to extract
 * a root-cause explanation and a suggested fix in plain English.
 * Container state facts (if provided) are injected as ground truth: the model MUST
 * honour them (e.g. if oomKilled is true, explanation must say the container ran out of memory).
 *
 * @param {string} logsText - The raw log tail text from the container.
 * @param {{ status: string, exitCode: number, oomKilled: boolean, restartCount: number, startedAt: string, finishedAt: string } | null} [containerState]
 * @returns {Promise<{ explanation: string, suggestedFix: string }>}
 * @throws {BedrockError} If the AI call fails, times out (8s), or returns an unparseable response.
 */
export async function analyzeLogs(logsText, containerState = null) {
  const startTime = Date.now();
  const modelId = config.BEDROCK_MODEL_ID;
  const client = getBedrockClient();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10000);

  // Compose state ground-truth constraints for the system prompt
  const stateSummary = buildStateSummary(containerState);
  let stateConstraints = '';
  if (containerState) {
    if (containerState.oomKilled) {
      stateConstraints += '\nCRITICAL FACT: The container was killed by the Linux OOM (out-of-memory) killer. Your EXPLANATION MUST state that the container ran out of memory. Do not suggest any other root cause.';
    } else if (containerState.exitCode !== 0) {
      stateConstraints += `\nCRITICAL FACT: The container exited with code ${containerState.exitCode}. Your EXPLANATION must reference this non-zero exit code.`;
    } else if (containerState.status === 'restarting') {
      stateConstraints += '\nCRITICAL FACT: The container is in a restart loop. Your EXPLANATION must reference this restart behavior.';
    }
  }

  const systemPrompt = `You are an expert DevOps assistant analyzing container logs to troubleshoot issues.
Analyze the container state and log output and identify why the container failed, crashed, or encountered errors.
Provide your analysis in plain English without technical jargon.
The container state facts provided are GROUND TRUTH. Honour them in your explanation.${stateConstraints}
You MUST output exactly two lines in the following format:
EXPLANATION: <one plain English sentence explaining why the container failed or crashed>
SUGGESTED_FIX: <one plain English sentence recommending how to fix or prevent the issue>`;

  const promptText = `${stateSummary ? `Container State Facts:\n${stateSummary}\n\n` : ''}Container Logs:\n${logsText || '(No log output available)'}`;

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
      ? `Bedrock Converse API call timed out after 10000ms for model ${modelId}`
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

/**
 * Checks Bedrock model availability by sending a tiny Converse request.
 * Returns modelId, region, and status OK or the exact AWS error.
 *
 * @param {BedrockRuntimeClient} [client]
 * @param {string} [modelId]
 * @returns {Promise<{ ok: boolean, modelId: string, region: string, error?: string }>}
 */
export async function checkBedrockHealth(client = null, modelId = null) {
  const targetClient = client || getBedrockClient();
  const targetModelId = modelId || config.BEDROCK_MODEL_ID;
  const region = config.AWS_REGION;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const command = new ConverseCommand({
      modelId: targetModelId,
      messages: [
        {
          role: 'user',
          content: [{ text: 'ping' }]
        }
      ],
      inferenceConfig: {
        maxTokens: 5
      }
    });

    await targetClient.send(command, { abortSignal: controller.signal });
    clearTimeout(timer);
    return { ok: true, modelId: targetModelId, region };
  } catch (err) {
    clearTimeout(timer);
    const errorMsg = err.name === 'AbortError' || controller.signal.aborted
      ? 'Request timed out after 6000ms'
      : (err.message || String(err));
    return { ok: false, modelId: targetModelId, region, error: errorMsg };
  }
}
