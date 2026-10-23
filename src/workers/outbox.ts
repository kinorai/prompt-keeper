import "dotenv/config";
import { createServer } from "http";
import { createLogger } from "../lib/logger";
import getPrisma from "../lib/prisma";
import { getOpenSearchClient } from "../lib/opensearch";
import { OUTBOX_CONFIG, WORKER_ID, pollOnce, processEvent } from "../lib/outbox";

// Syncs the OpenSearch index from the outbox (SEARCH_BACKEND=opensearch). The processing lives in
// src/lib/outbox.ts; this process adds the poll loop and the health endpoints.

const log = createLogger("worker:outbox");

const CONFIG = {
  pollIntervalMs: OUTBOX_CONFIG.pollIntervalMs,
  healthPort: Number(process.env.HEALTH_PORT || 3001),
};

// Health state tracking
let isLive = false;
let lastPollTime = Date.now();

// Health check functions
// Failure details go to the log, not the response: the probe is unauthenticated
async function checkPostgres(): Promise<{ ok: boolean }> {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    log.error(error, "Readiness: Postgres check failed");
    return { ok: false };
  }
}

async function checkOpenSearch(): Promise<{ ok: boolean }> {
  try {
    const resp = await getOpenSearchClient().ping();
    if (resp.body === true) {
      return { ok: true };
    }
    log.error({ body: resp.body }, "Readiness: OpenSearch ping failed");
    return { ok: false };
  } catch (error) {
    log.error(error, "Readiness: OpenSearch check failed");
    return { ok: false };
  }
}

// HTTP Health Server
function startHealthServer() {
  const server = createServer(async (req, res) => {
    const url = req.url || "/";

    // Basic health check
    if (url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Liveness check - ensure main loop is running and polling
    if (url === "/livez") {
      const timeSinceLastPoll = Date.now() - lastPollTime;
      const isHealthy = isLive && timeSinceLastPoll < CONFIG.pollIntervalMs * 3; // 3x poll interval
      const status = isHealthy ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: isHealthy ? "live" : "unhealthy",
          checks: {
            timeSinceLastPoll,
            threshold: CONFIG.pollIntervalMs * 3,
          },
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // Readiness check - ensure dependencies are reachable
    if (url === "/readyz") {
      const [pg, os] = await Promise.all([checkPostgres(), checkOpenSearch()]);
      const allOk = pg.ok && os.ok;
      const status = allOk ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: allOk ? "ready" : "degraded",
          checks: {
            postgres: pg,
            opensearch: os,
          },
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(CONFIG.healthPort, () => {
    log.info({ port: CONFIG.healthPort }, "Health server listening");
  });

  return server;
}

async function main() {
  // Start health server first
  startHealthServer();

  log.info(
    {
      pollIntervalMs: CONFIG.pollIntervalMs,
      batchSize: OUTBOX_CONFIG.batchSize,
      shardId: OUTBOX_CONFIG.shardId,
      shardTotal: OUTBOX_CONFIG.shardTotal,
      workerId: WORKER_ID,
      healthPort: CONFIG.healthPort,
    },
    "Outbox worker started",
  );

  // Mark as live after successful startup
  isLive = true;
  lastPollTime = Date.now();

  while (true) {
    try {
      await pollOnce("opensearch");
      // Every completed poll counts, empty ones included: an idle worker is still live
      lastPollTime = Date.now();
    } catch (err) {
      log.error(err, "[Outbox] Poll error");
    }
    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

// Tests import the event handling without starting the loop and health server
if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    log.error(err, "Outbox worker fatal error");
    process.exit(1);
  });
}

export { processEvent, pollOnce };
