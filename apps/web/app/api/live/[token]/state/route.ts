// GET /api/live/:token/state — read-only JSON snapshot of one shared game.
// Used by the live viewer after each SSE update and as a polling fallback
// when the stream cannot be kept open (flaky mobile network, buffering proxy).

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const upstream = await fetch(`${process.env.API_URL}/live/${encodeURIComponent(token)}/state`, {
      cache: "no-store",
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "API not reachable" }, { status: 502 });
  }
}
