#!/bin/bash
cd /Users/bo/GitHub/agi-core-CLI-coding

# Test the installed agi command
echo "=== Testing installed agi command ==="
which agi
agi --version

echo -e "\n=== Testing interactive mode with timeout ==="
# Send 'hi' then Ctrl+C after 3 seconds
(
  echo "hi"
  sleep 3
  echo -e "\x03"  # Ctrl+C
) | timeout 5s agi 2>&1 | head -100

echo -e "\n=== Testing non-interactive mode ==="
echo "hi" | agi 2>&1