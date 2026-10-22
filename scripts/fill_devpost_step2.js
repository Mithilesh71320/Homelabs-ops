import fs from 'fs';
import path from 'path';

const targetId = '0586FAF530D88CFBE4D69F7444DE79B2';
const galleryPhoto = path.resolve('demo_video_build/frame_act1_diag.png');

const description = `### Inspiration
Managing a homelab often means checking web dashboards or opening SSH terminal sessions at inconvenient moments. When a self-hosted service crashes, operators need instant situational awareness and the ability to remediate issues hands-free. We built HomeLab Ops to give homelabbers an intelligent, voice-driven operations assistant that connects Alexa and AI agents to Docker infrastructure without compromising security or exposing sensitive ports to the internet.

### What It Does
HomeLab Ops is a hardened, self-hosted Model Context Protocol (MCP) server that bridges Alexa voice interactions and agentic LLM clients to a local Portainer CE Docker environment:
- **Fleet Health Summaries**: Delivers a concise spoken breakdown (X running, Y completed, Z stopped) under 295 characters, accurately treating Exited (0) jobs as normal completions rather than failures.
- **State-Grounded AI Root-Cause Diagnosis**: Analyzes crashing containers using Amazon Bedrock Converse API, strictly anchoring LLM reasoning to Docker inspect facts (oomKilled: true, exit codes, restart counts) to eliminate hallucinations on silent crashes.
- **Deterministic Fail-Soft Resilience**: Automatically returns deterministic inspect facts labeled "Generated without AI (Bedrock unavailable)" if Bedrock times out, throttles, or reaches model retirement, never crashing the voice or MCP caller.
- **Human-in-the-Loop Confirmation Gate**: Protects destructive operations (restart, stop) behind an in-memory 120-second single-use token that is atomically consumed before execution, eliminating replay attacks and double execution.
- **Zero-Trust Security & Audit**: Enforces loopback binding (127.0.0.1), Alexa SHA-256 certificate and timestamp verification (±150s), OAuth 2.1 M2M Bearer tokens with bare HTTP 401 challenges, rate limiting, and an append-only SQLite audit log tagging execution origins (alexa-skill vs mcp).

### How We Built It
- Built an Express service implementing MCP Specification 2025-11-25+ with 10 annotated tools (readOnlyHint, destructiveHint, openWorldHint).
- Routed voice intents through ask-sdk-express-adapter to an in-process MCP client via InMemoryTransport.
- Routed external MCP traffic through secure tunneling to local loopback.
- Integrated Amazon Bedrock Converse API in src/services/ai.js.
- Used Node.js AsyncLocalStorage to trace execution context and source tagging through to SQLite audit records.
- Extracted the core safety gate into an open-source package: mcp-confirm-gate.

### Challenges We Ran Into
- **Silent OOM Crashes**: Out-of-memory container terminations (exit code 137) leave empty or misleading log files. We resolved this by querying container state first and enforcing Docker inspect ground truth as an unalterable prompt constraint.
- **OAuth Protocol Hardening**: Implementing RFC 8414 and RFC 9728 discovery while omitting the WWW-Authenticate header on HTTP 401 errors to satisfy Alexa+'s strict auth specification.
- **Accurate CPU Accounting**: Handling cold-start container statistics by polling two sequential samples one second apart to calculate accurate CPU delta percentages across arbitrary core counts.

### Accomplishments That We're Proud Of
- 100% test pass rate across 11 verification modules covering unit, integration, and security tests.
- Replayable proof script (e2e_mcp_proof.js) executing 11 end-to-end verification steps.
- Clean secret scan across all git commits with zero leaked credentials.

### What We Learned
Ground truth infrastructure state must always anchor generative AI in systems management. LLMs excel at explaining complex error contexts, but factual container state must come from the container runtime.

### What's Next
- Proxmox VE hypervisor and LXC container metric monitoring.
- Multi-tenant role-based access control.
- Native Alexa+ developer preview add-on integration once generally available.

### Built With
Node.js, Express, Model Context Protocol (MCP), Amazon Bedrock, AWS SDK v3, Docker, Portainer CE, SQLite (better-sqlite3), Ask SDK, Pino, Zod.`;

const tags = "node.js, express, model-context-protocol, amazon-bedrock, alexa, docker, sqlite, pino";
const repoUrl = "https://github.com/Mithilesh71320/Homelabs-ops";
const videoUrl = "https://youtu.be/WzXVfQ6azf0";

async function main() {
  const wsUrl = `ws://127.0.0.1:9222/devtools/page/${targetId}`;
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  console.log('Filling Step 2: Project Details...');

  await send('Runtime.evaluate', {
    expression: `(() => {
      // 1. Description
      const descArea = document.querySelector('#software_description') || document.querySelector('textarea[name*="[description]"]');
      if (descArea) {
        descArea.value = ${JSON.stringify(description)};
        descArea.dispatchEvent(new Event('input', { bubbles: true }));
        descArea.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 2. Tag list (Built with)
      const tagInput = document.querySelector('#software_tag_list') || document.querySelector('input[name*="[tag_list]"]');
      if (tagInput) {
        tagInput.value = ${JSON.stringify(tags)};
        tagInput.dispatchEvent(new Event('input', { bubbles: true }));
        tagInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 3. Repo URL
      const urlInput = document.querySelector('#software_urls_attributes_0_url') || document.querySelector('input[name*="[urls_attributes][0][url]"]');
      if (urlInput) {
        urlInput.value = ${JSON.stringify(repoUrl)};
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        urlInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 4. Video demo URL
      const vidInput = document.querySelector('#software_video_url') || document.querySelector('input[name*="[video_url]"]');
      if (vidInput) {
        vidInput.value = ${JSON.stringify(videoUrl)};
        vidInput.dispatchEvent(new Event('input', { bubbles: true }));
        vidInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return {
        descSet: Boolean(descArea),
        tagsSet: Boolean(tagInput),
        urlSet: Boolean(urlInput),
        vidSet: Boolean(vidInput)
      };
    })()`,
    returnByValue: true
  });

  // Attach gallery photo
  console.log('Attaching gallery photo...');
  try {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const photoNode = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#software_photo_data, input[type="file"][name*="software_photo"]'
    });
    if (photoNode.nodeId) {
      await send('DOM.setFileInputFiles', {
        files: [galleryPhoto],
        nodeId: photoNode.nodeId
      });
      console.log('Gallery photo attached!');
    }
  } catch (err) {
    console.warn('Gallery photo attach failed, continuing...', err.message);
  }

  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Save & continue on Step 2...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('input[type="submit"][value*="Save"]') || document.querySelector('button[type="submit"]') || document.querySelector('#submit-button');
      if (btn) { btn.click(); return true; }
      return false;
    })()`
  });

  await new Promise(r => setTimeout(r, 4000));

  const pageInfo = await send('Runtime.evaluate', {
    expression: `({ title: document.title, url: location.href })`,
    returnByValue: true
  });
  console.log('Current page after step 2:', pageInfo.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('devpost_step3.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to devpost_step3.png');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
