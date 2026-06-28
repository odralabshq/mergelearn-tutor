# MergeLearn Tutor — Page Specification v2

This document details the exact layout, visual hierarchy, element positioning, and responsive behavior for each of the five primary surfaces of the redesigned MergeLearn Tutor. 

All future UI implementation iterations must conform to these specifications.

---

## 1. Top Navigation & App Shell

The App Shell provides the global frame and must be consistent across all surfaces.

### Layout & Structure
- **Global Header**: Sticky, thin horizontal bar (`height: 48px`, `background: var(--color-bg-base)` with `backdrop-filter: blur(12px)` and `border-bottom: 1px solid var(--color-border-subtle)`).
- **Left**: App Logo (`MergeLearn Tutor` in custom gradient text, bold Inter, size `15px`) and active repo branch badge (`font-family: var(--font-mono)`, `color: var(--color-text-secondary)`).
- **Center**: Nav tabs (`Workbench`, `Practice`, `Map`, `Audit`, `Setup`). All tabs are compact pills with no borders by default. Active tab has `background: var(--color-bg-selected)` and `border: 1px solid var(--color-border-emphasis)`.
- **Right**: Global session metrics (e.g., `Due Probes: X`, `Active Cards: Y`) in small, muted text.

### Responsive Behavior (Mobile / Small Screens)
- Wrap navigation tabs onto a second row if screen width is `< 768px`.
- Do not hide nav tabs behind a hamburger menu; learning options must remain visible and clickable.

---

## 2. Workbench (`/workbench`)

The Workbench is the learning cockpit and default landing page. It is optimized for high information density with low cognitive load.

### Grid Layout (Two Columns)
- **Main Column (Left, `2/3` width)**:
  - **Hero Header**: Greeting and a single clear Next Action CTA button (e.g., "Start Daily Session" or "Complete 3 Due Probes").
  - **Dynamic Card Grid**: Shows interactive cards representing concepts and study states.
- **Detail Drawer (Right, `1/3` width, `340px`)**:
  - Permanently visible on desktop; collapses to bottom on mobile.
  - Displays metadata for the selected node: concept detail, file path, confidence levels, and direct links to the code on the local filesystem.

### Interaction Details
- **Filters**: Semantic tags (`All`, `Due Probes`, `Weak Concepts`, `Study Controls`, `Evidence Links`). 
- **Card States**:
  - `Concept`: Violet gradient border.
  - `Card`: Primary indigo border.
  - `Evidence`: Info/sky border.
  - Hovering over any card scales it up slightly (`1.02x`) and highlights connected concepts in the list with a soft glow.

---

## 3. Practice (`/practice`)

The Practice page is the core active-recall learning flow. It is built for absolute focus, hiding all secondary distractions during card review.

### Layout & Workflow
- **Single-Card Focus Layout**: Max width of `720px`, centered.
- **Header**: Simple progress bar (`height: 6px`) representing cards reviewed in this session.
- **Card Panel**:
  - **Question**: Large font size (`var(--text-lg)`), clear contrast.
  - **Code Diff/Snippet**: Rendered in a monospace block (`var(--font-mono)`), with line numbers and syntax highlights for additions (`+`) and deletions (`-`).
  - **Answer Input**: A multi-line textarea with a focus ring.
- **Confidence Rating**: A horizontal row of radio buttons (`Guessing`, `Low`, `Medium`, `High`, `Certain`) styled as clickable capsules. Only visible *before* reveal.
- **Action Footer**:
  - A primary "Reveal Explanation" button.
  - Once revealed, displays correct answer explanation and self-grading actions (`Knew it`, `Missed it`) with keyboard shortcut labels (`Y` / `N`).

---

## 4. Map (`/map`)

The Map surface provides three distinct visual modes for learning relationships, provenance, and skill coverage.

### Mode Selector
A horizontal sub-navigation bar directly under the app header:
1. `Local Graph` (default)
2. `Provenance Lane`
3. `Skill Map`

### Visual Specifications
#### Local Graph Mode
- Rendered via SVG canvas.
- Nodes represent `Files`, `Concepts`, and `Questions`.
- Edges indicate dependency directions.
- Hovering over a node displays a tooltip showing the file path, and dims unrelated nodes by 60%.

#### Provenance Lane Mode
- A left-to-right flow timeline:
  `Git Commit` $\rightarrow$ `Changed File` $\rightarrow$ `Extracted Concept` $\rightarrow$ `Generated Question`
- Vertical lanes group elements by category, styled with low-opacity gradient backgrounds.

#### Skill Map Mode
- A treemap or grid heatmap of all concepts.
- Color indicates mastery:
  - Deep green: fully mastered (`success`).
  - Dark yellow: warning, due soon (`warning`).
  - Dull red: weak, needs review (`danger`).
  - Dark gray: unexposed / new.

---

## 5. Audit (`/audit`)

The Audit page is the quality control pipeline for question generation and card status.

### Grid Layout
- **Quality Pipeline Section (Top, 4 columns)**:
  - Metrics cards for `Draft`, `Accepted`, `Rejected` questions, and `Card-Quality events`.
  - Clicking a metrics card opens a modal displaying the list of matching items.
- **Source Audit Section (Bottom, 2 columns)**:
  - Left: Activity timeline log showing recent reviews and delayed probe responses.
  - Right: Calibration statistics, showing user response accuracy plotted against confidence buckets.

---

## 6. Setup (`/plan`)

Replaces the scattered configuration pages with a unified setup flow.

### Onboarding Steps
1. **Repository Setup**: Target folder picker and git branch selector.
2. **Select Materials**: Toggle specific folders or files to target for concept extraction.
3. **Generate Questions**: Run the AST concept extraction tool, with a progress bar and status indicator.
4. **Configure Mix**: Spaced repetition settings (daily limits, card review type weights) with simple presets (e.g., `Deep Dive`, `Quick Daily Refresh`).
