# AGENTS.md

## Cursor Cloud specific instructions

This is a **Bun + Turborepo monorepo** providing a CSS component library (WebTUI) and its documentation site.

### Project structure

- `packages/css/` — Core CSS library (`@webtui/css`)
- `packages/plugin-nf/` — Nerd Font plugin
- `packages/theme-*/` — Theme packages (catppuccin, nord, gruvbox, vitesse, everforest)
- `web/` — Astro-based documentation site

### Key commands (all from repo root)

| Task | Command |
|------|---------|
| Install deps | `bun i` |
| Lint | `bun run lint` |
| Format check | `bun run format:check` |
| Format fix | `bun run format` |
| Build all | `bun run build` |
| Dev server | `bun run dev` |

### Dev server notes

- `bun run dev` starts Turborepo TUI which runs Vite watch on all packages + Astro dev server for the docs site.
- The Astro docs site serves on **port 4321**.
- Turbo uses `"ui": "tui"` mode — if running in a non-interactive context where the TUI causes issues, you can override with `TURBO_UI=0 bun run dev` to get streaming output.
- No databases, Docker, or external services are needed. This is a fully static frontend project.

### Gotchas

- Bun must be on `PATH` (`~/.bun/bin`). The update script ensures it's installed.
- The `turbo.json` config has `"dependsOn": ["^build"]` for the `build` task, so packages build before the docs site.
- There are no automated test suites (unit/integration) in this repo — validation is done via lint, format check, and build.
