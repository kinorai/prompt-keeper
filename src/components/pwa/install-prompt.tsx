"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(true);

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

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, [isStandalone]);

  useEffect(() => {
    if (isStandalone || !showPrompt) return;

    const timer = setTimeout(() => {
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
            action: {
              label: "Dismiss",
              onClick: () => setShowPrompt(false),
            },
          },
        );
      } else if (deferredPrompt) {
        toast(
          <div className="flex items-center gap-2">
            <span>Install Prompt Keeper for a better experience</span>
            <Button
              size="sm"
              onClick={async () => {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === "accepted") {
                  setDeferredPrompt(null);
                }
              }}
            >
              Install
            </Button>
          </div>,
          {
            position: "top-right",
            duration: 10000,
            action: {
              label: "Dismiss",
              onClick: () => setShowPrompt(false),
            },
          },
        );
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isStandalone, showPrompt, isIOS, deferredPrompt]);

  return null;
}
