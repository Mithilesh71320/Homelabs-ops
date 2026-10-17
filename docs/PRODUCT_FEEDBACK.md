# Product Feedback — HomeLab Ops

> **Document Type:** Developer Product Feedback  
> **Source Evidence:** Pre-filled strictly from documented implementation facts in [`docs/DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md). Items requiring first-hand subjective commentary by the project author are explicitly tagged `TODO(author)`.

---

## 1. Model Context Protocol (MCP) TypeScript SDK (`@modelcontextprotocol/sdk`)

- **What it was used for**:
  - Exposing self-hosted tools via `McpServer` and `StreamableHTTPServerTransport` (spec 2025-11-25+).
  - Registering 9 tools with parameter schemas, return shapes, and tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`).
  - Connecting the Alexa voice bridge in-process via `InMemoryTransport.createLinkedPair()`, allowing voice handlers to invoke MCP tools without HTTP round-trip serialization overhead.
  - Automating the 11-step end-to-end verification script (`e2e_mcp_proof.js`) via `Client` and `StreamableHTTPClientTransport`.
- **What worked**:
  - `InMemoryTransport.createLinkedPair()` provided a seamless, zero-latency bridge between the Alexa Custom Skill adapter and the MCP tool layer.
  - JSON-RPC 2.0 message parsing, tool schema validation via Zod, and session management functioned reliably across all test runs.
  - Tool annotations were simple to declare and successfully discovered during `tools/list` negotiation.
- **What needs work**:
  - Documentation for in-process client-to-server linking using `InMemoryTransport` is sparse; most public examples assume STDIO or full HTTP server transports.
  - The transition from early drafts (2024-11-05) to the current Streamable HTTP specification (2025-11-25) had subtle session header requirements (`mcp-session-id`) that required careful manual protocol tracing.
- **Onboarding experience**:
  - Clean API surface and strong TypeScript typings. Easy to start with basic tools, but bridging non-MCP protocols (like Alexa voice requests) into the MCP client layer required custom architectural patterns.
- **Would I build with it again**:
  - Yes. It standardizes agent tool calling and eliminates ad-hoc custom function schemas.

---

## 2. Portainer Community Edition REST API

- **What it was used for**:
  - Querying Docker container statuses (`/api/endpoints/:id/docker/containers/json?all=true`).
  - Fetching tail logs (`/logs?stdout=true&stderr=true&tail=N`).
  - Polling live resource statistics (`/stats?stream=false`).
  - Inspecting runtime container state (`/json`) to extract ground-truth state facts (`Status`, `ExitCode`, `OOMKilled`, `RestartCount`, `StartedAt`, `FinishedAt`).
  - Triggering container lifecycle actions (`/restart`, `/stop`).
- **What worked**:
  - Predictable HTTP REST endpoints authenticated via a single `X-API-Key` header.
  - Container inspect endpoint accurately surfaces low-level Linux kernel states (such as `OOMKilled: true`), enabling reliable ground-truth AI diagnosis.
  - Fast execution (sub-15ms for container listing and inspection).
- **What needs work**:
  - Docker log streams returned via Portainer include 8-byte binary multiplex headers (`[\x00-\x1F]`), requiring manual stripping and cleanup before log text can be spoken by voice or processed by an LLM.
  - The `/stats` endpoint does not provide pre-computed CPU percentages; consumers must manually calculate deltas over `system_cpu_usage` and `total_usage`. On a cold first call, `precpu_stats` is unpopulated, forcing callers to introduce an artificial 1-second delay to compute an accurate delta.
- **Onboarding experience**:
  - API keys are easy to generate in Portainer CE settings. Endpoint path nesting (`/api/endpoints/{id}/docker/...`) requires careful URL assembly.
- **Would I build with it again**:
  - Yes. Portainer provides a stable, self-hosted abstraction layer over Docker daemons across homelab hosts.

---

## 3. Amazon Bedrock Converse API (`@aws-sdk/client-bedrock-runtime`)

- **What it was used for**:
  - Extracting plain-English root causes and actionable suggested fixes from container failure logs and Docker inspect state facts using `anthropic.claude-3-5-sonnet` and `claude-3-5-haiku`.
- **What worked**:
  - The Converse API (`ConverseCommand`) is significantly cleaner and more standardized than the legacy `InvokeModel` raw JSON API.
  - Strict two-line output formatting (`EXPLANATION: ... \n SUGGESTED_FIX: ...`) worked consistently with low temperature (0.2).
  - Ground-truth state constraint injection (e.g., instructing the model that `oomKilled: true` is an immutable fact) successfully prevented the model from hallucinating non-existent error causes when logs were empty.
  - Fast response times (~1000–1800ms) suitable for voice interactions.
- **What needs work**:
  - Network latency fluctuations necessitate explicit timeout handling. We implemented an 8-second `AbortController` timeout with a graceful fallback to raw logs and inspect facts to prevent voice sessions from hanging.
- **Onboarding experience**:
  - Setting up IAM permissions (`bedrock:InvokeModel`) and requesting model access in the AWS Console is straightforward, though cross-region availability for specific Claude 3.5 versions must be verified.
- **Would I build with it again**:
  - Yes. Converse API is our preferred interface for LLM invocation in production Node.js services.

---

## 4. Cloudflare Tunnel (`cloudflared`)

- **What it was used for**:
  - Securely exposing the localhost Express server (`127.0.0.1:3000` / `:3095`) to the public internet over HTTPS without opening inbound router ports or exposing residential IP addresses.
- **What worked**:
  - Outbound-only tunnel connection eliminated port forwarding and dynamic DNS maintenance.
  - Automatic SSL/TLS certificate termination for custom domains.
  - Passes client IP via `CF-Connecting-IP`, allowing Express rate limiters to accurately track remote callers.
- **What needs work**:
  - Express requires explicit `app.set('trust proxy', true)` configuration to recognize proxy headers; otherwise, all external callers share the loopback IP and trigger false-positive rate limiting.
- **Onboarding experience**:
  - Rapid zero-config setup using quick tunnels or persistent named tunnels.
- **Would I build with it again**:
  - Absolutely. Indispensable for secure homelab and self-hosted agent deployments.

---

## 5. Alexa Skills Kit (ASK) SDK & `ask-sdk-express-adapter`

- **What it was used for**:
  - Serving Alexa custom skill requests over Express, performing request signature verification, timestamp freshness verification, and rendering SSML responses.
- **What worked**:
  - `SkillRequestSignatureVerifier` downloads Amazon signing certificates from S3, verifies URL integrity, and validates SHA-256 signatures accurately.
  - Multi-turn session attributes (`pending_action_id`) enabled safe, stateful two-step confirmation dialogs over voice.
- **What needs work**:
  - `ask-sdk-express-adapter` requires the raw, unmutated request buffer to verify signatures. Standard `express.json()` middleware parses and discards the raw buffer unless a custom `verify` hook captures `req.rawBody`.
  - Unescaped XML characters (`&`, `<`, `>`, `"`) in container names or logs cause Alexa skill protocol violations; manual SSML character escaping was mandatory.
- **Onboarding experience**:
  - SDK is mature, but the strictness of Amazon request verification requires careful Express middleware ordering.
- **Would I build with it again**:
  - Yes, for custom skill endpoints.

---

## 6. Alexa AI / Alexa+ Developer Tooling (`alexa-ai` / `ask` CLI)

- **What it was used for**:
  - Skill package synchronization, manifest configuration, and interaction model deployment across 5 locales (`en-US`, `en-GB`, `en-IN`, `en-CA`, `en-AU`).
- **What worked**:
  - CLI enables programmatic deployment of interaction models and skill manifests without manual web console clicking.
- **What needs work**:
  - Direct Alexa+ add-on registration for third-party self-hosted MCP servers remains in closed preview/waitlist.
- **Onboarding experience**:
  - TODO(author): Document personal CLI authentication and developer account onboarding experience.
- **Would I build with it again**:
  - TODO(author): Author verdict on toolchain adoption.
