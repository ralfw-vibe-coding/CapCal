// Reine Domaenen-Konstanten und Default-Werte. Keine UI-Technologie.

import type { AppSettings, TaskStatus, TaskVisibleIn } from "./types";

export const statuses: TaskStatus[] = ["Backlog", "Ready", "Started", "Blocked", "Done", "Aborted"];

export const defaultTaskVisibleIn: TaskVisibleIn = { list: true, board: true, hierarchy: true };

export const today = new Date().toISOString().slice(0, 10);

export const defaultSettings: AppSettings = {
  defaultTreeDurationMinutes: 30,
  defaultPrioDurationMinutes: 30,
  defaultTaskStatus: "Backlog",
  defaultDayCapacityMinutes: 480,
  defaultPlanningCapacityMinutes: 360,
  calendarStartTime: "06:00",
  calendarEndTime: "20:00",
  showWeekends: false,
  visibleDayCount: 7,
  calendarView: "days",
  taskView: "list",
  hierarchyExpandedTaskIds: [],
  treeFilters: {
    query: "",
    statuses: [],
    tags: [],
    showArchived: false
  },
  boardHiddenStatuses: [],
  panelsCollapsed: {
    tree: false,
    prio: false,
    cal: false
  }
};
