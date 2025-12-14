# AGI Planning

This workspace hosts development and integration tests for the AGI CLI agent (distributed as `erosolar-cli`, alias `agi`). It mirrors the main CLI codebase but is used for local planning, orchestration hardening, and reliability fixes.

## Getting Started
- Install dependencies: `npm install`
- Build: `npm run build` (compiles TypeScript to ESM JavaScript)
- Run tests: `npm test`
- Lint: `npm run lint`

## Tooling, Build, and Test Flow

Follow this ordered flow to keep tools, builds, and tests synchronized with the CLI lifecycle. The embedded diagram provides a compact visual summary of the typical stages and how key commands interlock.

```mermaid
flowchart TD
  install["`npm install`"]
  build["`npm run build` / `tsc`"]
  lint["`npm run lint`"]
  test["`npm test`"]
  quality["`npm run quality-gate`\n(lint + types + health + tests)"]
  cli["`npm run start` / `agi`"]
  headless["`agi --eval \"...\"` / `--json` headless runs"]
  verification1["Offline AGI verification"]
  verification2["Real AGI flow test"]
  fullflow["Live provider integration"]
  tools["TAO/Kinetic tools + dual-agent RL tooling"]

  install --> build
  build --> test
  build --> verification1
  build --> verification2
  test --> quality
  lint --> quality
  build --> cli
  cli --> tools
  headless --> tools
  verification1 --> tools
  verification2 --> tools
  quality --> fullflow
  cli --> headless
  fullflow --> tools
```

## Flow Notes
- Always run `npm install` before invoking build or test commands so packages stay in sync.
- Use `npm run quality-gate` when you need a single command that validates linting, types, health checks, and tests in one pass.
- Build outputs live in `dist/`, which the CLI uses when you run `npm run start`, `agi`, or any verification/test harness that relies on the bundled output.
- Headless runs and live verification harnesses should point to the latest build artifacts and obey the orchestration toggles described below.
- **Module System**: The codebase uses ES Modules (ESM) throughout with `.js` extensions for imports, ensuring compatibility with modern Node.js environments.
## Running the CLI
- After building, start the interactive shell with `npm run start` or `agi`.
- Use `agi --eval "prompt"` for non-interactive text mode.
- Use `agi --json --provider <p> --model <m> --prompt "..."` for headless JSON output.
- Available flags: `--json`, `--provider <id>`, `--model <id>`, `--eval <prompt>`, `--quick`, `--profile <name>`
- Run a multi-prompt, real-provider sanity check after setting API keys:  
  `RUN_REAL_LLM_TESTS=1 node scripts/full-flow-human.mjs` (requires `npm run build`).

## AGI Verification
- Offline AGI core verification (no provider needed): Run the test suite with `npm test`
- Real AGI flow test with long-form human prompts: Use `node scripts/full-flow-human.mjs` (requires `RUN_REAL_LLM_TESTS=1` and API keys)
- Live provider full-flow harness: Same as above (requires `RUN_REAL_LLM_TESTS=1` + API key)

## Orchestration Modes
- Single agent (default): single-pass orchestrator with enforced tool use.
- Dual-agent RL (primary + refiner): enable via `/features alphazerodual on` (restart to persist) or toggle per-session with `Ctrl+Shift+D`. The toggle bar under the prompt shows the current mode, and runs will announce which pass won.
- Offensive RL telemetry: TAO tools emit reinforcement signals (portscan/DNS/payload/Execute/Probe) to the dual-agent bandit for continuous optimization.

## Safety
- Offensive/kinetic tooling is fully enabled for authorized red-team use (TAO suite + KineticOps).
- Bash validation is disabled for offensive mode (all commands allowed); safetyValidator tests updated accordingly.
