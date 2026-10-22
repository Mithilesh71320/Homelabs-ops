import fs from 'fs';

const targetId = '2398BC8C9C27CD33AA0E2C426DA16CD6';

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

  console.log('Fixing description text (removing angle brackets)...');
  const cleanDesc = `HomeLab Ops is a hardened, self-hosted Model Context Protocol (MCP) server bridging Amazon Alexa voice interactions and AI agents to local Docker infrastructure.

- Fleet Health Summaries (under 295 chars)
- State-Grounded OOM Kill Root-Cause Diagnosis (Exit Code 137)
- Human-in-the-Loop Confirmation Gate (120s ephemeral tokens)
- Streamable HTTP MCP (Spec 2025-11-25) + OAuth 2.1
- Zero-Trust Loopback Binding (127.0.0.1:3000)

Built for Build, Ship, Shape: Amazon Developer Hackathon 2026.
Open Source Package: mcp-confirm-gate`;

  await send('Runtime.evaluate', {
    expression: `(() => {
      const descBox = document.querySelector('#description-textarea #textbox') || document.querySelector('ytcp-social-suggestions-textbox[label*="Description" i] #textbox');
      if (descBox) {
        descBox.focus();
        descBox.innerText = ${JSON.stringify(cleanDesc)};
        descBox.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Scroll down to select Not made for kids
      const notForKids = document.querySelector('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]') || document.querySelector('#not-made-for-kids');
      if (notForKids) {
        notForKids.click();
      }

      return { descCleaned: true };
    })()`
  });

  await new Promise(r => setTimeout(r, 1500));

  // Click Next
  for (let i = 1; i <= 3; i++) {
    console.log(`Clicking Next (${i}/3)...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const nextBtn = document.querySelector('#next-button') || document.querySelector('ytcp-button#next-button');
        if (nextBtn) { nextBtn.click(); return true; }
        return false;
      })()`
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Setting Visibility to Public...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const pub = document.querySelector('tp-yt-paper-radio-button[name="PUBLIC"]') || document.querySelector('#first-container [name="PUBLIC"]');
      if (pub) { pub.click(); return true; }
      return false;
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Publish/Save button...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const doneBtn = document.querySelector('#done-button') || document.querySelector('ytcp-button#done-button');
      if (doneBtn) { doneBtn.click(); return true; }
      return false;
    })()`
  });

  await new Promise(r => setTimeout(r, 4000));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('yt_final_published.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to yt_final_published.png');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
