#!/bin/bash
cd /Users/bo/GitHub/agi-core-CLI-coding

echo "=== Running agi with 'hi' and capturing output ==="

# Create a named pipe to feed input
rm -f /tmp/agi_input
mkfifo /tmp/agi_input

# Run agi in background, feeding it commands
(
  echo "hi"
  sleep 2
  echo "/exit"
) > /tmp/agi_input &

# Run agi with the input pipe, capture raw output
agi < /tmp/agi_input 2>&1 | tee /tmp/agi_output.raw

echo -e "\n=== Raw output saved to /tmp/agi_output.raw ==="
echo "=== First 200 characters: ==="
head -c 200 /tmp/agi_output.raw | cat -v
echo -e "\n=== Full output with cat -v (showing control chars): ==="
cat -v /tmp/agi_output.raw | head -100