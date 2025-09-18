import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:healthz");

export async function GET() {
  try {
    const body = {
      status: "ok",
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    log.error(error, "[Healthz Error]");
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
