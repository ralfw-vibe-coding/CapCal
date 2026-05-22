import { readFile } from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return result;
}

async function loadEnv() {
  try {
    return parseEnv(await readFile(".env", "utf8"));
  } catch {
    return {};
  }
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} fehlt. Bitte in .env setzen.`);
  return value;
}

async function apiFetch(baseUrl, path, apiKey, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.error ?? text ?? response.statusText;
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${message}`);
  }
  return payload;
}

function nextOrder(items, field) {
  return items.reduce((max, item) => Math.max(max, Number(item?.[field] ?? 0)), 0) + 1;
}

async function askTaskTitle() {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question("Titel der neuen Aufgabe: ")).trim();
  } finally {
    rl.close();
  }
}

function createSmokeTask(state, title) {
  const now = new Date();
  const id = `api-smoke-${now.toISOString().replace(/[:.]/g, "-")}`;
  return {
    id,
    title: title || `API Smoke Test ${now.toLocaleString("de-DE")}`,
    description: "Diese Aufgabe wurde vom CapCal API-Smoke-Test angelegt.",
    tags: ["api-test"],
    dueDate: "",
    estimateMinutes: 30,
    status: "Ready",
    done: false,
    treeOrder: nextOrder(state.tasks, "treeOrder"),
    listOrder: nextOrder(state.tasks, "listOrder"),
    boardOrder: nextOrder(
      state.tasks.filter((task) => task?.status === "Ready"),
      "boardOrder"
    )
  };
}

const env = { ...(await loadEnv()), ...process.env };
const apiKey = requireValue(env.CAPCAL_API_KEY, "CAPCAL_API_KEY");
const baseUrl = env.CAPCAL_BASE_URL ?? "http://127.0.0.1:5173";
const taskTitle = await askTaskTitle();

console.log(`Lade Taskspace von ${baseUrl} ...`);
const state = await apiFetch(baseUrl, "/api/state", apiKey);

const task = createSmokeTask(state, taskTitle);
const nextState = {
  ...state,
  tasks: [task, ...(Array.isArray(state.tasks) ? state.tasks : [])],
  prioTaskIds: Array.isArray(state.prioTaskIds) ? state.prioTaskIds : [],
  prioDurations: state.prioDurations ?? {},
  bookings: Array.isArray(state.bookings) ? state.bookings : [],
  dailyCapacities: state.dailyCapacities ?? {}
};

console.log(`Fuege Aufgabe hinzu: ${task.title}`);
await apiFetch(baseUrl, "/api/state", apiKey, {
  method: "PUT",
  body: JSON.stringify(nextState)
});

console.log(`OK: Taskspace gespeichert. Neue Aufgabe: ${task.id}`);
