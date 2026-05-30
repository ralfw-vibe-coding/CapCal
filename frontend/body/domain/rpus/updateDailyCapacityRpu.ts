// Command-RPU: setzt die Kapazitaet eines einzelnen Tages.
//
// Faellt auf die Default-Kapazitaet aus den Settings zurueck, wenn der Tag noch
// keinen Eintrag hat. Die Planungskapazitaet wird auf die Tageskapazitaet
// begrenzt.

import { defaultSettings } from "../constants";
import type { TaskspaceStore } from "../taskspaceStore";
import type { DailyCapacity } from "../types";
import type { Rpu } from "./rpu";

export type UpdateDailyCapacityRequest = { date: string; patch: Partial<DailyCapacity> };

export class UpdateDailyCapacityRpu implements Rpu<UpdateDailyCapacityRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: UpdateDailyCapacityRequest): void {
    const state = this.store.read();
    if (!state) return;

    const settings = state.settings ?? defaultSettings;
    const current = state.dailyCapacities?.[request.date] ?? {
      dayCapacityMinutes: settings.defaultDayCapacityMinutes,
      planningCapacityMinutes: settings.defaultPlanningCapacityMinutes
    };
    const nextCapacity = { ...current, ...request.patch };
    if (nextCapacity.planningCapacityMinutes > nextCapacity.dayCapacityMinutes) {
      nextCapacity.planningCapacityMinutes = nextCapacity.dayCapacityMinutes;
    }

    this.store.write({
      ...state,
      dailyCapacities: { ...(state.dailyCapacities ?? {}), [request.date]: nextCapacity }
    });
  }
}
