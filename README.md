# HomeLab Ops — Self-Hosted MCP Server for Voice-Driven Infrastructure

> **An AI-agentic operations center for your private homelab. Control, monitor, and safely diagnose Docker containers via natural voice and MCP-compatible AI planners, backed by Amazon Bedrock root-cause analysis and human-in-the-loop confirmation gates.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Spec](https://img.shields.io/badge/MCP%20Spec-2025--11--25-orange.svg)](https://spec.modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-passing%20(8%20suites)-success.svg)](test_module9.js)

---

### The Three Problems HomeLab Ops Solves

1. **Flying Blind Away from the Keyboard**: Homelab owners run mission-critical local services (media servers, Home Assistant, DNS, storage) but cannot quickly check fleet status while cooking, working, or away from a terminal. HomeLab Ops provides sub-300-character voice summaries and live container telemetry without opening a dashboard.
2. **Unsafe LLM Tool Execution**: Autonomous AI agents equipped with infrastructure tools can accidentally crash services or trigger destructive actions during hallucinations. HomeLab Ops enforces a **two-step confirmation lock with single-use consume-before-execute tokens**, ensuring destructive operations (restarts, stops) cannot run without explicit human consent.
3. **Opaque Container Crashes**: When a container fails from an out-of-memory (OOM) kill or non-zero exit, raw logs are often empty or misleading. HomeLab Ops inspects the Docker daemon's runtime state facts (`OOMKilled`, `ExitCode`, timestamps) and injects them as **ground truth** into a Claude model on Amazon Bedrock (configurable via `BEDROCK_MODEL_ID`), delivering factual root-cause explanations and actionable remediation steps.

---

## System Architecture

```mermaid
graph TD
    subgraph Voice Interface
        User([Voice / User]) <-->|Spoken Utterance| Echo[Alexa Voice Device]
        Echo <-->|HTTPS POST /mcp| Cloudflare[Cloudflare Tunnel\nTransport Only]
    end

    subgraph HomeLab Ops Host [127.0.0.1:3000 / 3095]
        Cloudflare -->|Local Proxy| DualRouter[Dual Protocol Router\n/mcp & /]
        
        subgraph Security Layer
            DualRouter -->|Alexa Request| SigVerifier[Signature & Timestamp\nVerifier < 150s]
            DualRouter -->|MCP Client Request| TokenVerifier[OAuth 2.1 Bearer\nToken Verifier]
            TokenVerifier --> RateLimiter[Express Rate Limiter\nToken: 10/m | API: 60/m]
        end

        subgraph In-Process Voice Bridge
            SigVerifier --> AlexaAdapter[Alexa Skill Adapter\nask-sdk-express-adapter]
            AlexaAdapter -->|InMemoryTransport| InProcessClient[In-Process MCP Client\n@modelcontextprotocol/sdk]
        end

        subgraph Core MCP Engine
            RateLimiter --> StreamableHttp[Streamable HTTP Transport\nSpec 2025-11-25+]
            StreamableHttp --> McpServer[McpServer\n9 Tools Registered]
            InProcessClient --> McpServer
            
            McpServer --> SafetyLock[Two-Step Safety Lock\n120s TTL | Single-Use ID]
            McpServer --> AuditLog[(SQLite audit.db\nAppend-Only Log\nSource: alexa-skill | mcp)]
        end
    end

    subgraph External Infrastructure
        McpServer -->|REST API X-API-Key| Portainer[Portainer Community Edition]
        Portainer -->|Docker Socket| DockerEngine[Docker Daemon & Containers]
        McpServer -->|Converse API| Bedrock["Amazon Bedrock\nClaude Model (BEDROCK_MODEL_ID)"]
    end

    subgraph External Agents
        ExternalMcp[Claude Desktop / External MCP Clients] -.->|OAuth 2.1 Bearer| Cloudflare
    end
```

---

## Features Implemented & Tested

- **9 Registered MCP Tools** with comprehensive schema validations:
  - `ping`: Uptime and liveliness check.
  - `get_homelab_summary`: Fleet health breakdown (`X running, Y completed, Z stopped`) under 295 characters for voice.
  - `get_container_status`: Per-container state and uptime inspection.
  - `get_container_logs`: Cleaned, demultiplexed tail logs (removes Docker binary headers).
  - `get_container_stats`: CPU % delta calculation (`((cpuDelta / systemDelta) * online_cpus * 100)`) with automatic 1-second two-sample polling on cold starts, plus cgroups v1/v2 memory accounting.
  - `diagnose_container_issue`: Fetches runtime inspect facts and logs in parallel; passes state ground truth to Amazon Bedrock Converse API.
  - `request_restart_container`: Registers a pending restart and returns a 120s single-use `action_id`.
  - `request_stop_container`: Registers a pending stop and returns a 120s single-use `action_id`.
  - `confirm_action`: Confirms and executes or cancels a pending destructive operation.
- **MCP Tool Annotations**: All registered tools declare explicit hints (`readOnlyHint`, `destructiveHint`, `openWorldHint`) guiding LLM reasoning.
- **Human-in-the-Loop Confirmation Gate**: Destructive actions (`restart`, `stop`) require explicit confirmation. The action token is consumed *before* execution to prevent double-execution or replay race conditions.
- **Ground-Truth AI Diagnosis**: Amazon Bedrock Converse API analysis is strictly conditioned on Docker inspect facts (`oomKilled: true` mandates an out-of-memory explanation; nonzero exit codes are bound to factual exit reasons).
- **Append-Only SQLite Audit Trail**: All operations are recorded with timestamps, tool names, target containers, status, execution durations, and `source` tags (`alexa-skill` vs `mcp`), propagated through Node.js `AsyncLocalStorage`.
- **OAuth 2.1 M2M & Protocol Hardening**: RFC 8414 and RFC 9728 discovery endpoints (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`), client_credentials token issuance, and bare HTTP 401 unauthenticated challenge.

---

## Security Model

| Security Layer | Implementation Detail | Purpose |
|---|---|---|
| **Localhost Binding** | Server binds strictly to `127.0.0.1` | Prevents unauthorized LAN access; traffic enters exclusively through Cloudflare Tunnel or local loopback. |
| **Two-Step Confirmation** | In-memory token store with 120s TTL | Prevents LLM hallucinations or unauthorized voice triggers from mutating infrastructure without confirmation. |
| **Consume-Before-Execute** | Atomic deletion of `action_id` before invoking executor | Mathematically eliminates replay attacks and race-condition double execution. |
| **Cryptographic Request Verification** | `SkillRequestSignatureVerifier` + `TimestampVerifier` | Validates Amazon SHA-256 certificate signatures and enforces a strict ±150-second timestamp freshness window. |
| **OAuth 2.1 Authentication** | JWT Bearer tokens with HMAC-SHA256 signing | Protects public MCP endpoints from unauthenticated callers. |
| **Endpoint Rate Limiting** | `express-rate-limit` with `CF-Connecting-IP` proxy support | `/token` endpoint limited to 10 req/min; API/MCP endpoints limited to 60 req/min. |
| **Append-Only Audit Trail** | SQLite database with `AsyncLocalStorage` context | Provides permanent audit records tagging every action's origin (`source="alexa-skill"` vs `source="mcp"`). |

---

## Quick Start

### 1. Prerequisites
- Node.js v20.x or v22.x LTS (recommended; Node v24 requires local C++ build tools for SQLite native bindings on Windows)
- Docker & Docker Compose
- Portainer Server (Community Edition)
- AWS Account with Amazon Bedrock model access (a Claude model on Amazon Bedrock, configurable via `BEDROCK_MODEL_ID`, e.g. in `us-east-1`)
- Cloudflare Tunnel (`cloudflared`) for public endpoint routing

### 2. Environment Configuration (`.env`)

Copy the template and configure your parameters:
```bash
cp .env.example .env
```

| Variable | Description | Example Value |
|---|---|---|
| `PORT` | Local port for Express MCP server | `3000` |
| `PORTAINER_URL` | Base URL of your Portainer instance | `https://portainer.local:9443` |
| `PORTAINER_API_TOKEN` | Portainer User API Key (`ptr_...`) | `ptr_aB1cD2eF3gH4...` |
| `PORTAINER_ENDPOINT_ID` | Portainer Docker environment ID | `1` |
| `SQLITE_DB_PATH` | Path to the persistent SQLite audit database | `./audit.db` |
| `AWS_REGION` | AWS region where Bedrock model is accessible | `us-east-1` |
| `BEDROCK_MODEL_ID` | Model identifier for Bedrock Converse API | `anthropic.claude-3-5-haiku-20241022-v1:0` |
| `MCP_SERVER_PUBLIC_URL` | Canonical public URL of your MCP server (via tunnel) | `https://homelab.yourdomain.com/mcp` |
| `OAUTH_CLIENT_ID` | Machine-to-machine client ID for MCP authentication | `alexa_plus_client_123` |
| `OAUTH_CLIENT_SECRET` | Machine-to-machine client secret | `your_secure_secret_key` |
| `ACCESS_TOKEN_TTL_SECONDS` | Lifetime of issued OAuth JWT tokens in seconds | `3600` |
| `JWT_SIGNING_SECRET` | Secret key used to sign and verify OAuth JWTs | `a_very_long_cryptographic_secret_32chars` |
| `ALEXA_SKILL_ID` | Amazon Skill ID from Alexa Developer Console | `amzn1.ask.skill.12345678-abcd-...` |
| `ALEXA_VERIFY_REQUESTS` | Enforce signature and timestamp verification | `true` (`false` only during local testing) |

### 3. Installation & Server Launch

```bash
# Install dependencies
npm install

# Check Amazon Bedrock model connectivity
npm run check:bedrock

# Start development server with auto-reload
npm run dev

# Or start production server
npm start
```

### 4. Running Verification Test Suites

```bash
# Run full comprehensive test suite (Modules 2 through 11, fully mocked)
npm test

# Run the automated 11-step MCP protocol proof script against a running server:
# Terminal 1:
npm start
# Terminal 2:
npm run e2e:mcp
```

### 5. Running the Demo Environment

HomeLab Ops includes a self-contained 3-container demo environment with an intentional memory leak container (`demo-crashy`) designed to trigger an exit code 137 OOM kill for live testing:

```bash
# Start demo containers (demo-web, demo-cache, demo-crashy)
npm run demo:up

# Trigger the off-heap memory leak on demo-crashy
npm run demo:crash

# Reset and rebuild demo-crashy
npm run demo:reset

# Stop and remove demo environment
npm run demo:down
```

For complete shot-by-shot instructions, review [docs/DEMO_SETUP.md](docs/DEMO_SETUP.md).

---

## Hackathon Track Mapping

### 1. Alexa+ Track
- **Self-Hosted Model Context Protocol (MCP) Server**: Full compliance with MCP Specification 2025-11-25+.
- **Streamable HTTP Transport**: Implemented at `/mcp` and `/` with session-id management (`StreamableHTTPServerTransport`).
- **OAuth 2.1 Security**: Implements RFC 8414 Server Metadata and RFC 9728 Protected Resource Metadata for secure M2M client credentials.
- **Dual-Protocol Adaptability**: Unifies incoming voice intent requests and external MCP JSON-RPC calls over a single hardened Express host.

### 2. AWS Builder Track
- **Amazon Bedrock Converse API**: Integrated in [`src/services/ai.js`](src/services/ai.js) using a Claude model on Amazon Bedrock (configurable via `BEDROCK_MODEL_ID`).
- **State-Grounded Prompting**: Docker inspect state facts (`oomKilled`, `exitCode`, `restartCount`) are injected as unalterable ground truth, preventing hallucinations on silent container crashes.
- **Fault-Tolerant Fallback**: Implements 10-second request abort timeouts and deterministic diagnosis fallback labeled `"Generated without AI (Bedrock unavailable)"` if AWS Bedrock is unreachable, throttling, or EOL.

### 3. Open Source Track
- **Standalone Package**: Extracted the generic confirmation engine into an independent open-source package: [`mcp-confirm-gate`](https://github.com/TODO-author/mcp-confirm-gate).
- **Zero Homelab Coupling**: Reusable by any Node.js MCP server needing human-in-the-loop protection for destructive tool calls.
- **Complete Test Coverage**: Includes standalone `node:test` test suite validating expiration, single-use guarantees, and cancellation hooks.

---

## Known Limitations & Roadmap

We believe in honest engineering disclosures:
1. **Voice Delivery Bridge**: Voice interaction is currently delivered through an Alexa Custom Skill bridge using `ask-sdk-express-adapter` connected to an in-process MCP client via `InMemoryTransport`. Direct Alexa+ native add-on registration remains in closed developer preview status [TODO(author): check alexa-ai CLI add-on preview status for current account].
2. **Proxmox VE Integration**: Proxmox virtual machine and LXC hypervisor metrics are part of our architectural roadmap and are **not** implemented in this release. This version monitors Docker containers via Portainer CE.
3. **Single-User Administrative Scope**: The server is designed for a single homelab owner/operator. Multi-tenant access control and role-based container permissions are planned for future iterations.

---

## License

[MIT](LICENSE) © 2026 Mithilesh Ubale
