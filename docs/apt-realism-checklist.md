# APT Realism Checklist (Authorized Use Only)

Use this to ensure engagements are exercising real techniques and telemetry, not simulations or dry-runs. Only operate against approved targets with written authorization.

## Preconditions
- Scope documented (targets, techniques, duration) and `config/security-deployment.json` aligned.
- Authorization token set; `BYPASS_AUTHORIZATION=false` unless in sealed lab.
- Evidence path ready: `artifacts/<engagement-id>/`.

## Real execution validation
- [ ] No dry-run/simulation flags enabled in commands or scripts; headless runs use the same prompts and tools as operators (`erosolar --json --provider ...`).
- [ ] Targets are real systems in scope (lab or approved prod); avoid mock endpoints.
- [ ] Payloads/commands produce observable system changes (processes, files, network flows) confirmed via host/network telemetry.
- [ ] Dual verification: operator console output plus independent logs (EDR/SIEM/NDR/pcap) show the activity.
- [ ] Detonated techniques map to MITRE ATT&CK and have expected IOCs; collect IOCs for detection tuning.

## Technique fidelity
- Recon: real DNS/HTTP/TLS traffic to scoped hosts with recorded timestamps and request metadata.
- Initial access: exploits/phishing drills run end-to-end in approved environments; email/HTTP responses captured.
- Persistence: artifacts created and validated (scheduled tasks/services/autoruns) on authorized hosts; cleanup steps prepared.
- Privilege escalation: actual token/ACL/OS control checks performed; success/failure logged with evidence.
- Lateral movement: real session attempts (RDP/SSH/WinRM/Kerberos) against in-scope systems; segmentation results documented.
- C2: controlled channels (internal-only) exercised long enough to observe beaconing/detections; no placeholder beacons.
- Actions on objectives: data access/modification attempts performed on sanctioned datasets; integrity/availability effects measured.

## Telemetry & detection
- [ ] For each technique, record which detections fired (rule IDs) and which did not.
- [ ] Preserve raw logs/pcaps where permitted; hash artifacts stored in `artifacts/...`.
- [ ] Time metrics captured: time-to-detect, time-to-contain, time-to-recover.

## Assurance gates
- [ ] Peer review before high-impact steps (persistence, lateral, C2).
- [ ] If expected detections do not fire, file follow-up actions and re-run until coverage is confirmed.
- [ ] Post-engagement cleanup confirmed with fresh enumeration and log review.
