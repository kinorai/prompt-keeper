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
  Eye,
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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { toast } from "sonner";

interface Message {
  role: string;
  content: string;
  finish_reason?: string;
}

export interface ConversationCardProps {
  id: string;
  created: string;
  model: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  messages: Message[];
  raw_response: any;
  highlight?: {
    model?: string[];
    "messages.content"?: string[];
  };
  score?: number;
}

const MarkdownWithHighlight: React.FC<{
  content: string;
  isHighlighted?: boolean;
}> = ({ content, isHighlighted = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Process code blocks
    const codeBlocks = containerRef.current.querySelectorAll("pre code");
    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      if (!pre) return;

      // Create copy button container
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "absolute top-2 right-2";

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      copyButton.className =
        "p-1 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground";
      copyButton.title = "Copy code";

      // Add click event to copy code
      copyButton.addEventListener("click", () => {
        const code = codeBlock.textContent || "";
        navigator.clipboard.writeText(code).then(() => {
          copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`;
          copyButton.className =
            "p-1 rounded-md bg-green-500/20 hover:bg-green-500/30 text-green-500";

          setTimeout(() => {
            copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
            copyButton.className =
              "p-1 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground";
          }, 2000);
        });
      });

      buttonContainer.appendChild(copyButton);

      // Make pre position relative for absolute positioning of button
      pre.style.position = "relative";
      pre.appendChild(buttonContainer);
    });

    // Process inline code
    const inlineCodes =
      containerRef.current.querySelectorAll("code:not(pre code)");
    inlineCodes.forEach((inlineCode) => {
      const codeElement = inlineCode as HTMLElement;
      codeElement.style.cursor = "pointer";
      codeElement.title = "Click to copy";

      codeElement.addEventListener("click", () => {
        const code = codeElement.textContent || "";
        navigator.clipboard.writeText(code).then(() => {
          const originalBg = codeElement.style.backgroundColor;
          const originalColor = codeElement.style.color;

          codeElement.style.backgroundColor = "rgba(34, 197, 94, 0.2)";
          codeElement.style.color = "rgb(34, 197, 94)";

          setTimeout(() => {
            codeElement.style.backgroundColor = originalBg;
            codeElement.style.color = originalColor;
          }, 2000);

          toast.success("Code copied to clipboard");
        });
      });
    });
  }, [content]);

  // Process highlighted content to preserve markdown formatting
  let processedContent = content;

  // First check if content already contains our markers directly
  if (
    content.includes("HIGHLIGHT_START") &&
    content.includes("HIGHLIGHT_END")
  ) {
    // No need to process further, the content already has our markers
    console.debug("Direct highlight markers found and processed");
  }
  // Check for <em> tags from OpenSearch highlighting
  else if (isHighlighted && content.includes("<em>")) {
    // Replace <em> tags with a custom marker that won't interfere with markdown
    // Make sure we handle the case where the text might already contain our markers
    processedContent = content
      .replace(/<em>/g, "HIGHLIGHT_START")
      .replace(/<\/em>/g, "HIGHLIGHT_END");
  }

  return (
    <div ref={containerRef} className="prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";

            // Check if the code block contains our highlight markers
            const childrenStr = String(children).replace(/\n$/, "");
            if (inline && childrenStr.includes("HIGHLIGHT_START")) {
              // For inline code, we can use the mark tag
              const parts = childrenStr.split(
                /(HIGHLIGHT_START|HIGHLIGHT_END)/g
              );
              let isHighlight = false;
              const elements = parts
                .map((part, index) => {
                  if (part === "HIGHLIGHT_START") {
                    isHighlight = true;
                    return null;
                  } else if (part === "HIGHLIGHT_END") {
                    isHighlight = false;
                    return null;
                  } else if (isHighlight) {
                    return <mark key={index}>{part}</mark>;
                  } else {
                    return part;
                  }
                })
                .filter(Boolean);

              return (
                <code className={className} {...props}>
                  {elements}
                </code>
              );
            }

            if (!inline && language) {
              // For code blocks, we'll just remove the markers and let syntax highlighting work
              const cleanedCode = String(children)
                .replace(/HIGHLIGHT_START/g, "")
                .replace(/HIGHLIGHT_END/g, "");

              return (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  PreTag="div"
                  className="rounded-md"
                  {...props}
                >
                  {cleanedCode}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          p({ node, children, ...props }: any) {
            // Process our custom highlight markers
            if (
              typeof children === "string" &&
              (children.includes("HIGHLIGHT_START") ||
                (Array.isArray(children) &&
                  children.some(
                    (child) =>
                      typeof child === "string" &&
                      child.includes("HIGHLIGHT_START")
                  )))
            ) {
              // For string content, split by our markers and process
              const processContent = (content: string) => {
                const parts = content.split(/(HIGHLIGHT_START|HIGHLIGHT_END)/g);
                let isHighlight = false;
                return parts
                  .map((part, index) => {
                    if (part === "HIGHLIGHT_START") {
                      isHighlight = true;
                      return null;
                    } else if (part === "HIGHLIGHT_END") {
                      isHighlight = false;
                      return null;
                    } else if (isHighlight) {
                      return <mark key={index}>{part}</mark>;
                    } else {
                      return part;
                    }
                  })
                  .filter(Boolean);
              };

              // Handle both string and array children
              if (typeof children === "string") {
                return <p {...props}>{processContent(children)}</p>;
              } else if (Array.isArray(children)) {
                const processedChildren = (children as React.ReactNode[]).map(
                  (child: React.ReactNode, idx: number) => {
                    if (
                      typeof child === "string" &&
                      child.includes("HIGHLIGHT_START")
                    ) {
                      return processContent(child);
                    }
                    return child;
                  }
                );
                return <p {...props}>{processedChildren}</p>;
              }
            }

            return <p {...props}>{children}</p>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export const ConversationCard: React.FC<ConversationCardProps> = ({
  id,
  created,
  model,
  usage,
  messages = [],
  raw_response,
  highlight,
  score,
}) => {
  const [showRawResponse, setShowRawResponse] = useState(false);
  const createdDate = new Date(created);

  const copyRawResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(raw_response, null, 2));
    toast.success("Raw response copied to clipboard");
  };

  // Group messages by role for display
  const userMessages = messages.filter((msg) => msg.role === "user");
  const assistantMessages = messages.filter((msg) => msg.role === "assistant");

  // Function to render message content with highlighting if available
  const renderContent = (message: Message, index: number) => {
    // Check if the message content already contains highlight markers
    if (
      message.content.includes("HIGHLIGHT_START") &&
      message.content.includes("HIGHLIGHT_END")
    ) {
      return (
        <MarkdownWithHighlight content={message.content} isHighlighted={true} />
      );
    }

    // Check if we have highlighted content for this message from the API
    const hasHighlight =
      highlight &&
      highlight["messages.content"] &&
      Array.isArray(highlight["messages.content"]) &&
      highlight["messages.content"].some(
        (h) =>
          typeof h === "string" &&
          h.includes(`<em>`) &&
          message.content.includes(h.replace(/<\/?em>/g, ""))
      );

    // If we have highlighted content, use it
    if (hasHighlight && highlight?.["messages.content"]) {
      // Find the highlight that matches this message
      const matchingHighlight = highlight["messages.content"].find(
        (h) =>
          typeof h === "string" &&
          message.content.includes(h.replace(/<\/?em>/g, ""))
      );

      if (matchingHighlight) {
        return (
          <MarkdownWithHighlight
            content={matchingHighlight}
            isHighlighted={true}
          />
        );
      }
    }

    // Otherwise use the original content
    return <MarkdownWithHighlight content={message.content} />;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 w-full">
          <div className="flex items-center flex-wrap gap-2 mb-1 sm:mb-0">
            <Badge variant="outline" className="font-medium">
              {model}
            </Badge>
            {usage?.total_tokens !== undefined && (
              <Badge
                variant="outline"
                className="font-medium"
              >{`${usage.total_tokens} tokens`}</Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {formatDistanceToNow(createdDate, {
                        addSuffix: false,
                      }).replace("about ", "")}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{createdDate.toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {score && (
              <Badge variant="outline" className="bg-primary/10 font-medium">
                Score: {score.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRawResponse(!showRawResponse)}
          title={showRawResponse ? "Hide raw response" : "Show raw response"}
          className="ml-2 whitespace-nowrap flex items-center gap-1"
        >
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">
            {showRawResponse ? "Hide Raw" : "View Raw"}
          </span>
        </Button>
      </CardHeader>
      <CardContent>
        {showRawResponse ? (
          <div className="relative">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Raw Response</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyRawResponse}
                className="flex items-center gap-1"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <div className="max-h-96 overflow-auto rounded-md bg-muted p-4">
              <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                {typeof raw_response === "string"
                  ? raw_response
                  : JSON.stringify(raw_response, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {userMessages.map((message, index) => (
              <div
                key={`user-${index}`}
                className="space-y-2 p-3 rounded-lg bg-muted/30"
              >
                <div className="flex items-center mb-1">
                  <Badge variant="secondary" className="mr-2 px-2 py-0.5">
                    <User className="h-3 w-3 mr-1" />
                    User
                  </Badge>
                </div>
                {renderContent(message, index)}
              </div>
            ))}

            {assistantMessages.map((message, index) => (
              <div
                key={`assistant-${index}`}
                className="space-y-2 p-3 rounded-lg bg-primary/5"
              >
                <div className="flex items-center mb-1">
                  <Badge variant="default" className="mr-2 px-2 py-0.5">
                    <Bot className="h-3 w-3 mr-1" />
                    Assistant
                  </Badge>
                </div>
                {renderContent(message, index)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2 flex justify-between items-center text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>ID: {id.substring(0, 8)}...</span>
          {usage && (
            <div className="flex items-center gap-1">
              <span>•</span>
              <span>Prompt: {usage.prompt_tokens || 0}</span>
              <span>•</span>
              <span>Completion: {usage.completion_tokens || 0}</span>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};
