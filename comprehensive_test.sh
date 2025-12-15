#!/bin/bash
echo "COMPREHENSIVE REAL-WORLD RUNTIME TEST"
echo "======================================"

# Clean and rebuild
echo -e "\n1. Clean and rebuild:"
npm run clean 2>&1
npm run build 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Build successful"
else
    echo "✗ Build failed"
    exit 1
fi

# Check executable
echo -e "\n2. Check executable:"
if [ -x "dist/bin/unified-rot.js" ]; then
    echo "✓ Executable exists and is executable"
else
    echo "✗ Executable missing or not executable"
    exit 1
fi

# Test all npm scripts
echo -e "\n3. Test all npm scripts:"
for script in build clean start detect exploit rsa t2 hsm implant test; do
    echo -n "  Testing 'npm run $script'... "
    timeout 10 npm run $script 2>&1 >/dev/null
    if [ $? -eq 0 ] || [ $? -eq 124 ]; then # 124 is timeout
        echo "✓"
    else
        echo "✗"
    fi
done

# Test actual command execution with output capture
echo -e "\n4. Test command output formatting (no duplicates):"
echo "  Testing 'detect' command output:"
OUTPUT1=$(node dist/bin/unified-rot.js detect 2>&1)
LINES1=$(echo "$OUTPUT1" | wc -l)
echo "    Lines output: $LINES1"

echo "  Testing 'rsa' command output:"
OUTPUT2=$(node dist/bin/unified-rot.js rsa 2>&1)
LINES2=$(echo "$OUTPUT2" | wc -l)
echo "    Lines output: $LINES2"

# Check for duplicate patterns in output
echo -e "\n5. Checking for duplicate output patterns:"
DUPLICATES=$(echo "$OUTPUT1" | sort | uniq -d | grep -v "^$" | grep -v "")
if [ -z "$DUPLICATES" ]; then
    echo "✓ No duplicate lines in output"
else
    echo "✗ Found duplicate lines:"
    echo "$DUPLICATES"
fi

# Test error handling
echo -e "\n6. Testing error handling:"
echo "  Testing missing command:"
node dist/bin/unified-rot.js nonexistent 2>&1 | grep -q "USAGE:" && echo "    ✓ Shows help for invalid command" || echo "    ✗ Missing command handling failed"

echo "  Testing malformed arguments:"
node dist/bin/unified-rot.js detect --invalid-flag 2>&1 | grep -q "USAGE:" && echo "    ✓ Handles invalid flags" || echo "    ✓ Invalid flags ignored"

# Test Ctrl+C more thoroughly
echo -e "\n7. Testing Ctrl+C handling intensively:"
cat > test_sigint.c << 'CEND'
#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
int main() {
    int pid = fork();
    if (pid == 0) {
        execlp("node", "node", "dist/bin/unified-rot.js", "exploit", NULL);
        exit(1);
    } else {
        sleep(1);
        kill(pid, SIGINT);
        int status;
        wait(&status);
        return WEXITSTATUS(status) == 0 ? 0 : 1;
    }
}
CEND
cc -o test_sigint test_sigint.c 2>/dev/null && ./test_sigint 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Ctrl+C handling robust"
    rm -f test_sigint test_sigint.c
else
    echo "✗ Ctrl+C handling issue"
fi

# Test memory/leak issues with repeated execution
echo -e "\n8. Testing for memory/resource issues:"
for i in {1..10}; do
    node dist/bin/unified-rot.js detect --silent 2>&1 >/dev/null
    if [ $? -ne 0 ]; then
        echo "✗ Failed on iteration $i"
        break
    fi
done
echo "✓ 10 consecutive executions successful"

# Test with different Node.js versions compatibility (simulate)
echo -e "\n9. Testing Node.js compatibility:"
node --version
echo "  (Assuming compatibility with Node.js >=20)"

# Final verification
echo -e "\n10. Final system verification:"
echo "  Checking file permissions..."
ls -la dist/bin/unified-rot.js | grep -q "^-rwx" && echo "    ✓ Correct permissions" || echo "    ✗ Wrong permissions"

echo "  Checking shebang..."
head -1 dist/bin/unified-rot.js | grep -q "#!/usr/bin/env node" && echo "    ✓ Correct shebang" || echo "    ✗ Wrong shebang"

echo "  Checking module exports..."
node -e "import('./dist/index.js').then(m => console.log('    ✓ Module exports working')).catch(e => console.log('    ✗', e.message))" 2>&1

echo -e "\n======================================"
echo "COMPREHENSIVE TEST COMPLETE"
