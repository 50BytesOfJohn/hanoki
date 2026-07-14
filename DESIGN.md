# Hanoki Design System — "Sumi & Hinoki"

Dark-only, compact, calm. Density like Zed, restraint like Linear. The chat
transcript is the only place that gets generous space — every other surface
is chrome and stays out of the way.

All tokens live in `src/renderer/index.css`. Nothing in the app should use a
raw hex/oklch color — always a token.

## Identity

- **Sumi (ink)**: near-black neutrals with a faint warm-green cast (oklch hue 140,
  chroma ≤ 0.006). No pure black, no pure white.
- **Hinoki (moss)**: one accent — `--accent: oklch(74% 0.10 150)`. It marks the
  primary action (Send), selection, and focus. Nothing else is colored; hierarchy
  comes from lightness steps.
- **Workspace colors** are user data, not theme — shown only as small dots.

## Layering ladder (darkest → lightest)

| Token                 | Use                                        |
| --------------------- | ------------------------------------------ |
| `--background`        | window shell, title bar, sidebar           |
| `--surface`           | content panel, flat cards                  |
| `--surface-secondary` | inset cards, user bubbles, composer        |
| `--surface-tertiary`  | active/selected rows                       |
| `--overlay`           | popovers, menus, dialogs                   |
| `--hover`             | transient hover fill on rows/ghost buttons |

Borders: `--border` for panel outlines, `--separator` for internal hairlines.

## Two component stacks, one palette

- **HeroUI** reads the raw vars (`--accent`, `--surface`, `--muted`…).
- **shadcn components** (`components/ui/*`) compile from the `@theme inline`
  bridge (`--color-primary`, `--color-card`, `--color-sidebar…`).

Semantic differences are resolved in the bridge — don't fight it in components:

- `primary` (shadcn) = `--accent` (HeroUI) = the brand moss.
- `accent` in shadcn utilities means _hover fill_ (`--hover`), not brand.
- `--color-muted` keeps HeroUI's meaning: a **foreground** gray. Never use
  `bg-muted`; use `bg-hover` for fills and `text-muted-foreground` for dim text.

## Layout

- Title bar: 38px (`WINDOW_TOOLBAR_HEIGHT`), draggable, holds sidebar toggle +
  workspace switcher + settings.
- Sidebar sits directly on `--background`, width 15.5rem, rows h-7 / 13px text.
- Content is a rounded (`rounded-lg`) `--surface` panel with a 1px `--border`,
  inset 6px from the window edge.
- Each panel opens with a slim 36px header (`h-9`, hairline bottom): context on
  the left, icon actions on the right.
- Settings mirrors the same shell; page columns are `max-w-2xl px-6 py-6`.

## Type

- UI: Geist (`--font-sans`), 13px in chrome (sidebar, headers), 14px base.
- Chat transcript: 15px (`text-[0.9375rem]`), line-height ≥ 1.65 — readability
  wins here, compactness everywhere else.
- Headings: Outfit (`--font-heading`), page titles `text-xl font-semibold`.
- Code: Geist Mono. Section labels: 10px uppercase, `tracking-wider`,
  `text-muted-foreground/80`.

## Buttons

Buttons never shout. HeroUI's pill defaults are overridden globally in
`index.css` (`@layer components`): 7px corners, 28px tall (24px `sm`),
no pressed-scale transform. The primary action uses a **soft** translucent
moss fill (`--accent-soft` + `--accent-soft-foreground`), never a solid
block — same for the shadcn `default` variant. Toolbars (message actions)
use `tertiary`: transparent, muted icon, `--hover` fill on hover. Inline
pickers (composer model select) are ghost-styled fields — no border or
background until hovered.

## Shape & motion

- Radius: 6px base (`--radius`), 8px fields; `rounded-lg` for panels only.
- Motion: 100ms for hover/color, 150ms for layout (sidebar collapse). Never
  animate anything the user waits on; `prefers-reduced-motion` disables all.

## Rules of thumb

- New UI must earn contrast through the layering ladder, not new colors.
- Compact first: chrome rows are h-7, buttons xs/sm, icons 14px (`size-3.5`).
- One accent per view — if two things are green, one of them is wrong.
- Hover reveals (row actions) over always-visible buttons.
