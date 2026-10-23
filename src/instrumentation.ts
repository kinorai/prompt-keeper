export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkConnections } = await import("@/lib/health");
    const { getSearchBackend } = await import("@/lib/search/backend");

    // Throws on an unknown SEARCH_BACKEND, so a typo fails the start instead of every search
    if (getSearchBackend() === "opensearch") {
      const { initializeIndex } = await import("@/lib/opensearch");
      await Promise.all([checkConnections(), initializeIndex()]);
      return;
    }

    await checkConnections();
    const { startInProcessOutbox } = await import("@/lib/outbox");
    const { IN_PROCESS_OUTBOX_POLL_INTERVAL_MS } = await import("@/lib/defaults");
    startInProcessOutbox(IN_PROCESS_OUTBOX_POLL_INTERVAL_MS);
  }
}
