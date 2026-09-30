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
- **Happy Path AI Diagnosis**: `diagnose_container_issue` returned Bedrock explanation + recommended fix (`"crashed-app crashed because The application process ran out of allocated RAM buffer memory... I recommend Increase the container memory limit..."`).
- **Bedrock Failure Fallback**: Invalid model ID / API error returns raw log tail with user note without throwing or crashing.
- **Bedrock Timeout Fallback**: 8-second timeout returns raw log tail with timeout note without crashing.
- **Audit Logging**: All 3 calls (happy path, error fallback, timeout fallback) recorded audit log entries in SQLite `audit_log`.

