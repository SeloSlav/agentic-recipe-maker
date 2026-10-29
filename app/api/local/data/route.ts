import { NextResponse } from "next/server";
import { assertLocalRequest, requireLocalSession } from "../../../lib/backend/local-session";
import { executeOperation } from "../../../lib/backend/spacetime-server";

export async function POST(request: Request) {
  try { assertLocalRequest(request); } catch { return NextResponse.json({ error: "Local backend unavailable" }, { status: 403 }); }
  try {
    const op = await request.json();
    if (op.action === "write" || !["recipes", "users", "marketplaceItems"].includes(op.path?.split("/")[0])) {
      try { await requireLocalSession(request); } catch { return NextResponse.json({ error: "Local sign-in required" }, { status: 401 }); }
    }
    return NextResponse.json(await executeOperation(op));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Local database error" }, { status: 400 }); }
}
