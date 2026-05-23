import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertOctagon,
  Archive,
  ArchiveX,
  ArrowUpNarrowWide,
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  CloudOff,
  Combine,
  Copy,
  Download,
  FolderTree,
  GripVertical,
  Goal,
  Hourglass,
  LayoutTemplate,
  ListRestart,
  ListTree,
  Loader,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  SquareArrowOutUpRight,
  SlidersHorizontal,
  Target,
  Trash2,
  Timer,
  Upload,
  User,
  X
} from "lucide-react";
import "./styles.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TaskStatus = "Backlog" | "Ready" | "Started" | "Blocked" | "Done" | "Aborted";
type TreeViewMode = "list" | "board" | "hierarchy";
type CalendarViewMode = "days" | "month";
type AuthUser = { id: number; email: string };
type UserProfile = { name?: string; initials?: string; timezone?: string };
type UserSettingsState = {
  user: AuthUser;
  profile: UserProfile;
  apiKeyMasked?: string;
  apiKeyLastUsedAt?: string;
  apiKey?: string;
};
type GoogleCalendarItem = {
  id: string;
  summary: string;
  color?: string;
  selected: boolean;
  syncedAt?: string;
};
type GoogleCalendarState = {
  connected: boolean;
  googleEmail?: string;
  calendars: GoogleCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};
type GoogleCalendarEvent = {
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
type ICloudCalendarItem = GoogleCalendarItem;
type ICloudCalendarState = {
  connected: boolean;
  appleId?: string;
  calendars: ICloudCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

type Task = {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
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

type Booking = {
  id: string;
  taskId?: string;
  label?: string;
  description?: string;
  date: string;
  startTime?: string;
  durationMinutes: number;
};

type DayTemplateSlot = {
  label: string;
  description?: string;
  startTime?: string;
  durationMinutes: number;
};

type DayTemplate = {
  id: string;
  name: string;
  slots: DayTemplateSlot[];
  createdAt: string;
};

type DailyCapacity = {
  dayCapacityMinutes: number;
  planningCapacityMinutes: number;
};

type TreeFilterSettings = {
  query: string;
  statuses: TaskStatus[];
  tags: string[];
  showArchived: boolean;
};

type AppSettings = {
  defaultTreeDurationMinutes: number;
  defaultPrioDurationMinutes: number;
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

type AppState = {
  settings?: AppSettings;
  dailyCapacities?: Record<string, DailyCapacity>;
  tasks: Task[];
  prioTaskIds: string[];
  prioDurations?: Record<string, number>;
  bookings: Booking[];
  dayTemplates?: DayTemplate[];
};

type DragPayload =
  | { kind: "tree-task"; taskId: string }
  | { kind: "prio-task"; taskId: string }
  | { kind: "booking"; bookingId: string };

const statuses: TaskStatus[] = ["Backlog", "Ready", "Started", "Blocked", "Done", "Aborted"];
const durationOptions = Array.from({ length: 15 }, (_, index) => 30 + index * 15);
const estimateOptionGroups = [
  { label: "Klein", options: [30, 60, 90, 120] },
  { label: "Mittel", options: [150, 180, 210, 240] },
  { label: "Groß", options: [300, 360, 420, 480] }
];
const estimateOptions = estimateOptionGroups.flatMap((group) => group.options);
const minuteHeight = 1.1;

const statusMeta: Record<TaskStatus, { label: string; icon: typeof Circle; className: string }> = {
  Backlog: { label: "Backlog", icon: Circle, className: "status-backlog" },
  Ready: { label: "Ready", icon: CircleDot, className: "status-ready" },
  Started: { label: "Started", icon: Loader, className: "status-started" },
  Blocked: { label: "Blocked", icon: AlertOctagon, className: "status-blocked" },
  Done: { label: "Done", icon: Check, className: "status-done" },
  Aborted: { label: "Aborted", icon: ArchiveX, className: "status-aborted" }
};

const today = new Date().toISOString().slice(0, 10);
const defaultSettings: AppSettings = {
  defaultTreeDurationMinutes: 30,
  defaultPrioDurationMinutes: 30,
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
const dayCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const planningCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const visibleDayOptions = [7, 14, 21, 31];
const utcOffsetOptions = Array.from({ length: 27 }, (_, index) => index - 12).map((offset) => {
  const sign = offset >= 0 ? "+" : "-";
  return `UTC${sign}${Math.abs(offset).toString().padStart(2, "0")}:00`;
});

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function addDays(date: string, count: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + count);
  return next.toISOString().slice(0, 10);
}

function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(date: string, count: number) {
  const next = new Date(`${startOfMonth(date)}T12:00:00`);
  next.setMonth(next.getMonth() + count);
  return next.toISOString().slice(0, 10);
}

function endOfMonth(date: string) {
  return addDays(addMonths(date, 1), -1);
}

function createMonthDays(monthStart: string, showWeekends: boolean) {
  const days: string[] = [];
  let cursor = startOfMonth(monthStart);
  const monthKey = cursor.slice(0, 7);
  while (cursor.slice(0, 7) === monthKey) {
    if (showWeekends || !isWeekend(cursor)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function formatMonthTitle(monthStart: string) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(`${monthStart}T12:00:00`));
}

function formatMonthTileDay(date: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit" }).format(new Date(`${date}T12:00:00`));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(
    new Date(`${date}T12:00:00`)
  );
}

function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function isMonday(date: string) {
  return new Date(`${date}T12:00:00`).getDay() === 1;
}

function formatOptionalDate(date?: string) {
  return date ? formatDate(date) : "Keine Deadline";
}

function deadlineTone(dueDate?: string) {
  if (!dueDate) return "";
  const due = new Date(`${dueDate}T12:00:00`).getTime();
  const current = new Date(`${today}T12:00:00`).getTime();
  const daysUntilDue = Math.round((due - current) / 86_400_000);
  if (daysUntilDue <= 0) return "deadline-due";
  if (daysUntilDue <= 3) return "deadline-soon";
  return "";
}

function dateFromDateTime(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeFromDateTime(value: string) {
  const date = new Date(value);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function minutesBetween(startAt: string, endAt: string) {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
}

function externalBookedMinutes(events: GoogleCalendarEvent[], capacity: DailyCapacity) {
  return events.reduce((sum, event) => {
    if (!event.blocksTime) return sum;
    return sum + (event.allDay ? capacity.dayCapacityMinutes : minutesBetween(event.startAt, event.endAt));
  }, 0);
}

function capacityLevelFor(bookedMinutes: number, capacity: DailyCapacity) {
  const redCapacityThreshold =
    capacity.planningCapacityMinutes + (capacity.dayCapacityMinutes - capacity.planningCapacityMinutes) * 0.8;
  if (bookedMinutes >= redCapacityThreshold) return "over-plan";
  if (bookedMinutes >= capacity.planningCapacityMinutes * 0.8) return "near-plan";
  return "under-plan";
}

function plainTextFromHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function minutesToTimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function minutesToLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function estimateToLabel(minutes?: number) {
  if (!minutes) return "?";
  const dayMinutes = 8 * 60;
  const weekMinutes = 5 * dayMinutes;
  if (minutes >= weekMinutes * 2 && minutes % weekMinutes === 0) return `${minutes / weekMinutes}w`;
  if (minutes >= dayMinutes * 2 && minutes % dayMinutes === 0) return `${minutes / dayMinutes}d`;
  return minutesToTimeLabel(minutes);
}

function sortByOrder<T extends { id: string }>(items: T[], order: (item: T) => number | undefined) {
  return [...items].sort((a, b) => (order(a) ?? 0) - (order(b) ?? 0) || a.id.localeCompare(b.id));
}

function sortedTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.treeOrder);
}

function sortedListTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.listOrder);
}

function sortedBoardTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.boardOrder);
}

function moveItemToDropTarget<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

function durationForPlanning(taskDurationMinutes: number | undefined, defaultPrioDurationMinutes: number) {
  return taskDurationMinutes && taskDurationMinutes <= 120 ? taskDurationMinutes : defaultPrioDurationMinutes;
}

function normalizeTreeFilters(filters?: Partial<TreeFilterSettings> | null): TreeFilterSettings {
  return {
    query: filters?.query ?? "",
    statuses: (filters?.statuses ?? []).filter((status): status is TaskStatus => statuses.includes(status as TaskStatus)),
    tags: normalizeTags(filters?.tags),
    showArchived: filters?.showArchived ?? false
  };
}

function normalizeTaskStatuses(rawStatuses?: unknown[] | null): TaskStatus[] {
  return (rawStatuses ?? []).filter((status): status is TaskStatus => statuses.includes(status as TaskStatus));
}

function normalizeTags(rawTags?: unknown[] | string | null): string[] {
  const values = Array.isArray(rawTags) ? rawTags : typeof rawTags === "string" ? rawTags.split(",") : [];
  return Array.from(
    new Set(
      values
        .map((tag) => String(tag).trim())
        .filter(Boolean)
    )
  );
}

function normalizeTasks(tasks: Task[]): Task[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const cleanedTasks = tasks.map((task, index) => {
    const legacyOrder = task.treeOrder ?? index;
    return {
    ...task,
    parentId: task.parentId && task.parentId !== task.id && taskIds.has(task.parentId) ? task.parentId : undefined,
    tags: normalizeTags(task.tags),
    archived: task.archived ?? false,
    treeOrder: task.treeOrder ?? legacyOrder,
    listOrder: task.listOrder ?? legacyOrder,
    boardOrder: task.boardOrder ?? legacyOrder
  };
  });
  const byParent = new Map<string, Task[]>();
  for (const task of sortedTasks(cleanedTasks)) {
    const parentKey = task.parentId ?? "";
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), task]);
  }
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const task of sortedBoardTasks(cleanedTasks)) {
    byStatus.set(task.status, [...(byStatus.get(task.status) ?? []), task]);
  }
  const byList = sortedListTasks(cleanedTasks);
  return cleanedTasks.map((task) => {
    const siblings = byParent.get(task.parentId ?? "") ?? [];
    const statusSiblings = byStatus.get(task.status) ?? [];
    return {
      ...task,
      treeOrder: siblings.findIndex((sibling) => sibling.id === task.id),
      listOrder: byList.findIndex((candidate) => candidate.id === task.id),
      boardOrder: statusSiblings.findIndex((candidate) => candidate.id === task.id)
    };
  });
}

function normalizeDayTemplates(rawTemplates?: unknown[] | null): DayTemplate[] {
  return (rawTemplates ?? [])
    .map((item): DayTemplate | null => {
      const rawTemplate = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      if (typeof rawTemplate.id !== "string" || typeof rawTemplate.name !== "string") return null;
      const rawSlots = Array.isArray(rawTemplate.slots) ? rawTemplate.slots : [];
      const slots = rawSlots
        .map((slot): DayTemplateSlot | null => {
          const rawSlot = slot && typeof slot === "object" ? (slot as Record<string, unknown>) : {};
          const durationMinutes = Number(rawSlot.durationMinutes);
          if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
          return {
            label: typeof rawSlot.label === "string" && rawSlot.label.trim() ? rawSlot.label : "Reservierung",
            description: typeof rawSlot.description === "string" ? rawSlot.description : "",
            startTime: typeof rawSlot.startTime === "string" ? rawSlot.startTime : undefined,
            durationMinutes
          };
        })
        .filter((slot): slot is DayTemplateSlot => Boolean(slot));
      return {
        id: rawTemplate.id,
        name: rawTemplate.name,
        slots,
        createdAt: typeof rawTemplate.createdAt === "string" ? rawTemplate.createdAt : new Date().toISOString()
      };
    })
    .filter((template): template is DayTemplate => Boolean(template));
}

type TimedCalendarEntry =
  | { kind: "booking"; id: string; startMinutes: number; endMinutes: number; booking: Booking }
  | { kind: "external"; id: string; startMinutes: number; endMinutes: number; event: GoogleCalendarEvent };

type TimedCalendarLayoutEntry = TimedCalendarEntry & {
  columnIndex: number;
  columnCount: number;
};

function layoutTimedEntries(entries: TimedCalendarEntry[]): TimedCalendarLayoutEntry[] {
  const sortedEntries = [...entries].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const groups: TimedCalendarEntry[][] = [];
  let activeGroup: TimedCalendarEntry[] = [];
  let activeGroupEnd = -1;

  for (const entry of sortedEntries) {
    if (activeGroup.length === 0 || entry.startMinutes < activeGroupEnd) {
      activeGroup.push(entry);
      activeGroupEnd = Math.max(activeGroupEnd, entry.endMinutes);
    } else {
      groups.push(activeGroup);
      activeGroup = [entry];
      activeGroupEnd = entry.endMinutes;
    }
  }
  if (activeGroup.length > 0) groups.push(activeGroup);

  return groups.flatMap((group) => {
    const columns: TimedCalendarEntry[][] = [];
    const placed = group.map((entry) => {
      let columnIndex = columns.findIndex((column) => {
        const lastEntry = column[column.length - 1];
        return lastEntry.endMinutes <= entry.startMinutes;
      });
      if (columnIndex === -1) {
        columnIndex = columns.length;
        columns.push([]);
      }
      columns[columnIndex].push(entry);
      return { ...entry, columnIndex, columnCount: 1 };
    });
    return placed.map((entry) => ({ ...entry, columnCount: columns.length }));
  });
}

function normalizeState(rawState: AppState): AppState {
  const rawTaskView = rawState.settings?.taskView;
  const rawCalendarView = rawState.settings?.calendarView;
  return {
    ...rawState,
    settings: {
      ...defaultSettings,
      ...(rawState.settings ?? {}),
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

function createTimeOptions(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const count = Math.max(1, Math.floor((endMinutes - startMinutes) / 15) + 1);
  return Array.from({ length: count }, (_, index) => minutesToTime(startMinutes + index * 15));
}

function createCalendarPeriod(startDate: string, visibleDayCount: number, showWeekends: boolean) {
  const nextDays: string[] = [];
  let cursor = startDate;
  while (nextDays.length < visibleDayCount) {
    if (showWeekends || !isWeekend(cursor)) nextDays.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nextDays;
}

function nextVisibleDate(date: string, showWeekends: boolean) {
  let cursor = addDays(date, 1);
  while (!showWeekends && isWeekend(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

function browserUtcOffset() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, "0");
  return `UTC${sign}${hours}:00`;
}

function maskVisibleApiKey(apiKey: string) {
  return `••••••••••••••••${apiKey.slice(-5)}`;
}

async function apiErrorMessage(response: Response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : text;
  } catch {
    return text;
  }
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [authStep, setAuthStep] = useState<"email" | "otp">("email");
  const [authError, setAuthError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newTask, setNewTask] = useState<{ title: string; dueDate: string; estimateMinutes?: number }>({
    title: "",
    dueDate: "",
    estimateMinutes: 30
  });
  const [boardQuickAdd, setBoardQuickAdd] = useState<Record<TaskStatus, string>>({
    Backlog: "",
    Ready: "",
    Started: "",
    Blocked: "",
    Done: "",
    Aborted: ""
  });
  const [quickAdd, setQuickAdd] = useState({ prio: "" });
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [calendarStartDate, setCalendarStartDate] = useState(today);
  const [dayCalendarStartDate, setDayCalendarStartDate] = useState(today);
  const [loadedCalendarDays, setLoadedCalendarDays] = useState<string[]>([]);
  const [loadedCalendarMonths, setLoadedCalendarMonths] = useState<string[]>(() => [startOfMonth(today)]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userPanel, setUserPanel] = useState<"menu" | "settings" | "gcal" | "icloud" | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettingsState | null>(null);
  const [userSettingsError, setUserSettingsError] = useState("");
  const [googleCalendar, setGoogleCalendar] = useState<GoogleCalendarState | null>(null);
  const [googleCalendarError, setGoogleCalendarError] = useState("");
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleCalendarEventsError, setGoogleCalendarEventsError] = useState("");
  const [googleCalendarEventsLoading, setGoogleCalendarEventsLoading] = useState(false);
  const [iCloudCalendar, setICloudCalendar] = useState<ICloudCalendarState | null>(null);
  const [iCloudCalendarError, setICloudCalendarError] = useState("");
  const [iCloudCalendarEvents, setICloudCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [iCloudCalendarEventsError, setICloudCalendarEventsError] = useState("");
  const [iCloudCalendarEventsLoading, setICloudCalendarEventsLoading] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [hierarchySortTargetId, setHierarchySortTargetId] = useState<string | null>(null);
  const [hierarchyChildTargetId, setHierarchyChildTargetId] = useState<string | null>(null);
  const [taskDropTargetId, setTaskDropTargetId] = useState<string | null>(null);
  const [childTaskTitles, setChildTaskTitles] = useState<Record<string, string>>({});
  const [changedTaskId, setChangedTaskId] = useState<string | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const cleanLoadedStateRef = useRef<AppState | null>(null);
  const dirtyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const stateVersionRef = useRef(0);
  const prefetchedUserIdRef = useRef<number | null>(null);
  const saveCurrentStateRef = useRef<(options?: { keepalive?: boolean }) => Promise<void>>(async () => undefined);

  async function refreshAuthUser() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!response.ok) return;
      const payload = (await response.json()) as { user: AuthUser };
      setAuthUser(payload.user);
    } catch {
      // Auth status is optional for filesystem mode and should not block loading.
    }
  }

  async function loadState() {
    try {
      const response = await fetch("/api/state", { credentials: "same-origin" });
      if (response.status === 401) {
        setAuthRequired(true);
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      const normalizedState = normalizeState(await response.json());
      stateRef.current = normalizedState;
      cleanLoadedStateRef.current = normalizedState;
      setState(normalizedState);
      setLoadError("");
      setAuthRequired(false);
      void refreshAuthUser();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "State konnte nicht geladen werden.");
      setSaveState("error");
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalStatus = params.get("gcal");
    if (!gcalStatus) return;

    setUserPanel("gcal");
    if (gcalStatus === "error") setGoogleCalendarError(params.get("message") ?? "Google Calendar konnte nicht verbunden werden.");
    if (gcalStatus === "connected") void loadGoogleCalendar(false);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!state) return;
    stateRef.current = state;
    if (state === cleanLoadedStateRef.current) {
      hasLoadedRef.current = true;
      dirtyRef.current = false;
      setSaveState("saved");
      return;
    }
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setSaveState("saved");
      return;
    }

    stateVersionRef.current += 1;
    dirtyRef.current = true;
    setSaveState("dirty");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveCurrentStateRef.current();
    }, 5000);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  useEffect(() => {
    if (saveState === "saved") setChangedTaskId(null);
  }, [saveState]);

  useEffect(() => {
    if (!authUser || prefetchedUserIdRef.current === authUser.id) return;
    prefetchedUserIdRef.current = authUser.id;
    void loadUserSettings();
    void loadGoogleCalendar(false);
    void loadICloudCalendar(false);
  }, [authUser]);

  async function saveCurrentState(options: { keepalive?: boolean } = {}) {
    const currentState = stateRef.current;
    if (!currentState || !dirtyRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    const version = stateVersionRef.current;
    setSaveState("saving");
    setSaveError("");
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentState),
        credentials: "same-origin",
        keepalive: options.keepalive
      });
      if (!response.ok) throw new Error(await response.text());
      if (version === stateVersionRef.current) {
        dirtyRef.current = false;
        cleanLoadedStateRef.current = currentState;
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
    } catch (error) {
      dirtyRef.current = true;
      setSaveError(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
      setSaveState("error");
    }
  }

  saveCurrentStateRef.current = saveCurrentState;

  async function requestLoginOtp() {
    setAuthError("");
    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: authEmail })
    });
    if (!response.ok) {
      setAuthError(await response.text());
      return;
    }
    setAuthStep("otp");
  }

  async function verifyLoginOtp() {
    setAuthError("");
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: authEmail, otp: authOtp })
    });
    if (!response.ok) {
      setAuthError(await response.text());
      return;
    }
    const payload = (await response.json()) as { user: AuthUser };
    setAuthUser(payload.user);
    setAuthRequired(false);
    setAuthOtp("");
    await loadState();
  }

  async function loadUserSettings() {
    setUserSettingsError("");
    try {
      const response = await fetch("/api/user-settings", { credentials: "same-origin" });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setUserSettings((await response.json()) as UserSettingsState);
    } catch (error) {
      setUserSettingsError(error instanceof Error ? error.message : "User Settings konnten nicht geladen werden.");
    }
  }

  async function saveUserProfile(profile: UserProfile) {
    setUserSettingsError("");
    try {
      const response = await fetch("/api/user-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ profile })
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setUserSettings((await response.json()) as UserSettingsState);
    } catch (error) {
      setUserSettingsError(error instanceof Error ? error.message : "Profil konnte nicht gespeichert werden.");
    }
  }

  async function rotateUserApiKey() {
    setUserSettingsError("");
    try {
      const response = await fetch("/api/user-settings/api-key", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setUserSettings((await response.json()) as UserSettingsState);
    } catch (error) {
      setUserSettingsError(error instanceof Error ? error.message : "API-Key konnte nicht erneuert werden.");
    }
  }

  async function loadGoogleCalendar(refresh = false) {
    setGoogleCalendarError("");
    try {
      const response = await fetch(refresh ? "/api/gcal/calendars" : "/api/gcal/status", { credentials: "same-origin" });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setGoogleCalendar((await response.json()) as GoogleCalendarState);
    } catch (error) {
      setGoogleCalendarError(error instanceof Error ? error.message : "Google Calendar konnte nicht geladen werden.");
    }
  }

  async function updateGoogleCalendarSelection(selectedCalendarIds: string[]) {
    setGoogleCalendarError("");
    try {
      const response = await fetch("/api/gcal/calendars", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ selectedCalendarIds })
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setGoogleCalendar((await response.json()) as GoogleCalendarState);
    } catch (error) {
      setGoogleCalendarError(error instanceof Error ? error.message : "Kalenderauswahl konnte nicht gespeichert werden.");
    }
  }

  async function disconnectGoogleCalendar() {
    setGoogleCalendarError("");
    try {
      const response = await fetch("/api/gcal/disconnect", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setGoogleCalendar((await response.json()) as GoogleCalendarState);
    } catch (error) {
      setGoogleCalendarError(error instanceof Error ? error.message : "Google Calendar konnte nicht getrennt werden.");
    }
  }

  async function loadGoogleCalendarEvents(from: string, to: string, forceRefresh = false) {
    if (!googleCalendar?.connected || !googleCalendar.calendars.some((calendar) => calendar.selected)) {
      setGoogleCalendarEvents([]);
      setGoogleCalendarEventsError("");
      return;
    }
    setGoogleCalendarEventsError("");
    if (forceRefresh) setGoogleCalendarEventsLoading(true);
    try {
      const response = await fetch(
        `/api/gcal/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${forceRefresh ? "&refresh=1" : ""}`,
        { credentials: "same-origin" }
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const payload = (await response.json()) as { events?: GoogleCalendarEvent[] };
      setGoogleCalendarEvents(payload.events ?? []);
    } catch (error) {
      setGoogleCalendarEventsError(error instanceof Error ? error.message : "Google Calendar Events konnten nicht geladen werden.");
    } finally {
      if (forceRefresh) setGoogleCalendarEventsLoading(false);
    }
  }

  async function loadICloudCalendar(refresh = false) {
    setICloudCalendarError("");
    try {
      const response = await fetch(refresh ? "/api/icloud/calendars" : "/api/icloud/status", { credentials: "same-origin" });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setICloudCalendar((await response.json()) as ICloudCalendarState);
    } catch (error) {
      setICloudCalendarError(error instanceof Error ? error.message : "iCloud Kalender konnten nicht geladen werden.");
    }
  }

  async function connectICloudCalendar(appleId: string, appPassword: string) {
    setICloudCalendarError("");
    try {
      const response = await fetch("/api/icloud/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ appleId, appPassword })
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setICloudCalendar((await response.json()) as ICloudCalendarState);
    } catch (error) {
      setICloudCalendarError(error instanceof Error ? error.message : "iCloud konnte nicht verbunden werden.");
    }
  }

  async function updateICloudCalendarSelection(selectedCalendarIds: string[]) {
    setICloudCalendarError("");
    try {
      const response = await fetch("/api/icloud/calendars", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ selectedCalendarIds })
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setICloudCalendar((await response.json()) as ICloudCalendarState);
    } catch (error) {
      setICloudCalendarError(error instanceof Error ? error.message : "iCloud-Kalenderauswahl konnte nicht gespeichert werden.");
    }
  }

  async function disconnectICloudCalendar() {
    setICloudCalendarError("");
    try {
      const response = await fetch("/api/icloud/disconnect", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      setICloudCalendar((await response.json()) as ICloudCalendarState);
    } catch (error) {
      setICloudCalendarError(error instanceof Error ? error.message : "iCloud konnte nicht getrennt werden.");
    }
  }

  async function loadICloudCalendarEvents(from: string, to: string, forceRefresh = false) {
    if (!iCloudCalendar?.connected || !iCloudCalendar.calendars.some((calendar) => calendar.selected)) {
      setICloudCalendarEvents([]);
      setICloudCalendarEventsError("");
      return;
    }
    setICloudCalendarEventsError("");
    if (forceRefresh) setICloudCalendarEventsLoading(true);
    try {
      const response = await fetch(
        `/api/icloud/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${forceRefresh ? "&refresh=1" : ""}`,
        { credentials: "same-origin" }
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response));
      const payload = (await response.json()) as { events?: GoogleCalendarEvent[] };
      setICloudCalendarEvents(payload.events ?? []);
    } catch (error) {
      setICloudCalendarEventsError(error instanceof Error ? error.message : "iCloud Events konnten nicht geladen werden.");
    } finally {
      if (forceRefresh) setICloudCalendarEventsLoading(false);
    }
  }

  async function refreshExternalCalendarEvents() {
    await Promise.all([
      loadGoogleCalendarEvents(visibleRangeStart, visibleRangeEnd, true),
      loadICloudCalendarEvents(visibleRangeStart, visibleRangeEnd, true)
    ]);
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } finally {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      stateRef.current = null;
      cleanLoadedStateRef.current = null;
      dirtyRef.current = false;
      hasLoadedRef.current = false;
      setState(null);
      setAuthUser(null);
      prefetchedUserIdRef.current = null;
      setAuthRequired(true);
      setAuthStep("email");
      setAuthOtp("");
      setSaveError("");
      setLoadError("");
      setSaveState("idle");
    }
  }

  useEffect(() => {
    const flush = () => {
      void saveCurrentStateRef.current({ keepalive: true });
    };
    const flushOnHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const retryOnOnline = () => {
      if (dirtyRef.current) void saveCurrentStateRef.current();
    };

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    window.addEventListener("online", retryOnOnline);
    document.addEventListener("visibilitychange", flushOnHidden);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      window.removeEventListener("online", retryOnOnline);
      document.removeEventListener("visibilitychange", flushOnHidden);
    };
  }, []);

  const settings = state?.settings ?? defaultSettings;
  const hierarchyExpandedTaskIds = settings.hierarchyExpandedTaskIds ?? [];
  const defaultCapacity: DailyCapacity = {
    dayCapacityMinutes: settings.defaultDayCapacityMinutes,
    planningCapacityMinutes: settings.defaultPlanningCapacityMinutes
  };
  const calendarStartMinutes = timeToMinutes(settings.calendarStartTime);
  const calendarEndMinutes = timeToMinutes(settings.calendarEndTime);
  const timeOptions = useMemo(
    () => createTimeOptions(settings.calendarStartTime, settings.calendarEndTime),
    [settings.calendarEndTime, settings.calendarStartTime]
  );
  const taskById = useMemo(() => new Map(state?.tasks.map((task) => [task.id, task]) ?? []), [state?.tasks]);
  const bookingCountByTaskId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of state?.bookings ?? []) {
      if (booking.taskId) counts.set(booking.taskId, (counts.get(booking.taskId) ?? 0) + 1);
    }
    return counts;
  }, [state?.bookings]);
  const bookedMinutesByTaskId = useMemo(() => {
    const minutes = new Map<string, number>();
    for (const booking of state?.bookings ?? []) {
      if (booking.taskId) minutes.set(booking.taskId, (minutes.get(booking.taskId) ?? 0) + booking.durationMinutes);
    }
    return minutes;
  }, [state?.bookings]);
  const childCountByTaskId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of state?.tasks ?? []) {
      if (task.parentId) counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    }
    return counts;
  }, [state?.tasks]);
  const activeChildCountByTaskId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of state?.tasks ?? []) {
      if (task.parentId && !task.archived) counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    }
    return counts;
  }, [state?.tasks]);
  const parentTitleByTaskId = useMemo(() => {
    const parentTitles = new Map<string, string>();
    for (const task of state?.tasks ?? []) {
      if (task.parentId) parentTitles.set(task.id, taskById.get(task.parentId)?.title ?? "");
    }
    return parentTitles;
  }, [state?.tasks, taskById]);
  const tasksByParentId = useMemo(() => {
    const children = new Map<string, Task[]>();
    for (const task of state?.tasks ?? []) {
      const parentKey = task.parentId ?? "";
      children.set(parentKey, [...(children.get(parentKey) ?? []), task]);
    }
    for (const [parentKey, parentTasks] of children.entries()) children.set(parentKey, sortedTasks(parentTasks));
    return children;
  }, [state?.tasks]);
  const treeFilters = settings.treeFilters;
  const availableTags = useMemo(
    () => Array.from(new Set((state?.tasks ?? []).flatMap((task) => task.tags ?? []))).sort((a, b) => a.localeCompare(b, "de")),
    [state?.tasks]
  );
  const visibleBoardStatuses = useMemo(
    () => statuses.filter((status) => !settings.boardHiddenStatuses.includes(status)),
    [settings.boardHiddenStatuses]
  );
  const filteredTreeTasks = useMemo(() => {
    const query = treeFilters.query.trim().toLowerCase();
    return sortedListTasks(state?.tasks ?? []).filter((task) => {
      const matchesArchive = treeFilters.showArchived ? task.archived : !task.archived;
      const matchesQuery = !query || task.title.toLowerCase().includes(query);
      const matchesStatus = treeFilters.statuses.length === 0 || treeFilters.statuses.includes(task.status);
      const taskTags = task.tags ?? [];
      const matchesTags = treeFilters.tags.length === 0 || treeFilters.tags.every((tag) => taskTags.includes(tag));
      return matchesArchive && matchesQuery && matchesStatus && matchesTags;
    });
  }, [state?.tasks, treeFilters.query, treeFilters.showArchived, treeFilters.statuses, treeFilters.tags]);
  const filteredTaskIds = useMemo(() => new Set(filteredTreeTasks.map((task) => task.id)), [filteredTreeTasks]);
  const currentCalendarPeriod = useMemo(
    () => createCalendarPeriod(dayCalendarStartDate, settings.visibleDayCount, settings.showWeekends),
    [dayCalendarStartDate, settings.showWeekends, settings.visibleDayCount]
  );
  const days = loadedCalendarDays.length > 0 ? loadedCalendarDays : currentCalendarPeriod;
  const calendarMonths = loadedCalendarMonths.length > 0 ? loadedCalendarMonths : [startOfMonth(calendarStartDate)];
  const visibleRangeStart =
    settings.calendarView === "month"
      ? calendarMonths[0]
      : days.length > 0
        ? days[0]
        : calendarStartDate;
  const visibleRangeEnd =
    settings.calendarView === "month"
      ? endOfMonth(calendarMonths[calendarMonths.length - 1])
      : days.length > 0
        ? days[days.length - 1]
        : calendarStartDate;
  const externalCalendarEvents = useMemo(
    () => [...googleCalendarEvents, ...iCloudCalendarEvents],
    [googleCalendarEvents, iCloudCalendarEvents]
  );
  const externalEventsByDate = useMemo(() => {
    const byDate = new Map<string, GoogleCalendarEvent[]>();
    for (const event of externalCalendarEvents) {
      const date = event.allDay ? dateFromDateTime(event.startAt) : dateFromDateTime(event.startAt);
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
    }
    return byDate;
  }, [externalCalendarEvents]);
  const workspaceColumns = [
    settings.panelsCollapsed.tree
      ? "64px"
      : settings.taskView === "board" && settings.panelsCollapsed.cal
        ? "minmax(720px, 1.75fr)"
        : settings.panelsCollapsed.cal
          ? "minmax(520px, 1.35fr)"
          : "minmax(360px, 0.95fr)",
    settings.panelsCollapsed.prio ? "64px" : "minmax(310px, 0.8fr)",
    settings.panelsCollapsed.cal ? "64px" : "minmax(520px, 1.45fr)"
  ].join(" ");

  useEffect(() => {
    setNewTask((current) =>
      current.title.trim() ? current : { ...current, estimateMinutes: settings.defaultTreeDurationMinutes }
    );
  }, [settings.defaultTreeDurationMinutes]);

  useEffect(() => {
    setLoadedCalendarDays(currentCalendarPeriod);
  }, [settings.showWeekends, settings.visibleDayCount]);

  useEffect(() => {
    void loadGoogleCalendarEvents(visibleRangeStart, visibleRangeEnd);
    void loadICloudCalendarEvents(visibleRangeStart, visibleRangeEnd);
  }, [visibleRangeStart, visibleRangeEnd, googleCalendar, iCloudCalendar]);

  useEffect(() => {
    if (!settingsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !settingsMenuRef.current?.contains(target)) setSettingsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!userPanel) return;
    if (userPanel === "settings" && !userSettings) void loadUserSettings();
    if (userPanel === "gcal" && !googleCalendar) void loadGoogleCalendar(false);
    if (userPanel === "icloud" && !iCloudCalendar) void loadICloudCalendar(false);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !userMenuRef.current?.contains(target)) setUserPanel(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [userPanel]);

  if (authRequired) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div className="brand">
            <CalendarDays size={19} />
            <span>CapCal</span>
          </div>
          <p>Plane deine Kapazität wie ein Profi</p>
          {authStep === "email" ? (
            <>
              <input
                autoFocus
                placeholder="E-Mail-Adresse"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void requestLoginOtp();
                }}
              />
              <button className="primary" onClick={() => void requestLoginOtp()}>
                Login/Signup
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                inputMode="numeric"
                placeholder="6-stelliger Code"
                value={authOtp}
                onChange={(event) => setAuthOtp(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void verifyLoginOtp();
                }}
              />
              <button className="primary" onClick={() => void verifyLoginOtp()}>
                Einloggen
              </button>
              <button className="soft-button" onClick={() => setAuthStep("email")}>
                E-Mail ändern
              </button>
            </>
          )}
          {authError && <div className="login-error">{authError}</div>}
        </section>
      </main>
    );
  }

  if (!state) {
    return (
      <main className={`loading ${loadError ? "load-error" : ""}`}>
        {loadError ? (
          <>
            <AlertOctagon size={28} />
            <div>
              <strong>CapCal konnte die Daten nicht laden.</strong>
              <span>Bitte Verbindung prüfen und neu laden.</span>
            </div>
          </>
        ) : (
          <>
            <Loader className="spin" size={28} />
            CapCal wird geladen
          </>
        )}
      </main>
    );
  }

  function updateState(mutator: (draft: AppState) => AppState) {
    setState((current) => (current ? mutator(current) : current));
  }

  function updateSettings(patch: Partial<AppSettings>) {
    updateState((draft) => ({
      ...draft,
      settings: {
        ...defaultSettings,
        ...(draft.settings ?? defaultSettings),
        ...patch,
        treeFilters: normalizeTreeFilters({
          ...(draft.settings?.treeFilters ?? defaultSettings.treeFilters),
          ...(patch.treeFilters ?? {})
        }),
        boardHiddenStatuses: normalizeTaskStatuses(patch.boardHiddenStatuses ?? draft.settings?.boardHiddenStatuses),
        panelsCollapsed: {
          ...defaultSettings.panelsCollapsed,
          ...(draft.settings?.panelsCollapsed ?? defaultSettings.panelsCollapsed),
          ...(patch.panelsCollapsed ?? {})
        }
      }
    }));
  }

  function updateCapacityDefaults(patch: Pick<Partial<AppSettings>, "defaultDayCapacityMinutes" | "defaultPlanningCapacityMinutes">) {
    updateState((draft) => {
      const currentSettings = { ...defaultSettings, ...(draft.settings ?? {}) };
      const currentDefaultCapacity = {
        dayCapacityMinutes: currentSettings.defaultDayCapacityMinutes,
        planningCapacityMinutes: currentSettings.defaultPlanningCapacityMinutes
      };
      const bookedDates = new Set(draft.bookings.map((booking) => booking.date));
      const dailyCapacities = { ...(draft.dailyCapacities ?? {}) };
      for (const date of bookedDates) {
        if (!dailyCapacities[date]) dailyCapacities[date] = currentDefaultCapacity;
      }
      const nextSettings = {
        ...currentSettings,
        ...patch
      };
      if (nextSettings.defaultPlanningCapacityMinutes > nextSettings.defaultDayCapacityMinutes) {
        nextSettings.defaultPlanningCapacityMinutes = nextSettings.defaultDayCapacityMinutes;
      }
      return {
        ...draft,
        dailyCapacities,
        settings: nextSettings
      };
    });
  }

  function expandHierarchyTask(taskId: string) {
    const currentIds = settings.hierarchyExpandedTaskIds ?? [];
    if (currentIds.includes(taskId)) return;
    updateSettings({ hierarchyExpandedTaskIds: [...currentIds, taskId] });
  }

  function toggleHierarchyTask(taskId: string) {
    const currentIds = settings.hierarchyExpandedTaskIds ?? [];
    updateSettings({
      hierarchyExpandedTaskIds: currentIds.includes(taskId)
        ? currentIds.filter((id) => id !== taskId)
        : [...currentIds, taskId]
    });
  }

  function ancestorTaskIds(taskId: string) {
    const ids: string[] = [];
    let current = stateRef.current?.tasks.find((task) => task.id === taskId);
    while (current?.parentId) {
      ids.push(current.parentId);
      current = stateRef.current?.tasks.find((task) => task.id === current?.parentId);
    }
    return ids;
  }

  function upsertTask(title: string, target?: "prio" | "cal", date = today, initialStatus?: TaskStatus, parentId?: string): Task | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const estimateMinutes = settings.defaultTreeDurationMinutes;
    const planningDurationMinutes = durationForPlanning(estimateMinutes, settings.defaultPrioDurationMinutes);
    const status = initialStatus ?? (target === "cal" ? "Started" : "Ready");
    const task: Task = {
      id: uid("task"),
      title: trimmed,
      description: "",
      tags: [],
      dueDate: target === "cal" ? date : undefined,
      estimateMinutes,
      parentId,
      archived: false,
      status,
      done: status === "Done" || status === "Aborted",
      treeOrder: 0,
      listOrder: 0,
      boardOrder: 0
    };

    updateState((draft) => {
      const siblingKey = parentId ?? "";
      const statusKey = task.status;
      const tasks = normalizeTasks([
        { ...task, treeOrder: 0, listOrder: 0, boardOrder: 0 },
        ...draft.tasks.map((existingTask) =>
          ({
            ...existingTask,
            treeOrder: (existingTask.parentId ?? "") === siblingKey ? existingTask.treeOrder + 1 : existingTask.treeOrder,
            listOrder: existingTask.listOrder + 1,
            boardOrder: existingTask.status === statusKey ? existingTask.boardOrder + 1 : existingTask.boardOrder
          })
        )
      ]);
      const next: AppState = {
        ...draft,
        tasks,
        prioTaskIds: [...draft.prioTaskIds],
        prioDurations: { ...(draft.prioDurations ?? {}) },
        bookings: [...draft.bookings]
      };
      if (target === "prio") {
        next.prioTaskIds.push(task.id);
        next.prioDurations = {
          ...(next.prioDurations ?? {}),
          [task.id]: planningDurationMinutes
        };
      }
      if (target === "cal") {
        next.bookings.push({ id: uid("booking"), taskId: task.id, date, durationMinutes: planningDurationMinutes });
      }
      return next;
    });
    return task;
  }

  function addTreeTask() {
    const created = upsertTask(newTask.title);
    if (!created) return;
    updateTask(created.id, {
      dueDate: newTask.dueDate || undefined,
      estimateMinutes: newTask.estimateMinutes
    });
    setNewTask({ title: "", dueDate: "", estimateMinutes: settings.defaultTreeDurationMinutes });
  }

  function addBoardTask(status: TaskStatus) {
    const created = upsertTask(boardQuickAdd[status], undefined, today, status);
    if (!created) return;
    setBoardQuickAdd((current) => ({ ...current, [status]: "" }));
  }

  function addChildTask(parentId: string) {
    const title = childTaskTitles[parentId]?.trim();
    if (!title) return;
    const created = upsertTask(title, undefined, today, "Ready", parentId);
    if (!created) return;
    setChildTaskTitles((current) => ({ ...current, [parentId]: "" }));
    expandHierarchyTask(parentId);
  }

  function detachTaskFromParent(taskId: string) {
    updateState((draft) => {
      const maxRootTreeOrder = Math.max(-1, ...draft.tasks.filter((task) => !task.parentId).map((task) => task.treeOrder));
      return {
        ...draft,
        tasks: normalizeTasks(
          draft.tasks.map((task) =>
            task.id === taskId ? { ...task, parentId: undefined, treeOrder: maxRootTreeOrder + 1 } : task
          )
        )
      };
    });
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setChangedTaskId(taskId);
    updateState((draft) => ({
      ...draft,
      tasks: normalizeTasks(draft.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)))
    }));
  }

  function setTaskDone(taskId: string, done: boolean) {
    updateTask(taskId, { done, status: done ? "Done" : "Ready" });
  }

  function moveTaskBeforeInList(sourceTaskId: string, targetTaskId: string) {
    updateState((draft) => {
      if (draft.tasks.find((task) => task.id === sourceTaskId)?.archived) return draft;
      const tasks = sortedListTasks(draft.tasks);
      const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
      const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
      return {
        ...draft,
        tasks: moveItemToDropTarget(tasks, sourceIndex, targetIndex).map((task, listOrder) => ({ ...task, listOrder }))
      };
    });
  }

  function moveTaskBeforeInTree(sourceTaskId: string, targetTaskId: string) {
    updateState((draft) => {
      const sourceTask = draft.tasks.find((task) => task.id === sourceTaskId);
      const targetTask = draft.tasks.find((task) => task.id === targetTaskId);
      if (sourceTask?.archived) return draft;
      if (!sourceTask || !targetTask || sourceTask.id === targetTask.id) return draft;
      const parentId = targetTask.parentId;
      const movedTasks = draft.tasks.map((task) => (task.id === sourceTaskId ? { ...task, parentId } : task));
      const siblings = sortedTasks(movedTasks.filter((task) => (task.parentId ?? "") === (parentId ?? "") && task.id !== sourceTaskId));
      const targetIndex = siblings.findIndex((task) => task.id === targetTaskId);
      const orderedSiblingIds = [
        ...siblings.slice(0, targetIndex).map((task) => task.id),
        sourceTaskId,
        ...siblings.slice(targetIndex).map((task) => task.id)
      ];
      return {
        ...draft,
        tasks: normalizeTasks(
          movedTasks.map((task) =>
            orderedSiblingIds.includes(task.id) ? { ...task, treeOrder: orderedSiblingIds.indexOf(task.id) } : task
          )
        )
      };
    });
  }

  function isDescendant(tasks: Task[], taskId: string, possibleAncestorId: string): boolean {
    let current = tasks.find((task) => task.id === taskId);
    while (current?.parentId) {
      if (current.parentId === possibleAncestorId) return true;
      current = tasks.find((task) => task.id === current?.parentId);
    }
    return false;
  }

  function moveTaskAsChild(sourceTaskId: string, parentId: string) {
    updateState((draft) => {
      if (draft.tasks.find((task) => task.id === sourceTaskId)?.archived) return draft;
      if (sourceTaskId === parentId || isDescendant(draft.tasks, parentId, sourceTaskId)) return draft;
      const nextTasks = normalizeTasks(
        draft.tasks.map((task) => (task.id === sourceTaskId ? { ...task, parentId, treeOrder: Number.MAX_SAFE_INTEGER } : task))
      );
      return { ...draft, tasks: nextTasks };
    });
    expandHierarchyTask(parentId);
  }

  function addToPrio(taskId: string) {
    updateState((draft) => {
      if (draft.prioTaskIds.includes(taskId)) return draft;
      const task = draft.tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.archived) return draft;
      return {
        ...draft,
        prioTaskIds: [...draft.prioTaskIds, taskId],
        prioDurations: {
          ...(draft.prioDurations ?? {}),
          [taskId]: durationForPlanning(task?.estimateMinutes, settings.defaultPrioDurationMinutes)
        }
      };
    });
  }

  function removeFromPrio(taskId: string) {
    updateState((draft) => {
      const { [taskId]: _removed, ...prioDurations } = draft.prioDurations ?? {};
      return { ...draft, prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId), prioDurations };
    });
  }

  function moveBeforeInPrio(sourceTaskId: string, targetTaskId: string) {
    updateState((draft) => {
      const sourceWasNew = !draft.prioTaskIds.includes(sourceTaskId);
      const sourceTask = draft.tasks.find((task) => task.id === sourceTaskId);
      if (!sourceTask || sourceTask.archived) return draft;
      const prioTaskIds = draft.prioTaskIds.includes(sourceTaskId) ? [...draft.prioTaskIds] : [...draft.prioTaskIds, sourceTaskId];
      const sourceIndex = prioTaskIds.indexOf(sourceTaskId);
      const targetIndex = prioTaskIds.indexOf(targetTaskId);
      return {
        ...draft,
        prioDurations: sourceWasNew
          ? {
              ...(draft.prioDurations ?? {}),
              [sourceTaskId]: durationForPlanning(sourceTask?.estimateMinutes, settings.defaultPrioDurationMinutes)
            }
          : draft.prioDurations,
        prioTaskIds: moveItemToDropTarget(prioTaskIds, sourceIndex, targetIndex)
      };
    });
  }

  function deleteTask(taskId: string) {
    updateState((draft) => {
      if (draft.tasks.some((task) => task.parentId === taskId)) return draft;
      return {
        ...draft,
        tasks: normalizeTasks(draft.tasks.filter((task) => task.id !== taskId)),
        prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
        prioDurations: Object.fromEntries(Object.entries(draft.prioDurations ?? {}).filter(([id]) => id !== taskId)),
        bookings: draft.bookings.filter((booking) => booking.taskId !== taskId)
      };
    });
  }

  function toggleTaskArchived(taskId: string) {
    updateState((draft) => {
      const task = draft.tasks.find((candidate) => candidate.id === taskId);
      if (!task) return draft;
      const hasActiveChildren = draft.tasks.some((candidate) => candidate.parentId === taskId && !candidate.archived);
      if (!task.archived && hasActiveChildren) return draft;
      const { [taskId]: _removed, ...prioDurations } = draft.prioDurations ?? {};
      return {
        ...draft,
        tasks: normalizeTasks(
          draft.tasks.map((candidate) =>
            candidate.id === taskId
              ? {
                  ...candidate,
                  archived: !candidate.archived,
                  archivedAt: candidate.archived ? undefined : new Date().toISOString()
                }
              : candidate
          )
        ),
        prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
        prioDurations
      };
    });
  }

  function bookTask(taskId: string, date: string, startTime?: string, source: "tree" | "prio" = "tree") {
    updateState((draft) => {
      const task = draft.tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.archived) return draft;
      const durationMinutes =
        source === "prio"
          ? (draft.prioDurations?.[taskId] ?? durationForPlanning(task?.estimateMinutes, settings.defaultPrioDurationMinutes))
          : durationForPlanning(task?.estimateMinutes, settings.defaultPrioDurationMinutes);
      const { [taskId]: _removed, ...prioDurations } = draft.prioDurations ?? {};
      return {
        ...draft,
        prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
        prioDurations,
        tasks: normalizeTasks(
          draft.tasks.map((candidate) =>
            candidate.id === taskId && candidate.status !== "Done" ? { ...candidate, status: "Started" } : candidate
          )
        ),
        bookings: [...draft.bookings, { id: uid("booking"), taskId, date, startTime, durationMinutes }]
      };
    });
  }

  function addLooseBooking(label: string, date = today, startTime?: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    updateState((draft) => ({
      ...draft,
      bookings: [
        ...draft.bookings,
        {
          id: uid("booking"),
          label: trimmed,
          description: "",
          date,
          startTime,
          durationMinutes: settings.defaultPrioDurationMinutes
        }
      ]
    }));
  }

  function addDefaultLooseBooking(date: string) {
    addLooseBooking("Neue Buchung", date);
  }

  function saveDayAsTemplate(date: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return { saved: false, count: 0 };
    let slotCount = 0;
    updateState((draft) => {
      const slots = draft.bookings
        .filter((booking) => booking.date === date && !booking.taskId)
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
        .map((booking): DayTemplateSlot => ({
          label: booking.label?.trim() || "Reservierung",
          description: booking.description ?? "",
          startTime: booking.startTime,
          durationMinutes: booking.durationMinutes
        }));
      slotCount = slots.length;
      if (slots.length === 0) return draft;
      return {
        ...draft,
        dayTemplates: [
          ...(draft.dayTemplates ?? []),
          {
            id: uid("template"),
            name: trimmedName,
            slots,
            createdAt: new Date().toISOString()
          }
        ]
      };
    });
    return { saved: slotCount > 0, count: slotCount };
  }

  function applyDayTemplate(templateId: string, date: string) {
    const template = stateRef.current?.dayTemplates?.find((candidate) => candidate.id === templateId);
    if (!template) return 0;
    updateState((draft) => ({
      ...draft,
      bookings: [
        ...draft.bookings,
        ...template.slots.map((slot) => ({
          id: uid("booking"),
          label: slot.label,
          description: slot.description ?? "",
          date,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes
        }))
      ]
    }));
    return template.slots.length;
  }

  function deleteDayTemplate(templateId: string) {
    updateState((draft) => ({
      ...draft,
      dayTemplates: (draft.dayTemplates ?? []).filter((template) => template.id !== templateId)
    }));
  }

  function linkBookingToTask(bookingId: string, taskId: string) {
    updateState((draft) => ({
      ...draft,
      tasks: normalizeTasks(
        draft.tasks.map((task) =>
          task.id === taskId && task.status !== "Done" ? { ...task, status: "Started" } : task
        )
      ),
      bookings: draft.bookings.map((booking) =>
        booking.id === bookingId ? { ...booking, taskId, label: "" } : booking
      )
    }));
  }

  function createTaskFromBookingBefore(bookingId: string, targetTaskId: string, mode: "list" | "hierarchy" | "board" = "list") {
    updateState((draft) => {
      const booking = draft.bookings.find((candidate) => candidate.id === bookingId);
      const targetTask = draft.tasks.find((candidate) => candidate.id === targetTaskId);
      if (!booking || !targetTask) return draft;
      const title = (booking.label || "Neue Aufgabe").trim();
      const targetStatus = mode === "board" ? targetTask.status : "Started";
      const maxRootTreeOrder = Math.max(-1, ...draft.tasks.filter((task) => !task.parentId).map((task) => task.treeOrder));
      const maxListOrder = Math.max(-1, ...draft.tasks.map((task) => task.listOrder));
      const task: Task = {
        id: uid("task"),
        title,
        description: booking.description ?? "",
        tags: [],
        dueDate: undefined,
        estimateMinutes: undefined,
        parentId: mode === "hierarchy" ? targetTask.parentId : undefined,
        archived: false,
        status: targetStatus,
        done: false,
        treeOrder: mode === "hierarchy" ? targetTask.treeOrder : 0,
        listOrder: mode === "list" ? targetTask.listOrder : 0,
        boardOrder: mode === "board" ? targetTask.boardOrder : 0
      };
      const tasks = draft.tasks.map((existingTask) => ({
        ...existingTask,
        treeOrder:
          (existingTask.parentId ?? "") === (task.parentId ?? "") &&
          existingTask.treeOrder >= (mode === "hierarchy" ? targetTask.treeOrder : 0)
            ? existingTask.treeOrder + 1
            : existingTask.treeOrder,
        listOrder: existingTask.listOrder >= (mode === "list" ? targetTask.listOrder : 0) ? existingTask.listOrder + 1 : existingTask.listOrder,
        boardOrder:
          existingTask.status === targetStatus && existingTask.boardOrder >= (mode === "board" ? targetTask.boardOrder : 0)
            ? existingTask.boardOrder + 1
            : existingTask.boardOrder
      }));
      return {
        ...draft,
        tasks: normalizeTasks([task, ...tasks]),
        bookings: draft.bookings.map((candidate) =>
          candidate.id === bookingId ? { ...candidate, taskId: task.id, label: "" } : candidate
        )
      };
    });
  }

  function updateBooking(bookingId: string, patch: Partial<Booking>) {
    updateState((draft) => ({
      ...draft,
      bookings: draft.bookings.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking))
    }));
  }

  function deleteBooking(bookingId: string) {
    updateState((draft) => ({ ...draft, bookings: draft.bookings.filter((booking) => booking.id !== bookingId) }));
  }

  function updateDailyCapacity(date: string, patch: Partial<DailyCapacity>) {
    updateState((draft) => {
      const current = draft.dailyCapacities?.[date] ?? defaultCapacity;
      const nextCapacity = {
        ...current,
        ...patch
      };
      if (nextCapacity.planningCapacityMinutes > nextCapacity.dayCapacityMinutes) {
        nextCapacity.planningCapacityMinutes = nextCapacity.dayCapacityMinutes;
      }
      return {
        ...draft,
        dailyCapacities: {
          ...(draft.dailyCapacities ?? {}),
          [date]: nextCapacity
        }
      };
    });
  }

  function handleDrop(date: string, startTime?: string) {
    if (!dragPayload) return;
    if (dragPayload.kind === "booking") updateBooking(dragPayload.bookingId, { date, startTime });
    if (dragPayload.kind === "tree-task") bookTask(dragPayload.taskId, date, startTime, "tree");
    if (dragPayload.kind === "prio-task") bookTask(dragPayload.taskId, date, startTime, "prio");
    setDragPayload(null);
  }

  function togglePanel(panel: keyof AppSettings["panelsCollapsed"]) {
    updateSettings({
      panelsCollapsed: {
        ...settings.panelsCollapsed,
        [panel]: !settings.panelsCollapsed[panel]
      }
    });
  }

  function setTreeView(taskView: TreeViewMode) {
    updateSettings({
      taskView,
      panelsCollapsed:
        taskView === "board"
          ? {
              ...settings.panelsCollapsed,
              cal: true
            }
          : settings.panelsCollapsed
    });
  }

  function toggleTreeFilterStatus(status: TaskStatus) {
    const selected = treeFilters.statuses.includes(status);
    updateSettings({
      treeFilters: {
        ...treeFilters,
        statuses: selected ? treeFilters.statuses.filter((candidate) => candidate !== status) : [...treeFilters.statuses, status]
      }
    });
  }

  function toggleTreeFilterTag(tag: string) {
    const selected = treeFilters.tags.includes(tag);
    updateSettings({
      treeFilters: {
        ...treeFilters,
        tags: selected ? treeFilters.tags.filter((candidate) => candidate !== tag) : [...treeFilters.tags, tag]
      }
    });
  }

  function toggleTaskDetails(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleBoardColumn(status: TaskStatus) {
    const hidden = settings.boardHiddenStatuses.includes(status);
    if (!hidden && visibleBoardStatuses.length === 1) return;
    updateSettings({
      boardHiddenStatuses: hidden
        ? settings.boardHiddenStatuses.filter((candidate) => candidate !== status)
        : [...settings.boardHiddenStatuses, status]
    });
  }

  function moveTaskToBoardStatus(taskId: string, status: TaskStatus, targetTaskId?: string) {
    updateState((draft) => {
      if (draft.tasks.find((task) => task.id === taskId)?.archived) return draft;
      const statusTasks = sortedBoardTasks(
        draft.tasks
          .map((task) => (task.id === taskId ? { ...task, status, done: status === "Done" || status === "Aborted" } : task))
          .filter((task) => task.status === status)
      );
      const orderedIds = statusTasks.map((task) => task.id);
      if (!orderedIds.includes(taskId)) orderedIds.push(taskId);
      const sourceIndex = orderedIds.indexOf(taskId);
      const targetIndex = targetTaskId ? orderedIds.indexOf(targetTaskId) : orderedIds.length - 1;
      const nextIds = targetIndex >= 0 ? moveItemToDropTarget(orderedIds, sourceIndex, targetIndex) : orderedIds;
      return {
        ...draft,
        tasks: normalizeTasks(
          draft.tasks.map((task) => {
            if (task.id === taskId) return { ...task, status, done: status === "Done" || status === "Aborted", boardOrder: nextIds.indexOf(task.id) };
            if (nextIds.includes(task.id)) return { ...task, boardOrder: nextIds.indexOf(task.id) };
            return task;
          })
        )
      };
    });
  }

  function scrollToTask(taskId: string) {
    const expandedIds = new Set([...(settings.hierarchyExpandedTaskIds ?? []), ...ancestorTaskIds(taskId)]);
    updateSettings({
      taskView: "hierarchy",
      hierarchyExpandedTaskIds: [...expandedIds],
      panelsCollapsed: { ...settings.panelsCollapsed, tree: false }
    });
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
    window.setTimeout(() => {
      document.querySelector(`[data-task-id="${taskId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function renderTreeTaskCard(task: Task, options?: { boardStatus?: TaskStatus }) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        allTags={availableTags}
        bookingCount={bookingCountByTaskId.get(task.id) ?? 0}
        bookedMinutes={bookedMinutesByTaskId.get(task.id) ?? 0}
        childCount={childCountByTaskId.get(task.id) ?? 0}
        activeChildCount={activeChildCountByTaskId.get(task.id) ?? 0}
        parentTitle={parentTitleByTaskId.get(task.id)}
        variant={options?.boardStatus ? "board" : "list"}
        expanded={expandedTaskIds.has(task.id)}
        showUnsavedDot={changedTaskId === task.id && saveState !== "saved" && saveState !== "idle"}
        isDropTarget={taskDropTargetId === task.id}
        onToggleExpanded={() => toggleTaskDetails(task.id)}
        onDragStart={() => setDragPayload({ kind: "tree-task", taskId: task.id })}
        onDragEnd={() => {
          setDragPayload(null);
          setTaskDropTargetId(null);
        }}
        onTaskDragOver={() => {
          if (dragPayload) setTaskDropTargetId(task.id);
        }}
        onTaskDragLeave={() => setTaskDropTargetId((current) => (current === task.id ? null : current))}
        onDropOnTask={() => {
          if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") {
            if (options?.boardStatus) moveTaskToBoardStatus(dragPayload.taskId, options.boardStatus, task.id);
            else if (dragPayload.kind === "tree-task") moveTaskBeforeInList(dragPayload.taskId, task.id);
          }
          if (dragPayload?.kind === "booking") linkBookingToTask(dragPayload.bookingId, task.id);
          setDragPayload(null);
          setTaskDropTargetId(null);
        }}
        onDone={(done) => setTaskDone(task.id, done)}
        onTitle={(title) => updateTask(task.id, { title })}
        onStatus={(status) => updateTask(task.id, { status, done: status === "Done" || status === "Aborted" })}
        onEstimate={(estimateMinutes) => updateTask(task.id, { estimateMinutes })}
        onDueDate={(dueDate) => updateTask(task.id, { dueDate: dueDate || undefined })}
        onDescription={(description) => updateTask(task.id, { description })}
        onTags={(tags) => updateTask(task.id, { tags: normalizeTags(tags) })}
        onGoToHierarchy={() => scrollToTask(task.id)}
        onDetachParent={() => detachTaskFromParent(task.id)}
        childTaskTitle={childTaskTitles[task.id] ?? ""}
        onChildTaskTitleChange={(title) => setChildTaskTitles((current) => ({ ...current, [task.id]: title }))}
        onAddChildTask={() => addChildTask(task.id)}
        onArchive={() => toggleTaskArchived(task.id)}
        onDelete={() => deleteTask(task.id)}
      />
    );
  }

  function hasVisibleDescendant(taskId: string): boolean {
    return (tasksByParentId.get(taskId) ?? []).some((child) => filteredTaskIds.has(child.id) || hasVisibleDescendant(child.id));
  }

  function renderHierarchyTaskNodes(parentId = "", depth = 0): ReactNode[] {
    return (tasksByParentId.get(parentId) ?? []).flatMap((task) => {
      const children = tasksByParentId.get(task.id) ?? [];
      const visible = filteredTaskIds.has(task.id) || hasVisibleDescendant(task.id);
      if (!visible) return [];
      const collapsed = children.length > 0 && !hierarchyExpandedTaskIds.includes(task.id);
      return [
        <div className="hierarchy-node" key={task.id} style={{ paddingLeft: depth * 18 }}>
          <div className="hierarchy-row">
            <div className="hierarchy-toggle-cell">
              {children.length > 0 && (
                <button
                  className="hierarchy-collapse"
                  title={collapsed ? "Teilbaum öffnen" : "Teilbaum schließen"}
                  onClick={() => toggleHierarchyTask(task.id)}
                >
                  {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>
            <TaskCard
              task={task}
              allTags={availableTags}
              bookingCount={bookingCountByTaskId.get(task.id) ?? 0}
              bookedMinutes={bookedMinutesByTaskId.get(task.id) ?? 0}
              childCount={childCountByTaskId.get(task.id) ?? 0}
              activeChildCount={activeChildCountByTaskId.get(task.id) ?? 0}
              parentTitle={parentTitleByTaskId.get(task.id)}
              variant="hierarchy"
              expanded={expandedTaskIds.has(task.id)}
              showUnsavedDot={changedTaskId === task.id && saveState !== "saved" && saveState !== "idle"}
              isHierarchySortTarget={hierarchySortTargetId === task.id}
              onToggleExpanded={() => toggleTaskDetails(task.id)}
              onDragStart={() => setDragPayload({ kind: "tree-task", taskId: task.id })}
              onDragEnd={() => {
                setDragPayload(null);
                setHierarchySortTargetId(null);
                setHierarchyChildTargetId(null);
              }}
              onTaskDragOver={() => {
                if (dragPayload) {
                  setHierarchySortTargetId(task.id);
                  setHierarchyChildTargetId(null);
                }
              }}
              onTaskDragLeave={() => setHierarchySortTargetId((current) => (current === task.id ? null : current))}
              onDropOnTask={() => {
                if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") moveTaskBeforeInTree(dragPayload.taskId, task.id);
                if (dragPayload?.kind === "booking") linkBookingToTask(dragPayload.bookingId, task.id);
                setDragPayload(null);
                setHierarchySortTargetId(null);
                setHierarchyChildTargetId(null);
              }}
              onDone={(done) => setTaskDone(task.id, done)}
              onTitle={(title) => updateTask(task.id, { title })}
              onStatus={(status) => updateTask(task.id, { status, done: status === "Done" || status === "Aborted" })}
              onEstimate={(estimateMinutes) => updateTask(task.id, { estimateMinutes })}
              onDueDate={(dueDate) => updateTask(task.id, { dueDate: dueDate || undefined })}
              onDescription={(description) => updateTask(task.id, { description })}
              onTags={(tags) => updateTask(task.id, { tags: normalizeTags(tags) })}
              onGoToHierarchy={() => scrollToTask(task.id)}
              onDetachParent={() => detachTaskFromParent(task.id)}
              childTaskTitle={childTaskTitles[task.id] ?? ""}
              onChildTaskTitleChange={(title) => setChildTaskTitles((current) => ({ ...current, [task.id]: title }))}
              onAddChildTask={() => addChildTask(task.id)}
              onArchive={() => toggleTaskArchived(task.id)}
              onDelete={() => deleteTask(task.id)}
            />
          </div>
          <div
            className={`hierarchy-child-drop ${hierarchyChildTargetId === task.id ? "active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragPayload) {
                setHierarchyChildTargetId(task.id);
                setHierarchySortTargetId(null);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setHierarchyChildTargetId((current) => (current === task.id ? null : current));
              }
            }}
            onDrop={(event) => {
              event.stopPropagation();
              if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") moveTaskAsChild(dragPayload.taskId, task.id);
              if (dragPayload?.kind === "booking") createTaskFromBookingBefore(dragPayload.bookingId, task.id, "hierarchy");
              setDragPayload(null);
              setHierarchySortTargetId(null);
              setHierarchyChildTargetId(null);
            }}
          />
        </div>,
        ...(collapsed ? [] : renderHierarchyTaskNodes(task.id, depth + 1))
      ];
    });
  }

  function exportTaskspace() {
    const currentState = stateRef.current;
    if (!currentState) return;
    const blob = new Blob([JSON.stringify(currentState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `capcal-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function mergeCalendarDays(currentDays: string[], nextDays: string[]) {
    const sorted = Array.from(new Set([...currentDays, ...nextDays])).sort((a, b) => a.localeCompare(b));
    if (sorted.length < 2) return sorted;
    const filled: string[] = [];
    let cursor = sorted[0];
    const end = sorted[sorted.length - 1];
    while (cursor <= end) {
      filled.push(cursor);
      cursor = nextVisibleDate(cursor, settings.showWeekends);
    }
    return filled;
  }

  function mergeCalendarMonths(currentMonths: string[], nextMonths: string[]) {
    return Array.from(new Set([...currentMonths, ...nextMonths].map(startOfMonth))).sort((a, b) => a.localeCompare(b));
  }

  function monthsForDays(dayList: string[]) {
    return Array.from(new Set(dayList.map(startOfMonth)));
  }

  function loadCalendarPeriod(startDate: string) {
    const period = createCalendarPeriod(startDate, settings.visibleDayCount, settings.showWeekends);
    setCalendarStartDate(startDate);
    setDayCalendarStartDate(startDate);
    setLoadedCalendarDays((currentDays) => mergeCalendarDays(currentDays.length > 0 ? currentDays : days, period));
  }

  function loadCalendarMonth(monthStart: string) {
    const normalizedMonth = startOfMonth(monthStart);
    setCalendarStartDate(normalizedMonth);
    setLoadedCalendarMonths((currentMonths) =>
      mergeCalendarMonths(currentMonths.length > 0 ? currentMonths : calendarMonths, [normalizedMonth])
    );
  }

  function setCalendarView(calendarView: CalendarViewMode) {
    if (calendarView === "month") {
      const anchorDate = settings.calendarView === "days" ? dayCalendarStartDate : calendarStartDate;
      const monthStart = startOfMonth(anchorDate);
      setCalendarStartDate(anchorDate);
      setLoadedCalendarMonths((currentMonths) =>
        mergeCalendarMonths(currentMonths.length > 0 ? currentMonths : calendarMonths, [
          monthStart,
          ...monthsForDays(loadedCalendarDays)
        ])
      );
    } else {
      const anchorDate = dayCalendarStartDate;
      const period = createCalendarPeriod(anchorDate, settings.visibleDayCount, settings.showWeekends);
      setCalendarStartDate(anchorDate);
      setLoadedCalendarDays((currentDays) => mergeCalendarDays(currentDays.length > 0 ? currentDays : days, period));
    }
    updateSettings({ calendarView });
  }

  function resetCalendarToToday() {
    setCalendarStartDate(today);
    if (settings.calendarView === "month") {
      setLoadedCalendarMonths((currentMonths) => mergeCalendarMonths(currentMonths.length > 0 ? currentMonths : calendarMonths, [startOfMonth(today)]));
      window.setTimeout(() => {
        document
          .querySelector(`[data-calendar-month="${startOfMonth(today)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }, 0);
    } else {
      const period = createCalendarPeriod(today, settings.visibleDayCount, settings.showWeekends);
      setDayCalendarStartDate(today);
      setLoadedCalendarDays((currentDays) => mergeCalendarDays(currentDays.length > 0 ? currentDays : days, period));
      window.setTimeout(() => {
        document
          .querySelector(`[data-calendar-date="${today}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }, 0);
    }
  }

  function openDayFromMonth(date: string) {
    const period = createCalendarPeriod(date, settings.visibleDayCount, settings.showWeekends);
    setCalendarStartDate(date);
    setDayCalendarStartDate(date);
    setLoadedCalendarDays((currentDays) => mergeCalendarDays(currentDays.length > 0 ? currentDays : days, period));
    updateSettings({ calendarView: "days" });
    window.setTimeout(() => {
      document
        .querySelector(`[data-calendar-date="${date}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 0);
  }

  async function importTaskspace(file: File | undefined) {
    if (!file) return;
    try {
      const importedState = normalizeState(JSON.parse(await file.text()) as AppState);
      stateRef.current = importedState;
      setState(importedState);
      setSaveError("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Import fehlgeschlagen.");
      setSaveState("error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const startedCount = state.tasks.filter((task) => task.status === "Started").length;
  const blockedCount = state.tasks.filter((task) => task.status === "Blocked").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <CalendarDays size={19} />
            <span>CapCal</span>
          </div>
          <p>Plane deine Kapazität wie ein Profi</p>
        </div>
        <div className="topbar-metrics">
          <Metric icon={Loader} label="Started" value={startedCount} className="status-started" />
          <Metric icon={AlertOctagon} label="Blocked" value={blockedCount} className="status-blocked" />
          <div className="taskspace-actions">
            <button className="icon-button ghost" title="Taskspace exportieren" onClick={exportTaskspace}>
              <Download size={16} />
            </button>
            <button className="icon-button ghost" title="Taskspace importieren" onClick={() => importInputRef.current?.click()}>
              <Upload size={16} />
            </button>
            <input
              ref={importInputRef}
              className="file-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importTaskspace(event.target.files?.[0])}
            />
            {(saveState === "dirty" || saveState === "saving" || saveState === "error") && (
              <button
                className={`save-dot save-dot-${saveState}`}
                title={saveState === "error" ? saveError : saveState === "saving" ? "Speichert" : "Ungespeichert"}
                onClick={() => {
                  if (saveState === "error" && saveError) void navigator.clipboard?.writeText(saveError);
                }}
              />
            )}
          </div>
          <div className="settings-menu" ref={settingsMenuRef}>
            <button className="icon-button" title="Einstellungen" onClick={() => setSettingsOpen((open) => !open)}>
              <SlidersHorizontal size={16} />
            </button>
            {settingsOpen && (
              <SettingsPanel
                settings={settings}
                onSettingsChange={updateSettings}
                onCapacityDefaultsChange={updateCapacityDefaults}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </div>
          {authUser && (
            <div className="settings-menu" ref={userMenuRef}>
              <button className="icon-button ghost user-button" title="Benutzermenü" onClick={() => setUserPanel((panel) => (panel ? null : "menu"))}>
                {userSettings?.profile.initials ? <span>{userSettings.profile.initials}</span> : <User size={16} />}
              </button>
              {userPanel === "menu" && (
                <div className="settings-panel user-menu-panel">
                  <button className="menu-row" onClick={() => setUserPanel("settings")}>
                    <User size={15} />
                    Benutzereinstellungen
                  </button>
                  <button className="menu-row" onClick={() => setUserPanel("gcal")}>
                    <CalendarDays size={15} />
                    Google Calendar
                  </button>
                  <button className="menu-row" onClick={() => setUserPanel("icloud")}>
                    <CalendarDays size={15} />
                    iCloud Kalender
                  </button>
                </div>
              )}
              {userPanel === "settings" && (
                <UserSettingsPanel
                  authUser={authUser}
                  userSettings={userSettings}
                  error={userSettingsError}
                  onProfileChange={saveUserProfile}
                  onRotateApiKey={rotateUserApiKey}
                  onClose={() => setUserPanel(null)}
                />
              )}
              {userPanel === "gcal" && (
                <GoogleCalendarPanel
                  googleCalendar={googleCalendar}
                  error={googleCalendarError}
                  onConnect={() => {
                    window.location.href = "/api/auth/gcal/connect";
                  }}
                  onRefresh={() => void loadGoogleCalendar(true)}
                  onSelectionChange={updateGoogleCalendarSelection}
                  onDisconnect={disconnectGoogleCalendar}
                  onClose={() => setUserPanel(null)}
                />
              )}
              {userPanel === "icloud" && (
                <ICloudCalendarPanel
                  iCloudCalendar={iCloudCalendar}
                  error={iCloudCalendarError}
                  onConnect={connectICloudCalendar}
                  onRefresh={() => void loadICloudCalendar(true)}
                  onSelectionChange={updateICloudCalendarSelection}
                  onDisconnect={disconnectICloudCalendar}
                  onClose={() => setUserPanel(null)}
                />
              )}
            </div>
          )}
          {authUser && (
            <button className="icon-button ghost" title={`Logout ${authUser.email}`} onClick={() => void logout()}>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      <section className="workspace" style={{ gridTemplateColumns: workspaceColumns }}>
        <Panel
          title="Aufgaben"
          icon={ListTree}
          collapsed={settings.panelsCollapsed.tree}
          onToggle={() => togglePanel("tree")}
          className="tree-panel"
          headerActions={
            <div className="view-chips" aria-label="Aufgabenansicht">
              <button className={`view-chip ${settings.taskView === "list" ? "active" : ""}`} onClick={() => setTreeView("list")}>
                Liste
              </button>
              <button className={`view-chip ${settings.taskView === "board" ? "active" : ""}`} onClick={() => setTreeView("board")}>
                Board
              </button>
              <button
                className={`view-chip ${settings.taskView === "hierarchy" ? "active" : ""}`}
                onClick={() => setTreeView("hierarchy")}
              >
                Hierarchie
              </button>
            </div>
          }
        >
          <div className="tree-filters">
            <div className="filter-control">
              <input
                aria-label="Aufgaben suchen"
                placeholder="Suchen"
                value={treeFilters.query}
                onChange={(event) => updateSettings({ treeFilters: { ...treeFilters, query: event.target.value } })}
              />
            </div>
            <div className="status-filter-chips" aria-label="Status filtern">
              <button
                className={`filter-chip archive-filter-chip ${treeFilters.showArchived ? "active" : ""}`}
                onClick={() => updateSettings({ treeFilters: { ...treeFilters, showArchived: !treeFilters.showArchived } })}
              >
                <Archive size={13} />
                Archiv
              </button>
              <button
                className={`filter-chip ${treeFilters.statuses.length === 0 ? "active" : ""}`}
                onClick={() => updateSettings({ treeFilters: { ...treeFilters, statuses: [] } })}
              >
                Alle
              </button>
              {statuses.map((status) => {
                const active = treeFilters.statuses.includes(status);
                return (
                  <button
                    className={`filter-chip status-filter-chip ${active ? `active ${statusMeta[status].className}` : ""}`}
                    key={status}
                    onClick={() => toggleTreeFilterStatus(status)}
                  >
                    <StatusIcon status={status} />
                    {status}
                  </button>
                );
              })}
              {availableTags.map((tag) => {
                const active = treeFilters.tags.includes(tag);
                return (
                  <button className={`filter-chip tag-chip ${active ? "active" : ""}`} key={tag} onClick={() => toggleTreeFilterTag(tag)}>
                    {tag}
                  </button>
                );
              })}
              {(treeFilters.query || treeFilters.statuses.length > 0 || treeFilters.tags.length > 0 || treeFilters.showArchived) && (
                <button
                  className="filter-reset-chip"
                  title="Filter zurücksetzen"
                  onClick={() => updateSettings({ treeFilters: { query: "", statuses: [], tags: [], showArchived: false } })}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="task-form">
            <input
              aria-label="Aufgabentitel"
              placeholder="Neue Aufgabe"
              value={newTask.title}
              onChange={(event) => setNewTask({ ...newTask, title: event.target.value })}
              onKeyDown={(event) => event.key === "Enter" && addTreeTask()}
            />
            <input
              aria-label="Fälligkeitsdatum"
              type="date"
              value={newTask.dueDate}
              onChange={(event) => setNewTask({ ...newTask, dueDate: event.target.value })}
            />
            <EstimateSelect
              aria-label="Aufwand in Minuten"
              value={newTask.estimateMinutes}
              allowUnknown
              onValueChange={(estimateMinutes) => setNewTask({ ...newTask, estimateMinutes })}
            />
            <button className="primary icon-button" title="Aufgabe anlegen" onClick={addTreeTask}>
              <Plus size={17} />
            </button>
          </div>

          {settings.taskView === "list" ? (
            <div className="list">
              {filteredTreeTasks.map((task) => (
                <div className="list-task-slot" key={task.id}>
                  <div
                    className={`list-booking-drop ${hierarchyChildTargetId === task.id ? "active" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (dragPayload?.kind === "booking") setHierarchyChildTargetId(task.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setHierarchyChildTargetId((current) => (current === task.id ? null : current));
                      }
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
                      if (dragPayload?.kind === "booking") createTaskFromBookingBefore(dragPayload.bookingId, task.id, "list");
                      setDragPayload(null);
                      setHierarchyChildTargetId(null);
                    }}
                  />
                  {renderTreeTaskCard(task)}
                </div>
              ))}
            </div>
          ) : settings.taskView === "hierarchy" ? (
            <div className="hierarchy-view">{renderHierarchyTaskNodes()}</div>
          ) : (
            <div className="board-view">
              <div className="board-column-controls">
                <span>Spalten</span>
                {statuses.map((status) => {
                  const hidden = settings.boardHiddenStatuses.includes(status);
                  return (
                    <button
                      className={`filter-chip status-filter-chip ${hidden ? "" : `active ${statusMeta[status].className}`}`}
                      key={status}
                      onClick={() => toggleBoardColumn(status)}
                    >
                      <StatusIcon status={status} />
                      {status}
                    </button>
                  );
                })}
              </div>
              <div className="task-board" style={{ gridTemplateColumns: `repeat(${visibleBoardStatuses.length}, minmax(340px, 340px))` }}>
                {visibleBoardStatuses.map((status) => {
                  const columnTasks = sortedBoardTasks(filteredTreeTasks.filter((task) => task.status === status));
                  return (
                    <section
                      className={`board-column ${statusMeta[status].className}`}
                      key={status}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") moveTaskToBoardStatus(dragPayload.taskId, status);
                        setDragPayload(null);
                      }}
                    >
                      <header>
                        <div>
                          <StatusIcon status={status} />
                          <strong>{status}</strong>
                          <span>{columnTasks.length}</span>
                        </div>
                      </header>
                      <div className="board-quick-add">
                        <input
                          placeholder="Neue Aufgabe"
                          value={boardQuickAdd[status]}
                          onChange={(event) => setBoardQuickAdd((current) => ({ ...current, [status]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") addBoardTask(status);
                          }}
                        />
                        <button className="icon-button" title={`${status}-Aufgabe anlegen`} onClick={() => addBoardTask(status)}>
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="board-card-list">
                        {columnTasks.map((task) => (
                          <div className="board-task-slot" key={task.id}>
                            <div
                              className={`board-booking-drop ${hierarchyChildTargetId === task.id ? "active" : ""}`}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (dragPayload?.kind === "booking") setHierarchyChildTargetId(task.id);
                              }}
                              onDragLeave={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                  setHierarchyChildTargetId((current) => (current === task.id ? null : current));
                                }
                              }}
                              onDrop={(event) => {
                                event.stopPropagation();
                                if (dragPayload?.kind === "booking") createTaskFromBookingBefore(dragPayload.bookingId, task.id, "board");
                                setDragPayload(null);
                                setHierarchyChildTargetId(null);
                              }}
                            />
                            {renderTreeTaskCard(task, { boardStatus: status })}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Priorisierung"
          icon={Target}
          collapsed={settings.panelsCollapsed.prio}
          onToggle={() => togglePanel("prio")}
          className="prio-panel"
          onDrop={() => {
            if (dragPayload && dragPayload.kind !== "booking") addToPrio(dragPayload.taskId);
            setDragPayload(null);
          }}
        >
          <div className="quick-add">
            <input
              placeholder="Direkt in Prio anlegen"
              value={quickAdd.prio}
              onChange={(event) => setQuickAdd({ ...quickAdd, prio: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  upsertTask(quickAdd.prio, "prio");
                  setQuickAdd({ ...quickAdd, prio: "" });
                }
              }}
            />
            <button
              className="icon-button"
              title="In Prio anlegen"
              onClick={() => {
                upsertTask(quickAdd.prio, "prio");
                setQuickAdd({ ...quickAdd, prio: "" });
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="drop-hint">Aufgaben aus dem Tree hierher ziehen. In der Liste per Drag & Drop sortieren.</div>
          <div className="list prio-list">
            {state.prioTaskIds.map((taskId) => {
              const task = taskById.get(taskId);
              if (!task || task.archived) return null;
              const prioDuration =
                state.prioDurations?.[task.id] ?? durationForPlanning(task.estimateMinutes, settings.defaultPrioDurationMinutes);
              return (
                <div
                  className={`prio-card status-card ${statusMeta[task.status].className}`}
                  key={task.id}
                  draggable
                  onDragStart={(event) => {
                    event.currentTarget.classList.add("dragging-source");
                    setDragPayload({ kind: "prio-task", taskId: task.id });
                  }}
                  onDragEnd={(event) => {
                    event.currentTarget.classList.remove("dragging-source");
                    setDragPayload(null);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.stopPropagation();
                    if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") moveBeforeInPrio(dragPayload.taskId, task.id);
                    setDragPayload(null);
                  }}
                >
                  <GripVertical size={16} />
                  <StatusIcon status={task.status} />
                  <div className="prio-card-main">
                    <strong>{task.title}</strong>
                  </div>
                  <div className="prio-card-side">
                    {task.dueDate && <span className={`task-deadline-pill ${deadlineTone(task.dueDate)}`}>{formatOptionalDate(task.dueDate)}</span>}
                    <TaskTimeChip task={task} bookedMinutes={bookedMinutesByTaskId.get(task.id) ?? 0} />
                    <select
                      className="prio-duration"
                      aria-label="Dauer in Priorisierung"
                      value={prioDuration}
                      onChange={(event) =>
                        updateState((draft) => ({
                          ...draft,
                          prioDurations: {
                            ...(draft.prioDurations ?? {}),
                            [task.id]: Number(event.target.value)
                          }
                        }))
                      }
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.preventDefault()}
                    >
                      {durationOptions.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutesToTimeLabel(minutes)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="icon-button ghost" title="Aus Prio entfernen" onClick={() => removeFromPrio(task.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Kalender"
          icon={CalendarDays}
          collapsed={settings.panelsCollapsed.cal}
          onToggle={() => togglePanel("cal")}
          className="cal-panel"
          headerActions={
            <div className="view-chips calendar-view-chips" aria-label="Kalenderansicht">
              <button className={`view-chip ${settings.calendarView === "days" ? "active" : ""}`} onClick={() => setCalendarView("days")}>
                Tag
              </button>
              <button className={`view-chip ${settings.calendarView === "month" ? "active" : ""}`} onClick={() => setCalendarView("month")}>
                Monat
              </button>
            </div>
          }
        >
          <div className="cal-tools">
            <select
              className="day-count-select"
              aria-label="Sichtbare Tage"
              value={settings.visibleDayCount}
              onChange={(event) => updateSettings({ visibleDayCount: Number(event.target.value) })}
              disabled={settings.calendarView === "month"}
            >
              {visibleDayOptions.map((count) => (
                <option key={count} value={count}>
                  {count} Tage
                </option>
              ))}
            </select>
            <button
              className={`weekend-chip ${settings.showWeekends ? "active" : ""}`}
              onClick={() => updateSettings({ showWeekends: !settings.showWeekends })}
              aria-pressed={settings.showWeekends}
            >
              Wochenende
            </button>
            <button
              className="soft-button icon-button"
              title={settings.calendarView === "month" ? "Vorherigen Monat laden" : "Vorherige Periode laden"}
              onClick={() =>
                settings.calendarView === "month"
                  ? loadCalendarMonth(addMonths(calendarMonths[0], -1))
                  : loadCalendarPeriod(addDays(calendarStartDate, -settings.visibleDayCount))
              }
            >
              <ChevronLeft size={15} />
            </button>
            <button className="soft-button today-button" onClick={resetCalendarToToday}>
              Heute
            </button>
            <button
              className="soft-button icon-button"
              title={settings.calendarView === "month" ? "Nächsten Monat laden" : "Nächste Periode laden"}
              onClick={() =>
                settings.calendarView === "month"
                  ? loadCalendarMonth(addMonths(calendarMonths[calendarMonths.length - 1], 1))
                  : loadCalendarPeriod(addDays(calendarStartDate, settings.visibleDayCount))
              }
            >
              <ChevronRight size={15} />
            </button>
            <button
              className={`soft-button icon-button ${googleCalendarEventsLoading || iCloudCalendarEventsLoading ? "syncing" : ""}`}
              title={googleCalendarEventsLoading || iCloudCalendarEventsLoading ? "Kalender werden aktualisiert" : "Externe Kalender aktualisieren"}
              disabled={googleCalendarEventsLoading || iCloudCalendarEventsLoading}
              onClick={() => void refreshExternalCalendarEvents()}
            >
              <CalendarSync size={15} />
            </button>
          </div>
          <div className="calendar-scroll">
            {settings.calendarView === "month" ? (
              <MonthCalendarView
                months={calendarMonths}
                showWeekends={settings.showWeekends}
                bookings={state.bookings}
                externalEventsByDate={externalEventsByDate}
                dailyCapacities={state.dailyCapacities ?? {}}
                defaultCapacity={defaultCapacity}
                onOpenDay={openDayFromMonth}
              />
            ) : (
              <div className="calendar-grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))` }}>
                {days.map((date) => (
                  <DayColumn
                    key={date}
                    date={date}
                    bookings={state.bookings.filter((booking) => booking.date === date)}
                    googleEvents={externalEventsByDate.get(date) ?? []}
                    capacity={state.dailyCapacities?.[date] ?? defaultCapacity}
                    calendarStartMinutes={calendarStartMinutes}
                    calendarEndMinutes={calendarEndMinutes}
                    timeOptions={timeOptions}
                    taskById={taskById}
                    onDrop={handleDrop}
                    onBookingDrag={(bookingId) => setDragPayload({ kind: "booking", bookingId })}
                    onBookingDragEnd={() => setDragPayload(null)}
                    isDragging={dragPayload !== null}
                    onBookingChange={updateBooking}
                    onBookingDelete={deleteBooking}
                    onOpenTask={scrollToTask}
                    onCapacityChange={(patch) => updateDailyCapacity(date, patch)}
                    onAddLooseBooking={addDefaultLooseBooking}
                    dayTemplates={state.dayTemplates ?? []}
                    onSaveTemplate={saveDayAsTemplate}
                    onApplyTemplate={applyDayTemplate}
                    onDeleteTemplate={deleteDayTemplate}
                  />
                ))}
              </div>
            )}
            {googleCalendarEventsError && <div className="calendar-error">{googleCalendarEventsError}</div>}
            {iCloudCalendarEventsError && <div className="calendar-error">{iCloudCalendarEventsError}</div>}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({
  title,
  icon: Icon,
  collapsed,
  onToggle,
  children,
  className,
  headerActions,
  onDrop
}: {
  title: string;
  icon: typeof Circle;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className: string;
  headerActions?: ReactNode;
  onDrop?: () => void;
}) {
  return (
    <section
      className={`panel ${className} ${collapsed ? "collapsed" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <button className="panel-tab" onClick={onToggle} title={collapsed ? `${title} öffnen` : `${title} schließen`}>
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <header className="panel-header">
        <Icon size={18} />
        <h2>{title}</h2>
        {!collapsed && headerActions}
      </header>
      {!collapsed && children}
    </section>
  );
}

function EstimateSelect({
  value,
  onValueChange,
  "aria-label": ariaLabel,
  allowUnknown = false
}: {
  value?: number;
  onValueChange: (value: number | undefined) => void;
  "aria-label"?: string;
  allowUnknown?: boolean;
}) {
  const hasCustomValue = value !== undefined && !estimateOptions.includes(value);
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? ""}
      onChange={(event) => onValueChange(event.target.value ? Number(event.target.value) : undefined)}
    >
      {hasCustomValue && <option value={value}>{estimateToLabel(value)}</option>}
      {estimateOptionGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((minutes) => (
            <option key={minutes} value={minutes}>
              {estimateToLabel(minutes)}
            </option>
          ))}
        </optgroup>
      ))}
      {allowUnknown && <option value="">?</option>}
    </select>
  );
}

function UserSettingsPanel({
  authUser,
  userSettings,
  error,
  onProfileChange,
  onRotateApiKey,
  onClose
}: {
  authUser: AuthUser;
  userSettings: UserSettingsState | null;
  error: string;
  onProfileChange: (profile: UserProfile) => Promise<void>;
  onRotateApiKey: () => Promise<void>;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile>({});
  const profileSaveTimerRef = useRef<number | null>(null);
  const pendingProfileRef = useRef<UserProfile | null>(null);
  const onProfileChangeRef = useRef(onProfileChange);

  onProfileChangeRef.current = onProfileChange;

  useEffect(() => {
    if (userSettings?.profile) setProfile(userSettings.profile);
  }, [userSettings?.profile]);

  useEffect(() => {
    return () => {
      if (profileSaveTimerRef.current) window.clearTimeout(profileSaveTimerRef.current);
      if (pendingProfileRef.current) void onProfileChangeRef.current(pendingProfileRef.current);
    };
  }, []);

  function queueProfileChange(nextProfile: UserProfile) {
    setProfile(nextProfile);
    pendingProfileRef.current = nextProfile;
    if (profileSaveTimerRef.current) window.clearTimeout(profileSaveTimerRef.current);
    profileSaveTimerRef.current = window.setTimeout(() => {
      const pendingProfile = pendingProfileRef.current;
      pendingProfileRef.current = null;
      if (pendingProfile) void onProfileChangeRef.current(pendingProfile);
    }, 800);
  }

  return (
    <div className="settings-panel user-settings-panel">
      <div className="settings-header">
        <h2>Benutzereinstellungen</h2>
        <button className="icon-button ghost" title="Profil schließen" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="settings-section user-profile-section">
        <h3>Profil</h3>
        <label>
          Name
          <input value={profile.name ?? ""} onChange={(event) => queueProfileChange({ ...profile, name: event.target.value })} />
        </label>
        <label>
          Kürzel
          <input
            value={profile.initials ?? ""}
            maxLength={3}
            onChange={(event) => queueProfileChange({ ...profile, initials: event.target.value.toUpperCase() })}
          />
        </label>
        <label>
          E-Mail
          <input value={userSettings?.user.email ?? authUser.email} readOnly />
        </label>
        <label>
          Zeitzone
          <select
            value={profile.timezone && profile.timezone.startsWith("UTC") ? profile.timezone : browserUtcOffset()}
            onChange={(event) => queueProfileChange({ ...profile, timezone: event.target.value })}
          >
            {utcOffsetOptions.map((offset) => (
              <option key={offset} value={offset}>
                {offset}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-section user-api-section">
        <h3>API-Key</h3>
        <div className="api-key-display">
          <code>{userSettings?.apiKey ? maskVisibleApiKey(userSettings.apiKey) : (userSettings?.apiKeyMasked ?? "Noch kein API-Key")}</code>
          {userSettings?.apiKey && (
            <button className="icon-button ghost" title="API-Key kopieren" onClick={() => void navigator.clipboard?.writeText(userSettings.apiKey!)}>
              <Copy size={14} />
            </button>
          )}
          <button className="icon-button ghost" title="API-Key erneuern" onClick={() => void onRotateApiKey()}>
            <RotateCcw size={14} />
          </button>
        </div>
        {userSettings?.apiKey && <p className="api-key-hint">Der neue Key kann jetzt kopiert werden.</p>}
        <p className="api-key-hint">
          Zuletzt verwendet: {userSettings?.apiKeyLastUsedAt ? new Date(userSettings.apiKeyLastUsedAt).toLocaleString("de-DE") : "noch nie"}
        </p>
      </div>
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}

function GoogleCalendarPanel({
  googleCalendar,
  error,
  onConnect,
  onRefresh,
  onSelectionChange,
  onDisconnect,
  onClose
}: {
  googleCalendar: GoogleCalendarState | null;
  error: string;
  onConnect: () => void;
  onRefresh: () => void;
  onSelectionChange: (selectedCalendarIds: string[]) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onClose: () => void;
}) {
  const calendars = googleCalendar?.calendars ?? [];
  const selectedCalendarIds = calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id);

  function toggleCalendar(calendarId: string) {
    const selectedIds = new Set(selectedCalendarIds);
    if (selectedIds.has(calendarId)) selectedIds.delete(calendarId);
    else selectedIds.add(calendarId);
    void onSelectionChange([...selectedIds]);
  }

  return (
    <div className="settings-panel google-calendar-panel">
      <div className="settings-header">
        <h2>Google Calendar</h2>
        <div className="settings-header-actions">
          {googleCalendar?.connected && (
            <>
              <button className="icon-button ghost" title="Kalender aktualisieren" onClick={onRefresh}>
                <ListRestart size={14} />
              </button>
              <button className="icon-button ghost danger-icon" title="Verbindung trennen" onClick={() => void onDisconnect()}>
                <CloudOff size={14} />
              </button>
            </>
          )}
          <button className="icon-button ghost" title="Google Calendar schließen" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>
      {!googleCalendar?.connected ? (
        <div className="settings-section google-calendar-connect">
          <p>Verbinde dein Google-Konto, um relevante Kalender für CapCal auszuwählen.</p>
          <button className="primary" onClick={onConnect}>
            Google Calendar verbinden
          </button>
        </div>
      ) : (
        <>
          <div className="gcal-account">
            <span>Verbunden als</span>
            <strong>{googleCalendar.googleEmail ?? "Google-Konto"}</strong>
          </div>
          <div className="settings-section google-calendar-list">
            <h3>Relevante Kalender</h3>
            {calendars.length === 0 ? (
              <p>Keine Kalender gefunden.</p>
            ) : (
              calendars.map((calendar) => (
                <label key={calendar.id} className="gcal-calendar-row">
                  <input type="checkbox" checked={calendar.selected} onChange={() => toggleCalendar(calendar.id)} />
                  <span className="gcal-color" style={{ background: calendar.color ?? "#d9dfd4" }} />
                  <span>{calendar.summary}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}

function ICloudCalendarPanel({
  iCloudCalendar,
  error,
  onConnect,
  onRefresh,
  onSelectionChange,
  onDisconnect,
  onClose
}: {
  iCloudCalendar: ICloudCalendarState | null;
  error: string;
  onConnect: (appleId: string, appPassword: string) => Promise<void>;
  onRefresh: () => void;
  onSelectionChange: (selectedCalendarIds: string[]) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onClose: () => void;
}) {
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const calendars = iCloudCalendar?.calendars ?? [];
  const selectedCalendarIds = calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id);

  useEffect(() => {
    if (iCloudCalendar?.appleId) setAppleId(iCloudCalendar.appleId);
  }, [iCloudCalendar?.appleId]);

  function toggleCalendar(calendarId: string) {
    const selectedIds = new Set(selectedCalendarIds);
    if (selectedIds.has(calendarId)) selectedIds.delete(calendarId);
    else selectedIds.add(calendarId);
    void onSelectionChange([...selectedIds]);
  }

  return (
    <div className="settings-panel google-calendar-panel">
      <div className="settings-header">
        <h2>iCloud Kalender</h2>
        <div className="settings-header-actions">
          {iCloudCalendar?.connected && (
            <>
              <button className="icon-button ghost" title="Kalender aktualisieren" onClick={onRefresh}>
                <ListRestart size={14} />
              </button>
              <button className="icon-button ghost danger-icon" title="Verbindung trennen" onClick={() => void onDisconnect()}>
                <CloudOff size={14} />
              </button>
            </>
          )}
          <button className="icon-button ghost" title="iCloud Kalender schließen" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>
      {!iCloudCalendar?.connected ? (
        <div className="settings-section google-calendar-connect">
          <p>Verbinde iCloud mit deiner Apple ID und einem App-spezifischen Passwort.</p>
          <input placeholder="Apple ID" value={appleId} onChange={(event) => setAppleId(event.target.value)} />
          <input
            placeholder="App-spezifisches Passwort"
            type="password"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
          />
          <button
            className="primary"
            onClick={() => {
              void onConnect(appleId, appPassword).then(() => setAppPassword(""));
            }}
          >
            iCloud verbinden
          </button>
        </div>
      ) : (
        <>
          <div className="gcal-account">
            <span>Verbunden als</span>
            <strong>{iCloudCalendar.appleId ?? "Apple ID"}</strong>
          </div>
          <div className="settings-section google-calendar-list">
            <h3>Relevante Kalender</h3>
            {calendars.length === 0 ? (
              <p>Keine Kalender gefunden.</p>
            ) : (
              calendars.map((calendar) => (
                <label key={calendar.id} className="gcal-calendar-row">
                  <input type="checkbox" checked={calendar.selected} onChange={() => toggleCalendar(calendar.id)} />
                  <span className="gcal-color" style={{ background: calendar.color ?? "#d9dfd4" }} />
                  <span>{calendar.summary}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
      {error && <div className="login-error">{error}</div>}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSettingsChange,
  onCapacityDefaultsChange,
  onClose
}: {
  settings: AppSettings;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onCapacityDefaultsChange: (patch: Pick<Partial<AppSettings>, "defaultDayCapacityMinutes" | "defaultPlanningCapacityMinutes">) => void;
  onClose: () => void;
}) {
  const fullDayOptions = createTimeOptions("00:00", "23:45");

  function updateCalendarTime(patch: Pick<Partial<AppSettings>, "calendarStartTime" | "calendarEndTime">) {
    const nextStart = patch.calendarStartTime ?? settings.calendarStartTime;
    const nextEnd = patch.calendarEndTime ?? settings.calendarEndTime;
    if (timeToMinutes(nextEnd) <= timeToMinutes(nextStart)) return;
    onSettingsChange(patch);
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Einstellungen</h2>
        <button className="icon-button ghost" title="Einstellungen schließen" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="settings-section">
        <h3>Aufwand/Dauer</h3>
        <label>
          Aufgaben
          <EstimateSelect
            value={settings.defaultTreeDurationMinutes}
            onValueChange={(defaultTreeDurationMinutes) => {
              if (defaultTreeDurationMinutes) onSettingsChange({ defaultTreeDurationMinutes });
            }}
          />
        </label>
        <label>
          Priorisierung
          <select
            value={settings.defaultPrioDurationMinutes}
            onChange={(event) => onSettingsChange({ defaultPrioDurationMinutes: Number(event.target.value) })}
          >
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToTimeLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-section">
        <h3>Kapazität</h3>
        <label>
          Tag
          <select
            value={settings.defaultDayCapacityMinutes}
            onChange={(event) => onCapacityDefaultsChange({ defaultDayCapacityMinutes: Number(event.target.value) })}
          >
            {dayCapacityOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plan
          <select
            value={settings.defaultPlanningCapacityMinutes}
            onChange={(event) => onCapacityDefaultsChange({ defaultPlanningCapacityMinutes: Number(event.target.value) })}
          >
            {planningCapacityOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-section">
        <h3>Kalender</h3>
        <label>
          Von
          <select value={settings.calendarStartTime} onChange={(event) => updateCalendarTime({ calendarStartTime: event.target.value })}>
            {fullDayOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bis
          <select value={settings.calendarEndTime} onChange={(event) => updateCalendarTime({ calendarEndTime: event.target.value })}>
            {fullDayOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tage
          <select value={settings.visibleDayCount} onChange={(event) => onSettingsChange({ visibleDayCount: Number(event.target.value) })}>
            {visibleDayOptions.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <div className="settings-check-spacer" />
        <label className="settings-check">
          <input type="checkbox" checked={settings.showWeekends} onChange={(event) => onSettingsChange({ showWeekends: event.target.checked })} />
          Wochenende anzeigen
        </label>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  allTags,
  bookingCount,
  bookedMinutes,
  childCount,
  activeChildCount,
  parentTitle,
  variant = "list",
  expanded,
  showUnsavedDot,
  isDropTarget = false,
  isHierarchySortTarget = false,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  onTaskDragOver,
  onTaskDragLeave,
  onDropOnTask,
  onDone,
  onTitle,
  onStatus,
  onEstimate,
  onDueDate,
  onDescription,
  onTags,
  onGoToHierarchy,
  onDetachParent,
  childTaskTitle,
  onChildTaskTitleChange,
  onAddChildTask,
  onArchive,
  onDelete
}: {
  task: Task;
  allTags: string[];
  bookingCount: number;
  bookedMinutes: number;
  childCount: number;
  activeChildCount: number;
  parentTitle?: string;
  variant?: "list" | "board" | "hierarchy";
  expanded: boolean;
  showUnsavedDot: boolean;
  isDropTarget?: boolean;
  isHierarchySortTarget?: boolean;
  onToggleExpanded: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onTaskDragOver?: () => void;
  onTaskDragLeave?: () => void;
  onDropOnTask: () => void;
  onDone: (done: boolean) => void;
  onTitle: (title: string) => void;
  onStatus: (status: TaskStatus) => void;
  onEstimate: (estimate: number | undefined) => void;
  onDueDate: (date: string) => void;
  onDescription: (description: string) => void;
  onTags: (tags: string[]) => void;
  onGoToHierarchy: () => void;
  onDetachParent: () => void;
  childTaskTitle: string;
  onChildTaskTitleChange: (title: string) => void;
  onAddChildTask: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [parentMenuOpen, setParentMenuOpen] = useState(false);
  const parentMenuRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!parentMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !parentMenuRef.current?.contains(target)) setParentMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [parentMenuOpen]);

  return (
    <article
      className={`task-card task-card-${variant} status-card ${statusMeta[task.status].className} ${task.archived ? "archived" : ""} ${isDropTarget ? "task-drop-target" : ""} ${isHierarchySortTarget ? "hierarchy-sort-target" : ""}`}
      data-task-id={task.id}
      draggable={!task.archived}
      onDragStart={(event) => {
        event.currentTarget.classList.add("dragging-source");
        onDragStart();
      }}
      onDragEnd={(event) => {
        event.currentTarget.classList.remove("dragging-source");
        onDragEnd();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onTaskDragOver?.();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onTaskDragLeave?.();
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDropOnTask();
      }}
    >
      <div className="task-row">
        <GripVertical className="drag-handle" size={15} />
        <button className="task-expand-button" title={expanded ? "Details schließen" : "Details öffnen"} onClick={onToggleExpanded}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button className={`check-button ${task.done ? "checked" : ""}`} title="Erledigt" onClick={() => onDone(!task.done)}>
          {task.done && <Check size={14} />}
        </button>
        <div className="task-main">
          <StatusIcon status={task.status} />
          <strong>{task.title}</strong>
          {showUnsavedDot && <span className="task-unsaved-dot" title="Ungespeicherte Änderung" />}
        </div>
        <div className="task-compact-meta">
          <span className={`task-status-pill ${statusMeta[task.status].className}`}>{task.status}</span>
          {task.dueDate && <span className={`task-deadline-pill ${deadlineTone(task.dueDate)}`}>{formatOptionalDate(task.dueDate)}</span>}
          <TaskTimeChip task={task} bookedMinutes={bookedMinutes} />
          {parentTitle && (
            <span className="task-parent-chip-wrap" ref={parentMenuRef}>
              <button
                className="task-hierarchy-chip"
                title={`Parent: ${parentTitle}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setParentMenuOpen((open) => !open);
                }}
              >
                <ArrowUpNarrowWide size={11} />
                {parentTitle}
              </button>
              {parentMenuOpen && (
                <span className="task-parent-menu">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onGoToHierarchy();
                      setParentMenuOpen(false);
                    }}
                  >
                    Anzeigen
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDetachParent();
                      setParentMenuOpen(false);
                    }}
                  >
                    Lösen
                  </button>
                </span>
              )}
            </span>
          )}
          {childCount > 0 && (
            <button className="task-hierarchy-chip" title={`${childCount} Unteraufgabe${childCount === 1 ? "" : "n"}`} onClick={onGoToHierarchy}>
              <FolderTree size={11} />
              {childCount}
            </button>
          )}
          {bookingCount > 0 && (
            <span className="task-booking-chip" title={`${bookingCount} Buchung${bookingCount === 1 ? "" : "en"} im Kalender`}>
              <CalendarDays size={11} />
              {bookingCount}
            </span>
          )}
          {(task.tags ?? []).map((tag) => (
            <span className="task-tag-chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <button
          className="icon-button ghost"
          title={
            !task.archived && activeChildCount > 0
              ? "Aufgaben mit aktiven Unteraufgaben können nicht archiviert werden"
              : task.archived
                ? "Aufgabe aus Archiv holen"
                : "Aufgabe archivieren"
          }
          disabled={!task.archived && activeChildCount > 0}
          onClick={onArchive}
        >
          <Archive size={15} />
        </button>
        <button
          className="icon-button ghost danger"
          title={childCount > 0 ? "Aufgaben mit Unteraufgaben können noch nicht gelöscht werden" : "Aufgabe löschen"}
          disabled={childCount > 0}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && (
        <div className="task-detail-panel">
          <label>
            <input placeholder="Titel" value={task.title} onChange={(event) => onTitle(event.target.value)} />
          </label>
          <label>
            <textarea
              placeholder="Beschreibung"
              value={task.description ?? ""}
              onChange={(event) => onDescription(event.target.value)}
              onDragStart={(event) => event.preventDefault()}
            />
          </label>
          <TaskTagPicker allTags={allTags} task={task} onTags={onTags} />
          <div className="child-task-form">
            <input
              placeholder="Neue Unteraufgabe"
              value={childTaskTitle}
              onChange={(event) => onChildTaskTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAddChildTask();
              }}
            />
            <button className="icon-button" title="Unteraufgabe anlegen" onClick={onAddChildTask}>
              <Plus size={15} />
            </button>
          </div>
          <div className="task-detail-grid">
            <label>
              Deadline
              <input type="date" value={task.dueDate ?? ""} onChange={(event) => onDueDate(event.target.value)} />
            </label>
            <label>
              Status
              <select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)}>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Aufwand
              <EstimateSelect
                aria-label="Aufwand"
                value={task.estimateMinutes}
                allowUnknown
                onValueChange={onEstimate}
              />
            </label>
          </div>
        </div>
      )}
    </article>
  );
}

function TaskTimeChip({ task, bookedMinutes }: { task: Task; bookedMinutes: number }) {
  const hasBookings = bookedMinutes > 0;
  const hasEstimate = task.estimateMinutes !== undefined;
  const overEstimate = hasBookings && hasEstimate && bookedMinutes >= task.estimateMinutes!;
  const tone = task.done ? "done" : overEstimate ? "over" : "neutral";
  return (
    <span className={`task-time-chip task-time-${tone}`} title={hasBookings ? "Soll / Ist" : "Soll"}>
      <Goal size={11} />
      {estimateToLabel(task.estimateMinutes)}
      {hasBookings && (
        <>
          <span className="time-chip-separator">/</span>
          <Hourglass size={11} />
          {minutesToTimeLabel(bookedMinutes)}
        </>
      )}
    </span>
  );
}

function TaskTagPicker({ allTags, task, onTags }: { allTags: string[]; task: Task; onTags: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const selectedTags = task.tags ?? [];
  const query = input.trim().toLowerCase();
  const suggestions = allTags
    .filter((tag) => !selectedTags.includes(tag))
    .filter((tag) => !query || tag.toLowerCase().includes(query))
    .slice(0, 6);
  const canCreate = Boolean(input.trim()) && !allTags.some((tag) => tag.toLowerCase() === input.trim().toLowerCase());

  function addTag(tag: string) {
    const [normalizedTag] = normalizeTags([tag]);
    if (!normalizedTag || selectedTags.includes(normalizedTag)) return;
    onTags([...selectedTags, normalizedTag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onTags(selectedTags.filter((candidate) => candidate !== tag));
  }

  return (
    <div className="tag-picker">
      <div className="tag-picker-selected">
        {selectedTags.map((tag) => (
          <button className="tag-remove-chip" key={tag} onClick={() => removeTag(tag)}>
            {tag}
            <X size={12} />
          </button>
        ))}
      </div>
      <input
        placeholder="Tag suchen oder neu anlegen"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addTag(suggestions[0] ?? input);
        }}
      />
      {(suggestions.length > 0 || canCreate) && (
        <div className="tag-picker-options">
          {suggestions.map((tag) => (
            <button key={tag} onClick={() => addTag(tag)}>
              {tag}
            </button>
          ))}
          {canCreate && <button onClick={() => addTag(input)}>+ "{input.trim()}" anlegen</button>}
        </div>
      )}
    </div>
  );
}

function MonthCalendarView({
  months,
  showWeekends,
  bookings,
  externalEventsByDate,
  dailyCapacities,
  defaultCapacity,
  onOpenDay
}: {
  months: string[];
  showWeekends: boolean;
  bookings: Booking[];
  externalEventsByDate: Map<string, GoogleCalendarEvent[]>;
  dailyCapacities: Record<string, DailyCapacity>;
  defaultCapacity: DailyCapacity;
  onOpenDay: (date: string) => void;
}) {
  const bookingsByDate = useMemo(() => {
    const byDate = new Map<string, Booking[]>();
    for (const booking of bookings) byDate.set(booking.date, [...(byDate.get(booking.date) ?? []), booking]);
    return byDate;
  }, [bookings]);
  const weekdayLabels = showWeekends ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mo", "Di", "Mi", "Do", "Fr"];

  function leadingCells(firstVisibleDay: string) {
    const day = new Date(`${firstVisibleDay}T12:00:00`).getDay();
    const mondayBased = (day + 6) % 7;
    return showWeekends ? mondayBased : Math.min(mondayBased, 4);
  }

  return (
    <div className="month-strip">
      {months.map((monthStart) => {
        const monthDays = createMonthDays(monthStart, showWeekends);
        const blanks = monthDays.length > 0 ? leadingCells(monthDays[0]) : 0;
        return (
          <section
            className={`month-panel ${monthStart === startOfMonth(today) ? "current-month-panel" : ""}`}
            data-calendar-month={monthStart}
            key={monthStart}
          >
            <header>{formatMonthTitle(monthStart)}</header>
            <div className="month-weekdays" style={{ gridTemplateColumns: `repeat(${weekdayLabels.length}, minmax(92px, 1fr))` }}>
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="month-grid" style={{ gridTemplateColumns: `repeat(${weekdayLabels.length}, minmax(92px, 1fr))` }}>
              {Array.from({ length: blanks }, (_, index) => (
                <div className="month-empty-cell" key={`blank-${index}`} />
              ))}
              {monthDays.map((date) => {
                const capacity = dailyCapacities[date] ?? defaultCapacity;
                const capcalMinutes = (bookingsByDate.get(date) ?? []).reduce((sum, booking) => sum + booking.durationMinutes, 0);
                const externalEvents = externalEventsByDate.get(date) ?? [];
                const externalMinutes = externalBookedMinutes(externalEvents, capacity);
                const bookedMinutes = capcalMinutes + externalMinutes;
                const bookingCount = (bookingsByDate.get(date) ?? []).length + externalEvents.length;
                const bookedPercent = capacity.dayCapacityMinutes > 0 ? (bookedMinutes / capacity.dayCapacityMinutes) * 100 : 0;
                const fillPercent = Math.min(100, bookedPercent);
                const level = capacityLevelFor(bookedMinutes, capacity);
                const isOverbooked = bookedMinutes > capacity.dayCapacityMinutes;
                return (
                  <button
                    className={`month-day-tile ${date === today ? "today-month-day" : ""} ${isWeekend(date) ? "weekend" : ""} ${level} ${isOverbooked ? "overbooked" : ""}`}
                    key={date}
                    style={{ "--month-fill": `${fillPercent}%` } as React.CSSProperties}
                    onClick={() => onOpenDay(date)}
                    title={`${formatDate(date)}: ${minutesToLabel(bookedMinutes)} gebucht von ${minutesToLabel(capacity.dayCapacityMinutes)}`}
                  >
                    <span className="month-day-head">
                      <strong>{formatMonthTileDay(date)}</strong>
                      <span className="month-day-load">
                        <em>{minutesToLabel(bookedMinutes)}</em>
                        <small>{Math.round(bookedPercent)}%</small>
                        {bookingCount > 0 && (
                          <span className="month-booking-markers" aria-label={`${bookingCount} Buchungen`}>
                            {Array.from({ length: Math.min(bookingCount, 10) }, (_, index) => (
                              <i key={index} />
                            ))}
                            {bookingCount > 10 && <b>+</b>}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayColumn({
  date,
  bookings,
  googleEvents,
  capacity,
  calendarStartMinutes,
  calendarEndMinutes,
  timeOptions,
  taskById,
  onDrop,
  onBookingDrag,
  onBookingDragEnd,
  isDragging,
  onBookingChange,
  onBookingDelete,
  onOpenTask,
  onCapacityChange,
  onAddLooseBooking,
  dayTemplates,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate
}: {
  date: string;
  bookings: Booking[];
  googleEvents: GoogleCalendarEvent[];
  capacity: DailyCapacity;
  calendarStartMinutes: number;
  calendarEndMinutes: number;
  timeOptions: string[];
  taskById: Map<string, Task>;
  onDrop: (date: string, startTime?: string) => void;
  onBookingDrag: (bookingId: string) => void;
  onBookingDragEnd: () => void;
  isDragging: boolean;
  onBookingChange: (bookingId: string, patch: Partial<Booking>) => void;
  onBookingDelete: (bookingId: string) => void;
  onOpenTask: (taskId: string) => void;
  onCapacityChange: (patch: Partial<DailyCapacity>) => void;
  onAddLooseBooking: (date: string) => void;
  dayTemplates: DayTemplate[];
  onSaveTemplate: (date: string, name: string) => { saved: boolean; count: number };
  onApplyTemplate: (templateId: string, date: string) => number;
  onDeleteTemplate: (templateId: string) => void;
}) {
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editingGoogleEventId, setEditingGoogleEventId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ area: "allocation" | "time"; startTime?: string } | null>(null);
  const [resizingBooking, setResizingBooking] = useState<{ bookingId: string; startMinutes: number } | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [templateMode, setTemplateMode] = useState<"actions" | "save" | "apply">("actions");
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRef = useRef<HTMLElement | null>(null);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);
  const allocations = bookings.filter((booking) => !booking.startTime);
  const scheduled = bookings.filter((booking) => booking.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  const googleBlockingMinutes = externalBookedMinutes(googleEvents, capacity);
  const googleAllocations = googleEvents.filter((event) => event.allDay);
  const googleScheduled = googleEvents
    .filter((event) => !event.allDay)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const scheduledLayoutEntries = layoutTimedEntries([
    ...scheduled.map((booking): TimedCalendarEntry => ({
      kind: "booking",
      id: booking.id,
      startMinutes: timeToMinutes(booking.startTime!),
      endMinutes: timeToMinutes(booking.startTime!) + booking.durationMinutes,
      booking
    })),
    ...googleScheduled.map((event): TimedCalendarEntry => {
      const startMinutes = timeToMinutes(timeFromDateTime(event.startAt));
      return {
        kind: "external",
        id: event.id,
        startMinutes,
        endMinutes: startMinutes + minutesBetween(event.startAt, event.endAt),
        event
      };
    })
  ]);
  const bookedMinutes = bookings.reduce((sum, booking) => sum + booking.durationMinutes, 0) + googleBlockingMinutes;
  const fillPercent = Math.min(100, (bookedMinutes / capacity.dayCapacityMinutes) * 100);
  const planningPercent = Math.min(100, (capacity.planningCapacityMinutes / capacity.dayCapacityMinutes) * 100);
  const capacityLevel = capacityLevelFor(bookedMinutes, capacity);
  const isOverflowingDay = bookedMinutes > capacity.dayCapacityMinutes;
  const timelineHeight = (calendarEndMinutes - calendarStartMinutes) * minuteHeight;
  const firstHour = Math.ceil(calendarStartMinutes / 60);
  const lastHour = Math.floor(calendarEndMinutes / 60);
  const hours = Array.from({ length: Math.max(0, lastHour - firstHour + 1) }, (_, index) => firstHour + index);
  const getTimelineDropTime = (event: React.DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = calendarStartMinutes + y / minuteHeight;
    const snappedMinutes = Math.max(
      calendarStartMinutes,
      Math.min(calendarEndMinutes, Math.round(rawMinutes / 15) * 15)
    );
    return minutesToTime(snappedMinutes);
  };

  useEffect(() => {
    if (!resizingBooking) return;
    const activeResize = resizingBooking;

    function handlePointerMove(event: PointerEvent) {
      const timeline = timelineRef.current;
      if (!timeline) return;
      const rect = timeline.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const rawEndMinutes = calendarStartMinutes + y / minuteHeight;
      const snappedEndMinutes = Math.round(rawEndMinutes / 15) * 15;
      const durationMinutes = Math.max(30, Math.min(240, snappedEndMinutes - activeResize.startMinutes));
      onBookingChange(activeResize.bookingId, { durationMinutes });
    }

    function handlePointerUp() {
      setResizingBooking(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [calendarStartMinutes, onBookingChange, resizingBooking]);

  useEffect(() => {
    if (!editingBookingId && !editingGoogleEventId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const currentDay = dayColumnRef.current;
      if (!currentDay?.contains(target)) {
        setEditingBookingId(null);
        setEditingGoogleEventId(null);
        return;
      }
      const clickedEditor = (target as Element).closest(".booking-editor, .google-event-editor");
      const clickedOpenBooking = editingBookingId ? (target as Element).closest(`[data-booking-id="${editingBookingId}"]`) : null;
      const clickedOpenGoogleEvent = editingGoogleEventId ? (target as Element).closest(`[data-gcal-event-id="${CSS.escape(editingGoogleEventId)}"]`) : null;
      if (!clickedEditor && !clickedOpenBooking && !clickedOpenGoogleEvent) {
        setEditingBookingId(null);
        setEditingGoogleEventId(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [editingBookingId, editingGoogleEventId]);

  useEffect(() => {
    if (!templateMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !templateMenuRef.current?.contains(target)) {
        setTemplateMenuOpen(false);
        setTemplateMode("actions");
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [templateMenuOpen]);

  function defaultTemplateName() {
    return `Vorlage ${formatDate(date)}`;
  }

  function handleSaveTemplate() {
    const result = onSaveTemplate(date, templateName || defaultTemplateName());
    setTemplateMessage(result.saved ? `${result.count} Reservierungen gespeichert.` : "Keine freien Buchungen vorhanden.");
    if (result.saved) {
      setTemplateName("");
      setTemplateMode("actions");
    }
  }

  function handleApplyTemplate(templateId: string) {
    const count = onApplyTemplate(templateId, date);
    setTemplateMessage(count > 0 ? `${count} Reservierungen eingefügt.` : "Vorlage ist leer.");
    setTemplateMode("actions");
  }

  return (
    <section
      className={`day-column ${date === today ? "today-column" : ""} ${isMonday(date) ? "week-start" : ""}`}
      data-calendar-date={date}
      ref={dayColumnRef}
    >
      <header className={`${date === today ? "today" : ""} ${isWeekend(date) ? "weekend" : ""}`}>
        <span>{formatDate(date)}</span>
        <button
          className="icon-button ghost day-add-booking-button"
          title="Neue Buchung als Reservierung anlegen"
          onClick={() => onAddLooseBooking(date)}
        >
          <CalendarPlus size={14} />
        </button>
        <div className="day-template-menu" ref={templateMenuRef}>
          <button
            className="icon-button ghost day-template-button"
            title="Tagesvorlagen"
            onClick={(event) => {
              event.stopPropagation();
              setTemplateMenuOpen((open) => !open);
              setTemplateMode("actions");
              setTemplateMessage("");
            }}
          >
            <LayoutTemplate size={14} />
          </button>
          {templateMenuOpen && (
            <div className="day-template-popover" onClick={(event) => event.stopPropagation()}>
              {templateMode === "actions" && (
                <>
                  <button className="menu-row" onClick={() => setTemplateMode("save")}>
                    <Save size={14} />
                    Speichern
                  </button>
                  <button className="menu-row" onClick={() => setTemplateMode("apply")}>
                    <Combine size={14} />
                    Anwenden
                  </button>
                </>
              )}
              {templateMode === "save" && (
                <div className="day-template-form">
                  <input
                    autoFocus
                    placeholder={defaultTemplateName()}
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSaveTemplate();
                    }}
                  />
                  <button className="primary" onClick={handleSaveTemplate}>
                    Speichern
                  </button>
                  <button className="soft-button" onClick={() => setTemplateMode("actions")}>
                    Zurück
                  </button>
                </div>
              )}
              {templateMode === "apply" && (
                <div className="day-template-list">
                  {dayTemplates.length === 0 ? (
                    <p>Noch keine Vorlagen.</p>
                  ) : (
                    dayTemplates.map((template) => (
                      <div className="day-template-row" key={template.id}>
                        <button onClick={() => handleApplyTemplate(template.id)}>
                          <span className="day-template-name">
                            {template.name} <span>({template.slots.length})</span>
                          </span>
                        </button>
                        <button className="icon-button ghost danger-icon" title="Vorlage löschen" onClick={() => onDeleteTemplate(template.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              {templateMessage && <div className="day-template-message">{templateMessage}</div>}
            </div>
          )}
        </div>
      </header>
      <div className="capacity-strip">
        <div className="capacity-label">
          <span>{minutesToLabel(bookedMinutes)} gebucht</span>
          <strong>{minutesToLabel(capacity.dayCapacityMinutes)}</strong>
        </div>
        <div className={`capacity-bar ${capacityLevel} ${isOverflowingDay ? "overflowing" : ""}`} title={`Planungskapazität: ${minutesToLabel(capacity.planningCapacityMinutes)}`}>
          <div className="capacity-fill" style={{ width: `${fillPercent}%` }} />
          {isOverflowingDay && <div className={`capacity-overflow ${capacityLevel}`} />}
          <div className="planning-marker" style={{ left: `${planningPercent}%` }} />
        </div>
        <div className="capacity-controls">
          <label>
            Tag
            <select
              value={capacity.dayCapacityMinutes}
              onChange={(event) => onCapacityChange({ dayCapacityMinutes: Number(event.target.value) })}
            >
              {dayCapacityOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToLabel(minutes)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plan
            <select
              value={capacity.planningCapacityMinutes}
              onChange={(event) => onCapacityChange({ planningCapacityMinutes: Number(event.target.value) })}
            >
              {planningCapacityOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToLabel(minutes)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div
        className="allocation-zone"
        onDragOver={(event) => {
          event.preventDefault();
          setDropPreview({ area: "allocation" });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPreview(null);
        }}
        onDrop={() => {
          setDropPreview(null);
          onDrop(date);
        }}
      >
        {dropPreview?.area === "allocation" && <div className="allocation-drop-preview">Hier als Allokation einbuchen</div>}
        {allocations.map((booking) => (
          <div className="booking-shell" key={booking.id}>
            <BookingCard
              booking={booking}
              task={booking.taskId ? taskById.get(booking.taskId) : undefined}
              isEditing={editingBookingId === booking.id}
              onDrag={() => onBookingDrag(booking.id)}
              onDragEnd={onBookingDragEnd}
              onOpen={() => setEditingBookingId(booking.id)}
            />
            {editingBookingId === booking.id && (
              <BookingEditor
                booking={booking}
                task={booking.taskId ? taskById.get(booking.taskId) : undefined}
                timeOptions={timeOptions}
                onChange={onBookingChange}
                onOpenTask={() => {
                  if (booking.taskId) onOpenTask(booking.taskId);
                }}
                onDelete={(bookingId) => {
                  onBookingDelete(bookingId);
                  setEditingBookingId(null);
                }}
                onClose={() => setEditingBookingId(null)}
              />
            )}
          </div>
        ))}
        {googleAllocations.map((event) => (
          <div className="booking-shell" key={event.id}>
            <GoogleEventCard event={event} onOpen={() => setEditingGoogleEventId(event.id)} />
            {editingGoogleEventId === event.id && <GoogleEventEditor event={event} onClose={() => setEditingGoogleEventId(null)} />}
          </div>
        ))}
      </div>
      <div className="time-section">
        <div className="time-section-label">Termine</div>
        <div className="time-grid">
          <div className="timeline-labels" style={{ height: timelineHeight }}>
            {hours.map((hour) => (
              <div
                className="timeline-hour-label"
                key={hour}
                style={{ top: (hour * 60 - calendarStartMinutes) * minuteHeight }}
              >
                {hour}:00
              </div>
            ))}
          </div>
          <div
            className={`timeline ${isDragging ? "dragging-active" : ""}`}
            ref={timelineRef}
            style={{ height: timelineHeight }}
            onDragOver={(event) => {
              event.preventDefault();
              setDropPreview({ area: "time", startTime: getTimelineDropTime(event) });
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPreview(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const startTime = getTimelineDropTime(event);
              setDropPreview(null);
              onDrop(date, startTime);
            }}
          >
            {hours.map((hour) => (
              <div
                className="timeline-hour-line"
                key={hour}
                style={{ top: (hour * 60 - calendarStartMinutes) * minuteHeight }}
              />
            ))}
            {scheduledLayoutEntries.map((entry) => {
              const top = Math.max(0, (entry.startMinutes - calendarStartMinutes) * minuteHeight);
              const width = `calc((100% - 12px - ${(entry.columnCount - 1) * 4}px) / ${entry.columnCount})`;
              const left = `calc(6px + (${width} + 4px) * ${entry.columnIndex})`;
              if (entry.kind === "external") {
                const height = Math.max(28, (entry.endMinutes - entry.startMinutes) * minuteHeight);
                return (
                  <div
                    className="scheduled-booking google-scheduled-event"
                    key={`external-${entry.id}`}
                    style={{ top, height, left, right: "auto", width }}
                  >
                    <GoogleEventCard event={entry.event} compact onOpen={() => setEditingGoogleEventId(entry.event.id)} />
                    {editingGoogleEventId === entry.event.id && <GoogleEventEditor event={entry.event} onClose={() => setEditingGoogleEventId(null)} />}
                  </div>
                );
              }
              const booking = entry.booking;
              const startMinutes = entry.startMinutes;
              const height = Math.max(36, (entry.endMinutes - entry.startMinutes) * minuteHeight);
              return (
                <div className="scheduled-booking" key={`booking-${booking.id}`} style={{ top, height, left, right: "auto", width }}>
                  <BookingCard
                    booking={booking}
                    task={booking.taskId ? taskById.get(booking.taskId) : undefined}
                    isEditing={editingBookingId === booking.id}
                    onDrag={() => onBookingDrag(booking.id)}
                    onDragEnd={onBookingDragEnd}
                    onOpen={() => setEditingBookingId(booking.id)}
                    onResizeStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setResizingBooking({ bookingId: booking.id, startMinutes });
                    }}
                  />
                  {editingBookingId === booking.id && (
                    <BookingEditor
                      booking={booking}
                      task={booking.taskId ? taskById.get(booking.taskId) : undefined}
                      timeOptions={timeOptions}
                      onChange={onBookingChange}
                      onOpenTask={() => {
                        if (booking.taskId) onOpenTask(booking.taskId);
                      }}
                      onDelete={(bookingId) => {
                        onBookingDelete(bookingId);
                        setEditingBookingId(null);
                      }}
                      onClose={() => setEditingBookingId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {dropPreview?.area === "time" && dropPreview.startTime && (
            <div
              className="timeline-drop-preview"
              style={{ top: (timeToMinutes(dropPreview.startTime) - calendarStartMinutes) * minuteHeight }}
            >
              <span>{dropPreview.startTime}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BookingCard({
  booking,
  task,
  isEditing,
  onDrag,
  onDragEnd,
  onOpen,
  onResizeStart
}: {
  booking: Booking;
  task?: Task;
  isEditing: boolean;
  onDrag: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onResizeStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const title = task?.title ?? booking.label ?? "Buchung";
  const wasDraggedRef = useRef(false);

  function openFromPointer(event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) {
    if ("button" in event && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".booking-resize-handle")) return;
    if (wasDraggedRef.current) return;
    event.stopPropagation();
    onOpen();
  }

  return (
    <article
      className={`booking-card status-card ${task ? statusMeta[task.status].className : "loose-booking"} ${task?.archived ? "archived-booking" : ""} ${isEditing ? "editing" : ""}`}
      data-booking-id={booking.id}
      draggable
      onDragStart={(event) => {
        wasDraggedRef.current = true;
        event.currentTarget.classList.add("dragging-source");
        onDrag();
      }}
      onDragEnd={(event) => {
        event.currentTarget.classList.remove("dragging-source");
        onDragEnd();
        window.setTimeout(() => {
          wasDraggedRef.current = false;
        }, 0);
      }}
      onClick={openFromPointer}
      onPointerUp={openFromPointer}
      title="Buchung bearbeiten"
    >
      <div className="booking-head">
        {task ? <StatusIcon status={task.status} /> : <CalendarDays size={14} />}
        <strong>{title}</strong>
        {task?.archived && <Archive size={13} />}
      </div>
      {onResizeStart && <div className="booking-resize-handle" title="Dauer ändern" onPointerDown={onResizeStart} />}
    </article>
  );
}

function GoogleEventCard({ event, compact = false, onOpen }: { event: GoogleCalendarEvent; compact?: boolean; onOpen: () => void }) {
  const timeLabel = event.allDay
    ? "Ganztägig"
    : `${timeFromDateTime(event.startAt)}-${timeFromDateTime(event.endAt)}`;
  return (
    <article
      className={`booking-card google-event-card ${event.provider}-event-card ${event.blocksTime ? "google-event-busy" : "google-event-free"}`}
      title={`${event.calendarSummary} · ${timeLabel}`}
      data-gcal-event-id={event.id}
      onClick={onOpen}
      style={{ "--gcal-color": event.calendarColor ?? "#4285f4" } as React.CSSProperties}
    >
      <div className="booking-head">
        <CalendarDays size={14} />
        <strong>{event.summary}</strong>
      </div>
      {!compact && (
        <div className="google-event-meta">
          <span>{timeLabel}</span>
          <span>{event.calendarSummary}</span>
          {!event.blocksTime && <span>frei</span>}
        </div>
      )}
    </article>
  );
}

function GoogleEventEditor({ event, onClose }: { event: GoogleCalendarEvent; onClose: () => void }) {
  const description = plainTextFromHtml(event.description);
  const timeLabel = event.allDay
    ? "Ganztägig"
    : `${formatDate(dateFromDateTime(event.startAt))}, ${timeFromDateTime(event.startAt)}-${timeFromDateTime(event.endAt)}`;
  return (
    <aside className="google-event-editor" onClick={(event) => event.stopPropagation()}>
      <span className={`calendar-provider-mark ${event.provider}-provider-mark`} aria-hidden="true">
        {event.provider === "google" ? "G" : ""}
      </span>
      <div className="google-event-editor-actions">
        {event.htmlLink && (
          <a className="icon-button ghost" title="Original öffnen" href={event.htmlLink} target="_blank" rel="noreferrer">
            <SquareArrowOutUpRight size={13} />
          </a>
        )}
        <button className="icon-button ghost" title="Details schließen" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="google-event-editor-title">
        <span className="gcal-color" style={{ background: event.calendarColor ?? "#4285f4" }} />
        <strong>{event.summary}</strong>
      </div>
      <div className="google-event-editor-meta">
        <span>{timeLabel}</span>
        <span>{event.calendarSummary}</span>
        <span>{event.blocksTime ? "Gebucht" : "Frei"}</span>
      </div>
      <div className="google-event-editor-body">
        {event.location && <p>{event.location}</p>}
        {event.attendeeSummary && <p>{event.attendeeSummary}</p>}
        {event.organizer && <p>Organisiert von: {event.organizer}</p>}
        {event.creator && event.creator !== event.organizer && <p>Erstellt von: {event.creator}</p>}
        {description && <pre>{description}</pre>}
      </div>
    </aside>
  );
}

function BookingEditor({
  booking,
  task,
  timeOptions,
  onChange,
  onOpenTask,
  onDelete,
  onClose
}: {
  booking: Booking;
  task?: Task;
  timeOptions: string[];
  onChange: (bookingId: string, patch: Partial<Booking>) => void;
  onOpenTask: () => void;
  onDelete: (bookingId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="booking-editor" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button ghost booking-task-link" title="Zur Aufgabe scrollen" onClick={onOpenTask}>
        <ListTree size={14} />
      </button>
      <button className="icon-button ghost editor-close" title="Editor schließen" onClick={onClose}>
        <X size={14} />
      </button>
      <div className="booking-editor-summary">
        <div className="booking-editor-title">
          {task ? <StatusIcon status={task.status} /> : <CalendarDays size={15} />}
          <strong>{task?.title ?? booking.label ?? "Buchung"}</strong>
        </div>
        <div className="booking-editor-meta">
          {task?.archived && (
            <span className="task-archive-pill">
              <Archive size={11} />
              Archiv
            </span>
          )}
          {task?.dueDate && <span className={`task-deadline-pill ${deadlineTone(task.dueDate)}`}>{formatOptionalDate(task.dueDate)}</span>}
          {(task?.tags ?? []).map((tag) => (
            <span className="task-tag-chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="booking-controls">
        {!task && (
          <label>
            <span>Titel</span>
            <input
              aria-label="Buchungstitel"
              value={booking.label ?? ""}
              onChange={(event) => onChange(booking.id, { label: event.target.value })}
            />
          </label>
        )}
        <label>
          <span>
            <Clock3 size={13} />
            Zeit
          </span>
          <select
            aria-label="Terminzeit"
            value={booking.startTime ?? "allocation"}
            onChange={(event) => onChange(booking.id, { startTime: event.target.value === "allocation" ? undefined : event.target.value })}
          >
            <option value="allocation">Allokation</option>
            {timeOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            <Timer size={13} />
            Dauer
          </span>
          <select
            aria-label="Dauer"
            value={booking.durationMinutes}
            onChange={(event) => onChange(booking.id, { durationMinutes: Number(event.target.value) })}
          >
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToTimeLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button ghost" title="Buchung löschen" onClick={() => onDelete(booking.id)}>
          <Trash2 size={14} />
        </button>
        <label className="booking-description-field">
          <span>Beschreibung</span>
          <textarea
            aria-label="Buchungsbeschreibung"
            placeholder="Beschreibung"
            value={booking.description ?? ""}
            onChange={(event) => onChange(booking.id, { description: event.target.value })}
          />
        </label>
      </div>
    </aside>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={`status-icon ${meta.className}`} title={meta.label}>
      <Icon size={15} />
    </span>
  );
}

function Metric({ icon: Icon, label, value, className }: { icon: typeof Circle; label: string; value: number; className: string }) {
  return (
    <div className={`metric ${className}`}>
      <span className={`status-icon ${className}`}>
        <Icon size={16} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
