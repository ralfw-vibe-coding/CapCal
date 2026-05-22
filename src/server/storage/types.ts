export type AppState = {
  settings?: Record<string, unknown>;
  dailyCapacities?: Record<string, unknown>;
  tasks: unknown[];
  prioTaskIds: string[];
  prioDurations?: Record<string, number>;
  bookings: unknown[];
};

export type StateProvider = {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
};

export const emptyState: AppState = {
  settings: {
    defaultTreeDurationMinutes: 30,
    defaultPrioDurationMinutes: 30,
    defaultDayCapacityMinutes: 480,
    defaultPlanningCapacityMinutes: 360,
    calendarStartTime: "06:00",
    calendarEndTime: "20:00",
    showWeekends: false,
    visibleDayCount: 7,
    taskView: "list",
    treeFilters: {
      query: "",
      statuses: [],
      tags: []
    },
    boardHiddenStatuses: [],
    panelsCollapsed: {
      tree: false,
      prio: false,
      cal: false
    }
  },
  dailyCapacities: {},
  tasks: [],
  prioTaskIds: [],
  prioDurations: {},
  bookings: []
};
