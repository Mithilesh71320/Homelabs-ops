import {
  listContainers,
  getContainerLogs,
  getContainerStats,
  restartContainer,
  stopContainer,
  PortainerError
} from '../services/portainer.js';
import { logEntry } from '../utils/audit.js';
import { createPendingAction, getPendingAction, consumePendingAction } from '../utils/safety.js';
import { analyzeLogs, BedrockError } from '../services/ai.js';


/**
 * Higher-order function wrapping tool logic with automatic SQLite audit logging and error handling.
 *
 * @param {string} toolName - Name of the MCP tool being wrapped
 * @param {(args?: any) => Promise<any>} handlerFn - Function executing tool logic and returning text or result object
 * @returns {(args?: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export function withAudit(toolName, handlerFn) {
  return async (args = {}) => {
    const timestamp = new Date().toISOString();
    const target = args?.container_name || null;

    try {
      const rawResult = await handlerFn(args);
      const resObj = (typeof rawResult === 'object' && rawResult !== null && 'text' in rawResult) ? rawResult : null;
      const textResult = resObj ? String(resObj.text) : String(rawResult || '');
      const status = resObj && resObj.status ? String(resObj.status) : 'success';
      const summary = textResult.length > 120 ? textResult.slice(0, 117) + '...' : textResult;

      logEntry({
        timestamp,
        tool_name: toolName,
        target,
        status,
        result_summary: summary
      });

      return {
        content: [
          {
            type: 'text',
            text: textResult
          }
        ]
      };
    } catch (err) {
      const userMessage = err instanceof PortainerError || err?.userMessage
        ? err.userMessage
        : "I can't reach your homelab right now.";

      const rawErrorMessage = err instanceof Error ? err.message : String(err);

      logEntry({
        timestamp,
        tool_name: toolName,
        target,
        status: 'failure',
        error_message: rawErrorMessage,
        result_summary: userMessage
      });

      return {
        content: [
          {
            type: 'text',
            text: userMessage
          }
        ]
      };
    }
  };
}

/**
 * Handles ping tool requests.
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export async function handlePing() {
  return {
    content: [
      {
        type: 'text',
        text: 'HomeLab Ops MCP server is alive.'
      }
    ]
  };
}

/**
 * Tool handler for get_container_status, wrapped with SQLite audit logging.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleGetContainerStatus = withAudit('get_container_status', async (args = {}) => {
  const containers = await listContainers();
  if (!containers || containers.length === 0) {
    return "No containers were found on your homelab.";
  }

  if (args.container_name) {
    const target = args.container_name.toLowerCase();
    const filtered = containers.filter(c => c.name.toLowerCase().includes(target));
    if (filtered.length === 0) {
      return `No container matching "${args.container_name}" was found on your homelab.`;
    }
    return filtered.map(c => `Container ${c.name} is currently ${c.status}.`).join('\n');
  }

  return containers.map(c => `Container ${c.name} is currently ${c.status}.`).join('\n');
});

/**
 * Tool handler for get_container_logs, wrapped with SQLite audit logging.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @param {number} [args.lines=20]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleGetContainerLogs = withAudit('get_container_logs', async (args = {}) => {
  const containerName = args.container_name || '';
  const lines = args?.lines || 20;
  const logs = await getContainerLogs(containerName, lines);
  return `Logs for container ${containerName} (last ${lines} lines):\n\n${logs}`;
});

/**
 * Tool handler for get_container_stats, wrapped with SQLite audit logging.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleGetContainerStats = withAudit('get_container_stats', async (args = {}) => {
  const containerName = args.container_name || '';
  const stats = await getContainerStats(containerName);
  return `Resource usage for container ${stats.containerName}:\n- CPU Usage: ${stats.cpuPercent}%\n- Memory Usage: ${stats.memoryUsage} / ${stats.memoryLimit} (${stats.memoryPercent}%)`;
});

/**
 * Handles request_restart_container by validating container existence and generating a pending action.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleRequestRestartContainer({ container_name = '' } = {}) {
  const timestamp = new Date().toISOString();
  try {
    const containers = await listContainers();
    const match = containers.find(c => c.name.toLowerCase() === container_name.toLowerCase() || c.name.toLowerCase().includes(container_name.toLowerCase()));

    if (!match) {
      return {
        content: [
          {
            type: 'text',
            text: `No container matching "${container_name}" was found on your homelab.`
          }
        ]
      };
    }

    const target = match.name;
    const action_id = createPendingAction('restart', target);

    logEntry({
      timestamp,
      action_id,
      tool_name: 'request_restart_container',
      target,
      status: 'pending',
      result_summary: `Pending restart confirmation generated for ${target}`
    });

    return {
      content: [
        {
          type: 'text',
          text: `I'm preparing to restart ${target}. This will cause a brief outage. Should I proceed? (action_id: ${action_id})`
        }
      ]
    };
  } catch (err) {
    const userMessage = err instanceof PortainerError || err?.userMessage
      ? err.userMessage
      : "I can't reach your homelab right now.";
    return {
      content: [
        {
          type: 'text',
          text: userMessage
        }
      ]
    };
  }
}

/**
 * Handles request_stop_container by validating container existence and generating a pending action.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleRequestStopContainer({ container_name = '' } = {}) {
  const timestamp = new Date().toISOString();
  try {
    const containers = await listContainers();
    const match = containers.find(c => c.name.toLowerCase() === container_name.toLowerCase() || c.name.toLowerCase().includes(container_name.toLowerCase()));

    if (!match) {
      return {
        content: [
          {
            type: 'text',
            text: `No container matching "${container_name}" was found on your homelab.`
          }
        ]
      };
    }

    const target = match.name;
    const action_id = createPendingAction('stop', target);

    logEntry({
      timestamp,
      action_id,
      tool_name: 'request_stop_container',
      target,
      status: 'pending',
      result_summary: `Pending stop confirmation generated for ${target}`
    });

    return {
      content: [
        {
          type: 'text',
          text: `I'm preparing to stop ${target}. This will halt the service until manually started. Should I proceed? (action_id: ${action_id})`
        }
      ]
    };
  } catch (err) {
    const userMessage = err instanceof PortainerError || err?.userMessage
      ? err.userMessage
      : "I can't reach your homelab right now.";
    return {
      content: [
        {
          type: 'text',
          text: userMessage
        }
      ]
    };
  }
}

/**
 * Handles confirm_action by verifying the pending action, consuming it, executing the Portainer request, and logging audit entries.
 * @param {Object} [args]
 * @param {string} [args.action_id]
 * @param {boolean} [args.confirmed]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleConfirmAction({ action_id = '', confirmed = false } = {}) {
  const timestamp = new Date().toISOString();
  const pending = getPendingAction(action_id);

  if (!pending) {
    logEntry({
      timestamp,
      action_id,
      tool_name: 'confirm_action',
      status: 'not_found',
      error_message: 'No valid pending action found for this action_id'
    });

    return {
      content: [
        {
          type: 'text',
          text: "I don't have that pending request anymore — please ask again."
        }
      ]
    };
  }

  if (confirmed === false) {
    const consumed = consumePendingAction(action_id);
    const target = consumed?.target || pending.target;

    logEntry({
      timestamp,
      action_id,
      tool_name: 'confirm_action',
      target,
      status: 'declined',
      result_summary: `Action declined by user for container ${target}`
    });

    return {
      content: [
        {
          type: 'text',
          text: `Cancelled. I have not modified ${target}.`
        }
      ]
    };
  }

  // Confirmed is true: Consume action FIRST to prevent double execution
  const actionToExecute = consumePendingAction(action_id);
  if (!actionToExecute) {
    logEntry({
      timestamp,
      action_id,
      tool_name: 'confirm_action',
      status: 'not_found',
      error_message: 'Pending action was already consumed or expired'
    });

    return {
      content: [
        {
          type: 'text',
          text: "I don't have that pending request anymore — please ask again."
        }
      ]
    };
  }

  try {
    if (actionToExecute.actionType === 'restart') {
      await restartContainer(actionToExecute.target);
    } else if (actionToExecute.actionType === 'stop') {
      await stopContainer(actionToExecute.target);
    }

    const pastTense = actionToExecute.actionType === 'stop' ? 'stopped' : `${actionToExecute.actionType}ed`;
    const successSummary = `Successfully ${pastTense} container ${actionToExecute.target}.`;
    logEntry({
      timestamp: new Date().toISOString(),
      action_id,
      tool_name: 'confirm_action',
      target: actionToExecute.target,
      status: 'success',
      result_summary: successSummary
    });

    return {
      content: [
        {
          type: 'text',
          text: `Successfully ${pastTense} container ${actionToExecute.target}.`
        }
      ]
    };
  } catch (err) {
    const userMessage = err instanceof PortainerError || err?.userMessage
      ? err.userMessage
      : "I can't reach your homelab right now.";
    const rawErrorMessage = err instanceof Error ? err.message : String(err);

    logEntry({
      timestamp: new Date().toISOString(),
      action_id,
      tool_name: 'confirm_action',
      target: actionToExecute.target,
      status: 'failure',
      error_message: rawErrorMessage,
      result_summary: userMessage
    });

    return {
      content: [
        {
          type: 'text',
          text: userMessage
        }
      ]
    };
  }
}

/**
 * Tool handler for diagnose_container_issue, wrapped with SQLite audit logging.
 * Reuses getContainerLogs to fetch tail logs, then calls analyzeLogs for AI diagnosis.
 * On BedrockError, falls back to raw logs with a user note instead of failing the request.
 *
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleDiagnoseContainerIssue = withAudit('diagnose_container_issue', async (args = {}) => {
  const containerName = args.container_name || '';
  const logs = await getContainerLogs(containerName, 50);

  try {
    let { explanation, suggestedFix } = await analyzeLogs(logs);
    explanation = explanation.replace(/\.+$/, '').trim();
    suggestedFix = suggestedFix.replace(/\.+$/, '').trim();
    return {
      text: `${containerName} crashed because ${explanation}. I recommend ${suggestedFix}.`,
      status: 'success'
    };
  } catch (err) {
    if (err instanceof BedrockError || err?.name === 'BedrockError') {
      return {
        text: `I couldn't run deeper AI analysis right now because ${err.userMessage || 'the AI service encountered an error'}. Here is the raw log tail for ${containerName}:\n\n${logs}`,
        status: 'degraded'
      };
    }
    throw err;
  }
});

