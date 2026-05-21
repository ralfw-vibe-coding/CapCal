import type { Config } from "@netlify/functions";
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
  const provider = createStateProvider();

  if (request.method === "GET") {
    return jsonResponse(await provider.load());
  }

  if (request.method === "PUT") {
    try {
      const state = (await request.json()) as AppState;
      await provider.save(state);
      return jsonResponse(state);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
    }
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = {
  path: "/api/state"
};
