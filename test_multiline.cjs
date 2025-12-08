const { isMultilinePaste, processPaste, generatePasteSummary } = require('./dist/core/multilinePasteHandler.js');

// Test edge cases
const edgeCases = [
  '\n\n\n', // Only newlines
  '   \n   \n   ', // Only spaces with newlines
  '\t\n\t\n\t', // Only tabs with newlines
  '', // Empty string
  ' ', // Single space
  '\n', // Single newline
  '\n\n', // Two newlines
  'a\nb', // Two lines with content
  'a\n\nb', // Two lines with empty middle
  'a\n\n\nb', // Two lines with two empties
  '// comment\n// comment\n// comment', // Comments (3 lines)
  '{\n\"key\": \"value\"\n}', // JSON with 3 lines
  'first line is very long and should be truncated properly in the preview but we need to check the behavior',
];

console.log('Edge case testing:');
for (const text of edgeCases) {
  const isMultiline = isMultilinePaste(text);
  console.log(`${isMultiline ? 'ML' : 'SL'}: ${JSON.stringify(text).slice(0,60)}${JSON.stringify(text).length > 60 ? '...' : ''}`);
  
  if (isMultiline) {
    try {
      const summary = generatePasteSummary(text);
      console.log(`  Summary: ${summary.summary}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}
