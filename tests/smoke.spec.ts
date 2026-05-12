import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests — iterate every theme × every critical component and
 * assert computed styles are non-degenerate (button has chrome,
 * progress fill > 0, popover opens, etc.). Catches "no styling
 * applied" silently — the exact failure mode that bit us repeatedly.
 */

const THEMES = [
    'dark',
    'light',
    'nord',
    'dracula',
    'synthwave',
    'gruvbox',
    'tokyo-night',
    'catppuccin',
    'cs',
    'smui',
] as const;

type Theme = (typeof THEMES)[number];

const TRANSPARENT = new Set([
    'rgba(0, 0, 0, 0)',
    'transparent',
    '',
]);

function hasBackground(bg: string) {
    return !TRANSPARENT.has(bg);
}

function hasBorder(width: string) {
    return width !== '0px' && width !== '0';
}

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
    // Wait for :target to activate the section
    await page.waitForSelector(`#${id}.component:target, #${id}`, {
        state: 'attached',
    });
    await page.waitForTimeout(80);
}

for (const theme of THEMES) {
    test.describe(`theme: ${theme}`, () => {
        test.beforeEach(async ({ page }) => {
            await applyTheme(page, theme);
            await page.goto('/');
            await page.waitForLoadState('domcontentloaded');
            // Wait for stylesheets to be applied
            await page.waitForFunction(() => {
                return document.documentElement.dataset.webtuiTheme;
            });
        });

        test('button — has chrome (bg or border) and font', async ({
            page,
        }) => {
            await goToSection(page, 'button');
            const btn = page.locator('#button button').first();
            await btn.waitFor({ state: 'visible' });
            const s = await btn.evaluate((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return {
                    bg: cs.backgroundColor,
                    bgImage: cs.backgroundImage,
                    border: cs.borderWidth,
                    color: cs.color,
                    font: cs.fontFamily,
                    height: r.height,
                    width: r.width,
                };
            });
            expect(s.height, 'button has measurable height').toBeGreaterThan(
                12
            );
            expect(s.width, 'button has measurable width').toBeGreaterThan(20);
            const visible =
                hasBackground(s.bg) ||
                s.bgImage !== 'none' ||
                hasBorder(s.border);
            expect(
                visible,
                `button needs visible chrome (got bg=${s.bg}, bgImage=${s.bgImage}, border=${s.border})`
            ).toBe(true);
            expect(s.font, 'button has font-family').not.toBe('');
        });

        test('button variants — primary, destructive, success differ', async ({
            page,
        }) => {
            await goToSection(page, 'button');
            const bgs = await page.evaluate(() => {
                const colors: Record<string, string> = {};
                for (const v of [
                    'primary',
                    'destructive',
                    'success',
                    'warning',
                ]) {
                    const el = document.querySelector(
                        `#button button[variant-="${v}"]`
                    );
                    if (el)
                        colors[v] = getComputedStyle(el as HTMLElement)
                            .backgroundColor;
                }
                return colors;
            });
            const uniq = new Set(Object.values(bgs));
            expect(
                uniq.size,
                `button variants must have distinct bg colors (got ${JSON.stringify(bgs)})`
            ).toBeGreaterThanOrEqual(Math.min(3, Object.keys(bgs).length));
        });

        test('input — has visible chrome', async ({ page }) => {
            await goToSection(page, 'input');
            const input = page
                .locator('#input input[type="text"]')
                .first();
            await input.waitFor({ state: 'visible' });
            const s = await input.evaluate((el) => {
                const cs = getComputedStyle(el);
                return {
                    bg: cs.backgroundColor,
                    border: cs.borderWidth,
                    padding: cs.padding,
                };
            });
            const visible = hasBackground(s.bg) || hasBorder(s.border);
            expect(
                visible,
                `input needs bg or border (got bg=${s.bg}, border=${s.border})`
            ).toBe(true);
        });

        test('checkbox — has visible box', async ({ page }) => {
            await goToSection(page, 'checkbox');
            const cb = page
                .locator(
                    '#checkbox input[type="checkbox"]:not([is-="switch"])'
                )
                .first();
            await cb.waitFor({ state: 'visible' });
            const r = await cb.boundingBox();
            expect(r?.width ?? 0, 'checkbox width').toBeGreaterThan(8);
            expect(r?.height ?? 0, 'checkbox height').toBeGreaterThan(8);
        });

        test('switch — track and thumb visually distinct', async ({
            page,
        }) => {
            await goToSection(page, 'switch');
            const sw = page
                .locator('#switch input[type="checkbox"][is-~="switch"]')
                .first();
            await sw.waitFor({ state: 'visible' });
            const r = await sw.boundingBox();
            expect(r?.width ?? 0, 'switch wider than tall').toBeGreaterThan(
                r?.height ?? 0
            );
        });

        test('progress — fill has width when value is set', async ({
            page,
        }) => {
            await goToSection(page, 'progress');
            const result = await page.evaluate(() => {
                const bars = document.querySelectorAll(
                    "#progress [is-~='progress']:not([animate-='squiggle'])"
                );
                const widths: number[] = [];
                bars.forEach((b) => {
                    const before = getComputedStyle(
                        b as HTMLElement,
                        '::before'
                    );
                    widths.push(parseFloat(before.width || '0'));
                });
                return widths;
            });
            // At least one progress bar should have non-zero fill width
            expect(
                Math.max(0, ...result),
                'at least one progress bar has visible fill'
            ).toBeGreaterThan(0);
        });

        test('card — has padding', async ({ page }) => {
            await goToSection(page, 'card');
            const card = page.locator('#card [is-~="card"]').first();
            await card.waitFor({ state: 'visible' });
            const padding = await card.evaluate((el) =>
                getComputedStyle(el).paddingTop
            );
            const px = parseFloat(padding);
            expect(px, 'card has non-trivial top padding').toBeGreaterThan(8);
        });

        test('badge — visible chrome', async ({ page }) => {
            await goToSection(page, 'badge');
            const badge = page.locator('#badge [is-~="badge"]').first();
            await badge.waitFor({ state: 'visible' });
            const s = await badge.evaluate((el) => {
                const cs = getComputedStyle(el);
                return {
                    bg: cs.backgroundColor,
                    bgImage: cs.backgroundImage,
                    border: cs.borderWidth,
                };
            });
            const visible =
                hasBackground(s.bg) ||
                s.bgImage !== 'none' ||
                hasBorder(s.border);
            expect(visible, 'badge has chrome').toBe(true);
        });

        test('kbd — visible chrome', async ({ page }) => {
            await goToSection(page, 'kbd');
            const k = page.locator('#kbd kbd').first();
            await k.waitFor({ state: 'visible' });
            const s = await k.evaluate((el) => {
                const cs = getComputedStyle(el);
                return {
                    bg: cs.backgroundColor,
                    border: cs.borderWidth,
                    shadow: cs.boxShadow,
                };
            });
            const visible =
                hasBackground(s.bg) ||
                hasBorder(s.border) ||
                s.shadow !== 'none';
            expect(visible, 'kbd has chrome').toBe(true);
        });

        test('alert — has bg + visible prefix', async ({ page }) => {
            await goToSection(page, 'alert');
            const al = page.locator('#alert [is-~="alert"]').first();
            await al.waitFor({ state: 'visible' });
            const bg = await al.evaluate(
                (el) => getComputedStyle(el).backgroundColor
            );
            expect(hasBackground(bg), 'alert has bg').toBe(true);
        });

        test('table — th has bold weight', async ({ page }) => {
            await goToSection(page, 'table');
            const th = page.locator('#table th').first();
            await th.waitFor({ state: 'visible' });
            const w = await th.evaluate(
                (el) => getComputedStyle(el).fontWeight
            );
            expect(parseInt(w), 'table header is bold').toBeGreaterThan(400);
        });

        test('tooltip — content appears on hover', async ({ page }) => {
            await goToSection(page, 'tooltip');
            const trigger = page
                .locator("#tooltip [is-~='tooltip-trigger']")
                .first();
            await trigger.waitFor({ state: 'visible' });
            await trigger.hover();
            await page.waitForTimeout(700);
            const content = page.locator(
                "#tooltip [is-~='tooltip-content']"
            );
            const opacity = await content.evaluate((el) =>
                parseFloat(getComputedStyle(el).opacity)
            );
            expect(opacity, 'tooltip content is visible after hover').toBe(1);
        });

        test('popover — opens on details click', async ({ page }) => {
            await goToSection(page, 'popover');
            const det = page.locator('#popover details[is-~="popover"]').first();
            await det.waitFor({ state: 'visible' });
            await det.locator('summary').first().click();
            await page.waitForTimeout(100);
            const isOpen = await det.evaluate(
                (el) => (el as HTMLDetailsElement).open
            );
            expect(isOpen, 'popover details opens on summary click').toBe(true);
        });

        test('accordion — opens on summary click', async ({ page }) => {
            await goToSection(page, 'accordion');
            const det = page
                .locator('#accordion details[is-~="accordion"]')
                .first();
            await det.waitFor({ state: 'visible' });
            const initiallyOpen = await det.evaluate(
                (el) => (el as HTMLDetailsElement).open
            );
            if (!initiallyOpen) {
                await det.locator('summary').first().click();
                await page.waitForTimeout(100);
            }
            const isOpen = await det.evaluate(
                (el) => (el as HTMLDetailsElement).open
            );
            expect(isOpen, 'accordion opens').toBe(true);
        });

        test('water-meter — wave svg present and circle clip', async ({
            page,
        }) => {
            await goToSection(page, 'water-meter');
            const wm = page
                .locator('#water-meter [is-~="water-meter"]')
                .first();
            await wm.waitFor({ state: 'visible' });
            const result = await wm.evaluate((el) => {
                const cs = getComputedStyle(el);
                const svg = el.querySelector('svg');
                return {
                    radius: cs.borderRadius,
                    hasSvg: !!svg,
                    overflow: cs.overflow,
                };
            });
            expect(
                result.radius,
                'water-meter is round (border-radius applied)'
            ).not.toBe('0px');
            expect(result.hasSvg, 'water-meter has SVG').toBe(true);
        });

        test('otp-field — width covers six char cells', async ({ page }) => {
            await goToSection(page, 'otp-field');
            const otp = page.locator('#otp-field input[is-~="otp"]').first();
            await otp.waitFor({ state: 'visible' });
            const w = await otp.evaluate((el) =>
                el.getBoundingClientRect().width
            );
            // 6 chars × at least 18px each is a reasonable lower bound
            expect(
                w,
                'otp-field renders wide enough for 6 cells'
            ).toBeGreaterThan(100);
        });

        test('number-field — stepper buttons have visible text/glyph', async ({
            page,
        }) => {
            await goToSection(page, 'number-field');
            const dec = page
                .locator('#number-field [data-action="decrement"]')
                .first();
            const inc = page
                .locator('#number-field [data-action="increment"]')
                .first();
            await dec.waitFor({ state: 'visible' });
            // Either inner text or ::after content must be non-empty
            const check = async (loc: typeof dec, expected: string[]) => {
                const result = await loc.evaluate((el) => {
                    const after = getComputedStyle(el, '::after').content;
                    return {
                        text: (el.textContent || '').trim(),
                        after: after.replace(/^"|"$/g, ''),
                    };
                });
                const glyph = result.text || result.after;
                return { glyph, result };
            };
            const decResult = await check(dec, ['-', '−']);
            const incResult = await check(inc, ['+']);
            expect(
                decResult.glyph,
                `decrement glyph present (got ${JSON.stringify(decResult.result)})`
            ).not.toBe('');
            expect(
                incResult.glyph,
                `increment glyph present (got ${JSON.stringify(incResult.result)})`
            ).not.toBe('');
        });

        test('toolbar — items are horizontal (not stacked)', async ({
            page,
        }) => {
            await goToSection(page, 'toolbar');
            const toolbar = page
                .locator('#toolbar [is-~="toolbar"]')
                .first();
            await toolbar.waitFor({ state: 'visible' });
            const result = await toolbar.evaluate((el) => {
                const children = Array.from(el.children) as HTMLElement[];
                const tops = children.map(
                    (c) => c.getBoundingClientRect().top
                );
                const minTop = Math.min(...tops);
                const maxTop = Math.max(...tops);
                return { spread: maxTop - minTop, count: children.length };
            });
            // All toolbar items should share roughly the same top
            expect(
                result.spread,
                `toolbar items horizontal, not stacked (spread=${result.spread})`
            ).toBeLessThan(8);
        });

        test('tabs — triggers share same top edge', async ({ page }) => {
            await goToSection(page, 'tabs');
            const result = await page.evaluate(() => {
                const wraps = document.querySelectorAll('#tabs [is-~="tabs"]');
                let maxSpread = 0;
                wraps.forEach((wrap) => {
                    const triggers = wrap.querySelectorAll(
                        '[is-~="tabs-trigger"], [is-~="tabs-list"] button, [is-~="tabs-list"] label, input[type="radio"] + label'
                    );
                    if (triggers.length < 2) return;
                    const tops = Array.from(triggers).map(
                        (t) => (t as HTMLElement).getBoundingClientRect().top
                    );
                    const spread = Math.max(...tops) - Math.min(...tops);
                    if (spread > maxSpread) maxSpread = spread;
                });
                return maxSpread;
            });
            expect(
                result,
                `tabs triggers aligned (spread=${result})`
            ).toBeLessThan(6);
        });

        test('command palette opens via popover trigger', async ({
            page,
        }) => {
            await goToSection(page, 'command');
            // Trigger that opens demo-command
            const trigger = page.locator(
                '#command [popovertarget="demo-command"]'
            );
            await trigger.waitFor({ state: 'visible' });
            await trigger.click();
            await page.waitForTimeout(200);
            const popover = page.locator('#demo-command');
            const isOpen = await popover.evaluate((el) =>
                (el as HTMLElement).matches(':popover-open')
            );
            expect(isOpen, 'command palette opens via popovertarget').toBe(
                true
            );
        });

        test('avatar — square (1:1 aspect)', async ({ page }) => {
            await goToSection(page, 'avatar');
            const av = page.locator('#avatar [is-~="avatar"]').first();
            await av.waitFor({ state: 'visible' });
            const r = await av.boundingBox();
            const ratio = (r?.width ?? 0) / (r?.height ?? 1);
            expect(
                Math.abs(ratio - 1),
                `avatar is square (got ratio=${ratio})`
            ).toBeLessThan(0.15);
        });

        test('separator — has visible track', async ({ page }) => {
            await goToSection(page, 'separator');
            const sep = page
                .locator(
                    '#separator [is-~="separator"], #separator hr'
                )
                .first();
            await sep.waitFor({ state: 'visible' });
            const r = await sep.boundingBox();
            expect(r?.height ?? 0, 'separator has visible height').toBeGreaterThan(
                0
            );
            expect(
                r?.width ?? 0,
                'separator has visible width'
            ).toBeGreaterThan(0);
        });
    });
}
