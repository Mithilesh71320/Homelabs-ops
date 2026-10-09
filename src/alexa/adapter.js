import { SkillRequestSignatureVerifier, TimestampVerifier } from 'ask-sdk-express-adapter';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  handleGetContainerStatus,
  handleGetContainerLogs,
  handleGetContainerStats,
  handleRequestRestartContainer,
  handleRequestStopContainer,
  handleConfirmAction,
  handleDiagnoseContainerIssue
} from '../mcp/handlers.js';

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
 * Formats a plain text response into a standard Alexa Skill Response object with optional reprompt and session attributes.
 * @param {string} text - Spoken response text
 * @param {boolean} [shouldEndSession=false] - Whether Alexa should close the mic session
 * @param {string} [repromptText] - Reprompt speech if user takes a pause
 * @param {Object} [sessionAttributes={}] - Multi-turn session state
 * @returns {Object} Alexa Response JSON
 */
function buildAlexaResponse(
  text,
  shouldEndSession = false,
  repromptText = "Is there anything else you'd like to check on your homelab?",
  sessionAttributes = {}
) {
  const ssmlContent = escapeSSML(text);
  const responseObj = {
    version: '1.0',
    sessionAttributes: sessionAttributes || {},
    response: {
      outputSpeech: {
        type: 'SSML',
        ssml: `<speak>${ssmlContent}</speak>`
      },
      shouldEndSession
    }
  };

  if (!shouldEndSession && repromptText) {
    responseObj.response.reprompt = {
      outputSpeech: {
        type: 'SSML',
        ssml: `<speak>${escapeSSML(repromptText)}</speak>`
      }
    };
  }

  return responseObj;
}

/**
 * Verifies signature, timestamp, and applicationId for an incoming Alexa Skill request.
 * @param {import('express').Request} req
 */
async function verifyAlexaRequest(req) {
  const body = req.body;
  const appId = body?.session?.application?.applicationId || body?.context?.System?.application?.applicationId;

  if (!appId || appId !== config.ALEXA_SKILL_ID) {
    throw new Error(`Application ID mismatch: expected ${config.ALEXA_SKILL_ID}, got ${appId}`);
  }

  const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  const sigVerifier = new SkillRequestSignatureVerifier();
  const tsVerifier = new TimestampVerifier();

  await sigVerifier.verify(rawBody, req.headers);
  await tsVerifier.verify(rawBody);
}

/**
 * Handles incoming Alexa Skill Request JSON payloads (LaunchRequest, IntentRequest, SessionEndedRequest).
 * Routes intents to the corresponding HomeLab Ops MCP handler functions.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function alexaSkillHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (config.ALEXA_VERIFY_REQUESTS !== false) {
    try {
      await verifyAlexaRequest(req);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: errMsg }, 'Alexa request verification failed');
      return res.status(400).json({ error: 'invalid_request', message: 'Alexa request verification failed' });
    }
  }

  const alexaReq = req.body?.request;
  if (!alexaReq) {
    return res.status(400).json({ error: 'invalid_request', message: 'Missing Alexa request body' });
  }

  const reqType = alexaReq.type;
  logger.info({ reqType, intent: alexaReq.intent?.name }, 'Received Alexa Skill request');

  const sessionAttributes = req.body?.session?.attributes || {};

  try {
    // 1. SessionEndedRequest
    if (reqType === 'SessionEndedRequest') {
      logger.info({ reason: alexaReq.reason, error: alexaReq.error }, 'Alexa SessionEndedRequest completed');
      return res.status(200).json({ version: '1.0' });
    }

    // 2. LaunchRequest
    if (reqType === 'LaunchRequest') {
      const welcome = "Welcome to Home Lab Ops. You can check container status, diagnose crashed containers, or request a container restart.";
      return res.status(200).json(buildAlexaResponse(welcome, false, undefined, sessionAttributes));
    }

    // 3. IntentRequest
    if (reqType === 'IntentRequest') {
      const intentName = alexaReq.intent?.name || '';
      const slots = alexaReq.intent?.slots || {};
      const containerName = slots.container?.value || slots.container_name?.value || '';

      if (intentName === 'GetContainerStatusIntent') {
        const result = await handleGetContainerStatus({ container_name: containerName }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, sessionAttributes));
      }

      if (intentName === 'DiagnoseContainerIntent') {
        const result = await handleDiagnoseContainerIssue({ container_name: containerName || 'crashed-app' }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, sessionAttributes));
      }

      if (intentName === 'RestartContainerIntent') {
        const result = await handleRequestRestartContainer({ container_name: containerName || 'plex-server' }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        const newAttributes = { ...sessionAttributes, pending_action_id: result.action_id };
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, newAttributes));
      }

      if (intentName === 'StopContainerIntent') {
        const result = await handleRequestStopContainer({ container_name: containerName || 'home-assistant' }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        const newAttributes = { ...sessionAttributes, pending_action_id: result.action_id };
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, newAttributes));
      }

      if (intentName === 'ConfirmActionIntent' || intentName === 'AMAZON.YesIntent') {
        const pendingActionId = sessionAttributes.pending_action_id;
        if (!pendingActionId) {
          const noPendingMsg = "There is no pending request to confirm.";
          return res.status(200).json(buildAlexaResponse(noPendingMsg, true, undefined, {}));
        }

        const result = await handleConfirmAction({ action_id: pendingActionId, confirmed: true }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        const updatedAttributes = { ...sessionAttributes };
        delete updatedAttributes.pending_action_id;
        return res.status(200).json(buildAlexaResponse(speech, true, undefined, updatedAttributes));
      }

      if (intentName === 'AMAZON.NoIntent') {
        const pendingActionId = sessionAttributes.pending_action_id;
        if (!pendingActionId) {
          const noPendingMsg = "Cancelled. There is no pending request to confirm.";
          return res.status(200).json(buildAlexaResponse(noPendingMsg, true, undefined, {}));
        }

        const result = await handleConfirmAction({ action_id: pendingActionId, confirmed: false }, { source: 'alexa-skill' });
        const speech = result.content[0].text;
        const updatedAttributes = { ...sessionAttributes };
        delete updatedAttributes.pending_action_id;
        return res.status(200).json(buildAlexaResponse(speech, true, undefined, updatedAttributes));
      }

      if (intentName === 'AMAZON.HelpIntent') {
        const helpText = "You can say check container status, diagnose plex-server, or restart plex-server.";
        return res.status(200).json(buildAlexaResponse(helpText, false, undefined, sessionAttributes));
      }

      if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
        return res.status(200).json(buildAlexaResponse("Goodbye!", true));
      }
    }

    // Default Fallback
    const fallback = "I didn't catch that. You can ask to check container status, diagnose a container, or restart a container.";
    return res.status(200).json(buildAlexaResponse(fallback, false, undefined, sessionAttributes));
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Error handling Alexa Skill request');
    const errText = "I encountered an error connecting to your homelab. Please check your server logs.";
    return res.status(200).json(buildAlexaResponse(errText, true));
  }
}

