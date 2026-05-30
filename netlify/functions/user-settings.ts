import type { Config } from "@netlify/functions";
import { createBackendApp } from "../../backend/body/app";
import { getSessionUser } from "../../backend/body/head/session";

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
    const user = getSessionUser(request.headers.get("cookie") ?? "");
    if (!user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

    const app = createBackendApp();
    const url = new URL(request.url);
    if (url.pathname === "/api/user-settings" && request.method === "GET") {
      return jsonResponse(await app.identity.getUserSettings.process({ userId: user.id }));
    }

    if (url.pathname === "/api/user-settings" && request.method === "PUT") {
      const body = (await request.json()) as { profile?: unknown };
      return jsonResponse(await app.identity.updateProfile.process({ userId: user.id, profile: (body.profile ?? {}) as Record<string, unknown> }));
    }

    if (url.pathname === "/api/user-settings/api-key" && request.method === "POST") {
      return jsonResponse(await app.identity.rotateApiKey.process({ userId: user.id }));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "User settings failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/user-settings*"
};
