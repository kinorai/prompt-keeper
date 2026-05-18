"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reloading = false;

    const promptToReload = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      if (!waiting) return;
      toast("A new version is available", {
        position: "top-right",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const watchUpdates = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        promptToReload(registration);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promptToReload(registration);
          }
        });
      });
    };

    navigator.serviceWorker
      .register("/sw", { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        watchUpdates(registration);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });

    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
