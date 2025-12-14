import { UnifiedUIRenderer } from './dist/ui/UnifiedUIRenderer.js';
import { PassThrough } from 'stream';

const input = new PassThrough();
input.isTTY = true;
input.setRawMode = () => {};

const output = new PassThrough();
output.isTTY = true;
output.columns = 80;
output.rows = 24;

const renderer = new UnifiedUIRenderer(output, input);

// Enable debug mode  
console.log('Setting debug mode...');
renderer.updateModeToggles({ debugEnabled: true });

// Check internal state
console.log('Toggle state:', renderer.toggleState);

// Monkey patch to see what's happening
const originalFormatContent = renderer.formatContent.bind(renderer);
renderer.formatContent = function(event) {
  console.log('\\nformatContent called:');
  console.log('  type:', event.type);
  console.log('  rawType:', event.rawType);
  console.log('  content length:', event.content?.length);
  console.log('  content preview:', event.content?.substring(0, 100));
  
  const result = originalFormatContent(event);
  console.log('  result length:', result?.length);
  console.log('  result:', JSON.stringify(result));
  return result;
};

// Add a simple thought
const thought = 'This is a test thought.';
console.log('\\nAdding thought event...');
renderer.addEvent('thought', thought);

// Force processing
setTimeout(async () => {
  console.log('\\nFlushing events...');
  await renderer.flushEvents();
  
  console.log('\\nReading output...');
  output.setEncoding('utf8');
  let data = '';
  let chunk;
  while ((chunk = output.read()) !== null) {
    data += chunk;
  }
  
  console.log('Final output length:', data.length);
  console.log('Final output:', JSON.stringify(data));
  
  renderer.cleanup();
  process.exit(0);
}, 100);
