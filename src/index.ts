#!/usr/bin/env node
/**
 * @module index
 * Entry point for the Indian Option MCP Server.
 * Connects the MCP server to stdio transport for Claude Desktop integration.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🇮🇳 Indian Option MCP Server v1.1.0 running on stdio');
  console.error('   Data provider: ' + (process.env.DATA_PROVIDER || 'nse'));
}

main().catch((error) => {
  console.error('Fatal error starting Indian Option MCP Server:', error);
  process.exit(1);
});
