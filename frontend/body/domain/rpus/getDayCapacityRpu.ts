// Query-RPU (Kapazitaet): Tageskapazitaet und -auslastung fuer ein Datum.
//
// Loest die geltende Tageskapazitaet auf (Tageswert oder Default aus den
// Settings), summiert die gebuchten Minuten der CapCal-Buchungen und addiert
// die blockierenden Minuten externer Kalender-Events. Externe Events und das
// Kalenderfenster kommen als Request, da sie keine Domaenendaten sind.

import { capacityLevelFor, externalBookedMinutes } from "../calendar";
import type { TaskspaceStore } from "../taskspaceStore";
import type { DailyCapacity, GoogleCalendarEvent } from "../types";
import type { Rpu } from "./rpu";

export type GetDayCapacityRequest = {
  date: string;
  externalEvents: GoogleCalendarEvent[];
  calendarStartMinutes: number;
  calendarEndMinutes: number;
};

export type DayCapacity = {
  capacity: DailyCapacity;
  capcalMinutes: number;
  externalMinutes: number;
  bookedMinutes: number;
  level: string;
  isOverbooked: boolean;
};

export class GetDayCapacityRpu implements Rpu<GetDayCapacityRequest, DayCapacity> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: GetDayCapacityRequest): DayCapacity {
    const state = this.store.read();
    const settings = state?.settings;
    const capacity: DailyCapacity = state?.dailyCapacities?.[request.date] ?? {
      dayCapacityMinutes: settings?.defaultDayCapacityMinutes ?? 480,
      planningCapacityMinutes: settings?.defaultPlanningCapacityMinutes ?? 360
    };

    const capcalMinutes = (state?.bookings ?? [])
      .filter((booking) => booking.date === request.date)
      .reduce((sum, booking) => sum + booking.durationMinutes, 0);

    const externalMinutes = externalBookedMinutes(
      request.externalEvents,
      capacity,
      request.date,
      request.calendarStartMinutes,
      request.calendarEndMinutes
    );

    const bookedMinutes = capcalMinutes + externalMinutes;

    return {
      capacity,
      capcalMinutes,
      externalMinutes,
      bookedMinutes,
      level: capacityLevelFor(bookedMinutes, capacity),
      isOverbooked: bookedMinutes > capacity.dayCapacityMinutes
    };
  }
}
