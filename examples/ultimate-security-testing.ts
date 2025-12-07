/**
 * Ultimate Security Testing Example
 * Demonstrates offensive security capabilities of Erosolar CLI
 * 
 * Run with: npm run security-example
 */

import { createTaoTools } from '../src/tools/taoTools';

async function main() {
  console.log('🚀 Erosolar CLI - Ultimate Security Testing Demo\n');
  
  // Create TAO tools suite
  const taoTools = createTaoTools(process.cwd());
  
  // Find specific tools
  const findTool = (name: string) => taoTools.tools.find(t => t.name === name);
  
  // Demo 1: Reconnaissance
  console.log('🔍 Phase 1: Reconnaissance');
  console.log('─'.repeat(60));
  
  const reconTool = findTool('Recon');
  if (reconTool) {
    console.log('Performing DNS reconnaissance on localhost...');
    try {
      const result = await reconTool.handler({ target: 'localhost', mode: 'dns' });
      console.log('DNS Recon Result:', typeof result === 'string' ? result.substring(0, 200) + '...' : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Recon error:', error);
    }
  }
  
  // Demo 2: Port Scanning (Probe)
  console.log('\n📡 Phase 2: Port Scanning');
  console.log('─'.repeat(60));
  
  const probeTool = findTool('Probe');
  if (probeTool) {
    console.log('Probing common ports on localhost...');
    try {
      const result = await probeTool.handler({ target: 'localhost', ports: [80, 443, 22, 8080] });
      console.log('Probe Result:', typeof result === 'string' ? result.substring(0, 200) + '...' : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Probe error:', error);
    }
  }
  
  // Demo 3: Payload Generation
  console.log('\n⚡ Phase 3: Payload Generation');
  console.log('─'.repeat(60));
  
  const payloadTool = findTool('Payload');
  if (payloadTool) {
    console.log('Generating XSS payload for HTML context...');
    try {
      const result = await payloadTool.handler({ type: 'xss', context: 'html' });
      console.log('Payload Result:', typeof result === 'string' ? result.substring(0, 200) + '...' : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Payload error:', error);
    }
  }
  
  // Demo 4: Hash Cracking (Identification)
  console.log('\n🔐 Phase 4: Hash Analysis');
  console.log('─'.repeat(60));
  
  const hashTool = findTool('Hash');
  if (hashTool) {
    console.log('Identifying hash type for sample MD5 hash...');
    try {
      const result = await hashTool.handler({ action: 'identify', input: '5d41402abc4b2a76b9719d911017c592' });
      console.log('Hash Identification Result:', typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Hash error:', error);
    }
  }
  
  // Demo 5: Natural Language Security Operations
  console.log('\n🤖 Phase 5: Natural Language Security Ops (TaoOps)');
  console.log('─'.repeat(60));
  
  const taoOpsTool = findTool('TaoOps');
  if (taoOpsTool) {
    console.log('Parsing natural language security request...');
    try {
      const result = await taoOpsTool.handler({ 
        prompt: 'Scan localhost for open ports and identify services',
        execute: false 
      });
      console.log('TaoOps Parsing Result:', typeof result === 'string' ? result.substring(0, 300) + '...' : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('TaoOps error:', error);
    }
  }
  
  console.log('\n✅ Demo completed successfully!');
  console.log('\n📋 Offensive Security Capabilities Available:');
  console.log('  • Reconnaissance (DNS, subdomain, banner grabbing)');
  console.log('  • Network probing and port scanning');
  console.log('  • Vulnerability scanning and fuzzing');
  console.log('  • Payload generation (XSS, SQLi, RCE, etc.)');
  console.log('  • Hash identification and cracking');
  console.log('  • Cryptography operations');
  console.log('  • Reverse shell generation');
  console.log('  • Web exploitation (Header injection, SSTI, etc.)');
  console.log('  • Cloud infrastructure attacks');
  console.log('  • Industrial control system attacks');
  console.log('  • AI/ML model exploitation');
  console.log('  • And many more...');
  
  console.log('\n🔒 IMPORTANT: Use these capabilities only for authorized security testing.');
  console.log('   Always obtain proper authorization before testing any system.\n');
}

// Run the demo
main().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});