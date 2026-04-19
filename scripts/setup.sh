#!/usr/bin/env bash
set -euo pipefail

echo "==> rw-trader-cb setup"

# Node version check
NODE_VER=$(node --version 2>/dev/null || echo "none")
MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$MAJOR" -lt 20 ] 2>/dev/null; then
  echo "ERROR: Node.js >= 20 required (found $NODE_VER)"
  exit 1
fi
echo "    Node: $NODE_VER ✓"

# Install deps
npm install
echo "    Dependencies installed ✓"

# Copy env example
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    .env created from .env.example"
  echo ""
  echo "==> ACTION REQUIRED: Edit .env and set:"
  echo "    CB_API_KEY_NAME"
  echo "    CB_API_PRIVATE_KEY"
else
  echo "    .env already exists, skipping copy"
fi

echo ""
echo "==> Setup complete. Next steps:"
echo "    1. Edit .env with your Coinbase API credentials"
echo "    2. npm run validate    # confirm credentials work"
echo "    3. npm start           # start agent (dry-run by default)"
