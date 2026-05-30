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

    if (url.pathname === "/api/gcal/status" && request.method === "GET") {
      return jsonResponse(await app.externalCalendar.getGoogleStatus.process({ userId: user.id }));
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "GET") {
      return jsonResponse(await app.reactors.googleCalendar.refreshCalendars(user.id));
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "PUT") {
      const body = (await request.json()) as { selectedCalendarIds?: unknown };
      return jsonResponse(await app.externalCalendar.updateGoogleSelection.process({ userId: user.id, selectedCalendarIds: body.selectedCalendarIds }));
    }

    if (url.pathname === "/api/gcal/events" && request.method === "GET") {
      return jsonResponse(
        await app.reactors.googleCalendar.getEvents(
          user.id,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
    }

    if (url.pathname === "/api/gcal/disconnect" && request.method === "POST") {
      return jsonResponse(await app.externalCalendar.disconnectGoogle.process({ userId: user.id }));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Google Calendar failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/gcal/*"
};
