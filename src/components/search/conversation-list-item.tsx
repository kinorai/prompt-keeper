"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronRight, Copy, MessageSquare, MoreVertical, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, isSameDay, isThisWeek, isYesterday } from "date-fns";

export interface ConversationListItemProps {
  id: string;
  created: string; // ISO date
  model: string;
  messages: Array<{ role: string; content: string; finish_reason?: string }>;
  score?: number;
  isActive?: boolean;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const copyToClipboard = async (text: string, successMessage = "Copied") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch (err) {
    console.error("Failed to copy", err);
    toast.error("Copy failed");
  }
};

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
  score,
  isActive = false,
  onSelect,
  onDelete,
}: ConversationListItemProps) {
  const createdDate = useMemo(() => new Date(created), [created]);
  const userMessagesCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);
  const firstUserPrompt = useMemo(() => messages.find((m) => m.role === "user")?.content || "", [messages]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getFullConversationText = () => messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const getShareableMarkdown = () => {
    const header = `# Conversation with ${model}\n\nDate: ${createdDate.toLocaleString()}\n\n---\n\n`;
    const content = messages.map((m) => `### ${m.role.toUpperCase()}\n\n${m.content}\n\n`).join("");
    return header + content;
  };
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
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer select-none rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40",
        isActive && "ring-2 ring-primary/60",
      )}
      onClick={() => onSelect?.(id)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-3 sm:pr-3">
        {/* First row */}
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className="font-medium text-xs py-0 px-1.5 max-w-[60%] sm:max-w-[50%] overflow-hidden whitespace-nowrap justify-start"
            title={model}
          >
            <span className="truncate">{model}</span>
          </Badge>
          {typeof score === "number" && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1">
              {score.toFixed(2)}
            </Badge>
          )}
          <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{userMessagesCount}</span>
            </div>
            <div className="ml-auto flex items-center gap-1 whitespace-nowrap">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{formatWhatsAppLikeDate(createdDate)}</span>
            </div>
          </div>
        </div>

        {/* Second row */}
        <div className="line-clamp-2 min-h-[1.5rem] text-sm text-foreground/90">{firstUserPrompt}</div>
      </div>

      {/* Actions on the right (overlay) */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-2 py-1 bg-muted/50 hover:bg-muted/80"
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(getFullConversationText(), "Conversation copied");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
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
          <PopoverContent className="w-80" align="end" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-3">
              <p className="text-sm">Delete conversation?</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  Delete
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 px-2 py-1 bg-muted/50 hover:bg-muted/80"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => copyToClipboard(getFullConversationText(), "Conversation copied")}>
              Copy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronRight className="ml-1 hidden h-4 w-4 text-muted-foreground sm:block" />
      </div>
    </div>
  );
}
