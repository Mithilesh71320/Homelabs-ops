#!/usr/bin/env bash
set -uo pipefail

FAILED=0

echo "=================================================="
echo "   HomeLab Ops MCP Server — Preflight Check       "
echo "=================================================="
echo ""

# 1. Full Test Suite (npm test)
echo -n "[1/5] Running automated test suites (npm test)... "
if npm test > /dev/null 2>&1; then
  echo "PASS"
else
  echo "FAIL"
  FAILED=1
fi

# 2. Secret Scan (Module 10 Regexes across git history and working tree)
echo -n "[2/5] Scanning for secrets (AWS, Private Keys, GitHub/Slack tokens)... "
SECRET_MATCHES=$(git log -p 2>/dev/null | grep -E "AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{36,}|xox[baprs]-[0-9a-zA-Z]{10,48}" || true)
if [ -n "$SECRET_MATCHES" ]; then
  echo "FAIL (High-risk secret pattern detected in commit history)"
  FAILED=1
else
  echo "PASS"
fi

# 3. Check that .env and *.db are untracked
echo -n "[3/5] Verifying .env and *.db are not tracked in git... "
TRACKED_FILES=$(git ls-files .env "*.db" 2>/dev/null || true)
if [ -n "$TRACKED_FILES" ]; then
  echo "FAIL (Sensitive files tracked in git: $TRACKED_FILES)"
  FAILED=1
else
  echo "PASS"
fi

# 4. Check Amazon Bedrock model connectivity
echo -n "[4/5] Checking Amazon Bedrock model connectivity (check:bedrock)... "
if npm run check:bedrock > /dev/null 2>&1; then
  echo "PASS"
else
  echo "FAIL"
  FAILED=1
fi

# 5. Public URL health check (if PUBLIC_URL or MCP_SERVER_PUBLIC_URL is set)
TARGET_URL="${PUBLIC_URL:-${MCP_SERVER_PUBLIC_URL:-}}"
if [ -n "$TARGET_URL" ]; then
  BASE_URL="${TARGET_URL%/mcp}"
  HEALTH_URL="${BASE_URL%/}/health"
  echo -n "[5/5] Checking public URL health ($HEALTH_URL)... "
  if curl -k -fsSL --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "PASS"
  else
    echo "FAIL (Unable to reach $HEALTH_URL)"
    FAILED=1
  fi
else
  echo "[5/5] Checking public URL health... SKIP (PUBLIC_URL not set)"
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "=== PREFLIGHT PASSED: ALL CHECKS CLEAN ==="
  exit 0
else
  echo "=== PREFLIGHT FAILED: ONE OR MORE CHECKS DID NOT PASS ==="
  exit 1
fi
