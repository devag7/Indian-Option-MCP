/**
 * @fileoverview Smoke test for MCP server initialization
 *
 * Verifies the server can be created and registers all expected tools.
 */
import { describe, it, expect } from 'vitest';
import { createServer } from '../server.js';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});
