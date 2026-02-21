"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw")
        .then((registration) => {
          if (process.env.NODE_ENV === "development") {
            console.log("Service Worker registered with scope:", registration.scope);
          }
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
