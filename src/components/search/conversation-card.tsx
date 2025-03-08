import { formatDistanceToNow } from "date-fns";
import { Copy, Bot, User, Clock, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

// Define custom types for ReactMarkdown components
interface CodeProps {
  inline?: boolean;
  className?: string;
  children: ReactNode;
  [key: string]: unknown;
}

export interface Message {
  role: string;
  content: string;
  finish_reason?: string;
}

interface Highlight {
  "messages.content"?: string[];
  model?: string[];
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
  score?: number;
  highlight?: Highlight;
}

// Helper function to copy text to clipboard
const copyToClipboard = (
  text: string,
  successMessage: string = "Copied to clipboard",
) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast.success(successMessage);
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      toast.error("Failed to copy to clipboard");
    });
};

// Component for copy button
const CopyButton = ({
  text,
  className = "",
  showText = true,
  successMessage = "Copied to clipboard",
  size = "sm",
}: {
  text: string;
  className?: string;
  showText?: boolean;
  successMessage?: string;
  size?: "xs" | "sm" | "md";
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(text, successMessage);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const sizeClasses = {
    xs: "h-6 w-6 p-1 sm:p-1",
    sm: "h-7 px-2 py-1",
    md: "h-8 px-3 py-1.5",
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleCopy}
      className={cn(
        "flex items-center justify-center gap-1 bg-muted/50 hover:bg-muted/80",
        sizeClasses[size],
        className,
      )}
    >
      {isCopied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {showText && (
        <span className="hidden sm:inline text-xs">
          {isCopied ? "Copied" : "Copy"}
        </span>
      )}
    </Button>
  );
};

// Component to render content with OpenSearch highlights
const HighlightedContent: React.FC<{
  content: string;
  highlightedContent?: string;
}> = ({ content, highlightedContent }) => {
  return <MarkdownContent content={highlightedContent || content} />;
};

const MarkdownContent: React.FC<{
  content: string;
}> = ({ content }) => {
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

  return (
    <div ref={containerRef} className="prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // @ts-expect-error - ReactMarkdown types are incompatible with our custom types
          code({ inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";

            // Simple code block rendering without syntax highlighting
            if (!inline && language) {
              return (
                <pre className="rounded-md p-4 bg-muted/30 overflow-auto">
                  <code className={className} {...props}>
                    {String(children).replace(/\n$/, "")}
                  </code>
                </pre>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// ChatBubble component to render individual messages as chat bubbles
const ChatBubble: React.FC<{
  message: Message;
  index: number;
  highlightedContent?: string;
}> = ({ message, highlightedContent }) => {
  let alignmentClass = "";
  let bubbleBg = "";
  let icon = null;

  switch (message.role) {
    case "assistant":
      alignmentClass = "justify-start";
      bubbleBg = "bg-blue-50 dark:bg-blue-900/30";
      icon = <Bot className="h-4 w-4" />;
      break;
    case "user":
      alignmentClass = "justify-end";
      bubbleBg = "bg-green-50 dark:bg-green-900/30";
      icon = <User className="h-4 w-4" />;
      break;
    case "system":
      alignmentClass = "justify-center";
      bubbleBg = "bg-gray-200 dark:bg-gray-800";
      icon = <Info className="h-4 w-4" />;
      break;
    default:
      alignmentClass = "justify-start";
      bubbleBg = "bg-gray-50 dark:bg-gray-900";
  }

  return (
    <div className={`flex ${alignmentClass} my-2`}>
      <div
        className={`relative max-w-[97%] rounded-lg p-3 ${bubbleBg} shadow-sm`}
      >
        <div className="flex items-center mb-2">
          {icon}
          <span className="ml-1 text-xs font-semibold">
            {message.role.toUpperCase()}
          </span>
        </div>
        <HighlightedContent
          content={message.content}
          highlightedContent={highlightedContent}
        />
        <div className="absolute top-2 right-2">
          <CopyButton
            text={message.content}
            showText={false}
            size="xs"
            successMessage={`${message.role} message copied`}
          />
        </div>
      </div>
    </div>
  );
};

export const ConversationCard: React.FC<ConversationCardProps> = ({
  created,
  model,
  usage,
  messages = [],
  score,
  highlight,
}) => {
  const createdDate = new Date(created);

  // Generate full conversation text for copying
  const getFullConversationText = () => {
    return messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join("\n\n");
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-2 sm:px-6 pt-2 sm:pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 w-full">
          <div className="flex items-center flex-wrap gap-1 sm:gap-2 mb-0.5 sm:mb-0">
            <Badge
              variant="outline"
              className="font-medium text-xs sm:text-sm py-0.5"
            >
              {model}
            </Badge>
            {usage?.total_tokens !== undefined && (
              <Badge
                variant="outline"
                className="font-medium text-xs sm:text-sm py-0.5"
              >{`${usage.total_tokens} tokens`}</Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
              <Badge
                variant="outline"
                className="bg-primary/10 font-medium text-xs sm:text-sm py-0.5"
              >
                Score: {score.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CopyButton
            text={getFullConversationText()}
            successMessage="Conversation copied to clipboard"
          />
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6 py-1.5 sm:py-4 pb-3 sm:pb-6">
        <div className="space-y-2 sm:space-y-4">
          {messages.map((message, index) => {
            const highlightedContent = highlight?.["messages.content"]?.[index];
            return (
              <ChatBubble
                key={`message-${index}`}
                message={message}
                index={index}
                highlightedContent={highlightedContent}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
