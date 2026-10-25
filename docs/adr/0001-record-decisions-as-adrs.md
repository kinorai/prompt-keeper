# ADR 0001: Record decisions as ADRs

- **Status:** accepted
- **Date:** 2026-10-25
- **Scope:** the repo's documentation (`docs/adr/`)

## Context

Decisions about Prompt Keeper lived in pull request bodies and commit messages: why
search moved to Postgres, why a check fails closed, why dependencies wait a week. A PR
body is hard to find once the PR is merged, and it describes the change, not the rule
the next change has to respect. Without the reasoning, the next person to touch the
code can undo a decision without knowing it was one, or rebuild an option that was
already measured and rejected.

The project is public, so contributors outside the maintainer need the same context.

## Decision

Decisions that shape the code or how it is run are recorded as **Architecture Decision
Records** in `docs/adr/`, in Michael Nygard's format, as in the maintainer's other
public project (omnifeed):

- one Markdown file per decision, numbered `NNNN-short-title.md`;
- a bullet block with **Status**, **Date** and **Scope**, then Context, Decision and
  Consequences, plus options, measurements or sources when they carry the decision;
- statuses `proposed`, `accepted` or `superseded by NNNN`;
- the index and the next number in [`docs/adr/README.md`](README.md).

An ADR is worth writing when a change picks one option over others someone could
reasonably choose, sets a default others depend on, or accepts a cost on purpose. A
detail that a code comment explains does not need one.

Earlier decisions are recorded after the fact when they still govern the code, as
[ADR 0002](0002-search-runs-on-postgres.md) does for Postgres search.

## Consequences

- The reasoning stays in the repo, next to the code, and is reviewed in the same PR as
  the change when it is written with it.
- A PR that changes a recorded decision adds a new ADR and marks the old one
  superseded, instead of silently reversing it.
- ADRs cost a little writing per decision, and an ADR left `proposed` after its PR
  merges is stale: update the status in the PR that merges the change, or right after.

## Sources

- Michael Nygard, "Documenting Architecture Decisions" (2011):
  <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>
