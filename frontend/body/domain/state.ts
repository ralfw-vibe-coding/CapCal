// Normalisierung des kompletten Taskspace-Zustands. Reine Funktion, keine UI-Technologie.

import { defaultSettings, statuses } from "./constants";
import { normalizeDayTemplates, normalizeTaskStatuses, normalizeTasks, normalizeTreeFilters } from "./tasks";
import type { AppState, TaskStatus } from "./types";

export function normalizeState(rawState: AppState): AppState {
  const rawTaskView = rawState.settings?.taskView;
  const rawCalendarView = rawState.settings?.calendarView;
  return {
    ...rawState,
    settings: {
      ...defaultSettings,
      ...(rawState.settings ?? {}),
      defaultTaskStatus: statuses.includes(rawState.settings?.defaultTaskStatus as TaskStatus)
        ? (rawState.settings?.defaultTaskStatus as TaskStatus)
        : defaultSettings.defaultTaskStatus,
      calendarView: rawCalendarView === "month" ? "month" : "days",
      taskView: rawTaskView === "board" || rawTaskView === "hierarchy" ? rawTaskView : "list",
      hierarchyExpandedTaskIds: Array.isArray(rawState.settings?.hierarchyExpandedTaskIds)
        ? rawState.settings.hierarchyExpandedTaskIds.filter((id): id is string => typeof id === "string")
        : [],
      treeFilters: normalizeTreeFilters(rawState.settings?.treeFilters),
      boardHiddenStatuses: normalizeTaskStatuses(rawState.settings?.boardHiddenStatuses),
      panelsCollapsed: {
        ...defaultSettings.panelsCollapsed,
        ...(rawState.settings?.panelsCollapsed ?? {})
      }
    },
    dailyCapacities: rawState.dailyCapacities ?? {},
    tasks: normalizeTasks(rawState.tasks ?? []),
    prioTaskIds: rawState.prioTaskIds ?? [],
    prioDurations: rawState.prioDurations ?? {},
    dayTemplates: normalizeDayTemplates(rawState.dayTemplates),
    bookings: (rawState.bookings ?? []).map((booking) => ({
      ...booking,
      label: booking.label ?? "",
      description: booking.description ?? ""
    }))
  };
}
