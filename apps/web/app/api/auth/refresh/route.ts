import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
    ACCESS_COOKIE,
    REFRESH_BEFORE_EXPIRY_SECONDS,
    REFRESH_COOKIE,
    clearedAuthCookies,
    forBrowser,
    refreshWithApi,
    secondsUntilExpiry,
} from "@/lib/auth/cookies";

// POST /api/auth/refresh — used by the client keep-alive timer and by apiFetch after a 401.
// Body `{ "force": true }` always rotates; otherwise a still-fresh access token is kept
// and only its remaining lifetime is reported.
export async function POST(request: Request) {
    const jar = await cookies();
    const accessToken = jar.get(ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;

    let force = false;
    try {
        force = Boolean((await request.json())?.force);
    } catch {
        // no body
    }

    const remaining = secondsUntilExpiry(accessToken);
    if (!force && remaining > REFRESH_BEFORE_EXPIRY_SECONDS) {
        return NextResponse.json({ refreshed: false, expires_in: Math.floor(remaining) });
    }

    if (!refreshToken) {
        return unauthorized();
    }

    const result = await refreshWithApi(refreshToken);
    if (result.kind === "rejected") return unauthorized();
    if (result.kind === "unavailable") {
        return NextResponse.json({ error: "API not reachable" }, { status: 503 });
    }

    const response = NextResponse.json({ refreshed: true, expires_in: result.expiresIn });
    for (const c of result.setCookies) response.headers.append("Set-Cookie", forBrowser(c));
    return response;
}

function unauthorized() {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    for (const c of clearedAuthCookies()) response.headers.append("Set-Cookie", c);
    return response;
}
