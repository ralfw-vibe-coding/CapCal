import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plainTextFromHtml,
  minutesToTimeLabel,
  parseDurationInput,
  minutesToLabel,
  estimateToLabel,
  maskVisibleApiKey,
  safeMarkdownHref
} from "./formatting";
import {
  startOfMonth,
  addMonths,
  endOfMonth,
  createMonthDays,
  formatMonthTitle,
  formatMonthTileDay,
  formatDate,
  isMonday,
  formatOptionalDate,
  deadlineTone,
  dateFromDateTime,
  datePart,
  timeFromDateTime,
  createTimeOptions,
  createCalendarPeriod,
  nextVisibleDate,
  browserUtcOffset
} from "./dateTime";
import {
  sortByOrder,
  sortedTasks,
  sortedListTasks,
  sortedBoardTasks,
  normalizeTaskVisibleIn,
  moveItemToDropTarget,
  normalizeTreeFilters,
  normalizeTaskStatuses,
  normalizeDayTemplates
} from "./tasks";
import {
  externalEventTimeLabel,
  externalEventDates,
  isMultiDayTimedExternalEvent,
  externalTimedSegmentForDate
} from "./calendar";
import type { GoogleCalendarEvent, Task, TaskStatus } from "./types";

test("formatting helpers", () => {
  assert.equal(plainTextFromHtml("<p>a<br/>b</p>&amp;c"), "a\nb\n&c");
  assert.equal(plainTextFromHtml(undefined), "");
  assert.equal(minutesToTimeLabel(90), "01:30");
  assert.equal(minutesToLabel(45), "45m");
  assert.equal(minutesToLabel(60), "1h");
  assert.equal(minutesToLabel(90), "1h 30m");
  assert.equal(estimateToLabel(undefined), "?");
  assert.equal(estimateToLabel(960), "2d"); // 2 * 8h
  assert.equal(estimateToLabel(4800), "2w"); // 2 * (5 * 8h)
  assert.equal(estimateToLabel(90), "01:30");
  assert.equal(maskVisibleApiKey("capcal_abcdefg"), "••••••••••••••••cdefg");
});

test("parseDurationInput accepts minutes, hh:mm and Nh Nm", () => {
  assert.equal(parseDurationInput("90"), 90);
  assert.equal(parseDurationInput("01:30"), 90);
  assert.equal(parseDurationInput("2h"), 120);
  assert.equal(parseDurationInput("1h30"), 90);
  assert.equal(parseDurationInput(""), undefined);
  assert.equal(parseDurationInput("nonsense"), undefined);
});

test("safeMarkdownHref only allows http(s)/mailto and www", () => {
  assert.equal(safeMarkdownHref("https://x.de"), "https://x.de");
  assert.equal(safeMarkdownHref("www.x.de"), "https://www.x.de");
  assert.equal(safeMarkdownHref("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(safeMarkdownHref("javascript:alert(1)"), undefined);
  assert.equal(safeMarkdownHref("not a url"), undefined);
});

test("month/date helpers", () => {
  assert.equal(startOfMonth("2026-05-30"), "2026-05-01");
  assert.equal(addMonths("2026-05-15", 1), "2026-06-01");
  assert.equal(endOfMonth("2026-05-10"), "2026-05-31");
  assert.equal(isMonday("2026-06-01"), true);
  assert.equal(datePart("2026-05-30T12:00:00Z"), "2026-05-30");
  assert.equal(formatOptionalDate(undefined), "Keine Deadline");
  assert.ok(formatOptionalDate("2026-05-30").length > 0);
  assert.ok(formatDate("2026-05-30").length > 0);
  assert.ok(formatMonthTitle("2026-05-01").length > 0);
  assert.ok(formatMonthTileDay("2026-05-09").length > 0);
  assert.ok(browserUtcOffset().startsWith("UTC"));
  const monthDays = createMonthDays("2026-05-01", false);
  assert.ok(monthDays.every((d) => d.startsWith("2026-05")));
  assert.ok(monthDays.length >= 20 && monthDays.length <= 21);
});

test("deadlineTone reflects urgency relative to today", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(deadlineTone(undefined), "");
  assert.equal(deadlineTone(today), "deadline-due");
  const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(deadlineTone(inTenDays), "");
});

test("calendar period helpers", () => {
  const period = createCalendarPeriod("2026-05-29", 5, false); // Fri, skip weekend
  assert.equal(period.length, 5);
  assert.ok(!period.includes("2026-05-30")); // Saturday skipped
  assert.equal(nextVisibleDate("2026-05-29", false), "2026-06-01"); // Fri -> Mon
  const options = createTimeOptions("06:00", "07:00");
  assert.deepEqual(options, ["06:00", "06:15", "06:30", "06:45", "07:00"]);
  assert.equal(dateFromDateTime("2026-05-30T08:30:00Z").length, 10);
  assert.ok(/^\d\d:\d\d$/.test(timeFromDateTime("2026-05-30T08:30:00Z")));
});

test("task sort + move helpers", () => {
  const tasks: Task[] = [
    { id: "a", title: "a", status: "Backlog", done: false, treeOrder: 2, listOrder: 1, boardOrder: 0 },
    { id: "b", title: "b", status: "Backlog", done: false, treeOrder: 1, listOrder: 0, boardOrder: 1 }
  ];
  assert.deepEqual(sortedTasks(tasks).map((t) => t.id), ["b", "a"]);
  assert.deepEqual(sortedListTasks(tasks).map((t) => t.id), ["b", "a"]);
  assert.deepEqual(sortedBoardTasks(tasks).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(sortByOrder([{ id: "x" }, { id: "y" }], () => undefined).map((t) => t.id), ["x", "y"]);
  assert.deepEqual(moveItemToDropTarget([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(moveItemToDropTarget([1, 2, 3], 0, 0), [1, 2, 3]);
});

test("normalize helpers", () => {
  assert.deepEqual(normalizeTaskVisibleIn(undefined), { list: true, board: true, hierarchy: true });
  assert.deepEqual(normalizeTaskVisibleIn({ list: false }), { list: false, board: true, hierarchy: true });
  assert.deepEqual(normalizeTaskStatuses(["Ready", "Nope", "Done"]), ["Ready", "Done"]);
  const filters = normalizeTreeFilters({ query: "x", statuses: ["Ready", "Bad"] as unknown as TaskStatus[], tags: [" t ", "t"] });
  assert.equal(filters.query, "x");
  assert.deepEqual(filters.statuses, ["Ready"]);
  assert.deepEqual(filters.tags, ["t"]);
  const templates = normalizeDayTemplates([
    { id: "t1", name: "Mo", slots: [{ label: "x", durationMinutes: 60 }, { durationMinutes: 0 }] },
    { name: "no id" },
    "garbage"
  ]);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].slots.length, 1);
});

function ev(partial: Partial<GoogleCalendarEvent>): GoogleCalendarEvent {
  return {
    id: "e", provider: "google", calendarId: "c", calendarSummary: "c", summary: "e",
    startAt: "2026-05-30T09:00:00Z", endAt: "2026-05-30T10:00:00Z", allDay: false, blocksTime: true, ...partial
  };
}

test("external event label/date helpers", () => {
  assert.ok(externalEventTimeLabel(ev({})).length > 0);
  assert.ok(externalEventTimeLabel(ev({ allDay: true, startAt: "2026-05-30", endAt: "2026-05-31" })).includes("ganztägig"));
  const multi = ev({ startAt: "2026-05-30T09:00:00", endAt: "2026-05-31T10:00:00" });
  assert.equal(isMultiDayTimedExternalEvent(multi), true);
  assert.ok(externalEventDates(multi).length >= 2);
  const segment = externalTimedSegmentForDate(multi, "2026-05-30", 360, 1200);
  assert.ok(segment && segment.endMinutes > segment.startMinutes);
  assert.equal(externalTimedSegmentForDate(ev({}), "1999-01-01", 0, 0), null);
});
