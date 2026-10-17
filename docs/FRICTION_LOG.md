# Friction Log — HomeLab Ops

> **Document Type:** Developer Friction Log  
> **Source Evidence:** Pre-filled exclusively from documented technical hurdles in [`docs/DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md). Each entry is tagged `DRAFT - author to verify`.

---

### Entry 1: Portainer Docker Log Binary Header Multiplexing
- **Status:** DRAFT - author to verify
- **Task Attempted:** Retrieve clean container tail logs via Portainer REST API and speak them to the user / feed them to Bedrock.
- **Steps Taken:** Sent `GET /api/endpoints/:id/docker/containers/:name/logs?stdout=true&stderr=true&tail=50`.
- **Expected vs Actual:**
  - *Expected:* Clean UTF-8 plaintext log stream.
  - *Actual:* Docker returns raw binary-multiplexed frames with 8-byte headers containing non-printable ASCII control characters (`\x00-\x1F`), causing string mangling and JSON parsing errors.
- **Severity:** Medium
- **Workaround:** Implemented `cleanDockerLogs(rawLogs)` in `src/services/portainer.js` using regex stripping `str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()`.
- **Actionable Suggestion:** Portainer API should offer a query parameter (e.g. `?demux=true` or `?clean=true`) to return clean UTF-8 text directly.

---

### Entry 2: Docker Stats Cold-Sample CPU Delta Reading (100% or 0% Glitch)
- **Status:** DRAFT - author to verify
- **Task Attempted:** Compute accurate live CPU percentage for running containers via `GET /stats?stream=false`.
- **Steps Taken:** Applied standard Docker formula `((cpu_delta / system_delta) * online_cpus * 100)` against a single stats snapshot.
- **Expected vs Actual:**
  - *Expected:* Realistic CPU usage percentage (e.g. 1.2% for idle, 45% for loaded).
  - *Actual:* On cold first calls, `precpu_stats.cpu_usage.total_usage` is `0` or unpopulated by the Docker daemon, resulting in either a division-by-zero or an erroneous 100% reading.
- **Severity:** High
- **Workaround:** Updated `getContainerStats` in `src/services/portainer.js` to inspect `precpu_stats`. If empty, it waits 1000ms and takes a second snapshot to calculate a valid delta.
- **Actionable Suggestion:** Docker Engine and Portainer should either return a precomputed average CPU percentage or populate `precpu_stats` from historical daemon samples.

---

### Entry 3: Unhandled OOM Kill State During Bedrock Log Diagnosis
- **Status:** DRAFT - author to verify
- **Task Attempted:** Use Amazon Bedrock to diagnose why a crashed container exited.
- **Steps Taken:** Passed container log tail directly to Bedrock Converse API for analysis.
- **Expected vs Actual:**
  - *Expected:* Bedrock explains that the container ran out of memory.
  - *Actual:* When the Linux kernel OOM killer fires, the process receives `SIGKILL` (exit 137) immediately without writing a fatal stack trace to stdout/stderr. Bedrock had empty logs and hallucinated generic configuration errors.
- **Severity:** High
- **Workaround:** Added `getContainerState(containerName)` to fetch Docker inspect data. Injected state facts (`OOMKilled: true`, exit code 137) as unalterable `GROUND TRUTH` in Bedrock's system prompt and prompt body.
- **Actionable Suggestion:** AI diagnostic tools should never rely solely on logs; they must correlate process exit codes and kernel state metrics before invoking language models.

---

### Entry 4: Alexa SSML Protocol Violations from Log Characters
- **Status:** DRAFT - author to verify
- **Task Attempted:** Speak container diagnosis and logs to the user via Alexa output speech.
- **Expected vs Actual:**
  - *Expected:* Alexa speaks the diagnostic message normally.
  - *Actual:* Alexa returned protocol violation errors and closed the session abruptly whenever logs or container names contained XML-sensitive characters like `&`, `<`, `>`, `"`, or `'`.
- **Severity:** High
- **Workaround:** Implemented `escapeSSML(text)` in `src/alexa/adapter.js` to escape reserved XML entities and convert line breaks into standard `<break time="300ms"/>` tags.
- **Actionable Suggestion:** ASK SDK should provide an automatic SSML sanitizer method on response builders rather than failing silently or throwing a schema protocol violation.

---

### Entry 5: ASK SDK Express Adapter Mutating Request Body
- **Status:** DRAFT - author to verify
- **Task Attempted:** Enforce Amazon request signature verification using `SkillRequestSignatureVerifier` in Express.
- **Steps Taken:** Placed `express.json()` before the Alexa request handler.
- **Expected vs Actual:**
  - *Expected:* Verifier reads the request stream and validates the Amazon cryptographic signature.
  - *Actual:* `express.json()` consumed and parsed the request stream, leaving no raw body for the cryptographic verifier and causing signature validation to fail with HTTP 400.
- **Severity:** Medium
- **Workaround:** Configured `express.json({ verify: (req, res, buf) => { req.rawBody = buf ? buf.toString('utf8') : ''; } })` to retain the unmutated raw body for signature verification.
- **Actionable Suggestion:** `ask-sdk-express-adapter` documentation should prominently highlight the raw body capture requirement in its standard Express setup examples.

---

### Entry 6: Express Rate Limit IPv6 Key Generator Validation
- **Status:** DRAFT - author to verify
- **Task Attempted:** Rate limit the `/token` and `/mcp` endpoints using `express-rate-limit`.
- **Steps Taken:** Used a custom `keyGenerator` reading `req.headers['cf-connecting-ip'] || req.ip`.
- **Expected vs Actual:**
  - *Expected:* Rate limiter tracks requests per client IP.
  - *Actual:* `express-rate-limit` v8 threw an unhandled validation error regarding IPv6 address formatting on loopback (`::1` / `127.0.0.1`).
- **Severity:** Medium
- **Workaround:** Added `validate: false` to rate limiter options and bound the Express server explicitly to `127.0.0.1`.
- **Actionable Suggestion:** `express-rate-limit` should handle standard Node.js loopback IPv6 addresses without requiring explicit validation bypass flags.

---

### Entry 7: One-Shot Completed Jobs Flagged as Homelab Failures
- **Status:** DRAFT - author to verify
- **Task Attempted:** Provide a quick high-level homelab health summary via `get_homelab_summary`.
- **Steps Taken:** Counted all stopped containers as problems.
- **Expected vs Actual:**
  - *Expected:* Only crashed or failed containers are reported as problems.
  - *Actual:* Normal batch jobs (e.g., `backup-job` exiting with code 0) were flagged as problem containers, causing false alarms.
- **Severity:** Low
- **Workaround:** Updated `src/mcp/handlers.js` to extract exit codes. Containers with `Exited (0)` are counted as `completed` and excluded from the problem list.
- **Actionable Suggestion:** Container management tools should always differentiate between stopped exit 0 (successful completion) and stopped nonzero (failure).
