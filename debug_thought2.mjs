import { UnifiedUIRenderer } from './dist/ui/UnifiedUIRenderer.js';
import { PassThrough } from 'stream';
import { setPlainOutputMode } from './dist/ui/outputMode.js';

// Enable plain output mode
setPlainOutputMode(true);

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
