const { PassThrough } = require('stream');
const { UnifiedUIRenderer } = require('./dist/ui/UnifiedUIRenderer.js');

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

// Check toggle state
console.log('Toggle state after update:', renderer.toggleState);

// Add a simple thought
const thought = 'This is a test thought.';
console.log('Adding thought:', thought);
renderer.addEvent('thought', thought);

// Try to flush
setTimeout(() => {
  console.log('Reading output...');
  output.setEncoding('utf8');
  let data = '';
  let chunk;
  while ((chunk = output.read()) !== null) {
    data += chunk;
  }
  console.log('Output:', JSON.stringify(data));
  console.log('Output length:', data.length);
  
  if (!data.includes('thinking') && !data.includes('⏺')) {
    console.log('ERROR: Thought not rendered!');
  }
  
  renderer.cleanup();
  process.exit(0);
}, 100);
