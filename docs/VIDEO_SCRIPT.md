# Video Demo Script — HomeLab Ops

> **Target Duration:** 2:45 (Strict Maximum: 3:00)  
> **Visual Style:** Split-Screen (Echo Device / Voice Audio on Left, Portainer CE Dashboard & Terminal on Right)  
> **Soundtrack:** Clear spoken narration; no background music or third-party audio.  
> **On-Screen Identifiers:** Use only `demo-web`, `demo-cache`, and `demo-crashy`. No personal infrastructure or third-party logos.

---

## Pre-Recording Checklist

- [ ] Run `npm run demo:reset` to ensure clean container state (`demo-web`, `demo-cache`, `demo-crashy` all running).
- [ ] Cloudflare Tunnel active and forwarding public HTTPS URL to `127.0.0.1:3000`.
- [ ] Portainer CE dashboard open to container list view, filtered to `demo-`.
- [ ] Terminal split ready with clean font size (18pt) in `homelab-ops-mcp`.
- [ ] Alexa Developer Console or physical Echo device connected and volume tested.
- [ ] Verify Bedrock access (`anthropic.claude-3-5-haiku-20241022-v1:0`).

---

## Shot-by-Shot Storyboard

### Act 1: The Hook — Crash & Voice Diagnosis (0:00 – 0:50)

| Timestamp | Visual Layout | Spoken Narration / Dialogue | Production Notes |
|---|---|---|---|
| **0:00 – 0:15** | **Split screen:** Left shows Echo Dot / Voice wave; Right shows Portainer dashboard with `demo-crashy` showing **Exited (137)** in red. | *"Imagine being away from your desk when a critical service crashes. You don't have your laptop, but you need to know what failed and why."* | Fast cut right to the core problem. No slide intros. |
| **0:15 – 0:32** | Left: Echo pulsing blue. <br> Right: Terminal showing incoming `/mcp` request log. | **Presenter:** *"Alexa, ask Homelab Ops to diagnose demo-crashy."*<br><br>**Alexa:** *"demo-crashy crashed because it ran out of memory and was killed by the operating system. I recommend increasing the container memory limit or optimizing application buffers."* | Alexa output speech is clear. Note that Bedrock gives the explanation grounded in Docker inspect data. |
| **0:32 – 0:50** | Right: Zoom in on Portainer container inspect JSON showing `"OOMKilled": true` and `"ExitCode": 137`. | *"Notice that Alexa didn't guess. HomeLab Ops inspects the Docker daemon's low-level kernel state, verifying the Linux OOM kill before Amazon Bedrock explains it in plain English."* | Highlights Task B state grounding innovation. |

---

### Act 2: Safety First — Human-in-the-Loop Confirmation (0:50 – 1:35)

| Timestamp | Visual Layout | Spoken Narration / Dialogue | Production Notes |
|---|---|---|---|
| **0:50 – 1:10** | Left: Echo listening.<br>Right: Portainer showing stopped container. | **Presenter:** *"Alexa, ask Homelab Ops to restart demo-crashy."*<br><br>**Alexa:** *"Are you sure you want to restart demo-crashy? Say yes to confirm."* | Demonstrates two-step confirmation lock. No action taken yet. |
| **1:10 – 1:25** | Left: Echo listening.<br>Right: Container status changes from **Exited** to **Running (Up 2 seconds)**. | **Presenter:** *"Yes."*<br><br>**Alexa:** *"demo-crashy has been restarted."* | Visual state change in Portainer validates immediate execution. |
| **1:25 – 1:35** | Right: Terminal displays SQLite audit query output table. | *"Every command is gated by a 120-second single-use token and permanently logged in an append-only SQLite audit trail, tagged with the origin: `alexa-skill`."* | Highlight the `source` column showing `alexa-skill`. |

---

### Act 3: Under the Hood — Architecture & Self-Hosted MCP (1:35 – 2:00)

| Timestamp | Visual Layout | Spoken Narration / Dialogue | Production Notes |
|---|---|---|---|
| **1:35 – 1:45** | Full screen: Clean animated architecture diagram. | *"HomeLab Ops is a self-hosted Model Context Protocol server built to the latest 2025-11-25 specification. Voice requests bridge in-process via `InMemoryTransport`, while external AI planners connect over Streamable HTTP."* | Emphasizes hackathon track alignment (Alexa+ & MCP). |
| **1:45 – 2:00** | Full screen: Split showing Cloudflare Tunnel transport and localhost bind (`127.0.0.1`). | *"Security is baked in: the server binds strictly to localhost behind a Cloudflare Tunnel, guarded by OAuth 2.1 client credentials, rate limiters, and cryptographic request signature verification."* | Highlights zero open router ports. |

---

### Act 4: Live MCP Proof — Real Protocol Verification (2:00 – 2:25)

| Timestamp | Visual Layout | Spoken Narration / Dialogue | Production Notes |
|---|---|---|---|
| **2:00 – 2:25** | Full screen: Terminal executing `npm run e2e:mcp` against the public Cloudflare Tunnel URL. | *"Here is the official MCP SDK client connecting live over Streamable HTTP. Watch all 11 protocol steps pass: RFC 8414 discovery, OAuth token issuance, tool annotation inspection, fleet summaries, and safety lock verification."* | Show terminal scrolling through the 11 `✔ PASS` checks ending with `100% PASS RATE`. |

---

### Act 5: Open Source & Closing (2:25 – 2:45)

| Timestamp | Visual Layout | Spoken Narration / Dialogue | Production Notes |
|---|---|---|---|
| **2:25 – 2:38** | Right: GitHub repository for `mcp-confirm-gate`. | *"To help other builders keep autonomous agents safe, we extracted our human-in-the-loop confirmation lock into an open-source package: `mcp-confirm-gate`, available on npm and GitHub."* | Demonstrates Open Source mini-challenge contribution. |
| **2:38 – 2:45** | Title Card: HomeLab Ops — Safe, voice-driven infrastructure. GitHub repo link. | *"HomeLab Ops: intelligent homelab management you can speak to, with the safety guarantees production infrastructure requires. Thank you."* | Clean fade to black. Exactly 2:45 runtime. |

---

## Audio & Speech Notes

- **Pacing:** Speak at a steady, conversational pace (~130 words per minute).
- **Voice Prompts:** Speak clearly into the microphone so the voice device does not trigger a reprompt.
- **Microphone Reprompt Fallback:** If Alexa asks *"Is there anything else you'd like to check?"*, reply *"No"* or let the session conclude naturally.
