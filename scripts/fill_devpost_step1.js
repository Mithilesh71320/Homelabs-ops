import fs from 'fs';
import path from 'path';

const targetId = '0586FAF530D88CFBE4D69F7444DE79B2';
const thumbnailPath = path.resolve('demo_video_build/frame_act1_intro.png');

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

  console.log('Filling Project Overview...');
  const title = "HomeLab Ops — Voice-Driven MCP Infrastructure";
  const tagline = "Intelligent, voice-driven operations assistant connecting Alexa and AI agents to Docker infrastructure with state-grounded OOM diagnosis and a 2-step safety gate.";

  await send('Runtime.evaluate', {
    expression: `(() => {
      const titleInput = document.querySelector('#participants_manage_project_overview_title') || document.querySelector('input[name*="[title]"]');
      if (titleInput) {
        titleInput.value = ${JSON.stringify(title)};
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const taglineInput = document.querySelector('#participants_manage_project_overview_tagline') || document.querySelector('textarea[name*="[tagline]"]');
      if (taglineInput) {
        taglineInput.value = ${JSON.stringify(tagline)};
        taglineInput.dispatchEvent(new Event('input', { bubbles: true }));
        taglineInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return { titleSet: Boolean(titleInput), taglineSet: Boolean(taglineInput) };
    })()`,
    returnByValue: true
  });

  // Set thumbnail file input
  console.log('Setting project thumbnail...');
  try {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const thumbNode = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#software-thumbnail-file-input, input[type="file"][name*="photo"]'
    });
    if (thumbNode.nodeId) {
      await send('DOM.setFileInputFiles', {
        files: [thumbnailPath],
        nodeId: thumbNode.nodeId
      });
      console.log('Thumbnail set successfully!');
    }
  } catch (err) {
    console.warn('Thumbnail set failed, continuing...', err.message);
  }

  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Save & continue on Step 1...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('input[type="submit"][value*="Save"]') || document.querySelector('button[type="submit"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()`
  });

  await new Promise(r => setTimeout(r, 3000));

  const pageInfo = await send('Runtime.evaluate', {
    expression: `({ title: document.title, url: location.href })`,
    returnByValue: true
  });
  console.log('Current page after step 1:', pageInfo.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('devpost_step2.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to devpost_step2.png');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
