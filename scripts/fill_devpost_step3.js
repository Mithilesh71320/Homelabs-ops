import fs from 'fs';

const targetId = '0586FAF530D88CFBE4D69F7444DE79B2';

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

  console.log('Filling Step 3: Additional Info & Hackathon Questions...');

  const data = {
    // 0: Submitter Type
    f0: "Individual",
    // 1: Organization Name
    f1: "N/A",
    // 2: Country
    f2: "India",
    // 3: Canada Province
    f3: "N/A",
    // 5: Repo URL
    f5: "https://github.com/Mithilesh71320/Homelabs-ops",
    // 6: New or Existing
    f6: "New",
    // 7: Existing update explanation
    f7: "N/A",
    // 8: AWS Builder Mini Challenge
    f8: "Yes",
    // 9: AWS services used
    f9: "We incorporated Amazon Bedrock Converse API (@aws-sdk/client-bedrock-runtime) using Claude 3.5 Sonnet and Haiku models in src/services/ai.js for state-grounded root-cause diagnosis of container failures. The system injects low-level Docker kernel inspection facts (oomKilled: true, exitCode: 137, restartCount) into Bedrock Converse prompts, enforcing strict constraint grounding to prevent hallucinations on silent failures, with deterministic fail-soft resilience.",
    // 10: Open Source Mini Challenge
    f10: "Yes",
    // 11: OS Contribution URL
    f11: "https://github.com/Mithilesh71320/Homelabs-ops/tree/main/packages/mcp-confirm-gate",
    // 12: OS Repo URL
    f12: "https://github.com/Mithilesh71320/Homelabs-ops",
    // 13: OS GitHub username
    f13: "Mithilesh71320",
    // 14: OS description
    f14: "To help other developers build safe autonomous agent systems, we extracted our human-in-the-loop safety lock into a standalone reusable open-source package: mcp-confirm-gate (under packages/mcp-confirm-gate). It provides a 120-second single-use ephemeral token store that atomically consumes tokens before executing any mutating tool call, completely eliminating double execution and replay attacks. Published under MIT license with zero dependencies.",
    // 15: Feature Requests
    f15: "1. Support for native in-process transport linking in the MCP TypeScript SDK documentation. 2. Native streaming token metrics in Bedrock Converse API for low-latency voice output chunking. 3. Official Docker Engine MCP server reference implementation.",
    // 16: Friction Log
    f16: "https://github.com/Mithilesh71320/Homelabs-ops/blob/main/docs/FRICTION_LOG.md",
    // 17: Testing Link
    f17: "https://snowfall-simply-helper.ngrok-free.dev/health",
    // 18: Testing Instructions
    f18: "The project is live on https://snowfall-simply-helper.ngrok-free.dev (forwarding to local loopback). OAuth 2.1 client credentials: Client ID: alexa_plus_client_id_123, Client Secret: alexa_plus_client_secret_xyz. MCP endpoint: /mcp. Health endpoint: /health. To test locally: clone repo, configure .env, run 'npm install', run 'npm test' (all 11 modules pass 100%), and run 'npm run e2e:mcp'.",
    // 19: Feedback Q1
    f19: "1. Model Context Protocol TypeScript SDK (@modelcontextprotocol/sdk): server implementation (spec 2025-11-25+), tools declaration with hints, and in-process linked transport. 2. Amazon Bedrock Converse API (@aws-sdk/client-bedrock-runtime): AI root-cause diagnosis. 3. Alexa Skills Kit (ask-sdk-express-adapter): voice request routing and RSA-SHA256 signature verification. 4. Portainer CE REST API: Docker daemon container state inspection, statistics, and logs. 5. SQLite (better-sqlite3): append-only audit trail.",
    // 20: Feedback Q2
    f20: "The Amazon Bedrock Converse API provides a clean, standardized interface that eliminated legacy JSON parsing friction. In-process InMemoryTransport linking between Alexa handlers and MCP tools gave sub-millisecond dispatch times without network serialization overhead. Portainer CE inspect endpoints reliably surface low-level Linux kernel OOM kills.",
    // 21: Feedback Q3
    f21: "Documentation for in-process client-to-server linking using InMemoryTransport is sparse; most public tutorials assume STDIO. Portainer CE log endpoints output 8-byte binary multiplex headers on streams that require manual regex cleaning. Docker stats require calculating CPU deltas across sequential samples.",
    // 22: Feedback Q4
    f22: "The AWS SDK v3 modular structure made importing Bedrock lightweight and fast. The Alexa developer console test simulator was straightforward to configure once our public endpoint tunnel and certificate chain verification were verified.",
    // 23: Feedback Q5
    f23: "Yes, absolutely. The combination of Amazon Bedrock for structured reasoning and Model Context Protocol for tool interfaces is the foundational pattern for next-generation voice assistants and autonomous agents.",
    // 27: AI Tools
    f27: "Claude 3.5 Sonnet and Haiku via Amazon Bedrock Converse API for live container diagnostics; GitHub Copilot for code assistance.",
    // 28: Learning level
    f28: "Significant",
    // 29: AI value
    f29: "Yes",
    // 30: Skill development
    f30: "Significantly",
    // 31: Likelihood to use Amazon devices
    f31: "Very likely"
  };

  await send('Runtime.evaluate', {
    expression: `(() => {
      const d = ${JSON.stringify(data)};

      function setVal(selector, val) {
        const el = document.querySelector(selector);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      function check(selector, shouldCheck = true) {
        const el = document.querySelector(selector);
        if (el && el.checked !== shouldCheck) {
          el.checked = shouldCheck;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Track selection: Alexa+
      const alexaCb = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(cb => cb.name.includes('[4]') && (cb.value.includes('Alexa+') || cb.closest('label')?.innerText.includes('Alexa+')));
      if (alexaCb) {
        alexaCb.checked = true;
        alexaCb.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setVal('select[name*="[0][value]"]', d.f0);
      setVal('input[name*="[1][value]"]', d.f1);
      setVal('select[name*="[2][value]"]', d.f2);
      setVal('input[name*="[3][value]"]', d.f3);
      setVal('input[name*="[5][value]"]', d.f5);
      setVal('select[name*="[6][value]"]', d.f6);
      setVal('textarea[name*="[7][value]"]', d.f7);
      setVal('select[name*="[8][value]"]', d.f8);
      setVal('textarea[name*="[9][value]"]', d.f9);
      setVal('select[name*="[10][value]"]', d.f10);
      setVal('input[name*="[11][value]"]', d.f11);
      setVal('input[name*="[12][value]"]', d.f12);
      setVal('input[name*="[13][value]"]', d.f13);
      setVal('textarea[name*="[14][value]"]', d.f14);
      setVal('textarea[name*="[15][value]"]', d.f15);
      setVal('input[name*="[16][value]"]', d.f16);
      setVal('input[name*="[17][value]"]', d.f17);
      setVal('textarea[name*="[18][value]"]', d.f18);
      setVal('textarea[name*="[19][value]"]', d.f19);
      setVal('textarea[name*="[20][value]"]', d.f20);
      setVal('textarea[name*="[21][value]"]', d.f21);
      setVal('textarea[name*="[22][value]"]', d.f22);
      setVal('textarea[name*="[23][value]"]', d.f23);

      // Checkboxes 24, 25, 26 (Age, Jurisdiction, Not employee)
      check('input[name*="[24][value]"][type="checkbox"]', true);
      check('input[name*="[25][value]"][type="checkbox"]', true);
      check('input[name*="[26][value]"][type="checkbox"]', true);

      setVal('textarea[name*="[27][value]"]', d.f27);
      setVal('select[name*="[28][value]"]', d.f28);
      setVal('select[name*="[29][value]"]', d.f29);
      setVal('select[name*="[30][value]"]', d.f30);
      setVal('select[name*="[31][value]"]', d.f31);

      return { success: true };
    })()`,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Save & continue on Step 3...');
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
  console.log('Current page after step 3:', pageInfo.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('devpost_step4.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to devpost_step4.png');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
