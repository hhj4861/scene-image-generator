#!/bin/bash
URL="http://34.64.168.173:3000/health"
echo "Waiting for server at $URL..."

for i in {1..30}; do
  if curl -s --max-time 5 "$URL" | grep "ok"; then
    echo "✅ Server is UP!"
    exit 0
  fi
  echo "Attempt $i/30: Server not ready yet. Waiting 10s..."
  sleep 10
done

echo "❌ Server still down after 300s"
exit 1
