#!/usr/bin/env node
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveRepoPath } from './config.js';
import { KnowledgeBase } from './repo.js';
import { createKbServer } from './server.js';

try {
  const kb = await KnowledgeBase.open(
    resolveRepoPath(process.argv.slice(2), process.env, process.cwd()),
  );
  await createKbServer(kb).connect(new StdioServerTransport());
  // stdout carries the MCP protocol, so diagnostics go to stderr.
  console.error(`kaihuman-kb-mcp serving ${kb.kbDir}`);
} catch (error) {
  console.error(`kaihuman-kb-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
