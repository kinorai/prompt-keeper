import { foldText, splitWords } from "@/lib/search/fold";

// Parses the search box text with the syntax OpenSearch's simple_query_string accepts, so a
// query means the same thing on either backend: words are ANDed, `|` is OR, `-` negates,
// "quotes" make a phrase, a trailing `*` forces a prefix match and parentheses group.
// `+` (explicit AND) is accepted, and `~N` (fuzziness or slop) is ignored.

export interface QueryWord {
  // Folded by src/lib/search/fold.ts: lower case, no accents, letters and digits only. Used to
  // classify the word and to highlight; the SQL folds `source` itself (pk_search_tsquery)
  token: string;
  // prefix: the word starts with token; substring: token appears anywhere inside a word; exact: whole word
  match: "prefix" | "substring" | "exact";
}

export type QueryNode =
  | { type: "and"; children: QueryNode[] }
  | { type: "or"; children: QueryNode[] }
  | { type: "not"; child: QueryNode }
  // One word, or several words that must follow each other (a quoted phrase, or a term the
  // folding split, like gpt-4o or fetch_url). `identifier` is set for a term joined by
  // underscores: the text must contain it as written, like OpenSearch's standard tokenizer, which
  // keeps fetch_url one word (gpt-4o it splits).
  // `source` is the text as typed, which the SQL folds with the same function as the index, and
  // `lastPrefix` whether its last word matches as a prefix.
  | { type: "words"; words: QueryWord[]; source: string; lastPrefix: boolean; identifier?: string };

// Mirrors the OpenSearch mapping: words of 3-4 characters also match inside longer words (its
// 3-4 ngram field), longer ones match as a word prefix (its edge ngram field), one character is
// a whole word only (the edge ngrams start at 2).
const SUBSTRING_LENGTHS = { min: 3, max: 4 } as const;

const classify = (token: string, forcePrefix: boolean): QueryWord["match"] => {
  if (forcePrefix) return "prefix";
  const length = [...token].length;
  if (length >= SUBSTRING_LENGTHS.min && length <= SUBSTRING_LENGTHS.max) return "substring";
  return length === 1 ? "exact" : "prefix";
};

const wordsNode = (raw: string, isPhrase: boolean, forcePrefix: boolean): QueryNode | null => {
  const tokens = splitWords(foldText(raw));
  if (tokens.length === 0) return null;
  if (tokens.length === 1 && !isPhrase) {
    const match = classify(tokens[0], forcePrefix);
    return { type: "words", words: [{ token: tokens[0], match }], source: raw, lastPrefix: match !== "exact" };
  }
  // A quoted phrase is exact words, except a trailing `*`. A term the folding split (gpt-4o) is
  // still being typed like any word, so its last part matches as a prefix.
  const identifier = !isPhrase && /[\p{L}\p{N}]_+[\p{L}\p{N}]/u.test(raw) ? raw.toLowerCase() : undefined;
  const lastPrefix = forcePrefix || !isPhrase;
  return {
    type: "words",
    ...(identifier ? { identifier } : {}),
    source: raw,
    lastPrefix,
    words: tokens.map((token, index) => {
      const isLast = index === tokens.length - 1;
      return { token, match: isLast && lastPrefix ? "prefix" : "exact" } as QueryWord;
    }),
  };
};

type Operator = "and" | "or";

interface ParseState {
  input: string;
  pos: number;
}

const isSpace = (char: string) => /\s/.test(char);
const TERM_STOP = /[\s|()"+]/;

function readFuzziness(state: ParseState) {
  if (state.input[state.pos] !== "~") return;
  state.pos++;
  while (state.pos < state.input.length && /\d/.test(state.input[state.pos])) state.pos++;
}

function readTerm(state: ParseState): QueryNode | null {
  let raw = "";
  while (state.pos < state.input.length) {
    const char = state.input[state.pos];
    if (char === "\\" && state.pos + 1 < state.input.length) {
      raw += state.input[state.pos + 1];
      state.pos += 2;
      continue;
    }
    if (TERM_STOP.test(char) || char === "~") break;
    raw += char;
    state.pos++;
  }
  readFuzziness(state);
  const forcePrefix = raw.endsWith("*");
  return wordsNode(raw.replace(/\*+$/, ""), false, forcePrefix);
}

function readPhrase(state: ParseState): QueryNode | null {
  state.pos++; // opening quote
  let raw = "";
  while (state.pos < state.input.length && state.input[state.pos] !== '"') {
    if (state.input[state.pos] === "\\" && state.pos + 1 < state.input.length) state.pos++;
    raw += state.input[state.pos];
    state.pos++;
  }
  state.pos++; // closing quote, if any
  readFuzziness(state);
  const forcePrefix = raw.trimEnd().endsWith("*");
  return wordsNode(raw.replace(/\*+\s*$/, ""), true, forcePrefix);
}

// Combines left to right without precedence, like Lucene's SimpleQueryParser: `a b | c` is (a AND b) OR c
function combine(top: QueryNode | null, operator: Operator, branch: QueryNode): QueryNode {
  if (!top) return branch;
  if (top.type === operator) return { type: operator, children: [...top.children, branch] };
  return { type: operator, children: [top, branch] };
}

// Deeper parentheses are read as spaces: each level costs recursion here and in the SQL builder
const MAX_GROUP_DEPTH = 8;

function parseGroup(state: ParseState, depth: number): QueryNode | null {
  const isNested = depth > 0;
  let top: QueryNode | null = null;
  let operator: Operator = "and";
  let isNegated = false;

  while (state.pos < state.input.length) {
    const char = state.input[state.pos];
    if (isSpace(char)) {
      state.pos++;
      continue;
    }
    if (char === ")") {
      state.pos++;
      if (isNested) break;
      continue; // a stray closing parenthesis is ignored
    }
    if (char === "|") {
      operator = "or";
      state.pos++;
      continue;
    }
    if (char === "+") {
      operator = "and";
      state.pos++;
      continue;
    }
    if (char === "-" && !isNegated) {
      isNegated = true;
      state.pos++;
      continue;
    }

    let branch: QueryNode | null;
    if (char === "(" && depth >= MAX_GROUP_DEPTH) {
      state.pos++;
      continue;
    }
    if (char === "(") {
      state.pos++;
      branch = parseGroup(state, depth + 1);
      readFuzziness(state);
    } else if (char === '"') {
      branch = readPhrase(state);
    } else {
      branch = readTerm(state);
    }

    if (branch) {
      top = combine(top, operator, isNegated ? { type: "not", child: branch } : branch);
    }
    operator = "and";
    isNegated = false;
  }

  return top;
}

export function parseSearchQuery(input: string): QueryNode | null {
  return parseGroup({ input, pos: 0 }, 0);
}

export function countTerms(node: QueryNode | null): number {
  if (!node) return 0;
  if (node.type === "words") return 1;
  if (node.type === "not") return countTerms(node.child);
  return node.children.reduce((total, child) => total + countTerms(child), 0);
}

// The words a match can highlight: everything not under a negation
export function positiveWordGroups(node: QueryNode | null): QueryWord[][] {
  if (!node) return [];
  switch (node.type) {
    case "words":
      return [node.words];
    case "not":
      return [];
    default:
      return node.children.flatMap(positiveWordGroups);
  }
}
