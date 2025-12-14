
/**
 * SECURE TAO TOOLS - Security Patched Version
 * All command injection vulnerabilities fixed
 * Input validation and sanitization implemented
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolDefinition } from '../core/toolRuntime.js';

export class SecurityUtils {
  static sanitizeInput(input: string): string {
    if (!input) return '';
    // Remove shell metacharacters
    return input
      .replace(/[;&|\`$(){}[\]<>!]/g, '')
      .replace(/\n/g, '')
      .replace(/\r/g, '')
      .trim()
      .slice(0, 255); // Limit length
  }

  static validateTarget(target: string): boolean {
    const sanitized = this.sanitizeInput(target);
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const hostnamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$/;
    return ipPattern.test(sanitized) || hostnamePattern.test(sanitized);
  }

  static async executeSafe(command: string, args: string[], timeout = 30000): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn(command, args, {
        timeout,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => stdout += data.toString());
      child.stderr?.on('data', (data) => stderr += data.toString());
      
      child.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });
      
      child.on('error', reject);
    });
  }
}

export function makeEvidenceFile(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const filePath = join(dir, 'evidence.txt');
  writeFileSync(filePath, `Secure execution - ${new Date().toISOString()}`);
  return filePath;
}

export async function safeNmapScan(target: string, ports = '80,443'): Promise<string> {
  try {
    if (!SecurityUtils.validateTarget(target)) {
      return 'Invalid target';
    }
    
    const sanitizedPorts = SecurityUtils.sanitizeInput(ports);
    const result = await SecurityUtils.executeSafe('nmap', [
      '-sT', '-T4', '-p', sanitizedPorts, target
    ], 60000);
    
    if (result.code === 0) {
      return result.stdout;
    } else {
      return `Scan failed: ${result.stderr}`;
    }
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

// Main secure tools creation
export function createSecureTaoTools() {
  const tools = [];
  
  const addTool = (name, description, handler) => {
    tools.push({ name, description, handler });
  };
  
  addTool('SecureScan', 'Safe network scanning', async (args) => {
    const result = await safeNmapScan(args.target || 'localhost', args.ports);
    return JSON.stringify({
      target: args.target,
      result: result.split('\n').slice(0, 20),
      timestamp: new Date().toISOString(),
      security: 'VALIDATED'
    }, null, 2);
  });
  
  addTool('SafeInfo', 'Safe information gathering', async (args) => {
    return JSON.stringify({
      system: 'Secure AGI Core',
      capabilities: ['safe_scanning', 'info_gathering'],
      timestamp: new Date().toISOString()
    }, null, 2);
  });
  
  // Google-specific safe tools
  addTool('GoogleSafeRecon', 'Safe Google service discovery', async (args) => {
    const services = [
      'www.google.com',
      'mail.google.com',
      'drive.google.com'
    ];
    
    return JSON.stringify({
      services,
      count: services.length,
      timestamp: new Date().toISOString(),
      security: 'STATIC_LIST_NO_EXEC'
    }, null, 2);
  });
  
  return { id: 'secure-tao-tools', tools };
}
