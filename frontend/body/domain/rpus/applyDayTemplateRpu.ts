// Command-RPU: wendet eine Tagesvorlage auf einen Tag an.
//
// Fuer jeden Slot wird eine freie Buchung am Zieltag angelegt. Liefert die
// Anzahl angewendeter Slots; 0, wenn die Vorlage nicht existiert.

import { uid } from "../id";
import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type ApplyDayTemplateRequest = { templateId: string; date: string };

export class ApplyDayTemplateRpu implements Rpu<ApplyDayTemplateRequest, number> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: ApplyDayTemplateRequest): number {
    const state = this.store.read();
    if (!state) return 0;

    const template = state.dayTemplates?.find((candidate) => candidate.id === request.templateId);
    if (!template) return 0;

    this.store.write({
      ...state,
      bookings: [
        ...state.bookings,
        ...template.slots.map((slot) => ({
          id: uid("booking"),
          label: slot.label,
          description: slot.description ?? "",
          date: request.date,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes
        }))
      ]
    });
    return template.slots.length;
  }
}
