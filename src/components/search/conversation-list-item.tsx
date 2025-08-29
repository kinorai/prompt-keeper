"use client";

import { useMemo } from "react";
import { ModelBadge } from "@/components/badges";
import { cn } from "@/lib/utils";
import { Copy, MessageSquare, Share2, Trash2 } from "lucide-react";
import { KebabMenu } from "@/components/kebab-menu";
import { useUndoableDelete } from "@/hooks/use-undo-delete";
import { format, isSameDay, isThisWeek, isYesterday } from "date-fns";
import { copyToClipboard } from "@/lib/clipboard";
import { buildConversationMarkdown, buildConversationPlainText } from "@/lib/conversation";
import { toast } from "sonner";

export interface ConversationListItemProps {
  id: string;
  created: string; // ISO date
  model: string;
  messages: Array<{ role: string; content: string; finish_reason?: string }>;
  isActive?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestore?: (item: {
    id: string;
    created: string;
    model: string;
    messages: Array<{ role: string; content: string; finish_reason?: string }>;
  }) => void;
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
  messages,
  isActive = false,
  onSelect,
  onDelete,
  onRestore,
}: ConversationListItemProps) {
  const createdDate = useMemo(() => new Date(created), [created]);
  const userMessagesCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);
  const firstUserPrompt = useMemo(() => messages.find((m) => m.role === "user")?.content || "", [messages]);
  // No local delete popover state in list view
  const { undoableDelete } = useUndoableDelete();

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
    await undoableDelete({
      item: { id, created, model, messages },
      onOptimisticRemove: () => onDelete(id),
      onRestore,
      doDelete: () => fetch(`/api/search/${id}`, { method: "DELETE" }),
      toastLabel: "Conversation deleted",
    });
  };

  // Confirmation managed within KebabMenu

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer select-none rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40",
        isActive && "ring-2 ring-primary/60",
      )}
      onClick={() => onSelect?.(id)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* First row */}
        <div className="flex items-center gap-2 min-w-0">
          <ModelBadge title={model}>{model}</ModelBadge>
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
        <div className="line-clamp-2 min-h-[1.5rem] text-sm text-muted-foreground pr-8 sm:pr-0">{firstUserPrompt}</div>
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
