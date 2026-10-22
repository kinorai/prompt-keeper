"use client";

import { useEffect, useMemo, useRef } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { PluggableList, Plugin } from "unified";
import { toast } from "sonner";

import { MARKDOWN_HARDEN_OPTIONS, normalizeMarkdownCodeFenceLanguages } from "@/lib/markdown";
import { SEARCH_HIGHLIGHT_STRONG_CLASS } from "@/lib/search-highlights";

// `singleDollarTextMath: false` keeps currency out of KaTeX. Payloads are full of amounts like
// "0 $ et +" / "2500 $", and with the default a pair of them is parsed as inline math: the text
// between is swallowed, rendered as a formula, and any table it was part of falls apart.
// Block math still works with $$…$$.
const REMARK_PLUGINS: PluggableList = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];

// A custom rehypePlugins list replaces Streamdown's defaults, so keep raw → sanitize → harden and append
// KaTeX after them. Message content is attacker-controlled (anyone with a LiteLLM key writes it), so raw
// HTML must never render without the sanitizer. The schema is widened only for the search-hit <strong>.
const [rehypeSanitize, sanitizeSchema] = defaultRehypePlugins.sanitize as [Plugin, Record<string, unknown>];
const [rehypeHarden] = defaultRehypePlugins.harden as [Plugin, unknown];
const sanitizeAttributes = sanitizeSchema.attributes as Record<string, unknown[]> | undefined;
const REHYPE_PLUGINS: PluggableList = [
  defaultRehypePlugins.raw,
  [
    rehypeSanitize,
    {
      ...sanitizeSchema,
      attributes: {
        ...sanitizeAttributes,
        strong: [...(sanitizeAttributes?.strong ?? []), ["className", SEARCH_HIGHLIGHT_STRONG_CLASS]],
      },
    },
  ],
  [rehypeHarden, MARKDOWN_HARDEN_OPTIONS],
  rehypeKatex,
];

export const MarkdownContent: React.FC<{
  content: string;
}> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inlineCopyTimersRef = useRef<WeakMap<HTMLElement, number>>(new WeakMap());
  const normalizedContent = useMemo(() => normalizeMarkdownCodeFenceLanguages(content), [content]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const timersMap = inlineCopyTimersRef.current;

    // Add copy buttons to code blocks, guarding against duplicates
    const codeBlocks = container.querySelectorAll("pre code");
    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      if (!pre) return;
      if (pre.querySelector(".pk-copy-btn-container")) return;

      const buttonContainer = document.createElement("div");
      buttonContainer.className = "absolute top-2 right-2 pk-copy-btn-container";

      const copyButton = document.createElement("button");
      copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      copyButton.className = "p-1 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground";
      copyButton.title = "Copy code";

      copyButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = codeBlock.textContent || "";
        navigator.clipboard.writeText(code).then(() => {
          copyButton.innerHTML = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-check\"><path d=\"M20 6 9 17l-5-5\"/></svg>`;
          copyButton.className = "p-1 rounded-md bg-green-500/20 hover:bg-green-500/30 text-green-500";

          window.setTimeout(() => {
            copyButton.innerHTML = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-copy\"><rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/></svg>`;
            copyButton.className = "p-1 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground";
          }, 1500);
        });
      });

      buttonContainer.appendChild(copyButton);
      pre.style.position = "relative";
      pre.appendChild(buttonContainer);
    });

    // Event delegation for inline code copy
    const handleInlineCodeClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeElement = target.closest("code") as HTMLElement | null;
      if (!codeElement) return;
      if (codeElement.closest("pre")) return; // ignore code blocks

      e.preventDefault();
      e.stopPropagation();

      // Clear any previous highlight and timers
      container.querySelectorAll("code.__pk_copied").forEach((el) => {
        const htmlEl = el as HTMLElement;
        const timerId = timersMap.get(htmlEl);
        if (timerId) {
          window.clearTimeout(timerId);
          timersMap.delete(htmlEl);
        }
        htmlEl.style.backgroundColor = "";
        htmlEl.style.color = "";
        htmlEl.classList.remove("__pk_copied");
      });

      const code = codeElement.textContent || "";
      navigator.clipboard.writeText(code).then(() => {
        codeElement.classList.add("__pk_copied");
        codeElement.style.backgroundColor = "rgba(34, 197, 94, 0.2)";
        codeElement.style.color = "rgb(34, 197, 94)";

        const timerId = window.setTimeout(() => {
          codeElement.style.backgroundColor = "";
          codeElement.style.color = "";
          codeElement.classList.remove("__pk_copied");
          timersMap.delete(codeElement);
        }, 1500);
        timersMap.set(codeElement, timerId);

        toast.success("Code copied to clipboard");
      });
    };

    container.addEventListener("click", handleInlineCodeClick);

    return () => {
      container.removeEventListener("click", handleInlineCodeClick);
      container.querySelectorAll("code.__pk_copied").forEach((el) => {
        const htmlEl = el as HTMLElement;
        const timerId = timersMap.get(htmlEl);
        if (timerId) {
          window.clearTimeout(timerId);
          timersMap.delete(htmlEl);
        }
        htmlEl.style.backgroundColor = "";
        htmlEl.style.color = "";
        htmlEl.classList.remove("__pk_copied");
      });
    };
  }, [content]);

  return (
    <div ref={containerRef} className="dark:prose-invert max-w-none prose-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
      <Streamdown className="sd-prose" remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {normalizedContent}
      </Streamdown>
    </div>
  );
};
