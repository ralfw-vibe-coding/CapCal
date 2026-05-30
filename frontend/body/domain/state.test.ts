import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "./state";
import type { AppState } from "./types";

test("normalizeState fills settings defaults and arrays", () => {
  const result = normalizeState({ tasks: [], prioTaskIds: [], bookings: [] } as unknown as AppState);
  assert.equal(result.settings?.defaultDayCapacityMinutes, 480);
  assert.equal(result.settings?.taskView, "list");
  assert.deepEqual(result.dailyCapacities, {});
  assert.deepEqual(result.prioDurations, {});
  assert.deepEqual(result.dayTemplates, []);
});

test("normalizeState coerces invalid view/status to defaults", () => {
  const result = normalizeState({
    tasks: [],
    prioTaskIds: [],
    bookings: [],
    settings: { taskView: "nonsense", calendarView: "nonsense", defaultTaskStatus: "Nope" }
  } as unknown as AppState);
  assert.equal(result.settings?.taskView, "list");
  assert.equal(result.settings?.calendarView, "days");
  assert.equal(result.settings?.defaultTaskStatus, "Backlog");
});

test("normalizeState fills booking label/description", () => {
  const result = normalizeState({
    tasks: [],
    prioTaskIds: [],
    bookings: [{ id: "b1", date: "2026-05-30", durationMinutes: 60 }]
  } as unknown as AppState);
  assert.equal(result.bookings[0].label, "");
  assert.equal(result.bookings[0].description, "");
});
