# Security Controls & Guardrails

Hardening checklist to keep offensive tooling safe, auditable, and confined to authorized scope.

## Configuration controls
- [ ] `config/security-deployment.json`: set `capabilities.ultimateSecurity.options.requireAuthorization=true` and keep `reporting.*` enabled.
- [ ] Set `SECURITY_AUTHORIZATION_TOKEN` per engagement; keep `BYPASS_AUTHORIZATION=false` outside sealed labs.
- [ ] Define `defaultScope.targets/techniques/durationHours` for every exercise; store copies with the evidence pack.

## Execution controls
- [ ] Run headless tasks with explicit prompts and scope (e.g., `erosolar --json --provider <p> --model <m> --prompt "...in-scope..."`).
- [ ] Enforce dual review for high-impact steps (persistence, lateral movement) before execution.
- [ ] Rate-limit scans and exploitation attempts; prefer staged rollouts in lab first.
- [ ] Keep a blocklist/denylist of out-of-scope hosts and monitor for accidental contact.

## Logging & evidence
- [ ] Log stdout/stderr to `artifacts/<engagement-id>/run.log`; hash artifacts when stored.
- [ ] Capture `/features` state (single vs dual agent) and config snapshots for traceability.
- [ ] Centralize logs where SIEM can ingest; tag runs with engagement ID and operator.

## Identity & access
- [ ] Use dedicated operator accounts; no shared credentials. Rotate tokens post-engagement.
- [ ] Restrict file permissions on `config/*` and `artifacts/*`; encrypt evidence at rest when sensitive.
- [ ] MFA required for CI/CD runners that can invoke erosolar.

## Network/infra isolation
- [ ] Execute from segmented networks; isolate lab targets from production.
- [ ] For C2 simulations, pin to internal domains/IPs and block egress by default.
- [ ] Limit cloud IAM roles to least privilege; use short-lived credentials.

## Post-engagement
- [ ] Cleanup validated (no persistence, keys, users, services left behind).
- [ ] Review detections vs actions; file follow-up tickets for gaps.
- [ ] Update playbooks and training modules with lessons learned.
