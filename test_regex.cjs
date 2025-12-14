const content = 'Reasoning through the requested steps to keep UX stable and readable. Reasoning through the requested steps to keep UX stable and readable. Reasoning through the requested steps to keep UX stable and readable. Reasoning through the requested steps to keep UX stable and readable. Reasoning through the requested steps to keep UX stable and readable. Reasoning through the requested steps to keep UX stable and readable. ';
console.log('Content length:', content.length);

// The regex from curateReasoningContent
const segments = content
  .split('\\\\n')
  .flatMap(line => line.split(/(?<=[.?!])\\\\s+/))
  .map(line => line.replace(/^[•*⏺○\\\\-\\\\u2022]+\\\\s*/, '').trim())
  .filter(Boolean);

console.log('Segments:', segments.length);
console.log('Segments[0]:', segments[0]);
console.log('Segments[0] length:', segments[0]?.length);

// Check if the split is working
const testSplit = content.split(/(?<=[.?!])\\\\s+/);
console.log('\\nTest split length:', testSplit.length);
console.log('Test split[0]:', testSplit[0]);
console.log('Test split[1]:', testSplit[1]);

// The lookbehind (?<=[.?!]) might not work in all JS engines
// Try without lookbehind
const simpleSplit = content.split(/[.?!]\\\\s+/);
console.log('\\nSimple split length:', simpleSplit.length);
console.log('Simple split[0]:', simpleSplit[0]);
console.log('Simple split[1]:', simpleSplit[1]);

// The issue might be that content ends with ". " (period space)
// So the split creates an empty last element
const trimmed = content.trim();
const trimmedSplit = trimmed.split(/[.?!]\\\\s+/);
console.log('\\nTrimmed split length:', trimmedSplit.length);
console.log('Trimmed split[0]:', trimmedSplit[0]);
console.log('Trimmed split[5]:', trimmedSplit[5]);
console.log('Trimmed split[6]:', trimmedSplit[6]);
