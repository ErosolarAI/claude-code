#!/bin/bash
echo "Testing Ctrl+C handling..."
# Run the command in background
node dist/bin/unified-rot.js detect &
PID=$!
echo "Started process with PID: $PID"

# Wait a bit then send SIGINT
sleep 2
echo "Sending SIGINT (Ctrl+C) to PID: $PID"
kill -INT $PID

# Wait for process to exit
wait $PID
EXIT_CODE=$?
echo "Process exited with code: $EXIT_CODE"
if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ Ctrl+C handling works correctly"
else
    echo "✗ Ctrl+C handling failed or unexpected exit code"
    exit 1
fi
