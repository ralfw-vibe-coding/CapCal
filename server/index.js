import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = join(root, "data", "capcal.json");

const today = new Date().toISOString().slice(0, 10);

const seedData = {
  dailyCapacities: {
    [today]: {
      dayCapacityMinutes: 480,
      planningCapacityMinutes: 360
    }
  },
  tasks: [
    {
      id: "task-1",
      title: "CapCal PoC durchspielen",
      dueDate: today,
      estimateMinutes: 90,
      status: "Started",
      done: false,
      treeOrder: 0
    },
    {
      id: "task-2",
      title: "Status-Icons prüfen",
      dueDate: today,
      estimateMinutes: 30,
      status: "Ready",
      done: false,
      treeOrder: 1
    },
    {
      id: "task-3",
      title: "Blocked-Aufgabe sichtbar halten",
      dueDate: today,
      estimateMinutes: 45,
      status: "Blocked",
      done: false,
      treeOrder: 2
    }
  ],
  prioTaskIds: ["task-2", "task-3"],
  bookings: [
    {
      id: "booking-1",
      taskId: "task-1",
      date: today,
      startTime: "09:00",
      durationMinutes: 60
    }
  ]
};

async function ensureDataFile() {
  await mkdir(dirname(dataPath), { recursive: true });
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    await writeFile(dataPath, JSON.stringify(seedData, null, 2));
    return seedData;
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    send(response, 204, {});
    return;
  }

  if (request.url === "/api/state" && request.method === "GET") {
    send(response, 200, await ensureDataFile());
    return;
  }

  if (request.url === "/api/state" && request.method === "PUT") {
    try {
      const body = await readBody(request);
      const state = JSON.parse(body);
      await mkdir(dirname(dataPath), { recursive: true });
      await writeFile(dataPath, JSON.stringify(state, null, 2));
      send(response, 200, state);
    } catch (error) {
      send(response, 400, { error: error instanceof Error ? error.message : "Invalid payload" });
    }
    return;
  }

  send(response, 404, { error: "Not found" });
});

server.listen(3001, "127.0.0.1", () => {
  console.log("CapCal data server listening on http://127.0.0.1:3001");
});
