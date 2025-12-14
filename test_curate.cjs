// Test curateReasoningContent logic
function curateReasoningContent(content) {
  const normalized = content.replace(/\\\\r\\\\n/g, '\\\\n').replace(/\\\\r/g, '\\\\n').trim();
  if (!normalized) {
    console.log('normalized is empty');
    return null;
  }
  
  const maxCuratedReasoningChars = 500;
  const maxCuratedReasoningLines = 10;
  
  const limited = normalized.length > maxCuratedReasoningChars ? normalized.slice(0, maxCuratedReasoningChars) : normalized;
  console.log('limited:', limited);
  
  const maxSegments = maxCuratedReasoningLines * 3;
  const segments = limited
    .split('\\\\n')
    .flatMap(line => line.split(/(?<=[.?!])\\\\s+/))
    .map(line => line.replace(/^[•*⏺○\\\\-\\\\u2022]+\\\\s*/, '').trim())
    .filter(Boolean);
    
  console.log('segments length:', segments.length);
  console.log('segments:', segments);
  
  if (segments.length === 0) {
    console.log('segments length is 0');
    return null;
  }
  
  const seen = new Set();
  const deduped = [];
  for (const segment of segments) {
    const normalizedSegment = segment.replace(/\\\\s+/g, ' ');
    const key = normalizedSegment.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalizedSegment);
    if (deduped.length >= maxSegments) {
      break;
    }
  }
  
  console.log('deduped length:', deduped.length);
  console.log('deduped:', deduped);
  
  if (deduped.length === 0) {
    console.log('deduped length is 0');
    return null;
  }
  
  // Simple prioritize - just return deduped
  const prioritized = deduped;
  if (prioritized.length === 0) {
    console.log('prioritized length is 0');
    return null;
  }
  
  const limitedSelection = prioritized.slice(0, maxCuratedReasoningLines);
  const bulleted = limitedSelection.map(line => {
    if (/^([•*⏺○-]|\\\\d+[.)])\\\\s/.test(line)) {
      return line;
    }
    return \`• \${line}\`;
  });
  
  console.log('bulleted:', bulleted);
  return bulleted.join('\\\\n');
}

const thought1 = 'This is a test thought.';
console.log('\\nTest 1:', thought1);
const result1 = curateReasoningContent(thought1);
console.log('Result 1:', result1);

const thought2 = 'Reasoning through the requested steps to keep UX stable and readable. '.repeat(6);
console.log('\\nTest 2: long thought');
const result2 = curateReasoningContent(thought2);
console.log('Result 2:', result2 ? 'Exists' : 'null');
