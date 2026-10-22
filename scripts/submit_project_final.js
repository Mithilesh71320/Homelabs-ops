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

  console.log('Agreeing to terms & conditions...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cb = document.querySelector('#participants_manage_finalization_accepts_terms');
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  console.log('Clicking "Submit project" button...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button[type="submit"]')).find(b => b.innerText.includes('Submit project')) || document.querySelector('button[type="submit"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`
  });

  console.log('Waiting 5 seconds for submission confirmation...');
  await new Promise(r => setTimeout(r, 5000));

  const pageInfo = await send('Runtime.evaluate', {
    expression: `({ title: document.title, url: location.href })`,
    returnByValue: true
  });
  console.log('Final page after submission:', pageInfo.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('devpost_submitted_success.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to devpost_submitted_success.png');

  ws.close();
}

main().catch(console.error);
