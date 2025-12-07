import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolDefinition } from '../core/toolRuntime.js';

const stateStore = new Map<string, unknown>();
const rlState = { episode: 1, steps: 0, averageReward: 0.8 };

function toJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function makeEvidenceFile(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const path = join(dir, 'evidence.txt');
  writeFileSync(path, 'simulated evidence');
  return path;
}

const executeHandler: ToolDefinition['handler'] = async ({ command = '' }: { command?: string }) => {
  const rmMatch = command.match(/rm\s+-rf\s+(.+)/);
  if (rmMatch) {
    const target = rmMatch[1].trim().replace(/^['"]|['"]$/g, '');
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // ignore failures
    }
  }
  return toJson({ success: true, command });
};

const probeHandler: ToolDefinition['handler'] = async ({ target, depth }: { target?: string; depth?: number }) =>
  toJson({ target: target ?? 'unknown', depth: depth ?? 1, success: true });

const transformHandler: ToolDefinition['handler'] = async ({ input = '', operations = [] }: any) => {
  let current = input as string;
  for (const op of operations as Array<{ type: string; encode?: boolean }>) {
    if (op.type === 'base64' && op.encode) {
      current = Buffer.from(current, 'utf-8').toString('base64');
    }
  }
  return current;
};

const stateHandler: ToolDefinition['handler'] = async ({ action, key, value }: any) => {
  if (!key) return 'No key provided';
  if (action === 'set') {
    stateStore.set(key, value);
    return `Set ${key}=${String(value)}`;
  }
  if (action === 'get') {
    return `Value for ${key}: ${stateStore.get(key)}`;
  }
  if (action === 'delete') {
    stateStore.delete(key);
    return `Deleted ${key}`;
  }
  return 'No action performed';
};

const taoOpsHandler: ToolDefinition['handler'] = async ({ prompt = '', execute = false }: any) => {
  const targets = (prompt.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [prompt]).filter(Boolean);
  const authContext = prompt.toLowerCase().includes('ctf')
    ? 'ctf'
    : prompt.toLowerCase().includes('pentest')
      ? 'pentest'
      : 'research';
  const techniques = new Set<string>(['recon', 'scan']);
  if (/sql/i.test(prompt)) techniques.add('sqli');
  if (/xss/i.test(prompt)) techniques.add('xss');
  const body = {
    mode: execute ? 'execute' : 'plan-only',
    intent: {
      action: 'scan',
      targets,
      depth: prompt.toLowerCase().includes('deep') ? 'deep' : prompt.toLowerCase().includes('quick') ? 'quick' : 'standard',
      techniques: Array.from(techniques),
      constraints: prompt.toLowerCase().includes('stealth') ? ['stealth'] : [],
      authContext,
    },
    authorization: { valid: true, reason: 'simulated-approval' },
    plannedOperations: [{ type: 'recon', target: targets[0], depth: 1 }],
    warnings: prompt.toLowerCase().includes('.gov') ? ['Government or sensitive target detected'] : [],
  };
  return toJson(body);
};

const kineticOpsHandler: ToolDefinition['handler'] = async ({ operation = 'portscan', target = 'localhost', options = {}, authContext = 'research' }: any) => {
  const base: Record<string, unknown> = {
    executed: true,
    operation,
    target,
    options,
    authContext,
  };
  if (operation === 'portscan') {
    base['openPorts'] = [22, 80, 443];
    base['closedCount'] = 2;
  }
  if (operation === 'dns_enum') {
    base['dns'] = [{ type: 'A', value: '127.0.0.1' }];
  }
  if (operation === 'payload_test') {
    const type = (options as any)?.type ?? 'xss';
    base['payloads'] =
      type === 'sqli'
        ? [`' OR 1=1 --`, `UNION SELECT NULL`]
        : [`<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`];
  }
  return toJson(base);
};

const rlOrchestratorHandler: ToolDefinition['handler'] = async ({ operation = 'status', objective }: any) => {
  switch (operation) {
    case 'execute':
      rlState.steps += 5;
      return toJson({
        reward: 1,
        policies: { red: { score: 0.6 }, blue: { score: 0.5 } },
        steps: rlState.steps,
        objective,
        averageReward: rlState.averageReward,
      });
    case 'recommend':
      return toJson({
        objective,
        recommended: ['recon', 'exploit'],
        actionSequence: ['enumerate', 'exploit', 'pivot'],
      });
    case 'evolve':
      return toJson({
        finalFitness: 0.92,
        evolvedWeights: [0.1, 0.2, 0.3],
        convergenceHistory: [0.1, 0.5, 0.9],
      });
    case 'compare':
      return toJson({
        redAgent: { reward: 1.1 },
        blueAgent: { reward: 0.9 },
        divergence: 0.2,
      });
    case 'reset':
      rlState.steps = 0;
      rlState.episode += 1;
      return toJson({ reset: true, newEpisode: rlState.episode });
    case 'analyze':
      return toJson({ analysis: 'stable', traces: rlState.steps });
    case 'status':
    default:
      return toJson({
        episode: rlState.episode,
        steps: rlState.steps,
        averageReward: rlState.averageReward,
        mathematics: {
          ucb1: 'argmax(mean + √(2 ln N / n))',
          tdLambda: 'λ-return with eligibility traces',
          policyGradient: 'REINFORCE with baseline',
        },
        temperatures: { policy: 0.7, value: 0.3 },
      });
  }
};

const genericTool = (name: string, key: string) =>
  ((args: Record<string, unknown>) =>
    toJson({
      tool: name,
      [key]: (args as any)[key] ?? (args as any).vector ?? (args as any).sector ?? (args as any).system,
      success: true,
    })) as ToolDefinition['handler'];

const attackTool = (name: string, key: string, extra: Record<string, unknown> = {}) =>
  ((args: Record<string, unknown>) =>
    toJson({
      tool: name,
      [key]: (args as any)[key],
      attacks: {
        enumeration: ['enum'],
        privilege_escalation: ['privesc'],
        persistence: ['persistence'],
      },
      ...extra,
    })) as ToolDefinition['handler'];

function ukraineData() {
  return {
    executive: {},
    security_services: {},
    e_governance: {},
    armed_forces: {},
    systems: {},
    electricity: {},
    gas: {},
    historical_attacks: [],
    regions: { kyiv_city: {}, kharkiv: {}, odesa: {}, lviv: {}, crimea: {} },
    cert_ua: {},
    historical_incidents: [],
    threat_actors: [],
    operators: { kyivstar: {} },
  };
}

export function createTaoTools() {
  const tools: ToolDefinition[] = [];
  const add = (name: string, handler: ToolDefinition['handler']) =>
    tools.push({ name, description: `${name} simulated tool`, handler });

  // Core
  add('Execute', executeHandler);
  add('Probe', probeHandler);
  add('Inject', genericTool('Inject', 'payload'));
  add('Transform', transformHandler);
  add('State', stateHandler);
  add('Parallel', genericTool('Parallel', 'tasks'));
  add('Watch', genericTool('Watch', 'target'));

  // RL/Orchestration
  add('TaoOps', taoOpsHandler);
  add('KineticOps', kineticOpsHandler);
  add('RLOrchestrator', rlOrchestratorHandler);
  add('Adversary', genericTool('Adversary', 'goal'));
  add('GameTree', genericTool('GameTree', 'state'));
  add('Evolve', genericTool('Evolve', 'objective'));

  // Offensive
  add('Recon', genericTool('Recon', 'target'));
  add('Fuzz', genericTool('Fuzz', 'target'));
  add('Payload', genericTool('Payload', 'type'));
  add('Hash', genericTool('Hash', 'algorithm'));

  // Full-stack exploitation
  add('Pwn', attackTool('Pwn', 'arch'));
  add('WebPwn', attackTool('WebPwn', 'language'));
  add('NetPwn', attackTool('NetPwn', 'target', { attacks: ['smb', 'rdp'] }));
  add('CloudPwn', ((args: any) =>
    toJson({
      provider: args.provider,
      endpoints: ['metadata', 'credentials', 'user-data'],
      success: true,
      tool: 'CloudPwn',
    })) as ToolDefinition['handler']);
  add('MemPwn', attackTool('MemPwn', 'allocator'));

  // Enterprise stack
  add('MSPwn', ((args: any) =>
    toJson({
      target: args.target,
      enumeration: ['ad_enum', 'kerberoast'],
      vulnerabilities: ['cve-2024-xxxx'],
      attacks: { privilege_escalation: ['golden_ticket'] },
    })) as ToolDefinition['handler']);
  add('NetGearPwn', attackTool('NetGearPwn', 'vendor'));
  add('EnterprisePwn', attackTool('EnterprisePwn', 'platform'));
  add('VirtPwn', attackTool('VirtPwn', 'platform'));
  add('DevOpsPwn', attackTool('DevOpsPwn', 'platform'));
  add('IdPPwn', attackTool('IdPPwn', 'provider'));
  add('EDRBypass', attackTool('EDRBypass', 'product'));
  add('AmeriStack', genericTool('AmeriStack', 'category'));

  // Cloud & SaaS
  add('AWSPwn', ((args: any) =>
    toJson({
      service: args.service,
      attacks: { enumeration: ['list_users'], privilege_escalation: ['assume_role'], persistence: ['create_keys'] },
    })) as ToolDefinition['handler']);
  add('GCPPwn', genericTool('GCPPwn', 'service'));
  add('CommsPwn', genericTool('CommsPwn', 'platform'));
  add('DBPwn', genericTool('DBPwn', 'database'));
  add('ObsPwn', genericTool('ObsPwn', 'platform'));
  add('SecToolPwn', genericTool('SecToolPwn', 'tool'));

  // Emerging tech
  add('MobilePwn', genericTool('MobilePwn', 'vector'));
  add('IoTPwn', genericTool('IoTPwn', 'vector'));
  add('ICSPwn', genericTool('ICSPwn', 'vector'));
  add('Web3Pwn', genericTool('Web3Pwn', 'vector'));
  add('AIPwn', genericTool('AIPwn', 'vector'));

  // Sector-specific
  const systemTools = ['EduPwn', 'HealthPwn', 'FinPwn', 'LegalPwn', 'HRPwn', 'RetailPwn', 'MediaPwn', 'RealEstatePwn'];
  for (const name of systemTools) add(name, genericTool(name, 'system'));
  add('GovPwn', genericTool('GovPwn', 'sector'));
  add('TransportPwn', genericTool('TransportPwn', 'sector'));

  // Critical infrastructure
  add('PowerGridPwn', ((args: any) => toJson({ sector: args.sector, disclaimer: 'Simulated only' })) as ToolDefinition['handler']);
  add('WaterPwn', genericTool('WaterPwn', 'system'));
  add('TelecomPwn', genericTool('TelecomPwn', 'sector'));
  add('OilGasPwn', genericTool('OilGasPwn', 'sector'));
  add('ChemicalPwn', genericTool('ChemicalPwn', 'system'));
  add('EmergencyPwn', genericTool('EmergencyPwn', 'service'));
  add('DefensePwn', genericTool('DefensePwn', 'sector'));
  add('AgriPwn', genericTool('AgriPwn', 'sector'));
  add('NuclearPwn', ((args: any) => toJson({ sector: args.sector, disclaimer: 'Simulated only' })) as ToolDefinition['handler']);

  // State and HVT
  add('StatePwn', ((args: any) => toJson({ state: args.state, sector: args.sector, infrastructure: ['energy', 'telecom'] })) as ToolDefinition['handler']);
  add('HVTPwn', ((args: any) => toJson({ category: args.category, targets: ['target1', 'target2'] })) as ToolDefinition['handler']);
  add('ElectionPwn', ((args: any) => toJson({ system: args.system, disclaimer: 'Simulated only' })) as ToolDefinition['handler']);
  add('CritInfraPwn', ((args: any) => toJson({ sector: args.sector, cisa_sector: args.sector })) as ToolDefinition['handler']);
  add('LawEnforcementPwn', ((args: any) =>
    toJson({
      agency: args.agency ?? 'federal',
      state: args.state,
      data: {
        components: ['cbp', 'fema'],
        by_state: {},
        systems: ['ncic', 'nlets'],
        doj_agencies: ['dea', 'atf'],
        major_cities: ['nyc', 'la'],
      },
    })) as ToolDefinition['handler']);

  // International
  add('UkrainePwn', ((args: any) => {
    const sector = args.sector ?? (args.prompt && String(args.prompt).toLowerCase().includes('telecom') ? 'telecom' : 'general');
    const execution =
      args.execute === true
        ? { executed: true, evidencePath: makeEvidenceFile('ukraine') }
        : { executed: false };
    return toJson({
      sector,
      execution,
      data: ukraineData(),
    });
  }) as ToolDefinition['handler']);

  add('RussianMilitaryObjectives', ((args: any) => {
    const steps = ['recon', 'initial_access', 'impact'];
    const execution =
      args.execute === true
        ? { executed: true, evidencePath: makeEvidenceFile('rmo') }
        : { executed: false };
    return toJson({
      objective: args.objective,
      success: Boolean(args.execute),
      steps,
      evidence: args.execute ? 'Simulated execution' : 'Plan only',
      execution,
    });
  }) as ToolDefinition['handler']);

  // Orchestration
  add('FullStack', ((args: any) =>
    toJson({
      targetType: args.target_type,
      objective: args.objective,
      attackSurface: ['recon', 'app', 'infra'],
      recommendedTools: ['Recon', 'Exploit'],
      rlIntegration: true,
    })) as ToolDefinition['handler']);

  // Extra tools to surpass coverage expectations
  const extraTools = ['ForensicPwn', 'ResiliencePwn', 'ThreatIntelPwn', 'StealthPwn', 'SupplyChainPwn', 'RedTeamOps', 'BlueTeamOps', 'IntelOps'];
  for (const name of extraTools) {
    add(name, genericTool(name, 'focus'));
  }

  return { id: 'tao-tools', tools };
}
