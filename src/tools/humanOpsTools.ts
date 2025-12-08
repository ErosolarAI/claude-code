import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ToolDefinition } from '../core/toolRuntime.js';

type Urgency = 'low' | 'normal' | 'high';

interface HumanTask {
  title: string;
  context?: string;
  urgency: Urgency;
  needsBrowser: boolean;
  needsCaptcha: boolean;
  needsExternalBuild: boolean;
  emailDomain?: string;
  catchAll?: boolean;
  domainRegistrar?: string;
  paymentMethod?: string;
  phoneVerification?: boolean;
  ssoProviders?: string[];
  proxyPolicy?: string;
  steps: string[];
  artifacts: string[];
  contact?: string;
  expectedOutcome?: string;
  createdAt: string;
  status?: 'draft' | 'in-progress' | 'done';
  updates?: Array<{ at: string; note: string }>;
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'task';
}

function resolveHumanOpsDir(): string {
  const base = process.env['AGI_HUMAN_TASK_DIR'];
  if (base && base.trim()) {
    return resolve(base.trim());
  }
  return resolve(process.cwd(), '.agi', 'human-ops');
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function writeTaskFile(task: HumanTask): string {
  const dir = resolveHumanOpsDir();
  ensureDir(dir);
  const slug = sanitizeSlug(task.title);
  const filePath = join(dir, `task-${Date.now()}-${slug}.json`);
  writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf8');
  return filePath;
}

export function createHumanOpsTools(): ToolDefinition[] {
  return [
    {
      name: 'HumanIntegration',
      description:
        'Escalate to a human operator (browser/captcha/external build/test/manual QA). Creates a rough plan and saves it; on later calls, append updates to the same task file.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short label for the human task (e.g., "Solve login captcha", "Run Playwright checkout flow").',
          },
          taskPath: {
            type: 'string',
            description: 'Optional existing task file path to append an update to (created by a prior HumanIntegration call).',
          },
          update: {
            type: 'string',
            description: 'When taskPath is provided, a short update note describing what changed / the next action needed.',
          },
          emailDomain: {
            type: 'string',
            description: 'Preferred domain for provisioning emails (e.g., fastmail custom domain).',
          },
          catchAll: {
            type: 'boolean',
            description: 'If true, indicates using a catch-all mailbox at the domain.',
          },
          domainRegistrar: {
            type: 'string',
            description: 'Registrar or DNS provider to use for domain setup (if needed).',
          },
          paymentMethod: {
            type: 'string',
            description: 'Payment method/constraints for purchases (e.g., virtual card, limit, billing address).',
          },
          phoneVerification: {
            type: 'boolean',
            description: 'If true, indicates a phone/SMS step is expected.',
          },
          ssoProviders: {
            type: 'array',
            items: { type: 'string' },
            description: 'SSO providers that may be required (e.g., Google, Apple, Microsoft).',
          },
          proxyPolicy: {
            type: 'string',
            description: 'Any proxy/VPN/fingerprint constraints (e.g., region, residential, device profile).',
          },
          context: {
            type: 'string',
            description: 'Relevant context, URLs, credentials locations, expected state, or hypotheses to verify.',
          },
          urgency: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            description: 'How soon this is needed. Defaults to normal.',
          },
          needsBrowser: {
            type: 'boolean',
            description: 'Whether the task requires interactive browser use.',
          },
          needsCaptcha: {
            type: 'boolean',
            description: 'Whether solving a CAPTCHA is required.',
          },
          needsExternalBuild: {
            type: 'boolean',
            description: 'Whether to build/test in a separate runtime (e.g., clean machine or cloud runner).',
          },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Step-by-step instructions a human should follow.',
          },
          artifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Artifacts to capture (screenshots, logs, URLs, recordings).',
          },
          contact: {
            type: 'string',
            description: 'Optional contact/hand-off notes (who to notify, Slack channel, email).',
          },
          expectedOutcome: {
            type: 'string',
            description: 'What success looks like (e.g., "checkout completes", "captcha solved and session established").',
          },
        },
        required: ['title'],
        additionalProperties: false,
      },
      handler: async (args) => {
        const title = typeof args['title'] === 'string' ? args['title'].trim() : '';
        const taskPathArg = typeof args['taskPath'] === 'string' ? args['taskPath'].trim() : '';
        const updateNote = typeof args['update'] === 'string' ? args['update'].trim() : '';

        // Update existing task file if provided
        if (taskPathArg) {
          if (!updateNote) {
            return 'Error: when taskPath is provided, update is required to append a status.';
          }
          const path = resolve(taskPathArg);
          try {
            const parsed = JSON.parse(readFileSync(path, 'utf8')) as HumanTask;
            parsed.updates = parsed.updates ?? [];
            parsed.updates.push({ at: new Date().toISOString(), note: updateNote });
            parsed.status = parsed.status ?? 'in-progress';
            writeFileSync(path, JSON.stringify(parsed, null, 2), 'utf8');
            return [
              `Update appended to human task: ${parsed.title}`,
              `Status: ${parsed.status}`,
              `Updates now: ${parsed.updates.length}`,
              `Saved at: ${path}`,
            ].join('\n');
          } catch (error) {
            return `Error: could not update task at ${path}: ${(error as Error)?.message ?? String(error)}`;
          }
        }

        if (!title) {
          return 'Error: title is required';
        }

        const urgency: Urgency =
          args['urgency'] === 'high' || args['urgency'] === 'low' ? args['urgency'] : 'normal';
        const needsBrowser = args['needsBrowser'] === true;
        const needsCaptcha = args['needsCaptcha'] === true;
        const needsExternalBuild = args['needsExternalBuild'] === true;
        const emailDomain = typeof args['emailDomain'] === 'string' ? args['emailDomain'].trim() : undefined;
        const catchAll = args['catchAll'] === true;
        const domainRegistrar =
          typeof args['domainRegistrar'] === 'string' && args['domainRegistrar'].trim()
            ? args['domainRegistrar'].trim()
            : undefined;
        const paymentMethod =
          typeof args['paymentMethod'] === 'string' && args['paymentMethod'].trim()
            ? args['paymentMethod'].trim()
            : undefined;
        const phoneVerification = args['phoneVerification'] === true;
        const proxyPolicy =
          typeof args['proxyPolicy'] === 'string' && args['proxyPolicy'].trim()
            ? args['proxyPolicy'].trim()
            : undefined;
        const ssoProviders = Array.isArray(args['ssoProviders'])
          ? args['ssoProviders']
              .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
              .map((s) => s.trim())
          : undefined;

        const steps = Array.isArray(args['steps'])
          ? args['steps']
              .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
              .map((s) => s.trim())
          : [];
        const artifacts = Array.isArray(args['artifacts'])
          ? args['artifacts']
              .filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
              .map((s) => s.trim())
          : [];

        const task: HumanTask = {
          title,
          context: typeof args['context'] === 'string' ? args['context'] : undefined,
          urgency,
          needsBrowser,
          needsCaptcha,
          needsExternalBuild,
          emailDomain,
          catchAll,
          domainRegistrar,
          paymentMethod,
          phoneVerification,
          ssoProviders,
          proxyPolicy,
          steps,
          artifacts,
          contact: typeof args['contact'] === 'string' ? args['contact'] : undefined,
          expectedOutcome: typeof args['expectedOutcome'] === 'string' ? args['expectedOutcome'] : undefined,
          createdAt: new Date().toISOString(),
          status: 'draft',
          updates: [
            {
              at: new Date().toISOString(),
              note: 'Initial rough plan created. Append updates with taskPath + update on each tool use.',
            },
          ],
        };

        const path = writeTaskFile(task);
        const summaryLines = [
          `Human task recorded (draft): ${title}`,
          `Urgency: ${urgency}`,
          needsBrowser ? 'Requires browser use' : 'No browser required',
          needsCaptcha ? 'Requires captcha' : 'No captcha expected',
          needsExternalBuild ? 'Requires external/clean build runtime' : 'No external build required',
          emailDomain ? `Email domain: ${emailDomain}${catchAll ? ' (catch-all)' : ''}` : 'Email domain: not specified',
          domainRegistrar ? `Registrar/DNS: ${domainRegistrar}` : 'Registrar/DNS: not specified',
          paymentMethod ? `Payment: ${paymentMethod}` : 'Payment: not specified',
          phoneVerification ? 'Phone/SMS verification expected' : 'Phone verification not expected',
          ssoProviders?.length ? `SSO: ${ssoProviders.join(', ')}` : 'SSO: not specified',
          proxyPolicy ? `Proxy/fingerprint: ${proxyPolicy}` : 'Proxy/fingerprint: not specified',
          steps.length ? `Steps (rough plan): ${steps.join(' | ')}` : 'Steps: (provide interactively / rough plan only)',
          artifacts.length ? `Artifacts to capture: ${artifacts.join(', ')}` : 'Artifacts: optional',
          'Next: call HumanIntegration again with taskPath + update after each tool use to keep the plan current.',
          `Saved at: ${path}`,
        ];

        return summaryLines.join('\n');
      },
    },
  ];
}
