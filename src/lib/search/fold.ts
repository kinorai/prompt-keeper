// The JavaScript side of pk_search_fold (the add_postgres_search migration): query words and
// highlights are folded like the indexed text, otherwise "café" would not find "cafe".

// Letters unaccent (and OpenSearch's asciifolding) spell out rather than strip
const SPELLED_OUT: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
  ħ: "h",
  ı: "i",
  ё: "е",
  µ: "μ",
  º: "o",
  ª: "a",
};

// unaccent strips accents from Latin and Greek letters only: й stays й
const ACCENTED_BASE = /^[\p{Script=Latin}\p{Script=Greek}]\p{M}+$/u;
const COMBINING_MARKS = /\p{M}/gu;
// Ligatures (ﬁ) and full-width forms (ｆ), which unaccent also maps to plain letters
const COMPATIBILITY_FORMS = /[\ufb00-\ufb06\uff00-\uffef]/u;
// Han, Hiragana and Katakana: one word per character, as pk_search_fold splits them
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
// What pk_search_fold keeps (pg_c_utf8's [[:alnum:]]): Unicode Alphabetic, which includes the
// vowel signs of Thai or Devanagari but not their tone marks or virama, and decimal digits (not ² or ½)
const WORD = /[\p{Alphabetic}\p{Nd}]+/gu;
// A combining accent on its own (decomposed text, "e" + U+0301): unaccent drops it
const COMBINING_DIACRITIC = /^[\u0300-\u036f]$/u;
const ASCII_ONLY = /^[\x00-\x7f]*$/;

const foldNonAscii = (char: string): string => {
  if (CJK.test(char)) return ` ${char} `;
  if (COMBINING_DIACRITIC.test(char)) return "";
  const lower = char.toLowerCase();
  if (SPELLED_OUT[lower]) return SPELLED_OUT[lower];
  if (COMPATIBILITY_FORMS.test(lower)) return lower.normalize("NFKC").toLowerCase();
  const decomposed = lower.normalize("NFD");
  return ACCENTED_BASE.test(decomposed) ? decomposed.replace(COMBINING_MARKS, "") : lower;
};

// Search folds every matched message on each query: ASCII is lowered inline, anything else is
// folded once per distinct character
const foldedChars = new Map<string, string>();
const foldCodePoint = (char: string): string => {
  const code = char.charCodeAt(0);
  if (code < 0x80) return code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : char;
  let folded = foldedChars.get(char);
  if (folded === undefined) {
    folded = foldNonAscii(char);
    foldedChars.set(char, folded);
  }
  return folded;
};

export function foldText(text: string): string {
  if (ASCII_ONLY.test(text)) return text.toLowerCase();
  let folded = "";
  for (const char of text) folded += foldCodePoint(char);
  return folded;
}

export function splitWords(folded: string): string[] {
  return folded.match(WORD) ?? [];
}

export interface FoldedText {
  folded: string;
  // Where the folded text's UTF-16 unit at `index` came from in the original
  originalStart: (index: number) => number;
  originalEnd: (index: number) => number;
}

export function foldWithOffsets(text: string): FoldedText {
  // ASCII folds one character to one: offsets are the same on both sides
  if (ASCII_ONLY.test(text)) {
    return { folded: text.toLowerCase(), originalStart: (index) => index, originalEnd: (index) => index + 1 };
  }
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of text) {
    const piece = foldCodePoint(char);
    for (let i = 0; i < piece.length; i++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    folded += piece;
    offset += char.length;
  }
  return { folded, originalStart: (index) => starts[index], originalEnd: (index) => ends[index] };
}

export interface FoldedWord {
  token: string;
  start: number; // offsets in the folded text
  end: number;
}

export function foldedWords(folded: string): FoldedWord[] {
  return [...folded.matchAll(WORD)].map((match) => ({
    token: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}
