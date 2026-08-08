# Postgres-native search (experimental)

Branch: `experiment/postgres-search` · Status: **phase 1 complete, benchmarked, not deployed** · Date: 2026-08-08

Replaces the OpenSearch matching layer with Postgres full-text search, searching the
source-of-truth tables directly. Zero frontend changes — the Postgres backend emits
the exact OpenSearch response shape. OpenSearch remains fully functional side-by-side;
`SEARCH_BACKEND` selects the engine.

## Why

1. **OpenSearch's role here is smaller than it looks.** `/api/search` always sorts by
   `created_at desc` — BM25 relevance never affects result order. OpenSearch only does
   *matching, filtering and highlighting*. Postgres already stores every searchable
   byte (conversations + messages via Prisma); OpenSearch is a derived index fed by the
   outbox worker.
2. **Resources.** The single all-roles OpenSearch node reserves 2Gi (limit 3Gi) on the
   halved OCI free-tier cluster — the largest single reservation — plus the outbox
   worker pod and a ~70-file vendored subchart.
3. **Sync layer goes away.** Searching the source tables removes the outbox → OpenSearch
   pipeline entirely: no sync lag, no drift, no reindex-on-mapping-change, single health
   dependency. (LibreChat's Meilisearch-sidecar issue tracker is a catalog of exactly
   this failure class.)

## Research that shaped the design (Aug 2026)

- **WhatsApp search IS word-prefix FTS + recency.** WhatsApp uses SQLite FTS4, Signal
  FTS5 with a custom tokenizer — tokenized word-prefix indexes, reverse-chronological,
  no relevance ranking (Cornell E2EE-clients paper; Signal Desktop migrations).
- **Slack measured relevance ranking losing to recency**: their ML "Relevant" mode was
  used ~17% of the time and scored *worse* than match-all + reverse-chron on their own
  quality metrics (slack.engineering "Search at Slack").
- **Builders of "search my LLM logs" tools converged on plain text search** (simonw's
  `llm logs -q` = SQLite FTS5; several Show HNs abandoned vector/RAG stacks as
  overkill). simonw's corpus-hygiene ideas: weight user prompts over responses, exclude
  tool dumps.
- **BM25-in-Postgres extensions evaluated and rejected for this use case:**
  - *ParadeDB pg_search* (v0.25.1): best feature match (query parser, `pdb.snippet`,
    ngram tokenizers, Debian 12 arm64 debs) but AGPL, requires
    `shared_preload_libraries` + pgvector (hard dep since 0.25.0) + a custom image
    (debs target pgdg paths, bitnami lives in /opt/bitnami) on the *shared* Postgres
    that also serves other apps; a production data-corruption report (Julep on HN);
    no nested-doc support (paradedb#4013); Community edition BM25 index absent on
    physical replicas. Notably lobe-chat uses it in prod — and still hard-sorts by
    `updatedAt`, i.e. BM25 only picks candidates.
  - *VectorChord-bm25*: semi-dormant (last substantive commit 2026-04), no
    highlighting, AGPL.
  - *pg_textsearch* (Tiger Data, PostgreSQL license, active): ranking-only — no
    snippets/highlighting, no term positions/phrases. Solves the problem we don't have
    (ranking), lacks the ones we do. **The license-clean upgrade path if relevance
    ranking is ever wanted.**
- Practitioner consensus: plain FTS is fast at this scale (limits people hit are in the
  millions of rows); its weakness is ranking quality — which a date-sorted UX sidesteps.

## Design

**Matching model: word-prefix on every token** (`quixo zeph` → `'quixo':* & 'zeph':*`),
accent- and case-insensitive, no stemming — the WhatsApp/FTS4 semantics, and close to
what the OpenSearch config effectively did (its `edge_ngram` field made every word
prefix-matchable). Quoted phrases (`phraseto_tsquery`) and `-negation` supported.
Results ordered `created_at DESC, id DESC` (deterministic pagination).

### Migration `20260807120000_postgres_search`

- `CREATE EXTENSION unaccent` — **trusted** extension since PG13: the app's DB owner
  can create it, no superuser, no image change, no shared-postgres impact.
- Text search config `pk_simple_unaccent` = `simple` dictionary + `unaccent` filter on
  word tokens. No stemming (mixed FR/EN corpus + code; exact-word behavior).
- `pk_message_search_text(content, tool_calls, reasoning_content)` — IMMUTABLE
  extractor: text parts of content (string or multimodal array), reasoning, tool-call
  names. Truncated at 500k chars (tsvector hard 1MB ceiling; LLM messages have brutal
  length skew).
- `pk_message_content_text(content)` — content-only extractor used for display
  highlighting, so a reasoning-only match can't splice reasoning text into a rendered
  message body.
- `messages.search_tsv tsvector GENERATED ALWAYS AS (...) STORED` + GIN index, and
  `conversations(created_at DESC)` btree.
- Declared in `schema.prisma` as `Unsupported("tsvector")?` so `prisma migrate dev`
  doesn't try to drop it.

### Backend `src/lib/pg-search.ts`

- Dispatch: `SEARCH_BACKEND=postgres|opensearch` (route `src/app/api/search/route.ts`);
  outside production an `x-search-backend` request header overrides per request — this
  is how the benchmark A/Bs both engines through the identical HTTP path.
- tsquery built **by Postgres itself**: positive tokens go through
  `unnest(to_tsvector(cfg, $tokens))` → `string_agg(quote_literal(lexeme) || ':*', ' & ')`
  so query lexemes always agree with the index parser (`foo.bar` stays one `host`
  lexeme in both). Single-char tokens are matched exactly (`plainto_tsquery`), never
  prefixed — degenerate `a:*` explodes candidate sets (Contentful production lesson).
  Token cap 16. Empty/unusable query → browse mode (recent list).
- Conversation-level query: `c.id IN (SELECT conversation_id FROM messages WHERE
  search_tsv @@ q)` OR model-name ILIKE (all tokens as substrings), plus role
  (`IN`-subquery), model (`terms`), time-range filters; `count(*) OVER()` for the
  exact total; page → Prisma loads conversations + messages (source of truth).
- Highlights: matched messages per page conversation (capped 5, `ROW_NUMBER()`),
  `ts_headline(cfg, content_text, q, 'StartSel=…, StopSel=…, HighlightAll=true')`
  (equivalent of the OS `number_of_fragments: 0` whole-body highlight). Model
  highlight wrapped in JS. Same `__pkhlstart__/__pkhlend__` markers.
- Response mirrors OpenSearch: `_id`, `_source` (via shared
  `src/lib/conversation-doc.ts`, also used by the outbox worker), `highlight`,
  `inner_hits.messages.hits.hits[]._nested.offset` = index into the ordered messages
  array. Same S3 presigning pass.
- OpenSearch init/health checks (instrumentation, `/api/readyz`, `lib/health.ts`) now
  run only when `OPENSEARCH_URL` is set.

## Performance gotchas (hard-won, keep these)

1. **Do NOT use an expression GIN index for this.** Prefix (`:*`) tsqueries always
   force a heap recheck, and with an expression index the recheck re-runs
   `pk_message_search_text` + `to_tsvector` on every matched row: 7,682 matches cost
   ~140ms in the bitmap heap scan alone (~350ms end-to-end). The **stored generated
   column** makes the recheck a plain tsvector comparison → ~15–25ms.
2. **Do NOT use correlated `EXISTS` for the text/role filters.** The planner chose a
   nested-loop semi join (77k join-filter comparisons; role filter hit 2.1s p50).
   `IN`-subqueries hash the id set once.
3. Benchmark seeding must generate **unique timestamps** — identical `created_at`
   values get tie-broken differently by the two engines and fake ordering diffs
   (first run: 1,894/2,005 duplicate timestamps → overlap 0.25–0.74 artifacts).

## Benchmark

`scripts/benchmark-search.ts` — seeds a deterministic corpus (2,005 conversations /
13,203 messages, mixed EN/FR + code + planted needles) into **both** engines, then runs
14 query shapes × 12 runs (after 3 warmups) through the real `/api/search` HTTP route,
flipping engines via the `x-search-backend` header.

```
npx tsx --env-file=.env scripts/benchmark-search.ts seed
npx tsx --env-file=.env scripts/benchmark-search.ts run
```

Results (2026-08-08, local docker, wall-clock through HTTP):

| query                | OS p50/p95 (ms) | PG p50/p95 (ms) | hits    | overlap | needle OS/PG |
|----------------------|-----------------|-----------------|---------|---------|--------------|
| browse (empty query) | 24.8 / 52.7     | 37.5 / 65.8     | 2005    | 1.00    | ·            |
| single word          | 31.8 / 51.4     | 65.9 / 76.2     | 1920    | 1.00    | ·            |
| two words (AND)      | 27.3 / 86.1     | 51.4 / 74.5     | 1788    | 1.00    | ·            |
| accent-insensitive   | 15.2 / 33.3     | 24.6 / 43.9     | 1       | 1.00    | ✓ / ✓        |
| prefix (single)      | 15.4 / 22.5     | 19.4 / 34.9     | 1       | 1.00    | ✓ / ✓        |
| prefix (multi)       | 28.3 / 124.8    | 13.7 / 22.3     | 1       | 1.00    | ✓ / ✓        |
| quoted phrase        | 12.2 / 21.6     | 13.5 / 16.8     | 1       | 1.00    | ✓ / ✓        |
| tool-call name       | 24.8 / 43.1     | 31.3 / 69.3     | 296     | 1.00    | ✓ / ✓        |
| mid-word substring   | 10.8 / 11.7     | 10.8 / 14.2     | 1 vs 0  | 0.00    | ✓ / ✗        |
| role filter          | 23.8 / 183.6    | 42.8 / 57.6     | 1920    | 1.00    | ·            |
| model filter         | 18.6 / 66.8     | 39.4 / 63.8     | 291     | 1.00    | ·            |
| negation             | 24.0 / 33.7     | 36.1 / 79.0     | 1383    | 1.00    | ·            |
| long natural query   | 9.9 / 15.3      | 17.3 / 21.3     | 0       | 1.00    | ·            |
| time range 1m        | 23.6 / 36.8     | 43.4 / 67.2     | 87      | 1.00    | ·            |

**Reading:** identical result sets and ordering everywhere (overlap 1.00); every
planted needle found by both engines; PG a few ms behind on broad queries (the exact
`count(*)` — OS estimates its total cheaply) and at/ahead on selective ones. All far
below the UI's 600ms debounce. 89/89 jest tests pass.

### Known behavioral difference (intentional)

**Mid-word substring matching** (`para` → *hyper**para**meterization*): OpenSearch's
3-4-char `ngram` field does this; word-prefix FTS does not — and neither does
WhatsApp. It buys recall on code identifiers at the cost of noise. If it turns out to
be missed: add `pg_trgm` (also a trusted extension) with a trigram GIN on the
extracted text as an OR-branch — do NOT widen the FTS config for it.

## Not in phase 1 (deliberate)

- **BM25/relevance ranking** — the UX sorts by recency; see research above. If ever
  wanted: pg_textsearch, or a Slack-style "top results" strip.
- **Phase 2 — semantic mode (on submit, never per keystroke):** pgvector embeddings
  per message (LiteLLM is already in the stack for the embedding calls) + RRF hybrid
  (Supabase `hybrid_search` recipe), shown as a "best matches" strip above the recency
  list. Infra cost: the shared bitnami postgres image lacks pgvector (needs the
  bitnami pgvector image variant, drop-in) — which is exactly why it's phase 2.
- **Prompt-over-response weighting** (`setweight` A/B/C) — only matters if a ranked
  mode is added; the columns/config make it easy to add later.

## How to resume

```bash
git checkout experiment/postgres-search
docker compose -f docker-compose.local.yml up -d postgres opensearch minio createbuckets
npx prisma migrate deploy
npx tsx --env-file=.env scripts/benchmark-search.ts seed
SEARCH_BACKEND=postgres npm run dev        # UI on :3000, PG is the default engine
# A/B any request: -H 'x-search-backend: opensearch|postgres' (non-production only)
# Auth for curl: -H "X-Prompt-Keeper-API-Key: $PROMPT_KEEPER_API_KEY" (from .env)
```

## Rollout plan (when promoted)

1. Ship this branch; deploy with `SEARCH_BACKEND=postgres` while OpenSearch still runs
   (instant rollback = flip the env var).
2. Bump kinorai/prompt-keeper-migrate (the migration ships as the Helm pre-upgrade
   hook Job — tag referenced in 3 places in the infra module values.yaml).
3. After soak: remove the opensearch subchart + creds + outbox-worker deployment from
   `terraform/modules/kubernetes/prompt-keeper`, drop `OPENSEARCH_URL` from the app
   env (health checks then skip OS automatically), delete `src/lib/opensearch.ts`,
   `src/workers/outbox.ts` + the outbox Prisma model, and reclaim the 2–3Gi.
