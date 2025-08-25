"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { safeFormatConversationDate } from "@/lib/date";

export interface Message {
  role: string;
  content: string;
  finish_reason?: string;
}

export interface ConversationListItemProps {
  id: string;
  model: string;
  timestamp?: string;
  messages: Message[];
  score?: number;
  href?: string; // mobile navigation target (/c/[id])
  isActive?: boolean;
  onSelect?: (id: string) => void; // desktop selection
}

/**
 * ConversationListItem
 * - First line:
 *    - Left: model name (badge)
 *    - Right cluster: user message count (with icon, right-aligned text), then date flush-right
 * - Second line: first user prompt (single line, truncated)
 * - Interactions:
 *    - Desktop: onSelect(id) to highlight/show detail pane
 *    - Mobile: navigate to href (/c/[id]) via an invisible absolute Link overlay
 */
export function ConversationListItem(props: ConversationListItemProps) {
  const { id, model, timestamp, messages, href, isActive, onSelect } = props;

  const userMessages = React.useMemo(() => messages.filter((m) => m.role === "user"), [messages]);
  const userCount = userMessages.length;
  const firstUserPrompt = userMessages[0]?.content ?? "";
  const dateLabel = safeFormatConversationDate(timestamp ?? "");

  const handleClick = React.useCallback(() => {
    onSelect?.(id);
  }, [id, onSelect]);

  return (
    <div
      role="button"
      onClick={handleClick}
      className={cn(
        "relative w-full px-3 py-2 rounded-lg border transition-colors cursor-pointer",
        "bg-card hover:bg-accent/30",
        isActive ? "border-primary bg-primary/10" : "border-border",
      )}
      aria-selected={isActive}
    >
      {/* Mobile full-surface link overlay */}
      {href ? (
        <Link href={href} aria-label="Open conversation" className="absolute inset-0 sm:hidden" prefetch={false} />
      ) : null}

      <div className="flex flex-col gap-1">
        {/* First row: model on left, count + date on right */}
        <div className="flex items-baseline gap-2">
          <Badge variant="outline" className="py-0 px-1.5 text-xs sm:text-sm">
            {model}
          </Badge>

          <div className="ml-auto flex items-center gap-2">
            {/* Right-aligned count (to the left of the date) */}
            <div className="flex items-center text-xs sm:text-sm text-muted-foreground tabular-nums">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              <span className="text-right min-w-[1.5ch]">{userCount}</span>
            </div>

            {/* Date aligned fully to the right */}
            <div className="text-xs sm:text-sm text-muted-foreground">{dateLabel}</div>
          </div>
        </div>

        {/* Second row: first user prompt */}
        <div className="text-sm text-muted-foreground line-clamp-1 break-words">{firstUserPrompt}</div>
      </div>
    </div>
  );
}
