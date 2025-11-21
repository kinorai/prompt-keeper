"use client";

import { useMemo } from "react";
import { ModelBadge } from "@/components/badges";
import { cn } from "@/lib/utils";
import { Copy, MessageSquare, Share2, Trash2 } from "lucide-react";
import { KebabMenu } from "@/components/kebab-menu";
import { format, isSameDay, isThisWeek, isYesterday } from "date-fns";
import { copyToClipboard } from "@/lib/clipboard";
import { buildConversationMarkdown, buildConversationPlainText, extractTextFromContent } from "@/lib/conversation";

import { toast } from "sonner";
import { splitHighlightSegments, SEARCH_HIGHLIGHT_CLASS } from "@/lib/search-highlights";

export interface ConversationListItemProps {
  id: string;
  created: string; // ISO date
  model: string;
  highlightedModel?: string;
  highlightSnippet?: string;
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    highlightedContent?: string;
    finish_reason?: string;
  }>;

  isActive?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  variant?: "card" | "flat";
}

const formatWhatsAppLikeDate = (date: Date) => {
  if (isSameDay(date, new Date())) {
    return format(date, "p"); // localized time (12/24h based on locale)
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return format(date, "EEEE"); // Day of week
  }
  return format(date, "dd/MM/yyyy");
};

export function ConversationListItem({
  id,
  created,
  model,
  highlightedModel,
  highlightSnippet,
  messages,
  isActive = false,
  onSelect,
  onDelete,
  variant = "card",
}: ConversationListItemProps) {
  const createdDate = useMemo(() => new Date(created), [created]);
  const userMessagesCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);
  const firstUserPrompt = useMemo(() => {
    const msg = messages.find((m) => m.role === "user");
    return msg ? extractTextFromContent(msg.content) : "";
  }, [messages]);

  const snippetSegments = useMemo(() => {
    if (!highlightSnippet) return null;
    return splitHighlightSegments(highlightSnippet);
  }, [highlightSnippet]);
  const modelSegments = useMemo(() => {
    if (!highlightedModel) return null;
    return splitHighlightSegments(highlightedModel);
  }, [highlightedModel]);

  const getFullConversationText = () => buildConversationPlainText(messages);
  const getShareableMarkdown = () => buildConversationMarkdown({ model, created: createdDate, messages });
  const handleShare = async () => {
    const text = getShareableMarkdown();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Conversation with ${model}`, text });
        return;
      } catch (e) {
        console.error(e);
        toast.error("Failed to share");
      }
    }
    copyToClipboard(text, "Conversation copied for sharing");
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      const res = await fetch(`/api/search/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Conversation deleted");
        onDelete(id);
      } else {
        const data = await res.json();
        toast.error(data?.error || "Failed to delete");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete");
    }
  };

  // Confirmation managed within KebabMenu

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer select-none",
        variant === "card"
          ? "rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
          : "rounded-lg px-2 py-2 sm:px-2 hover:bg-[var(--pk-conv-list-hover-bg)]",
        isActive && (variant === "card" ? "ring-2 ring-primary/60" : "bg-[var(--pk-conv-list-active-bg)]"),
      )}
      onClick={() => onSelect?.(id)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* First row */}
        <div className="flex items-center gap-2 min-w-0">
          <ModelBadge title={model}>
            {modelSegments
              ? modelSegments.map((segment, idx) => (
                  <span key={`model-hl-${idx}`} className={segment.isHighlighted ? SEARCH_HIGHLIGHT_CLASS : undefined}>
                    {segment.text}
                  </span>
                ))
              : model}
          </ModelBadge>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 whitespace-nowrap">
              <span>{formatWhatsAppLikeDate(createdDate)}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{userMessagesCount}</span>
            </div>
          </div>
        </div>

        {/* Second row */}
        <div className="line-clamp-2 min-h-[1.5rem] text-sm text-muted-foreground pr-8 sm:pr-0">
          {snippetSegments
            ? snippetSegments.map((segment, idx) => (
                <span key={`snippet-${idx}`} className={segment.isHighlighted ? SEARCH_HIGHLIGHT_CLASS : undefined}>
                  {segment.text}
                </span>
              ))
            : firstUserPrompt}
        </div>
      </div>

      {/* Mobile-only context menu positioned below the date at the top-right */}
      <div className="absolute right-3 top-8 sm:hidden">
        <KebabMenu
          actions={[
            {
              id: "copy",
              label: "Copy",
              icon: (
                <span className="mr-2">
                  <Copy className="h-4 w-4" />
                </span>
              ),
              onSelect: () => copyToClipboard(getFullConversationText(), "Conversation copied"),
            },
            {
              id: "share",
              label: "Share",
              icon: (
                <span className="mr-2">
                  <Share2 className="h-4 w-4" />
                </span>
              ),
              onSelect: handleShare,
            },
            {
              id: "delete",
              label: "Delete",
              className: "text-destructive focus:text-destructive",
              icon: (
                <span className="mr-2">
                  <Trash2 className="h-4 w-4" />
                </span>
              ),
              confirm: {
                title: "Delete conversation?",
                description: `This will permanently delete the conversation with ${model}. This action cannot be undone.`,
                confirmText: "Delete",
                cancelText: "Cancel",
                variant: "destructive",
                onConfirm: handleDelete,
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
