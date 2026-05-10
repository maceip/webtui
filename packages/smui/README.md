# @webtui/smui

Terminal-aesthetic component set with WebTUI's `[is-~='name']` attribute API. Inspired by [statico/smui](https://github.com/statico/smui) (Unlicense) — a Nord-palette, JetBrains Mono, zero-radius shadcn theme.

## What's here

- `src/base.css` — design tokens (Nord-inspired palette, JetBrains Mono, zero radius) exposed under WebTUI's variable names so existing `@webtui/css` components inherit the style automatically.
- `src/components/` — original component CSS in the smui aesthetic, exposing WebTUI's attribute-based API.
- `AESTHETIC.upstream.md` and `LICENSE.upstream` — preserved attribution to the upstream project.

## Install

```bash
bun i @webtui/smui
```

## Use

```css
@layer base, utils, components;
@import '@webtui/smui';
```

```html
<button is-="button">Run</button>
<div is-="card">…</div>
```

## Aesthetic principles (per upstream)

1. Terminal-grade readability — monospace, high-contrast, uppercase labels
2. Utilitarian precision — no border radius, no gradients, no shadows
3. Status at a glance — aurora palette for system states
