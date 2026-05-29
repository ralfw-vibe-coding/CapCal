// Command-RPU: legt eine freie Buchung ohne Aufgabenbezug an.
//
// No-op bei leerem Label. Die Dauer entspricht der Default-Planungsdauer.

import { defaultSettings, today } from "../constants";
import { uid } from "../id";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type AddLooseBookingRequest = { label: string; date?: string; startTime?: string };

export class AddLooseBookingRpu implements Rpu<AddLooseBookingRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: AddLooseBookingRequest): void {
    const state = this.store.read();
    if (!state) return;
    const trimmed = request.label.trim();
    if (!trimmed) return;

    this.store.write({
      ...state,
      bookings: [
        ...state.bookings,
        {
          id: uid("booking"),
          label: trimmed,
          description: "",
          date: request.date ?? today,
          startTime: request.startTime,
          durationMinutes: (state.settings ?? defaultSettings).defaultPrioDurationMinutes
        }
      ]
    });
  }
}
