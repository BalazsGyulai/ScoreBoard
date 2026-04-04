import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = await request.json();

    const rustRes = await fetch(`${process.env.API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const data = await rustRes.json();

    const response = NextResponse.json(data, { status: rustRes.status });

    const cookies = rustRes.headers.getSetCookie();
    cookies.forEach((cookie) => {
        response.headers.append("Set-Cookie", cookie);
    });

    return response;
}