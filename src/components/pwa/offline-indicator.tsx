"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

export function OfflineIndicator() {
  const [offlineToastId, setOfflineToastId] = useState<string | number | null>(null);

  const handleOnline = useCallback(() => {
    if (offlineToastId) {
      toast.dismiss(offlineToastId);
    }
    toast.success("Back online", {
      position: "top-left",
      duration: 3000,
    });
    setOfflineToastId(null);
  }, [offlineToastId]);

  const handleOffline = useCallback(() => {
    const id = toast.warning("You're offline", {
      position: "top-left",
      duration: Infinity,
    });
    setOfflineToastId(id);
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return null;
}
