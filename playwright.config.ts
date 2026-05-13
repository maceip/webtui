import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tests connect to a remote Playwright service over WebSocket — no
 * local Chromium install required. The webServer block still runs
 * the showcase locally on PORT; the remote browser reaches it via
 * Playwright's exposed-loopback tunnel.
 *
 * Required env vars (e.g., for Microsoft Playwright Testing on Azure):
 *   PLAYWRIGHT_SERVICE_URL          wss endpoint
 *   PLAYWRIGHT_SERVICE_ACCESS_TOKEN access key sent as x-mpt-access-key
 *
 * Optional:
 *   PLAYWRIGHT_SERVICE_OS           'linux' (default) or 'windows'
 *   SHOWCASE_PORT                   default 4567
 */

// Load .env.local if present (Playwright CLI doesn't auto-load it)
const envFile = join(process.cwd(), '.env.local');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}

const PORT = Number(process.env.SHOWCASE_PORT ?? 4567);
const SERVICE_URL = process.env.PLAYWRIGHT_SERVICE_URL;
const SERVICE_TOKEN = process.env.PLAYWRIGHT_SERVICE_ACCESS_TOKEN;
const SERVICE_OS = process.env.PLAYWRIGHT_SERVICE_OS ?? 'linux';

if (!SERVICE_URL || !SERVICE_TOKEN) {
    console.warn(
        '\n[playwright] PLAYWRIGHT_SERVICE_URL / PLAYWRIGHT_SERVICE_ACCESS_TOKEN not set.\n' +
            '            Tests will fail without a remote browser endpoint.\n' +
            '            Set those env vars to point at your Playwright service.\n'
    );
}

const wsEndpoint = SERVICE_URL
    ? `${SERVICE_URL}?cap=${encodeURIComponent(
          JSON.stringify({
              os: SERVICE_OS,
              runId: new Date().toISOString(),
          })
      )}`
    : undefined;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 1,
    workers: process.env.CI ? 4 : undefined,
    // Remote Azure Chromium sessions take 15-25s to spin up; the
    // default 30s test timeout is too tight once theme apply +
    // navigation + interaction land on top.
    timeout: 90_000,
    reporter: process.env.CI
        ? [['html'], ['github']]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        ...(wsEndpoint && {
            connectOptions: {
                wsEndpoint,
                timeout: 30_000,
                headers: {
                    'x-mpt-access-key': SERVICE_TOKEN as string,
                    Authorization: `Bearer ${SERVICE_TOKEN}`,
                },
                exposeNetwork: '<loopback>',
            },
        }),
    },
    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.02,
            threshold: 0.2,
        },
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1280, height: 900 },
                deviceScaleFactor: 1,
            },
        },
    ],
    webServer: {
        command: `bun run build:showcase && bun run serve:showcase`,
        port: PORT,
        timeout: 180 * 1000,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
