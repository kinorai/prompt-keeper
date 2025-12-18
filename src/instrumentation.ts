export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkConnections } = await import("@/lib/health");
    const { initializeIndex } = await import("@/lib/opensearch");

    await Promise.all([checkConnections(), initializeIndex()]);
  }
}
