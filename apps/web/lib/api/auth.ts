import type { RegisterRequest, LoginRequest, LoginResponse } from "@/types/api";

const API = process.env.API_URL!;

async function apiCall<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error ?? "Internal Server Error");
    }

    return data as T;
}


export async function apiRegister(body: RegisterRequest) {
    return apiCall<LoginResponse>(`${API}/auth/register`, body);
}

export async function apiLogin(body: LoginRequest) {
    return apiCall<LoginResponse>(`${API}/auth/login`, body);
}