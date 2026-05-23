import type { Config } from "@netlify/functions";
import { getSessionUser } from "../../src/server/auth";
import {
  connectICloudCalendar,
  disconnectICloudCalendar,
  iCloudCalendarEvents,
  iCloudCalendarStatus,
  refreshICloudCalendars,
  updateICloudCalendarSelection
} from "../../src/server/icloudCalendar";

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

    if (url.pathname === "/api/icloud/status" && request.method === "GET") {
      return jsonResponse(await iCloudCalendarStatus(user));
    }

    if (url.pathname === "/api/icloud/connect" && request.method === "POST") {
      const body = (await request.json()) as { appleId?: unknown; appPassword?: unknown };
      return jsonResponse(await connectICloudCalendar(user, body));
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "GET") {
      return jsonResponse(await refreshICloudCalendars(user));
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "PUT") {
      const body = (await request.json()) as { selectedCalendarIds?: unknown };
      return jsonResponse(await updateICloudCalendarSelection(user, body.selectedCalendarIds));
    }

    if (url.pathname === "/api/icloud/events" && request.method === "GET") {
      return jsonResponse(
        await iCloudCalendarEvents(
          user,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
    }

    if (url.pathname === "/api/icloud/disconnect" && request.method === "POST") {
      return jsonResponse(await disconnectICloudCalendar(user));
    }

    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "iCloud Calendar failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/icloud/*"
};
