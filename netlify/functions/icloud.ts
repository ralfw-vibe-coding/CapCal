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

    if (url.pathname === "/api/icloud/status" && request.method === "GET") {
      return jsonResponse(await app.externalCalendar.getICloudStatus.process({ userId: user.id }));
    }

    if (url.pathname === "/api/icloud/connect" && request.method === "POST") {
      const body = (await request.json()) as { appleId?: unknown; appPassword?: unknown };
      return jsonResponse(await app.reactors.icloudCalendar.connect(user.id, body.appleId, body.appPassword));
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "GET") {
      return jsonResponse(await app.reactors.icloudCalendar.refreshCalendars(user.id));
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "PUT") {
      const body = (await request.json()) as { selectedCalendarIds?: unknown };
      return jsonResponse(await app.externalCalendar.updateICloudSelection.process({ userId: user.id, selectedCalendarIds: body.selectedCalendarIds }));
    }

    if (url.pathname === "/api/icloud/events" && request.method === "GET") {
      return jsonResponse(
        await app.reactors.icloudCalendar.getEvents(
          user.id,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
    }

    if (url.pathname === "/api/icloud/disconnect" && request.method === "POST") {
      return jsonResponse(await app.externalCalendar.disconnectICloud.process({ userId: user.id }));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "iCloud Calendar failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/icloud/*"
};
