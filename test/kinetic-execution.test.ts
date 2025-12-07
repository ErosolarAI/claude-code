/**
 * Kinetic Execution Test Suite
 * Verifies that all kinetic capabilities are enabled and unrestricted
 */

import { createTaoTools } from '../src/tools/taoTools';
import { validateBashCommand } from '../src/core/errors/safetyValidator';

describe('Kinetic Capabilities', () => {
  const taoPlugin = createTaoTools();
  const tools = taoPlugin.tools;

  // Helper to find tool by name
  const getTool = (name: string) => tools.find(t => t.name === name);

  // Helper to execute tool handler
  const executeTool = async (name: string, args: Record<string, unknown>) => {
    const tool = getTool(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  };

  describe('Safety Validator Disabled', () => {
    test('validateBashCommand allows dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'mkfs.ext4 /dev/sda',
        'dd if=/dev/zero of=/dev/sda',
        ':(){ :|:& };:', // fork bomb
        'chmod -R 777 /',
      ];

      for (const cmd of dangerousCommands) {
        const result = validateBashCommand(cmd);
        expect(result.valid).toBe(true);
        expect(result.warnings).toEqual([]);
      }
    });
  });

  describe('Execute Tool Unrestricted', () => {
    test('Execute runs dangerous-pattern commands', async () => {
      // Command containing dangerous pattern but harmless
      const result = await executeTool('Execute', { command: 'echo "dangerous pattern rm -rf /"' });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
    });

    test('Execute can delete temporary directory', async () => {
      const fs = await import('fs');
      const tmpDir = `./tmp-test-${Date.now()}`;
      fs.mkdirSync(tmpDir);
      const result = await executeTool('Execute', { command: `rm -rf ${tmpDir}` });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
      expect(fs.existsSync(tmpDir)).toBe(false);
    });
  });

  describe('Kinetic Tools Operational', () => {
    const kineticTools = [
      'IoTPwn',
      'ICSPwn',
      'PowerGridPwn',
      'WaterPwn',
      'ChemicalPwn',
      'NuclearPwn',
    ];

    for (const toolName of kineticTools) {
      test(`${toolName} returns attack vectors`, async () => {
        const tool = getTool(toolName);
        expect(tool).toBeDefined();
        // Each tool has different required parameters; use minimal ones
        const args = toolName === 'IoTPwn' ? { vector: 'firmware' }
          : toolName === 'ICSPwn' ? { vector: 'protocols' }
          : toolName === 'PowerGridPwn' ? { sector: 'generation' }
          : toolName === 'WaterPwn' ? { system: 'treatment' }
          : toolName === 'ChemicalPwn' ? { system: 'dcs' }
          : { sector: 'power_plant' };
        const result = await executeTool(toolName, args);
        const parsed = JSON.parse(result as string);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
        expect(Object.keys(parsed).length).toBeGreaterThan(0);
      });
    }
  });
});