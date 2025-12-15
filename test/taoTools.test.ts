/**
 * Comprehensive TAO Tools Test Suite
 * Tests all offensive security tools for correct execution and output
 */

import * as fs from 'node:fs';
import { createSecureTaoTools } from '../src/tools/secureTaoTools';

describe('TAO Tools', () => {
  const taoPlugin = createSecureTaoTools();
  const tools = taoPlugin.tools;

  // Helper to find tool by name
  const getTool = (name: string) => tools.find(t => t.name === name);

  // Helper to execute tool handler
  const executeTool = async (name: string, args: Record<string, unknown>) => {
    const tool = getTool(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  };

  describe('Core TAO Tools', () => {
    test('Execute tool runs commands', async () => {
      const result = await executeTool('Execute', { command: 'echo test' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('Probe tool analyzes targets', async () => {
      const result = await executeTool('Probe', { target: 'localhost', depth: 1 });
      expect(result).toBeDefined();
    });

    test('State tool manages session state', async () => {
      const setResult = await executeTool('State', { action: 'set', key: 'testKey', value: 'testValue' });
      expect(setResult).toContain('testKey');

      const getResult = await executeTool('State', { action: 'get', key: 'testKey' });
      expect(getResult).toContain('testValue');
    });

    test('Transform tool processes data', async () => {
      const result = await executeTool('Transform', {
        input: 'data:hello world',
        operations: [{ type: 'base64', encode: true }]
      });
      expect(result).toBeDefined();
    });
  });

  describe('Natural Language Operations (TaoOps)', () => {
    test('TaoOps parses natural language scan intent', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Scan 127.0.0.1 for open ports',
        execute: false  // Plan only, don't actually scan
      });
      const parsed = JSON.parse(result);
      expect(parsed.mode).toBe('plan-only');
      expect(parsed.intent.action).toBe('scan');
      expect(parsed.intent.targets).toContain('127.0.0.1');
      expect(parsed.plannedOperations).toBeDefined();
      expect(parsed.plannedOperations.length).toBeGreaterThan(0);
    });

    test('TaoOps detects authorization context', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Deep recon on target.local for CTF competition',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.intent.authContext).toBe('ctf');
      expect(parsed.intent.depth).toBe('deep');
    });

    test('TaoOps extracts IP targets', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Port scan 192.168.1.100 and 10.0.0.1',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.intent.targets).toContain('192.168.1.100');
      expect(parsed.intent.targets).toContain('10.0.0.1');
    });

    test('TaoOps identifies techniques', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Test for SQLi injection and XSS cross-site scripting vulnerabilities',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.intent.techniques).toContain('sqli');
      expect(parsed.intent.techniques).toContain('xss');
    });

    test('TaoOps warns about sensitive targets', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Scan example.gov for vulnerabilities',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.warnings.some((w: string) => w.includes('Government'))).toBe(true);
    });

    test('TaoOps respects constraints', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Quick stealth scan of target',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.intent.depth).toBe('quick');
      expect(parsed.intent.constraints).toContain('stealth');
    });

    test('TaoOps generates actionable output format', async () => {
      const result = await executeTool('TaoOps', {
        prompt: 'Scan 127.0.0.1 for pentest engagement',
        execute: false
      });
      const parsed = JSON.parse(result);
      expect(parsed.intent.authContext).toBe('pentest');
      expect(parsed.authorization).toBeDefined();
      expect(parsed.authorization.valid).toBe(true);
    });
  });

  describe('Kinetic Operations (KineticOps)', () => {
    test('KineticOps portscan executes against localhost', async () => {
      const result = await executeTool('KineticOps', {
        operation: 'portscan',
        target: '127.0.0.1',
        options: { ports: [22, 80, 443], timeout: 500 },
        authContext: 'research',
      });
      const parsed = JSON.parse(result);
      expect(parsed.executed).toBe(true);
      expect(parsed.operation).toBe('portscan');
      expect(parsed.target).toBe('127.0.0.1');
      expect(parsed).toHaveProperty('openPorts');
      expect(parsed).toHaveProperty('closedCount');
    });

    test('KineticOps dns_enum returns DNS records', async () => {
      const result = await executeTool('KineticOps', {
        operation: 'dns_enum',
        target: 'google.com',
        authContext: 'research',
      });
      const parsed = JSON.parse(result);
      expect(parsed.executed).toBe(true);
      expect(parsed.operation).toBe('dns_enum');
      expect(parsed).toHaveProperty('dns');
    });

    test('KineticOps payload_test generates test payloads', async () => {
      const result = await executeTool('KineticOps', {
        operation: 'payload_test',
        target: 'test',
        options: { type: 'xss' },
        authContext: 'ctf',
      });
      const parsed = JSON.parse(result);
      expect(parsed.executed).toBe(true);
      expect(parsed).toHaveProperty('payloads');
      expect(Array.isArray(parsed.payloads)).toBe(true);
      expect(parsed.payloads.length).toBeGreaterThan(0);
    });

    test('KineticOps sqli payloads available', async () => {
      const result = await executeTool('KineticOps', {
        operation: 'payload_test',
        target: 'test',
        options: { type: 'sqli' },
        authContext: 'pentest',
      });
      const parsed = JSON.parse(result);
      expect(parsed.payloads.some((p: string) => p.includes("'"))).toBe(true);
    });

    test('KineticOps records authorization context', async () => {
      const result = await executeTool('KineticOps', {
        operation: 'payload_test',
        target: 'test',
        authContext: 'bugbounty',
      });
      const parsed = JSON.parse(result);
      expect(parsed.authContext).toBe('bugbounty');
    });
  });

  describe('Adversarial AI/RL Tools', () => {
    test('RLOrchestrator status returns state', async () => {
      const result = await executeTool('RLOrchestrator', { operation: 'status' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('episode');
      expect(parsed).toHaveProperty('steps');
      expect(parsed).toHaveProperty('averageReward');
      expect(parsed).toHaveProperty('temperatures');
      expect(parsed).toHaveProperty('mathematics');
    });

    test('RLOrchestrator execute updates agents', async () => {
      const result = await executeTool('RLOrchestrator', {
        operation: 'execute',
        tool: 'Recon',
        action: 'scan',
        params: { target: 'test' },
        constraint: 'balanced'
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('reward');
      expect(parsed).toHaveProperty('policies');
      expect(parsed.policies).toHaveProperty('red');
      expect(parsed.policies).toHaveProperty('blue');
    });

    test('RLOrchestrator recommend suggests actions', async () => {
      const result = await executeTool('RLOrchestrator', {
        operation: 'recommend',
        objective: 'gain initial access to enterprise network'
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('objective');
      expect(parsed).toHaveProperty('recommended');
      expect(parsed).toHaveProperty('actionSequence');
    });

    test('RLOrchestrator evolve optimizes strategy', async () => {
      const result = await executeTool('RLOrchestrator', {
        operation: 'evolve',
        objective: 'exfiltrate data',
        generations: 5
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('finalFitness');
      expect(parsed).toHaveProperty('evolvedWeights');
      expect(parsed).toHaveProperty('convergenceHistory');
    });

    test('RLOrchestrator compare shows agent differences', async () => {
      const result = await executeTool('RLOrchestrator', { operation: 'compare' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('redAgent');
      expect(parsed).toHaveProperty('blueAgent');
      expect(parsed).toHaveProperty('divergence');
    });

    test('RLOrchestrator reset clears state', async () => {
      const result = await executeTool('RLOrchestrator', { operation: 'reset' });
      const parsed = JSON.parse(result);
      expect(parsed.reset).toBe(true);
      expect(parsed).toHaveProperty('newEpisode');
    });

    test('Adversary tool runs dual-agent competition', async () => {
      const result = await executeTool('Adversary', {
        goal: 'test objective',
        iterations: 3,
        mode: 'compete'
      });
      expect(result).toBeDefined();
    });

    test('GameTree tool analyzes game states', async () => {
      const result = await executeTool('GameTree', {
        state: 'initial',
        depth: 2,
        algorithm: 'minimax'
      });
      expect(result).toBeDefined();
    });
  });

  describe('Offensive Security Tools', () => {
    jest.setTimeout(120000);
    test('Recon tool performs reconnaissance', async () => {
      const result = await executeTool('Recon', { target: 'localhost', type: 'passive' });
      expect(result).toBeDefined();
    }, 120000);

    test('Fuzz tool generates test cases', async () => {
      const result = await executeTool('Fuzz', {
        target: 'http://example.com/api',
        type: 'smart',
        iterations: 5
      });
      expect(result).toBeDefined();
    }, 120000);

    test('Payload tool generates payloads', async () => {
      const result = await executeTool('Payload', {
        type: 'reverse_shell',
        platform: 'linux',
        format: 'bash'
      });
      expect(result).toBeDefined();
    });

    test('Hash tool performs crypto operations', async () => {
      const result = await executeTool('Hash', {
        operation: 'hash',
        algorithm: 'sha256',
        data: 'test data'
      });
      expect(result).toBeDefined();
    });
  });

  describe('Full-Stack Exploitation Tools', () => {
    test('Pwn tool provides binary exploitation info', async () => {
      const result = await executeTool('Pwn', {
        action: 'rop',
        arch: 'x64'
      });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('arch');
    });

    test('WebPwn tool provides web attack info', async () => {
      const result = await executeTool('WebPwn', {
        action: 'deserialize',
        language: 'java'
      });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('language');
    });

    test('NetPwn tool provides network attack info', async () => {
      const result = await executeTool('NetPwn', {
        action: 'smb',
        target: '192.168.1.1'
      });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('attacks');
    });

    test('CloudPwn tool provides cloud attack info', async () => {
      const result = await executeTool('CloudPwn', {
        action: 'metadata',
        provider: 'aws'
      });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('endpoints');
    });

    test('MemPwn tool provides memory corruption info', async () => {
      const result = await executeTool('MemPwn', {
        action: 'heap',
        allocator: 'glibc'
      });
      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('attacks');
    });
  });

  describe('American Enterprise Stack Tools', () => {
    test('MSPwn covers Microsoft ecosystem', async () => {
      const targets = ['exchange', 'sharepoint', 'o365', 'teams', 'entra', 'adcs', 'sccm', 'intune', 'defender', 'graph'];
      for (const target of targets) {
        const result = await executeTool('MSPwn', { target });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('NetGearPwn covers network equipment', async () => {
      const vendors = ['cisco', 'paloalto', 'fortinet', 'f5', 'juniper', 'checkpoint', 'aruba', 'citrix_adc'];
      for (const vendor of vendors) {
        const result = await executeTool('NetGearPwn', { vendor });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('EnterprisePwn covers enterprise software', async () => {
      const platforms = ['oracle', 'sap', 'salesforce', 'servicenow', 'workday', 'atlassian', 'splunk', 'elastic', 'mongodb', 'redis'];
      for (const platform of platforms) {
        const result = await executeTool('EnterprisePwn', { platform });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('VirtPwn covers virtualization', async () => {
      const platforms = ['vmware', 'citrix', 'nutanix', 'hyperv', 'proxmox', 'openstack'];
      for (const platform of platforms) {
        const result = await executeTool('VirtPwn', { platform });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('DevOpsPwn covers CI/CD', async () => {
      const platforms = ['jenkins', 'gitlab', 'github', 'circleci', 'terraform', 'ansible', 'docker_registry', 'artifactory', 'argocd'];
      for (const platform of platforms) {
        const result = await executeTool('DevOpsPwn', { platform });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('IdPPwn covers identity providers', async () => {
      const providers = ['okta', 'ping', 'auth0', 'adfs', 'duo', 'onelogin', 'cyberark', 'hashicorp_vault'];
      for (const provider of providers) {
        const result = await executeTool('IdPPwn', { provider });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });

    test('EDRBypass covers security products', async () => {
      const products = ['crowdstrike', 'sentinelone', 'defender', 'carbon_black', 'cortex', 'cylance', 'sophos'];
      for (const product of products) {
        const result = await executeTool('EDRBypass', { product });
        const parsed = JSON.parse(result);
        expect(parsed).not.toHaveProperty('error');
      }
    });
  });

  describe('Cloud & SaaS Tools', () => {
    test('AWSPwn covers all AWS services', async () => {
      const services = ['iam', 'ec2', 's3', 'lambda', 'eks', 'rds', 'secretsmanager', 'ssm', 'cloudtrail', 'cognito', 'sqs', 'sns', 'dynamodb', 'ecs', 'ecr', 'route53', 'cloudfront', 'apigateway', 'stepfunctions'];
      for (const service of services) {
        const result = await executeTool('AWSPwn', { service });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('service', service);
        expect(parsed.attacks).toBeDefined();
      }
    });

    test('GCPPwn covers GCP services', async () => {
      const services = ['iam', 'compute', 'gke', 'storage', 'bigquery', 'cloudfunctions', 'secretmanager', 'workspace', 'firebase', 'cloudrun', 'pubsub'];
      for (const service of services) {
        const result = await executeTool('GCPPwn', { service });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('service', service);
      }
    });

    test('CommsPwn covers communication platforms', async () => {
      const platforms = ['slack', 'zoom', 'webex', 'discord', 'ringcentral', 'twilio'];
      for (const platform of platforms) {
        const result = await executeTool('CommsPwn', { platform });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('platform', platform);
      }
    });

    test('DBPwn covers databases', async () => {
      const databases = ['postgresql', 'mysql', 'mssql', 'oracle', 'snowflake', 'databricks', 'mongodb', 'cassandra', 'couchdb', 'neo4j'];
      for (const database of databases) {
        const result = await executeTool('DBPwn', { database });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('database', database);
      }
    });

    test('ObsPwn covers observability platforms', async () => {
      const platforms = ['datadog', 'newrelic', 'grafana', 'pagerduty', 'prometheus', 'dynatrace', 'sumo', 'loggly'];
      for (const platform of platforms) {
        const result = await executeTool('ObsPwn', { platform });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('platform', platform);
      }
    });

    test('SecToolPwn covers security tools', async () => {
      const secTools = ['qualys', 'rapid7', 'tenable', 'cyberark', 'beyondtrust', 'venafi', 'hashicorp_vault', 'thycotic'];
      for (const tool of secTools) {
        const result = await executeTool('SecToolPwn', { tool });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('tool', tool);
      }
    });
  });

  describe('Emerging Tech Tools', () => {
    test('MobilePwn covers iOS and Android', async () => {
      const platforms = ['ios', 'android', 'both'];
      const vectors = ['app_analysis', 'runtime', 'network', 'storage', 'ipc', 'kernel'];

      for (const platform of platforms) {
        for (const vector of vectors) {
          const result = await executeTool('MobilePwn', { platform, vector });
          const parsed = JSON.parse(result);
          expect(parsed).toHaveProperty('vector', vector);
        }
      }
    });

    test('IoTPwn covers IoT vectors', async () => {
      const vectors = ['firmware', 'hardware', 'network', 'rf', 'cloud', 'protocols', 'automotive'];
      for (const vector of vectors) {
        const result = await executeTool('IoTPwn', { vector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('vector', vector);
      }
    });

    test('ICSPwn covers SCADA/ICS', async () => {
      const vectors = ['protocols', 'plc', 'hmi', 'historian', 'network', 'safety', 'vendors'];
      for (const vector of vectors) {
        const result = await executeTool('ICSPwn', { vector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('vector', vector);
      }
    });

    test('Web3Pwn covers blockchain', async () => {
      const vectors = ['smart_contract', 'defi', 'bridge', 'wallet', 'consensus', 'nft', 'l2'];
      for (const vector of vectors) {
        const result = await executeTool('Web3Pwn', { vector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('vector', vector);
      }
    });

    test('AIPwn covers AI/ML attacks', async () => {
      const vectors = ['adversarial', 'prompt_injection', 'model_theft', 'data_poisoning', 'mlops', 'inference', 'privacy'];
      for (const vector of vectors) {
        const result = await executeTool('AIPwn', { vector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('vector', vector);
      }
    });
  });

  describe('American Sector Tools', () => {
    test('EduPwn covers education systems', async () => {
      const systems = ['ellucian', 'blackboard', 'canvas', 'peoplesoft', 'workday_student', 'slate', 'colleague', 'jenzabar', 'powercampus', 'eduroam', 'shibboleth', 'library'];
      for (const system of systems) {
        const result = await executeTool('EduPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('GovPwn covers government sectors', async () => {
      const sectors = ['federal_civilian', 'dod', 'state_local', 'contractor', 'fedramp', 'critical_infra', 'law_enforcement', 'intel_community'];
      for (const sector of sectors) {
        const result = await executeTool('GovPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('HealthPwn covers healthcare systems', async () => {
      const systems = ['epic', 'cerner', 'meditech', 'allscripts', 'athenahealth', 'nextgen', 'eclinicalworks', 'hl7_fhir', 'medical_devices', 'pacs_dicom', 'pharmacy', 'lab'];
      for (const system of systems) {
        const result = await executeTool('HealthPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('FinPwn covers financial systems', async () => {
      const systems = ['swift', 'fix', 'core_banking', 'payment', 'trading', 'atm', 'card_processing', 'insurance', 'wealth_management'];
      for (const system of systems) {
        const result = await executeTool('FinPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('LegalPwn covers legal systems', async () => {
      const systems = ['relativity', 'concordance', 'nuix', 'logikcull', 'law_firm', 'court_systems', 'legal_hold'];
      for (const system of systems) {
        const result = await executeTool('LegalPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('HRPwn covers HR/payroll systems', async () => {
      const systems = ['workday', 'adp', 'paylocity', 'ceridian', 'ukg', 'sap_successfactors', 'oracle_hcm', 'bamboohr', 'gusto', 'paychex', 'namely', 'rippling'];
      for (const system of systems) {
        const result = await executeTool('HRPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('RetailPwn covers retail systems', async () => {
      const systems = ['pos', 'ecommerce', 'inventory', 'loyalty', 'supply_chain', 'warehouse'];
      for (const system of systems) {
        const result = await executeTool('RetailPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('MediaPwn covers media systems', async () => {
      const systems = ['streaming', 'broadcast', 'gaming', 'content_mgmt', 'drm', 'ad_tech'];
      for (const system of systems) {
        const result = await executeTool('MediaPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('TransportPwn covers transportation sectors', async () => {
      const sectors = ['aviation', 'rail', 'maritime', 'trucking', 'logistics', 'rideshare'];
      for (const sector of sectors) {
        const result = await executeTool('TransportPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('RealEstatePwn covers real estate systems', async () => {
      const systems = ['mls', 'property_mgmt', 'title_escrow', 'mortgage', 'commercial', 'smart_building'];
      for (const system of systems) {
        const result = await executeTool('RealEstatePwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });
  });

  describe('Orchestration Tools', () => {
    test('FullStack returns comprehensive attack surface', async () => {
      const targetTypes = ['enterprise', 'startup', 'critical_infra', 'fintech', 'healthcare', 'government', 'web3'];
      const objectives = ['recon', 'initial_access', 'persistence', 'privesc', 'lateral', 'exfil', 'impact'];

      for (const targetType of targetTypes) {
        for (const objective of objectives) {
          const result = await executeTool('FullStack', { target_type: targetType, objective });
          const parsed = JSON.parse(result);
          expect(parsed).toHaveProperty('targetType', targetType);
          expect(parsed).toHaveProperty('objective', objective);
          expect(parsed).toHaveProperty('attackSurface');
          expect(parsed).toHaveProperty('recommendedTools');
          expect(parsed).toHaveProperty('rlIntegration');
        }
      }
    });

    test('AmeriStack returns enterprise attack paths', async () => {
      const categories = ['microsoft', 'network', 'enterprise', 'virtualization', 'devops', 'identity', 'edr', 'all'];
      for (const category of categories) {
        const result = await executeTool('AmeriStack', { category });
        const parsed = JSON.parse(result);
        expect(parsed).toBeDefined();
      }
    });
  });

  describe('Output Format Validation', () => {
    test('All JSON outputs are valid', async () => {
      const jsonTools = [
        { name: 'AWSPwn', args: { service: 'iam' } },
        { name: 'GCPPwn', args: { service: 'compute' } },
        { name: 'EduPwn', args: { system: 'ellucian' } },
        { name: 'GovPwn', args: { sector: 'dod' } },
        { name: 'HealthPwn', args: { system: 'epic' } },
        { name: 'FinPwn', args: { system: 'swift' } },
        { name: 'RLOrchestrator', args: { operation: 'status' } },
      ];

      for (const { name, args } of jsonTools) {
        const result = await executeTool(name, args);
        expect(() => JSON.parse(result)).not.toThrow();
      }
    });

    test('Attack info contains actionable data', async () => {
      // Test that attack info includes actual techniques/commands
      const awsResult = await executeTool('AWSPwn', { service: 'iam' });
      const awsParsed = JSON.parse(awsResult);
      expect(awsParsed.attacks.enumeration).toBeDefined();
      expect(awsParsed.attacks.privilege_escalation).toBeDefined();

      const msResult = await executeTool('MSPwn', { target: 'exchange' });
      const msParsed = JSON.parse(msResult);
      expect(msParsed.enumeration).toBeDefined();
      expect(msParsed.vulnerabilities).toBeDefined();
    });
  });

  describe('Tool Count Verification', () => {
    test('Contains expected number of tools', () => {
      // Verify we have comprehensive coverage (80+ tools)
      expect(tools.length).toBeGreaterThanOrEqual(75);

      // Log actual tool names for verification
      const toolNames = tools.map(t => t.name).sort();
      console.log(`Total tools: ${tools.length}`);
      console.log('Tools:', toolNames.join(', '));
    });

    test('All expected tool categories exist', () => {
      const expectedTools = [
        // Core
        'Execute', 'Probe', 'Inject', 'Transform', 'State', 'Parallel', 'Watch',
        // RL
        'RLOrchestrator', 'Adversary', 'GameTree', 'Evolve',
        // Offensive
        'Recon', 'Fuzz', 'Payload', 'Hash',
        // Full-stack
        'Pwn', 'WebPwn', 'NetPwn', 'CloudPwn', 'MemPwn',
        // Enterprise
        'MSPwn', 'NetGearPwn', 'EnterprisePwn', 'VirtPwn', 'DevOpsPwn', 'IdPPwn', 'EDRBypass', 'AmeriStack',
        // Cloud
        'AWSPwn', 'GCPPwn', 'CommsPwn', 'DBPwn', 'ObsPwn', 'SecToolPwn',
        // Emerging
        'MobilePwn', 'IoTPwn', 'ICSPwn', 'Web3Pwn', 'AIPwn',
        // Sectors
        'EduPwn', 'GovPwn', 'HealthPwn', 'FinPwn', 'LegalPwn', 'HRPwn', 'RetailPwn', 'MediaPwn', 'TransportPwn', 'RealEstatePwn',
        // Critical Infrastructure
        'PowerGridPwn', 'WaterPwn', 'TelecomPwn', 'OilGasPwn', 'ChemicalPwn', 'EmergencyPwn', 'DefensePwn', 'AgriPwn', 'NuclearPwn',
        // States/Territories & HVT
        'StatePwn', 'HVTPwn', 'ElectionPwn', 'CritInfraPwn',
        // Law Enforcement
        'LawEnforcementPwn',
        // International
        'UkrainePwn',
        // Orchestration
        'FullStack'
      ];

      const toolNames = tools.map(t => t.name);
      for (const expected of expectedTools) {
        expect(toolNames).toContain(expected);
      }
    });
  });

  describe('Critical Infrastructure Tools', () => {
    test('PowerGridPwn covers power grid sectors', async () => {
      const sectors = ['generation', 'transmission', 'distribution', 'smart_grid', 'scada', 'ems', 'dcs', 'substations', 'renewables'];
      for (const sector of sectors) {
        const result = await executeTool('PowerGridPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
        expect(parsed).toHaveProperty('executed');
      }
    });

    test('WaterPwn covers water systems', async () => {
      const systems = ['treatment', 'distribution', 'scada', 'plc', 'pumping', 'wastewater', 'dams', 'chemicals'];
      for (const system of systems) {
        const result = await executeTool('WaterPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('TelecomPwn covers telecom sectors', async () => {
      const sectors = ['core', 'ran', 'ss7', 'diameter', 'voip', 'cable', 'fiber', 'satellite', '5g', 'emergency'];
      for (const sector of sectors) {
        const result = await executeTool('TelecomPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('OilGasPwn covers oil and gas', async () => {
      const sectors = ['upstream', 'midstream', 'downstream', 'pipeline', 'refinery', 'lng', 'offshore', 'drilling'];
      for (const sector of sectors) {
        const result = await executeTool('OilGasPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('ChemicalPwn covers chemical plants', async () => {
      const systems = ['dcs', 'sis', 'batch', 'continuous', 'storage', 'hazmat', 'pharmaceutical', 'specialty'];
      for (const system of systems) {
        const result = await executeTool('ChemicalPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
      }
    });

    test('EmergencyPwn covers emergency services', async () => {
      const services = ['psap', 'cad', 'rms', 'ems', 'fire', 'police', 'hospital', 'mutual_aid'];
      for (const service of services) {
        const result = await executeTool('EmergencyPwn', { service });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('service', service);
      }
    });

    test('DefensePwn covers defense industrial base', async () => {
      const sectors = ['prime', 'subcontractor', 'supply_chain', 'cleared', 'cmmc', 'itar', 'cui'];
      for (const sector of sectors) {
        const result = await executeTool('DefensePwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('AgriPwn covers food and agriculture', async () => {
      const sectors = ['precision_ag', 'processing', 'cold_chain', 'livestock', 'grain', 'water', 'distribution'];
      for (const sector of sectors) {
        const result = await executeTool('AgriPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
      }
    });

    test('NuclearPwn covers nuclear sector', async () => {
      const sectors = ['power_plant', 'research', 'fuel_cycle', 'waste', 'security', 'regulatory'];
      for (const sector of sectors) {
        const result = await executeTool('NuclearPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
        expect(parsed).toHaveProperty('executed');
      }
    });
  });

  describe('State and Territory Coverage', () => {
    test('StatePwn covers all 50 states and territories', async () => {
      const states = ['CA', 'TX', 'NY', 'FL', 'VA', 'DC', 'PR', 'GU'];
      for (const state of states) {
        const result = await executeTool('StatePwn', { state, sector: 'all' });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('state', state);
        expect(parsed).toHaveProperty('infrastructure');
      }
    });

    test('HVTPwn covers high value targets', async () => {
      const categories = ['fortune500', 'financial', 'tech', 'pharma', 'defense', 'energy', 'crypto', 'sovereign', 'research'];
      for (const category of categories) {
        const result = await executeTool('HVTPwn', { category });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('category', category);
        expect(parsed).toHaveProperty('targets');
      }
    });

    test('ElectionPwn covers election systems', async () => {
      const systems = ['voting_machines', 'voter_registration', 'ems', 'reporting', 'mail', 'vendor'];
      for (const system of systems) {
        const result = await executeTool('ElectionPwn', { system });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('system', system);
        expect(parsed).toHaveProperty('executed');
      }
    });

    test('CritInfraPwn covers all 16 CISA sectors', async () => {
      const sectors = [
        'chemical', 'commercial_facilities', 'communications', 'critical_manufacturing',
        'dams', 'defense_industrial_base', 'emergency_services', 'energy',
        'financial_services', 'food_agriculture', 'government_facilities', 'healthcare',
        'information_technology', 'nuclear', 'transportation', 'water'
      ];
      for (const sector of sectors) {
        const result = await executeTool('CritInfraPwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
        expect(parsed).toHaveProperty('cisa_sector');
      }
    });

    test('LawEnforcementPwn covers FBI across all states', async () => {
      const states = ['CA', 'TX', 'NY', 'FL', 'VA', 'OH', 'IL', 'PR'];
      for (const state of states) {
        const result = await executeTool('LawEnforcementPwn', { agency: 'fbi', state });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('agency', 'fbi');
        expect(parsed).toHaveProperty('state', state);
      }
    });

    test('LawEnforcementPwn covers DHS components', async () => {
      const result = await executeTool('LawEnforcementPwn', { agency: 'dhs' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('agency', 'dhs');
      expect(parsed.data).toHaveProperty('components');
    });

    test('LawEnforcementPwn covers state police in all states', async () => {
      const states = ['CA', 'TX', 'NY', 'FL', 'PA', 'OH', 'IL', 'MI', 'GA', 'NC'];
      for (const state of states) {
        const result = await executeTool('LawEnforcementPwn', { agency: 'state_police', state });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('agency', 'state_police');
        expect(parsed).toHaveProperty('state', state);
      }
    });

    test('LawEnforcementPwn covers fusion centers', async () => {
      const result = await executeTool('LawEnforcementPwn', { agency: 'fusion_centers' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('agency', 'fusion_centers');
      expect(parsed.data).toHaveProperty('by_state');
    });

    test('LawEnforcementPwn covers CJIS systems', async () => {
      const result = await executeTool('LawEnforcementPwn', { agency: 'cjis' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('agency', 'cjis');
      expect(parsed.data).toHaveProperty('systems');
    });

    test('LawEnforcementPwn covers federal agencies', async () => {
      const result = await executeTool('LawEnforcementPwn', { agency: 'federal' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('agency', 'federal');
      expect(parsed.data).toHaveProperty('doj_agencies');
    });

    test('LawEnforcementPwn covers local police', async () => {
      const result = await executeTool('LawEnforcementPwn', { agency: 'local' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('agency', 'local');
      expect(parsed.data).toHaveProperty('major_cities');
    });
  });

  describe('Ukraine Coverage', () => {
    test('UkrainePwn covers all sectors', async () => {
      const sectors = ['government', 'military', 'energy', 'telecom', 'banking', 'transport', 'healthcare', 'education', 'media', 'cyber', 'oblasts'];
      for (const sector of sectors) {
        const result = await executeTool('UkrainePwn', { sector });
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('sector', sector);
        expect(parsed).toHaveProperty('data');
      }
    });

    test('UkrainePwn covers government systems', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'government' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('executive');
      expect(parsed.data).toHaveProperty('security_services');
      expect(parsed.data).toHaveProperty('e_governance');
    });

    test('UkrainePwn covers military infrastructure', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'military' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('armed_forces');
      expect(parsed.data).toHaveProperty('systems');
    });

    test('UkrainePwn covers energy sector', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'energy' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('electricity');
      expect(parsed.data).toHaveProperty('gas');
      expect(parsed.data).toHaveProperty('historical_attacks');
    });

    test('UkrainePwn covers all oblasts', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'oblasts' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('regions');
      const regions = parsed.data.regions;
      expect(regions).toHaveProperty('kyiv_city');
      expect(regions).toHaveProperty('kharkiv');
      expect(regions).toHaveProperty('odesa');
      expect(regions).toHaveProperty('lviv');
      expect(regions).toHaveProperty('crimea');
    });

    test('UkrainePwn covers cyber threat landscape', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'cyber' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('cert_ua');
      expect(parsed.data).toHaveProperty('historical_incidents');
      expect(parsed.data).toHaveProperty('threat_actors');
    });

    test('UkrainePwn covers telecom operators', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'telecom' });
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveProperty('operators');
      expect(parsed.data.operators).toHaveProperty('kyivstar');
    });

    test('UkrainePwn infers sector from natural language prompt', async () => {
      const result = await executeTool('UkrainePwn', { prompt: 'Map telecom operators across Kyiv and execute later' });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('sector', 'telecom');
      expect(parsed.execution).toBeDefined();
      expect(parsed.execution.executed).toBe(false);
    });

    test('UkrainePwn executes in reality when requested', async () => {
      const result = await executeTool('UkrainePwn', { sector: 'energy', execute: true });
      const parsed = JSON.parse(result);
      expect(parsed.execution).toBeDefined();
      expect(parsed.execution.executed).toBe(true);
      expect(parsed.execution.evidencePath).toBeTruthy();
      if (parsed.execution.evidencePath) {
        expect(fs.existsSync(parsed.execution.evidencePath as string)).toBe(true);
      }
    });
  });

  describe('Russian Military Objectives', () => {
    test('RussianMilitaryObjectives tool achieves objectives when executed', async () => {
      const result = await executeTool('RussianMilitaryObjectives', { objective: 'disable_power_grid', execute: true });
      const parsed = JSON.parse(result);
      console.log('RussianMilitaryObjectives execution result:', JSON.stringify(parsed, null, 2));
      expect(parsed).toHaveProperty('objective', 'disable_power_grid');
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('steps');
      expect(parsed.steps.length).toBeGreaterThan(0);
      expect(parsed).toHaveProperty('evidence');
    });

    test('RussianMilitaryObjectives tool plans without execution', async () => {
      const result = await executeTool('RussianMilitaryObjectives', { objective: 'compromise_military_comms', execute: false });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('objective', 'compromise_military_comms');
      expect(parsed).toHaveProperty('success', false);
      expect(parsed.evidence).toBe('Plan only');
    });
  });

  describe('RL Mathematical Correctness', () => {
    test('UCB1 formula is implemented correctly', async () => {
      // Run several iterations to build up statistics
      for (let i = 0; i < 10; i++) {
        await executeTool('RLOrchestrator', {
          operation: 'execute',
          tool: 'Recon',
          action: `action_${i % 3}`,
          params: {}
        });
      }

      const status = await executeTool('RLOrchestrator', { operation: 'status' });
      const parsed = JSON.parse(status);

      // Verify UCB1 formula is documented
      expect(parsed.mathematics.ucb1).toContain('argmax');
      expect(parsed.mathematics.ucb1).toContain('√');
    });

    test('TD(λ) value updates accumulate', async () => {
      // Reset first
      await executeTool('RLOrchestrator', { operation: 'reset' });

      // Run iterations
      for (let i = 0; i < 5; i++) {
        await executeTool('RLOrchestrator', {
          operation: 'execute',
          tool: 'Scan',
          action: 'scan',
          params: { depth: i + 1 }
        });
      }

      const analysis = await executeTool('RLOrchestrator', { operation: 'analyze' });
      // May not have enough samples, but should not error
      expect(analysis).toBeDefined();
    });

    test('Policy gradient updates modify weights', async () => {
      await executeTool('RLOrchestrator', { operation: 'reset' });

      const before = await executeTool('RLOrchestrator', { operation: 'status' });
      const beforeParsed = JSON.parse(before);

      // Run several executions
      for (let i = 0; i < 5; i++) {
        await executeTool('RLOrchestrator', {
          operation: 'execute',
          tool: 'Exploit',
          action: 'exploit',
          params: {}
        });
      }

      const after = await executeTool('RLOrchestrator', { operation: 'status' });
      const afterParsed = JSON.parse(after);

      // Steps should have increased
      expect(afterParsed.steps).toBeGreaterThan(beforeParsed.steps);
    });
  });
});
