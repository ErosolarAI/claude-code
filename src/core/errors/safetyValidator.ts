/**
 * Safety Validator - Lean validation for tool arguments.
 * No command blocking - all bash commands allowed.
 */

export interface ValidationResult {
  valid: boolean;
  error?: Error;
  warnings: string[];
  autoFix?: {
    available: boolean;
    apply: () => unknown;
    description: string;
  };
}

interface ToolConstraint {
  type: 'number' | 'string' | 'boolean';
  max?: number;
  min?: number;
}

/**
 * Validate bash command - all commands allowed
 */
export function validateBashCommand(_command: string): ValidationResult {
  return { valid: true, warnings: [] };
}

/**
 * Validate tool arguments against type constraints
 */
export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  constraints: Record<string, ToolConstraint>
): ValidationResult {
  for (const [key, constraint] of Object.entries(constraints)) {
    const value = args[key];
    if (value === undefined) continue;

    if (!matchesType(value, constraint.type)) {
      return {
        valid: false,
        error: new Error(`Invalid type for ${toolName}.${key}: expected ${constraint.type}.`),
        warnings: [],
      };
    }

    if (constraint.type === 'number') {
      const num = value as number;
      if (constraint.max !== undefined && num > constraint.max) {
        return {
          valid: false,
          error: new Error(`${toolName}.${key} exceeds maximum (${num} > ${constraint.max}).`),
          warnings: [],
        };
      }
      if (constraint.min !== undefined && num < constraint.min) {
        return {
          valid: false,
          error: new Error(`${toolName}.${key} below minimum (${num} < ${constraint.min}).`),
          warnings: [],
        };
      }
    }
  }

  return { valid: true, warnings: [] };
}

/**
 * Utility fixer for common patterns
 */
export class SmartFixer {
  static fixDangerousCommand(command: string): { fixed: string; changes: string[] } {
    let fixed = command;
    const changes: string[] = [];

    if (/\brm\s+-rf\s+\/(\s|$)/i.test(fixed)) {
      fixed = fixed.replace(/\brm\s+-rf\s+\/(\s|$)/i, 'rm -rf ./');
      changes.push('Rewrote "rm -rf /" to "rm -rf ./".');
    }
    if (/chmod\s+-R\s+777\b/i.test(fixed)) {
      fixed = fixed.replace(/chmod\s+-R\s+777\b/i, 'chmod -R 755');
      changes.push('Reduced chmod 777 to chmod 755.');
    }
    if (/git\s+push\s+--force\b/i.test(fixed)) {
      fixed = fixed.replace(/git\s+push\s+--force\b/i, 'git push --force-with-lease');
      changes.push('Replaced --force with --force-with-lease.');
    }

    return { fixed, changes };
  }

  static fixResourceLimits(
    args: Record<string, unknown>,
    constraints: Record<string, { max?: number; min?: number }>
  ): { fixed: Record<string, unknown>; changes: string[] } {
    const fixed = { ...args };
    const changes: string[] = [];

    for (const [key, constraint] of Object.entries(constraints)) {
      const value = fixed[key];
      if (typeof value !== 'number') continue;

      if (constraint.max !== undefined && value > constraint.max) {
        const newValue = Math.floor(constraint.max * 0.8);
        fixed[key] = newValue;
        changes.push(`Lowered ${key} to ${newValue} (80% of max ${constraint.max}).`);
      } else if (constraint.min !== undefined && value < constraint.min) {
        fixed[key] = constraint.min;
        changes.push(`Raised ${key} to minimum ${constraint.min}.`);
      }
    }

    return { fixed, changes };
  }

  static fixValidationErrors(
    args: Record<string, unknown>,
    constraints: Record<string, ToolConstraint>
  ): { fixed: Record<string, unknown>; changes: string[] } {
    const fixed = { ...args };
    const changes: string[] = [];

    for (const [key, constraint] of Object.entries(constraints)) {
      const value = fixed[key];

      if (constraint.type === 'number' && typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          fixed[key] = parsed;
          changes.push(`Coerced ${key} to number.`);
        }
      }

      if (constraint.type === 'boolean' && typeof value === 'string') {
        if (value.toLowerCase() === 'true') {
          fixed[key] = true;
          changes.push(`Coerced ${key} to boolean true.`);
        } else if (value.toLowerCase() === 'false') {
          fixed[key] = false;
          changes.push(`Coerced ${key} to boolean false.`);
        }
      }
    }

    return { fixed, changes };
  }
}

/**
 * Validator wrapper with optional auto-fix
 */
export class AutoFixValidator<T = string> {
  private enabled: boolean;

  constructor(autoFix: boolean) {
    this.enabled = autoFix;
  }

  setAutoFix(enabled: boolean): void {
    this.enabled = enabled;
  }

  async validate(
    value: T,
    validator: (value: T) => ValidationResult
  ): Promise<{ value: T; result: ValidationResult }> {
    const result = validator(value);
    return { value, result };
  }
}

function matchesType(value: unknown, type: ToolConstraint['type']): boolean {
  if (type === 'number') return typeof value === 'number';
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}
