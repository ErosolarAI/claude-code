import { buildDiffSegmentsFast, formatDiffClaudeStyle } from './src/tools/diffUtils.js';
const before = 'line1\nline2\nline3';
const after = 'line1\nline2 modified\nline3\nline4 added';
const diff = buildDiffSegmentsFast(before, after);
console.log('Enhanced diff with bold colors:');
console.log(formatDiffClaudeStyle(diff, true).join('\n'));
