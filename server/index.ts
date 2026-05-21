import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { createStateProvider } from "../src/server/storage";

async function readBody(request: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  try {
    const provider = createStateProvider();

    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }

    if (request.url === "/api/state" && request.method === "GET") {
      send(response, 200, await provider.load());
      return;
    }

    if (request.url === "/api/state" && request.method === "PUT") {
      const state = JSON.parse(await readBody(request));
      await provider.save(state);
      send(response, 200, state);
      return;
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "State provider failed" });
  }
});

server.listen(3001, "127.0.0.1", () => {
  console.log("CapCal data server listening on http://127.0.0.1:3001");
});
