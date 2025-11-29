import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Bot,
  User,
  Clock,
  Check,
  Info,
  Trash2,
  MoreVertical,
  Share2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PanelLeftOpen,
  X,
  Maximize2,
} from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { ModelBadge } from "@/components/badges";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect, useRef, useMemo } from "react";
import { Streamdown } from "streamdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { copyToClipboard } from "@/lib/clipboard";
import { normalizeMarkdownCodeFenceLanguages } from "@/lib/markdown";
import { buildConversationMarkdown, buildConversationPlainText } from "@/lib/conversation";
import { injectHighlightHtml, splitHighlightSegments, SEARCH_HIGHLIGHT_CLASS } from "@/lib/search-highlights";

export interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  highlightedContent?: string;
  finish_reason?: string;
}

export interface ConversationCardProps {
  id: string;
  created_at: string;
  model: string;
  highlightedModel?: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  messages: Message[];
  onShowSidebar?: () => void;
  onDelete?: (id: string) => void; // Add onDelete callback
  variant?: "card" | "flat";
}

// Using shared helpers from lib/markdown and lib/clipboard

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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {showText && <span className="hidden sm:inline text-xs">{isCopied ? "Copied" : "Copy"}</span>}
    </Button>
  );
};

const MarkdownContent: React.FC<{
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
      <Streamdown className="sd-prose" remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizedContent}
      </Streamdown>
    </div>
  );
};

// ChatBubble component to render individual messages as chat bubbles
const ChatBubble: React.FC<{
  message: Message;
  modelName?: string;
}> = ({ message, modelName }) => {
  const [isSystemExpanded, setIsSystemExpanded] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  let bubbleBg = "";
  let icon = null;

  switch (message.role) {
    case "assistant":
      // Assistant should not be in a bubble (no background)
      bubbleBg = "";
      icon = <Bot className="h-4 w-4" />;
      break;
    case "user":
      // User bubble background must be #e9e9e980
      bubbleBg = "bg-[var(--pk-user-bubble-bg)]";
      icon = <User className="h-4 w-4" />;
      break;
    case "system":
      bubbleBg = "bg-gray-200 dark:bg-gray-800";
      icon = <Info className="h-4 w-4" />;
      break;
    default:
      bubbleBg = "bg-gray-50 dark:bg-gray-900";
  }

  const isSystemMessage = message.role === "system";
  const isAssistantMessage = message.role === "assistant";
  const isUserMessage = message.role === "user";
  const widthClass = isSystemMessage ? "w-full" : isAssistantMessage ? "w-full" : "max-w-[97%]";
  const bubbleClasses = isAssistantMessage ? "pr-8" : "rounded-lg p-1.5 shadow-xs pr-8"; // Add pr-8 to prevent copy button overlap

  // Separate content types
  const images = Array.isArray(message.content)
    ? message.content.filter((c) => c.type === "image_url" && c.image_url?.url)
    : [];
  const textContent = Array.isArray(message.content)
    ? message.content
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("\n")
    : typeof message.content === "string"
      ? message.content
      : "";

  return (
    <>
      <div className={`flex flex-col w-full ${isUserMessage ? "items-end" : "items-start"}`}>
        {/* Images - Outside bubble for User, Inside for others (if any) */}
        {images.length > 0 && (
          <div className={`flex flex-row flex-wrap gap-2 mb-1 ${isUserMessage ? "justify-end" : "justify-start"}`}>
            {images.map((item, idx) => (
              <div key={idx} className="relative group flex-shrink-0">
                <Image
                  width={500}
                  height={500}
                  src={item.image_url!.url}
                  alt="User uploaded content"
                  className="h-24 w-auto rounded-md border border-border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setFullscreenImage(item.image_url!.url)}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <Maximize2 className="h-5 w-5 text-white drop-shadow-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`relative ${widthClass} ${bubbleClasses} ${bubbleBg}`}>
          {/* Header: Only for Assistant (Model Name) and System */}
          {!isUserMessage && (
            <div className="flex items-center mb-1">
              {icon}
              <span className="ml-1 text-xs font-semibold">
                {isAssistantMessage ? (modelName || "ASSISTANT").toUpperCase() : message.role.toUpperCase()}
              </span>
              {isSystemMessage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSystemExpanded(!isSystemExpanded)}
                  className="ml-2 h-auto p-1 text-xs hover:bg-transparent"
                >
                  {isSystemExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {isSystemMessage && !isSystemExpanded ? (
            <div className="w-full block text-sm sm:text-base whitespace-nowrap overflow-hidden text-ellipsis pr-8">
              {(message.highlightedContent
                ? splitHighlightSegments(message.highlightedContent)
                : [{ text: textContent || "System message", isHighlighted: false }]
              ).map((segment, idx) => (
                <span
                  key={`${segment.text}-${idx}`}
                  className={segment.isHighlighted ? SEARCH_HIGHLIGHT_CLASS : undefined}
                >
                  {segment.text}
                </span>
              ))}
            </div>
          ) : (
            <MarkdownContent
              content={
                message.highlightedContent
                  ? injectHighlightHtml(message.highlightedContent, "font-semibold")
                  : textContent
              }
            />
          )}

          <div className="absolute top-1 right-1">
            <CopyButton
              text={textContent}
              showText={false}
              size="xs"
              successMessage={`${message.role} message copied`}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen Image Overlay */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setFullscreenImage(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <Image
            src={fullscreenImage}
            alt="Fullscreen view"
            width={500}
            height={500}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export const ConversationCard: React.FC<ConversationCardProps> = ({
  id,
  created_at,
  model,
  highlightedModel,
  messages = [],
  onShowSidebar,
  onDelete,
  variant = "card",
}) => {
  const createdDate = new Date(created_at);
  const cardRef = useRef<HTMLDivElement>(null); // Ref for the main card element
  const modelDisplay = highlightedModel
    ? splitHighlightSegments(highlightedModel).map((segment, idx) => (
        <span key={`model-hl-${idx}`} className={segment.isHighlighted ? SEARCH_HIGHLIGHT_CLASS : undefined}>
          {segment.text}
        </span>
      ))
    : model;
  const dropdownButtonRef = useRef<HTMLButtonElement>(null); // Ref for the dropdown button
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showContextDeleteConfirm, setShowContextDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Generate full conversation text for copying
  const getFullConversationText = () => buildConversationPlainText(messages);

  // Generate markdown for sharing
  const getShareableMarkdown = () => buildConversationMarkdown({ model, created_at: createdDate, messages });

  // Handle delete
  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/search/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Conversation deleted");
        onDelete(id);
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete conversation");
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      toast.error("Failed to delete conversation");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setShowContextDeleteConfirm(false);
    }
  };

  // Handle share
  const handleShare = async () => {
    const shareableText = getShareableMarkdown();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Conversation with ${model}`,
          text: shareableText,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          // Fallback to clipboard if share fails
          copyToClipboard(shareableText, "Conversation copied for sharing");
        }
      }
    } else {
      // Fallback to clipboard
      copyToClipboard(shareableText, "Conversation copied for sharing");
    }
  };

  // Function to handle the header click, using the passed handler if available
  const handleHeaderClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement;
    const isInteractiveElement =
      target.closest("button") ||
      target.closest("[role='button']") ||
      target.closest("[data-radix-collection-item]") || // Radix UI dropdown items
      target.closest("[data-state]") || // Radix UI popover/dropdown triggers
      target.closest(".lucide"); // Icons that might be clickable

    if (isInteractiveElement) {
      return;
    }

    if (cardRef.current) {
      // Fallback to simple scrollIntoView if no handler is provided
      cardRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  // Handle long press start
  const handleLongPressStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Don't prevent default here as it interferes with normal clicks
    longPressTimer.current = setTimeout(() => {
      setShowContextMenu(true);
      if ("touches" in e) {
        setContextMenuPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      } else {
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
      }
    }, 500); // 500ms for long press
  };

  // Handle long press end
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  // Reset context menu position when closing
  useEffect(() => {
    if (!showContextMenu) {
      setContextMenuPosition({ x: 0, y: 0 });
    }
  }, [showContextMenu]);

  // Handle click outside and escape key for context delete confirmation
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showContextDeleteConfirm) {
        const target = event.target as HTMLElement;
        // Check if click is outside the confirmation dialog
        if (!target.closest(".context-delete-confirmation") && !target.closest("button")) {
          setShowContextDeleteConfirm(false);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (showContextDeleteConfirm && event.key === "Escape") {
        setShowContextDeleteConfirm(false);
      }
    };

    if (showContextDeleteConfirm) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showContextDeleteConfirm]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className={cn("w-full relative", variant === "card" ? "" : "")}
      onContextMenu={handleContextMenu}
    >
      <div
        className={cn(
          "flex flex-row items-center justify-between space-y-0 pb-1 px-2 sm:px-3 pt-1 sm:pt-1 sticky z-[5] cursor-pointer",
          variant === "card"
            ? "top-[-8px] sm:top-[calc(var(--search-filters-height,_90px)-24px)] bg-background/95 backdrop-blur-sm border-b rounded-none sm:rounded-t-lg"
            : "top-0 bg-background/90",
        )}
        onClick={handleHeaderClick}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onMouseLeave={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 w-full">
          <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 mb-0 sm:mb-0">
            {onShowSidebar && (
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 h-7 w-7 hidden sm:inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowSidebar();
                }}
                aria-label="Show sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <ModelBadge>{modelDisplay}</ModelBadge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 cursor-help">
                    <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>
                      {formatDistanceToNow(createdDate, {
                        addSuffix: false,
                      })
                        .replace("about ", "")
                        .replace(/ years?/g, "y")
                        .replace(/ months?/g, "mo")
                        .replace(/ weeks?/g, "w")
                        .replace(/ days?/g, "d")
                        .replace(/ hours?/g, "h")
                        .replace(/ minutes?/g, "m")
                        .replace(/ seconds?/g, "s")}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{createdDate.toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CopyButton text={getFullConversationText()} successMessage="Conversation copied to clipboard" />
          <Popover open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 py-1 bg-muted/50 hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="font-medium text-sm">Delete conversation?</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This will permanently delete the conversation with {model}. This action cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu open={showContextMenu} onOpenChange={setShowContextMenu}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={dropdownButtonRef}
                variant="secondary"
                size="sm"
                className="h-7 px-2 py-1 bg-muted/50 hover:bg-muted/80"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              style={
                showContextMenu && contextMenuPosition.x > 0
                  ? {
                      position: "fixed",
                      left: contextMenuPosition.x,
                      top: contextMenuPosition.y,
                    }
                  : undefined
              }
            >
              <DropdownMenuItem
                onClick={() => copyToClipboard(getFullConversationText(), "Conversation copied to clipboard")}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setShowContextDeleteConfirm(true);
                  setShowContextMenu(false); // Close the dropdown first
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className={cn("px-2 sm:px-3 py-0.5 sm:py-1 pb-1 sm:pb-2", variant === "card" ? "" : "")}>
        <div className="space-y-3">
          {messages.map((message, index) => (
            <ChatBubble key={`message-${index}`} message={message} modelName={model} />
          ))}
        </div>
      </div>

      {/* Context menu delete confirmation - positioned independently */}
      {showContextDeleteConfirm && (
        <div
          className="context-delete-confirmation fixed z-50 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none"
          style={{
            left: dropdownButtonRef.current
              ? Math.max(10, dropdownButtonRef.current.getBoundingClientRect().right - 320)
              : 10,
            top: dropdownButtonRef.current ? dropdownButtonRef.current.getBoundingClientRect().bottom + 5 : 10,
          }}
        >
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1">
              <div>
                <p className="font-medium text-sm">Delete conversation?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently delete the conversation with {model}. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowContextDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
