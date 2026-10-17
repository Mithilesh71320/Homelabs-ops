# Fresh Clone Verification Notes

**Date**: 2026-10-17  
**Platform**: Windows 11 x64  
**Runtime**: Node.js v24.13.0 / npm 11.2.0  
**Target Repository**: `homelab-ops-mcp` (Branch: `feature/module-11-final-hardening`)

---

## 1. Fresh Clone Execution Log

### Step 1: Repository Clone
- **Action**: Cloned repository into an isolated temporary folder:
  `C:\Users\MITHILESH UBALE\AppData\Local\Temp\homelab-clone-9c985b1e-a554-49a6-83d6-e9bbfb893723`
- **Result**: Clean clone completed with 0 errors.

### Step 2: Dependency Installation (`npm ci` / `npm install`)
- **Action**: Ran `npm ci` from clean directory.
- **Observation / Friction Point**:
  - `better-sqlite3` native add-on build: On Node.js v24 under Windows, precompiled prebuild binaries were not yet available for Node ABI v137. The installer attempted to build from source via `node-gyp`.
  - If Microsoft Visual Studio C++ Build Tools and Python are not present in the environment PATH, the compile step fails.
  - On Node.js v20.x LTS or v22.x LTS, precompiled binaries are downloaded directly by `prebuild-install`, completing `npm ci` in seconds with zero build tool dependencies.
- **Resolution**:
  - Updated `README.md` Prerequisites to explicitly recommend **Node.js v20.x or v22.x LTS** for straightforward out-of-the-box installation without native compilation toolchains.

### Step 3: Environment Setup (`cp .env.example .env`)
- **Action**: Copied `.env.example` to `.env`.
- **Observation**:
  - `.env.example` contains all required configuration parameters, including the new `BEDROCK_MODEL_ID` and OAuth variables.
  - `npm test` runs with self-contained test environment fixtures and mock servers, so running test suites does not require active Portainer or AWS accounts.
  - For live execution with real AWS Bedrock and Portainer instances, real credentials must be populated.

### Step 4: Full Test Suite Execution (`npm test`)
- **Action**: Executed `npm test`.
- **Observations & Fixes**:
  1. **Cold-Start Port Listen Latency**: Under Windows cold file cache, loading the `@aws-sdk/client-bedrock-runtime` modular ESM dependencies inside the spawned test process took ~4.3 seconds. The retry loop in `test_module2.js` (20 retries × 300ms = 6s) was close to timing out under heavy system load. Increased retry count to 40 iterations (12s timeout) to guarantee flaky-free execution on all environments.
  2. **Module 5 Fallback Verification**: In `test_module5.js`, the fallback assertion was updated to match the Module 11 deterministic diagnosis label (`"Generated without AI (Bedrock unavailable)"`).
- **Result**:
  - All test suites (`test_module2.js` through `test_module11.js`) PASSED with 100% pass rate.

### Step 5: E2E Protocol Proof Execution (`npm run e2e:mcp`)
- **Action**: Tested running `npm run e2e:mcp`.
- **Observation**:
  - `npm run e2e:mcp` (which executes `scripts/e2e_mcp_proof.js`) connects to `http://127.0.0.1:3000/mcp` or `MCP_SERVER_PUBLIC_URL`.
  - When executed as a standalone CLI command, it expects the server process to be running in another terminal (or background).
  - When executed as part of `test_module8.js`, the test harness automatically starts the server with OAuth enabled, executes all 11 proof steps against localhost, and cleanly terminates the server.
- **Resolution**:
  - Clarified README Quick Start: Start the server via `npm start` in Terminal 1 before running `npm run e2e:mcp` in Terminal 2.

---

## 2. Summary of Documentation Fixes Applied

1. **Node Version Requirement**: Updated `README.md` to specify Node.js v20.x / v22.x LTS as recommended.
2. **E2E Execution Instructions**: Added explicit 2-terminal guidance in Quick Start for running `npm run e2e:mcp` manually.
3. **Bedrock Check Instructions**: Added documentation for `npm run check:bedrock` and the fail-soft deterministic diagnosis mechanism.
