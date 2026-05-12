#!/usr/bin/env bun
/**
 * Static file server for ./_site — used by Playwright as the test
 * target. Also runnable standalone via `bun run serve:showcase`.
 */
import { join, extname } from 'node:path';

const ROOT = join(import.meta.dir, '..', '_site');
const PORT = Number(process.env.SHOWCASE_PORT ?? 4567);

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
};

Bun.serve({
    port: PORT,
    hostname: '127.0.0.1',
    async fetch(req) {
        const url = new URL(req.url);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const filePath = join(ROOT, pathname);

        // Reject path traversal
        if (!filePath.startsWith(ROOT)) {
            return new Response('Forbidden', { status: 403 });
        }

        const file = Bun.file(filePath);
        if (!(await file.exists())) {
            return new Response('Not found', { status: 404 });
        }
        const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        return new Response(file, { headers: { 'content-type': type } });
    },
});

console.log(`Showcase serving at http://localhost:${PORT}`);
