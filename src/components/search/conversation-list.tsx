"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ConversationListItem } from "@/components/search/conversation-list-item";
import type { Message } from "@/components/search/conversation-list-item";

export interface ConversationListItemData {
  id: string;
  model: string;
  timestamp?: string;
  messages: Message[];
  score?: number;
}

export interface ConversationListProps {
  items: ConversationListItemData[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  buildHref?: (id: string) => string; // for mobile navigation target (/c/[id])
  className?: string;
  "aria-label"?: string;
}

/**
 * ConversationList
 * - Renders vertical list of conversations.
 * - On desktop (≥ sm) uses onSelect to highlight/show detail pane.
 * - On mobile (< sm) items include an absolute Link overlay to /c/[id] (or custom buildHref).
 */
export function ConversationList(props: ConversationListProps) {
  const { items, selectedId, onSelect, buildHref, className } = props;

  const hrefFor = React.useCallback(
    (id: string) => (buildHref ? buildHref(id) : `/c/${encodeURIComponent(id)}`),
    [buildHref],
  );

  return (
    <div
      className={cn("flex flex-col gap-1 sm:gap-1.5 w-full h-full overflow-y-auto", className)}
      aria-label={props["aria-label"] ?? "Conversations"}
      role="list"
    >
      {items.map((item) => (
        <div role="listitem" key={item.id}>
          <ConversationListItem
            id={item.id}
            model={item.model}
            timestamp={item.timestamp}
            messages={item.messages}
            score={item.score}
            href={hrefFor(item.id)}
            isActive={selectedId === item.id}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}
