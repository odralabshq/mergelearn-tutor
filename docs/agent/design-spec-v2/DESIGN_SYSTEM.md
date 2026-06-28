# MergeLearn Tutor — Design System v2

This is the authoritative design system for all agents implementing the v2 visual redesign
on the `redesign/v2` branch. All CSS must use the variables defined here. No ad-hoc colors
or raw hex values are allowed outside the `:root` token definition.

---

## 1. Design Philosophy

MergeLearn Tutor is a **local-first developer learning cockpit**, not a SaaS dashboard.

The UI should feel like:
- **Ghostty / Warp terminal** — dark, focused, purposeful
- **Linear** — fast, opinionated, reduced cognitive load
- **Obsidian Graph** — knowledge visualization that rewards exploration
- **Anki's focus principle** — one task at a time, no distractions

NOT like:
- An admin panel (too many equal-weight items)
- A marketing site (too much visual decoration)
- A generic dark template (indistinct, forgettable)

**Three core principles:**
1. **Action first**: every page opens with one obvious primary action
2. **Evidence visible**: the user can always trace why a card exists
3. **Zero clutter**: every element on screen must earn its place

---

## 2. Color System

All colors are defined as CSS custom properties on `:root`. No magic hex values elsewhere.

```css
:root {
  /* === BACKGROUNDS (layered surface system) === */
  --color-bg-void:       #010409;   /* page body */
  --color-bg-base:       #0d1117;   /* base surface (shell, non-elevated) */
  --color-bg-raised:     #161b22;   /* raised cards, panels */
  --color-bg-overlay:    #1c2128;   /* dropdowns, drawers, popovers */
  --color-bg-hover:      #21262d;   /* hover state on interactive items */
  --color-bg-selected:   #1f3a5f;   /* active/selected item */

  /* === BORDERS === */
  --color-border-subtle: rgba(48, 54, 61, 0.8);   /* very faint separator */
  --color-border-default: rgba(48, 54, 61, 1.0);  /* standard border */
  --color-border-muted:  rgba(78, 96, 120, 0.5);  /* mid-contrast border */
  --color-border-emphasis: rgba(99, 102, 241, 0.5); /* active/focus */

  /* === TEXT === */
  --color-text-primary:  #e6edf3;   /* primary body text */
  --color-text-secondary:#8b949e;   /* secondary/muted labels */
  --color-text-muted:    #484f58;   /* disabled, placeholder */
  --color-text-link:     #58a6ff;   /* links */
  --color-text-inverse:  #0d1117;   /* text on light/colored bg */

  /* === ACCENT — Indigo (primary brand) === */
  --color-accent-primary:    #6366f1;
  --color-accent-primary-hover: #7c7ff7;
  --color-accent-primary-bg: rgba(99, 102, 241, 0.12);
  --color-accent-primary-border: rgba(99, 102, 241, 0.35);

  /* === ACCENT — Emerald (success / correct / mastered) === */
  --color-success:       #3fb950;
  --color-success-bg:    rgba(63, 185, 80, 0.1);
  --color-success-border: rgba(63, 185, 80, 0.35);

  /* === ACCENT — Amber (warning / due / weak) === */
  --color-warning:       #d29922;
  --color-warning-bg:    rgba(210, 153, 34, 0.12);
  --color-warning-border: rgba(210, 153, 34, 0.35);

  /* === ACCENT — Rose (error / missed / blocked) === */
  --color-danger:        #f85149;
  --color-danger-bg:     rgba(248, 81, 73, 0.1);
  --color-danger-border: rgba(248, 81, 73, 0.35);

  /* === ACCENT — Sky (info / evidence / secondary CTA) === */
  --color-info:          #388bfd;
  --color-info-bg:       rgba(56, 139, 253, 0.1);
  --color-info-border:   rgba(56, 139, 253, 0.35);

  /* === ACCENT — Violet (concept nodes) === */
  --color-concept:       #a78bfa;
  --color-concept-bg:    rgba(167, 139, 250, 0.1);
  --color-concept-border: rgba(167, 139, 250, 0.35);
}
```

**Usage rules:**
- `--color-bg-void` → `<body>` only
- `--color-bg-base` → `.app-shell`, top nav bar
- `--color-bg-raised` → cards, panels, drawers
- `--color-bg-overlay` → dropdowns, modal overlays
- `--color-bg-hover` → `:hover` on list items, rows
- `--color-bg-selected` → `[aria-current="page"]`, selected filter

---

## 3. Typography

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Code', monospace;

  /* Scale (Major Third, 1.25 ratio) */
  --text-xs:   0.75rem;    /* 12px — eyebrow labels, metadata */
  --text-sm:   0.875rem;   /* 14px — secondary body, buttons, pills */
  --text-base: 1rem;       /* 16px — primary body */
  --text-lg:   1.125rem;   /* 18px — section headings, card titles */
  --text-xl:   1.25rem;    /* 20px — page section titles */
  --text-2xl:  1.5rem;     /* 24px — hero sub-headings */
  --text-3xl:  1.875rem;   /* 30px — page hero headings */
  --text-4xl:  2.25rem;    /* 36px — stat numbers */

  /* Weight */
  --font-regular: 400;
  --font-medium:  500;
  --font-semibold: 600;
  --font-bold:    700;

  /* Line heights */
  --leading-tight:  1.25;
  --leading-snug:   1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  /* Letter spacing */
  --tracking-tight:  -0.025em;
  --tracking-normal: 0em;
  --tracking-wide:   0.05em;
  --tracking-wider:  0.1em;
}
```

**Typography rules:**
- Headings: `--font-bold` + `--tracking-tight`
- Body: `--font-regular` + `--leading-normal`
- Labels/eyebrows: `--font-semibold` + `--tracking-wider` + uppercase
- Code: `--font-mono`, never use sans for code
- Stat numbers: `--text-4xl` + `--font-bold` + `--tracking-tight`

---

## 4. Spacing

```css
:root {
  --space-1:  0.25rem;   /* 4px  */
  --space-2:  0.5rem;    /* 8px  */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */

  /* Component-specific */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* Content max-widths */
  --max-w-sm:   480px;
  --max-w-md:   720px;
  --max-w-lg:   960px;
  --max-w-xl:   1120px;
  --max-w-2xl:  1280px;
}
```

---

## 5. Elevation / Shadows

In dark mode, elevation is communicated via **background lightness**, not box-shadow.
Shadows are used only as subtle depth cues, never as decoration.

```css
:root {
  --shadow-sm:  0 1px 3px rgba(1, 4, 9, 0.4), 0 1px 2px rgba(1, 4, 9, 0.24);
  --shadow-md:  0 4px 6px rgba(1, 4, 9, 0.5), 0 2px 4px rgba(1, 4, 9, 0.3);
  --shadow-lg:  0 10px 20px rgba(1, 4, 9, 0.6), 0 4px 8px rgba(1, 4, 9, 0.35);
  --shadow-glow-indigo: 0 0 0 3px rgba(99, 102, 241, 0.25);
  --shadow-glow-success: 0 0 0 3px rgba(63, 185, 80, 0.25);
}
```

---

## 6. Transitions

```css
:root {
  --transition-fast:    100ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-base:    200ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-slow:    350ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

**Rules:**
- Color, border-color, background: `--transition-fast`
- Transform, opacity: `--transition-base`
- Slide-in drawers, expanding sections: `--transition-slow`
- NO infinite animations, NO auto-playing animations
- Micro-interactions only: `transform: translateY(-1px)` on hover, scale on button press

---

## 7. Component Tokens — Buttons

```
Primary button:
  background: --color-accent-primary
  color: white
  font-weight: --font-semibold
  padding: 8px 16px
  border-radius: --radius-md
  border: none
  hover: background --color-accent-primary-hover, transform translateY(-1px)
  focus: box-shadow --shadow-glow-indigo

Secondary button:
  background: --color-bg-overlay
  color: --color-text-primary
  border: 1px solid --color-border-default
  hover: background --color-bg-hover, border-color --color-border-muted

Ghost button:
  background: transparent
  color: --color-text-secondary
  border: 1px solid transparent
  hover: background --color-bg-hover, color --color-text-primary

Danger button:
  background: --color-danger-bg
  color: --color-danger
  border: 1px solid --color-danger-border
```

---

## 8. Component Tokens — Cards & Panels

```
Base card:
  background: --color-bg-raised
  border: 1px solid --color-border-subtle
  border-radius: --radius-lg
  padding: --space-6

Hover card (clickable):
  transition: --transition-base
  hover: border-color --color-border-muted, background --color-bg-hover

Success card:
  border-color: --color-success-border
  background: --color-success-bg added over --color-bg-raised

Warning card:
  border-color: --color-warning-border
  background: --color-warning-bg added over --color-bg-raised

Status badge / pill:
  font-size: --text-xs
  font-weight: --font-semibold
  text-transform: uppercase
  letter-spacing: --tracking-wider
  padding: 3px 8px
  border-radius: --radius-full
  border: 1px solid (matching accent border)
  background: (matching accent bg)
```

---

## 9. Z-index Stack

```
z-index values (from bottom to top):
  0     — base content
  10    — sticky section headers
  20    — floating controls (filter bar)
  30    — detail drawers
  40    — top navigation bar
  50    — modals, overlays
  60    — tooltips, dropdowns
```

---

## 10. Grid & Layout

```
App shell:
  display: grid
  grid-template-rows: auto 1fr  (top nav + content area)
  min-height: 100vh

Content area:
  max-width: --max-w-xl (1120px)
  margin: 0 auto
  padding: --space-6 --space-6 --space-16

Two-column layout (Workbench):
  grid-template-columns: 1fr 340px
  gap: --space-6
  align-items: start

Three-column grid (stats, quality pipeline):
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))
  gap: --space-4
```

---

## 11. Import Instructions

Load `Inter` from Google Fonts in the `<head>` of every page:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Since the server is local-first with no internet guarantee, also add the system fallback chain.
The font will work without internet (system-ui fallback), just without Inter.

---

## 12. Accessibility Baselines

- All interactive elements must have `:focus-visible` styles using `--shadow-glow-indigo`
- Minimum contrast ratio 4.5:1 for normal text, 3:1 for large text (WCAG AA)
- `--color-text-secondary` (#8b949e) on `--color-bg-raised` (#161b22): contrast ~5.2:1 ✓
- `--color-text-primary` (#e6edf3) on `--color-bg-base` (#0d1117): contrast ~13.1:1 ✓
- Never rely on color alone to communicate state — always pair with text label or icon
- All filter buttons must use `aria-pressed`, nav links use `aria-current="page"`
