# Security Operations Playbook (Authorized Use)

End-to-end checklist for authorized red/purple-team exercises that simulate a full APT-style chain while preserving safety, scope discipline, and evidence quality. Use alongside `docs/unified-orchestration.md`.

## Pre-engagement gating
- [ ] Confirm written authorization, scope, timing, and escalation contacts.
- [ ] Update `config/security-deployment.json` scope and tokens; disable `BYPASS_AUTHORIZATION`.
- [ ] Choose orchestration mode (single vs dual) and log it.
- [ ] Prepare evidence path `artifacts/<engagement-id>/` and template run log.
- [ ] Run through `docs/apt-realism-checklist.md` to ensure techniques are executed for real (not simulated) on authorized targets.

## Kill chain execution (simulate within scope only)
**Reconnaissance**
- [ ] Passive recon first: DNS, public records, exposed assets tied to scoped targets.
- [ ] Active scans only on approved hosts; rate-limit and log command/output.
- [ ] Map attack surface by stack: network, identity (SSO/IdP), endpoints, web apps, cloud control plane.

**Initial access**
- [ ] Use approved phishing simulators or lab email domains; capture templates and outcomes.
- [ ] For network/service exploits, document CVE/module, version checked, and compensating controls observed.
- [ ] For web apps, exercise only in-scope paths; record requests/responses and auth context used.

**Persistence (lab/authorized endpoints only)**
- [ ] Attempt persistence only on lab VMs or targets explicitly cleared for it.
- [ ] Record techniques trialed (scheduled tasks, credential caching, service modifications) and cleanup commands.
- [ ] Validate detections fired (EDR/SIEM alerts, logs) and note coverage gaps.

**Privilege escalation**
- [ ] Enumerate local/system privileges post-access; log evidence of constraints (AppArmor/SELinux/policies).
- [ ] Test approved escalation paths (misconfig checks, token abuse) with rollback steps ready.
- [ ] Capture proof of success/failure and detection signals.

**Lateral movement**
- [ ] Map trust relationships (AD trusts, cloud roles, SSH keys) discovered in scope.
- [ ] Use sanctioned methods (Kerberos delegation tests, RDP/SSH with test creds) and record traffic patterns.
- [ ] Verify segmentation effectiveness; log blocked vs allowed paths.

**Command & control (simulated)**
- [ ] Use internal/lab C2 only; avoid external beacons.
- [ ] Exercise channel diversity (HTTPS/DNS-over-HTTPS if permitted) and capture payload metadata, not payload content.
- [ ] Measure detection: NDR/SIEM rules triggered, EDR callbacks, firewall logs.

**Actions on objectives**
- [ ] Practice objective-aligned tasks: data access checks, integrity alteration tests, resiliency impacts—all within sandboxed data sets.
- [ ] Quantify blast radius and time-to-detect/time-to-contain.
- [ ] Collect artifacts showing both activity and controls in place.

**Cleanup & validation**
- [ ] Remove all persistence hooks, users, keys, tasks; verify with fresh enumeration.
- [ ] Restore configs/services changed; rerun integrity checks.
- [ ] Deliver post-engagement verification: evidence of cleanup, detections verified, and residual risk list.

## Deliverables per exercise
- Engagement brief with scope, mode (single/dual agent), and toolset used.
- Evidence pack: prompts, commands, outputs, timestamps, hashes of modified files, screenshots where allowed.
- Detection matrix: which techniques were/weren't observed by existing controls.
- Findings with remediation owners and SLAs; proposed detections for gaps.

## Full-stack coverage map
- Network: ingress/egress controls, segmentation, NDR coverage.
- Identity: MFA coverage, conditional access, session handling, privileged role protections.
- Endpoint: EDR policies, application control, logging fidelity, tamper protections.
- Web/App: authn/z flows, input validation, rate limits, dependency exposure.
- Cloud/Infra-as-code: control plane RBAC, service principals/roles, key management, audit trails.
- OT/IoT (if in scope): protocol segmentation, firmware provenance, management plane hardening.
