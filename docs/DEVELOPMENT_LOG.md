# HomeLab Ops — Development Log

## Module 1: Project Scaffold & MCP Server Setup
**Date:** 2026-09-30

### What Was Built
- Initialized Node.js project `homelab-ops-mcp` with Express and `@modelcontextprotocol/sdk`.
- Configured `.env.example` with `PORT=3000`.
- Built MCP Server module using `McpServer` and `StreamableHTTPServerTransport` with session generator (`randomUUID()`).
- Added initial `ping` tool and `GET /health` endpoint in Express server.

### Files Touched
- `package.json` & `package-lock.json`
- `.env.example`
- `src/index.js`
- `src/mcp/server.js`
- `src/mcp/tools.js`

### Verification Results
- `GET /health` returned `{"status":"ok"}`.
- `ping` tool invoked via MCP transport returned `{"status":"pong","timestamp":"..."}`.

---

## Module 2: Portainer REST Integration & Read Tools
**Date:** 2026-09-30

### What Was Built
- Environment variable validation using `zod` schema in `src/config.js` (`PORTAINER_URL`, `PORTAINER_API_TOKEN`, `PORTAINER_ENDPOINT_ID`).
- Pino structured logging configured in `src/logger.js`.
- Portainer API service client (`src/services/portainer.js`) with `axios` and `axios-retry` (3 retries with exponential backoff on 5xx/network errors).
- Spoken-friendly error handling with `PortainerError`.
- Three read-only health check tools:
  1. `get_container_status`: Summarizes container state (Up/Exited).
  2. `get_container_logs`: Fetches tail logs (default 50 lines).
  3. `get_container_stats`: Calculates live CPU and Memory usage percentages.

### Files Touched
- `.env.example`
- `src/config.js`
- `src/logger.js`
- `src/services/portainer.js`
- `src/mcp/tools.js`
- `src/mcp/handlers.js`
- `test_module2.js`

### Verification Results
- All fast-fail environment checks verified (throws descriptive startup errors when missing).
- Portainer 401 Unauthorized returns spoken response: `"I couldn't authenticate with your Portainer server. Please check your API token."`
- Unreachable server returns spoken response: `"I can't reach your homelab right now. Please check if your Portainer server is running and accessible."`
- Structured JSON Pino log output verified for success and failure paths.

---

## Module 3: SQLite Audit Log & Verification Resilience
**Date:** 2026-09-30

### What Was Built
- Append-only SQLite audit database utility using `better-sqlite3` (`src/utils/audit.js`).
- Database schema (`audit_log` table): `id`, `timestamp`, `action_id`, `tool_name`, `target`, `status`, `api_call`, `result_summary`, `error_message`.
- Higher-order function `withAudit` in `src/mcp/handlers.js` wrapping tool executions to record audit entries automatically.
- Resilient non-blocking database logging (filesystem/database errors do not crash or block the primary MCP tool execution).
- Project-wide `jsconfig.json` configured for JSDoc type checking.

### Files Touched
- `.env.example`
- `jsconfig.json`
- `src/utils/audit.js`
- `src/mcp/handlers.js`
- `test_module3.js`

### Verification Results
- Database table creation auto-executes on startup.
- All 3 read tool invocations logged entries in `audit_log` with `status: "success"`.
- Resilient audit logging tested against invalid database directory path (`ENOENT`): tool invocation succeeded cleanly while Pino emitted warning log `Failed to initialize SQLite audit database`.

---

## Module 4: Human-In-The-Loop Safety Lock & Action Confirmation
**Date:** 2026-09-30

### What Was Built
- Safety lock mechanism (`src/utils/safety.js`) enforcing human confirmation before container modifications.
- Implemented `createPendingAction`, `getPendingAction`, and `consumePendingAction` with a 120-second TTL and a background purge sweep (30s interval with `unref()`).
- Single-execution guarantee: pending actions are deleted *before* calling Portainer APIs to prevent double execution.
- Added 3 safety-locked write tools:
  1. `request_restart_container`: Checks container existence, generates UUID `action_id`, and stores pending restart request.
  2. `request_stop_container`: Checks container existence, generates UUID `action_id`, and stores pending stop request.
  3. `confirm_action`: Consumes pending action by `action_id`; executes restart/stop if `confirmed: true`, or cancels if `confirmed: false`.

### Files Touched
- `src/utils/safety.js`
- `src/services/portainer.js` (added `restartContainer` and `stopContainer`)
- `src/mcp/tools.js`
- `src/mcp/handlers.js`
- `test_module4.js`

### Verification Results
- **Non-existent container check**: `request_restart_container` for missing container returns `"No container matching ... was found"`.
- **Declined action**: `confirm_action` with `confirmed: false` cancels action with zero Portainer calls and logs `status: "declined"`.
- **Confirmed action**: `confirm_action` with `confirmed: true` invokes Portainer API and logs `status: "success"`.
- **Double-execution prevention**: Re-confirming same `action_id` returns `"I don't have that pending request anymore — please ask again."` and logs `status: "not_found"`.
- **True TTL Expiry**: Attempting to confirm after 120s TTL returns `"I don't have that pending request anymore — please ask again."` and logs `status: "not_found"`.
- **Full audit trail**: All 8 execution rows verified sequentially in SQLite `audit_log`.

---

## Module 5: AWS Bedrock AI Root-Cause Analysis Tool
**Date:** 2026-09-30

### What Was Built
- Added AWS Bedrock Runtime integration using `@aws-sdk/client-bedrock-runtime` with the Converse API (`ConverseCommand`).
- Environment variable validation extended in `src/config.js` requiring `AWS_REGION` and `BEDROCK_MODEL_ID`.
- Built `src/services/ai.js` exporting `analyzeLogs(logsText)` returning `{ explanation, suggestedFix }` with an 8-second timeout (`AbortController`).
- Custom `BedrockError` handling: catches timeouts/API errors and provides user-friendly fallback message.
- Structured Pino logging for model ID, call duration (ms), and success/failure state.
- New dedicated MCP tool `diagnose_container_issue` registered in `src/mcp/tools.js`.
- Handler `handleDiagnoseContainerIssue` in `src/mcp/handlers.js`: reuses `getContainerLogs`, sends logs to `analyzeLogs`, formats spoken response (`"<container> crashed because <explanation>. I recommend <suggestedFix>."`), and gracefully falls back to raw log tail on AI failure without crashing. Wrapped with `withAudit`.

### Files Touched
- `package.json` & `package-lock.json`
- `.env.example`
- `src/config.js`
- `src/services/ai.js`
- `src/mcp/tools.js`
- `src/mcp/handlers.js`
- `test_module2.js`, `test_module3.js`, `test_module4.js` (updated with AWS env vars)
- `test_module5.js`

### Verification Results
- **Fast-fail configuration**: Startup fails gracefully if `AWS_REGION` or `BEDROCK_MODEL_ID` is missing.
- **Happy Path AI Diagnosis & Formatting**: `diagnose_container_issue` returned clean Bedrock explanation + recommended fix with zero double periods (`"crashed-app crashed because The application process ran out of allocated RAM buffer memory... I recommend Increase the container memory limit..."`).
- **Bedrock Failure Fallback**: Invalid model ID / API error returns raw log tail with user note without throwing or crashing.
- **Bedrock Timeout Fallback**: 8-second timeout returns raw log tail with timeout note without crashing.
- **Audit Logging Statuses**: SQLite `audit_log` records `status: "success"` for full AI analysis, and `status: "degraded"` for fallback/error paths (Row 1: success, Row 2: degraded, Row 3: degraded).
- **Regression Pass**: Full regression suite (`test_module2.js`, `test_module3.js`, `test_module4.js`, `test_module5.js`) passed 100%.

---

## Module 6: Alexa+ OAuth 2.1 Machine-To-Machine Client Credentials Authentication
**Date:** 2026-09-30

### What Was Built
- Extended environment variable schema in `src/config.js` (`MCP_SERVER_PUBLIC_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `JWT_SIGNING_SECRET`).
- Implemented `src/auth/oauth.js` with Express router containing 3 endpoints:
  1. `GET /.well-known/oauth-authorization-server`: Exposes RFC 8414 metadata advertising `issuer`, `token_endpoint`, `grant_types_supported: ["client_credentials"]`, `code_challenge_methods_supported: ["S256"]`, and `scopes_supported: ["mcp:full"]`.
  2. `GET /.well-known/oauth-protected-resource`: Exposes RFC 9728 Protected Resource Metadata advertising `resource`, `authorization_servers`, `scopes_supported`, and `bearer_methods_supported: ["header"]`.
  3. `POST /token`: Validates client Basic Auth (`OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`), `grant_type=client_credentials`, and `resource` URI parameter. On success, issues a signed JWT Bearer access token valid for `ACCESS_TOKEN_TTL_SECONDS`. On error, returns standard OAuth error JSON (`invalid_client`, `unsupported_grant_type`, `invalid_target`).
- Built `src/auth/verifyToken.js` Express middleware protecting `/mcp`:
  - Validates `Authorization: Bearer <token>` JWT signature, expiration, and audience (`aud`).
  - **Bare 401 requirement**: Unauthenticated or invalid token requests return HTTP 401 Unauthorized with a bare JSON body and explicitly **NO `WWW-Authenticate` header** (enforcing Alexa+'s strict auth specification).
- Updated `src/index.js` to parse urlencoded/json bodies, mount `oauthRouter`, and apply `verifyToken` ONLY to `/mcp`.

### Files Touched
- `package.json` & `package-lock.json`
- `.env.example` & `.env`
- `src/config.js`
- `src/auth/oauth.js`
- `src/auth/verifyToken.js`
- `src/index.js`
- `test_module2.js`, `test_module3.js`, `test_module4.js`, `test_module5.js` (updated with OAuth token authentication)
- `test_module6.js`

### Verification Results
- **Metadata Endpoints**: `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` return HTTP 200 with valid metadata matching RFC 8414, RFC 9728, and Alexa+ spec with scopes `["mcp:tools", "mcp:resources", "mcp:prompts", "mcp:full"]`.
- **Token Issuance**: `POST /token` returns Bearer JWT with `expires_in: 3600` for valid credentials and returns standard OAuth error JSON for invalid credentials/grant_type/resource.
- **Bare 401 Verification**: Unauthenticated `/mcp` request returns HTTP 401 with **zero `WWW-Authenticate` header**.
- **Expired Token Rejection**: Token issued with 1s TTL and tested after 2s returns HTTP 401 with **zero `WWW-Authenticate` header**.
- **Authenticated MCP Operations**: `/mcp` requests with valid Bearer JWT execute MCP tools (`ping`, `get_container_status`, etc.) cleanly.
- **Full Suite Pass**: `npm test` runs all 5 module tests (Modules 2, 3, 4, 5, 6) sequentially with 100% pass rate.

---

## Module 7: Verification, Hardening & Audit Metadata
**Date:** 2026-10-09

### What Was Built
- **Alexa Request Verification (`src/alexa/adapter.js`)**:
  - Integrated `SkillRequestSignatureVerifier` and `TimestampVerifier` from `ask-sdk-express-adapter` to verify SSL certificates, RSA SHA-256 signatures, and 150-second timestamp freshness over raw body bytes.
  - Added strict `applicationId` validation checking that incoming request `applicationId` matches `ALEXA_SKILL_ID`.
  - Added environment configuration: `ALEXA_SKILL_ID` (required string) and `ALEXA_VERIFY_REQUESTS` (boolean, default `true`).
  - Strict environment rule: `ALEXA_VERIFY_REQUESTS` may only be set to `false` when `NODE_ENV=development`; in any other environment, the server refuses startup. Logged loud warning when disabled in development.
- **Endpoint Hardening (`src/index.js` & `src/auth/oauth.js`)**:
  - Added `helmet()` middleware for HTTP security headers.
  - Set `app.set('trust proxy', true)` and configured 100kb JSON request body parsing with raw body buffer capture (`req.rawBody`).
  - Added `express-rate-limit` middleware: `/token` endpoint limited to 10 req/min per IP (returns HTTP 429 when exceeded); `/mcp` and Alexa routes limited to 60 req/min per IP. IP resolution uses `CF-Connecting-IP` proxy header when available.
  - Implemented `safeCompare(a, b)` constant-time string comparison using SHA-256 digests and `crypto.timingSafeEqual` in `src/auth/oauth.js` to eliminate timing attack vulnerabilities on `client_id` and `client_secret`.
  - Confirmed zero log lines print sensitive Authorization headers, client secrets, or issued tokens anywhere in the project.
- **Source-Tagged Audit + Session-Bound Confirmation (`src/utils/audit.js`, `src/mcp/handlers.js`, `src/alexa/adapter.js`)**:
  - Added idempotent startup migration in `src/utils/audit.js` using `PRAGMA table_info(audit_log)` to dynamically add the `source` TEXT column (`'mcp'` | `'alexa-skill'`) if missing.
  - Updated all MCP handlers and audit logging functions to tag every audit log entry with its source caller type (`source: 'mcp'` vs `source: 'alexa-skill'`).
  - Session-Bound Confirmation: Alexa adapter stores `pending_action_id` in response `sessionAttributes`. Multi-turn confirmation (`ConfirmActionIntent` / `AMAZON.YesIntent`) checks session attributes for `pending_action_id`. A "yes" without a pending action in `sessionAttributes` returns speech saying there is nothing to confirm and executes zero Portainer calls.
  - Confirmed container modifications (`restartContainer`/`stopContainer`) are reachable ONLY through the `createPendingAction` -> `confirm_action` flow.

### Files Touched
- `.env.example` & `.env`
- `package.json` & `package-lock.json`
- `src/config.js`
- `src/utils/audit.js`
- `src/utils/safety.js`
- `src/mcp/handlers.js`
- `src/auth/oauth.js`
- `src/alexa/adapter.js`
- `src/index.js`
- `test_module2.js`, `test_module3.js`, `test_module4.js`, `test_module5.js`, `test_module6.js` (updated with Module 7 test environment configuration)
- `test_module7.js`
- `docs/DEVELOPMENT_LOG.md`

### Verification Results
- **Alexa Verification**:
  - Forged Alexa request missing signature rejected with HTTP 400 and zero Portainer calls.
  - Replayed request with stale timestamp (>150s) rejected with HTTP 400.
  - Valid-shaped request with wrong `applicationId` rejected with HTTP 400.
- **Session-Bound Confirmation**:
  - `AMAZON.YesIntent` sent without `pending_action_id` in session attributes executed zero Portainer calls and returned speech `"There is no pending request to confirm."`.
  - Multi-turn restart flow (`RestartContainerIntent` -> `AMAZON.YesIntent` with bound session attribute) executed container restart cleanly and returned success speech.
- **Rate Limiting**: `/token` endpoint rate limit tripped on the 11th request within a minute, returning HTTP 429.
- **Source-Tagged Audit Trail**: SQLite `audit_log` rows verified with correct `source` values (`source="alexa-skill"` for Alexa skill requests and `source="mcp"` for direct MCP protocol requests).
- **Full Suite Regression Pass**: `npm test` executed all 6 module test suites (Modules 2, 3, 4, 5, 6, 7) sequentially with 100% pass rate.

---

## Module 8: End-to-End MCP Proof & Alexa In-Process Client Routing
**Date:** 2026-10-09

### What Was Built
- **In-Process MCP Client Adapter (`src/mcp/server.js` & `src/alexa/adapter.js`)**:
  - Exported `createInProcessMcpClient()` using `InMemoryTransport.createLinkedPair()` connecting a dedicated `McpServer` instance with an `@modelcontextprotocol/sdk` `Client`.
  - Routed all Alexa skill intent handlers (`GetHomelabSummaryIntent`, `GetSystemStatusIntent`, `GetContainerStatusIntent`, `DiagnoseContainerIntent`, `RestartContainerIntent`, `StopContainerIntent`, `ConfirmActionIntent`) through `mcpClient.callTool({ name, arguments })`.
- **Audit Context Propagation (`src/utils/auditContext.js` & `src/mcp/handlers.js`)**:
  - Implemented `runWithSource(source, fn)` and `getAuditSource()` using Node.js `AsyncLocalStorage`.
  - Updated tool handlers (`withAudit`, `handleRequestRestartContainer`, `handleRequestStopContainer`, `handleConfirmAction`) to resolve `source` via `getAuditSource() || 'mcp'`, transparently tagging all Alexa-triggered audit records as `source: 'alexa-skill'`.
- **Tool Refinement & Annotations (`src/mcp/tools.js` & `src/mcp/handlers.js`)**:
  - Added `get_homelab_summary` tool returning a spoken-optimized fleet health summary (<300 characters).
  - Enhanced tool descriptions for LLM planners with explicit example phrasings and operational constraints.
  - Added MCP tool annotations across all 9 registered tools: `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- **Automated E2E Proof Script (`e2e_mcp_proof.js` & `package.json`)**:
  - Created `e2e_mcp_proof.js` using `@modelcontextprotocol/sdk` `Client` and `StreamableHTTPClientTransport`.
  - Validated 11 sequential E2E steps: RFC 8414/9728 discovery, OAuth 2.1 token issuance, transport connection, tool list annotations, `ping`, `get_homelab_summary`, `get_container_status`, `request_restart_container`, `confirm_action` (declined), negative auth 401 checks, and destructive safety guard verification.
  - Added `"e2e:mcp": "node e2e_mcp_proof.js"` and updated `"test"` script in `package.json`.

### Files Touched
- `package.json`
- `src/index.js`
- `src/utils/auditContext.js`
- `src/utils/audit.js`
- `src/mcp/tools.js`
- `src/mcp/handlers.js`
- `src/mcp/server.js`
- `src/alexa/adapter.js`
- `e2e_mcp_proof.js`
- `test_module8.js`
- `docs/DEVELOPMENT_LOG.md`

### Verification Results
- **In-Process MCP Client Verification**: Alexa adapter intent calls execute via `InMemoryTransport` in-process client without HTTP overhead.
- **Audit Tagging**: All Alexa invocations correctly tagged with `source: 'alexa-skill'` in SQLite `audit_log`.
- **Annotations**: `tools/list` returns 9 tools with accurate `readOnlyHint`, `destructiveHint`, and `openWorldHint` metadata.
- **Spoken Summary**: `get_homelab_summary` returns concise fleet health output under 300 characters.
- **E2E Proof Transcript**: `node e2e_mcp_proof.js` executed 11 proof steps with 100% pass rate.
- **Full Suite Pass**: `npm test` runs all 7 module test suites (Modules 2–8) sequentially with 100% pass rate.

