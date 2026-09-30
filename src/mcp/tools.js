import { z } from 'zod';
import {
  handlePing,
  handleGetContainerStatus,
  handleGetContainerLogs,
  handleGetContainerStats,
  handleRequestRestartContainer,
  handleRequestStopContainer,
  handleConfirmAction
} from './handlers.js';

/**
 * Registers all MCP tools on the server instance.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server - McpServer instance
 * @returns {void}
 */
export function registerTools(server) {
  // Read Tool 1: ping
  server.registerTool(
    'ping',
    {
      description: 'Ping the HomeLab Ops MCP server to check if it is alive',
      inputSchema: z.object({})
    },
    async () => handlePing()
  );

  // Read Tool 2: get_container_status
  server.registerTool(
    'get_container_status',
    {
      description: 'Get the status of all containers or a specific container on your homelab',
      inputSchema: z.object({
        container_name: z.string().optional().describe('Optional name of container to filter by')
      })
    },
    async (args) => handleGetContainerStatus(args)
  );

  // Read Tool 3: get_container_logs
  server.registerTool(
    'get_container_logs',
    {
      description: 'Fetch recent log lines for a specific container on your homelab',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name or ID of container'),
        lines: z.number().optional().default(20).describe('Number of recent log lines to retrieve (default 20)')
      })
    },
    async (args) => handleGetContainerLogs(args)
  );

  // Read Tool 4: get_container_stats
  server.registerTool(
    'get_container_stats',
    {
      description: 'Get real-time CPU and memory resource usage stats for a specific container',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name or ID of container')
      })
    },
    async (args) => handleGetContainerStats(args)
  );

  // Write Action 1: request_restart_container
  server.registerTool(
    'request_restart_container',
    {
      description: 'Request a container restart (requires safety confirmation step)',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name of container to restart')
      })
    },
    async (args) => handleRequestRestartContainer(args)
  );

  // Write Action 2: request_stop_container
  server.registerTool(
    'request_stop_container',
    {
      description: 'Request stopping a container (requires safety confirmation step)',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name of container to stop')
      })
    },
    async (args) => handleRequestStopContainer(args)
  );

  // Write Action Confirmation: confirm_action
  server.registerTool(
    'confirm_action',
    {
      description: 'Confirm or decline a pending write action using its action_id',
      inputSchema: z.object({
        action_id: z.string({ required_error: 'action_id is required' }).describe('Action ID returned by request_restart_container or request_stop_container'),
        confirmed: z.boolean({ required_error: 'confirmed is required' }).describe('Set true to execute action, false to decline')
      })
    },
    async (args) => handleConfirmAction(args)
  );
}
