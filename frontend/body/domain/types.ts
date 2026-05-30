// Reine Domänen- und Hilfstypen. Keine Abhängigkeit zu React oder UI-Technologie.

export type TaskStatus = "Backlog" | "Ready" | "Started" | "Blocked" | "Done" | "Aborted";
export type TreeViewMode = "list" | "board" | "hierarchy";
export type CalendarViewMode = "days" | "month";

export type AuthUser = { id: number; email: string };
export type UserProfile = { name?: string; initials?: string; timezone?: string };
export type UserSettingsState = {
  user: AuthUser;
  profile: UserProfile;
  apiKeyMasked?: string;
  apiKeyLastUsedAt?: string;
  apiKey?: string;
};

export type GoogleCalendarItem = {
  id: string;
  summary: string;
  color?: string;
  selected: boolean;
  syncedAt?: string;
};
export type GoogleCalendarState = {
  connected: boolean;
  googleEmail?: string;
  calendars: GoogleCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};
export type GoogleCalendarEvent = {
  id: string;
  provider: "google" | "icloud";
  calendarId: string;
  calendarSummary: string;
  calendarColor?: string;
  summary: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  blocksTime: boolean;
  htmlLink?: string;
  location?: string;
  description?: string;
  organizer?: string;
  creator?: string;
  attendeeSummary?: string;
};
export type ICloudCalendarItem = GoogleCalendarItem;
export type ICloudCalendarState = {
  connected: boolean;
  appleId?: string;
  calendars: ICloudCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  checklist?: TaskChecklistItem[];
  tags?: string[];
  visibleIn?: TaskVisibleIn;
  dueDate?: string;
  estimateMinutes?: number;
  parentId?: string;
  archived?: boolean;
  archivedAt?: string;
  status: TaskStatus;
  done: boolean;
  treeOrder: number;
  listOrder: number;
  boardOrder: number;
};

export type TaskVisibleIn = {
  list: boolean;
  board: boolean;
  hierarchy: boolean;
};

export type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Booking = {
  id: string;
  taskId?: string;
  label?: string;
  description?: string;
  date: string;
  startTime?: string;
  durationMinutes: number;
};

export type DayTemplateSlot = {
  label: string;
  description?: string;
  startTime?: string;
  durationMinutes: number;
};

export type DayTemplate = {
  id: string;
  name: string;
  slots: DayTemplateSlot[];
  createdAt: string;
};

export type DailyCapacity = {
  dayCapacityMinutes: number;
  planningCapacityMinutes: number;
};

export type TreeFilterSettings = {
  query: string;
  statuses: TaskStatus[];
  tags: string[];
  showArchived: boolean;
};

export type AppSettings = {
  defaultTreeDurationMinutes: number;
  defaultPrioDurationMinutes: number;
  defaultTaskStatus: TaskStatus;
  defaultDayCapacityMinutes: number;
  defaultPlanningCapacityMinutes: number;
  calendarStartTime: string;
  calendarEndTime: string;
  showWeekends: boolean;
  visibleDayCount: number;
  calendarView: CalendarViewMode;
  taskView: TreeViewMode;
  hierarchyExpandedTaskIds: string[];
  treeFilters: TreeFilterSettings;
  boardHiddenStatuses: TaskStatus[];
  panelsCollapsed: {
    tree: boolean;
    prio: boolean;
    cal: boolean;
  };
};

export type AppState = {
  settings?: AppSettings;
  dailyCapacities?: Record<string, DailyCapacity>;
  tasks: Task[];
  prioTaskIds: string[];
  prioDurations?: Record<string, number>;
  bookings: Booking[];
  dayTemplates?: DayTemplate[];
};

