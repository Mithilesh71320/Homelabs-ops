import { config } from './config.js';

export function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HomeLab Ops MCP Server & Alexa Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 26, 44, 0.7);
      --card-border: rgba(60, 80, 120, 0.3);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.2);
      --alexa-blue: #00caef;
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
      max-width: 1040px;
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
      font-size: 2.4rem;
      font-weight: 700;
      background: linear-gradient(135deg, #fff 30%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.05rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
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
      transition: border-color 0.2s;
    }
    .card:hover {
      border-color: rgba(56, 189, 248, 0.4);
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

    /* Alexa Simulator Section */
    .alexa-simulator {
      background: linear-gradient(180deg, rgba(14, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.95) 100%);
      border: 1px solid rgba(0, 202, 239, 0.35);
      border-radius: 1.25rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 12px 40px rgba(0, 202, 239, 0.1);
    }
    .alexa-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 1rem;
    }
    .alexa-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .alexa-icon {
      width: 44px;
      height: 44px;
      background: radial-gradient(circle, #00caef 0%, #007799 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 1.4rem;
      box-shadow: 0 0 16px rgba(0, 202, 239, 0.4);
    }
    .alexa-ring {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--alexa-blue);
      box-shadow: 0 0 12px var(--alexa-blue);
      animation: ringGlow 1.8s infinite ease-in-out;
    }
    @keyframes ringGlow {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.4; }
    }
    .utterance-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .alexa-btn {
      background: rgba(0, 202, 239, 0.08);
      border: 1px solid rgba(0, 202, 239, 0.3);
      color: #e0f2fe;
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-family: 'Outfit', sans-serif;
      font-weight: 500;
      font-size: 0.95rem;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .alexa-btn:hover {
      background: rgba(0, 202, 239, 0.2);
      border-color: var(--alexa-blue);
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0, 202, 239, 0.2);
    }
    .alexa-speech-bubble {
      background: #060a14;
      border: 1px solid rgba(0, 202, 239, 0.25);
      border-radius: 12px;
      padding: 1.25rem;
      min-height: 80px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
    }
    .speech-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--alexa-blue);
      margin-bottom: 0.35rem;
      font-weight: 600;
    }
    .speech-text {
      font-size: 1.15rem;
      color: #fff;
      line-height: 1.5;
      font-weight: 400;
    }
    .meta-tags {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      flex-wrap: wrap;
    }
    .meta-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.06);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      color: var(--text-muted);
    }
    .meta-tag.success { color: #34d399; }

    /* Endpoint Tester Section */
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
    button.raw-btn {
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
    button.raw-btn:hover { opacity: 0.9; transform: translateY(-1px); }
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
      <h1>HomeLab Ops Gateway</h1>
      <p class="subtitle">Live Model Context Protocol (MCP) & Alexa Voice Dual Gateway</p>
    </header>

    <!-- LIVE ALEXA SKILL SIMULATOR -->
    <div class="alexa-simulator">
      <div class="alexa-header">
        <div class="alexa-title">
          <div class="alexa-icon">A</div>
          <div>
            <h2 style="font-size: 1.4rem; color: #fff;">Alexa Voice Skill Simulator</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Click an utterance below to simulate live Alexa voice interaction with verified ASK schema validation</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.85rem; color: var(--alexa-blue);">Echo Active</span>
          <div class="alexa-ring"></div>
        </div>
      </div>

      <div class="utterance-grid">
        <button id="btnAlexaLaunch" class="alexa-btn" onclick="sendAlexa('LaunchRequest')">
          🎙️ "Alexa, open HomeLab Ops"
        </button>
        <button id="btnAlexaSummary" class="alexa-btn" onclick="sendAlexa('GetHomelabSummaryIntent')">
          🎙️ "Ask for homelab summary"
        </button>
        <button id="btnAlexaStatus" class="alexa-btn" onclick="sendAlexa('GetContainerStatusIntent')">
          🎙️ "Check container status"
        </button>
        <button id="btnAlexaRestart" class="alexa-btn" onclick="sendAlexa('RestartContainerIntent', { container_name: 'plex-server' })">
          🎙️ "Restart plex-server"
        </button>
        <button id="btnAlexaYes" class="alexa-btn" onclick="sendAlexa('AMAZON.YesIntent')">
          🎙️ "Yes, confirm action"
        </button>
        <button id="btnAlexaNo" class="alexa-btn" onclick="sendAlexa('AMAZON.NoIntent')">
          🎙️ "No, cancel"
        </button>
        <button id="btnAlexaDiagnose" class="alexa-btn" onclick="sendAlexa('DiagnoseContainerIntent', { container_name: 'crashed-app' })">
          🎙️ "Diagnose crashed container"
        </button>
        <button id="btnAlexaStop" class="alexa-btn" onclick="sendAlexa('SessionEndedRequest')">
          ⏹️ "Session Ended"
        </button>
      </div>

      <div class="alexa-speech-bubble" id="speechBubble">
        <div class="speech-label" id="speechLabel">Alexa Response</div>
        <div class="speech-text" id="speechText">Click an utterance button above to speak to HomeLab Ops...</div>
        <div class="meta-tags" id="speechMeta">
          <span class="meta-tag">Status: Ready</span>
          <span class="meta-tag">Speech Mode: SSML</span>
        </div>
      </div>
    </div>

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
      <h2>🧪 Live Endpoint & Raw JSON Inspector</h2>
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0.25rem;">
        Inspect raw JSON payloads for MCP protocol discovery and negative authentication checks:
      </p>
      <div class="btn-row">
        <button id="btnHealth" class="raw-btn" onclick="testEndpoint('/health')">GET /health</button>
        <button id="btnOAuthServer" class="raw-btn" onclick="testEndpoint('/.well-known/oauth-authorization-server')">GET OAuth Server Metadata</button>
        <button id="btnOAuthProtected" class="raw-btn" onclick="testEndpoint('/.well-known/oauth-protected-resource')">GET Protected Resource Metadata</button>
        <button id="btnMcpUnauth" class="raw-btn" onclick="testEndpoint('/mcp', { method: 'POST' })">POST /mcp (Expect Bare 401)</button>
      </div>
      <div class="response-box" id="responseBox">// Click a button above to run live inspection...</div>
    </div>

    <footer>
      HomeLab Ops MCP Server &bull; Hackathon Submission Ready &bull; MIT License
    </footer>
  </div>

  <script>
    let activeSessionAttributes = {};

    async function sendAlexa(typeOrIntent, slots = {}) {
      const speechLabel = document.getElementById('speechLabel');
      const speechText = document.getElementById('speechText');
      const speechMeta = document.getElementById('speechMeta');
      const box = document.getElementById('responseBox');

      speechLabel.textContent = 'Processing voice request...';
      speechText.textContent = 'Contacting HomeLab Ops...';

      let requestObj;
      if (typeOrIntent === 'LaunchRequest' || typeOrIntent === 'SessionEndedRequest') {
        requestObj = {
          type: typeOrIntent,
          requestId: 'req.' + Math.random().toString(36).substring(2, 10),
          timestamp: new Date().toISOString(),
          locale: 'en-US'
        };
      } else {
        requestObj = {
          type: 'IntentRequest',
          requestId: 'req.' + Math.random().toString(36).substring(2, 10),
          timestamp: new Date().toISOString(),
          locale: 'en-US',
          intent: {
            name: typeOrIntent,
            confirmationStatus: 'NONE',
            slots: Object.fromEntries(
              Object.entries(slots).map(([k, v]) => [k, { name: k, value: v }])
            )
          }
        };
      }

      const envelope = {
        version: '1.0',
        session: {
          new: typeOrIntent === 'LaunchRequest',
          sessionId: 'SessionId.browser-sim-' + Date.now(),
          application: { applicationId: 'amzn1.ask.skill.browser-simulator-id' },
          attributes: activeSessionAttributes,
          user: { userId: 'amzn1.ask.account.browser-user' }
        },
        context: {
          System: {
            application: { applicationId: 'amzn1.ask.skill.browser-simulator-id' }
          }
        },
        request: requestObj
      };

      try {
        const start = performance.now();
        const res = await fetch('/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Alexa-Simulator': 'true'
          },
          body: JSON.stringify(envelope)
        });
        const duration = Math.round(performance.now() - start);
        const data = await res.json();

        // Update active session attributes
        if (data.sessionAttributes) {
          activeSessionAttributes = data.sessionAttributes;
        }

        // Extract spoken speech from SSML
        const rawSsml = data?.response?.outputSpeech?.ssml || '';
        const cleanSpoken = rawSsml.replace(/<[^>]+>/g, '').trim() || (typeOrIntent === 'SessionEndedRequest' ? '(Session closed successfully with empty response)' : 'Done.');

        speechLabel.textContent = 'Alexa Spoken Output (' + duration + 'ms)';
        speechText.textContent = cleanSpoken;

        const endSession = Boolean(data?.response?.shouldEndSession);
        const hasPending = Boolean(activeSessionAttributes?.pending_action_id);

        speechMeta.innerHTML = 
          '<span class="meta-tag success">HTTP ' + res.status + ' OK</span>' +
          '<span class="meta-tag ' + (endSession ? '' : 'success') + '">Mic: ' + (endSession ? 'Closed' : 'Listening...') + '</span>' +
          (hasPending ? '<span class="meta-tag" style="color: #f59e0b;">Pending Action Lock: ' + activeSessionAttributes.pending_action_id.substring(0, 8) + '...</span>' : '') +
          '<span class="meta-tag">Schema: ASK v1.0</span>';

        box.textContent = '// Alexa JSON Response (' + typeOrIntent + '):\\n' + JSON.stringify(data, null, 2);

        // Optional browser speech synthesis
        if ('speechSynthesis' in window && cleanSpoken && !cleanSpoken.startsWith('(')) {
          const utterance = new SpeechSynthesisUtterance(cleanSpoken);
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
        }
      } catch (err) {
        speechLabel.textContent = 'Error';
        speechText.textContent = 'Failed: ' + err.message;
        speechMeta.innerHTML = '<span class="meta-tag" style="color: #ef4444;">' + err.message + '</span>';
      }
    }

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
