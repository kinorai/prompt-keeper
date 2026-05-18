"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function OfflineIndicator() {
  const offlineToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      if (offlineToastIdRef.current !== null) {
        toast.dismiss(offlineToastIdRef.current);
        offlineToastIdRef.current = null;
      }
      toast.success("Back online", { position: "top-left", duration: 3000 });
    };

    const handleOffline = () => {
      if (offlineToastIdRef.current !== null) return;
      offlineToastIdRef.current = toast.warning("You're offline", {
        position: "top-left",
        duration: Infinity,
      });
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      handleOffline();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return null;
}
