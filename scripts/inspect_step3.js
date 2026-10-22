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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const tracks = Array.from(document.querySelectorAll('input[type="checkbox"]'))
        .filter(cb => cb.name.includes('[4]'))
        .map(cb => ({ id: cb.id, value: cb.value, label: cb.closest('label')?.innerText.trim() }));

      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        id: s.id,
        name: s.name,
        label: s.labels?.[0]?.innerText || s.closest('label')?.innerText || s.previousElementSibling?.innerText,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
      }));

      return { tracks, selects };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
