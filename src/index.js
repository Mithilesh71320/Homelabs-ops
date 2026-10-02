import express from 'express';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './mcp/server.js';
import { oauthRouter } from './auth/oauth.js';
import { verifyToken } from './auth/verifyToken.js';
import { alexaSkillHandler } from './alexa/adapter.js';

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

// 3. Dual Protocol Handler at /mcp and /:
// If request body contains an Alexa request payload (req.body?.request?.type), route to alexaSkillHandler.
// Otherwise, enforce OAuth verifyToken middleware and route to MCP transport.
async function mcpOrAlexaRouter(req, res, next) {
  if (req.body && typeof req.body === 'object' && req.body.request && req.body.request.type) {
    return alexaSkillHandler(req, res);
  }
  return verifyToken(req, res, async () => {
    await connectPromise;
    await transport.handleRequest(req, res, req.body);
  });
}

app.all('/mcp', mcpOrAlexaRouter);
app.all('/', mcpOrAlexaRouter);

app.listen(PORT, () => {
  logger.info(`HomeLab Ops MCP server listening on port ${PORT}`);
});
