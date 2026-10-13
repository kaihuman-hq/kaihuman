#!/usr/bin/env node
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveConfig } from './config.js';
import { GitSync } from './git.js';
import { KnowledgeBase } from './repo.js';
import { createKbServer } from './server.js';

try {
  const config = resolveConfig(process.argv.slice(2), process.env, process.cwd());
  const kb = await KnowledgeBase.open(config.repoPath);
  const git = config.git ? new GitSync(kb.repoRoot) : undefined;
  await createKbServer(kb, { git }).connect(new StdioServerTransport());
  // stdout carries the MCP protocol, so diagnostics go to stderr.
  console.error(`kaihuman-kb-mcp serving ${kb.kbDir}${git ? ' (git sync on)' : ''}`);
} catch (error) {
  console.error(`kaihuman-kb-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
