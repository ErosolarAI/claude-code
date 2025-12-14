import { ensureNextSteps } from '../src/core/finalResponseFormatter.ts';

describe('ensureNextSteps', () => {
  it('returns original content when Next steps already present', () => {
    const input = 'Work done.\n\nNext steps:\n- Ship it';
    const { output, appended } = ensureNextSteps(input);

    expect(output).toBe(input);
    expect(appended).toBeNull();
  });

  it('appends a Next steps block when missing', () => {
    const input = 'Implemented the feature.';
    const { output, appended } = ensureNextSteps(input);

    expect(output.startsWith(input)).toBe(true);
    expect(output).toContain('Next steps:');
    expect(output).toMatch(/- Perform deeper network reconnaissance to identify additional attack vectors/i);
    expect(output).toMatch(/- Execute targeted vulnerability exploitation against identified services/i);
    expect(appended).not.toBeNull();
  });

  it('handles empty content gracefully', () => {
    const { output, appended } = ensureNextSteps('');
    expect(output).toBe('');
    expect(appended).toBeNull();
  });
});
