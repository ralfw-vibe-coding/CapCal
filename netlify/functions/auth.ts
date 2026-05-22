import type { Config } from "@netlify/functions";
import { clearSessionCookie, getSessionUser, requestOtp, sessionCookie, verifyOtp } from "../../src/server/auth";

type AuthBody = {
  email?: unknown;
  otp?: unknown;
};

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export default async (request: Request) => {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/api/auth/request-otp" && request.method === "POST") {
      const body = (await request.json()) as AuthBody;
      await requestOtp(String(body.email ?? ""));
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      const body = (await request.json()) as AuthBody;
      const user = await verifyOtp(String(body.email ?? ""), String(body.otp ?? ""));
      return jsonResponse(
        { user },
        {
          headers: {
            "set-cookie": `${sessionCookie(user)}; Secure`
          }
        }
      );
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = getSessionUser(request.headers.get("cookie") ?? "");
      if (!user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
      return jsonResponse({ user });
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return jsonResponse({ ok: true }, { headers: { "set-cookie": `${clearSessionCookie()}; Secure` } });
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Auth failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/*"
};
