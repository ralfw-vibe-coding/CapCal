// Reine Datums- und Zeit-Helfer fuer die Domaene. Keine UI-Technologie.

import { today } from "./constants";

export function addDays(date: string, count: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + count);
  return next.toISOString().slice(0, 10);
}

export function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, count: number) {
  const next = new Date(`${startOfMonth(date)}T12:00:00`);
  next.setMonth(next.getMonth() + count);
  return next.toISOString().slice(0, 10);
}

export function endOfMonth(date: string) {
  return addDays(addMonths(date, 1), -1);
}

export function createMonthDays(monthStart: string, showWeekends: boolean) {
  const days: string[] = [];
  let cursor = startOfMonth(monthStart);
  const monthKey = cursor.slice(0, 7);
  while (cursor.slice(0, 7) === monthKey) {
    if (showWeekends || !isWeekend(cursor)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function formatMonthTitle(monthStart: string) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(`${monthStart}T12:00:00`));
}

export function formatMonthTileDay(date: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit" }).format(new Date(`${date}T12:00:00`));
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(
    new Date(`${date}T12:00:00`)
  );
}

export function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

export function isMonday(date: string) {
  return new Date(`${date}T12:00:00`).getDay() === 1;
}

export function formatOptionalDate(date?: string) {
  return date ? formatDate(date) : "Keine Deadline";
}

export function deadlineTone(dueDate?: string) {
  if (!dueDate) return "";
  const due = new Date(`${dueDate}T12:00:00`).getTime();
  const current = new Date(`${today}T12:00:00`).getTime();
  const daysUntilDue = Math.round((due - current) / 86_400_000);
  if (daysUntilDue <= 0) return "deadline-due";
  if (daysUntilDue <= 3) return "deadline-soon";
  return "";
}

export function dateFromDateTime(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function datePart(value: string) {
  return value.slice(0, 10);
}

export function timeFromDateTime(value: string) {
  const date = new Date(value);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

export function minutesBetween(startAt: string, endAt: string) {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

export function createTimeOptions(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const count = Math.max(1, Math.floor((endMinutes - startMinutes) / 15) + 1);
  return Array.from({ length: count }, (_, index) => minutesToTime(startMinutes + index * 15));
}

export function createCalendarPeriod(startDate: string, visibleDayCount: number, showWeekends: boolean) {
  const nextDays: string[] = [];
  let cursor = startDate;
  while (nextDays.length < visibleDayCount) {
    if (showWeekends || !isWeekend(cursor)) nextDays.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nextDays;
}

export function nextVisibleDate(date: string, showWeekends: boolean) {
  let cursor = addDays(date, 1);
  while (!showWeekends && isWeekend(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

export function browserUtcOffset() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:00`;
}
