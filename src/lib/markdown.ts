// Normalize unsupported code fence languages to supported aliases for the highlighter
export const normalizeMarkdownCodeFenceLanguages = (markdown: string): string => {
  const languageAliasMap: Record<string, string> = {
    typescriptreact: "tsx",
    javascriptreact: "jsx",
  };

  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("```") || trimmed === "```") continue;

    const backtickIndex = line.indexOf("```");
    const before = line.slice(0, backtickIndex + 3);
    const after = line.slice(backtickIndex + 3);
    const infoString = after.trim();
    if (infoString.length === 0) continue;

    const firstSpaceIdx = infoString.indexOf(" ");
    const languageId = (firstSpaceIdx === -1 ? infoString : infoString.slice(0, firstSpaceIdx)).toLowerCase();

    if (languageAliasMap[languageId]) {
      const alias = languageAliasMap[languageId];
      const rest = firstSpaceIdx === -1 ? "" : infoString.slice(firstSpaceIdx);
      lines[i] = `${before}${alias}${rest}`;
    }
  }

  return lines.join("\n");
};

// Stand-in origin for path-relative URLs: rehype-harden needs one to check image prefixes, and the real
// origin isn't known during SSR. A relative src resolves against it and is emitted relative again.
const SAME_ORIGIN_PLACEHOLDER = "https://same-origin.invalid";

// Streamdown's default harden options let markdown images load from any host. Message content comes
// from callers, so an image URL in it would leak the viewer's IP and viewing times to whoever stored it.
// Markdown images may only be data: images or same-origin paths; any other image renders as a
// "[Image blocked]" note. Uploaded images are presigned and shown by the conversation card, not here.
export const MARKDOWN_HARDEN_OPTIONS = {
  defaultOrigin: SAME_ORIGIN_PLACEHOLDER,
  allowedImagePrefixes: [`${SAME_ORIGIN_PLACEHOLDER}/`],
  allowDataImages: true,
  allowedLinkPrefixes: ["*"],
  allowedProtocols: ["*"],
};
