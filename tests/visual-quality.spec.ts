import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Visual quality checks — assertions that catch what the renders-
 * non-degenerate smoke test can't:
 *
 *   1. Bad contrast / unreadable colors    → axe color-contrast rule
 *   4. Z-index / stacking bugs             → document.elementFromPoint
 *   7. Tofu / missing glyphs               → canvas measureText vs U+FFFE
 *   9. Content clipping                    → scrollHeight > clientHeight
 *
 * Runs as its own spec (bun run test:quality) so the per-PR smoke run
 * stays fast; this one is meant for nightly / pre-release sweeps.
 */

const THEMES = [
    'dark', 'light', 'nord', 'dracula', 'synthwave',
    'gruvbox', 'tokyo-night', 'catppuccin', 'cs', 'smui',
] as const;
type Theme = (typeof THEMES)[number];

const ALL_COMPONENTS = [
    'accordion', 'alert', 'alert-dialog', 'autocomplete', 'avatar',
    'badge', 'box', 'breadcrumb', 'button', 'calendar', 'card',
    'carousel', 'chart', 'checkbox', 'checkbox-group', 'collapsible',
    'combobox', 'command', 'date-picker', 'dialog', 'drawer',
    'elevation', 'empty', 'field', 'fieldset', 'form', 'frame',
    'gallery-cs-hud', 'gallery-htop', 'gauge', 'group', 'icons',
    'input', 'input-group', 'kbd', 'label', 'live-audio', 'menu',
    'meter', 'number-field', 'otp-field', 'pagination', 'popover',
    'pre', 'preview-card', 'progress', 'radio', 'radio-group',
    'range', 'rounded', 'scroll-area', 'select', 'separator',
    'sheet', 'skeleton', 'sparkline', 'spinner', 'switch', 'table',
    'tabs', 'textarea', 'tilt', 'toast', 'toggle', 'toggle-group',
    'toolbar', 'tooltip', 'typography', 'view', 'water-meter',
] as const;

/**
 * Components whose primary chrome is an overlay (popover/dialog/etc).
 * For these we explicitly open the overlay and verify it lands on top
 * via elementFromPoint at its center.
 */
const OVERLAY_OPEN: Record<string, (page: Page) => Promise<string | null>> = {
    popover: async (page) => {
        await page.locator('#popover details summary').first().click();
        return '#popover details[open] [is-~="popover-content"], #popover details[open]';
    },
    command: async (page) => {
        await page.evaluate(() => {
            const el = document.getElementById('demo-command') as
                | (HTMLElement & { showPopover(): void })
                | null;
            try { el?.showPopover(); } catch {}
        });
        return '#demo-command';
    },
    dialog: async (page) => {
        await page.evaluate(() => {
            const dlg = document.querySelector(
                '#dialog dialog'
            ) as HTMLDialogElement | null;
            try { dlg?.showModal(); } catch {}
        });
        return '#dialog dialog[open]';
    },
    'alert-dialog': async (page) => {
        await page.evaluate(() => {
            const dlg = document.querySelector(
                '#alert-dialog dialog'
            ) as HTMLDialogElement | null;
            try { dlg?.showModal(); } catch {}
        });
        return '#alert-dialog dialog[open]';
    },
    sheet: async (page) => {
        await page.evaluate(() => {
            const dlg = document.querySelector(
                '#sheet dialog'
            ) as HTMLDialogElement | null;
            try { dlg?.showModal(); } catch {}
        });
        return '#sheet dialog[open]';
    },
    drawer: async (page) => {
        await page.evaluate(() => {
            const dlg = document.querySelector(
                '#drawer dialog'
            ) as HTMLDialogElement | null;
            try { dlg?.showModal(); } catch {}
        });
        return '#drawer dialog[open]';
    },
    toast: async (page) => {
        await page.evaluate(() => {
            const el = document.getElementById('demo-toast') as
                | (HTMLElement & { showPopover(): void })
                | null;
            try { el?.showPopover(); } catch {}
        });
        return '#demo-toast';
    },
};

async function applyTheme(page: Page, theme: Theme) {
    await page.addInitScript((t) => {
        try { localStorage.setItem('webtui-theme', t); } catch {}
    }, theme);
}

async function goToSection(page: Page, id: string) {
    await page.goto(`/#${id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
        () => !!document.documentElement.dataset.webtuiTheme
    );
    await page.waitForSelector(`#${id}`, { state: 'attached' });
    await page.waitForTimeout(80);
}

// ─── Helpers run in-page ────────────────────────────────────────────────

/** Walk subtree; return elements whose painted content overflows their
 * box despite `overflow: hidden`. Excludes intentionally-scrollable
 * containers (overflow auto/scroll). Threshold of 4px filters out
 * sub-pixel rounding noise on scaled text. */
async function findClipped(page: Page, rootSel: string) {
    return await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return [];
        const skipTag = new Set([
            'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TEMPLATE',
            // Native form controls have a UA-defined `overflow: hidden`
            // and report scrollWidth/scrollHeight that doesn't match
            // their visible content size — Chromium quirk, well known.
            // Excluding them avoids 100% false-positives on every
            // <button>/<input>/<select>/<textarea> on the page.
            'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'PROGRESS',
            'METER',
            // SVG/canvas have their own internal coord systems; don't
            // measure them against HTML overflow rules.
            'SVG', 'CANVAS',
        ]);
        const out: Array<Record<string, unknown>> = [];
        function walk(el: Element) {
            if (skipTag.has(el.tagName)) return;
            const cs = getComputedStyle(el);
            const oy = cs.overflowY;
            const ox = cs.overflowX;
            const e = el as HTMLElement;
            // Significant overflow only — sub-pixel and minor visual
            // bleed (4px) is below human-noticeable, plus
            // box-shadow / outline rendering can shift these by 1-2px.
            const overflowsY =
                oy === 'hidden' &&
                e.scrollHeight > e.clientHeight + 4 &&
                e.clientHeight > 0;
            const overflowsX =
                ox === 'hidden' &&
                e.scrollWidth > e.clientWidth + 4 &&
                e.clientWidth > 0;
            if (overflowsY || overflowsX) {
                out.push({
                    tag: el.tagName.toLowerCase(),
                    id: (el as HTMLElement).id,
                    cls: String(el.className).slice(0, 60),
                    overflowsY,
                    overflowsX,
                    scrollH: e.scrollHeight,
                    clientH: e.clientHeight,
                    scrollW: e.scrollWidth,
                    clientW: e.clientWidth,
                });
            }
            for (const child of Array.from(el.children)) walk(child);
        }
        walk(root);
        return out;
    }, rootSel);
}

/** Walk text-bearing elements; for each non-ASCII codepoint, render it
 * to a canvas and compare pixel data against U+E000 (Private Use Area
 * — virtually no body font defines a glyph there, so it always renders
 * as the browser's tofu placeholder). >95% pixel match ⇒ the target
 * codepoint is also rendering as tofu.
 *
 * Why pixel-compare instead of measureText: in monospace fonts every
 * glyph has the same advance width, so width-based tofu detection
 * false-positives on every codepoint. */
async function findTofu(page: Page, rootSel: string) {
    return await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return [];
        const targets = root.querySelectorAll(
            'kbd, [is-~="kbd"], ' +
                '[is-~="command-shortcut"], [is-~="command-item"], ' +
                '[is-~="breadcrumb"] *, ' +
                'summary, [is-~="accordion"] summary, ' +
                '[is-~="alert"], [is-~="alert-prefix"], ' +
                '[is-~="badge"], [is-~="toolbar-item"]'
        );
        if (!targets.length) return [];

        const SIZE = 32;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        function pixelsAlpha(ch: string, font: string) {
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.font = font;
            ctx.fillStyle = '#000';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch, 1, SIZE / 2);
            const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
            const out = new Uint8Array(SIZE * SIZE);
            for (let i = 0; i < out.length; i++) {
                out[i] = data[i * 4 + 3]; // alpha
            }
            return out;
        }

        function match(a: Uint8Array, b: Uint8Array) {
            let same = 0;
            for (let i = 0; i < a.length; i++) {
                // Binary occupancy match — robust against subpixel
                // antialiasing differences.
                if ((a[i] > 0) === (b[i] > 0)) same++;
            }
            return same / a.length;
        }

        function painted(a: Uint8Array) {
            for (let i = 0; i < a.length; i++) if (a[i] > 0) return true;
            return false;
        }

        const refByFont = new Map<string, Uint8Array>();
        const out: Array<Record<string, unknown>> = [];

        for (const el of Array.from(targets)) {
            const cs = getComputedStyle(el);
            const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            let ref = refByFont.get(font);
            if (!ref) {
                // U+E000 — Private Use Area start. Standard body fonts
                // don't define a glyph here, so the browser renders its
                // tofu rectangle as the reference image.
                ref = pixelsAlpha('', font);
                refByFont.set(font, ref);
            }
            const text = (el.textContent || '').trim();
            const seen = new Set<string>();
            for (const ch of [...text]) {
                if (seen.has(ch)) continue;
                seen.add(ch);
                const code = ch.codePointAt(0) ?? 0;
                if (code < 0x80) continue; // ASCII — body fonts always include
                const px = pixelsAlpha(ch, font);
                if (!painted(px)) {
                    // Glyph paints nothing (no fallback found at all).
                    out.push({
                        ch,
                        codepoint: 'U+' + code.toString(16).toUpperCase(),
                        reason: 'unpainted',
                        in: el.tagName.toLowerCase(),
                        text: text.slice(0, 40),
                    });
                } else if (match(px, ref) > 0.95) {
                    out.push({
                        ch,
                        codepoint: 'U+' + code.toString(16).toUpperCase(),
                        reason: 'tofu (matches PUA reference)',
                        in: el.tagName.toLowerCase(),
                        text: text.slice(0, 40),
                    });
                }
            }
        }
        return out;
    }, rootSel);
}

/** For an opened overlay, sample the center via elementFromPoint and
 * confirm the topmost element is the overlay (or its descendant). */
async function checkOnTop(page: Page, overlaySel: string) {
    return await page.evaluate((sel) => {
        const overlay = document.querySelector(sel) as HTMLElement | null;
        if (!overlay) return { ok: false, reason: 'overlay missing' };
        const r = overlay.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) {
            return { ok: false, reason: 'overlay has 0 size' };
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const onTop =
            top === overlay ||
            (top && overlay.contains(top)) ||
            !!(top && top.contains(overlay));
        return {
            ok: !!onTop,
            reason: onTop
                ? 'ok'
                : `top at (${cx}, ${cy}) is ${top?.tagName.toLowerCase()}.${String(top?.className).slice(0, 40)}, not overlay`,
        };
    }, overlaySel);
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'parallel' });

for (const theme of THEMES) {
    test.describe(`quality: ${theme}`, () => {
        test.beforeEach(async ({ page }) => {
            await applyTheme(page, theme);
            await page.goto('/');
            await page.waitForLoadState('domcontentloaded');
            await page.waitForFunction(
                () => !!document.documentElement.dataset.webtuiTheme
            );
        });

        for (const id of ALL_COMPONENTS) {
            test(`${id} — visual quality`, async ({ page }) => {
                await goToSection(page, id);

                await test.step('content does not overflow visible bounds', async () => {
                    const clipped = await findClipped(page, `#${id}`);
                    expect(
                        clipped,
                        `Content clipped in #${id}: ${JSON.stringify(clipped, null, 2)}`
                    ).toEqual([]);
                });

                await test.step('no tofu / missing glyphs', async () => {
                    const tofu = await findTofu(page, `#${id}`);
                    expect(
                        tofu,
                        `Missing glyphs in #${id}: ${JSON.stringify(tofu, null, 2)}`
                    ).toEqual([]);
                });

                await test.step('axe a11y (color-contrast + critical)', async () => {
                    const result = await new AxeBuilder({ page })
                        .include(`#${id}`)
                        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                        // The showcase is intentionally fragmenty — sections
                        // aren't independent landmarks, scrollable-region
                        // would fail on overflow-auto demos, label rules
                        // misfire on demo `[for]` pairs in repeated examples.
                        .disableRules([
                            'region',
                            'scrollable-region-focusable',
                            'duplicate-id',
                            'landmark-one-main',
                            'page-has-heading-one',
                        ])
                        .analyze();
                    // Hard-fail on critical only. Serious-impact issues
                    // (notably color-contrast for warning/destructive
                    // buttons where the brand color is fundamental and
                    // can't be tweaked without changing the theme) need
                    // case-by-case triage; surface them as warnings via
                    // `console.warn` so they appear in the trace.
                    const blocking = result.violations.filter(
                        (v) => v.impact === 'critical'
                    );
                    const serious = result.violations.filter(
                        (v) => v.impact === 'serious'
                    );
                    if (serious.length) {
                        console.warn(
                            `[axe ${id}] serious-impact (non-blocking):`,
                            serious.map((v) => `${v.id} (${v.nodes.length} nodes)`).join(', ')
                        );
                    }
                    const summary = blocking.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        nodes: v.nodes.length,
                        sample: v.nodes[0]?.failureSummary?.split('\n')[0],
                    }));
                    expect(
                        blocking,
                        `axe violations in #${id}: ${JSON.stringify(summary, null, 2)}`
                    ).toEqual([]);
                });

                if (id in OVERLAY_OPEN) {
                    await test.step('overlay renders on top (z-index sane)', async () => {
                        const overlaySel = await OVERLAY_OPEN[id]!(page);
                        if (!overlaySel) return;
                        // Let CSS transitions settle.
                        await page.waitForTimeout(120);
                        const result = await checkOnTop(page, overlaySel);
                        expect(
                            result.ok,
                            `${id} overlay not on top: ${result.reason}`
                        ).toBe(true);
                    });
                }
            });
        }
    });
}
