import { NextResponse } from "next/server";
import { clearedAuthCookies, copySetCookies } from "@/lib/auth/cookies";

// POST /api/auth/logout — revoke the session in the API and always clear the cookies,
// even if the API is unreachable (logging out must never fail on the device).
export async function POST(request: Request) {
    const cookie = request.headers.get("cookie") ?? "";
    const response = NextResponse.json({ message: "Logged out" }, { status: 200 });

    try {
        const rustRes = await fetch(`${process.env.API_URL}/auth/logout`, {
            method: "POST",
            headers: { Cookie: cookie },
            cache: "no-store",
        });
        copySetCookies(rustRes, response);
    } catch {
        // fall through to the local clear below
    }

    if (!response.headers.getSetCookie().length) {
        for (const c of clearedAuthCookies()) response.headers.append("Set-Cookie", c);
    }
    return response;
}
