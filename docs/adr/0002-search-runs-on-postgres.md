# ADR 0002: Search runs on Postgres, OpenSearch is optional

- **Status:** accepted (recorded after the fact)
- **Date:** 2026-10-24 (PR #177, released in v0.13.0)
- **Scope:** `/api/search` (`src/lib/search/`), `SEARCH_BACKEND`, the outbox worker

## Context

Postgres has always been the source of truth for conversations. Search ran on a second
store, OpenSearch, kept in sync through the transactional outbox: every write or delete
recorded an event in `outbox_events`, and a separate outbox worker applied it to the
index. A self-hoster therefore ran three things for search alone: Postgres, OpenSearch
and the worker.

That second store had costs:

- **Memory:** the OpenSearch container used 1.8 GiB with a 1 GB heap, on a corpus whose
  index was 150 MB.
- **Load:** on a copy of the production database, 8 concurrent clients made
  OpenSearch's parent circuit breaker fail 8,030 requests at the 1 GB heap production
  used. It needed a 2 GB heap to serve them.
- **Freshness:** a conversation became searchable only once the worker had indexed it,
  about a second after the write.
- **Operations:** a second store to upgrade, back up and keep in sync, with its own
  failure modes after a restart.

## Decision

`SEARCH_BACKEND` picks the backend, and **`postgres` is the default**:

- **`postgres`:** full-text search in the database the conversations live in
  (`src/lib/search/postgres.ts`), with the `pg_trgm` and `unaccent` extensions. Both
  are trusted, so the migration creates them as the database owner, with no superuser.
  No other service. The app drains the outbox itself, so no worker runs.
- **`opensearch`:** the previous path, unchanged (`src/lib/search/opensearch.ts`), with
  OpenSearch and the outbox worker.

Both backends take the same request (`src/lib/search/request.ts`), return the same
response shape (OpenSearch's, which the UI was written against), and parse the same
query language (`simple_query_string`, `src/lib/search/query-parser.ts`). Matching
mirrors the OpenSearch mapping: a word matches as the start of a longer word, and a 3-4
letter word also matches inside one. Text is folded for accents and case by one SQL
function on both sides, so a typed word always folds like the text it should find.

How it is stored, how each query maps, and where the two backends differ on purpose
are in [docs/search.md](../search.md).

### Options

| Option | Result |
|---|---|
| Keep OpenSearch as the only backend | The costs above stay |
| Postgres by default, OpenSearch kept as an option (chosen) | One service by default. An install that runs OpenSearch keeps working, and can switch with one variable |
| Postgres only, OpenSearch removed | Not done in PR #177: the OpenSearch path moved over unchanged, behind the shared request, response and parser |

The implementation was written from scratch for this decision. An earlier experiment
branch was set aside.

## Measurements

From [docs/search.md](../search.md), 2026-10-23. PostgreSQL 18.6 against OpenSearch
2.19.2 (1 GB heap), latencies end to end in the app's code.

| | oasst2, 13,159 conversations (1x) | oasst2 x5 (5x) | Production copy, 1,679 conversations |
|---|---|---|---|
| Conversations OpenSearch found that Postgres also found | 100.00% | 99.07% (misses only past the 10,000-hit cap) | 99.99% |
| Extra conversations Postgres found | 1.3% | 2.4% | 1.1% |
| Latency p50 / p95, OpenSearch → Postgres (ms) | 9 / 15 → 13 / 27 | 10 / 16 → 18 / 68 | 44 / 163 → 88 / 221 |
| Throughput, 8 clients, OpenSearch / Postgres (queries/s) | 583 / 263 | 551 / 186 | 61 (2 GB heap) / 15 |
| Extra storage, OpenSearch / Postgres | 150 MB / 147 MB | | 126 MB / 24 MB of indexes, plus two columns |

Nearly all the extra results are matches in reasoning, which OpenSearch matched only as
whole words.

## Consequences

- **One service by default.** No OpenSearch, no `OPENSEARCH_*`, no outbox worker. A
  conversation is searchable when its transaction commits.
- **Slower per query, still interactive.** Postgres is about twice OpenSearch's latency
  on the production copy, mostly from moving large pages through Prisma and
  highlighting in JavaScript. The weak spot is a 3-4 letter substring on a large
  corpus: p95 220 ms at 5x, because the exact count rechecks every candidate. The
  search box waits for 3 characters and 600 ms of quiet.
- **Throughput is lower** than OpenSearch's with a large enough heap. With 8
  concurrent clients, Postgres served fewer queries per second but failed none.
- **Postgres tuning matters.** Rare-word prefix queries need raised statistics targets
  (`SET STATISTICS`) to use the index (390 ms → 6 ms at 5x), and words past the first
  256K characters of a message go through a separate flag and a partial trigram index.
- **Switching back to OpenSearch needs a reindex,** since the app queues no index
  updates while it searches Postgres. The steps are in the README, under Search.
- **Two backends to keep in step.** A change to the query language or the response
  shape must work on both, until a later ADR removes one.
