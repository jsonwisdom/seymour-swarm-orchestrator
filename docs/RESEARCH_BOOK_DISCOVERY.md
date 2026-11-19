# Seymour — GitHub Research Book discovery adapter

Status: **draft code, not deployed or wired into live Worker routes**.

Seymour is the proposed **discovery coordinator**, not a human command authority.
Jason Wisdom retains merge/deploy/publication authority.

Source: `src/github-research-book.ts`, read-only GitHub REST adapter. Fetches
both open and closed PRs with pagination; classifies open draft, open non-draft,
merged, and closed unmerged. It reports truncation rather than fabricating
completeness. The adapter is not yet invoked by `src/project-index.ts`.

Original book: `jsonwisdom/COMPUTERWISDOM` PR #773 draft branch
`oodleloop/quadratic-restoration-v0.3.0/SEYMOUR_RESEARCH_BOOK.md`.
Original 559-PR metadata inventory:
`oodleloop/quadratic-restoration-v0.3.0/SEYMOUR_RESEARCH_BOOK_PR_INDEX.json`.

Run `npm test` to validate the synthetic regression suite.
No private data, secret, full conversation history, merge, PR closing, deployment
or autonomous runtime action is authorized.

Next: integrate this adapter with Seymour's project index behind explicit read-only
configuration, add durable checkpoints and cross-run replay tests, then independently
verify deployed recovery before claiming that Seymour operates the book.
