"use client";

import { toast } from "sonner";
import { DELETE_UNDO_TIMEOUT_MS } from "@/lib/defaults";

export interface UndoableDeleteItem {
  id: string;
  created: string;
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usage?: any;
  messages: Array<{ role: string; content: string; finish_reason?: string }>;
}

interface UndoableDeleteParams<T extends UndoableDeleteItem> {
  item: T;
  doDelete: () => Promise<Response>;
  onOptimisticRemove: () => void;
  onRestore?: (item: T) => void;
  durationMs?: number;
  toastLabel?: string;
}

export function useUndoableDelete() {
  async function undoableDelete<T extends UndoableDeleteItem>({
    item,
    doDelete,
    onOptimisticRemove,
    onRestore,
    durationMs = DELETE_UNDO_TIMEOUT_MS,
    toastLabel = "Conversation deleted",
  }: UndoableDeleteParams<T>): Promise<void> {
    let isUndone = false;

    // Optimistically remove from UI
    onOptimisticRemove();

    const toastId = toast(toastLabel, {
      action: {
        label: "Undo",
        onClick: () => {
          isUndone = true;
          onRestore?.(item);
          toast.success("Deletion undone");
        },
      },
      duration: durationMs,
    });

    await new Promise((r) => setTimeout(r, durationMs));

    if (isUndone) {
      toast.dismiss(toastId);
      return;
    }

    try {
      const res = await doDelete();
      if (!res.ok) {
        // Try to parse error JSON, fallback to generic
        let msg: string | undefined;
        try {
          const data = await res.json();
          msg = data?.error;
        } catch {}
        toast.error(msg || "Failed to delete on server");
        onRestore?.(item);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete on server");
      onRestore?.(item);
    } finally {
      toast.dismiss(toastId);
    }
  }

  return { undoableDelete };
}
