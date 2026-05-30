#!/bin/bash
# Wrapper script for Indian Option MCP Server
# This ensures the server starts correctly regardless of Claude Desktop's environment

# Use nvm node if available, otherwise fall back to system node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh" 2>/dev/null
fi

# Change to the project directory so Node can find node_modules
cd "$(dirname "$0")"

# Run the server
exec node dist/index.js
