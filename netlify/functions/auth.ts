import type { Config } from "@netlify/functions";
import { clearSessionCookie, getSessionUser, requestOtp, sessionCookie, verifyOtp } from "../../src/server/auth";
import { googleCalendarCallback, googleCalendarConnectUrl, googleCalendarErrorRedirect } from "../../src/server/googleCalendar";

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

    if (url.pathname === "/api/auth/gcal/connect" && request.method === "GET") {
      const user = getSessionUser(request.headers.get("cookie") ?? "");
      if (!user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });
      return Response.redirect(googleCalendarConnectUrl(user), 302);
    }

    if (url.pathname === "/api/auth/gcal/callback" && request.method === "GET") {
      try {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) throw new Error("Google callback is missing code or state");
        return Response.redirect(await googleCalendarCallback(code, state), 302);
      } catch (error) {
        console.error("[CapCal] Google Calendar callback failed:", error);
        return Response.redirect(googleCalendarErrorRedirect(error), 302);
      }
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Auth failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/*"
};
