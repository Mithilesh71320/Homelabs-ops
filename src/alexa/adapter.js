import {
  handleGetContainerStatus,
  handleGetContainerLogs,
  handleGetContainerStats,
  handleRequestRestartContainer,
  handleRequestStopContainer,
  handleConfirmAction,
  handleDiagnoseContainerIssue
} from '../mcp/handlers.js';
import { logger } from '../logger.js';

/**
 * Escapes special characters for valid XML/SSML rendering.
 * @param {string} text
 * @returns {string}
 */
function escapeSSML(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r?\n+/g, ' <break time="300ms"/> ');
}

/**
 * Formats a plain text response into a standard Alexa Skill Response object.
 * @param {string} text - Spoken response text
 * @param {boolean} [shouldEndSession=true] - Whether Alexa should close the mic session
 * @returns {Object} Alexa Response JSON
 */
function buildAlexaResponse(text, shouldEndSession = true) {
  const ssmlContent = escapeSSML(text);
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'SSML',
        ssml: `<speak>${ssmlContent}</speak>`
      },
      shouldEndSession
    }
  };
}

/**
 * Handles incoming Alexa Skill Request JSON payloads (LaunchRequest, IntentRequest, SessionEndedRequest).
 * Routes intents to the corresponding HomeLab Ops MCP handler functions.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function alexaSkillHandler(req, res) {
  const alexaReq = req.body?.request;
  if (!alexaReq) {
    return res.status(400).json({ error: 'invalid_request', message: 'Missing Alexa request body' });
  }

  const reqType = alexaReq.type;
  logger.info({ reqType, intent: alexaReq.intent?.name }, 'Received Alexa Skill request');

  res.setHeader('Content-Type', 'application/json');

  try {
    // 1. SessionEndedRequest (Protocol requirement: MUST NOT return outputSpeech or shouldEndSession: false)
    if (reqType === 'SessionEndedRequest') {
      logger.info({ reason: alexaReq.reason, error: alexaReq.error }, 'Alexa SessionEndedRequest completed');
      return res.status(200).json({ version: '1.0' });
    }

    // 2. LaunchRequest
    if (reqType === 'LaunchRequest') {
      const welcome = "Welcome to Home Lab Ops. You can check container status, diagnose crashed containers, or request a container restart.";
      return res.status(200).json(buildAlexaResponse(welcome, false));
    }

    // 3. IntentRequest
    if (reqType === 'IntentRequest') {
      const intentName = alexaReq.intent?.name || '';
      const slots = alexaReq.intent?.slots || {};
      const containerName = slots.container?.value || slots.container_name?.value || '';

      if (intentName === 'GetContainerStatusIntent') {
        const result = await handleGetContainerStatus({ container_name: containerName });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, true));
      }

      if (intentName === 'DiagnoseContainerIntent') {
        const result = await handleDiagnoseContainerIssue({ container_name: containerName || 'crashed-app' });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, true));
      }

      if (intentName === 'RestartContainerIntent') {
        const result = await handleRequestRestartContainer({ container_name: containerName || 'plex-server' });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, false));
      }

      if (intentName === 'StopContainerIntent') {
        const result = await handleRequestStopContainer({ container_name: containerName || 'home-assistant' });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, false));
      }

      if (intentName === 'ConfirmActionIntent' || intentName === 'AMAZON.YesIntent') {
        const result = await handleConfirmAction({ confirmed: true });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, true));
      }

      if (intentName === 'AMAZON.NoIntent') {
        const result = await handleConfirmAction({ confirmed: false });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, true));
      }

      if (intentName === 'AMAZON.HelpIntent') {
        const helpText = "You can say check container status, diagnose plex-server, or restart plex-server.";
        return res.status(200).json(buildAlexaResponse(helpText, false));
      }

      if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
        return res.status(200).json(buildAlexaResponse("Goodbye!", true));
      }
    }

    // Default Fallback
    const fallback = "I didn't catch that. You can ask to check container status, diagnose a container, or restart a container.";
    return res.status(200).json(buildAlexaResponse(fallback, false));
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Error handling Alexa Skill request');
    const errText = "I encountered an error connecting to your homelab. Please check your server logs.";
    return res.status(200).json(buildAlexaResponse(errText, true));
  }
}
