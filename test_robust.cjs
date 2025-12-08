const { isMultilinePaste, processPaste, generatePasteSummary } = require('./dist/core/multilinePasteHandler.js');

// Test problematic cases
const tests = [
  { text: '\n\n\n', desc: 'Only newlines' },
  { text: '   \n   \n   ', desc: 'Only spaces' },
  { text: '\t\n\t\n\t', desc: 'Only tabs' },
  { text: '', desc: 'Empty string' },
  { text: ' ', desc: 'Single space' },
  { text: '\n', desc: 'Single newline' },
  { text: 'a', desc: 'Single char' },
  { text: 'a\nb', desc: 'Two chars' },
  { text: 'a\n\nb', desc: 'Two chars with empty middle' },
  { text: '!\n@\n#', desc: 'Three punctuation lines' },
  { text: '   a   \n   b   \n   c   ', desc: 'Three lines with surrounding spaces' },
];

console.log('Testing robustness:');
for (const test of tests) {
  console.log(`\nTest: ${test.desc}`);
  console.log(`Text: ${JSON.stringify(test.text)}`);
  try {
    const isMultiline = isMultilinePaste(test.text);
    console.log(`isMultilinePaste: ${isMultiline}`);
    
    if (isMultiline) {
      const summary = generatePasteSummary(test.text);
      console.log(`Summary: ${summary.summary}`);
      console.log(`Preview: "${summary.preview}"`);
      console.log(`Line count: ${summary.lineCount}, Char count: ${summary.charCount}`);
    }
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
    console.log(`Stack: ${e.stack}`);
  }
}
