/**
 * Ensures final assistant responses include a "Next steps" section.
 * Returns both the full output and any appended text so callers can stream just the delta.
 */
export interface FinalResponseFormat {
  output: string;
  appended: string | null;
}

const NEXT_STEPS_HEADING = /(^|\n)\s*next steps?\s*:/i;

export function ensureNextSteps(content: string): FinalResponseFormat {
  const normalized = content?.trimEnd() ?? '';
  if (!normalized) {
    return { output: '', appended: null };
  }

  if (NEXT_STEPS_HEADING.test(normalized)) {
    return { output: normalized, appended: null };
  }

  const fallbackSteps = [
    '- I can run checks or prep a PR-style summary if needed.',
    '- Tell me if you want more changes or tests.',
    '- I can analyze the current state or suggest optimizations.',
    '- Let me know what specific actions you\'d like me to take.',
  ];

  const appended = ['\n', 'Next steps:', ...fallbackSteps].join('\n');
  return {
    output: `${normalized}${appended}`,
    appended,
  };
}
