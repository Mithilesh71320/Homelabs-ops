import fs from 'fs';

const targetId = '2398BC8C9C27CD33AA0E2C426DA16CD6';
const videoFilePath = 'E:\\web dev\\ship build amazon hackathon\\homelab-ops-mcp\\homelab_ops_demo.mp4';

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

  console.log('Clicking upload-icon...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#upload-icon') || document.querySelector('ytcp-icon-button[aria-label="Upload videos"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()`
  });

  console.log('Waiting 3 seconds for upload dialog...');
  await new Promise(r => setTimeout(r, 3000));

  // Find file input
  console.log('Finding file input in DOM...');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const fileInputNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]'
  });

  console.log('File input node ID:', fileInputNode.nodeId);

  if (fileInputNode.nodeId) {
    console.log('Setting file input to:', videoFilePath);
    await send('DOM.setFileInputFiles', {
      files: [videoFilePath],
      nodeId: fileInputNode.nodeId
    });
    console.log('File input set successfully!');
  } else {
    console.error('Could not find file input!');
  }

  console.log('Waiting 5 seconds for upload initiation...');
  await new Promise(r => setTimeout(r, 5000));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('yt_upload_status.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshot to yt_upload_status.png');

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
