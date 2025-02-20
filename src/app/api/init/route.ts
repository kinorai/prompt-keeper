import { NextResponse } from "next/server";
import { initializeIndex } from "@/lib/opensearch";

export async function POST() {
  try {
    await initializeIndex();
    return NextResponse.json({ message: "Index initialized successfully" });
  } catch (error) {
    console.error("Failed to initialize index:", error);
    return NextResponse.json(
      { error: "Failed to initialize index" },
      { status: 500 }
    );
  }
}
