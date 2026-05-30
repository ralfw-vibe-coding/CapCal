import type { Config } from "@netlify/functions";
import { createBackendApp } from "../../backend/body/app";
import type { AppState } from "../../backend/body/domains/taskspace/providers/stateProvider";
import { bearerToken, getSessionUser, isAuthRequired } from "../../backend/body/head/session";

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
    const app = createBackendApp();
    const user =
      getSessionUser(request.headers.get("cookie") ?? "") ??
      (await app.identity.findUserByApiKey.process({ apiKey: bearerToken(request.headers.get("authorization")) ?? "" }));
    if (isAuthRequired() && !user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

    if (request.method === "GET") {
      return jsonResponse(await app.taskspace.loadState.process({ userId: user?.id }));
    }

    if (request.method === "PUT") {
      const state = (await request.json()) as AppState;
      return jsonResponse(await app.taskspace.saveState.process({ state, userId: user?.id }));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "State provider failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/state"
};
