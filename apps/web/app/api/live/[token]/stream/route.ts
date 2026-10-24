// GET /api/live/:token/stream — same-origin SSE proxy for the public live viewer.
//
// The viewer used to connect to the Rust API directly (NEXT_PUBLIC_API_URL), which
// only works if the reverse proxy routes /live/* to the API and does not buffer it.
// Streaming through this route handler works wherever the web app itself is reachable.
// `no-transform` stops compression (Next's gzip included) from buffering the stream.

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(`${process.env.API_URL}/live/${encodeURIComponent(token)}/stream`, {
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: request.signal, // viewer closed the page → close the upstream stream too
    });
  } catch {
    return Response.json({ error: "API not reachable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
