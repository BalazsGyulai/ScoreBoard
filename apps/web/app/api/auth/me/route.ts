import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";

  let rustRes: Response;
  try {
    rustRes = await fetch(`${process.env.API_URL}/auth/me`, {
      method: "GET",
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
