import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

/**
 * Initializes and configures the McpServer and StreamableHTTPServerTransport.
 * @returns {{ server: McpServer, transport: StreamableHTTPServerTransport, connectPromise: Promise<void> }}
 */
export function createMcpServer() {
  const server = new McpServer({
    name: 'homelab-ops-mcp',
    version: '1.0.0'
  });

  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });
  const connectPromise = server.connect(transport);

  return {
    server,
    transport,
    connectPromise
  };
}
