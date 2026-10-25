# Architecture decision records

Each file records one decision: the context, what was decided, and what it costs. ADR
0001 explains why and how.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-record-decisions-as-adrs.md) | Record decisions as ADRs | accepted |
| [0002](0002-search-runs-on-postgres.md) | Search runs on Postgres, OpenSearch is optional | accepted |
| [0003](0003-breached-password-check-fails-closed.md) | The breached-password check fails closed | accepted (PR #178) |
| [0004](0004-dependencies-wait-seven-days.md) | Dependencies wait 7 days after a release | accepted (PR #178) |

Next number: **0005**.

## Writing one

- Copy the layout of an existing ADR: `# ADR NNNN: title`, then a bullet block with
  **Status**, **Date** and **Scope**, then `## Context`, `## Decision`,
  `## Consequences`. Add sections (options, measurements, sources) when they carry
  the decision.
- Name the file `NNNN-short-title.md`, with the next number above, and add a row to
  this table.
- **Status** is one of:
  - `proposed`: written down, not yet in `main` (name the PR);
  - `accepted`: in effect;
  - `superseded by NNNN`: replaced; the new ADR links back to it.
- Do not rewrite an accepted ADR when the decision changes. Write a new one, and set
  the old one's status to `superseded by NNNN`. Fixing a fact or a link is fine.
