export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkConnections } = await import("@/lib/health");

    if (process.env.OPENSEARCH_URL) {
      const { initializeIndex } = await import("@/lib/opensearch");
      await Promise.all([checkConnections(), initializeIndex()]);
    } else {
      await checkConnections();
    }
  }
}
