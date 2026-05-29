import type { Config } from "@netlify/functions";
import { getApiKeyUser, getSessionUser, isAuthRequired } from "../../src/server/auth";
import { createBackendDomain } from "../../backend/body/domains/taskspace/domain";
import type { AppState } from "../../backend/body/domains/taskspace/providers/stateProvider";

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
    const backend = createBackendDomain();
    const user = getSessionUser(request.headers.get("cookie") ?? "") ?? (await getApiKeyUser(request.headers.get("authorization")));
    if (isAuthRequired() && !user) return jsonResponse({ error: "Unauthorized" }, { status: 401 });

    if (request.method === "GET") {
      return jsonResponse(await backend.loadState.process({ userId: user?.id }));
    }

    if (request.method === "PUT") {
      const state = (await request.json()) as AppState;
      return jsonResponse(await backend.saveState.process({ state, userId: user?.id }));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "State provider failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/state"
};
