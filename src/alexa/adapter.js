import { SkillRequestSignatureVerifier, TimestampVerifier } from 'ask-sdk-express-adapter';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { createInProcessMcpClient } from '../mcp/server.js';
import { runWithSource } from '../utils/auditContext.js';

/** @type {import('@modelcontextprotocol/sdk/client/index.js').Client | null} */
let mcpClientInstance = null;

/**
 * Lazy initializer for in-process MCP Client connected via InMemoryTransport pair.
 * @returns {Promise<import('@modelcontextprotocol/sdk/client/index.js').Client>}
 */
async function getInProcessMcpClient() {
  if (!mcpClientInstance) {
    mcpClientInstance = await createInProcessMcpClient();
  }
  return mcpClientInstance;
}

/**
 * Escapes special characters for valid XML/SSML rendering.
 * Strips non-printable ASCII/XML control characters to prevent Alexa XML parser protocol violations.
 * @param {string} text
 * @returns {string}
 */
function escapeSSML(text) {
  if (!text) return '';
  return String(text)
    // Strip illegal XML 1.0 control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // Strip raw internal action IDs from speech so Alexa does not read out UUIDs
    .replace(/\(action_id:\s*[a-f0-9\-]+\)/gi, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r?\n+/g, ' <break time="300ms"/> ')
    .trim();
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
  repromptText = "What would you like to check on your homelab?",
  sessionAttributes = {}
) {
  const cleanText = text || 'Operation completed.';
  const ssmlContent = escapeSSML(cleanText);
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

  if (!appId) {
    throw new Error('Missing applicationId in Alexa request body');
  }

  const isPlaceholder = !config.ALEXA_SKILL_ID || config.ALEXA_SKILL_ID.startsWith('amzn1.ask.skill.00000000');
  const allowedIds = config.ALEXA_SKILL_ID ? config.ALEXA_SKILL_ID.split(',').map(s => s.trim()) : [];

  if (!isPlaceholder && !allowedIds.includes(appId)) {
    throw new Error(`Application ID mismatch: expected ${config.ALEXA_SKILL_ID}, got ${appId}`);
  }

  if (isPlaceholder) {
    logger.info({ incomingAppId: appId }, 'Accepted incoming Alexa request: automatically adopting skill ID from verified Amazon request');
  }

  const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  const sigVerifier = new SkillRequestSignatureVerifier();
  const tsVerifier = new TimestampVerifier();

  await sigVerifier.verify(rawBody, req.headers);
  await tsVerifier.verify(rawBody);
}

/**
 * Handles incoming Alexa Skill Request JSON payloads (LaunchRequest, IntentRequest, SessionEndedRequest).
 * Routes intents through the in-process MCP Client tool layer.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function alexaSkillHandler(req, res) {
  res.setHeader('Content-Type', 'application/json;charset=UTF-8');

  if (config.ALEXA_VERIFY_REQUESTS !== false) {
    try {
      await verifyAlexaRequest(req);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({
        error: errMsg,
        appId: req.body?.session?.application?.applicationId || req.body?.context?.System?.application?.applicationId,
        hasSignature: Boolean(req.headers['signature-256'] || req.headers['signature']),
        hasCert: Boolean(req.headers['signaturecertchainurl'])
      }, 'Alexa request verification failed');
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
    // 1. SessionEndedRequest (MUST return valid JSON schema with response: {})
    if (reqType === 'SessionEndedRequest') {
      logger.info({ reason: alexaReq.reason, error: alexaReq.error }, 'Alexa SessionEndedRequest completed');
      return res.status(200).json({ version: '1.0', response: {} });
    }

    // 2. System.ExceptionEncountered (MUST return empty response without speech output)
    if (reqType === 'System.ExceptionEncountered') {
      logger.warn({ error: alexaReq.error }, 'Received System.ExceptionEncountered from Alexa');
      return res.status(200).json({ version: '1.0', response: {} });
    }

    // 3. LaunchRequest
    if (reqType === 'LaunchRequest') {
      const welcome = "Welcome to Home Lab Ops. You can check container status, diagnose crashed containers, or request a container restart.";
      return res.status(200).json(buildAlexaResponse(welcome, false, undefined, sessionAttributes));
    }

    // 4. IntentRequest
    if (reqType === 'IntentRequest') {
      const intentName = alexaReq.intent?.name || '';
      const slots = alexaReq.intent?.slots || {};
      const containerName = slots.container?.value || slots.container_name?.value || '';

      const mcpClient = await getInProcessMcpClient();

      if (intentName === 'GetHomelabSummaryIntent' || intentName === 'GetSystemStatusIntent') {
        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'get_homelab_summary',
            arguments: {}
          })
        );
        const speech = result?.content?.[0]?.text || "Your homelab containers are all healthy.";
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, sessionAttributes));
      }

      if (intentName === 'GetContainerStatusIntent') {
        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'get_container_status',
            arguments: containerName ? { container_name: containerName } : {}
          })
        );
        const speech = result?.content?.[0]?.text || "No containers found.";
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, sessionAttributes));
      }

      if (intentName === 'DiagnoseContainerIntent') {
        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'diagnose_container_issue',
            arguments: { container_name: containerName || 'crashed-app' }
          })
        );
        const speech = result?.content?.[0]?.text || "Could not diagnose container.";
        return res.status(200).json(buildAlexaResponse(speech, false, undefined, sessionAttributes));
      }

      if (intentName === 'RestartContainerIntent') {
        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'request_restart_container',
            arguments: { container_name: containerName || 'plex-server' }
          })
        );
        const rawSpeech = result?.content?.[0]?.text || `I'm preparing to restart ${containerName || 'plex-server'}. Should I proceed?`;
        const match = rawSpeech.match(/action_id:\s*([a-f0-9\-]+)/i);
        const action_id = match ? match[1] : undefined;
        const newAttributes = { ...sessionAttributes, pending_action_id: action_id };
        return res.status(200).json(buildAlexaResponse(rawSpeech, false, undefined, newAttributes));
      }

      if (intentName === 'StopContainerIntent') {
        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'request_stop_container',
            arguments: { container_name: containerName || 'home-assistant' }
          })
        );
        const rawSpeech = result?.content?.[0]?.text || `I'm preparing to stop ${containerName || 'home-assistant'}. Should I proceed?`;
        const match = rawSpeech.match(/action_id:\s*([a-f0-9\-]+)/i);
        const action_id = match ? match[1] : undefined;
        const newAttributes = { ...sessionAttributes, pending_action_id: action_id };
        return res.status(200).json(buildAlexaResponse(rawSpeech, false, undefined, newAttributes));
      }

      if (intentName === 'ConfirmActionIntent' || intentName === 'AMAZON.YesIntent') {
        const pendingActionId = sessionAttributes.pending_action_id;
        if (!pendingActionId) {
          const noPendingMsg = "There is no pending request to confirm.";
          return res.status(200).json(buildAlexaResponse(noPendingMsg, true, undefined, {}));
        }

        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'confirm_action',
            arguments: { action_id: pendingActionId, confirmed: true }
          })
        );
        const speech = result?.content?.[0]?.text || "Action confirmed.";
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

        const result = await runWithSource('alexa-skill', () =>
          mcpClient.callTool({
            name: 'confirm_action',
            arguments: { action_id: pendingActionId, confirmed: false }
          })
        );
        const speech = result?.content?.[0]?.text || "Cancelled.";
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


