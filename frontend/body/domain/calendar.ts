// Domaenenlogik fuer Kalender: externe Events, Kapazitaet, Tageslayout.
// Reine Funktionen, keine UI-Technologie.

import {
  addDays,
  dateFromDateTime,
  datePart,
  formatDate,
  minutesBetween,
  timeFromDateTime,
  timeToMinutes
} from "./dateTime";
import type { DailyCapacity, GoogleCalendarEvent } from "./types";

export function externalEventTimeLabel(event: GoogleCalendarEvent) {
  const startDate = event.allDay ? datePart(event.startAt) : dateFromDateTime(event.startAt);
  const endDate = event.allDay ? addDays(datePart(event.endAt), -1) : dateFromDateTime(event.endAt);
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  if (event.allDay) {
    return startDate === endDate ? `${formattedStartDate}, ganztägig` : `${formattedStartDate} bis ${formattedEndDate}, ganztägig`;
  }

  const startTime = timeFromDateTime(event.startAt);
  const endTime = timeFromDateTime(event.endAt);
  return startDate === endDate
    ? `${formattedStartDate}, ${startTime}-${endTime}`
    : `${formattedStartDate}, ${startTime} bis ${formattedEndDate}, ${endTime}`;
}

export function externalEventDates(event: GoogleCalendarEvent) {
  const startDate = event.allDay ? datePart(event.startAt) : dateFromDateTime(event.startAt);
  const endDate = event.allDay ? addDays(datePart(event.endAt), -1) : dateFromDateTime(event.endAt);
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates.length > 0 ? dates : [startDate];
}

export function isMultiDayTimedExternalEvent(event: GoogleCalendarEvent) {
  return !event.allDay && dateFromDateTime(event.startAt) !== dateFromDateTime(event.endAt);
}

export function externalTimedSegmentForDate(
  event: GoogleCalendarEvent,
  date: string,
  calendarStartMinutes: number,
  calendarEndMinutes: number
) {
  const startDate = dateFromDateTime(event.startAt);
  const endDate = dateFromDateTime(event.endAt);
  const rawStartMinutes = date === startDate ? timeToMinutes(timeFromDateTime(event.startAt)) : 0;
  const rawEndMinutes = date === endDate ? timeToMinutes(timeFromDateTime(event.endAt)) : 24 * 60;
  const startMinutes = Math.max(calendarStartMinutes, rawStartMinutes);
  const endMinutes = Math.min(calendarEndMinutes, rawEndMinutes);
  if (endMinutes <= startMinutes) return null;
  return { startMinutes, endMinutes };
}

export function externalBookedMinutes(
  events: GoogleCalendarEvent[],
  capacity: DailyCapacity,
  date?: string,
  calendarStartMinutes?: number,
  calendarEndMinutes?: number
) {
  return events.reduce((sum, event) => {
    if (!event.blocksTime) return sum;
    if (event.allDay) return sum + capacity.dayCapacityMinutes;
    if (isMultiDayTimedExternalEvent(event)) {
      if (date === undefined || calendarStartMinutes === undefined || calendarEndMinutes === undefined) {
        return sum + Math.min(capacity.dayCapacityMinutes, minutesBetween(event.startAt, event.endAt));
      }
      const segment = externalTimedSegmentForDate(event, date, calendarStartMinutes, calendarEndMinutes);
      return sum + Math.min(capacity.dayCapacityMinutes, segment ? segment.endMinutes - segment.startMinutes : 0);
    }
    return sum + Math.min(capacity.dayCapacityMinutes, minutesBetween(event.startAt, event.endAt));
  }, 0);
}

export function capacityLevelFor(bookedMinutes: number, capacity: DailyCapacity) {
  const redCapacityThreshold =
    capacity.planningCapacityMinutes + (capacity.dayCapacityMinutes - capacity.planningCapacityMinutes) * 0.8;
  if (bookedMinutes >= redCapacityThreshold) return "over-plan";
  if (bookedMinutes >= capacity.planningCapacityMinutes * 0.8) return "near-plan";
  return "under-plan";
}
