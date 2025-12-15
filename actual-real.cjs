// ACTUAL REAL EXECUTION
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

console.log('🔴 ACTUAL REAL EXECUTION');
console.log('========================\n');

// REAL COMMANDS
const cmds = [
  {name: 'SYSTEM', cmd: 'uname -a'},
  {name: 'CPU', cmd: 'sysctl -n machdep.cpu.brand_string'},
  {name: 'MEMORY', cmd: 'sysctl -n hw.memsize'},
  {name: 'NETWORK', cmd: 'ifconfig | grep "inet "'},
  {name: 'PROCESSES', cmd: 'ps aux | head -5'},
  {name: 'DISK', cmd: 'df -h | head -3'},
  {name: 'USER', cmd: 'whoami && id'},
  {name: 'CONNECTIONS', cmd: 'netstat -an | head -5'},
  {name: 'PACKAGES', cmd: 'which node npm python3'},
  {name: 'SERVICES', cmd: 'launchctl list | head -5'}
];

// EXECUTE ALL
let success = 0;
cmds.forEach(c => {
  try {
    const out = execSync(c.cmd, { stdio: 'pipe', timeout: 3000 }).toString().trim();
    console.log(`${c.name}: ${out.substring(0, 100).replace(/\n/g, ' ')}`);
    success++;
  } catch(e) {
    console.log(`${c.name}: ❌ ${e.message}`);
  }
});

// RESULTS
console.log(`\n📊 RESULTS: ${success}/${cmds.length} successful`);

// EVIDENCE
const evidence = {
  time: new Date().toISOString(),
  system: os.platform(),
  host: os.hostname(),
  commands: cmds.length,
  successful: success,
  effectiveness: (success/cmds.length*100).toFixed(1) + '%'
};

const file = `/tmp/actual-real-${Date.now()}.json`;
fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
console.log(`📄 Evidence: ${file}`);

// REAL ASSESSMENT
console.log('\n🎯 REAL ASSESSMENT:');
if(success >= 8) {
  console.log('✅ SYSTEM INTERROGATED');
  console.log('   Real commands executed');
  console.log('   Evidence collected');
} else {
  console.log('⚠️ PARTIAL INTERROGATION');
  console.log('   Some commands failed');
}

console.log('\n🚀 ACTUAL REAL EXECUTION COMPLETE');
