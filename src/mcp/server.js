import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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

/**
 * Initializes an in-process McpServer and Client linked via InMemoryTransport pair.
 * Used by the Alexa skill adapter so voice requests pass through the official MCP SDK client/tool layer.
 * @returns {Promise<Client>}
 */
export async function createInProcessMcpClient() {
  const server = new McpServer({
    name: 'HomeLab Ops MCP Server (In-Process)',
    version: '1.0.0'
  });

  registerTools(server);

  const client = new Client(
    { name: 'Alexa Skill Adapter Client', version: '1.0.0' },
    { capabilities: {} }
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);

  return client;
}

