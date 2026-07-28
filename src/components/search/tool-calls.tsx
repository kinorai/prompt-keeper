"use client";

import { useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Maximize2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { formatPayloadSize } from "@/lib/conversation";
import { prettify, summarizeArgs, summarizeResult, tryParseJson, type ToolInvocation } from "@/lib/tool-calls";
import { MarkdownContent } from "@/components/search/markdown-content";
import { SEARCH_HIGHLIGHT_CLASS, splitHighlightSegments, type HighlightSegment } from "@/lib/search-highlights";

// Beyond this many calls in one turn, the strip itself collapses to a single summary row
const GROUP_THRESHOLD = 4;
// Lines of payload shown in the inline preview before falling back to the full-screen sheet
const PREVIEW_LINES = 14;
// Budget for a search-hit preview, which is windowed by character rather than by line
const PREVIEW_CHARS = 1200;
const LEADING_CONTEXT_CHARS = 300;
// Above this, markdown rendering in the full view becomes an explicit opt-in
const MARKDOWN_LIMIT_CHARS = 150_000;

// Subcomponents

interface Preview {
  segments: HighlightSegment[];
  hiddenNote?: string;
}

const plainPreview = (text: string): Preview => {
  const lines = prettify(text).split("\n");
  const hiddenLines = Math.max(0, lines.length - PREVIEW_LINES);

  return {
    segments: [{ text: lines.slice(0, PREVIEW_LINES).join("\n"), isHighlighted: false }],
    hiddenNote: hiddenLines > 0 ? `… ${hiddenLines} more lines` : undefined,
  };
};

/**
 * Search returns the whole matched field, so a hit inside a large payload has to be windowed
 * down. Walking segments rather than raw text keeps highlight markers paired by construction.
 */
const matchPreview = (highlighted: string): Preview => {
  const segments = splitHighlightSegments(highlighted);
  const firstMatch = segments.findIndex((segment) => segment.isHighlighted);
  const startIndex = Math.max(0, firstMatch - 1);

  const windowed: HighlightSegment[] = [];
  let budget = PREVIEW_CHARS;

  for (let i = startIndex; i < segments.length && budget > 0; i++) {
    const segment = segments[i];
    // Trim the leading run so the match itself is visible rather than pushed off the end
    const text = i === startIndex && !segment.isHighlighted ? segment.text.slice(-LEADING_CONTEXT_CHARS) : segment.text;

    windowed.push({ ...segment, text: text.slice(0, budget) });
    budget -= text.length;
  }

  const shown = windowed.reduce((total, segment) => total + segment.text.length, 0);

  return {
    segments: windowed,
    hiddenNote: shown < highlighted.length ? "… trimmed around the match" : undefined,
  };
};

const PayloadPreview: React.FC<{ text: string; highlighted?: string }> = ({ text, highlighted }) => {
  const preview = useMemo(() => (highlighted ? matchPreview(highlighted) : plainPreview(text)), [text, highlighted]);

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
      {preview.segments.map((segment, idx) => (
        <span key={`${segment.text}-${idx}`} className={segment.isHighlighted ? SEARCH_HIGHLIGHT_CLASS : undefined}>
          {segment.text}
        </span>
      ))}
      {preview.hiddenNote && (
        <span className="block pt-1 not-italic text-muted-foreground/70">{preview.hiddenNote}</span>
      )}
    </pre>
  );
};

const FullPayloadSheet: React.FC<{
  invocation: ToolInvocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ invocation, open, onOpenChange }) => {
  const result = invocation.result;
  // Structured payloads read better pretty-printed than parsed as markdown, and past a certain
  // size the markdown parse is slow enough to be worth an explicit opt-in
  const isStructured = result !== undefined && tryParseJson(result) !== undefined;
  const isHuge = (result?.length ?? 0) > MARKDOWN_LIMIT_CHARS;
  const [renderMarkdown, setRenderMarkdown] = useState(false);
  const showMarkdown = result !== undefined && !isStructured && (!isHuge || renderMarkdown);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[88vh] flex-col gap-0">
        <SheetHeader className="shrink-0 border-b pb-3">
          <SheetTitle className="flex items-center gap-2 font-mono text-sm">
            <Wrench className="h-4 w-4" />
            {invocation.name}
            {result !== undefined && (
              <span className="ml-auto text-[11px] font-normal tabular-nums text-muted-foreground">
                {formatPayloadSize(result)}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {result === undefined ? "No recorded result" : `Full result of the ${invocation.name} call`}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {invocation.args && (
            <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-xs">
              {prettify(invocation.args)}
            </pre>
          )}

          {result === undefined ? (
            <p className="text-xs italic text-muted-foreground">No result was recorded for this call.</p>
          ) : showMarkdown ? (
            <MarkdownContent content={result} />
          ) : (
            <>
              {isHuge && !isStructured && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 h-7 text-xs"
                  onClick={() => setRenderMarkdown(true)}
                >
                  Render as markdown
                </Button>
              )}
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {prettify(result)}
              </pre>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const ToolRow: React.FC<{ invocation: ToolInvocation }> = ({ invocation }) => {
  // Auto-expand when the search hit is inside this payload, or it stays invisible
  const [isExpanded, setIsExpanded] = useState(Boolean(invocation.highlightedResult));
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const argSummary = useMemo(() => summarizeArgs(invocation.args), [invocation.args]);
  const resultSummary = useMemo(() => summarizeResult(invocation.result), [invocation.result]);

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((open) => !open);
        }}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono text-xs font-medium">{invocation.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{argSummary}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{resultSummary}</span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
      </button>

      {isExpanded && (
        <div className="ml-5 mt-1 rounded-md border bg-muted/20">
          {invocation.args && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words border-b px-2 py-1.5 font-mono text-[11px] leading-relaxed">
              {prettify(invocation.args)}
            </pre>
          )}
          <div className="px-2 py-1.5">
            {invocation.result === undefined ? (
              <span className="text-[11px] italic text-muted-foreground">No result was recorded for this call.</span>
            ) : (
              <PayloadPreview text={invocation.result} highlighted={invocation.highlightedResult} />
            )}
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSheetOpen(true);
                }}
              >
                <Maximize2 className="mr-1 h-3 w-3" />
                full
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(invocation.result ?? "", `${invocation.name} result copied`);
                }}
              >
                copy
              </Button>
            </div>
          </div>
        </div>
      )}

      <FullPayloadSheet invocation={invocation} open={isSheetOpen} onOpenChange={setIsSheetOpen} />
    </div>
  );
};

export const ToolStrip: React.FC<{ invocations: ToolInvocation[] }> = ({ invocations }) => {
  const isGroupable = invocations.length > GROUP_THRESHOLD;
  const [isGroupOpen, setIsGroupOpen] = useState(!isGroupable);

  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    invocations.forEach(({ name }) => counts.set(name, (counts.get(name) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
      .join(" · ");
  }, [invocations]);

  const totalSize = useMemo(
    () => formatPayloadSize(invocations.map((invocation) => invocation.result ?? "").join("")),
    [invocations],
  );

  if (isGroupable && !isGroupOpen) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsGroupOpen(true);
        }}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono text-xs font-medium">{invocations.length} tools</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{breakdown}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{totalSize}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </button>
    );
  }

  return (
    <div className={cn("space-y-0.5", isGroupable && "rounded-md border-l-2 border-muted pl-1")}>
      {invocations.map((invocation) => (
        <ToolRow key={invocation.key} invocation={invocation} />
      ))}
    </div>
  );
};

export const ReasoningRow: React.FC<{ content: string }> = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((open) => !open);
        }}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono text-xs font-medium">reasoning</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {content.replace(/\s+/g, " ").trim()}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatPayloadSize(content)}</span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
      </button>

      {isExpanded && (
        <pre className="ml-5 mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {content}
        </pre>
      )}
    </div>
  );
};
