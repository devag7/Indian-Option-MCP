#!/usr/bin/env node
/**
 * Debug script that tests the MCP server the EXACT same way Claude Desktop does.
 * It spawns the server as a child process and monitors stdin/stdout/stderr.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, 'dist/index.js');
const nodePath = '/Users/devagarwalla/.nvm/versions/node/v22.14.0/bin/node';

console.log(`[DEBUG] Spawning: ${nodePath} ${serverPath}`);
console.log(`[DEBUG] Time: ${new Date().toISOString()}`);

const child = spawn(nodePath, [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});

let stdoutBuffer = '';

child.stdout.on('data', (chunk) => {
  const data = chunk.toString();
  stdoutBuffer += data;
  console.log(`[STDOUT] (${Date.now()}) ${data.trim()}`);
});

child.stderr.on('data', (chunk) => {
  console.log(`[STDERR] (${Date.now()}) ${chunk.toString().trim()}`);
});

child.on('error', (err) => {
  console.error(`[ERROR] Child process error: ${err.message}`);
});

child.on('exit', (code, signal) => {
  console.log(`[EXIT] code=${code} signal=${signal}`);
});

// Wait 500ms for the process to start, then send initialize
setTimeout(() => {
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {
        extensions: {
          'io.modelcontextprotocol/ui': {
            mimeTypes: ['text/html;profile=mcp-app'],
          },
        },
      },
      clientInfo: { name: 'claude-ai', version: '0.1.0' },
    },
  });

  console.log(`[DEBUG] Sending initialize at ${Date.now()}`);
  child.stdin.write(initMsg + '\n');

  // Wait 5 seconds for response
  setTimeout(() => {
    if (!stdoutBuffer.trim()) {
      console.error('[FAIL] No response received after 5 seconds!');
      console.error('[DEBUG] This means the server is NOT writing to stdout');
    } else {
      console.log('[PASS] Response received!');
    }

    // Send tools/list
    const toolsMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'notifications/initialized',
    });
    child.stdin.write(toolsMsg + '\n');

    const toolsList = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    child.stdin.write(toolsList + '\n');

    setTimeout(() => {
      child.kill();
      process.exit(0);
    }, 3000);
  }, 5000);
}, 500);
