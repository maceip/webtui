import { test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Visual review pass — for each component section, apply theme, navigate,
 * trigger an interaction (open, hover, focus, click) where appropriate,
 * and dump a screenshot to screenshots/{theme}/{id}.png.
 *
 * Run with:
 *   bun run test:e2e --grep visual-review
 */

const THEMES = ['cs', 'smui'] as const;
type Theme = (typeof THEMES)[number];

type Interaction = (page: Page) => Promise<void>;

const noop: Interaction = async () => {};

const open = (sel: string): Interaction => async (page) => {
    const el = page.locator(sel).first();
    if (await el.count()) await el.evaluate((e) => (e as HTMLElement).click());
};

const hover = (sel: string): Interaction => async (page) => {
    const el = page.locator(sel).first();
    if (await el.count()) await el.hover().catch(() => {});
};

const focus = (sel: string): Interaction => async (page) => {
    const el = page.locator(sel).first();
    if (await el.count()) await el.focus().catch(() => {});
};

const showPopover = (id: string): Interaction => async (page) => {
    await page.evaluate((pid) => {
        const el = document.getElementById(pid);
        try {
            (el as HTMLElement & { showPopover(): void })?.showPopover();
        } catch {}
    }, id);
};

const showDialog = (sel: string): Interaction => async (page) => {
    await page.evaluate((s) => {
        const dlg = document.querySelector(s) as HTMLDialogElement | null;
        try {
            dlg?.showModal();
        } catch {}
    }, sel);
};

const COMPONENTS: Array<{ id: string; interact?: Interaction; wait?: number }> = [
    // Layout
    { id: 'card' },
    { id: 'frame' },
    { id: 'empty' },
    { id: 'scroll-area' },
    { id: 'separator' },
    { id: 'view' },
    { id: 'box' },
    // Form
    { id: 'button', interact: hover('#button button') },
    { id: 'input', interact: focus('#input input[type="text"]') },
    { id: 'textarea', interact: focus('#textarea textarea') },
    { id: 'checkbox' },
    { id: 'checkbox-group' },
    { id: 'radio' },
    { id: 'radio-group' },
    { id: 'switch' },
    { id: 'range' },
    { id: 'select', interact: focus('#select select') },
    { id: 'combobox', interact: focus('#combobox input') },
    { id: 'autocomplete', interact: focus('#autocomplete input') },
    { id: 'date-picker' },
    { id: 'calendar' },
    { id: 'number-field' },
    { id: 'otp-field', interact: focus('#otp-field input') },
    { id: 'input-group' },
    { id: 'field' },
    { id: 'fieldset' },
    { id: 'form' },
    { id: 'group' },
    { id: 'label' },
    { id: 'meter' },
    { id: 'progress' },
    // Display
    { id: 'typography' },
    { id: 'avatar' },
    { id: 'badge' },
    { id: 'kbd' },
    { id: 'skeleton' },
    { id: 'spinner' },
    { id: 'pre' },
    { id: 'table' },
    // Visualization
    { id: 'sparkline' },
    { id: 'chart' },
    { id: 'gauge' },
    { id: 'water-meter' },
    // Gallery
    { id: 'gallery-htop' },
    { id: 'gallery-cs-hud' },
    // Utilities
    { id: 'rounded' },
    { id: 'elevation' },
    { id: 'icons' },
    // Navigation
    { id: 'breadcrumb' },
    { id: 'menu' },
    { id: 'pagination' },
    { id: 'tabs' },
    { id: 'toolbar' },
    {
        id: 'command',
        interact: showPopover('demo-command'),
        wait: 150,
    },
    // Overlay
    {
        id: 'popover',
        interact: open('#popover details summary'),
    },
    { id: 'tooltip', interact: hover('#tooltip [is-~="tooltip-trigger"]') },
    { id: 'preview-card' },
    { id: 'accordion', interact: open('#accordion details summary') },
    { id: 'collapsible', interact: open('#collapsible details summary') },
    {
        id: 'dialog',
        interact: async (page) => {
            // Try first popover-based dialog, fall back to <dialog>
            const dlg = page.locator('#dialog dialog').first();
            if (await dlg.count()) {
                await dlg.evaluate((el) => {
                    try {
                        (el as HTMLDialogElement).showModal();
                    } catch {}
                });
                return;
            }
            await open('#dialog button')(page);
        },
        wait: 150,
    },
    {
        id: 'alert-dialog',
        interact: showDialog('#alert-dialog dialog'),
        wait: 150,
    },
    {
        id: 'sheet',
        interact: showDialog('#sheet dialog'),
        wait: 200,
    },
    {
        id: 'drawer',
        interact: showDialog('#drawer dialog'),
        wait: 200,
    },
    {
        id: 'toast',
        interact: showPopover('demo-toast'),
        wait: 150,
    },
    { id: 'alert' },
    // Toggle
    { id: 'toggle', interact: open('#toggle button') },
    { id: 'toggle-group' },
    // Motion
    { id: 'carousel' },
    {
        id: 'tilt',
        // Real mouse move at the bottom-right corner of the first
        // tilt element — synthetic dispatchEvent doesn't reach the
        // delegated mousemove handler reliably.
        interact: async (page) => {
            const el = page.locator('#tilt [data-tilt]').first();
            const box = await el.boundingBox();
            if (!box) return;
            await page.mouse.move(
                box.x + box.width - 4,
                box.y + box.height - 4,
                { steps: 5 }
            );
        },
        wait: 500,
    },
    { id: 'live-audio' },
];

async function applyTheme(page: Page, theme: Theme) {
    await page.addInitScript((t) => {
        try {
            localStorage.setItem('webtui-theme', t);
        } catch {}
    }, theme);
}

async function goToSection(page: Page, id: string) {
    await page.goto(`/#${id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(`#${id}`, { state: 'attached' });
    await page.waitForTimeout(100);
}

test.describe.configure({ mode: 'parallel' });

for (const theme of THEMES) {
    test.describe(`visual-review: ${theme}`, () => {
        test.beforeAll(async () => {
            await mkdir(join('screenshots', theme), { recursive: true });
        });

        test.beforeEach(async ({ page }) => {
            await applyTheme(page, theme);
            await page.goto('/');
            await page.waitForLoadState('domcontentloaded');
            await page.waitForFunction(
                () => !!document.documentElement.dataset.webtuiTheme
            );
        });

        for (const { id, interact, wait } of COMPONENTS) {
            test(`${id}`, async ({ page }) => {
                await goToSection(page, id);
                if (interact) {
                    try {
                        await interact(page);
                    } catch {
                        // interaction is best-effort; capture state anyway
                    }
                    await page.waitForTimeout(wait ?? 80);
                }
                await page.screenshot({
                    path: join('screenshots', theme, `${id}.png`),
                    fullPage: false,
                    animations: 'disabled',
                });
            });
        }
    });
}
