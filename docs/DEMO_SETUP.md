# Demo Setup — homelab-ops-mcp Module 9

> **Goal**: A 3-minute live demo that ends with Alexa saying "demo-crashy ran out of memory" —
> confirmed by Portainer inspect data, not just log pattern-matching.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Docker Desktop (or Docker Engine) | 24.x |
| Node.js | 20.x |
| AWS credentials for Bedrock | `us-east-1` access to `anthropic.claude-3-5-haiku-20241022-v1:0` |
| Running Portainer | API token in `.env` |

---

## Environment variables (`.env`)

```env
PORTAINER_URL=https://portainer.example.com
PORTAINER_API_TOKEN=ptr_XXXXXXXXXXXXXXXXXXXXXXXXXX
PORTAINER_ENDPOINT_ID=1
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-haiku-20241022-v1:0
PORT=3095
```

---

## 3-Minute Demo Storyboard

### Step 0 — Start the demo environment (30 s)

```bash
npm run demo:up
```

Expected output:

```
✔ Container demo-web    Started
✔ Container demo-cache  Started
✔ Container demo-crashy Started
```

Verify all three are running in Portainer or with:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

### Step 1 — Ask Alexa for a health summary (30 s)

> **Say:** *"Alexa, ask Homelab Ops for a homelab summary"*

Expected response (all healthy):

> *"Your homelab has 3 containers: 3 running. All containers are healthy."*

**What to watch for:** `demo-crashy`, `demo-cache`, and `demo-web` are all up. No problems listed.

---

### Step 2 — Trigger the OOM crash (30 s)

```bash
npm run demo:crash
```

This sends `POST /leak` to `demo-crashy`. The container will allocate 8 MB every 200 ms until the Linux OOM killer fires. It takes about 20–30 s with the 64 MB limit.

Watch it die:

```bash
docker events --filter container=demo-crashy
```

You will see:

```
container oom  demo-crashy
container die  demo-crashy (exitCode=137)
```

---

### Step 3 — Verify the exit code in Portainer (10 s)

In the Portainer UI: **Containers → demo-crashy → Inspect**

Confirm:

```json
"State": {
  "Status": "exited",
  "ExitCode": 137,
  "OOMKilled": true
}
```

---

### Step 4 — Ask Alexa for a new summary (30 s)

> **Say:** *"Alexa, ask Homelab Ops for a homelab summary"*

Expected response (crashy flagged):

> *"Your homelab has 3 containers: 2 running, 1 stopped. Problem containers: demo-crashy."*

**What changed:** `demo-crashy` exited with code 137, so it is now a problem. The two healthy containers are still running.

---

### Step 5 — Diagnose the crashed container via voice (30 s)

> **Say:** *"Alexa, ask Homelab Ops to diagnose demo-crashy"*

Expected response (Bedrock + state grounding):

> *"demo-crashy crashed because it ran out of memory and was killed by the operating system. I recommend increasing the container memory limit or reducing memory usage in the application."*

**Key proof point:** The word *"out of memory"* or *"memory"* is in the response because the system prompt injected `oomKilled: true` as a CRITICAL FACT before calling Bedrock.

If Bedrock is unavailable, the fallback response will still say:

> *"…demo-crashy was killed by the out-of-memory killer (exit code 137)…"*

---

### Step 6 — Restart the container with two-step confirmation (30 s)

> **Say:** *"Alexa, ask Homelab Ops to restart demo-crashy"*

Alexa confirms:

> *"Are you sure you want to restart demo-crashy? Say yes to confirm."*

> **Say:** *"Yes"*

Alexa confirms:

> *"demo-crashy has been restarted."*

Verify in Portainer that `demo-crashy` is running again.

---

### Step 7 — Check the audit log (30 s)

```bash
node -e "
import { createRequire } from 'module';
const r = createRequire(import.meta.url);
const db = r('better-sqlite3')('homelab.db');
const rows = db.prepare(\"SELECT timestamp, tool_name, target, status, source FROM audit_log ORDER BY id DESC LIMIT 10\").all();
console.table(rows);
db.close();
" --input-type=module
```

You should see rows with:
- `tool_name = get_homelab_summary`, `source = alexa-skill`
- `tool_name = diagnose_container_issue`, `source = alexa-skill`
- `tool_name = confirm_action`, `source = alexa-skill`, `status = success`

This confirms `AsyncLocalStorage` propagated the `source` tag through every async boundary.

---

### Step 8 — Tear down (10 s)

```bash
npm run demo:down
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `demo-crashy` never gets OOM-killed | Check `mem_limit: 64m` is in `docker-compose.yml` and Docker has memory enforcement enabled |
| Portainer shows no containers | Verify `PORTAINER_ENDPOINT_ID` matches the environment in Portainer |
| Bedrock returns 403 | Ensure IAM role has `bedrock:InvokeModel` on `arn:aws:bedrock:us-east-1::foundation-model/anthropic.*` |
| CPU % shows 0 on first call | Expected — the service auto-retakes a second sample if `precpu_stats` is empty |

---

## Checking the Definition of Done

| Criterion | How to verify |
|---|---|
| Summary healthy before crash | Step 1 above |
| `demo-crashy` exits 137 / OOMKilled=true within ~30s | Step 2–3 |
| Diagnosis says "out of memory" | Step 5 |
| Restart works; audit log shows source = 'alexa-skill' | Steps 6–7 |
| `npm test` passes | `npm test` |
| `npm run e2e:mcp` passes against real Portainer | Separate live run |
