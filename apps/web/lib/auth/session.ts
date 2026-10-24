import { cookies } from "next/headers";
import { ACCESS_COOKIE, decodeJwtPayload } from "./cookies";

export async function getAccessToken(): Promise<string | undefined> {
    const jar = await cookies();
    return jar.get(ACCESS_COOKIE)?.value;
}

/** User id of the caller, read from the access token (already verified by middleware/API). */
export async function getCurrentUserId(): Promise<string | null> {
    const token = await getAccessToken();
    const sub = token ? decodeJwtPayload(token)?.sub : null;
    return typeof sub === "string" ? sub : null;
}
