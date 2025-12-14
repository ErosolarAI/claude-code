#!/bin/bash
cd /Users/bo/GitHub/agi-core-CLI-coding

echo "=== Testing installed agi command ==="
which agi
agi --version

echo -e "\n=== Testing non-interactive mode ==="
echo "hi" | agi 2>&1

echo -e "\n=== Testing with -q flag ==="
agi -q "hi" 2>&1

echo -e "\n=== Testing with initial prompt ==="
agi "hi" 2>&1 | head -50