import { Prisma } from "@prisma/client";
import { searchPostgres } from "@/lib/search/postgres";
import { parseSearchRequest, type SearchRequest } from "@/lib/search/request";
import { SEARCH_HIGHLIGHT_POST_TAG as END, SEARCH_HIGHLIGHT_PRE_TAG as START } from "@/lib/search-highlights";

jest.mock("@/lib/prisma", () => {
  const client = { $queryRaw: jest.fn() };
  return { __esModule: true, default: () => client };
});

import getPrisma from "@/lib/prisma";

const queryRaw = (getPrisma() as unknown as { $queryRaw: jest.Mock }).$queryRaw;

const conversation = (id: string, model = "gpt-4o") => ({
  id,
  model,
  conversationHash: null,
  callerKeyHash: null,
  latencyMs: 120,
  promptTokens: 10,
  completionTokens: 20,
  totalTokens: 30,
  requestParams: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
});

const message = (conversationId: string, index: number, role: string, content: unknown, matched: boolean) => ({
  id: `${conversationId}-${index}`,
  conversationId,
  role,
  content,
  toolCalls: null,
  toolCallId: null,
  name: null,
  reasoningContent: null,
  thinkingBlocks: null,
  annotations: null,
  audio: null,
  images: null,
  refusal: null,
  finishReason: null,
  messageIndex: index,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  matched,
});

// Rebuilds the SQL the backend sent, to assert on it
const sqlOf = (call: unknown[]) => {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
};

function answer(rows: { page: unknown[]; total: number; messages: unknown[] }) {
  queryRaw.mockImplementation((...call: unknown[]) => {
    const { sql } = sqlOf(call);
    if (sql.includes("WITH RECURSIVE models"))
      return Promise.resolve([{ model: "gemini-2.5-pro" }, { model: "gpt-4o" }]);
    if (sql.includes("count(*)")) return Promise.resolve([{ total: rows.total }]);
    if (sql.includes("FROM messages m WHERE m.conversation_id = ANY")) return Promise.resolve(rows.messages);
    return Promise.resolve(rows.page);
  });
}

// The conversation page query: not the model list, the count or the messages
const pageQuery = () =>
  sqlOf(
    queryRaw.mock.calls.find((call) => {
      const { sql } = sqlOf(call);
      return sql.includes("ORDER BY c.created_at") && !sql.includes("count(*)");
    })!,
  );

const search = (body: Record<string, unknown>) => searchPostgres(parseSearchRequest(body) as SearchRequest);

describe("searchPostgres", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns hits in the OpenSearch shape the UI reads", async () => {
    answer({
      page: [conversation("c1")],
      total: 1,
      messages: [
        message("c1", 0, "system", "You are helpful", false),
        message("c1", 1, "user", "How do I bake bread?", true),
        message("c1", 2, "assistant", "Knead the dough, then bake the bread at 220°C.", true),
      ],
    });

    const results = await search({ query: "bread" });

    expect(results.total).toEqual({ value: 1, relation: "eq" });
    const [hit] = results.hits;
    expect(hit._id).toBe("c1");
    expect(hit._source).toEqual(
      expect.objectContaining({
        model: "gpt-4o",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: "How do I bake bread?" })]),
      }),
    );
    // The user's message makes the snippet; every matching message is highlighted for the card
    expect(hit.highlight?.["messages.content"]?.[0]).toBe(`How do I bake ${START}bread${END}?`);
    expect(hit.inner_hits?.messages.hits.hits.map((inner) => inner._nested.offset)).toEqual([1, 2]);
    expect(hit.inner_hits?.messages.hits.hits[1].highlight?.content?.[0]).toContain(`${START}bread${END}`);
  });

  it("matches and highlights model names, without substrings", async () => {
    answer({ page: [conversation("c1", "gemini-2.5-pro")], total: 1, messages: [] });

    const results = await search({ query: "gemini" });
    expect(results.hits[0].highlight?.model).toEqual([`${START}gemini${END}-2.5-pro`]);
    expect(pageQuery().values).toEqual(expect.arrayContaining([["gemini-2.5-pro"]]));

    jest.clearAllMocks();
    const mini = await search({ query: "mini" });
    expect(mini.hits[0].highlight?.model).toBeUndefined();
    // No model matched: the conversation query has no OR on the model
    expect(pageQuery().sql).not.toContain("c.model = ANY");
  });

  it("lists the latest conversations for an empty query, without highlights", async () => {
    answer({ page: [conversation("c1")], total: 1, messages: [message("c1", 0, "user", "hi", false)] });

    const results = await search({ query: "" });

    expect(results.hits[0].highlight).toBeUndefined();
    expect(results.hits[0].inner_hits).toBeUndefined();
    expect(pageQuery().sql).not.toContain("WHERE");
  });

  it("reports totals past 10,000 as a lower bound, like OpenSearch", async () => {
    answer({ page: [], total: 10001, messages: [] });
    expect((await search({ query: "the" })).total).toEqual({ value: 10000, relation: "gte" });
  });

  it("builds the filters: substrings with LIKE, words with tsquery, roles, models, time", async () => {
    answer({ page: [], total: 0, messages: [] });

    await search({ query: 'role:user model:"gpt-4o" eepe ecuac -nurse', timeRange: "1m" });

    const page = pageQuery();
    // Terms are folded in SQL, by the function that folded the index
    expect(page.sql).toContain("m.search_words LIKE ('%' || pk_search_fold(");
    expect(page.sql).toContain("m.search_tsv @@ pk_search_tsquery(");
    expect(page.sql).toContain("NOT coalesce(");
    expect(page.sql).toContain("role = ANY(");
    expect(page.sql).toContain("c.model = ANY(");
    expect(page.sql).toContain("::interval");
    expect(page.values).toEqual(
      expect.arrayContaining(["eepe", "ecuac", "nurse", true, ["user"], ["gpt-4o"], "1 month"]),
    );
  });

  it("checks an underscore identifier against the text as written", async () => {
    answer({ page: [], total: 0, messages: [] });

    await search({ query: "fetch_url" });

    expect(pageQuery().values).toEqual(expect.arrayContaining(["fetch_url", "%fetch\\_url%"]));
  });

  it("finds nothing for text without a word, rather than everything", async () => {
    answer({ page: [conversation("c1")], total: 1, messages: [] });

    const results = await search({ query: "😀" });

    expect(results.total).toEqual({ value: 0, relation: "eq" });
    expect(results.hits).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
