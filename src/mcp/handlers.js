import {
  listContainers,
  getContainerLogs,
  getContainerStats,
  getContainerState,
  restartContainer,
  stopContainer,
  PortainerError
} from '../services/portainer.js';
import { logEntry } from '../utils/audit.js';
import { getAuditSource } from '../utils/auditContext.js';
import { createPendingAction, getPendingAction, consumePendingAction } from '../utils/safety.js';
import { analyzeLogs, BedrockError } from '../services/ai.js';


/**
 * Higher-order function wrapping tool logic with automatic SQLite audit logging and error handling.
 *
 * @param {string} toolName - Name of the MCP tool being wrapped
 * @param {(args?: any, context?: any) => Promise<any>} handlerFn - Function executing tool logic and returning text or result object
 * @returns {(args?: any, context?: any) => Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export function withAudit(toolName, handlerFn) {
  return async (args = {}, context = {}) => {
    const timestamp = new Date().toISOString();
    const target = args?.container_name || null;
    const source = context?.source || args?.source || getAuditSource() || 'mcp';

    try {
      const rawResult = await handlerFn(args, context);
      const resObj = (typeof rawResult === 'object' && rawResult !== null && 'text' in rawResult) ? rawResult : null;
      const textResult = resObj ? String(resObj.text) : String(rawResult || '');
      const status = resObj && resObj.status ? String(resObj.status) : 'success';
      const summary = textResult.length > 120 ? textResult.slice(0, 117) + '...' : textResult;

      logEntry({
        timestamp,
        tool_name: toolName,
        target,
        status,
        result_summary: summary,
        source
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
        result_summary: userMessage,
        source
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
 * Tool handler for get_homelab_summary, wrapped with SQLite audit logging.
 * Returns a high-level spoken health summary (<300 chars) of running, stopped, and unhealthy containers.
 * Classification rules:
 *   - running, up: healthy unless healthcheck shows "unhealthy"
 *   - exited (0): completed (one-shot job, not a problem)
 *   - exited (nonzero), dead, oomkilled, restarting: problem
 * @param {Object} [args]
 * @param {Object} [context]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleGetHomelabSummary = withAudit('get_homelab_summary', async () => {
  const containers = await listContainers();
  if (!containers || containers.length === 0) {
    return "Your homelab has 0 containers running.";
  }

  let runningCount = 0;
  let completedCount = 0;
  let stoppedCount = 0;
  const problemNames = [];

  for (const c of containers) {
    const statusLower = (c.status || '').toLowerCase();
    const stateLower = (c.state || '').toLowerCase();

    if (stateLower === 'running' || statusLower.startsWith('up')) {
      runningCount++;
      if (statusLower.includes('unhealthy')) {
        problemNames.push(c.name);
      }
    } else if (stateLower === 'restarting' || stateLower === 'dead') {
      stoppedCount++;
      problemNames.push(c.name);
    } else if (stateLower === 'exited' || statusLower.startsWith('exited')) {
      // Extract exit code from status string e.g. "Exited (0)" or "Exited (137)"
      const exitCodeMatch = statusLower.match(/exited\s*\((\d+)\)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;
      if (exitCode === 0) {
        // Normal completion — not a problem
        completedCount++;
      } else {
        // Nonzero exit, OOM kill (137), or unknown — problem
        stoppedCount++;
        problemNames.push(c.name);
      }
    } else {
      // paused, created, unknown, etc.
      stoppedCount++;
    }
  }

  const parts = [`${runningCount} running`];
  if (completedCount > 0) parts.push(`${completedCount} completed`);
  parts.push(`${stoppedCount} stopped`);

  let summary = `Your homelab has ${containers.length} containers: ${parts.join(', ')}.`;
  if (problemNames.length > 0) {
    summary += ` Problem containers: ${problemNames.join(', ')}.`;
  } else {
    summary += ` All containers are healthy.`;
  }

  if (summary.length > 295) {
    summary = summary.slice(0, 292) + '...';
  }

  return summary;
});


/**
 * Tool handler for get_container_status, wrapped with SQLite audit logging.
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @param {Object} [context]
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
 * @param {Object} [context]
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
 * @param {Object} [context]
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
 * @param {Object} [context]
 * @returns {Promise<{ action_id?: string, content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleRequestRestartContainer({ container_name = '' } = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const source = context?.source || getAuditSource() || 'mcp';
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
      result_summary: `Pending restart confirmation generated for ${target}`,
      source
    });

    return {
      action_id,
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
 * @param {Object} [context]
 * @returns {Promise<{ action_id?: string, content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleRequestStopContainer({ container_name = '' } = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const source = context?.source || getAuditSource() || 'mcp';
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
      result_summary: `Pending stop confirmation generated for ${target}`,
      source
    });

    return {
      action_id,
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
 * @param {Object} [context]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export async function handleConfirmAction({ action_id = '', confirmed = false } = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const pending = getPendingAction(action_id);
  const source = context?.source || getAuditSource() || 'mcp';

  if (!pending) {
    logEntry({
      timestamp,
      action_id,
      tool_name: 'confirm_action',
      status: 'not_found',
      error_message: 'No valid pending action found for this action_id',
      source
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
      result_summary: `Action declined by user for container ${target}`,
      source
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
      error_message: 'Pending action was already consumed or expired',
      source
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
      result_summary: successSummary,
      source
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
      result_summary: userMessage,
      source
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
 * Fetches container inspect state (ground truth) and logs, then calls analyzeLogs for AI diagnosis.
 * State facts (oomKilled, exitCode, etc.) are injected into the Bedrock prompt as GROUND TRUTH.
 * On BedrockError, falls back to state-facts + raw logs with a user note instead of failing the request.
 *
 * @param {Object} [args]
 * @param {string} [args.container_name]
 * @returns {Promise<{ content: Array<{ type: 'text', text: string }> }>}
 */
export const handleDiagnoseContainerIssue = withAudit('diagnose_container_issue', async (args = {}) => {
  const containerName = args.container_name || '';

  // Fetch state and logs in parallel; state failure is non-fatal
  const [logs, state] = await Promise.allSettled([
    getContainerLogs(containerName, 50),
    getContainerState(containerName)
  ]);
  const logsText = logs.status === 'fulfilled' ? logs.value : '(log fetch failed)';
  const containerState = state.status === 'fulfilled' ? state.value : null;

  try {
    let { explanation, suggestedFix } = await analyzeLogs(logsText, containerState);
    explanation = explanation.replace(/\.+$/, '').trim();
    suggestedFix = suggestedFix.replace(/\.+$/, '').trim();
    return {
      text: `${containerName} crashed because ${explanation}. I recommend ${suggestedFix}.`,
      status: 'success'
    };
  } catch (err) {
    if (err instanceof BedrockError || err?.name === 'BedrockError') {
      // Build a state-grounded fallback message so the user still gets ground truth even without AI
      let fallback = `I couldn't run deeper AI analysis right now because ${err.userMessage || 'the AI service encountered an error'}.`;
      if (containerState) {
        if (containerState.oomKilled) {
          fallback += ` Based on container state, ${containerName} was killed by the out-of-memory killer (exit code ${containerState.exitCode}).`;
        } else if (containerState.exitCode !== 0) {
          fallback += ` Based on container state, ${containerName} exited with code ${containerState.exitCode}.`;
        }
      }
      fallback += ` Here is the raw log tail for ${containerName}:\n\n${logsText}`;
      return { text: fallback, status: 'degraded' };
    }
    throw err;
  }
});

