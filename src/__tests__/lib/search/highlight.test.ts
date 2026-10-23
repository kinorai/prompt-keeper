import { foldText, foldWithOffsets, splitWords } from "@/lib/search/fold";
import { highlightFragments, highlightText } from "@/lib/search/highlight";
import { parseSearchQuery, positiveWordGroups } from "@/lib/search/query-parser";
import { SEARCH_HIGHLIGHT_POST_TAG as END, SEARCH_HIGHLIGHT_PRE_TAG as START } from "@/lib/search-highlights";

const groupsOf = (query: string) => positiveWordGroups(parseSearchQuery(query));

describe("foldText", () => {
  it("folds like unaccent: Latin and Greek accents go, other scripts keep their letters", () => {
    expect(foldText("Ünïcödé Ça")).toBe("unicode ca");
    expect(foldText("Straße Æon")).toBe("strasse aeon");
    expect(foldText("άλφα")).toBe("αλφα");
    expect(foldText("ёлка й")).toBe("елка й");
    expect(foldText("ﬁne ｆoo")).toBe("fine foo");
  });

  it("drops a combining accent left on its own, as unaccent does", () => {
    expect(foldText("cafe\u0301 µs nº")).toBe("cafe μs no");
  });

  it("splits Han, Hiragana and Katakana into one word per character", () => {
    expect(splitWords(foldText("我们使用Python"))).toEqual(["我", "们", "使", "用", "python"]);
  });

  it("maps folded offsets back to the original text", () => {
    const { folded, originalStart, originalEnd } = foldWithOffsets("Maß é");
    expect(folded).toBe("mass e");
    // "ss" both come from ß at offset 2
    expect([originalStart(2), originalEnd(3)]).toEqual([2, 3]);
    expect([originalStart(5), originalEnd(5)]).toEqual([4, 5]);
  });
});

describe("highlightText", () => {
  it("marks whole words for a prefix and keeps the original accents", () => {
    expect(highlightText("Resolver una ecuación cuadrática", groupsOf("ecuac")).highlighted).toBe(
      `Resolver una ${START}ecuación${END} cuadrática`,
    );
  });

  it("marks only the matched part for a 3-4 letter substring", () => {
    expect(highlightText("a deeper conspiracy", groupsOf("eepe")).highlighted).toBe(
      `a d${START}eepe${END}r conspiracy`,
    );
  });

  it("marks a phrase only where its words follow each other", () => {
    expect(highlightText("time for this, and this time", groupsOf('"this time"')).highlighted).toBe(
      `time for this, and ${START}this${END} ${START}time${END}`,
    );
  });

  it("counts the matched word groups and returns null when nothing matched", () => {
    expect(highlightText("react and vue", groupsOf("react svelte")).matchedGroups).toBe(1);
    expect(highlightText("nothing here", groupsOf("python"))).toEqual({
      highlighted: null,
      matchedGroups: 0,
      spans: [],
    });
  });
});

describe("highlightFragments", () => {
  it("cuts short excerpts around the matches without splitting words", () => {
    const text = `${"lorem ipsum ".repeat(20)}the needle is here ${"dolor sit ".repeat(20)}`;
    const { spans } = highlightText(text, groupsOf("needle"));
    const [fragment] = highlightFragments(text, spans, 40, 2);
    expect(fragment).toContain(`${START}needle${END}`);
    expect(fragment.length).toBeLessThan(80);
    expect(fragment).toMatch(/^\w/);
  });

  it("never cuts an emoji in half", () => {
    const text = `${"😀".repeat(100)} hello ${"😀".repeat(100)}`;
    const { spans } = highlightText(text, groupsOf("hello"));
    const [fragment] = highlightFragments(text, spans, 90, 1);
    expect(fragment).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
  });

  it("returns at most the asked number of fragments", () => {
    const text = Array.from({ length: 5 }, (_, i) => `${"filler ".repeat(30)} needle${i}`).join(" ");
    const { spans } = highlightText(text, groupsOf("needle"));
    expect(highlightFragments(text, spans, 30, 2)).toHaveLength(2);
  });
});
