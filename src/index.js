import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './mcp/server.js';
import { oauthRouter } from './auth/oauth.js';
import { verifyToken } from './auth/verifyToken.js';

const app = express();
const PORT = config.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Unauthenticated Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 2. Unauthenticated OAuth Metadata & Token Issuance Endpoints
app.use(oauthRouter);

// Initialize MCP Server and Transport
const { transport, connectPromise } = createMcpServer();

// 3. Protected MCP Transport at /mcp (verifyToken middleware enforced)
app.all('/mcp', verifyToken, async (req, res) => {
  await connectPromise;
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  logger.info(`HomeLab Ops MCP server listening on port ${PORT}`);
});
