// Command-RPU: aendert die Default-Kapazitaeten.
//
// Setzt die Default-Tages- und -Planungskapazitaet. Bestehende Tage mit
// Buchungen erhalten dabei einen expliziten Kapazitaetseintrag mit dem alten
// Default, damit ihre Auslastung stabil bleibt. Die Planungskapazitaet wird
// auf die Tageskapazitaet begrenzt.

import { defaultSettings } from "../constants";
import type { TaskspaceStore } from "../taskspaceStore";
import type { AppSettings } from "../types";
import type { Rpu } from "./rpu";

export type UpdateCapacityDefaultsRequest = {
  patch: Pick<Partial<AppSettings>, "defaultDayCapacityMinutes" | "defaultPlanningCapacityMinutes">;
};

export class UpdateCapacityDefaultsRpu implements Rpu<UpdateCapacityDefaultsRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: UpdateCapacityDefaultsRequest): void {
    const state = this.store.read();
    if (!state) return;

    const currentSettings = { ...defaultSettings, ...(state.settings ?? {}) };
    const currentDefaultCapacity = {
      dayCapacityMinutes: currentSettings.defaultDayCapacityMinutes,
      planningCapacityMinutes: currentSettings.defaultPlanningCapacityMinutes
    };
    const dailyCapacities = { ...(state.dailyCapacities ?? {}) };
    for (const date of new Set(state.bookings.map((booking) => booking.date))) {
      if (!dailyCapacities[date]) dailyCapacities[date] = currentDefaultCapacity;
    }

    const nextSettings = { ...currentSettings, ...request.patch };
    if (nextSettings.defaultPlanningCapacityMinutes > nextSettings.defaultDayCapacityMinutes) {
      nextSettings.defaultPlanningCapacityMinutes = nextSettings.defaultDayCapacityMinutes;
    }

    this.store.write({ ...state, dailyCapacities, settings: nextSettings });
  }
}
