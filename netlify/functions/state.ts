import type { Config } from "@netlify/functions";
import { getSessionUser, isAuthRequired } from "../../src/server/auth";
import { createStateProvider } from "../../src/server/storage";
import type { AppState } from "../../src/server/storage/types";

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
    const provider = createStateProvider();
    const user = getSessionUser(request.headers.get("cookie") ?? "");
    if (isAuthRequired() && !user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

    if (request.method === "GET") {
      return jsonResponse(await provider.load(user?.id));
    }

    if (request.method === "PUT") {
      const state = (await request.json()) as AppState;
      await provider.save(state, user?.id);
      return jsonResponse(state);
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "State provider failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/state"
};
