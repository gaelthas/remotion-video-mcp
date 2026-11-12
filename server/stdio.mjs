#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './registry.mjs';

process.on('uncaughtException', (err) => console.error('[remotion-video-mcp]', err));
process.on('unhandledRejection', (err) => console.error('[remotion-video-mcp]', err));

const server = createMcpServer();
await server.connect(new StdioServerTransport());
console.error('[remotion-video-mcp] stdio ready');
