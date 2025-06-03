import { NextResponse } from "next/server";
import { initializeIndex } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:init");

export async function POST() {
  try {
    await initializeIndex();
    return NextResponse.json({ message: "Index initialized successfully" });
  } catch (error) {
    log.error(error, "Failed to initialize index:");
    return NextResponse.json(
      { message: "Failed to initialize index", error: (error as Error).message },
      { status: 500 },
    );
  }
}
