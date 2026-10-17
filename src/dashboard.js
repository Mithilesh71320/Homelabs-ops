import { config } from './config.js';

export function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HomeLab Ops MCP Server</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 26, 44, 0.7);
      --card-border: rgba(60, 80, 120, 0.3);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --green: #10b981;
      --green-glow: rgba(16, 185, 129, 0.2);
      --purple: #a855f7;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #151f38 0%, var(--bg) 70%);
      color: var(--text);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      padding: 2.5rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      max-width: 1000px;
      width: 100%;
    }
    header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--green-glow);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: var(--green);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #fff 30%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-2px);
    }
    .card h2 {
      font-size: 1.25rem;
      color: #fff;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .info-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      font-size: 0.95rem;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 0.5rem;
    }
    .info-label { color: var(--text-muted); }
    .info-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
      font-size: 0.85rem;
      word-break: break-all;
    }
    .tools-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tool-pill {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #bae6fd;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }
    .tester-section {
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 1.75rem;
      backdrop-filter: blur(12px);
    }
    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin: 1rem 0;
    }
    button {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #fff;
      border: none;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }
    button:hover { opacity: 0.9; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .response-box {
      background: #050811;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      color: #38bdf8;
      max-height: 250px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
    footer {
      margin-top: 2.5rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">
        <span class="badge-dot"></span>
        <span>Operational & Ready</span>
      </div>
      <h1>HomeLab Ops MCP Server</h1>
      <p class="subtitle">Self-Hosted Model Context Protocol & Alexa Custom Skill Dual Gateway</p>
    </header>

    <div class="grid">
      <!-- Status Card -->
      <div class="card">
        <h2>⚡ Runtime Status</h2>
        <ul class="info-list">
          <li class="info-item">
            <span class="info-label">Host Binding</span>
            <span class="info-val">127.0.0.1:3000</span>
          </li>
          <li class="info-item">
            <span class="info-label">Protocol Spec</span>
            <span class="info-val">MCP 2025-11-25+</span>
          </li>
          <li class="info-item">
            <span class="info-label">AI Engine</span>
            <span class="info-val">Amazon Bedrock Converse</span>
          </li>
          <li class="info-item">
            <span class="info-label">Bedrock Model</span>
            <span class="info-val">${config.BEDROCK_MODEL_ID}</span>
          </li>
          <li class="info-item">
            <span class="info-label">Audit Engine</span>
            <span class="info-val">SQLite (AsyncLocalStorage)</span>
          </li>
        </ul>
      </div>

      <!-- Security Card -->
      <div class="card">
        <h2>🛡️ Hardened Security</h2>
        <ul class="info-list">
          <li class="info-item">
            <span class="info-label">OAuth 2.1 M2M</span>
            <span class="info-val">RFC 8414 & RFC 9728</span>
          </li>
          <li class="info-item">
            <span class="info-label">Confirmation Lock</span>
            <span class="info-val">120s TTL (Consume First)</span>
          </li>
          <li class="info-item">
            <span class="info-label">Alexa Signature</span>
            <span class="info-val">SHA-256 + 150s Window</span>
          </li>
          <li class="info-item">
            <span class="info-label">Rate Limiter</span>
            <span class="info-val">10 req/min token, 60 req/min API</span>
          </li>
          <li class="info-item">
            <span class="info-label">Fail-Soft Mode</span>
            <span class="info-val">Deterministic Fallback</span>
          </li>
        </ul>
      </div>

      <!-- Tools Card -->
      <div class="card" style="grid-column: 1 / -1;">
        <h2>🛠️ 9 Registered MCP Tools</h2>
        <div class="tools-list">
          <span class="tool-pill">ping (readOnly)</span>
          <span class="tool-pill">get_homelab_summary (readOnly)</span>
          <span class="tool-pill">get_container_status (readOnly)</span>
          <span class="tool-pill">get_container_logs (readOnly)</span>
          <span class="tool-pill">get_container_stats (readOnly)</span>
          <span class="tool-pill">diagnose_container_issue (readOnly, openWorld)</span>
          <span class="tool-pill">request_restart_container (destructive)</span>
          <span class="tool-pill">request_stop_container (destructive)</span>
          <span class="tool-pill">confirm_action (destructive)</span>
        </div>
      </div>
    </div>

    <!-- Live Tester Section -->
    <div class="tester-section">
      <h2>🧪 Live Endpoint Inspector</h2>
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0.25rem;">
        Click an endpoint below to test live JSON responses directly from this host:
      </p>
      <div class="btn-row">
        <button id="btnHealth" onclick="testEndpoint('/health')">GET /health</button>
        <button id="btnOAuthServer" onclick="testEndpoint('/.well-known/oauth-authorization-server')">GET OAuth Server Metadata</button>
        <button id="btnOAuthProtected" onclick="testEndpoint('/.well-known/oauth-protected-resource')">GET Protected Resource Metadata</button>
        <button id="btnMcpUnauth" onclick="testEndpoint('/mcp', { method: 'POST' })">POST /mcp (Expect Bare 401)</button>
      </div>
      <div class="response-box" id="responseBox">// Click a button above to run live inspection...</div>
    </div>

    <footer>
      HomeLab Ops MCP Server &bull; Hackathon Submission Ready &bull; MIT License
    </footer>
  </div>

  <script>
    async function testEndpoint(path, opts = {}) {
      const box = document.getElementById('responseBox');
      box.textContent = 'Requesting ' + path + '...';
      try {
        const start = performance.now();
        const res = await fetch(path, opts);
        const duration = Math.round(performance.now() - start);
        let data;
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        box.textContent = 'HTTP ' + res.status + ' ' + res.statusText + ' (' + duration + 'ms)\\n' +
          'Headers: ' + JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2) + '\\n\\n' +
          JSON.stringify(data, null, 2);
      } catch (err) {
        box.textContent = 'Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}
