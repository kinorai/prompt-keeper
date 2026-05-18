import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline · Prompt Keeper",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Prompt Keeper needs a network connection to search conversations. Reconnect and reload the page.
      </p>
    </div>
  );
}
