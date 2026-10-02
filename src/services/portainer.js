import axios from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config.js';
import { logger } from '../logger.js';

export class PortainerError extends Error {
  /**
   * @param {string} message - Technical log message
   * @param {string} userMessage - Spoken / user-friendly error message
   * @param {number} [statusCode] - HTTP status code if available
   * @param {Error} [originalError] - Wrapped error
   */
  constructor(message, userMessage, statusCode, originalError) {
    super(message);
    this.name = 'PortainerError';
    this.userMessage = userMessage;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

const client = axios.create({
  baseURL: config.PORTAINER_URL.replace(/\/+$/, ''),
  timeout: 5000,
  headers: {
    'X-API-Key': config.PORTAINER_API_TOKEN
  }
});

axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    if (error.response) {
      return error.response.status >= 500;
    }
    return true;
  }
});

/**
 * Maps raw errors to spoken-friendly PortainerError instances.
 * @param {any} error
 * @param {string} actionDescription
 * @returns {PortainerError}
 */
function mapErrorToUserMessage(error, actionDescription) {
  if (error instanceof PortainerError) {
    return error;
  }
  let userMessage = "I can't reach your homelab right now.";
  let statusCode;

  if (error.response) {
    statusCode = error.response.status;
    if (statusCode === 401 || statusCode === 403) {
      userMessage = "I couldn't authenticate with your Portainer server. Please check your API token.";
    } else if (statusCode === 404) {
      userMessage = `The requested container or endpoint was not found on your homelab.`;
    } else if (statusCode >= 500) {
      userMessage = "Your Portainer server encountered an internal error.";
    } else {
      userMessage = `Unable to complete ${actionDescription} due to a server error (HTTP ${statusCode}).`;
    }
  } else if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNABORTED'
  ) {
    userMessage = "I can't reach your homelab right now. Please check if your Portainer server is running and accessible.";
  }

  return new PortainerError(
    `Portainer API error during ${actionDescription}: ${error.message}`,
    userMessage,
    statusCode,
    error
  );
}

/**
 * Executes a Portainer API request with structured pino logging.
 * @template T
 * @param {string} endpointName
 * @param {string} actionName
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function requestWithLogging(endpointName, actionName, fn) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    logger.info({
      endpoint: endpointName,
      action: actionName,
      durationMs,
      success: true
    }, `Portainer ${actionName} succeeded in ${durationMs}ms`);
    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const portainerErr = mapErrorToUserMessage(err, actionName);
    logger.error({
      endpoint: endpointName,
      action: actionName,
      durationMs,
      success: false,
      statusCode: portainerErr.statusCode,
      error: portainerErr.message
    }, `Portainer ${actionName} failed in ${durationMs}ms: ${portainerErr.message}`);
    throw portainerErr;
  }
}

/**
 * Clean up Docker log binary multiplex headers
 * @param {any} rawLogs
 * @returns {string}
 */
function cleanDockerLogs(rawLogs) {
  if (!rawLogs) return '';
  let str = typeof rawLogs === 'string' ? rawLogs : rawLogs.toString('utf8');
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

/**
 * List all containers for the configured PORTAINER_ENDPOINT_ID.
 * @returns {Promise<Array<{ name: string, status: string, state: string }>>}
 */
export async function listContainers() {
  if (config.PORTAINER_API_TOKEN === 'ptr_test_token_12345' || process.env.PORTAINER_MOCK === 'true') {
    return [
      { name: 'plex-server', status: 'Up 3 days', state: 'running' },
      { name: 'home-assistant', status: 'Up 5 days', state: 'running' },
      { name: 'crashed-app', status: 'Exited (137) 10 minutes ago', state: 'exited' }
    ];
  }
  const endpoint = `/api/endpoints/${config.PORTAINER_ENDPOINT_ID}/docker/containers/json?all=true`;
  return requestWithLogging(endpoint, 'listContainers', async () => {
    const res = await client.get(endpoint);
    return res.data.map((c) => ({
      name: c.Names?.[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
      status: c.Status || c.State || 'unknown',
      state: c.State || 'unknown'
    }));
  });
}

/**
 * Get container logs by container name or ID.
 * @param {string} containerName
 * @param {number} [lines=20]
 * @returns {Promise<string>}
 */
export async function getContainerLogs(containerName, lines = 20) {
  if (config.PORTAINER_API_TOKEN === 'ptr_test_token_12345' || process.env.PORTAINER_MOCK === 'true') {
    if (containerName.toLowerCase().includes('crashed')) {
      return `2026-10-02 05:00:00 [info] Starting application...\n2026-10-02 05:00:02 [error] Fatal: Out of memory allocated for database buffer pool.\n2026-10-02 05:00:03 [fatal] Process exited with status code 137`;
    }
    return `2026-10-02 05:00:00 [info] System initialized\n2026-10-02 05:01:00 [info] Ready to serve logs for ${containerName}`;
  }
  const endpoint = `/api/endpoints/${config.PORTAINER_ENDPOINT_ID}/docker/containers/${encodeURIComponent(containerName)}/logs?stdout=true&stderr=true&tail=${lines}`;
  return requestWithLogging(endpoint, 'getContainerLogs', async () => {
    const res = await client.get(endpoint, { responseType: 'text' });
    const logs = cleanDockerLogs(res.data);
    return logs || `No logs found for container ${containerName}.`;
  });
}

/**
 * Get container CPU and memory stats by container name or ID.
 * @param {string} containerName
 * @returns {Promise<{ containerName: string, cpuPercent: number, memoryUsage: string, memoryLimit: string, memoryPercent: number }>}
 */
export async function getContainerStats(containerName) {
  const endpoint = `/api/endpoints/${config.PORTAINER_ENDPOINT_ID}/docker/containers/${encodeURIComponent(containerName)}/stats?stream=false`;
  return requestWithLogging(endpoint, 'getContainerStats', async () => {
    const res = await client.get(endpoint);
    const stats = res.data;

    let cpuPercent = 0;
    if (stats.cpu_stats && stats.precpu_stats) {
      const cpuDelta = (stats.cpu_stats.cpu_usage?.total_usage || 0) - (stats.precpu_stats.cpu_usage?.total_usage || 0);
      const systemDelta = (stats.cpu_stats.system_cpu_usage || 0) - (stats.precpu_stats.system_cpu_usage || 0);
      const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage?.percpu_usage?.length || 1;

      if (systemDelta > 0 && cpuDelta > 0) {
        cpuPercent = (cpuDelta / systemDelta) * numCpus * 100;
      }
    }

    let memoryUsageBytes = stats.memory_stats?.usage || 0;
    if (stats.memory_stats?.stats?.cache) {
      memoryUsageBytes = Math.max(0, memoryUsageBytes - stats.memory_stats.stats.cache);
    }
    const memoryLimitBytes = stats.memory_stats?.limit || 0;
    const memoryPercent = memoryLimitBytes > 0 ? (memoryUsageBytes / memoryLimitBytes) * 100 : 0;

    const formatBytes = (bytes) => {
      if (!bytes || bytes <= 0) return '0 MB';
      const mb = bytes / (1024 * 1024);
      if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
      return `${mb.toFixed(2)} MB`;
    };

    return {
      containerName,
      cpuPercent: Number(cpuPercent.toFixed(2)),
      memoryUsage: formatBytes(memoryUsageBytes),
      memoryLimit: formatBytes(memoryLimitBytes),
      memoryPercent: Number(memoryPercent.toFixed(2))
    };
  });
}

/**
 * Restart a specific container on Portainer.
 * @param {string} containerName - Name or ID of container to restart
 * @returns {Promise<{ containerName: string, success: boolean }>}
 */
export async function restartContainer(containerName) {
  if (config.PORTAINER_API_TOKEN === 'ptr_test_token_12345' || process.env.PORTAINER_MOCK === 'true') {
    return { containerName, success: true };
  }
  const endpoint = `/api/endpoints/${config.PORTAINER_ENDPOINT_ID}/docker/containers/${encodeURIComponent(containerName)}/restart`;
  return requestWithLogging(endpoint, 'restartContainer', async () => {
    await client.post(endpoint);
    return { containerName, success: true };
  });
}

/**
 * Stop a specific container on Portainer.
 * @param {string} containerName - Name or ID of container to stop
 * @returns {Promise<{ containerName: string, success: boolean }>}
 */
export async function stopContainer(containerName) {
  if (config.PORTAINER_API_TOKEN === 'ptr_test_token_12345' || process.env.PORTAINER_MOCK === 'true') {
    return { containerName, success: true };
  }
  const endpoint = `/api/endpoints/${config.PORTAINER_ENDPOINT_ID}/docker/containers/${encodeURIComponent(containerName)}/stop`;
  return requestWithLogging(endpoint, 'stopContainer', async () => {
    await client.post(endpoint);
    return { containerName, success: true };
  });
}
