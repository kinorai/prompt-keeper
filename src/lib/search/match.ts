import { foldedWords, foldText, type FoldedWord } from "@/lib/search/fold";
import type { QueryNode, QueryWord } from "@/lib/search/query-parser";

// Evaluates a parsed query against one short text in JavaScript, with the semantics the SQL
// predicates have. Used for model names: there are a handful of distinct ones, so matching them
// here beats folding the model of every conversation in SQL.

export const withoutSubstrings = (words: QueryWord[]): QueryWord[] =>
  words.map((word) => (word.match === "substring" ? { ...word, match: "prefix" } : word));

export const wordMatches = (word: FoldedWord, query: QueryWord): boolean =>
  query.match === "exact"
    ? word.token === query.token
    : query.match === "prefix"
      ? word.token.startsWith(query.token)
      : word.token.includes(query.token);

const hasSequence = (words: FoldedWord[], group: QueryWord[]): boolean => {
  for (let i = 0; i + group.length <= words.length; i++) {
    if (group.every((query, offset) => wordMatches(words[i + offset], query))) return true;
  }
  return false;
};

function evaluate(node: QueryNode, words: FoldedWord[], hasSubstrings: boolean): boolean {
  switch (node.type) {
    case "words":
      return hasSequence(words, hasSubstrings ? node.words : withoutSubstrings(node.words));
    case "and":
      return node.children.every((child) => evaluate(child, words, hasSubstrings));
    case "or":
      return node.children.some((child) => evaluate(child, words, hasSubstrings));
    case "not":
      return !evaluate(node.child, words, hasSubstrings);
  }
}

export function matchesQuery(text: string, node: QueryNode, hasSubstrings: boolean): boolean {
  return evaluate(node, foldedWords(foldText(text)), hasSubstrings);
}
