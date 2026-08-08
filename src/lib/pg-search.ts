import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import getPrisma from "@/lib/prisma";
import { buildConversationDoc } from "@/lib/conversation-doc";
import { parseMagicQuery } from "@/lib/search-query";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "@/lib/search-highlights";
import { createLogger } from "@/lib/logger";
import { getPresignedUrl } from "@/lib/s3";
import { DEFAULT_ROLES } from "@/lib/defaults";

const log = createLogger("pg-search");

// Word-prefix matching (every token matches word starts, WhatsApp-style), accent-
// and case-insensitive via the unaccent+simple text search configuration created in
// the postgres_search migration. All expressions must match the migration's GIN
// index expression exactly, or the planner falls back to a sequential scan.
const TSCFG = "pk_simple_unaccent";
const MAX_TOKENS = 16;
const MAX_INNER_HITS = 5;

const HEADLINE_OPTS = `StartSel=${SEARCH_HIGHLIGHT_PRE_TAG}, StopSel=${SEARCH_HIGHLIGHT_POST_TAG}, HighlightAll=true`;

interface ParsedTokens {
  prefixes: string[];
  exacts: string[];
  phrases: string[];
  negations: string[];
}

function tokenize(cleanQuery: string): ParsedTokens {
  const phrases: string[] = [];
  const rest = cleanQuery.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    phrases.push(phrase);
    return " ";
  });

  const prefixes: string[] = [];
  const exacts: string[] = [];
  const negations: string[] = [];

  for (const raw of rest.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS)) {
    if (raw.startsWith("-") && raw.length > 1) {
      negations.push(raw.slice(1));
      continue;
    }
    const token = raw.replace(/^-+/, "");
    if (!token) continue;
    // Degenerate single-char prefixes explode into huge candidate sets; match them
    // as exact lexemes instead.
    if (token.length >= 2) prefixes.push(token);
    else exacts.push(token);
  }

  return { prefixes, exacts, phrases, negations };
}

/**
 * Build the tsquery as a SQL fragment. Positive tokens are lexed by Postgres itself
 * (to_tsvector) so query lexemes always agree with the index's parser — e.g.
 * `foo.bar` stays one lexeme — then each lexeme gets a `:*` prefix marker.
 * Returns null when the query has no usable tokens (browse mode).
 */
function buildTsquery(tokens: ParsedTokens): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  if (tokens.prefixes.length > 0) {
    parts.push(Prisma.sql`
      coalesce(to_tsquery(${TSCFG}::regconfig, (
        SELECT string_agg(quote_literal(lexeme) || ':*', ' & ')
        FROM unnest(to_tsvector(${TSCFG}::regconfig, ${tokens.prefixes.join(" ")}::text)) AS u(lexeme, positions, weights)
      )), ''::tsquery)`);
  }
  if (tokens.exacts.length > 0) {
    parts.push(Prisma.sql`plainto_tsquery(${TSCFG}::regconfig, ${tokens.exacts.join(" ")}::text)`);
  }
  for (const phrase of tokens.phrases) {
    parts.push(Prisma.sql`phraseto_tsquery(${TSCFG}::regconfig, ${phrase}::text)`);
  }
  for (const negation of tokens.negations) {
    parts.push(Prisma.sql`(!! plainto_tsquery(${TSCFG}::regconfig, ${negation}::text))`);
  }

  if (parts.length === 0) return null;
  return parts.reduce((acc, part) => Prisma.sql`(${acc} && ${part})`);
}

/** The stored generated column backing the GIN index (see the postgres_search migration). */
function messageTsvector(alias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(alias)}.search_tsv`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface TimeRangeInput {
  start?: string;
  end?: string;
}

function timeRangeFilter(timeRange: string | TimeRangeInput | undefined): Prisma.Sql | null {
  if (!timeRange || timeRange === "all") return null;
  switch (timeRange) {
    case "1h":
      return Prisma.sql`c.created_at >= now() - interval '1 hour'`;
    case "1d":
      return Prisma.sql`c.created_at >= now() - interval '1 day'`;
    case "1m":
      return Prisma.sql`c.created_at >= now() - interval '1 month'`;
    case "1y":
      return Prisma.sql`c.created_at >= now() - interval '1 year'`;
    default:
      if (typeof timeRange === "object" && timeRange.start && timeRange.end) {
        const start = new Date(timeRange.start);
        const end = new Date(timeRange.end);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return Prisma.sql`c.created_at BETWEEN ${start} AND ${end}`;
        }
      }
      return null;
  }
}

interface MessageContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
}

/** Same S3 presigning pass the OpenSearch route applies to its hits. */
async function signS3Urls(messages: Array<{ content: unknown; multimodal_content?: unknown }>) {
  await Promise.all(
    messages.map(async (msg) => {
      if (msg.multimodal_content) {
        msg.content = msg.multimodal_content;
      }
      if (Array.isArray(msg.content)) {
        await Promise.all(
          (msg.content as MessageContentItem[]).map(async (item) => {
            if (item.type === "image_url" && item.image_url?.url?.startsWith("s3://")) {
              const key = item.image_url.url.replace("s3://", "");
              const signedUrl = await getPresignedUrl(key);
              if (signedUrl) {
                item.image_url.url = signedUrl;
              }
            }
          }),
        );
      }
    }),
  );
}

/** Highlight query tokens in the model name, mirroring OpenSearch's model highlight. */
function highlightModel(model: string, tokens: ParsedTokens): string | undefined {
  const needles = [...tokens.prefixes, ...tokens.exacts, ...tokens.phrases].filter(Boolean);
  if (needles.length === 0) return undefined;
  let highlighted = model;
  let matched = false;
  for (const needle of needles) {
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    highlighted = highlighted.replace(pattern, (m) => {
      matched = true;
      return `${SEARCH_HIGHLIGHT_PRE_TAG}${m}${SEARCH_HIGHLIGHT_POST_TAG}`;
    });
  }
  return matched ? highlighted : undefined;
}

export async function searchPostgres(req: NextRequest): Promise<NextResponse> {
  try {
    const { query, timeRange, size = 20, from = 0, roles } = await req.json();
    const startTime = Date.now();
    const prisma = getPrisma();

    const { cleanQuery, rolesFromQuery, modelsFromQuery } = parseMagicQuery(query);
    const tokens = tokenize(cleanQuery);
    const tsquery = buildTsquery(tokens);

    const pageSize = Math.min(Math.max(Number(size) || 20, 1), 100);
    const pageFrom = Math.max(Number(from) || 0, 0);

    // Filters shared by both browse and search mode
    const filters: Prisma.Sql[] = [];

    const validRoles: string[] = [...DEFAULT_ROLES];
    const uiRoles = Array.isArray(roles) ? roles.filter((r) => validRoles.includes(r)) : [];
    const activeRoles = new Set<string>();
    if (uiRoles.length > 0 && uiRoles.length < validRoles.length) {
      uiRoles.forEach((r) => activeRoles.add(r));
    }
    rolesFromQuery.forEach((r) => activeRoles.add(r));
    if (activeRoles.size > 0) {
      // IN-subquery (not correlated EXISTS): the planner hashes the id set once
      // instead of probing messages per conversation.
      filters.push(
        Prisma.sql`c.id IN (
          SELECT mr.conversation_id FROM messages mr WHERE mr.role IN (${Prisma.join(Array.from(activeRoles))})
        )`,
      );
    }

    if (modelsFromQuery.length > 0) {
      filters.push(Prisma.sql`c.model IN (${Prisma.join(modelsFromQuery)})`);
    }

    const timeFilter = timeRangeFilter(timeRange);
    if (timeFilter) filters.push(timeFilter);

    // Text match: any message matches the tsquery, or the model name contains
    // every token as a substring (OpenSearch matched the model field too).
    if (tsquery) {
      const modelLikes = [...tokens.prefixes, ...tokens.exacts].map(
        (t) => Prisma.sql`c.model ILIKE ${"%" + escapeLike(t) + "%"}`,
      );
      const modelMatch =
        modelLikes.length > 0 ? modelLikes.reduce((acc, part) => Prisma.sql`(${acc} AND ${part})`) : Prisma.sql`false`;
      filters.push(
        Prisma.sql`(
          c.id IN (
            SELECT mt.conversation_id FROM messages mt WHERE ${messageTsvector("mt")} @@ ${tsquery}
          ) OR ${modelMatch}
        )`,
      );
    }

    const whereClause =
      filters.length > 0
        ? Prisma.sql`WHERE ${filters.reduce((acc, part) => Prisma.sql`${acc} AND ${part}`)}`
        : Prisma.empty;

    const page = await prisma.$queryRaw<Array<{ id: string; total: bigint }>>(
      Prisma.sql`
        SELECT c.id, count(*) OVER() AS total
        FROM conversations c
        ${whereClause}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ${pageSize} OFFSET ${pageFrom}
      `,
    );

    const total = page.length > 0 ? Number(page[0].total) : 0;
    const conversationIds = page.map((row) => row.id);

    // Load page conversations + messages through Prisma (source of truth)
    const [conversations, messages] = conversationIds.length
      ? await Promise.all([
          prisma.conversation.findMany({ where: { id: { in: conversationIds } } }),
          prisma.message.findMany({
            where: { conversationId: { in: conversationIds } },
            orderBy: { messageIndex: "asc" },
          }),
        ])
      : [[], []];
    const conversationById = new Map(conversations.map((c) => [c.id, c]));
    const messagesByConversation = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = messagesByConversation.get(m.conversationId) ?? [];
      list.push(m);
      messagesByConversation.set(m.conversationId, list);
    }

    // Highlights: top matched messages per conversation, whole-body headline over
    // content text only (reasoning/tool matches count for matching, not display).
    const highlightsByConversation = new Map<string, Array<{ messageId: string; headline: string }>>();
    if (tsquery && conversationIds.length > 0) {
      const matched = await prisma.$queryRaw<
        Array<{ id: string; conversation_id: string; headline: string }>
      >(
        Prisma.sql`
          WITH matched AS (
            SELECT m.id, m.conversation_id,
                   pk_message_content_text(m.content) AS content_text,
                   ROW_NUMBER() OVER (
                     PARTITION BY m.conversation_id ORDER BY m.message_index ASC NULLS LAST, m.created_at ASC
                   ) AS rn
            FROM messages m
            WHERE m.conversation_id IN (${Prisma.join(conversationIds)})
              AND ${messageTsvector("m")} @@ ${tsquery}
          )
          SELECT id, conversation_id,
                 ts_headline(${TSCFG}::regconfig, coalesce(content_text, ''), ${tsquery}, ${HEADLINE_OPTS}) AS headline
          FROM matched
          WHERE rn <= ${MAX_INNER_HITS}
        `,
      );
      for (const row of matched) {
        const list = highlightsByConversation.get(row.conversation_id) ?? [];
        list.push({ messageId: row.id, headline: row.headline });
        highlightsByConversation.set(row.conversation_id, list);
      }
    }

    // Assemble OpenSearch-shaped hits so the frontend needs no changes
    const hits = await Promise.all(
      conversationIds.map(async (id) => {
        const convo = conversationById.get(id);
        if (!convo) return null;
        const convoMessages = messagesByConversation.get(id) ?? [];
        const source = buildConversationDoc(convo, convoMessages);
        await signS3Urls(source.messages);

        const offsetByMessageId = new Map(convoMessages.map((m, index) => [m.id, index]));
        const innerHits = (highlightsByConversation.get(id) ?? [])
          .filter((h) => offsetByMessageId.has(h.messageId))
          .map((h) => ({
            _nested: { offset: offsetByMessageId.get(h.messageId) },
            highlight: { content: [h.headline] },
          }));

        const modelHighlight = highlightModel(convo.model, tokens);

        return {
          _id: id,
          _source: source,
          ...(modelHighlight ? { highlight: { model: [modelHighlight] } } : {}),
          ...(innerHits.length > 0 ? { inner_hits: { messages: { hits: { hits: innerHits } } } } : {}),
        };
      }),
    );

    const took = Date.now() - startTime;

    return NextResponse.json({
      hits: {
        hits: hits.filter(Boolean),
        total: { value: total },
      },
      took,
    });
  } catch (error) {
    log.error(error, "[PG Search Error]");
    return NextResponse.json(
      {
        hits: { hits: [], total: { value: 0 } },
        took: 0,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
