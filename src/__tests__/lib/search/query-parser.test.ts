import { parseSearchQuery, positiveWordGroups } from "@/lib/search/query-parser";

const word = (token: string, match: "prefix" | "substring" | "exact") => ({ token, match });
const words = (source: string, lastPrefix: boolean, ...list: ReturnType<typeof word>[]) => ({
  type: "words",
  source,
  lastPrefix,
  words: list,
});

describe("parseSearchQuery", () => {
  it("returns null for a query with no words", () => {
    expect(parseSearchQuery("")).toBeNull();
    expect(parseSearchQuery("  ...  ")).toBeNull();
    expect(parseSearchQuery("😀 \" '")).toBeNull();
  });

  it("matches like the OpenSearch mapping: 3-4 letters inside words, longer as a prefix, 1 letter whole", () => {
    expect(parseSearchQuery("pyth")).toEqual(words("pyth", true, word("pyth", "substring")));
    expect(parseSearchQuery("python")).toEqual(words("python", true, word("python", "prefix")));
    expect(parseSearchQuery("go")).toEqual(words("go", true, word("go", "prefix")));
    expect(parseSearchQuery("x")).toEqual(words("x", false, word("x", "exact")));
  });

  it("forces a prefix match with a trailing *", () => {
    expect(parseSearchQuery("pyt*")).toEqual(words("pyt", true, word("pyt", "prefix")));
  });

  it("keeps the text as typed for the SQL to fold, and folds it for highlights", () => {
    expect(parseSearchQuery("Ecuación")).toEqual(words("Ecuación", true, word("ecuacion", "prefix")));
    expect(parseSearchQuery("центральной")).toEqual(words("центральной", true, word("центральной", "prefix")));
    // Decomposed accent (e + U+0301), as macOS copy-paste produces
    expect(parseSearchQuery("café")).toEqual(words("café", true, word("cafe", "substring")));
  });

  it("ANDs words by default", () => {
    expect(parseSearchQuery("react hooks")).toEqual({
      type: "and",
      children: [words("react", true, word("react", "prefix")), words("hooks", true, word("hooks", "prefix"))],
    });
  });

  it("combines operators left to right like simple_query_string", () => {
    expect(parseSearchQuery("alpha beta | gamma")).toEqual({
      type: "or",
      children: [
        {
          type: "and",
          children: [words("alpha", true, word("alpha", "prefix")), words("beta", true, word("beta", "substring"))],
        },
        words("gamma", true, word("gamma", "prefix")),
      ],
    });
  });

  it("negates with - and groups with parentheses", () => {
    expect(parseSearchQuery("doctor -(nurse | hospital)")).toEqual({
      type: "and",
      children: [
        words("doctor", true, word("doctor", "prefix")),
        {
          type: "not",
          child: {
            type: "or",
            children: [
              words("nurse", true, word("nurse", "prefix")),
              words("hospital", true, word("hospital", "prefix")),
            ],
          },
        },
      ],
    });
  });

  it("reads parentheses past 8 levels as spaces", () => {
    expect(parseSearchQuery(`${"(".repeat(10000)}abc`)).toEqual(words("abc", true, word("abc", "substring")));
    expect(() => parseSearchQuery("-(a ".repeat(1500))).not.toThrow();
  });

  it("keeps a quoted phrase as exact words in order", () => {
    expect(parseSearchQuery('"Time this"')).toEqual(
      words("Time this", false, word("time", "exact"), word("this", "exact")),
    );
  });

  it("matches a term the folding splits as adjacent words, the last one as typed so far", () => {
    expect(parseSearchQuery("gpt-4o")).toEqual(words("gpt-4o", true, word("gpt", "exact"), word("4o", "prefix")));
  });

  it("requires an underscore identifier as written", () => {
    expect(parseSearchQuery("fetch_url")).toEqual({
      ...words("fetch_url", true, word("fetch", "exact"), word("url", "prefix")),
      identifier: "fetch_url",
    });
  });

  it("splits Chinese and Japanese into one word per character", () => {
    expect(parseSearchQuery("使用Python")).toEqual(
      words("使用Python", true, word("使", "exact"), word("用", "exact"), word("python", "prefix")),
    );
  });

  it("ignores fuzziness and stray operators", () => {
    expect(parseSearchQuery("color~2 )")).toEqual(words("color", true, word("color", "prefix")));
  });

  it("takes escaped operators as text", () => {
    expect(parseSearchQuery("a\\|b")).toEqual(words("a|b", true, word("a", "exact"), word("b", "prefix")));
  });
});

describe("positiveWordGroups", () => {
  it("leaves out negated words, which nothing highlights", () => {
    expect(positiveWordGroups(parseSearchQuery("doctor -nurse"))).toEqual([[word("doctor", "prefix")]]);
  });
});
