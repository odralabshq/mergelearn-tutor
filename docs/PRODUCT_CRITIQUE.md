# Product Critique and Execution Notes

## Verdict
The core idea is strong, but only if the product stays different from generic explainers and PR blockers. The best version is a local personal tutor that converts real git history into a learning loop.

## What I changed from the design
- Used a single TypeScript package instead of a monorepo. A monorepo would add ceremony before the product loop is proven.
- Used JSON state instead of SQLite for this repo's first verified version. SQLite remains the intended durable store, but JSON avoids native dependency friction on Node 20.
- Kept LLM out of the default path. The first trust boundary should be deterministic extraction plus evidence links.
- Made dashboard static HTML. No Vite/React app until the content loop is useful.

## Customer perspective
A solo AI-heavy developer does not want another study platform. They want a short answer to: "What should I understand from the code I just shipped?" The CLI therefore leads with `today`, `review`, and `debt`, not with a giant concept graph.

## Research signals considered
- AI assistance can reduce skill formation when treated as an answer machine.
- Developers need comprehension of AI-generated code to verify and integrate changes.
- Retrieval practice and self-explanation are stronger learning loops than passive explanation.
- AI code review tools already compete on finding bugs; this product should compete on personal understanding.

## Risks
- Concept extraction can be too generic. Mitigation: every concept has evidence paths and user correction can be added next.
- The graph can overwhelm. Mitigation: show only the prioritized daily cards first.
- Passive cards can feel productive without learning. Mitigation: explain-back prompts and answer recording are first-class.
- LLM enrichment can hallucinate. Mitigation: keep it optional and evidence-constrained.

## Next product slice
1. Add user-editable concept corrections.
2. Add a `card export` command for Markdown learning journals.
3. Add optional LLM enrichment with an explicit prompt preview.
4. Migrate storage to SQLite when Node >=22 or a stable SQLite dependency is selected.
5. Add a lightweight local web review interaction, not just static display.
