import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = await request.json();

    let rustRes: Response;
    try {
        rustRes = await fetch(`${process.env.API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
    } catch {
        return NextResponse.json({error: "API not reachable"}, {status: 502});
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

    
    const response = NextResponse.json(data, { status: rustRes.status });
    const isProduction = process.env.NODE_ENV === "production";

    
    const cookies = rustRes.headers.getSetCookie();
    cookies.forEach((cookie) => {
        // strip "Ssecure" flag because localhost is HTTP
        const cleaned = isProduction ? cookie : cookie.replace(/;\s*Secure/gi, "");
        
        response.headers.append("Set-Cookie", cleaned);
    });

    return response;
}