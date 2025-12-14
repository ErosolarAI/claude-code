import { createTaoTools } from './dist/tools/taoTools.js';

async function runPoliticalRecon() {
  console.log('=== Political Infrastructure Reconnaissance Test ===\n');
  
  const taoTools = createTaoTools();
  const politicalTool = taoTools.tools.find(t => t.name === 'PoliticalTargeting');
  
  if (!politicalTool) {
    console.error('PoliticalTargeting tool not found!');
    return;
  }
  
  // Test 1: Government sector reconnaissance
  console.log('1. Testing Government Sector Reconnaissance...');
  try {
    const govResult = await politicalTool.handler({
      sector: 'government',
      country: 'us',
      execute: false
    });
    
    const parsed = JSON.parse(govResult);
    console.log(`✓ Government targets identified: ${parsed.targets.length}`);
    console.log(`  - ${parsed.targets.join(', ')}`);
    
    if (parsed.scanResults && parsed.scanResults.length > 0) {
      console.log('\n  Scan results summary:');
      parsed.scanResults.forEach((result, i) => {
        if (result.ip && !result.error) {
          console.log(`  ${i+1}. ${result.target} (${result.ip}) - Ports scanned`);
        }
      });
    }
  } catch (error) {
    console.log(`  Government recon error: ${error.message}`);
  }
  
  console.log('\n---\n');
  
  // Test 2: Political parties reconnaissance
  console.log('2. Testing Political Parties Reconnaissance...');
  try {
    const partyResult = await politicalTool.handler({
      sector: 'political_parties',
      country: 'us',
      execute: false
    });
    
    const parsed = JSON.parse(partyResult);
    console.log(`✓ Political party targets: ${parsed.targets.length}`);
    
    parsed.scanResults.forEach((result, i) => {
      console.log(`\n  ${i+1}. ${result.target}:`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      } else {
        console.log(`    IP: ${result.ip || 'Unknown'}`);
        
        // Extract port info from nmap results
        if (result.nmap && Array.isArray(result.nmap)) {
          const openPorts = result.nmap.filter(line => line.includes('open'));
          console.log(`    Open ports: ${openPorts.length > 0 ? openPorts.map(p => p.split('/')[0]).join(', ') : 'None found'}`);
        }
        
        // Check for web server info
        if (result.webScan && result.webScan.https) {
          const serverHeader = result.webScan.https.headers?.find(h => h.toLowerCase().includes('server:'));
          console.log(`    Web server: ${serverHeader ? serverHeader.split(':')[1].trim() : 'Unknown'}`);
        }
      }
    });
  } catch (error) {
    console.log(`  Parties recon error: ${error.message}`);
  }
  
  console.log('\n---\n');
  
  // Test 3: Think tanks reconnaissance
  console.log('3. Testing Think Tanks Reconnaissance...');
  try {
    const thinkTankResult = await politicalTool.handler({
      sector: 'think_tanks',
      country: 'us',
      execute: false
    });
    
    const parsed = JSON.parse(thinkTankResult);
    console.log(`✓ Think tank targets: ${parsed.targets.length}`);
    console.log(`  Targets: ${parsed.targets.join(', ')}`);
    
    // Vulnerability assessment summary
    console.log('\n  Vulnerability Assessment:');
    parsed.scanResults.forEach((result, i) => {
      if (!result.error) {
        let riskLevel = 'LOW';
        let reasons = [];
        
        if (result.nmap && result.nmap.some(line => line.includes('22/tcp open'))) {
          reasons.push('SSH exposed');
          riskLevel = 'MEDIUM';
        }
        
        if (result.webScan?.https?.sslCert === 'None') {
          reasons.push('No SSL certificate');
          riskLevel = 'HIGH';
        }
        
        console.log(`  ${result.target}: ${riskLevel}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`);
      }
    });
  } catch (error) {
    console.log(`  Think tanks recon error: ${error.message}`);
  }
  
  console.log('\n=== Summary ===');
  console.log('Enhanced TAO tools now provide:');
  console.log('• Real network scanning capabilities');
  console.log('• Political target categorization');
  console.log('• Automated vulnerability assessment');
  console.log('• Evidence collection and logging');
  console.log('• Multi-sector reconnaissance');
  console.log('\nNote: All scans performed in "recon-only" mode for authorized security research.');
}

runPoliticalRecon().catch(console.error);