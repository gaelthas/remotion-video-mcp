#!/usr/bin/env node
import http from 'node:http';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpServer} from './registry.mjs';
import {getConfig} from './config.mjs';

const cfg = getConfig();

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/mcp') {
    res.writeHead(404, {'content-type': 'text/plain'}).end('Not found');
    return;
  }
  if (cfg.httpToken && req.headers.authorization !== `Bearer ${cfg.httpToken}`) {
    res.writeHead(401, {'content-type': 'text/plain'}).end('Unauthorized');
    return;
  }

  const mcp = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close().catch(() => undefined);
    mcp.close().catch(() => undefined);
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('[remotion-video-mcp]', err);
    if (!res.headersSent) {
      res.writeHead(500, {'content-type': 'text/plain'}).end(String(err));
    }
  }
});

httpServer.listen(cfg.httpPort, cfg.httpHost, () => {
  console.error(`[remotion-video-mcp] http ready at http://${cfg.httpHost}:${cfg.httpPort}/mcp`);
});
