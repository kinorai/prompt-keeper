import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  FileJson,
  MessageSquare,
  Bot,
  User,
  Clock,
  Zap,
  Award,
  Check,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ConversationCardProps {
  conversation: {
    _source: {
      timestamp: string;
      model: string;
      messages: Array<{
        role: string;
        content: string;
      }>;
      usage: {
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
      };
      latency: number;
      raw_response: JSON;
    };
    _score?: number;
    highlight?: {
      "messages.content": string[];
    };
  };
}

// Custom component to handle markdown with highlighted HTML
const MarkdownWithHighlight = ({
  content,
  isHighlighted = false,
}: {
  content: string;
  isHighlighted?: boolean;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Add copy buttons to code blocks and handle inline code clicks
  useEffect(() => {
    if (!contentRef.current) return;

    // Add copy buttons to code blocks
    const codeBlocks = contentRef.current.querySelectorAll("pre");

    codeBlocks.forEach((codeBlock) => {
      // Skip if already has a copy button
      if (codeBlock.querySelector(".code-copy-button")) return;

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.className =
        "code-copy-button absolute top-2 right-2 p-1 rounded-md bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors";
      copyButton.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

      // Add click handler
      copyButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get code content
        const code = codeBlock.querySelector("code");
        if (!code) return;

        // Copy to clipboard
        navigator.clipboard
          .writeText(code.textContent || "")
          .then(() => {
            // Show success state
            copyButton.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

            // Reset after 2 seconds
            setTimeout(() => {
              copyButton.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
            }, 2000);
          })
          .catch((err) => console.error("Failed to copy code:", err));
      });

      // Add button to code block
      codeBlock.style.position = "relative";
      codeBlock.appendChild(copyButton);
    });

    // Make inline code clickable for copying
    const inlineCodes = contentRef.current.querySelectorAll(
      "p > code, li > code, h1 > code, h2 > code, h3 > code, h4 > code"
    );

    inlineCodes.forEach((codeElement) => {
      // Add cursor pointer and hover effect
      codeElement.classList.add(
        "cursor-pointer",
        "hover:bg-muted-foreground/20",
        "transition-colors"
      );

      // Add click handler
      codeElement.addEventListener("click", () => {
        const codeText = codeElement.textContent || "";

        // Copy to clipboard
        navigator.clipboard
          .writeText(codeText)
          .then(() => {
            // Show success state
            const htmlElement = codeElement as HTMLElement;
            const originalBg = htmlElement.style.backgroundColor;
            const originalColor = htmlElement.style.color;

            htmlElement.style.backgroundColor = "hsl(var(--primary) / 0.2)";
            htmlElement.style.color = "hsl(var(--primary))";

            // Reset after 1 second
            setTimeout(() => {
              htmlElement.style.backgroundColor = originalBg;
              htmlElement.style.color = originalColor;
            }, 1000);
          })
          .catch((err) => console.error("Failed to copy inline code:", err));
      });
    });
  }, [content, isHighlighted]);

  if (isHighlighted) {
    // For highlighted content, we need to use dangerouslySetInnerHTML
    // because OpenSearch returns HTML with <em> tags for highlighting
    return (
      <div
        ref={contentRef}
        className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // For regular content, use ReactMarkdown
  return (
    <div
      ref={contentRef}
      className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};

export function ConversationCard({ conversation }: ConversationCardProps) {
  const { _source: source, _score, highlight } = conversation;
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const copyFullConversation = async () => {
    try {
      const text = source.messages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error("Failed to copy full conversation:", err);
    }
  };

  // Helper function to get the appropriate icon for each role
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "assistant":
        return <Bot className="h-3 w-3" />;
      case "user":
        return <User className="h-3 w-3" />;
      case "system":
        return <Info className="h-3 w-3" />;
      default:
        return <MessageSquare className="h-3 w-3" />;
    }
  };

  // Helper function to get the appropriate style for each role
  const getRoleStyle = (role: string) => {
    switch (role) {
      case "assistant":
        return "text-primary bg-primary/10 border-primary/20";
      case "system":
        return "text-orange-500 bg-orange-100/30 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/30";
      default:
        return "text-muted-foreground bg-muted/20";
    }
  };

  // Helper function to get the appropriate background for each role
  const getRoleBackground = (role: string) => {
    switch (role) {
      case "assistant":
        return "bg-muted/10";
      case "system":
        return "bg-orange-50/30 dark:bg-orange-900/10";
      default:
        return "bg-background";
    }
  };

  // Helper function to render content with proper markdown and highlighting
  const renderContent = (message: { role: string; content: string }) => {
    // Check if this message has highlighted content
    const isHighlighted =
      highlight &&
      highlight["messages.content"] &&
      message.role === "assistant";

    if (isHighlighted) {
      return (
        <MarkdownWithHighlight
          content={highlight["messages.content"].join("\n")}
          isHighlighted={true}
        />
      );
    }

    return <MarkdownWithHighlight content={message.content} />;
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm transition-all hover:shadow-md overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b p-3 sm:p-4 bg-muted/10">
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-background text-xs"
                >
                  <MessageSquare className="h-3 w-3" />
                  {source.model}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Model</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-background text-xs"
                >
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(source.timestamp), {
                    addSuffix: true,
                  })}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Time</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                >
                  <Zap className="h-3 w-3" />
                  {source.usage?.total_tokens || "n/a"} tokens
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Prompt: {source.usage?.prompt_tokens || "n/a"} | Completion:{" "}
                {source.usage?.completion_tokens || "n/a"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {source.latency && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                  >
                    <Clock className="h-3 w-3" />
                    {source.latency}ms
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Latency</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {_score && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs"
                  >
                    <Award className="h-3 w-3" />
                    {_score.toFixed(2)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Match Score</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex gap-2 mt-2 sm:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={copyFullConversation}
            className="h-7 sm:h-8 text-xs rounded-full bg-background"
          >
            {copiedAll ? (
              <>
                <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1 text-green-500" />
                <span className="text-green-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" />
                Copy All
              </>
            )}
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 sm:h-8 text-xs rounded-full bg-background"
              >
                <FileJson className="h-3 sm:h-3.5 w-3 sm:w-3.5 mr-1" />
                Raw JSON
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-4xl max-h-[80vh] p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Raw Response</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto max-h-[calc(80vh-8rem)]">
                <pre className="bg-muted p-3 sm:p-4 rounded-lg text-xs">
                  <code>{JSON.stringify(source.raw_response, null, 2)}</code>
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Collapsible
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className="space-y-0"
      >
        <div className="space-y-0 divide-y divide-border/40">
          {source.messages
            .slice(0, isExpanded ? undefined : 2)
            .map((message, i) => (
              <div
                key={i}
                className={cn("p-3 sm:p-5", getRoleBackground(message.role))}
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs",
                      getRoleStyle(message.role)
                    )}
                  >
                    {getRoleIcon(message.role)}
                    {message.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                    onClick={() => copyToClipboard(message.content, i)}
                  >
                    {copiedIndex === i ? (
                      <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                    )}
                  </Button>
                </div>
                {renderContent(message)}
              </div>
            ))}
        </div>

        {source.messages.length > 2 && (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full rounded-none border-t h-8 sm:h-9 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {isExpanded
                ? "Show Less"
                : `Show ${source.messages.length - 2} More Messages`}
            </Button>
          </CollapsibleTrigger>
        )}

        <CollapsibleContent className="space-y-0 divide-y divide-border/40">
          {source.messages.slice(2).map((message, i) => (
            <div
              key={i + 2}
              className={cn("p-3 sm:p-5", getRoleBackground(message.role))}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs",
                    getRoleStyle(message.role)
                  )}
                >
                  {getRoleIcon(message.role)}
                  {message.role}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                  onClick={() => copyToClipboard(message.content, i + 2)}
                >
                  {copiedIndex === i + 2 ? (
                    <Check className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  )}
                </Button>
              </div>
              {renderContent(message)}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
