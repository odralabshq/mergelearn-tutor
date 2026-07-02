---
type: reference
title: "Analyzers"
description: "Code analyzers that extract concepts and evidence from a repository."
resource: docs/ANALYZERS.md
tags: [analysis, extraction, ast]
timestamp: 2026-07-02
---

# Analyzer Architecture

## Current decision

MergeLearn Tutor now uses a hybrid deterministic analyzer:

1. Regex/path evidence for concepts where path names are meaningful, such as tests, CLI files, package files, validation files, and auth-related paths.
2. TypeScript AST parsing for TypeScript/TSX language concepts in added diff lines.
3. Repo-domain inference from changed path terms.

The TypeScript AST analyzer is intentionally narrow. It parses added diff snippets, not the full repo, and does not execute target code.

## Why TypeScript compiler API first

The next-phase plan considered TypeScript compiler API vs Tree-sitter.

For the current platform, the TypeScript compiler API is the better first implementation because:

- the product is currently TypeScript/JavaScript focused
- `typescript` is already a dev dependency
- it can parse TS and TSX snippets without extra native dependencies
- it detects symbols/concepts better than regex for common language constructs
- it keeps the local-first/no-target-execution boundary intact

Tree-sitter remains a good later choice if multi-language support becomes important.

## Concepts detected by AST now

The current AST analyzer detects:

- TypeScript interfaces
- TypeScript type aliases
- TypeScript union types
- TypeScript generics on type aliases/functions/methods
- async functions and await expressions
- React `useState` / `useEffect` hook calls

## Integration behavior

For each changed file:

1. Extract added lines from the diff.
2. Parse the added snippet with the TypeScript compiler API if the path is `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, or `.cjs`.
3. Cache AST findings per changed file.
4. Merge AST concept hits with existing deterministic regex/path hits.
5. Attach the AST reason as evidence label when available.

## Dogfood/evaluation result

Batch 3 did not change aggregate concept counts on current fixtures or MergeLearn, which is acceptable for this slice. Its value is precision and maintainability:

- fixture expected concept hit rate stayed 100%
- false TypeScript path-only detection remains blocked
- AST detections are covered by focused tests
- AST parsing is cached once per changed file instead of once per concept definition

## Remaining analyzer work

1. Add full-file AST analysis for changed files when safe and useful.
2. Add symbol/hunk line numbers to evidence.
3. Add duplicate concept detection.
4. Add backend/API fixture repo.
5. Compare AST and regex attribution explicitly in eval reports.
6. Consider Tree-sitter only after TypeScript/JavaScript quality is proven.
