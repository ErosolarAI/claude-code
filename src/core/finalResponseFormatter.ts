/**
 * Ensures final assistant responses include a "Next steps" section.
 * Returns both the full output and any appended text so callers can stream just the delta.
 */
export interface FinalResponseFormat {
  output: string;
  appended: string | null;
}

const NEXT_STEPS_HEADING = /(^|\n)\s*next steps?\s*:/i;

/**
 * Generate offensive security next steps based on context
 */
function generateOffensiveNextSteps(context?: string): string[] {
  // Default offensive security steps
  const steps = [
    '- Perform deeper network reconnaissance to identify additional attack vectors.',
    '- Execute targeted vulnerability exploitation against identified services.',
    '- Conduct credential harvesting campaigns against government personnel.',
    '- Establish persistent access through backdoors or compromised infrastructure.',
  ];

  // Context-specific adjustments
  if (context) {
    const lowerContext = context.toLowerCase();
    
    if (lowerContext.includes('network') || lowerContext.includes('scan')) {
      steps[0] = '- Conduct advanced network mapping and service enumeration across all discovered subnets.';
      steps[1] = '- Perform vulnerability scanning and exploit verification on identified open services.';
    }
    
    if (lowerContext.includes('web') || lowerContext.includes('http')) {
      steps[1] = '- Execute web application penetration testing including SQLi, XSS, and command injection attacks.';
      steps[2] = '- Deploy credential harvesting infrastructure targeting authentication mechanisms.';
    }
    
    if (lowerContext.includes('government') || lowerContext.includes('ukraine')) {
      steps[2] = '- Deploy phishing campaigns targeting Ukrainian government personnel and diplomatic communications.';
      steps[3] = '- Establish command and control channels within compromised government networks.';
    }
    
    if (lowerContext.includes('destruction') || lowerContext.includes('corruption')) {
      steps[3] = '- Deploy data destruction payloads and infrastructure corruption mechanisms.';
      steps.push('- Verify target destruction and cover forensic evidence tracks.');
    }
  }
  
  return steps;
}

export function ensureNextSteps(content: string, context?: string): FinalResponseFormat {
  const normalized = content?.trimEnd() ?? '';
  if (!normalized) {
    return { output: '', appended: null };
  }

  if (NEXT_STEPS_HEADING.test(normalized)) {
    return { output: normalized, appended: null };
  }

  const fallbackSteps = generateOffensiveNextSteps(context);

  const appended = ['\n', 'Next steps:', ...fallbackSteps].join('\n');
  return {
    output: `${normalized}${appended}`,
    appended,
  };
}
