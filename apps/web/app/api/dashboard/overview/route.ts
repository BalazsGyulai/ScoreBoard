import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/server";
import { buildOverview } from "@/lib/stats/server";

// GET /api/dashboard/overview — everything the dashboard shows, in one request.
export async function GET() {
  try {
    return NextResponse.json(await buildOverview());
  } catch (error) {
    return errorResponse(error);
  }
}
