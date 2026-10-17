# Author To-Do Inventory (Submission Readiness)

**Target Hackathon Deadline**: October 23, 2026  
**Status**: Pre-submission audit of items requiring author credentials, physical accounts, or subjective input.

---

## Action Items Inventory

| # | File & Line | What Only Author Can Supply | Priority | Notes / Context |
|---|---|---|---|---|
| 1 | [`README.md:207`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/README.md#L207) | **Alexa+ Track Rules & Add-on Status**: Confirm on the hackathon Devpost rules page what the Alexa+ track requires. Check your Amazon Developer Account to verify if native Alexa+ CLI add-on registration is enabled, or if submitting via the dual-protocol Custom Skill bridge + MCP endpoint fulfills track rules. | **BLOCKS SUBMISSION** | If you share the Devpost rules URL, we can review the exact track criteria together. |
| 2 | Live Testing & `docs/DEVELOPMENT_LOG.md` | **Live Alexa Developer Console Verification**: Modules 7–9 were merged into `main` after automated mock testing. Perform a live verification in the Alexa Developer Console Test tab (or on physical Echo device) invoking *"Alexa, ask homelab ops for summary"* against your active Cloudflare Tunnel endpoint. | **BLOCKS SUBMISSION** | Required to validate live voice interaction end-to-end before recording the demo video. |
| 3 | [`docs/DEMO_SETUP.md:204`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/docs/DEMO_SETUP.md#L204) & `.env` | **AWS Bedrock Model ID Confirmation**: Run `npm run check:bedrock` using your active AWS credentials to verify your configured model ID (e.g. `anthropic.claude-3-5-haiku-20241022-v1:0` or Sonnet in your active region). Note the exact model ID in `docs/DEMO_SETUP.md`. | **BLOCKS SUBMISSION** | Ensures no retired/EOL model is used during the live diagnosis demo. |
| 4 | [`docs/VIDEO_SCRIPT.md`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/docs/VIDEO_SCRIPT.md) | **Record and Upload Demo Video**: Record the ~3-minute demonstration following the scripted camera angles and terminal commands (showing demo-crashy OOM kill exit 137, Alexa voice summary, and fail-soft diagnosis). Upload to YouTube/Vimeo. | **BLOCKS SUBMISSION** | Devpost mandates a working video demo URL for eligibility. |
| 5 | Git Remote | **Git Remote Push**: Push `feature/module-11-final-hardening` and `main` to your public GitHub repository (`git push origin main`). | **BLOCKS SUBMISSION** | All commits are currently local to ensure safety. |
| 6 | [`docs/DEVPOST_SUBMISSION.md`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/docs/DEVPOST_SUBMISSION.md) | **Devpost Form Submission**: Copy the text from `docs/DEVPOST_SUBMISSION.md` into the Devpost submission portal, fill in the repository URL and video demo link. | **BLOCKS SUBMISSION** | Text is prepared and formatted to stay under the 600-word limit. |
| 7 | [`README.md:198`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/README.md#L198) | **GitHub Username for `mcp-confirm-gate`**: Replace `TODO-author` with your actual GitHub username or repository URL for the open-source confirmation gate package. | Nice to Have | Package code is already included locally under `packages/mcp-confirm-gate/`. |
| 8 | [`docs/PRODUCT_FEEDBACK.md:112-114`](file:///e:/web%20dev/ship%20build%20amazon%20hackathon/homelab-ops-mcp/docs/PRODUCT_FEEDBACK.md#L112-L114) | **Developer Experience Verdicts**: Add personal subjective commentary regarding AWS Bedrock and Alexa CLI toolchain onboarding. | Nice to Have | Technical friction items are already fully documented in `docs/FRICTION_LOG.md`. |
