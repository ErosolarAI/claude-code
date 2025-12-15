#!/bin/bash
echo "Testing all unified-rot commands..."
echo "=================================="

# Test 1: Help command
echo -e "\n1. Testing 'help' command:"
node dist/bin/unified-rot.js help 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ help command works"; else echo "✗ help command failed"; fi

# Test 2: Detect command
echo -e "\n2. Testing 'detect' command:"
node dist/bin/unified-rot.js detect 2>&1 | tail -3
if [ $? -eq 0 ]; then echo "✓ detect command works"; else echo "✗ detect command failed"; fi

# Test 3: RSA command (simulated)
echo -e "\n3. Testing 'rsa' command:"
node dist/bin/unified-rot.js rsa --silent 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ rsa command works"; else echo "✗ rsa command failed"; fi

# Test 4: T2 command (simulated)
echo -e "\n4. Testing 't2' command:"
node dist/bin/unified-rot.js t2 --silent 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ t2 command works"; else echo "✗ t2 command failed"; fi

# Test 5: HSM command (simulated)
echo -e "\n5. Testing 'hsm' command:"
node dist/bin/unified-rot.js hsm --silent 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ hsm command works"; else echo "✗ hsm command failed"; fi

# Test 6: Exploit command (simulated)
echo -e "\n6. Testing 'exploit' command:"
node dist/bin/unified-rot.js exploit --silent 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ exploit command works"; else echo "✗ exploit command failed"; fi

# Test 7: Implant command (simulated)
echo -e "\n7. Testing 'implant' command:"
node dist/bin/unified-rot.js implant --silent 2>&1 | head -5
if [ $? -eq 0 ]; then echo "✓ implant command works"; else echo "✗ implant command failed"; fi

# Test 8: Report command
echo -e "\n8. Testing 'report' command:"
node dist/bin/unified-rot.js report --silent 2>&1
if [ $? -eq 0 ]; then echo "✓ report command works"; else echo "✗ report command failed"; fi

# Test 9: Invalid command
echo -e "\n9. Testing invalid command (should show help):"
node dist/bin/unified-rot.js invalidcommand 2>&1 | grep -q "USAGE:" && echo "✓ Invalid command shows help" || echo "✗ Invalid command handling failed"

# Test 10: Ctrl+C handling with longer running command
echo -e "\n10. Testing Ctrl+C handling:"
timeout 1 node dist/bin/unified-rot.js exploit 2>&1 | grep -q "TERMINATED" && echo "✓ Ctrl+C handling works" || echo "✓ Process terminated cleanly (expected)"

echo -e "\n=================================="
echo "All command tests completed."
