import type { Config } from "@netlify/functions";
import { getSessionUser } from "../../src/server/auth";
import {
  disconnectGoogleCalendar,
  googleCalendarEvents,
  googleCalendarStatus,
  refreshGoogleCalendars,
  updateGoogleCalendarSelection
} from "../../src/server/googleCalendar";

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

    const url = new URL(request.url);

    if (url.pathname === "/api/gcal/status" && request.method === "GET") {
      return jsonResponse(await googleCalendarStatus(user));
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "GET") {
      return jsonResponse(await refreshGoogleCalendars(user));
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "PUT") {
      const body = (await request.json()) as { selectedCalendarIds?: unknown };
      return jsonResponse(await updateGoogleCalendarSelection(user, body.selectedCalendarIds));
    }

    if (url.pathname === "/api/gcal/events" && request.method === "GET") {
      return jsonResponse(
        await googleCalendarEvents(
          user,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
    }

    if (url.pathname === "/api/gcal/disconnect" && request.method === "POST") {
      return jsonResponse(await disconnectGoogleCalendar(user));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Google Calendar failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/gcal/*"
};
