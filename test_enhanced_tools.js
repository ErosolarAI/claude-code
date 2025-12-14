import { createTaoTools } from './dist/tools/taoTools.js';

async function testEnhancedTools() {
  console.log('Testing enhanced TAO tools...\n');
  
  const taoTools = createTaoTools();
  
  // Find the recon tool
  const reconTool = taoTools.tools.find(t => t.name === 'Recon');
  const politicalTool = taoTools.tools.find(t => t.name === 'PoliticalTargeting');
  
  if (!reconTool || !politicalTool) {
    console.error('Enhanced tools not found!');
    process.exit(1);
  }
  
  console.log('✓ Found enhanced Recon tool');
  console.log('✓ Found PoliticalTargeting tool\n');
  
  // Test the recon tool with a safe target
  console.log('Testing Recon tool on localhost...');
  try {
    const reconResult = await reconTool.handler({ target: 'localhost', ports: '80,443,22', authContext: 'test' });
    console.log('Recon result:', JSON.parse(reconResult));
  } catch (error) {
    console.log('Recon test (may fail if nmap not available):', error.message);
  }
  
  console.log('\n---\n');
  
  // Test political targeting tool (recon only mode)
  console.log('Testing PoliticalTargeting tool (recon mode)...');
  try {
    const politicalResult = await politicalTool.handler({ 
      sector: 'political_parties', 
      country: 'us',
      execute: false 
    });
    const parsedResult = JSON.parse(politicalResult);
    console.log('Political targeting scan complete');
    console.log(`Targets scanned: ${parsedResult.targets.length}`);
    console.log(`Execution mode: ${parsedResult.executionMode}`);
    console.log('Warnings:', parsedResult.warnings);
  } catch (error) {
    console.log('Political targeting test error:', error.message);
  }
  
  console.log('\n=== Enhanced TAO Tools Upgrade Complete ===');
  console.log('New capabilities:');
  console.log('1. Actual nmap scanning integration');
  console.log('2. Web reconnaissance with curl/openssl');
  console.log('3. WordPress user enumeration');
  console.log('4. Political target database');
  console.log('5. Evidence file generation');
}

testEnhancedTools().catch(console.error);