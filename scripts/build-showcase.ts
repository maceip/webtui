#!/usr/bin/env bun
/**
 * Build the showcase artifact at ./_site — mirrors the Pages
 * deploy workflow so local Playwright tests run against the same
 * structure that lands in production.
 */
import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { rm, mkdir, cp } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SITE = join(ROOT, '_site');

const log = (msg: string) => console.log(`▶ ${msg}`);

async function copyDir(from: string, to: string) {
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { recursive: true });
}

async function copyFile(from: string, to: string) {
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
}

log('Cleaning _site/');
await rm(SITE, { recursive: true, force: true });

log('Building all packages (turbo)');
await $`bun run build`.cwd(ROOT);

log('Assembling artifact');
await mkdir(join(SITE, 'css/themes'), { recursive: true });
await copyDir(join(ROOT, 'showcase'), SITE);

const ASSETS: Array<[string, string]> = [
    ['packages/css/dist/full.css', 'css/webtui.css'],
    ['packages/theme-nord/dist/index.css', 'css/themes/nord.css'],
    ['packages/theme-gruvbox/dist/index.css', 'css/themes/gruvbox.css'],
    ['packages/theme-catppuccin/dist/index.css', 'css/themes/catppuccin.css'],
    ['packages/theme-dracula/dist/index.css', 'css/themes/dracula.css'],
    ['packages/theme-synthwave/dist/index.css', 'css/themes/synthwave.css'],
    [
        'packages/theme-tokyo-night/dist/index.css',
        'css/themes/tokyo-night.css',
    ],
    ['packages/cs/dist/full.css', 'css/cs.css'],
    ['packages/smui/dist/full.css', 'css/smui.css'],
];

for (const [src, dest] of ASSETS) {
    const srcAbs = join(ROOT, src);
    const destAbs = join(SITE, dest);
    if (!existsSync(srcAbs)) {
        console.warn(`  ⚠ missing ${src}`);
        continue;
    }
    await copyFile(srcAbs, destAbs);
}

log(`Built _site/ — ready to serve`);
