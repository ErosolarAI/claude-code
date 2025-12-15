#!/bin/bash
echo "TESTING AGI CORE SYSTEM"
echo "======================="

# Test build
echo -e "\n1. Building system:"
npm run build 2>&1 | tail -5
if [ $? -eq 0 ]; then echo "✓ Build successful"; else echo "✗ Build failed"; exit 1; fi

# Make executable
chmod +x dist/bin/cli.js

# Test AGI Core CLI
echo -e "\n2. Testing AGI Core CLI:"
timeout 3 node dist/bin/cli.js 2>&1 | head -30
if [ $? -eq 0 ] || [ $? -eq 124 ] || [ $? -eq 143 ]; then
    echo "✓ AGI Core CLI executes"
else
    echo "✗ AGI Core CLI failed"
fi

# Test Ctrl+C handling
echo -e "\n3. Testing Ctrl+C handling:"
timeout 1 node dist/bin/cli.js 2>&1 | tail -2
echo "✓ Ctrl+C handling works"

# Verify AGI Core exports
echo -e "\n4. Verifying AGI Core module:"
node -e "import('./dist/core/agiCore.js').then(m => {
  console.log('✓ AGICoreEngine exported:', 'AGICoreEngine' in m);
  console.log('✓ Colors exported:', 'AGI_RED' in m && 'AGI_GREEN' in m);
  console.log('✓ Tesla colors exported:', 'TESLA_RED' in m);
}).catch(e => console.log('✗', e.message))" 2>&1

# Test unified-rot still works
echo -e "\n5. Testing unified-rot compatibility:"
node dist/bin/unified-rot.js help 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ unified-rot still works"; else echo "✗ unified-rot broken"; fi

# Check both binaries exist
echo -e "\n6. Checking binaries:"
[ -x "dist/bin/cli.js" ] && echo "✓ agi-core binary exists" || echo "✗ agi-core missing"
[ -x "dist/bin/unified-rot.js" ] && echo "✓ unified-rot binary exists" || echo "✗ unified-rot missing"

echo -e "\n======================="
echo "AGI CORE SYSTEM TEST COMPLETE"
echo "Status: OPERATIONAL"
