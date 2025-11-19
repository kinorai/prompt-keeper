export const SEARCH_HIGHLIGHT_PRE_TAG = "__pkhlstart__";
export const SEARCH_HIGHLIGHT_POST_TAG = "__pkhlend__";

export interface HighlightSegment {
  text: string;
  isHighlighted: boolean;
}

export function hasHighlightMarkers(text: string): boolean {
  return text.includes(SEARCH_HIGHLIGHT_PRE_TAG) && text.includes(SEARCH_HIGHLIGHT_POST_TAG);
}

export function splitHighlightSegments(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(SEARCH_HIGHLIGHT_PRE_TAG, cursor);
    if (start === -1) {
      segments.push({ text: text.slice(cursor), isHighlighted: false });
      break;
    }

    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), isHighlighted: false });
    }

    const end = text.indexOf(SEARCH_HIGHLIGHT_POST_TAG, start + SEARCH_HIGHLIGHT_PRE_TAG.length);
    if (end === -1) {
      segments.push({ text: text.slice(start + SEARCH_HIGHLIGHT_PRE_TAG.length), isHighlighted: true });
      break;
    }

    segments.push({
      text: text.slice(start + SEARCH_HIGHLIGHT_PRE_TAG.length, end),
      isHighlighted: true,
    });

    cursor = end + SEARCH_HIGHLIGHT_POST_TAG.length;
  }

  return segments;
}

export function injectHighlightHtml(text: string, className = "font-semibold"): string {
  return text
    .split(SEARCH_HIGHLIGHT_PRE_TAG)
    .join(`<strong class="${className}">`)
    .split(SEARCH_HIGHLIGHT_POST_TAG)
    .join("</strong>");
}
