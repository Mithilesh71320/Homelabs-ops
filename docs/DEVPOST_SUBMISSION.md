# HomeLab Ops MCP — Devpost Submission

### Inspiration
Managing a homelab often means checking web dashboards or opening SSH terminal sessions at inconvenient moments. When a self-hosted service crashes, operators need instant situational awareness and the ability to remediate issues hands-free. We built HomeLab Ops to give homelabbers an intelligent, voice-driven operations assistant that connects Alexa and AI agents to Docker infrastructure without compromising security or exposing sensitive ports to the internet.

### What It Does
HomeLab Ops is a hardened, self-hosted Model Context Protocol (MCP) server that bridges Alexa voice interactions and agentic LLM clients to a local Portainer CE Docker environment:
- **Fleet Health Summaries**: Delivers a concise spoken breakdown (`X running, Y completed, Z stopped`) under 295 characters, accurately treating `Exited (0)` jobs as normal completions rather than failures.
- **State-Grounded AI Root-Cause Diagnosis**: Analyzes crashing containers using Amazon Bedrock Converse API, strictly anchoring LLM reasoning to Docker inspect facts (`oomKilled: true`, exit codes, restart counts) to eliminate hallucinations on silent crashes.
- **Deterministic Fail-Soft Resilience**: Automatically returns deterministic inspect facts labeled `"Generated without AI (Bedrock unavailable)"` if Bedrock times out, throttles, or reaches model retirement, never crashing the voice or MCP caller.
- **Human-in-the-Loop Confirmation Gate**: Protects destructive operations (`restart`, `stop`) behind an in-memory 120-second single-use token that is atomically consumed before execution, eliminating replay attacks and double execution.
- **Zero-Trust Security & Audit**: Enforces loopback binding (`127.0.0.1`), Alexa SHA-256 certificate and timestamp verification (±150s), OAuth 2.1 M2M Bearer tokens with bare HTTP 401 challenges, rate limiting, and an append-only SQLite audit log tagging execution origins (`alexa-skill` vs `mcp`).

### How We Built It
- Built an Express service implementing MCP Specification 2025-11-25+ with 9 annotated tools (`readOnlyHint`, `destructiveHint`, `openWorldHint`).
- Routed voice intents through `ask-sdk-express-adapter` to an in-process MCP client via `InMemoryTransport`.
- Routed external MCP traffic through Cloudflare Tunnel (`cloudflared`) to local loopback.
- Integrated Amazon Bedrock Converse API in [`src/services/ai.js`](../src/services/ai.js).
- Used Node.js `AsyncLocalStorage` to trace execution context and source tagging through to SQLite audit records.
- Extracted the core safety gate into an open-source package: `mcp-confirm-gate`.

### Challenges We Ran Into
- **Silent OOM Crashes**: Out-of-memory container terminations (exit code 137) leave empty or misleading log files. We resolved this by querying container state first and enforcing Docker inspect ground truth as an unalterable prompt constraint.
- **OAuth Protocol Hardening**: Implementing RFC 8414 and RFC 9728 discovery while omitting the `WWW-Authenticate` header on HTTP 401 errors to satisfy Alexa+'s strict auth specification.
- **Accurate CPU Accounting**: Handling cold-start container statistics by polling two sequential samples one second apart to calculate accurate CPU delta percentages across arbitrary core counts.

### Accomplishments That We're Proud Of
- 100% test pass rate across 11 verification modules covering unit, integration, and security tests.
- Replayable proof script (`scripts/e2e_mcp_proof.js`) executing 11 end-to-end verification steps.
- Clean secret scan across all git commits with zero leaked credentials.

### What We Learned
Ground truth infrastructure state must always anchor generative AI in systems management. LLMs excel at explaining complex error contexts, but factual container state must come from the container runtime.

### What's Next
- Proxmox VE hypervisor and LXC container metric monitoring.
- Multi-tenant role-based access control.
- Native Alexa+ developer preview add-on integration once generally available.
- [TODO(author): Add personal closing thought or long-term vision].

### Built With
Node.js, Express, Model Context Protocol (MCP), Amazon Bedrock, AWS SDK v3, Docker, Portainer CE, SQLite (`better-sqlite3`), Ask SDK, Cloudflare Tunnel, Pino, Zod.

### Try It Out
Clone the repo, run `npm install`, configure `.env`, run `npm run preflight`, and run `npm test`. Launch the demo environment with `npm run demo:up` and simulate an OOM crash with `npm run demo:crash`.
