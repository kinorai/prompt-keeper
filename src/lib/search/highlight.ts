import { foldedWords, foldWithOffsets, type FoldedWord } from "@/lib/search/fold";
import { wordMatches } from "@/lib/search/match";
import type { QueryWord } from "@/lib/search/query-parser";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "@/lib/search-highlights";

interface Range {
  start: number;
  end: number;
}

export interface HighlightResult {
  // The whole text with every match wrapped in the highlight markers; null when nothing matched
  highlighted: string | null;
  // How many of the query's word groups matched, to pick the best message for the snippet
  matchedGroups: number;
  // The matched spans, in offsets of the original text
  spans: Range[];
}

const NO_MATCH: HighlightResult = { highlighted: null, matchedGroups: 0, spans: [] };

const mark = (text: string) => SEARCH_HIGHLIGHT_PRE_TAG + text + SEARCH_HIGHLIGHT_POST_TAG;

// Wraps the spans of text in the highlight markers
function markSpans(text: string, spans: Range[], from = 0, to = text.length): string {
  let marked = "";
  let cursor = from;
  for (const span of spans) {
    if (span.end <= from || span.start >= to) continue;
    const start = Math.max(span.start, from);
    const end = Math.min(span.end, to);
    marked += text.slice(cursor, start) + mark(text.slice(start, end));
    cursor = end;
  }
  return marked + text.slice(cursor, to);
}

// A substring match marks only the matched part, any other match the whole word
function rangesForWord(word: FoldedWord, query: QueryWord): Range[] {
  if (query.match !== "substring") return [{ start: word.start, end: word.end }];
  const ranges: Range[] = [];
  let from = word.token.indexOf(query.token);
  while (from !== -1) {
    ranges.push({ start: word.start + from, end: word.start + from + query.token.length });
    from = word.token.indexOf(query.token, from + query.token.length);
  }
  return ranges;
}

function rangesForGroup(words: FoldedWord[], group: QueryWord[]): Range[] {
  const ranges: Range[] = [];
  for (let i = 0; i + group.length <= words.length; i++) {
    if (group.every((query, offset) => wordMatches(words[i + offset], query))) {
      group.forEach((query, offset) => ranges.push(...rangesForWord(words[i + offset], query)));
    }
  }
  return ranges;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export function highlightText(text: string, groups: QueryWord[][]): HighlightResult {
  if (!text || groups.length === 0) return NO_MATCH;

  const { folded, originalStart, originalEnd } = foldWithOffsets(text);
  const words = foldedWords(folded);
  const ranges: Range[] = [];
  let matchedGroups = 0;
  for (const group of groups) {
    const groupRanges = rangesForGroup(words, group);
    if (groupRanges.length > 0) matchedGroups++;
    ranges.push(...groupRanges);
  }
  if (ranges.length === 0) return NO_MATCH;

  // Back to offsets of the original text; folding can turn one character into several
  const spans: Range[] = [];
  for (const range of mergeRanges(ranges)) {
    const start = originalStart(range.start);
    const end = originalEnd(range.end - 1);
    const last = spans.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else spans.push({ start, end });
  }
  return { highlighted: markSpans(text, spans), matchedGroups, spans };
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

// Short excerpts around the matches, like OpenSearch's highlight fragments (fragment_size,
// number_of_fragments): the list shows one in two lines, where the whole message would hide the match
export function highlightFragments(text: string, spans: Range[], size: number, count: number): string[] {
  const fragments: string[] = [];
  let covered = 0;
  for (const span of spans) {
    if (fragments.length === count) break;
    if (span.start < covered) continue;
    const room = Math.max(0, size - (span.end - span.start));
    let start = Math.max(covered, span.start - Math.floor(room / 2));
    let end = Math.min(text.length, span.end + Math.ceil(room / 2));
    // Don't cut words in half
    while (start > covered && isWordChar(text[start - 1]) && span.start - start < size) start--;
    while (end < text.length && isWordChar(text[end]) && end - span.end < size) end++;
    // Nor a character in half: a surrogate pair (emoji, rare CJK) stays whole
    if (start > 0 && isLowSurrogate(text.charCodeAt(start))) start--;
    if (end < text.length && isLowSurrogate(text.charCodeAt(end))) end++;
    fragments.push(markSpans(text, spans, start, end).replace(/\s+/g, " ").trim());
    covered = end;
  }
  return fragments;
}
