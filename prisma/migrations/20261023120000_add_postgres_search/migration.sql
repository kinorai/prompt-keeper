-- Full-text search in Postgres (SEARCH_BACKEND=postgres). Both extensions are trusted, so the
-- database owner can create them without superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Folds a text the way the search compares it: accents stripped, lower case, every run of
-- characters that are neither letters nor digits turned into one space. Han, Hiragana and Katakana
-- characters become one word each (Chinese and Japanese don't put spaces between words), like
-- OpenSearch's standard tokenizer does. IMMUTABLE so the trigger and indexes can rely on it; that
-- holds as long as the unaccent rules file doesn't change.
--
-- Created through EXECUTE to resolve two things the database decides:
--   - the schema unaccent lives in (the connection's schema, or an existing install elsewhere)
--   - the pg_c_utf8 collation (PostgreSQL 17+, UTF8 databases): Unicode letter classes and case
--     whatever the database locale. In a C-locale database without it, lower() and [[:alnum:]]
--     only know ASCII and every other script would be stripped.
DO $do$
DECLARE
  unaccent_schema text := (
    SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'
  );
  unicode_collation text := CASE
    WHEN getdatabaseencoding() = 'UTF8' AND EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'pg_c_utf8')
    THEN ' COLLATE pg_c_utf8' ELSE '' END;
BEGIN
  EXECUTE format($function$
    CREATE OR REPLACE FUNCTION pk_search_fold(input text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $body$
      SELECT btrim(regexp_replace(
        regexp_replace(lower(%1$I.unaccent(%2$L::regdictionary, input)%3$s), '([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])', ' \1 ', 'g'),
        '[^[:alnum:]]+', ' ', 'g'))
    $body$
  $function$, unaccent_schema, format('%I.unaccent', unaccent_schema), unicode_collation);
END
$do$;

-- A query term as a tsquery, folded by the same function as the index so the two always agree:
-- its words next to each other, the last one as a prefix when last_prefix. NULL when the term
-- folds to nothing, which matches no message.
CREATE OR REPLACE FUNCTION pk_search_tsquery(term text, last_prefix boolean) RETURNS tsquery
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT to_tsquery('simple', string_agg(
    quote_literal(word) || CASE WHEN last_prefix AND position = total THEN ':*' ELSE '' END,
    ' <-> ' ORDER BY position))
  FROM (
    SELECT word, position, count(*) OVER () AS total
    FROM unnest(string_to_array(pk_search_fold(term), ' ')) WITH ORDINALITY AS words(word, position)
    WHERE word <> ''
  ) AS words
$$;

-- The searchable text of one message: its text parts, its reasoning, and the names of the tools
-- it called. Image parts, tool arguments and provider blobs are not searched.
CREATE OR REPLACE FUNCTION pk_message_search_text(content jsonb, reasoning_content text, tool_calls jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT pk_search_fold(concat_ws(' ',
    CASE jsonb_typeof(content)
      WHEN 'string' THEN content #>> '{}'
      WHEN 'array' THEN (
        SELECT string_agg(part ->> 'text', ' ')
        FROM jsonb_array_elements(content) AS part
        WHERE part ->> 'type' = 'text'
      )
    END,
    reasoning_content,
    CASE WHEN jsonb_typeof(tool_calls) = 'array' THEN (
      SELECT string_agg(coalesce(call #>> '{function,name}', call #>> '{custom,name}'), ' ')
      FROM jsonb_array_elements(tool_calls) AS call
    ) END
  ))
$$;

-- Plain columns kept by a trigger rather than generated columns: Prisma reads a generation
-- expression as a default and would drop it in the next `migrate dev`.
--   search_tsv    the words of the searchable text, for word, prefix and phrase matches
--   search_words  its distinct words of 3+ characters, for the 3-4 character substring match: the
--                 trigram index over them is a third the size of one over the whole text, and
--                 its candidates recheck faster
--   search_long   the text is longer than search_tsv covers (below): words past that point are
--                 then looked up in search_words
ALTER TABLE "messages" ADD COLUMN "search_words" TEXT, ADD COLUMN "search_tsv" TSVECTOR,
  ADD COLUMN "search_long" BOOLEAN NOT NULL DEFAULT false;

-- A tsvector over 1 MB fails the insert, so words are indexed from the first 256K characters
-- only. search_words covers the whole message: the substring match always uses it, and word
-- matches in a longer message (search_long) fall back to it; only phrases past 256K are missed.
CREATE OR REPLACE FUNCTION pk_messages_search_columns() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  folded text := pk_message_search_text(NEW.content, NEW.reasoning_content, NEW.tool_calls);
BEGIN
  NEW.search_words := (
    SELECT string_agg(DISTINCT word, ' ') FROM regexp_split_to_table(folded, ' ') AS word WHERE length(word) >= 3
  );
  NEW.search_tsv := to_tsvector('simple'::regconfig, left(coalesce(folded, ''), 262144));
  NEW.search_long := coalesce(length(folded), 0) > 262144;
  RETURN NEW;
END
$$;

CREATE TRIGGER "messages_search_columns"
  BEFORE INSERT OR UPDATE OF "content", "reasoning_content", "tool_calls" ON "messages"
  FOR EACH ROW EXECUTE FUNCTION pk_messages_search_columns();

-- The planner estimates a word missing from its most-common list from the rarest word it does
-- track. With the default target that is ~10x too high for rare words, an OR of two of them then
-- looks common, and Postgres walks every conversation newest first instead of using the index.
ALTER TABLE "messages" ALTER COLUMN "search_tsv" SET STATISTICS 2000;
ALTER TABLE "messages" ALTER COLUMN "search_words" SET STATISTICS 1000;
