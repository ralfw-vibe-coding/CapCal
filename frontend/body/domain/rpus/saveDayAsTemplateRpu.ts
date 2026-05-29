// Command-RPU: speichert die freien Buchungen eines Tages als Tagesvorlage.
//
// Nur Buchungen ohne Aufgabenbezug werden uebernommen (nach Startzeit
// sortiert). Bei leerem Namen oder ohne passende Buchungen passiert nichts.
// Liefert zurueck, ob gespeichert wurde und wie viele Slots entstanden sind.

import { uid } from "../id";
import type { TaskspaceStore } from "../taskspaceStore";
import type { DayTemplateSlot } from "../types";
import type { Rpu } from "./rpu";

export type SaveDayAsTemplateRequest = { date: string; name: string };
export type SaveDayAsTemplateResponse = { saved: boolean; count: number };

export class SaveDayAsTemplateRpu implements Rpu<SaveDayAsTemplateRequest, SaveDayAsTemplateResponse> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: SaveDayAsTemplateRequest): SaveDayAsTemplateResponse {
    const state = this.store.read();
    if (!state) return { saved: false, count: 0 };

    const trimmedName = request.name.trim();
    if (!trimmedName) return { saved: false, count: 0 };

    const slots = state.bookings
      .filter((booking) => booking.date === request.date && !booking.taskId)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
      .map((booking): DayTemplateSlot => ({
        label: booking.label?.trim() || "Reservierung",
        description: booking.description ?? "",
        startTime: booking.startTime,
        durationMinutes: booking.durationMinutes
      }));

    if (slots.length === 0) return { saved: false, count: 0 };

    this.store.write({
      ...state,
      dayTemplates: [
        ...(state.dayTemplates ?? []),
        { id: uid("template"), name: trimmedName, slots, createdAt: new Date().toISOString() }
      ]
    });
    return { saved: true, count: slots.length };
  }
}
