import { Prisma, type Conversation, type Message } from "@prisma/client";
import getPrisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { POSTGRES_SEARCH } from "@/lib/defaults";
import { toSearchDocument, type SearchDocument } from "@/lib/search/document";
import { highlightFragments, highlightText, type HighlightResult } from "@/lib/search/highlight";
import { matchesQuery, withoutSubstrings } from "@/lib/search/match";
import { parseSearchQuery, positiveWordGroups, type QueryNode, type QueryWord } from "@/lib/search/query-parser";
import type { SearchRequest, TimeFilter } from "@/lib/search/request";
import type { SearchHit, SearchInnerHit, SearchResults } from "@/lib/search/types";

const log = createLogger("search:postgres");

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

// The SQL condition on one message (alias m), over the columns the add_postgres_search trigger
// fills. Terms are folded in SQL by the function that folded the index, so both always agree.
function messagePredicate(node: QueryNode): Prisma.Sql {
  switch (node.type) {
    case "words": {
      const [word] = node.words;
      if (node.words.length === 1 && word.match === "substring") {
        return Prisma.sql`m.search_words LIKE ('%' || pk_search_fold(${node.source}) || '%')`;
      }
      const inTsv = Prisma.sql`m.search_tsv @@ pk_search_tsquery(${node.source}, ${node.lastPrefix})`;
      // search_tsv stops at 256K characters; a single word in a longer message is also looked up
      // in its distinct words (3+ characters, all of the message): the first LIKE uses the partial
      // trigram index on long messages, the second keeps the match at the start of a word
      const matchesWords =
        node.words.length === 1 && [...word.token].length >= 3
          ? Prisma.sql`(${inTsv} OR (m.search_long
              AND m.search_words LIKE ('%' || pk_search_fold(${node.source}) || '%')
              AND (' ' || m.search_words || ' ') LIKE ('% ' || pk_search_fold(${node.source}) || ${node.lastPrefix ? "%" : " %"})))`
          : inTsv;
      if (!node.identifier) return matchesWords;
      // The index finds the words next to each other; the few candidates are then checked for
      // the identifier as typed
      return Prisma.sql`(${matchesWords}
        AND lower(concat_ws(' ', m.content::text, m.reasoning_content, m.tool_calls::text)) LIKE ${`%${escapeLike(node.identifier)}%`})`;
    }
    case "and":
    case "or":
      return Prisma.sql`(${Prisma.join(node.children.map(messagePredicate), node.type === "and" ? " AND " : " OR ")})`;
    case "not":
      // A message with no words at all has NULL search_words: it doesn't contain the word either
      return Prisma.sql`NOT coalesce(${messagePredicate(node.child)}, false)`;
  }
}

// The distinct model names, one index probe each (a loose index scan: Postgres has no skip scan
// for DISTINCT). There are a handful, so the query is matched against them here: an OR on the
// model in the conversation query would make Postgres check every conversation.
async function distinctModels(): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<{ model: string }[]>`
    WITH RECURSIVE models AS (
      (SELECT model FROM conversations ORDER BY model LIMIT 1)
      UNION ALL
      SELECT (SELECT c.model FROM conversations c WHERE c.model > models.model ORDER BY c.model LIMIT 1)
      FROM models WHERE models.model IS NOT NULL
    )
    SELECT model FROM models WHERE model IS NOT NULL`;
  return rows.map((row) => row.model);
}

const PRESET_INTERVALS = { "1h": "1 hour", "1d": "1 day", "1m": "1 month", "1y": "1 year" } as const;

// created_at is a UTC timestamp without time zone, as Prisma writes it
function timeFilter(timeRange: TimeFilter): Prisma.Sql {
  if ("preset" in timeRange) {
    return Prisma.sql`c.created_at >= (now() AT TIME ZONE 'UTC') - ${PRESET_INTERVALS[timeRange.preset]}::interval`;
  }
  return Prisma.sql`c.created_at >= (${timeRange.start}::timestamptz AT TIME ZONE 'UTC')
    AND c.created_at <= (${timeRange.end}::timestamptz AT TIME ZONE 'UTC')`;
}

// The WHERE clause that selects the matching conversations (alias c)
function conversationFilters(request: SearchRequest, query: QueryNode | null, matchingModels: string[]): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (query) {
    // Like OpenSearch: every word in one message, or every word in the model name
    const inMessages = Prisma.sql`c.id IN (SELECT m.conversation_id FROM messages m WHERE ${messagePredicate(query)})`;
    conditions.push(
      matchingModels.length > 0 ? Prisma.sql`(${inMessages} OR c.model = ANY(${matchingModels}::text[]))` : inMessages,
    );
  }
  if (request.roles.length > 0) {
    conditions.push(
      Prisma.sql`c.id IN (SELECT conversation_id FROM messages WHERE role = ANY(${request.roles}::text[]))`,
    );
  }
  if (request.models.length > 0) {
    conditions.push(Prisma.sql`c.model = ANY(${request.models}::text[])`);
  }
  if (request.timeRange) {
    conditions.push(timeFilter(request.timeRange));
  }
  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

// Selected with the names Prisma gives the fields, so the rows are what findMany would return
const CONVERSATION_COLUMNS = Prisma.sql`c.id, c.model, c.conversation_hash AS "conversationHash",
  c.caller_key_hash AS "callerKeyHash", c.latency_ms AS "latencyMs", c.prompt_tokens AS "promptTokens",
  c.completion_tokens AS "completionTokens", c.total_tokens AS "totalTokens", c.request_params AS "requestParams",
  c.created_at AS "createdAt", c.updated_at AS "updatedAt"`;
const MESSAGE_COLUMNS = Prisma.sql`m.id, m.conversation_id AS "conversationId", m.role, m.content,
  m.tool_calls AS "toolCalls", m.tool_call_id AS "toolCallId", m.name, m.reasoning_content AS "reasoningContent",
  m.thinking_blocks AS "thinkingBlocks", m.annotations, m.audio, m.images, m.refusal,
  m.finish_reason AS "finishReason", m.message_index AS "messageIndex", m.created_at AS "createdAt"`;

type MessageRow = Omit<Message, "searchWords" | "searchLong"> & { matched: boolean };

// A tool payload or system prompt that also contains the words makes a poorer snippet than the
// conversation itself, so on equal matches the user's and assistant's messages come first
const SNIPPET_ROLE_RANK: Record<string, number> = { user: 0, assistant: 1 };

interface ScoredMessage {
  hit: SearchInnerHit;
  matchedGroups: number;
  roleRank: number;
  offset: number;
  content?: { text: string; spans: HighlightResult["spans"] };
}

function scoreMessages(document: SearchDocument, matchedOffsets: number[], groups: QueryWord[][]): ScoredMessage[] {
  return matchedOffsets
    .map((offset) => {
      const message = document.messages[offset];
      const scored: ScoredMessage = {
        hit: { _nested: { field: "messages", offset }, highlight: {} },
        matchedGroups: 0,
        roleRank: SNIPPET_ROLE_RANK[message.role] ?? 2,
        offset,
      };
      const fields = { content: message.content, reasoning_content: message.reasoning_content };
      for (const [field, value] of Object.entries(fields)) {
        if (typeof value !== "string") continue;
        const result = highlightText(value, groups);
        if (!result.highlighted) continue;
        scored.hit.highlight![field] = [result.highlighted];
        scored.matchedGroups = Math.max(scored.matchedGroups, result.matchedGroups);
        if (field === "content") scored.content = { text: value, spans: result.spans };
      }
      return scored;
    })
    .sort((a, b) => b.matchedGroups - a.matchedGroups || a.roleRank - b.roleRank || a.offset - b.offset);
}

// The list's snippet: fragments of the best-matching messages' content, as OpenSearch's
// top-level messages.content highlight gives them
function snippetFragments(scored: ScoredMessage[]): string[] {
  const fragments: string[] = [];
  for (const { content } of scored) {
    if (!content) continue;
    const room = POSTGRES_SEARCH.snippet.count - fragments.length;
    fragments.push(...highlightFragments(content.text, content.spans, POSTGRES_SEARCH.snippet.size, room));
    if (fragments.length === POSTGRES_SEARCH.snippet.count) break;
  }
  return fragments;
}

export async function searchPostgres(request: SearchRequest): Promise<SearchResults> {
  const startTime = Date.now();
  const prisma = getPrisma();
  const query = request.text ? parseSearchQuery(request.text) : null;
  // Text with no word in it (an emoji, a lone quote) matches nothing, as in OpenSearch, rather than everything
  if (request.text && !query) return { hits: [], total: { value: 0, relation: "eq" }, took: Date.now() - startTime };
  // No substring matches in model names: OpenSearch only has them for message content (its ngram
  // field), and "mini" must not find every gemini model
  const matchingModels = query ? (await distinctModels()).filter((model) => matchesQuery(model, query, false)) : [];
  const where = conversationFilters(request, query, matchingModels);

  // Then the page (with its conversations) and the count side by side, and the page's messages,
  // each flagged when it matches
  const [conversations, counted] = await Promise.all([
    prisma.$queryRaw<Conversation[]>`
      SELECT ${CONVERSATION_COLUMNS} FROM conversations c ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${request.size} OFFSET ${request.from}`,
    // OpenSearch counts exactly up to 10,000 hits and reports more as "gte"
    prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM (
        SELECT 1 FROM conversations c ${where} LIMIT ${POSTGRES_SEARCH.trackTotalHits + 1}
      ) AS counted`,
  ]);
  const ids = conversations.map((convo) => convo.id);
  const total = counted[0]?.total ?? 0;

  const messages =
    ids.length > 0
      ? await prisma.$queryRaw<MessageRow[]>`
          SELECT ${MESSAGE_COLUMNS}, ${query ? Prisma.sql`coalesce(${messagePredicate(query)}, false)` : Prisma.sql`false`} AS matched
          FROM messages m WHERE m.conversation_id = ANY(${ids}::text[])
          ORDER BY m.message_index ASC NULLS LAST, m.created_at, m.id`
      : [];

  const messagesByConversation = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const list = messagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }
  const groups = positiveWordGroups(query);
  const modelGroups = groups.map(withoutSubstrings);

  const hits: SearchHit[] = conversations.map((convo) => {
    const convoMessages = messagesByConversation.get(convo.id) ?? [];
    const document = toSearchDocument(convo, convoMessages);
    const hit: SearchHit = { _id: convo.id, _source: document as unknown as Record<string, unknown> };
    if (query) {
      const offsets = convoMessages.flatMap((message, offset) => (message.matched ? [offset] : []));
      const scored = scoreMessages(document, offsets, groups);
      const highlight: Record<string, string[]> = {};
      const model = highlightText(convo.model, modelGroups);
      if (model.highlighted) highlight.model = [model.highlighted];
      const fragments = snippetFragments(scored);
      if (fragments.length > 0) highlight["messages.content"] = fragments;
      if (Object.keys(highlight).length > 0) hit.highlight = highlight;
      hit.inner_hits = {
        messages: {
          hits: {
            total: { value: offsets.length, relation: "eq" },
            hits: scored.slice(0, POSTGRES_SEARCH.innerHitsSize).map((entry) => entry.hit),
          },
        },
      };
    }
    return hit;
  });

  const took = Date.now() - startTime;
  log.debug({ took, total, returned: hits.length }, "[Search] Postgres search done");
  return {
    hits,
    total: {
      value: Math.min(total, POSTGRES_SEARCH.trackTotalHits),
      relation: total > POSTGRES_SEARCH.trackTotalHits ? "gte" : "eq",
    },
    took,
  };
}
