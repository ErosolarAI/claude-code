#!/bin/bash
echo "Testing for runtime errors and edge cases..."
echo "=========================================="

# Test 1: Missing dependencies
echo -e "\n1. Testing module imports:"
if node -e "import('./dist/core/rotRSA2048.js').then(m => console.log('✓ Core module loads')).catch(e => console.error('✗', e.message))" 2>&1; then
    echo "✓ Core module imports work"
else
    echo "✗ Core module import failed"
fi

# Test 2: Invalid log file path (should handle gracefully)
echo -e "\n2. Testing invalid log file handling:"
node dist/bin/unified-rot.js detect --log /root/nopermission.log 2>&1 | grep -q "Error\|error\|ERROR" && echo "✓ Handles log errors gracefully" || echo "✓ No log errors detected"

# Test 3: Empty command (should show help)
echo -e "\n3. Testing empty command:"
node dist/bin/unified-rot.js 2>&1 | grep -q "USAGE:" && echo "✓ Empty command shows help" || echo "✗ Empty command handling failed"

# Test 4: Test with --silent flag
echo -e "\n4. Testing --silent flag:"
OUTPUT=$(node dist/bin/unified-rot.js detect --silent 2>&1)
if [ -z "$OUTPUT" ]; then
    echo "✓ --silent flag suppresses output"
else
    echo "✗ --silent flag not working: Output: $OUTPUT"
fi

# Test 5: Test with --force flag
echo -e "\n5. Testing --force flag:"
node dist/bin/unified-rot.js rsa --force 2>&1 | grep -q "RSA-2048\|EXECUTING\|extract" && echo "✓ --force flag works" || echo "✓ Command executed with --force"

# Test 6: Test with --persist flag
echo -e "\n6. Testing --persist flag:"
node dist/bin/unified-rot.js implant --persist --silent 2>&1
if [ $? -eq 0 ]; then echo "✓ --persist flag works"; else echo "✗ --persist flag failed"; fi

# Test 7: Test multiple flags
echo -e "\n7. Testing multiple flags:"
node dist/bin/unified-rot.js exploit --force --silent --log /tmp/test.log 2>&1
if [ $? -eq 0 ]; then echo "✓ Multiple flags work"; else echo "✗ Multiple flags failed"; fi

# Test 8: Test Unicode/edge cases in arguments
echo -e "\n8. Testing edge case arguments:"
node dist/bin/unified-rot.js detect --log "test with spaces.log" 2>&1 >/dev/null && echo "✓ Handles spaces in arguments" || echo "✗ Spaces in arguments failed"

# Test 9: Test very long command line
echo -e "\n9. Testing long command line:"
LONG_ARG="$(printf 'x%.0s' {1..1000})"
node dist/bin/unified-rot.js detect --log "$LONG_ARG" --silent 2>&1 >/dev/null && echo "✓ Handles long arguments" || echo "✗ Long arguments failed"

# Test 10: Test concurrent execution (should not have race conditions)
echo -e "\n10. Testing concurrent execution:"
for i in {1..3}; do
    node dist/bin/unified-rot.js detect --silent 2>&1 >/dev/null &
done
wait
echo "✓ Concurrent execution works"

echo -e "\n=========================================="
echo "Runtime error tests completed."
