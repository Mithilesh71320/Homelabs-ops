import fs from 'fs';

const targetId = process.argv[2] || '2398BC8C9C27CD33AA0E2C426DA16CD6';
const outFile = process.argv[3] || 'yt_screenshot.png';

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

  const res = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outFile, Buffer.from(res.data, 'base64'));
  console.log('Saved screenshot to ' + outFile);
  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
