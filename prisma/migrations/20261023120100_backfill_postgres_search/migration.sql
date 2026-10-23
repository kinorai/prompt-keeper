-- Its own migration, so its own transaction: the previous one only held its table lock for the
-- DDL. The backfill takes row locks (the running app's new inserts go through, its rewrites of the
-- same conversation wait), the index builds block writes but not reads.

-- Backfill: the trigger recomputes both columns
UPDATE "messages" SET "content" = "content";

CREATE INDEX "messages_search_tsv_idx" ON "messages" USING GIN ("search_tsv");
CREATE INDEX "messages_search_words_trgm_idx" ON "messages" USING GIN ("search_words" gin_trgm_ops);
CREATE INDEX "messages_role_conversation_id_idx" ON "messages" ("role", "conversation_id");
CREATE INDEX "conversations_created_at_idx" ON "conversations" ("created_at" DESC);
-- The search lists the distinct models through it, to match the query against model names
CREATE INDEX "conversations_model_idx" ON "conversations" ("model");

-- Statistics for the new columns now, rather than at the next autovacuum
ANALYZE "messages";
