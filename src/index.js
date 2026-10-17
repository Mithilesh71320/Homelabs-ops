import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { createMcpServer } from './mcp/server.js';
import { oauthRouter } from './auth/oauth.js';
import { verifyToken } from './auth/verifyToken.js';
import { alexaSkillHandler } from './alexa/adapter.js';
import { checkBedrockHealth } from './services/ai.js';
import { renderDashboardHtml } from './dashboard.js';

const app = express();
const PORT = config.PORT || 3000;

// Enable trust proxy for Cloudflare Tunnel / proxy IP resolution
app.set('trust proxy', true);

// Helmet security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Parse JSON request body with 100kb limit and raw body capture for Alexa verification
app.use(express.json({
  limit: '100kb',
  verify: (req, res, buf) => {
    req.rawBody = buf ? buf.toString('utf8') : '';
  }
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Rate Limiters (using CF-Connecting-IP if present, falling back to client IP)
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'too_many_requests', error_description: 'Rate limit exceeded' },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'too_many_requests', error_description: 'Rate limit exceeded' },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip
});

// Apply Rate Limiters to specific endpoints
app.use('/token', tokenLimiter);

// 1. Unauthenticated Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Interactive Developer Dashboard for browser requests
app.get('/', (req, res, next) => {
  if (req.accepts('html')) {
    return res.send(renderDashboardHtml());
  }
  next();
});

// 2. Unauthenticated OAuth Metadata & Token Issuance Endpoints
app.use(oauthRouter);

// Initialize MCP Server and Transport
const { transport, connectPromise } = createMcpServer();

// 3. Dual Protocol Handler at /mcp and / (rate limited to 60 req/min):
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

app.all('/mcp', apiLimiter, mcpOrAlexaRouter);
app.all('/', apiLimiter, mcpOrAlexaRouter);
app.all('/alexa', apiLimiter, mcpOrAlexaRouter);
app.all('/api', apiLimiter, mcpOrAlexaRouter);
app.all('/api/alexa', apiLimiter, mcpOrAlexaRouter);

// Catch-all: ensure any POST payload matching Alexa Skill request format routes to alexaSkillHandler
app.post('*', apiLimiter, (req, res, next) => {
  if (req.body && typeof req.body === 'object' && req.body.request && req.body.request.type) {
    return alexaSkillHandler(req, res);
  }
  next();
});

app.listen(PORT, '127.0.0.1', () => {
  logger.info(`HomeLab Ops MCP server listening on 127.0.0.1:${PORT}`);

  // Non-fatal Bedrock startup health check
  checkBedrockHealth()
    .then((res) => {
      if (res.ok) {
        logger.info(`Bedrock check: model=${res.modelId}, region=${res.region}, status=OK`);
      } else {
        logger.warn(`Bedrock check: model=${res.modelId}, region=${res.region}, status=ERROR: ${res.error}`);
      }
    })
    .catch((err) => {
      logger.warn(`Bedrock check: model=${config.BEDROCK_MODEL_ID}, region=${config.AWS_REGION}, status=ERROR: ${err.message}`);
    });
});


