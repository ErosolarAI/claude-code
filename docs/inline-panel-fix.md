# Inline Panel Dismissal Fix

## Problem

The inline panel was not displaying when `/secrets` or `/help` commands were submitted. The panel would be set but immediately dismissed before the user could see it.

## Root Cause

The issue was in the command submission flow in `src/headless/interactiveShell.ts`:

1. When `/secrets` was submitted, `handleSubmit()` was called
2. **First action**: `dismissInlinePanel()` was called unconditionally at the start of `handleSubmit()`
3. Then `handleSlashCommand()` was called, which triggered `showSecrets()`
4. `showSecrets()` set the inline panel content
5. **Result**: Panel was dismissed before it was shown, so it never appeared

Additionally, the `onChange` callback was dismissing the panel whenever the input changed, including when the input was cleared after submission.

## Solution

### Changes Made

1. **Removed premature dismissal** (line 777):
   - Removed `this.dismissInlinePanel()` from the start of `handleSubmit()`
   - Now panel dismissal happens selectively based on command type

2. **Added conditional dismissal** (lines 792, 799):
   - Unknown slash commands dismiss the panel
   - Regular user prompts (non-slash commands) dismiss the panel
   - Known slash commands like `/secrets` and `/help` do NOT dismiss the panel

3. **Removed onChange dismissal** (line 159):
   - Removed `onChange: () => this.dismissInlinePanel()` callback
   - Panel now only dismisses via:
     - Auto-dismiss timer (8 seconds)
     - Explicit dismissal when submitting a regular prompt

### Code Changes

```typescript
// BEFORE
private handleSubmit(text: string): void {
  const trimmed = text.trim();

  // Dismiss any inline panel on submit
  this.dismissInlinePanel();  // ❌ Dismissed too early!

  // Handle slash commands...
}

// AFTER
private handleSubmit(text: string): void {
  const trimmed = text.trim();

  // Handle slash commands first
  if (trimmed.startsWith('/')) {
    if (this.handleSlashCommand(trimmed)) {
      return;  // ✅ Known commands like /secrets don't dismiss
    }
    this.dismissInlinePanel();  // ✅ Only unknown commands dismiss
    return;
  }

  this.dismissInlinePanel();  // ✅ Regular prompts dismiss
  // Process regular prompt...
}
```

## Testing

Created comprehensive tests in `test/inline-panel.test.ts`:

1. ✅ Panel shown when `/secrets` is submitted
2. ✅ Panel shown when `/help` is submitted
3. ✅ Panel dismissed when regular prompt is submitted
4. ✅ Panel NOT dismissed on onChange after `/secrets`
5. ✅ Panel auto-dismisses after 8 seconds

All tests pass (5/5).

## Behavior After Fix

- `/secrets` or `/help` → Panel displays for 8 seconds or until next regular prompt
- Regular user prompt → Panel dismissed immediately
- Unknown slash command → Panel dismissed with error message
- Typing after panel shown → Panel stays visible (not dismissed on input change)

## Files Modified

1. `src/headless/interactiveShell.ts` - Main fix
2. `src/tools/metaTools.ts` - TypeScript fix (added `extends Record<string, unknown>`)
3. `src/tools/taoTools.ts` - TypeScript fix (added `extends Record<string, unknown>`)
4. `test/inline-panel.test.ts` - New test file

## Impact

- ✅ Inline panel now displays correctly for `/secrets` and `/help`
- ✅ User can read the panel content before it auto-dismisses
- ✅ Panel behavior is predictable and intuitive
- ✅ No regression in other functionality
