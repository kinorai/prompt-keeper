# Search

`/api/search` runs on one of two backends, picked by `SEARCH_BACKEND`:

| | `postgres` (default) | `opensearch` |
|---|---|---|
| Runs in | the Postgres database the conversations live in | a separate OpenSearch index |
| Extra services | none | OpenSearch, plus the outbox worker to keep it in sync |
| Freshness | a conversation is searchable when its transaction commits | after the worker indexes it (about a second) |
| Code | `src/lib/search/postgres.ts` | `src/lib/search/opensearch.ts` |

Both take the same request (`src/lib/search/request.ts`) and return the same response shape
(`src/lib/search/types.ts`, OpenSearch's search response, which the UI was written against).

## Query syntax

Parsed by `src/lib/search/query-parser.ts` with the rules of OpenSearch's `simple_query_string`
(flags `ALL`, default operator `AND`), so a query means the same thing on both backends:

| Query | Meaning |
|---|---|
| `react hooks` | both words, in the same message |
| `react \| vue` | either (operators combine left to right, no precedence: `a b \| c` is `(a AND b) OR c`) |
| `react -class` | `react`, and not `class` in that message |
| `"use effect"` | the words next to each other, in this order |
| `pyth*` | forces a prefix match |
| `(a \| b) c` | grouping |
| `role:user`, `model:"gpt-4o"` | filters (the conversation has a message with that role; its model is exactly that) |
| `~2` after a word or phrase | accepted and ignored |

A query is at most 1,000 characters and 32 words or phrases (a 400 beyond), and parentheses
nest 8 deep (deeper ones are read as spaces). Text with no word in it (an emoji, a lone quote)
finds nothing, as with OpenSearch.

## Matching

Text is folded before it is compared, by `pk_search_fold` in SQL, on both sides: the trigger folds
the messages and `pk_search_tsquery` folds the query terms, so a typed word always folds like the
text it should find. Folding lowercases, strips accents like `unaccent` does (`ecuación` =
`ecuacion`, `ß` = `ss`, a decomposed `é` too; `й` stays), turns every run of characters that are not
letters or digits into a space, and makes every Han, Hiragana and Katakana character a word of its
own. It uses the `pg_c_utf8` collation where there is one (PostgreSQL 17+), so letters of every
script count whatever the database locale; on older versions it follows the database locale, and a
`C`-locale database would only search ASCII.

`src/lib/search/fold.ts` folds the same way in JavaScript, to classify the typed words (their
length) and to highlight; for the rare characters where the two disagree only the highlight is
lost, never the match.

Each query word then matches like the OpenSearch mapping does:

| Word | Matches | OpenSearch field it mirrors |
|---|---|---|
| 1 character | a whole word | `content` (standard) |
| 3-4 characters | anywhere inside a word (`eepe` finds "deeper") | `content.ngram` (3-4 grams) |
| 2, or 5 and more characters | the start of a word, as you type (`ecuac` finds "ecuación") | `content.edge` (edge ngrams) |
| quoted | the exact words, in order | phrase query |
| joined by punctuation (`gpt-4o`) | the parts next to each other, the last one as a prefix | |
| joined by `_` (`fetch_url`) | the same, and the text must contain it as written | the standard tokenizer keeps it one word |

A message's searchable text is its text parts, its reasoning and the names of the tools it
called. A conversation matches when one of its messages matches the whole query, or when its model
name does (model names get no substring matching: `mini` must not find `gemini`).

Results are sorted newest first, as before: ranking never applied. The total is exact up to
10,000 and reported as `"relation": "gte"` above, like OpenSearch's default.

### Where Postgres differs from OpenSearch, on purpose

- **Reasoning is matched like content.** OpenSearch only matched whole words in reasoning; a
  prefix or a short substring now finds it too. This is nearly all of the extra results in the
  benchmark below.
- **Highlights everywhere.** With OpenSearch, prefix and substring queries returned no snippet
  (its highlight query does not reach the edge and ngram fields), so the list showed the first
  prompt; the Postgres backend marks the match in the snippet and in every matching message of the
  opened conversation. OpenSearch's message highlights (`inner_hits`) were empty for every query:
  the highlight names the fields `content` where a nested inner hit needs `messages.content`.
- **The snippet prefers the conversation over its payloads.** On equal matches, the user's and
  the assistant's messages make the snippet before a tool result or a system prompt.
- **Underscore identifiers as a prefix.** `base_file` also finds `base_filename`.

### How it is stored

The `add_postgres_search` migration adds two columns to `messages`, filled by a trigger on every
insert and on any update of the content, reasoning or tool calls; `backfill_postgres_search` fills
them for the existing rows and builds the indexes. They are two migrations so the table lock of
the first is only held for its DDL: during the second the running app keeps reading, and its writes
wait at most for the index builds (about 10 s per 50,000 messages for the whole migration, measured).

- `search_tsv`: `to_tsvector('simple', ...)` of the folded searchable text, with a GIN index for
  word, prefix and phrase matches. Words are indexed from the first 256K characters of a message (a
  tsvector cannot exceed 1 MB).
- `search_words`: the message's distinct folded words of 3 characters or more, with a trigram GIN
  index for the 3-4 character substring matches. A substring never spans a space, so the distinct
  words find the same messages as the whole text, with an index a third the size and candidates
  that recheck faster. It covers the whole message.
- `search_long`: the text is longer than `search_tsv` covers. A single word is then also looked up
  in `search_words` (a partial trigram index over these few rows), so only phrases past 256K
  characters are missed. Phrases (and split terms like `gpt-4o`) can also miss earlier in a long
  message: a tsvector keeps word positions up to 16,383 (every later word shares that position)
  and at most 256 positions per word, so a phrase past the ~16,000th word, or after a word's
  256th occurrence, does not match.

They are plain columns rather than generated ones because Prisma reads a generation expression as
a default and would drop it in the next `migrate dev`. The client omits `search_words` from every
query (`src/lib/prisma.ts`).

A search takes three round trips: the distinct model names (a loose index scan; the query is
matched against them in JavaScript, so the conversation query only gets an `OR` on the model when
one matches: that `OR` makes Postgres check every conversation), then the page with its
conversations and the count side by side, then the page's messages with a flag on each one that
matches. Highlights and snippets are built in JavaScript from the parsed query.

The `search_tsv` and `search_words` columns get a statistics target of 2000 and 1000. With the
default, Postgres estimates a word it doesn't track from the rarest word it does, about 10 times too
high for rare words; an OR of two of them then looked common enough to walk every conversation
newest first (390 ms instead of 6 ms at 66,000 conversations).

## Benchmark

`scripts/search-benchmark/` loads a corpus into both backends and compares them on the same
queries:

```bash
# Throwaway instances only: the loader writes to whatever the env file points at
docker run -d --name pkb-pg -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=prompt_keeper -p 127.0.0.1:55432:5432 postgres:18
docker run -d --name pkb-os -e discovery.type=single-node -e plugins.security.disabled=true \
  -e DISABLE_INSTALL_DEMO_CONFIG=true -e "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g" -p 127.0.0.1:59200:9200 opensearchproject/opensearch:2.19.2
cat > .env.benchmark <<'EOF'
POSTGRES_PRISMA_URL=postgresql://postgres:bench@127.0.0.1:55432/prompt_keeper
POSTGRES_URL_NON_POOLING=postgresql://postgres:bench@127.0.0.1:55432/prompt_keeper
OPENSEARCH_URL=http://127.0.0.1:59200
OPENSEARCH_INDEX=prompt-keeper
LOG_LEVEL=warn
EOF
POSTGRES_PRISMA_URL=... npx prisma migrate deploy
npx tsx --env-file=.env.benchmark scripts/search-benchmark/load.ts corpus.jsonl [--copies 5]
npx tsx --env-file=.env.benchmark scripts/search-benchmark/compare.ts --out report.json
```

The corpus is one conversation per line (`load.ts` documents the shape). `compare.ts` draws its
queries from the loaded data, per category: common, mid-frequency and rare words, 5-letter
prefixes, 3-4 letter substrings, accented words typed with and without accents, Cyrillic and CJK,
two and three words, quoted phrases, negation, OR, identifiers, tool names, model names, the
`role:` and `model:` filters, time ranges and the second page. For each query it compares every
match each backend finds (up to 10,000), the first page (40, the UI's default), and the snippet,
then measures latency (each query 20 times after a warm-up) and throughput (8 concurrent clients).
It also checks that the JavaScript fold agrees with `pk_search_fold` on 50,000 words from the data.

### Results (2026-10-23)

Corpus: the 13,159 conversations of [oasst2](https://huggingface.co/datasets/OpenAssistant/oasst2)
(48,871 messages, 23 MB of text; English, Spanish, Russian, Chinese, German, French and 30 more
languages), with a seeded share given system prompts, tool calls and results, reasoning, image
parts, nine model names and dates over 400 days. "5x" loads it five times, each copy a year older
(65,795 conversations, 244,355 messages). PostgreSQL 18.6 and OpenSearch 2.19.2 (1 GB heap) in
Docker on the same machine. Latencies are end to end in the app's code (query, document loading
and highlighting for both backends), not HTTP.

**Quality** (211 queries, OpenSearch as the reference)

| | 1x | 5x |
|---|---|---|
| Conversations OpenSearch found that Postgres also found | 100.00% | 99.07% (\*) |
| Extra conversations Postgres found | 1.3% | 2.4% |
| ...of which matched in reasoning (prefix and substring matches there, see above) | 98% | 99% |
| First page (40 results) in common | 96.9% | 95.8% |
| First-page results with a highlighted snippet, OpenSearch / Postgres | 2691 / 4310 | 3039 / 4794 |
| Snippets marking the same words, when both have one | 97.7% | 96.9% |
| Words that fold differently in JavaScript and SQL (costs a highlight, never a match) | 20 of 50,000 | 4 of 50,000 |

(\*) Every miss is in a query matching more than 10,000 conversations: both backends list the
newest 10,000, and Postgres's extra reasoning matches push OpenSearch's oldest ones out of that
window. Below the cap nothing is missed.

**Latency** (ms, each query 20 times at 1x and 10 at 5x, after a warm-up)

| Category | OpenSearch 1x p50 / p95 | Postgres 1x p50 / p95 | OpenSearch 5x p50 / p95 | Postgres 5x p50 / p95 |
|---|---|---|---|---|
| empty (latest) | 5 / 6 | 7 / 8 | 6 / 7 | 6 / 7 |
| word: common | 12 / 15 | 22 / 27 | 13 / 16 | 27 / 46 |
| word: mid frequency | 11 / 15 | 15 / 19 | 12 / 15 | 21 / 26 |
| word: rare | 3 / 5 | 5 / 7 | 4 / 6 | 11 / 15 |
| prefix as typed (5 chars) | 11 / 14 | 16 / 21 | 11 / 13 | 23 / 31 |
| substring 3-4 chars | 11 / 14 | 20 / 37 | 13 / 16 | 79 / 220 |
| accented as typed | 5 / 13 | 8 / 18 | 7 / 13 | 17 / 25 |
| accented typed without accents | 4 / 12 | 7 / 18 | 6 / 12 | 16 / 26 |
| cyrillic / cjk | 6 / 16 | 8 / 26 | 5 / 14 | 16 / 26 |
| two words | 5 / 18 | 4 / 23 | 13 / 19 | 16 / 64 |
| three words | 5 / 18 | 4 / 63 | 9 / 20 | 7 / 37 |
| quoted phrase | 4 / 9 | 6 / 13 | 5 / 18 | 15 / 69 |
| negation | 12 / 16 | 20 / 26 | 12 / 16 | 19 / 24 |
| or | 11 / 15 | 21 / 26 | 12 / 16 | 20 / 30 |
| snake_case identifier | 2 / 3 | 5 / 7 | 2 / 7 | 8 / 17 |
| tool name | 13 / 19 | 28 / 37 | 15 / 17 | 69 / 78 |
| model name | 10 / 13 | 13 / 22 | 11 / 15 | 19 / 65 |
| role:user filter | 10 / 16 | 17 / 30 | 12 / 15 | 16 / 29 |
| model: filter | 6 / 9 | 9 / 12 | 10 / 13 | 14 / 21 |
| time range 1m | 2 / 3 | 4 / 5 | 2 / 3 | 3 / 4 |
| time range custom | 12 / 15 | 21 / 25 | 4 / 9 | 40 / 49 |
| page 2 (from 40) | 12 / 17 | 20 / 27 | 13 / 18 | 24 / 35 |
| **all queries** | 9 / 15 | 13 / 27 | 10 / 16 | 18 / 68 |

Throughput with 8 concurrent clients for 20 s: OpenSearch 583 / 551 queries
per second (1x / 5x), Postgres 263 / 186, no errors.

The slowest case is a 3-4 letter word at 5x: the substring index finds the candidates quickly,
but the exact count (up to 10,000) has to recheck all of them. The search box waits for 3
characters and 600 ms of quiet before it searches. The worst valid query (32 negated words, the
maximum) takes 2 s at 5x: with no positive word nothing narrows the search, so every message is
checked against each.

**Resources** (1x)

| | Postgres | OpenSearch |
|---|---|---|
| Extra storage | columns 51 MB, `search_tsv` index 31 MB, `search_words` trigram index 65 MB | index 150 MB |
| Memory | no extra process (the database's cache; the whole container used 434 MiB) | 1.8 GiB container (1 GB heap) |
| Migration | 10 s for the backfill and the indexes (49k messages) | |
| Freshness | at commit | when the outbox worker has indexed it |

### Results on a production copy (2026-10-23)

A copy of the production database, restored locally: 1,679 conversations, 7,594 messages, 34 MB
of text, the largest message 1.8 million characters (a tool result). Both migrations applied to it
in 11 s. The same 202 generated queries (fewer Cyrillic and CJK words exist there), aggregates only:

| | OpenSearch | Postgres |
|---|---|---|
| Conversations OpenSearch found that Postgres also found | reference | 99.99% (2 phrases inside messages over 256K characters) |
| Extra conversations | | 1.1%, mostly tool names: `fetch_url` finds the conversations that called `omnifeed_fetch_url`, which OpenSearch's exact keyword match misses |
| First page in common | | 97.1% |
| First-page results with a highlighted snippet | 2529 | 3911 |
| Latency p50 / p95 / p99, all queries (ms) | 44 / 163 / 211 | 88 / 221 / 314 |
| 8 concurrent clients | 61 queries/s, 0 errors with a 2 GB heap; with production's 1 GB heap the parent circuit breaker failed 8,030 of them | 15 queries/s, 0 errors |
| Extra storage | 126 MB index | 24 MB of indexes, plus the two columns |

Real conversations are large: a page of 40 is 5.4 MB, which both backends spend most of their time
moving (one common-word page: 145 ms OpenSearch, 171 ms Postgres, measured alone). Postgres pays
more for it, through Prisma and the highlighting in JavaScript, which is most of the gap above. The
per-category figures on this corpus are noisy: the 5 MB responses make garbage collection pauses
that land on whichever query runs next in the benchmark process.
