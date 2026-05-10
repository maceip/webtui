# @webtui/cs

Counter-Strike 1.6 styled component set with WebTUI's `[is-~='name']` attribute API.

The visual style — beveled borders, muted-green palette, ArialPixel typeface — comes from the upstream [ekmas/cs16.css](https://github.com/ekmas/cs16.css) project (MIT). That source is vendored unmodified in `src/upstream/cs16.css` (see `LICENSE.upstream`). The component set in `src/components/` is original, written to match WebTUI's attribute-based API while honoring the upstream visual language.

## Install

```bash
bun i @webtui/cs
```

## Use

```css
@layer base, utils, components;
@import '@webtui/cs';
```

```html
<button is-="button">Click</button>
<div is-="card">…</div>
```

## Attribution

The upstream cs16.css is MIT-licensed. See `LICENSE.upstream` for the original notice.
