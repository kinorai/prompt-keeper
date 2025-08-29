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
