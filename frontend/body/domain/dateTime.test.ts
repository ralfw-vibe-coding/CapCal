import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, minutesBetween, timeToMinutes, minutesToTime, isWeekend } from "./dateTime";

test("addDays adds and subtracts calendar days", () => {
  assert.equal(addDays("2026-05-30", 1), "2026-05-31");
  assert.equal(addDays("2026-05-31", 1), "2026-06-01");
  assert.equal(addDays("2026-06-01", -1), "2026-05-31");
});

test("timeToMinutes / minutesToTime roundtrip", () => {
  assert.equal(timeToMinutes("06:30"), 390);
  assert.equal(minutesToTime(390), "06:30");
  assert.equal(minutesToTime(0), "00:00");
});

test("minutesBetween clamps to zero and rounds", () => {
  assert.equal(minutesBetween("2026-05-30T09:00:00Z", "2026-05-30T10:30:00Z"), 90);
  assert.equal(minutesBetween("2026-05-30T10:00:00Z", "2026-05-30T09:00:00Z"), 0);
});

test("isWeekend detects saturday and sunday", () => {
  assert.equal(isWeekend("2026-05-30"), true); // Saturday
  assert.equal(isWeekend("2026-05-31"), true); // Sunday
  assert.equal(isWeekend("2026-05-29"), false); // Friday
});
