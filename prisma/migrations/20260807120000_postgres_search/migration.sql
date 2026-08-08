-- Postgres-native search (replaces the OpenSearch matching layer).
-- unaccent + `simple` dictionary = accent-insensitive, no stemming: word-prefix
-- matching semantics (what WhatsApp/Signal do with SQLite FTS), not fuzzy relevance.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION pk_simple_unaccent (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION pk_simple_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

-- Flatten a message into one searchable text: text parts of content (string or
-- multimodal array), reasoning, and tool-call names. IMMUTABLE so it can back an
-- expression index. Truncated to 500k chars: tsvector has a hard 1MB ceiling and
-- LLM logs have brutal length skew (>120k-char messages exist).
CREATE OR REPLACE FUNCTION pk_message_search_text(content jsonb, tool_calls jsonb, reasoning_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT left(
    concat_ws(' ',
      CASE jsonb_typeof(content)
        WHEN 'string' THEN content #>> '{}'
        WHEN 'array' THEN (
          SELECT string_agg(part ->> 'text', ' ')
          FROM jsonb_array_elements(content) AS part
          WHERE part ->> 'type' = 'text'
        )
        ELSE NULL
      END,
      reasoning_content,
      (
        SELECT string_agg(
          concat_ws(' ', tc -> 'function' ->> 'name', tc -> 'custom' ->> 'name'), ' ')
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(tool_calls) = 'array' THEN tool_calls ELSE '[]'::jsonb END
        ) AS tc
      )
    ),
    500000
  )
$$;

-- Content text alone (no reasoning/tool names): used by ts_headline so display
-- highlighting never splices reasoning text into a rendered message body.
CREATE OR REPLACE FUNCTION pk_message_content_text(content jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT left(
    CASE jsonb_typeof(content)
      WHEN 'string' THEN content #>> '{}'
      WHEN 'array' THEN (
        SELECT string_agg(part ->> 'text', E'\n')
        FROM jsonb_array_elements(content) AS part
        WHERE part ->> 'type' = 'text'
      )
      ELSE NULL
    END,
    500000
  )
$$;

-- Stored (not expression-indexed) on purpose: prefix tsqueries (:*) always force a
-- heap recheck, and with an expression index that recheck re-runs the extraction
-- function per matched row (~20x slower on real queries). A stored column makes the
-- recheck a plain tsvector comparison.
ALTER TABLE messages ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('pk_simple_unaccent', pk_message_search_text(content, tool_calls, reasoning_content))
  ) STORED;

CREATE INDEX messages_search_tsv_idx ON messages USING GIN (search_tsv);

-- The search page is always ordered newest-first.
CREATE INDEX conversations_created_at_idx ON conversations (created_at DESC);
