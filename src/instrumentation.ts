export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkConnections } = await import("@/lib/health");
    await checkConnections();
  }
}
