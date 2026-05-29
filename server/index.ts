import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import {
  clearSessionCookie,
  getApiKeyUser,
  getUserSettings,
  getSessionUser,
  isAuthRequired,
  requestOtp,
  rotateApiKey,
  sessionCookie,
  updateUserProfile,
  verifyOtp
} from "../src/server/auth";
import {
  disconnectGoogleCalendar,
  googleCalendarCallback,
  googleCalendarConnectUrl,
  googleCalendarErrorRedirect,
  googleCalendarEvents,
  googleCalendarStatus,
  refreshGoogleCalendars,
  updateGoogleCalendarSelection
} from "../src/server/googleCalendar";
import {
  connectICloudCalendar,
  disconnectICloudCalendar,
  iCloudCalendarEvents,
  iCloudCalendarStatus,
  refreshICloudCalendars,
  updateICloudCalendarSelection
} from "../src/server/icloudCalendar";
import { createStateProvider } from "../src/server/storage";

async function readBody(request: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function redirect(response: ServerResponse, location: string) {
  response.writeHead(302, { location });
  response.end();
}

const server = createServer(async (request, response) => {
  try {
    const provider = createStateProvider();
    const url = new URL(request.url ?? "/", "http://127.0.0.1:3001");

    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }

    if (url.pathname === "/api/auth/request-otp" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      await requestOtp(String(body.email ?? ""));
      send(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/auth/verify" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      const user = await verifyOtp(String(body.email ?? ""), String(body.otp ?? ""));
      send(response, 200, { user }, { "set-cookie": sessionCookie(user) });
      return;
    }

    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = getSessionUser(request.headers.cookie);
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, { user });
      return;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      send(response, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
      return;
    }

    if (url.pathname === "/api/auth/gcal/connect" && request.method === "GET") {
      const user = getSessionUser(request.headers.cookie);
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      redirect(response, googleCalendarConnectUrl(user));
      return;
    }

    if (url.pathname === "/api/auth/gcal/callback" && request.method === "GET") {
      try {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) throw new Error("Google callback is missing code or state");
        redirect(response, await googleCalendarCallback(code, state));
      } catch (error) {
        console.error("[CapCal] Google Calendar callback failed:", error);
        redirect(response, googleCalendarErrorRedirect(error));
      }
      return;
    }

    const user = getSessionUser(request.headers.cookie) ?? (await getApiKeyUser(request.headers.authorization));
    if (isAuthRequired() && !user) {
      send(response, 401, { error: "Unauthorized" });
      return;
    }

    if (url.pathname === "/api/gcal/status" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await googleCalendarStatus(user));
      return;
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await refreshGoogleCalendars(user));
      return;
    }

    if (url.pathname === "/api/gcal/calendars" && request.method === "PUT") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      const body = JSON.parse(await readBody(request));
      send(response, 200, await updateGoogleCalendarSelection(user, body.selectedCalendarIds));
      return;
    }

    if (url.pathname === "/api/gcal/events" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(
        response,
        200,
        await googleCalendarEvents(
          user,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
      return;
    }

    if (url.pathname === "/api/gcal/disconnect" && request.method === "POST") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await disconnectGoogleCalendar(user));
      return;
    }

    if (url.pathname === "/api/icloud/status" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await iCloudCalendarStatus(user));
      return;
    }

    if (url.pathname === "/api/icloud/connect" && request.method === "POST") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      const body = JSON.parse(await readBody(request));
      send(response, 200, await connectICloudCalendar(user, body));
      return;
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await refreshICloudCalendars(user));
      return;
    }

    if (url.pathname === "/api/icloud/calendars" && request.method === "PUT") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      const body = JSON.parse(await readBody(request));
      send(response, 200, await updateICloudCalendarSelection(user, body.selectedCalendarIds));
      return;
    }

    if (url.pathname === "/api/icloud/events" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(
        response,
        200,
        await iCloudCalendarEvents(
          user,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          url.searchParams.get("refresh") === "1"
        )
      );
      return;
    }

    if (url.pathname === "/api/icloud/disconnect" && request.method === "POST") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await disconnectICloudCalendar(user));
      return;
    }

    if (url.pathname === "/api/user-settings" && request.method === "GET") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await getUserSettings(user));
      return;
    }

    if (url.pathname === "/api/user-settings" && request.method === "PUT") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      const body = JSON.parse(await readBody(request));
      send(response, 200, await updateUserProfile(user, body.profile ?? {}));
      return;
    }

    if (url.pathname === "/api/user-settings/api-key" && request.method === "POST") {
      if (!user) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      send(response, 200, await rotateApiKey(user));
      return;
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      send(response, 200, await provider.load(user?.id));
      return;
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      const state = JSON.parse(await readBody(request));
      await provider.save(state, user?.id);
      send(response, 200, state);
      return;
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "State provider failed" });
  }
});

const port = Number(process.env.PORT) || 3001;
server.listen(port, "127.0.0.1", () => {
  console.log(`CapCal data server listening on http://127.0.0.1:${port}`);
});
