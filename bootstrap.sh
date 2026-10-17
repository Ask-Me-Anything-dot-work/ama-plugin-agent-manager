#!/bin/bash
set -euo pipefail

echo "--- Bootstrapping ama-plugin-agent-manager ---"

# 1. Check for Bun
if ! command -v bun &> /dev/null; then
    echo "ERROR: Bun is not installed. Please install Bun first (https://bun.sh)."
    exit 1
fi

# 2. Install dependencies
echo "--- Installing dependencies ---"
bun install

# 3. Git hooks
if [ -d ".git" ]; then
    echo "--- Setting up Git hooks ---"
    bun run prepare
fi

echo "--- ama-plugin-agent-manager bootstrap complete ---"
