import type { ToolDefinition } from '../core/toolRuntime.js';

export function createGeneratorTools(): ToolDefinition[] {
  return [
    {
      name: 'GenerateTool',
      description:
        'Drafts a new tool definition (name, description, params, handler skeleton) for AGI Core. Use this to propose/build tools that can be wired into capability modules. Returns JSON of the tool draft.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tool name (CamelCase or short id).' },
          description: { type: 'string', description: 'What the tool does and why.' },
          intent: { type: 'string', description: 'Purpose/use-case (e.g., QA, browser, build, human handoff).' },
          inputs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', description: 'Type hint (string, number, boolean, array, object).' },
                description: { type: 'string' },
                required: { type: 'boolean' },
              },
              required: ['name', 'type'],
              additionalProperties: false,
            },
            description: 'Input fields/schema for the tool.',
          },
          handlerNotes: {
            type: 'string',
            description: 'Guidance for the handler implementation (APIs to call, side effects, safety constraints).',
          },
          integration: {
            type: 'string',
            description: 'Where to integrate (e.g., capability module, tool suite id, plugin id).',
          },
        },
        required: ['name', 'description', 'intent'],
        additionalProperties: false,
      },
      handler: async (args) => {
        const name = typeof args['name'] === 'string' ? args['name'].trim() : '';
        const description = typeof args['description'] === 'string' ? args['description'].trim() : '';
        const intent = typeof args['intent'] === 'string' ? args['intent'].trim() : '';
        if (!name || !description || !intent) {
          return 'Error: name, description, and intent are required.';
        }

        const inputs = Array.isArray(args['inputs'])
          ? args['inputs']
              .filter(
                (entry) =>
                  entry &&
                  typeof entry === 'object' &&
                  typeof entry['name'] === 'string' &&
                  typeof entry['type'] === 'string'
              )
              .map((entry) => ({
                name: String(entry['name']).trim(),
                type: String(entry['type']).trim(),
                description: typeof entry['description'] === 'string' ? entry['description'] : undefined,
                required: entry['required'] === true,
              }))
          : [];

        const schemaProps: Record<string, unknown> = {};
        const requiredFields: string[] = [];
        for (const input of inputs) {
          schemaProps[input.name] = {
            type: input.type,
            description: input.description,
          };
          if (input.required) {
            requiredFields.push(input.name);
          }
        }

        const toolDraft = {
          name,
          description,
          intent,
          toolDefinition: {
            name,
            description,
            parameters: Object.keys(schemaProps).length
              ? {
                  type: 'object',
                  properties: schemaProps,
                  required: requiredFields.length ? requiredFields : undefined,
                  additionalProperties: false,
                }
              : undefined,
            handler: '// TODO: implement handler based on handlerNotes/integration',
          },
          handlerNotes: typeof args['handlerNotes'] === 'string' ? args['handlerNotes'] : undefined,
          integration: typeof args['integration'] === 'string' ? args['integration'] : undefined,
          wiring: {
            suggestedCapabilityModule: 'human-ops or custom capability',
            suggestedToolSuiteId: 'generator',
            pluginId: 'tool.generator',
          },
        };

        return JSON.stringify(toolDraft, null, 2);
      },
    },
  ];
}
