import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookie = request.headers.get("cookie") ?? "";

  let rustRes: Response;
  try {
    rustRes = await fetch(`${process.env.API_URL}/games/${id}/close`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "API not reachable" }, { status: 502 });
  }

  let data: unknown = {};
  const text = await rustRes.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  return NextResponse.json(data, { status: rustRes.status });
}
