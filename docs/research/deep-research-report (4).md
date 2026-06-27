# MergeLearn Tutor UI and UX Deep Research Report

## Executive recommendation

MergeLearn Tutor should continue in its current direction, but the UI should stop behaving like a collection of equally weighted admin pages and instead become a local-first learning workbench with a very small number of primary surfaces. The strongest product shape is a command-centre home that tells the learner what to do next, a focused practice surface for one-card review and due probes, a map surface for provenance and concept relationships, and a setup surface for defining learning plans and question mix. That recommendation is strongly supported by the current internal review packet, which already identifies Workbench as the best home candidate and calls out flat navigation, repeated shell chrome, and page sprawl as the main problems. fileciteturn5file1

The current UI already contains unusually valuable ingredients for a repo-aware tutor: active recall, confidence-before-reveal, delayed probes, provenance, question staging, and progress inspection. Those are strong differentiators, especially because the product remains local-first, avoids telemetry, avoids target-repo execution, and does not require remote LLM calls. The redesign should therefore preserve trust and evidence traceability, not replace them with flashy visual polish. fileciteturn5file3turn4file19

The clearest strategic move is to reframe the UI around a weekly habit loop:

**Open Workbench → follow the next action → complete a short focused practice step → inspect why it mattered → leave.**

That is more aligned with learning science than the current “choose among 11 pages first” model, and it is more aligned with how successful practice products minimise activation energy. Retrieval practice and spaced review remain among the strongest evidence-backed learning patterns, while self-explanation and guided worked context help convert “I saw this code” into “I can explain this code”. citeturn7search2turn7search4turn6academia2turn6academia3turn6academia1turn4academia1

The product should also explicitly resist becoming a generic code search, documentation, or AI review tool. Adjacent tools are already good at retrieval, repo explanation, onboarding tours, and PR feedback. Sourcegraph focuses on scoped code search with rich filters, DeepWiki positions itself as repository documentation you can talk to, Swimm emphasises application understanding and deterministic traceability, CodeTour offers guided walkthroughs inside the editor, GitLens excels at visual file history and commit exploration, and CodeRabbit focuses on AI code review and planning. MergeLearn Tutor’s defensible space is different: **learning from your own repo evidence over time, with honest memory checks and provenance.** citeturn14view0turn15view0turn11view0turn11view1turn10view0turn22view0turn22view1turn17view0

That distinction matters because current AI-assisted development creates a real comprehension problem, not just a production-speed problem. Recent research reports a comprehension-performance gap in brownfield programming with Copilot, shows that developers validating LLM-written code behave differently and benefit from provenance awareness, and finds that GenAI explanations for code comprehension can be inaccurate or unclear, especially for novices. Industry evidence also suggests that AI shifts the bottleneck from writing toward review and governance, while practitioners increasingly complain about reviewer burden and “AI slop”. citeturn20academia3turn0academia9turn20academia2turn16news0turn16academia6turn19academia9

The main thing to avoid is adding more pages, more decorative graphs, or more settings before the daily flow is simpler. The internal packets are right on this point: the next wave should consolidate, not expand. The strongest short-term UI moves are to fix Workbench semantic filters, add a reusable detail drawer, introduce a grouped app shell, and create a one-card practice mode. fileciteturn5file1turn4file6turn4file16

## Current UI diagnosis

The biggest problem is navigation burden. The product currently exposes Workbench, Review, Plan Builder, Courses, Questions, Timeline, Graph, Study, History, Progress, and Preferences as peers. Both the current-state brief and the UI review packet describe the same issue: the platform has strong capabilities, but it feels like many equally weighted admin pages instead of one comprehensible learning product. That means the user must understand the internal system model before they can even decide where to click. fileciteturn5file3turn5file1turn4file7

The second problem is vertical hierarchy. The current shell repeats a large page frame, a full nav, summary cards, and hero sections before the core task begins. On the current Review page, the actual recall action is pushed below shell chrome, readiness guidance, generation controls, and metadata, even though review is the central habit loop. The UI review packet explicitly notes that dense pages start too low and that primary actions should come earlier. fileciteturn5file1turn5file0

The third problem is visual sameness. The dark theme is consistent and high-trust, which is an asset, but almost every page uses the same rounded panels, pill nav, metric cards, and stacked sections. That creates cohesion at the expense of wayfinding: Workbench, Plan Builder, Study, History, and Progress can all feel like variations of the same dashboard card stack. The redesign should preserve the dark identity while giving each mode a distinct layout grammar. fileciteturn5file1turn4file14

The fourth problem is terminology. “Courses” still sounds like a formal curriculum object, while the product’s actual use case is closer to a repo-specific learning plan or focus area. “Study” is research-valid terminology, but “Active-control pilot” reads like an experiment console rather than a practicable user feature. “Preferences” is too prominent for what are mostly generation settings. The internal research packet already recommends moving toward “Plan”, “Track”, or “Focus”, and folding settings into guided setup. fileciteturn4file6turn4file16turn5file0

The fifth problem is interaction mismatch inside the new Workbench. Workbench is indeed the best candidate homepage, but its semantic filters are currently broken in meaning. The page-functionality notes explicitly say the seeded demo hides all nodes for `Due`, `Weak`, and `Evidence`, because filter names describe semantic states while nodes are typed as `concept`, `card`, `event`, and `study`. That is not cosmetic; it undermines the homepage’s core affordance and should be fixed before larger visual investment. fileciteturn5file0turn5file1

The sixth problem is that several pages are really different projections of one shared model yet appear unrelated in the UI. Timeline, Graph, Progress, History, and parts of Review all describe the same pipeline from repo evidence to concepts to questions/cards to answers/probes. Right now that shared ontology is visible only if the user already understands the backend. A better UI should make that ontology explicit across surfaces. fileciteturn5file1turn4file18

These issues matter because adjacent tools are already raising user expectations. GitLens offers commit graph, visual file history, and filtered code-history exploration; Obsidian’s graph view offers local focus, search, filters, and depth control; Anki demonstrates the enduring appeal of simple cards plus review statistics and due forecasts. MergeLearn Tutor does not need to imitate them wholesale, but it does need the same clarity about “what is this view for?” and “what is my next action?” citeturn22view0turn22view1turn9view0turn12view0turn13view0

## Page-by-page critique

### Workbench

The current job of Workbench is correct. It is the command-centre landing page, showing the next action, high-level counts, and a clickable visual map. The internal page notes describe it as the best existing homepage candidate, and the current screenshot supports that judgment: it already attempts to connect active cards, due probes, weak concepts, study assignments, and evidence links. fileciteturn5file0turn5file1

What works is the framing. “Learning Workbench” is a better mental model than “dashboard”, and the explicit “Next” CTA is the right direction. What is confusing is the actual map behaviour and the amount of shell repetition above it. The map still behaves more like a row of styled cards than a true explorable learning map, and the semantic filters are not trustworthy yet. Keep Workbench as the default home, but upgrade it into a real command-centre rather than a multi-panel summary page. Merge nothing into it visually until the semantic filter model and a detail drawer exist. fileciteturn5file0turn5file1turn5file2

### Review

The current Review page is the product’s functional centre. It already supports confidence-before-reveal, answer capture, explanation reveal, and self-grade, and newer screenshots also show quality-gate messaging. Those are all strong learning behaviours because they support retrieval, calibration, and feedback instead of passive reading. fileciteturn5file0turn4file19

What works is the answer-first structure. That is the core thing to preserve. What is confusing is density: quality info, evidence context, generation controls, plan state, and routing pills compete with the actual review action. The page should keep all the current learning logic, but most secondary context should move into a collapsible drawer, post-answer state, or advanced submode. Review should become “Practice” in the top-level IA, with a default one-card surface and an advanced audit mode kept available. fileciteturn5file0turn5file1turn4file16

### Plan Builder

Plan Builder’s job is to connect setup to daily review readiness. That is valuable, and the current page has a good operational checklist feeling. It tells the user what must happen before cards become useful. fileciteturn5file0

The problem is not the content; it is the placement. Plan Builder overlaps heavily with Workbench and Courses. It should not remain a permanent top-level destination. Keep its stepwise checklist model, but move it into Workbench’s “setup incomplete” state and into a dedicated Setup/Plan surface. In other words, keep the logic, remove the navigational weight. fileciteturn5file0turn4file18

### Courses

Courses currently hold the learning goal and evidence scope. That is a legitimate domain object, but the name and form are too product-internal. The current page is form-heavy and technical, and it doesn’t sufficiently preview what a saved course unlocks. fileciteturn5file0

The right move is to keep the underlying model for now but rename the UI concept to **Learning Plan**. That better matches the repo-specific, goal-specific, configurable nature of the object and avoids classroom baggage. This is also consistent with the existing improvement packet, which recommends changing the UI language before changing the storage model. fileciteturn4file6turn4file16

### Questions

Questions are one of the product’s most valuable and least mature surfaces. The draft/accept/reject staging model is excellent because it prevents every generated prompt from becoming a study obligation. The page also already surfaces evidence, expected answers, and network status, which supports trust. fileciteturn4file16

What is confusing is the current framing as an admin queue. The page needs to become a **question quality pipeline** with clear stages and visible quality signals. That means draft, review, accepted, and card-ready lanes; deterministic quality badges; duplicate warnings; preview-card affordances; and better diversity controls. Keep the object model. Move everyday question acceptance into Setup and reserve the full inspection view for Audit. fileciteturn4file16turn4file6

### Timeline

Timeline’s job is provenance, and that is strategically important. The current notes describe it well as a GitLens-style source history, moving from commits and files through concepts to learning artifacts. That is exactly the kind of explainability the product should lead with. fileciteturn5file0

What is confusing is the current presentation as a dense vertical list. Timeline should not disappear, but it should be recast as a **provenance lane** or trace path that answers a single user question efficiently: “Why am I seeing this card?” Keep the data model, move the surface into Map, and support filters, focus, and copyable evidence packets for debugging. fileciteturn5file0turn4file18

### Graph

Graph is promising and dangerous at the same time. The current graph already demonstrates the product chain from evidence to concepts to questions to cards and events, which is an unusually strong transparency feature for a learning tool. But the graph is close to hairball territory even at small demo scale, and current notes correctly warn against adding a heavy graph library before task design is clear. fileciteturn4file16turn5file1

What should stay is the commitment to graph-backed explainability. What should change is the interaction model: use local focus, search, node-type toggles, depth controls, and click-to-open detail drawers. Obsidian’s local graph is the right metaphor to borrow, not a homepage force graph. The graph should move under Map as one mode among several, not remain a standalone top-level attraction. citeturn9view0

### Study

Study is conceptually important because it lets the product compare active recall with passive review and prevents overclaiming learning efficacy. That is a strength, not a distraction. The current state brief explicitly warns against claiming scientific efficacy without evaluation evidence, and this surface is part of that honesty. fileciteturn5file3

What is confusing is research-language prominence. “Active-control pilot” is valid internally, but for most users it reads as experimental machinery. Keep the feature, but rename it in the UX to something like **Compare methods** or **Study mode**, and show the research framing as a collapsed explanation. Also move it out of top-level nav prominence and under Practice or Labs. fileciteturn5file0turn5file2

### History

History currently acts as audit memory for batches, events, and card states. That is useful for transparency and regeneration trust. It is especially important because this product is local-first and evidence-driven rather than black-box adaptive. fileciteturn4file19

The problem is that History currently reads like another dense panel stack. It should become a filterable activity log with expandable event cards, quality-issue filtering, and links back to the same detail drawer used elsewhere. Keep History as Audit, not as a daily destination. fileciteturn5file0turn4file16

### Progress

Progress contains important learning-state information, but it currently behaves more like a diagnostic dump than a learning map. The current note packet says exactly that: useful data, but not yet a map. That diagnosis is right. fileciteturn5file0

What should stay is the honest distinction between activity and mastery. What should change is the visual form. Progress should become a grouped skill map or heatmap by concept kind and status, with labels that communicate evidence quality, not only percentage. A progress number with sparse evidence can be misleadingly precise. Keep the raw detail accessible, but make the primary view action-oriented: what is weak, what is warming up, and what needs more recall evidence. fileciteturn4file16turn4file18

### Preferences

Preferences contain real configuration value, especially for question planes and snippet sizing, but they are currently too exposed as a primary page. The page notes are right: this is too much user-facing configuration for the main nav. fileciteturn5file0

Most preferences should move into contextual setup and per-plan overrides. Keep a slim advanced settings surface for experts, privacy controls, and debugging defaults, but remove Preferences from the centre of the daily loop. This aligns with progressive-disclosure thinking and with the product’s broader goal of reducing first-use complexity. fileciteturn4file16turn21search0

## Recommended information architecture

The top-level IA should shrink from the current many-way choice into five primary areas:

**Workbench, Practice, Map, Audit, Setup.**

That grouping matches the strongest internal recommendations already present in the review packet, and it is the smallest structure that still preserves transparency, setup, and learning action. fileciteturn5file1turn4file18

### Workbench

Workbench should be the default route and the daily home. Its only job is to answer four questions quickly:

- What should I do next?
- Why is that the next thing?
- What is weak or due?
- Where can I go if I want detail?

The page should contain a compact status strip, a session cockpit, an interactive local learning map, and a small retention/calibration summary. If setup is incomplete, the main card area becomes a setup checklist instead of a generic dashboard. fileciteturn5file2turn4file14

### Practice

Practice should absorb the current Review surface, due delayed probes, and the user-facing portion of Study. Inside Practice, the default submode is **One Card**, with secondary tabs or toggles for **Due Probes**, **Compare Methods**, and **Queue/Audit**. This keeps the daily learning action simple while still preserving experimental and advanced flows. fileciteturn5file1turn5file2

### Map

Map should unify the current Graph, Timeline, and most of Progress. It should not be “the graph page”; it should be the place where the user explores the learning model. That means one shared filter bar, one shared detail drawer, and multiple view modes: **Local Graph**, **Provenance Lane**, and **Skill Map**. Those should all operate on one ontology rather than feeling like different products. fileciteturn5file1turn4file18

### Audit

Audit should absorb History, raw JSON/debug links, and the full question/card generation audit. Users who want to inspect why something exists, what changed after regeneration, or which cards were rejected should come here. Debug transparency stays, but it is visually de-emphasised relative to practice actions. fileciteturn4file16turn5file1

### Setup

Setup should absorb Plan Builder, Courses, most Preferences, and the practical question-acceptance workflow. The internal term can remain `course` for now, but the user-facing object should become **Learning Plan**. Setup should use a wizard or step-flow:

**Goal → Scope sources → Choose question mix → Review draft questions → Generate first study session.** fileciteturn4file16turn4file18

This IA also aligns with what adjacent products get right. CodeTour reduces onboarding complexity by turning repository knowledge into guided steps instead of static docs, while GitLens reduces history complexity through filtered, task-oriented views rather than one giant unstructured screen. MergeLearn Tutor should do the same for learning workflows. citeturn10view0turn22view0turn22view1

## Component and visualization proposals

### Session cockpit

This should become the most important reusable component in the product. It is a compact panel that says exactly what the user should do next and why, for example: “Answer one card”, “Complete one delayed probe”, or “Finish setup for your learning plan”. The internal review packet already recommends this, and it matches the short-session clarity seen in successful habit products. fileciteturn4file18turn5file2

### One-card review

Practice should default to a single large card, not a vertically long page of context. The card should show the source path, a short snippet, the prompt, answer input, confidence selector, reveal action, self-grade actions, and a collapsed “why this card exists” section. This fits both learning science and Anki-style ergonomics: simple cards, minimal pre-reveal noise, and explicit review outcomes. Anki’s manual explicitly emphasises keeping cards simple and not memorising without understanding, while its stats model also distinguishes due load, retention, and review history. citeturn13view0turn12view0

### Detail drawer

A persistent right-side drawer should become the shared “inspect” affordance across Workbench, Map, Audit, and post-answer Review. Clicking a node, concept, card, question, or event should open the same drawer with title, type, source path, related evidence, quality history, and direct next actions. This reduces vertical page sprawl and creates one coherent interaction system for provenance. fileciteturn4file18turn5file1

### Interactive local learning map

The product should have a graph, but not a decorative global network as the first interaction. The right v1 is an **Obsidian-style local graph for the current learning task**, with focus depth, search, node-type toggles, and semantic highlighting for weak, due, and study-related items. Obsidian’s official graph view supports search, filters, groups, and a local graph with configurable depth, which is exactly the interaction model MergeLearn Tutor needs. citeturn9view0

### Provenance lane

This should be the main Timeline replacement. It is a left-to-right explainability view:

**Commit or file or doc → concept → question → card → answer event → delayed probe**

GitLens is the clearest adjacent reference here. Its visual file history and commit graph both focus on filtered, explorable evolution over time rather than a dense undifferentiated list. The best thing to borrow is not styling but task orientation: search, filters, hide clutter, inspect detail on hover or click, and keep history visually tractable. citeturn22view0turn22view1

### Skill map

Progress should become a grouped concept-health surface rather than a long set of percentages. The most useful starting form is a heatmap or grouped tree by concept kind, with status buckets such as **new**, **warming up**, **needs evidence**, **overconfident**, and **stable**. The key design rule is to show evidence honesty, not faux precision. A concept with one passive exposure and one wrong answer should not visually resemble a stable memory trace. fileciteturn5file0turn4file18

### Retention and calibration panel

Anki’s statistics show a durable pattern worth borrowing: due forecast, review history, retention views, and answer-button breakdowns. MergeLearn Tutor should use that pattern selectively, showing due probes, confidence-accuracy gaps, missed-after-certainty patterns, and weak concepts. It should not adopt volume-first gamification or streak semantics that overstate learning. citeturn12view0turn13view0

### Setup wizard

Setup should use a step-by-step wizard with progressive disclosure rather than exposing every option up front. The user first defines a goal, then scopes paths/docs, then sets question mix, then previews draft questions and likely first cards. This makes setup legible without hiding power from advanced users. Progressive disclosure as a pattern is specifically designed to reduce error-prone complexity by revealing advanced choices when relevant. fileciteturn4file18turn21search0

### Quality badge system

Questions and cards should carry deterministic badges such as **specific evidence**, **duplicate risk**, **single-source warning**, **broad prompt**, **missing expected answer**, and **good multi-source card**. This is especially important because question trust, not graph polish, is the biggest UX risk in a tutor. The current internal roadmap is right to prioritise deterministic scoring before optional LLM enrichment. fileciteturn4file16

## Reference patterns

### Obsidian

Borrow local focus, depth controls, search, node filtering, and click-to-open detail from Obsidian’s graph view. Obsidian’s official help makes clear that its graph becomes useful because users can search, group, hide clutter, and inspect local relationships, not because the graph itself is decorative. Avoid making a global hairball the homepage. citeturn9view0

### GitLens

Borrow GitLens’ task-oriented history exploration. Its commit graph supports search, filtering, compact layouts, and clutter reduction, while visual file history makes evolution legible through timeline and swim-lane metaphors. That is the right conceptual model for MergeLearn’s evidence and provenance surfaces. Avoid copying GitLens’ full Git complexity or surfacing advanced history controls before a simple trace question is answerable. citeturn22view0turn22view1

### Anki

Borrow simplicity of the review interaction, keyboard-oriented flow, due forecasting, and honest stats. Anki’s manual explicitly recommends simple cards and understanding over brute memorisation, and its statistics separate due load, interval structure, retention, and answer behaviour. Avoid raw memorisation mechanics detached from understanding, and avoid making performance snapshots look more trustworthy than the evidence behind them. citeturn13view0turn12view0

### Linear

Borrow the command-centre feel, tight status language, filtered views, and “one obvious next action” behaviour. The internal UI brief already identifies this as a good reference. Avoid bringing in project-management jargon or making learning plans feel like work tickets. fileciteturn5file2

### Duolingo

Borrow low activation energy, a very short session framing, and lightweight momentum cues. The internal packet’s caution is right: use progress to orient, not to pressure. Avoid streak mechanics and any gamification that rewards volume over retention honesty. fileciteturn5file2turn4file18

### CodeTour

Borrow guided walkthrough structure. CodeTour’s marketplace description emphasises interactive codebase walkthroughs tied to directories, files, and lines, useful for onboarding, context building, and PR understanding. That is highly relevant for MergeLearn’s future “why this concept exists” explanations or repo-area orientation. Avoid turning the whole product into static tours; tours are an aid, not the main learning loop. citeturn10view0

### Swimm and DeepWiki

Borrow traceability and scoped explanation, not the core product role. Swimm explicitly positions itself around deterministic, traceable application understanding, dependency mapping, and natural-language logic explanations. DeepWiki positions itself as “documentation you can talk to” for repositories. Those are useful reminders that developers want understandable context, but MergeLearn should not mutate into generic application understanding or repo chat. Its job is repeated learning from personal repo evidence over time. citeturn11view0turn11view1turn15view0

### Sourcegraph and CodeRabbit

Borrow scoping and workflow fit, not the mission. Sourcegraph’s search syntax shows the value of precise scope controls like repo, file, language, diff, author, and revision filters; MergeLearn should reuse that lesson in plan scoping and map filtering. CodeRabbit shows how code-review platforms are extending across PRs, IDEs, CLIs, and planning. That means MergeLearn should stay sharply differentiated around learning rather than drift into another review bot. citeturn14view0turn17view0

## Implementation roadmap

### Slice one

**Goal:** Fix Workbench semantic filters and introduce a reusable detail drawer.

**Why first:** This corrects a confirmed UX failure on the strongest current homepage candidate and creates the interaction primitive needed across Workbench, Map, and Audit. fileciteturn5file0turn5file1

**Files likely touched:** `src/core/workbench.ts`, `src/session/server.ts`, `/api/workbench` renderer/helpers, browser JS for node click and filter state, tests around workbench summary and DOM markers. The internal implementation brief already suggests a `buildWorkbenchSummary(state)` adapter. fileciteturn5file2

**Acceptance criteria:** `Due`, `Weak`, `Study`, and `Evidence` filters all show semantically appropriate nodes; clicking any visible node opens a populated drawer; no remote calls are added; current routes remain stable. fileciteturn5file1turn5file2

**Verification:** unit tests for semantic tags and filtered counts, server tests for `/workbench`, browser smoke for clicking nodes and filters, full local checks. fileciteturn5file2

### Slice two

**Goal:** Introduce a grouped app shell and reduced top-level navigation.

**Why now:** Once Workbench interaction is trustworthy, the next biggest usability cost is flat navigation and repeated shell overhead. fileciteturn5file1

**Files likely touched:** `src/session/server.ts`, shared template helpers, style token file or CSS section, route labels, minimal client-side nav state if needed.

**Acceptance criteria:** top-level nav exposes only Workbench, Practice, Map, Audit, and Setup; old routes still work; the shell uses a compact status strip rather than repeated heavyweight hero sections on every page.

**Verification:** screenshot comparison across all current pages, HTML assertions for new nav groups, browser smoke for route preservation.

### Slice three

**Goal:** Build a one-card Practice mode with keyboard shortcuts and post-answer progressive disclosure.

**Why now:** This directly improves the core habit loop and operationalises the product’s learning-science strengths. It also prevents Review from remaining a dense “everything page”. Retrieval practice, feedback, and spaced review are the most research-backed parts of the product, so the main practice surface deserves focused investment before more visual exploration work. citeturn7search2turn6academia2turn6academia3

**Files likely touched:** review renderer helpers, practice route or mode toggle, existing answer/reveal/self-grade endpoints, client JS for keyboard handling, CSS for focused layout.

**Acceptance criteria:** default Practice view shows one primary card at a time; metadata stays collapsed until reveal or drawer open; keyboard shortcuts work; confidence-before-reveal is preserved; “bad card” reporting stays available.

**Verification:** DOM marker tests, browser interaction tests, screenshot evidence with and without revealed explanation.

### Slice four

**Goal:** Replace Courses plus Plan Builder plus most Preferences with a single Setup wizard around Learning Plans.

**Why now:** After Practice is credible, the next activation-cost problem is setup fragmentation. The user should not hop between Courses, Questions, and Preferences to produce their first useful session. fileciteturn4file16turn4file18

**Files likely touched:** course-related UI wording, wizard renderer, existing course persistence, question-plane settings surface, preview helpers, maybe no schema change yet.

**Acceptance criteria:** user can create or edit one learning plan in one flow; plan includes goal, source scope, question mix, and preview; Settings retains only advanced defaults; UI language uses “Learning Plan” while backend can still use `course`.

**Verification:** persistence tests, route/server tests, screenshot of empty-state and completed-state setup.

### Slice five

**Goal:** Unify Graph, Timeline, and Progress into a Map surface with three view modes: Local Graph, Provenance Lane, Skill Map.

**Why now:** Once shell, Workbench, and Practice are coherent, the product can safely consolidate its explainability views without confusing first-time users. This is also the point where a shared ontology becomes visible to the user. fileciteturn5file1turn4file18

**Files likely touched:** graph/timeline/progress renderers, shared filter bar, shared drawer, maybe a new map adapter over existing evidence/progress data.

**Acceptance criteria:** one route or grouped Map area exposes all three views with shared filters and selected-node state; selecting a node reveals ancestors/descendants or related evidence; raw JSON moves to Audit or collapsed debug panels.

**Verification:** browser smoke, DOM assertions for shared filter state, screenshot evidence for each view mode.

### Slice six

**Goal:** Recast History, Questions audit, and debug JSON into an Audit surface.

**Why now:** Once daily use and explainability are clear, audit information can be made powerful without polluting the primary loop.

**Files likely touched:** history renderer, questions inspection UI, debug link placement, drawer reuse.

**Acceptance criteria:** Audit supports filters by source, card status, generation quality, and event type; raw JSON is still accessible but visually secondary; questions can be inspected as pipeline artefacts rather than top-level primary workflow.

**Verification:** screenshot pass, DOM route tests, browser smoke for filter interactions.

### Slice seven

**Goal:** Polish the design system and add honest retention/calibration panels.

**Why now:** This is intentionally later. Better tokens and reusable components matter, but only after flow and semantics are correct. Likewise, retention/calibration visuals should be added after the main practice view is simpler, not before. fileciteturn4file16turn4file14

**Files likely touched:** shared CSS tokens, reusable render helpers, calibration/probe summary components.

**Acceptance criteria:** components have shared tokens and spacing rules; calibration visuals show real signals only; no fake engagement metrics appear.

**Verification:** visual regression screenshots, no-console-error smoke, end-to-end local verification.

## Risks and anti-patterns and final prioritized ticket list

Visual polish can easily harm clarity here if it arrives before interaction semantics. The biggest anti-pattern is building a beautiful but untrustworthy graph. The internal packets are correct to warn against decorative force-graph work before filter and focus tasks are properly designed. A graph that looks sophisticated but cannot answer “why did this card appear?” will degrade trust, not improve it. fileciteturn5file1turn4file15

A second risk is learning dishonesty. The product already corrected one mastery mistake after dogfooding by capping passive exposure, which is exactly the sort of humility the UI must preserve. Any redesign that foregrounds mastery numbers, progress bars, or streak-like cues without visible evidence quality, delayed recall, and calibration context would make the product feel more “successful” while becoming less honest. fileciteturn4file12turn4file18

A third risk is drift into adjacent categories. Repo Q&A, code-tour generation, and AI review are already crowded spaces. The product should borrow interaction ideas from those tools but not surrender its identity. Research on GenAI in code comprehension, brownfield performance, and automated code review all points to the same opportunity: developers can ship more with AI without understanding more, and explanation quality plus reviewer burden remain real problems. MergeLearn should stay focused on repository-grounded learning loops, not chase general-purpose AI assistance. citeturn20academia2turn20academia3turn19academia9turn16academia6

A fourth risk is privacy drift through convenience features. The local-first posture is a major asset. Workbench, Setup, and Map should continue to run on existing local state and local APIs. If optional LLM features ever arrive later, they should remain explicitly gated, previewable, and separate from the deterministic truth path. The current brief is right to avoid remote calls and telemetry as a default. fileciteturn4file19turn5file2

A fifth risk is overexposing experimental Study controls. The feature is valuable for honest evaluation, but it should not dominate navigation or scare users with research terminology before they have even answered a card. Keep it, rename it in the UX, and scope it appropriately. fileciteturn5file0turn5file3

### Final prioritized ticket list

**Fix Workbench semantic filters and add the shared detail drawer.**  
This is the highest-confidence first ticket because it fixes a confirmed homepage bug and establishes a reusable interaction primitive. fileciteturn5file1turn4file15

**Refactor the app shell into five grouped primary areas.**  
Reduce top-level choices to Workbench, Practice, Map, Audit, and Setup while keeping legacy routes alive. fileciteturn5file1turn4file18

**Build the one-card Practice mode.**  
Preserve confidence-before-reveal and self-grading, but move secondary evidence into a drawer or post-answer state. fileciteturn5file0turn4file16

**Rename Courses to Learning Plans in the UI and merge Plan Builder into Setup.**  
Keep backend continuity, but change user-facing terminology and flow. fileciteturn4file6turn4file16

**Turn Questions into a quality pipeline with deterministic badges and preview-card affordances.**  
This is the main trust lever after Practice simplicity. fileciteturn4file16

**Unify Graph, Timeline, and Progress into the Map area with shared filters.**  
Start with local graph, provenance lane, and skill map views backed by one drawer and one filter system. fileciteturn4file18turn5file0

**Move History and raw JSON into an Audit area with filters and expandable event cards.**  
Keep transparency, reduce daily-loop clutter. fileciteturn4file16turn5file0

**Add retention and calibration panels that show real signals only.**  
Due probe forecast, overconfidence gap, and weak concepts should become visible without inventing engagement theatre. citeturn12view0turn13view0

**Apply shared design tokens and layout grammars per mode.**  
Workbench should look like a cockpit, Practice like a session, Map like a trace canvas, Audit like an activity log, and Setup like a wizard. fileciteturn5file1turn4file14

### Open questions and limitations

The strongest unresolved UX question is whether “Study” should live inside Practice as a secondary mode or be hidden under a Labs-style affordance until there is enough user data to justify more prominence. The current materials support de-emphasising it, but not removing it. fileciteturn5file0turn5file3

The strongest unresolved architecture question is whether a workspace-level repo picker should appear in the same redesign wave or wait until the core per-repo habit loop is simpler. The internal recommendations support a local workspace index later, but the current evidence suggests that multi-repo convenience is less urgent than daily-loop clarity. fileciteturn4file16

The strongest unresolved product-language question is whether “Plan”, “Track”, or “Focus” tests best with users. “Learning Plan” is the safest default from a clarity perspective, but the naming decision should ideally be validated in a small user test before it becomes permanent. fileciteturn4file6