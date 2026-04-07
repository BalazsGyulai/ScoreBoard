import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const cookie = request.headers.get("cookie") ?? "";

  let rustRes: Response;
  try {
    rustRes = await fetch(`${process.env.API_URL}/players/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "API not reachable" }, { status: 502 });
  }

  const text = await rustRes.text();
  if (!text) {
    return new NextResponse(null, { status: rustRes.status });
  }

  let data: unknown = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  return NextResponse.json(data, { status: rustRes.status });
}
