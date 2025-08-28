"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AlertTriangle, MoreVertical } from "lucide-react";

export interface KebabActionConfirm {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
}

export interface KebabAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: () => void | Promise<void>;
  confirm?: KebabActionConfirm;
}

export interface KebabMenuProps {
  actions: KebabAction[];
  align?: "start" | "end" | "center";
  buttonAriaLabel?: string;
  buttonClassName?: string;
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
  buttonSize?: React.ComponentProps<typeof Button>["size"];
}

export function KebabMenu({
  actions,
  align = "end",
  buttonAriaLabel = "Actions",
  buttonClassName,
  buttonVariant = "secondary",
  buttonSize = "sm",
}: KebabMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [confirmForId, setConfirmForId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const actionNeedingConfirm = actions.find((a) => a.id === confirmForId);
  const isDestructive = actionNeedingConfirm?.confirm?.variant === "destructive";

  const handleSelect = async (action: KebabAction) => {
    if (action.disabled) return;
    if (action.confirm) {
      setIsMenuOpen(false);
      // Let the dropdown close before showing the confirm
      setTimeout(() => setConfirmForId(action.id), 0);
      return;
    }
    try {
      await action.onSelect?.();
    } finally {
      setIsMenuOpen(false);
    }
  };

  const handleConfirm = async () => {
    if (!actionNeedingConfirm?.confirm) return;
    try {
      setIsConfirming(true);
      await actionNeedingConfirm.confirm.onConfirm();
    } finally {
      setIsConfirming(false);
      setConfirmForId(null);
    }
  };

  // Close confirmation on outside click or Escape
  useEffect(() => {
    if (!confirmForId) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".context-confirmation-panel") && !target.closest("button")) {
        setConfirmForId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmForId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirmForId]);

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={buttonRef}
            variant={buttonVariant}
            size={buttonSize}
            className={cn("h-7 w-7 p-0 bg-muted/50 hover:bg-muted/80", buttonClassName)}
            onClick={(e) => e.stopPropagation()}
            aria-label={buttonAriaLabel}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()}>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              className={cn(action.className)}
              disabled={action.disabled}
              onSelect={(e) => {
                e.preventDefault();
                handleSelect(action);
              }}
            >
              {action.icon}
              {action.icon ? <span className="ml-2">{action.label}</span> : action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmForId && actionNeedingConfirm?.confirm && (
        <div
          className="context-confirmation-panel fixed z-50 w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none"
          style={{
            left: buttonRef.current ? Math.max(10, buttonRef.current.getBoundingClientRect().right - 320) : 10,
            top: buttonRef.current ? buttonRef.current.getBoundingClientRect().bottom + 5 : 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-3">
            <AlertTriangle
              className={cn("h-5 w-5 flex-shrink-0 mt-0.5", isDestructive ? "text-destructive" : "text-foreground/60")}
            />
            <div className="space-y-3 flex-1">
              <div>
                <p className="font-medium text-sm">{actionNeedingConfirm.confirm.title}</p>
                {actionNeedingConfirm.confirm.description && (
                  <p className="text-sm text-muted-foreground mt-1">{actionNeedingConfirm.confirm.description}</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setConfirmForId(null)} disabled={isConfirming}>
                  {actionNeedingConfirm.confirm.cancelText ?? "Cancel"}
                </Button>
                <Button
                  variant={actionNeedingConfirm.confirm.variant === "destructive" ? "destructive" : "default"}
                  size="sm"
                  onClick={handleConfirm}
                  disabled={isConfirming}
                >
                  {isConfirming
                    ? `${actionNeedingConfirm.confirm.confirmText ?? "Confirm"}...`
                    : (actionNeedingConfirm.confirm.confirmText ?? "Confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default KebabMenu;
