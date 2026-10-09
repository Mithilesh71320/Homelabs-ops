import { z } from 'zod';
import {
  handlePing,
  handleGetHomelabSummary,
  handleGetContainerStatus,
  handleGetContainerLogs,
  handleGetContainerStats,
  handleRequestRestartContainer,
  handleRequestStopContainer,
  handleConfirmAction,
  handleDiagnoseContainerIssue
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
      description: 'Check if the HomeLab Ops MCP server is online and responding. Use when verifying server availability. Example phrasings: "Is the homelab server up?", "ping server". Returns server health text.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => handlePing()
  );

  // Read Tool 2: get_homelab_summary
  server.registerTool(
    'get_homelab_summary',
    {
      description: 'Get a high-level health summary of all homelab containers including running, stopped, and unhealthy container counts plus names of problem containers. Use when asking for overall homelab status or fleet health. Example phrasings: "How is my homelab doing?", "Give me a homelab summary". Returns a short spoken summary (<300 chars).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async (args, context) => handleGetHomelabSummary(args, context)
  );

  // Read Tool 3: get_container_status
  server.registerTool(
    'get_container_status',
    {
      description: 'Retrieve the current status (Up, Exited, etc.) for all containers or a specific container on your homelab. Use when checking if a container is running. Example phrasings: "Is Plex running?", "Check status of home-assistant". Returns container status text.',
      inputSchema: z.object({
        container_name: z.string().optional().describe('Optional container name or filter string')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async (args, context) => handleGetContainerStatus(args, context)
  );

  // Read Tool 4: get_container_logs
  server.registerTool(
    'get_container_logs',
    {
      description: 'Fetch recent log output for a specific container to inspect output or troubleshoot issues. Use when asked for container logs. Example phrasings: "Show logs for plex-server", "Get last 50 lines of home-assistant logs". Returns tail log output text.',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name or ID of target container'),
        lines: z.number().optional().default(20).describe('Number of recent log lines to retrieve (default 20)')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async (args, context) => handleGetContainerLogs(args, context)
  );

  // Read Tool 5: get_container_stats
  server.registerTool(
    'get_container_stats',
    {
      description: 'Fetch real-time CPU percentage and RAM memory consumption for a running container. Use when checking container resource usage. Example phrasings: "How much CPU is Plex using?", "Check memory usage of home-assistant". Returns CPU and memory stats text.',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name or ID of target container')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async (args, context) => handleGetContainerStats(args, context)
  );

  // AI Tool: diagnose_container_issue
  server.registerTool(
    'diagnose_container_issue',
    {
      description: 'Run AI-powered root cause analysis on a crashed or misbehaving container\'s logs to explain the failure and recommend a fix. Use when a container exits or crashes. Example phrasings: "Why did plex crash?", "Diagnose home-assistant issue". Returns explanation and suggested fix.',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name of container to diagnose')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
    },
    async (args, context) => handleDiagnoseContainerIssue(args, context)
  );

  // Write Action 1: request_restart_container
  server.registerTool(
    'request_restart_container',
    {
      description: 'Prepare a container restart action and generate a pending confirmation ID. IMPORTANT: This tool NEVER restarts the container by itself; it only creates a pending action requiring explicit user confirmation via confirm_action. Example phrasings: "Restart plex-server", "Reboot home-assistant". Returns action_id and confirmation prompt.',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name of container to restart')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async (args, context) => handleRequestRestartContainer(args, context)
  );

  // Write Action 2: request_stop_container
  server.registerTool(
    'request_stop_container',
    {
      description: 'Prepare a container stop action and generate a pending confirmation ID. IMPORTANT: This tool NEVER stops the container by itself; it only creates a pending action requiring explicit user confirmation via confirm_action. Example phrasings: "Stop plex-server", "Halt home-assistant". Returns action_id and confirmation prompt.',
      inputSchema: z.object({
        container_name: z.string({ required_error: 'container_name is required' }).describe('Name of container to stop')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async (args, context) => handleRequestStopContainer(args, context)
  );

  // Write Action Confirmation: confirm_action
  server.registerTool(
    'confirm_action',
    {
      description: 'Execute or decline a pending restart or stop action generated by request_restart_container or request_stop_container using its action_id. CRITICAL SAFETY RULE: Call this tool ONLY after the user explicitly says yes or confirms the pending action. Example phrasings: "Yes, proceed with restart", "No, cancel". Returns execution status text.',
      inputSchema: z.object({
        action_id: z.string({ required_error: 'action_id is required' }).describe('Action ID returned by request_restart_container or request_stop_container'),
        confirmed: z.boolean({ required_error: 'confirmed is required' }).describe('Set true to execute action, false to decline')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async (args, context) => handleConfirmAction(args, context)
  );
}


