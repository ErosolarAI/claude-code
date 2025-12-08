# Unified Orchestration Playbook

Concrete runbook for operating the AGI CLI in a controlled, repeatable way. This keeps single/dual-agent orchestration, automation, and evidence collection aligned with the repo defaults.

## 1) Readiness
- Node 20+, `npm install`, then `npm run build` and `npm test` (or `npm run quality-gate` for lint + type + health + tests).
- **Module System**: Uses ES Modules (ESM) with `.js` extensions; model/agent configuration loads asynchronously.
- Launch interactive shell: `npm run start` (uses `dist/bin/agi.js`).
- Headless auto-run: `agi --eval "task"` or `agi --json --provider <p> --model <m> --prompt "..."` for pipeline use.
- Toggle orchestration mode: default single-agent; enable dual-agent RL with `/features alphazerodual on` (restart) or per-session `Ctrl+Shift+D`.

## 2) Scope & authorization (must-do before any offensive exercise)
- Edit `config/security-deployment.json`:
  - Set `defaultScope.targets`, `techniques`, `durationHours`, and `authorizedBy` to the approved engagement ticket.
  - Set `capabilities.ultimateSecurity.options.requireAuthorization` to `true` in regulated environments.
  - Keep `reporting.generateReports`, `saveEvidence`, `logActivities` enabled; disable `safety.legalNotice=false` only if your legal banner is handled externally.
- Export env vars per engagement: `export SECURITY_AUTHORIZATION_TOKEN=<token>` and keep `BYPASS_AUTHORIZATION=false` unless you are in a sealed lab.
- Pin workspace paths: run from a dedicated working dir and archive artifacts under `artifacts/<engagement-id>/`.

## 3) Unified execution pattern
- **Pre-flight**: `npm run build && npm test` → `npm run quality-gate` for longer runs. Capture versions with `node -v && git rev-parse --short HEAD`.
- **Task kickoff**: prefer headless for repeatability: `agi --eval "Objective + constraints + success criteria"`; in interactive mode, start with `/features alphazerodual on` if refinement is desired.
- **Tooling guardrails**: run high-impact TAO/Kinetic tools only against in-scope targets; log the prompt, scope, and console output to `artifacts/.../evidence.log`.
- **Completion**: Require a final status summary and next-step checklist from the agent; store JSON output when using `--json` for post-processing.

## 4) Evidence & logging
- Keep `reporting.saveEvidence` true; when running headless, redirect stdout/stderr to `artifacts/.../run.log`.
- Snapshot configs used: `config/security-deployment.json`, `/features` toggles, and any prompt templates.
- If running dual-agent, note which pass won (announced at end of run) and keep both traces when available.

## 5) Daily checklist (authorized operators only)
- Scope validated and token set (`SECURITY_AUTHORIZATION_TOKEN`).
- Latest build/test pass locally.
- Orchestration mode chosen (single vs dual) and documented.
- Evidence path prepared; logging turned on.
- Run initiated via `agi --eval` or interactive shell with clear success criteria.
- Debrief captured: final response, tools used, issues, and follow-up tasks.
