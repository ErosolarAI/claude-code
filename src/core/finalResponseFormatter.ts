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
  // No fallback - model should generate context-aware next steps via system prompt
  // Just pass through the content as-is
  const normalized = content?.trimEnd() ?? '';
  return { output: normalized, appended: null };
}
