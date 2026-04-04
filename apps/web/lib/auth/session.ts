import { cookies } from "next/headers";
import type { Session } from "@/types/domain";

const ACCESS_COOKIE = "hg_access_token";
const REFRESH_COOKIE = "hg_refresh_token";

export async function getAccessToken(): Promise<string | undefined> {
    const jar = await cookies();
    return jar.get(ACCESS_COOKIE)?.value;
}

export async function setAuthCookies(
    accessToken: string,
    refreshToken: string,
    accessMaxAge: number = 15 * 60,       // 15 minutes in seconds
    refreshMaxAge: number = 7 * 24 * 3600, // 7 days in seconds
) {
    const jar = await cookies();

    jar.set(ACCESS_COOKIE, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: accessMaxAge,
    });

    jar.set(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: refreshMaxAge,
    });
}

export async function clearAuthCookies() {
    const jar = await cookies();
    jar.delete(ACCESS_COOKIE);
    jar.delete(REFRESH_COOKIE);
}