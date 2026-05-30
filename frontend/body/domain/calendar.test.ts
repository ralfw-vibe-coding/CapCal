import { test } from "node:test";
import assert from "node:assert/strict";
import { capacityLevelFor, externalBookedMinutes } from "./calendar";
import type { DailyCapacity, GoogleCalendarEvent } from "./types";

const capacity: DailyCapacity = { dayCapacityMinutes: 480, planningCapacityMinutes: 360 };

function event(partial: Partial<GoogleCalendarEvent>): GoogleCalendarEvent {
  return {
    id: "e",
    provider: "google",
    calendarId: "c",
    calendarSummary: "c",
    summary: "e",
    startAt: "2026-05-30T09:00:00Z",
    endAt: "2026-05-30T10:00:00Z",
    allDay: false,
    blocksTime: true,
    ...partial
  };
}

test("capacityLevelFor classifies under/near/over plan", () => {
  assert.equal(capacityLevelFor(0, capacity), "under-plan");
  assert.equal(capacityLevelFor(300, capacity), "near-plan"); // >= 360*0.8 = 288
  assert.equal(capacityLevelFor(470, capacity), "over-plan"); // >= 360 + 120*0.8 = 456
});

test("externalBookedMinutes: non-blocking events are ignored", () => {
  assert.equal(externalBookedMinutes([event({ blocksTime: false })], capacity), 0);
});

test("externalBookedMinutes: all-day event blocks the full day capacity", () => {
  assert.equal(externalBookedMinutes([event({ allDay: true })], capacity), 480);
});

test("externalBookedMinutes: timed event counts its duration", () => {
  assert.equal(
    externalBookedMinutes([event({ startAt: "2026-05-30T09:00:00Z", endAt: "2026-05-30T11:30:00Z" })], capacity),
    150
  );
});
