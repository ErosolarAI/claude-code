/**
 * Output mode configuration for terminal UI
 *
 * Controls whether to use decorative box-drawing characters or plain text.
 * Plain mode outputs clipboard-friendly text without Unicode borders.
 * Automatically enabled in CI or non-interactive shells; override with AGI_PLAIN_OUTPUT=true.
 */

let _plainMode: boolean | null = null;

/**
 * Check if plain output mode is enabled.
 * Plain mode outputs text without box-drawing characters for clean clipboard copying.
 */
export function isPlainOutputMode(): boolean {
  if (_plainMode !== null) {
    return _plainMode;
  }

  const envValue = process.env['AGI_PLAIN_OUTPUT'];
  if (envValue !== undefined) {
    const envEnabled = ['true', '1', 'yes', 'on'].includes(envValue.toLowerCase());
    if (envEnabled) {
      _plainMode = true;
      return _plainMode;
    }
  }

  const isTty = Boolean(process.stdout?.isTTY && process.stdin?.isTTY);
  const isCi = Boolean(process.env['CI']);

  // Default to plain logging in non-interactive/CI environments; rich UI only in TTY sessions.
  _plainMode = !isTty || isCi;

  return _plainMode;
}

/**
 * Override the plain output mode setting (useful for testing)
 */
export function setPlainOutputMode(enabled: boolean): void {
  _plainMode = enabled;
}

/**
 * Reset plain output mode to check environment variable again
 */
export function resetPlainOutputMode(): void {
  _plainMode = null;
}
