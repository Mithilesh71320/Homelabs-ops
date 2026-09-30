import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './mcp/server.js';

const app = express();
const PORT = config.PORT || 3000;

app.use(express.json());

// Plain health check endpoint returning {"status":"ok"} without MCP involvement
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize MCP Server and Transport
const { transport, connectPromise } = createMcpServer();

// Mount MCP transport at /mcp (supporting POST and other MCP HTTP methods)
app.all('/mcp', async (req, res) => {
  await connectPromise;
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  logger.info(`HomeLab Ops MCP server listening on port ${PORT}`);
});
