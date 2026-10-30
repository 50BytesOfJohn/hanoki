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

## One component stack: shadcn

All UI composes the shadcn components in `components/ui/*` (Base UI
primitives, hugeicons). Raw palette vars in `index.css` are mapped onto
Tailwind utilities in the `@theme inline` block — token semantics:

- `primary` = `--accent` = the brand moss.
- `accent` in utilities means _hover fill_ (`--hover`), not brand.
- `muted` utilities are the _hover fill_ too (`--color-muted` = `--hover`), so
  upstream `bg-muted` works unchanged. Dim text is `text-muted-foreground`
  (`--muted`, a text gray).
- The layering vars are exposed directly too (`bg-surface`,
  `bg-surface-secondary`, `border-separator`, `text-danger`, …).

### Upstream overrides

Most `components/ui/*` files match their registry (`@shadcn`, or `@coss` for
autocomplete, checkbox-group, fieldset, form, frame, group, menu, meter,
number-field, preview-card, toast, toolbar). `tree` and `workspace-orb` are
ours. When upgrading, preview with `shadcn add --diff`, install coss items
before shadcn ones (coss pulls its own `button`, `input`, `label`, …), and
keep these:

| Component      | Override                                             | Why                                                       |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `button`       | Soft `default` variant, `rounded-md`, svg edge nudge | Buttons never shout; most icons don't set `data-icon`     |
| `command`      | `isPending` on `CommandInput`, `p-1` wrapper         | Model search spinner; gap above results                   |
| `context-menu` | No `select-none` on the trigger                      | `TextContextMenu` wraps selectable chat text              |
| `input-group`  | `!` on the combobox focus-within resets              | `has-[…:focus-visible]` otherwise out-specifies them      |
| `popover`      | `anchor` on `PopoverContent`                         | Anchoring to message and composer elements                |
| `separator`    | Vertical uses `self-center` + `min-h-4`              | `self-stretch` top-aligns once a caller sets a height     |
| `sidebar`      | `13.5rem` width, `h-7` / 13px rows                   | Compact settings navigation                               |
| `slider`       | `thumbProps`, `trackClassName`, `thumbClassName`     | Effort control's named steps and larger hit area          |
| `spinner`      | Props typed from `HugeiconsIcon`                     | Upstream's svg props don't type-check against it          |
| `autocomplete` | Plain `Input` and `ScrollArea`, no `cursor-pointer`  | We use shadcn's versions; default cursor in a desktop app |
| `number-field` | No `cursor-pointer`                                  | Default cursor in a desktop app                           |
| `menu`         | `select-none` on checkbox, radio and submenu items   | Menu labels shouldn't be selectable                       |

## Layout

- Title bar: 38px (`WINDOW_TOOLBAR_HEIGHT`), draggable, holds sidebar toggle +
  workspace switcher + settings.
- Sidebar sits directly on `--background`, width 15.5rem, rows h-7 / 13px text.
- Content is a rounded (`rounded-lg`) `--surface` panel with a 1px `--border`,
  inset 6px from the window edge.
- Each panel opens with a slim 36px header (`h-9`, hairline bottom): context on
  the left, icon actions on the right.
- Settings mirrors the same shell. Pages compose the primitives in
  `features/settings/settings-ui.tsx`: `SettingsPageShell` (column,
  `max-w-2xl px-6 pt-10 pb-16`), `SettingsPageHeader`, `SettingsSection`
  (uppercase label + bordered group with hairline dividers), and
  `SettingsRow` — title/description left, control right, Zed/Linear style.

## Type

- UI: Geist (`--font-sans`), 13px in chrome (sidebar, headers), 14px base.
- Chat transcript: 15px (`text-[0.9375rem]`), line-height ≥ 1.65 — readability
  wins here, compactness everywhere else.
- Headings: Outfit (`--font-heading`), page titles `text-xl font-semibold`.
- Code: Geist Mono. Section labels: 10px uppercase, `tracking-wider`,
  `text-muted-foreground/80`.

## Buttons

Buttons never shout. The `default` Button variant uses a **soft**
translucent moss fill (`--accent-soft` + `--accent-soft-foreground`),
never a solid block. Toolbars (message actions) use
`variant="ghost" className="text-muted-foreground"`: transparent, muted
icon, `--hover` fill on hover. Inline pickers (composer model select) are
ghost-styled fields — no border or background until hovered.

## Shape & motion

- Radius: 6px base (`--radius`), 8px fields; `rounded-lg` for panels only.
- Motion: 100ms for hover/color, 150ms for layout (sidebar collapse). Never
  animate anything the user waits on; `prefers-reduced-motion` disables all.
- Entrances/exits use `ease-out-quint` (`cubic-bezier(0.23, 1, 0.32, 1)`) —
  the element is essentially in place by the time the eye arrives. Built-in
  `ease-out` is too weak to read as deliberate; `ease-in` is never correct on UI.
- Ambient motion (the new tab page wash) is the one exception to the duration
  budget: transform-only, tens of seconds, and `animation-name: none` under
  reduced motion — the global duration clamp would otherwise strobe it.

## Rules of thumb

- New UI must earn contrast through the layering ladder, not new colors.
- Compact first: chrome rows are h-7, buttons xs/sm, icons 14px (`size-3.5`).
- One accent per view — if two things are green, one of them is wrong.
- Hover reveals (row actions) over always-visible buttons.
