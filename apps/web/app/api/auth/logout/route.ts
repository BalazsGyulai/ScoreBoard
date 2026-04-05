import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const cookie = request.headers.get("cookie") ?? "";


    let rustRes: Response;

    try {
        rustRes = await fetch(`${process.env.API_URL}/auth/logout`, {
            method: "POST",
            headers: { Cookie: cookie },
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({ error: "API not reachable" }, { status: 502 });
    }

    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
    const isProduction = process.env.NODE_ENV === "production";

    const cookies = rustRes.headers.getSetCookie();
    cookies.forEach((cookie) => {
        const cleaned = isProduction ? cookie : cookie.replace(/;\s*Secure/gi, "");
        response.headers.append("Set-Cookie", cleaned);
    });

    return response;
}