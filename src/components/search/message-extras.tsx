"use client";

import { AudioLines, Ban, FileText, Link2, Paperclip } from "lucide-react";

import type { Message } from "@/components/search/conversation-card";

/**
 * Payloads a message can carry besides text: web-search citations, refusals, audio, generated
 * images, and non-text content parts. Each of these previously rendered as nothing at all.
 */

interface Annotation {
  type?: string;
  url_citation?: { url?: string; title?: string };
}

interface AudioResponse {
  transcript?: string;
  id?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
    {children}
  </span>
);

const Citations: React.FC<{ annotations: unknown[] }> = ({ annotations }) => {
  const citations = annotations
    .filter(isRecord)
    .map((annotation) => (annotation as Annotation).url_citation)
    .filter((citation): citation is { url?: string; title?: string } => Boolean(citation?.url));

  if (citations.length === 0) return null;

  return (
    <ol className="mt-1 space-y-0.5">
      {citations.map((citation, idx) => (
        <li key={`${citation.url}-${idx}`} className="flex items-start gap-1.5 text-xs">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-muted-foreground underline-offset-2 hover:underline"
          >
            {citation.title || citation.url}
          </a>
        </li>
      ))}
    </ol>
  );
};

/** Content parts other than text and image_url, which the bubble renders on its own. */
const OtherContentParts: React.FC<{ content: Message["content"] }> = ({ content }) => {
  if (!Array.isArray(content)) return null;

  const parts = (content as unknown[])
    .filter(isRecord)
    .filter((part) => part.type !== "text" && part.type !== "image_url");
  if (parts.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {parts.map((part, idx) => {
        const type = typeof part.type === "string" ? part.type : "part";
        const file = isRecord(part.file) ? part.file : undefined;
        const label = typeof file?.filename === "string" ? file.filename : type;

        return (
          <Chip key={`${type}-${idx}`}>
            {type === "file" ? <Paperclip className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
            {label}
          </Chip>
        );
      })}
    </div>
  );
};

export const MessageExtras: React.FC<{ message: Message }> = ({ message }) => {
  const audio = isRecord(message.audio) ? (message.audio as AudioResponse) : undefined;
  const images = Array.isArray(message.images) ? message.images : [];
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];

  const hasAnything =
    Boolean(message.refusal) ||
    Boolean(audio) ||
    images.length > 0 ||
    annotations.length > 0 ||
    Array.isArray(message.content);

  if (!hasAnything) return null;

  return (
    <>
      {message.refusal && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
          <Ban className="mt-0.5 h-3 w-3 shrink-0" />
          {message.refusal}
        </p>
      )}

      {audio && (
        <div className="mt-1">
          <Chip>
            <AudioLines className="h-3 w-3" />
            audio{audio.transcript ? " · transcript" : ""}
          </Chip>
          {audio.transcript && <p className="mt-1 text-xs text-muted-foreground">{audio.transcript}</p>}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {images.map((_, idx) => (
            <Chip key={`image-${idx}`}>
              <FileText className="h-3 w-3" />
              generated image {idx + 1}
            </Chip>
          ))}
        </div>
      )}

      <OtherContentParts content={message.content} />
      {annotations.length > 0 && <Citations annotations={annotations} />}
    </>
  );
};
