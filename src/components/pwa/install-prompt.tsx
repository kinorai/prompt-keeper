"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALL_PROMPT_DELAY_MS = 5000;
const DISMISSED_STORAGE_KEY = "pwa-install-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
  } catch {
    // localStorage unavailable (private mode / quota) — ignore
  }
}

export function InstallPrompt() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());
  const shownRef = useRef(false);

  useEffect(() => {
    const checkInstallStatus = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);

      const iOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
      setIsIOS(iOS);
    };

    checkInstallStatus();

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleChange = () => checkInstallStatus();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      writeDismissed();
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [isStandalone]);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (isStandalone || dismissed || shownRef.current) return;
    if (!isIOS && !deferredPrompt) return;

    const timer = setTimeout(() => {
      shownRef.current = true;
      if (isIOS) {
        toast(
          <div className="flex flex-col gap-2">
            <span className="font-medium">Install Prompt Keeper</span>
            <span className="text-sm text-muted-foreground">
              Tap the share button <span className="font-mono">⎋</span> and select &quot;Add to Home Screen&quot;
            </span>
          </div>,
          {
            position: "top-right",
            duration: 10000,
            action: { label: "Dismiss", onClick: dismiss },
            onDismiss: dismiss,
          },
        );
      } else if (deferredPrompt) {
        toast(
          <div className="flex items-center gap-2">
            <span>Install Prompt Keeper for a better experience</span>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await deferredPrompt.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  if (outcome === "accepted" || outcome === "dismissed") {
                    setDeferredPrompt(null);
                    dismiss();
                  }
                } catch (err) {
                  console.error("Install prompt failed:", err);
                }
              }}
            >
              Install
            </Button>
          </div>,
          {
            position: "top-right",
            duration: 10000,
            action: { label: "Dismiss", onClick: dismiss },
            onDismiss: dismiss,
          },
        );
      }
    }, INSTALL_PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isStandalone, dismissed, isIOS, deferredPrompt, dismiss]);

  return null;
}
