# How to run this Deep Research packet

## Fast path

1. Open `agent-drag-drop-packets/01-ui-ux-deep-research/README.md`.
2. Attach `00-AGENT-PROMPT.md` first.
3. Attach the numbered Markdown context files in the same folder.
4. Attach the screenshots listed in `06-visual-evidence-index.md`.
5. Ask the Deep Research agent to produce the report using the output template.
6. Save the result to `outputs/01-ui-ux-deep-research-report.md`.

## If the agent supports images

Attach all full-page screenshots and `contact-sheet.png`. The visual evidence is important; do not rely on text summaries alone.

## If the agent does not support images

Attach `page-functionality.md`, `frontend-review-packet.md`, and `screenshot-index.tsv`. The result will be weaker because it cannot inspect visual hierarchy directly.

## After reports return

Synthesize the output into an implementation sequence. Prioritize fixes that reduce navigation confusion and improve the daily review loop before decorative visual polish.
