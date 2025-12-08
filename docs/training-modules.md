# Training Modules (Authorized Environments)

Modular training tracks to produce tangible outputs (labs, detections, playbooks). Pair each module with saved artifacts under `artifacts/<module-id>/`.

## Module 1: Orchestrator Fundamentals
- Audience: operators and automation engineers.
- Objectives: build/test the CLI, run single vs dual-agent modes, capture evidence.
- Lab: `npm install && npm run build && npm test`; run `agi --eval "Summarize system info within scope"`; toggle `/features alphazerodual on` and compare outputs.
- Deliverables: run logs, mode comparison notes, checklist updates in `docs/unified-orchestration.md`.

## Module 2: Full-Stack Kill Chain (Lab)
- Audience: red/purple-teamers.
- Objectives: execute a scoped kill chain in a sandbox (recon → access → persistence → lateral movement → actions → cleanup).
- Lab: use synthetic targets or isolated VMs; follow `docs/operations-playbook.md` checklists and record detections observed.
- Deliverables: evidence pack, detection matrix, cleanup verification.

## Module 3: Detection & IR Validation
- Audience: blue team/IR.
- Objectives: validate that detections fire for the techniques exercised in Module 2; practice containment/eradication steps.
- Lab: replay benign triggers or collected telemetry; walk through `docs/incident-response-runbook.md` with timers for MTTR.
- Deliverables: updated IR runbook notes, tuned detection rules, MTTR metrics.

## Module 4: Automation & Guardrails
- Audience: platform/security engineering.
- Objectives: script headless runs, enforce scope tokens, and centralize evidence.
- Lab: run `agi --json --provider <p> --model <m> --prompt "Scoped task"` with `SECURITY_AUTHORIZATION_TOKEN` set; store output to `artifacts/.../`.
- Deliverables: CI-ready command snippets, evidence storage conventions, guardrail configuration diffs.

## Module 5: Tabletop (Leadership + Ops)
- Audience: leadership + responders.
- Objectives: align decision-making with technical playbooks; test escalation paths.
- Lab: scenario walkthrough using findings from Modules 2–3; confirm communication cadences and approvals.
- Deliverables: decision log, clarified RACI, updated escalation contacts.
