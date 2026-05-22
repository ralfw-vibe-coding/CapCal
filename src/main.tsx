import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertOctagon,
  ArchiveX,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Download,
  GripVertical,
  ListTree,
  Loader,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  Timer,
  Upload,
  X
} from "lucide-react";
import "./styles.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TaskStatus = "Backlog" | "Ready" | "Started" | "Blocked" | "Done" | "Aborted";
type TreeViewMode = "list" | "board";
type AuthUser = { id: number; email: string };

type Task = {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  dueDate?: string;
  estimateMinutes?: number;
  status: TaskStatus;
  done: boolean;
  treeOrder: number;
};

type Booking = {
  id: string;
  taskId: string;
  date: string;
  startTime?: string;
  durationMinutes: number;
};

type DailyCapacity = {
  dayCapacityMinutes: number;
  planningCapacityMinutes: number;
};

type TreeFilterSettings = {
  query: string;
  statuses: TaskStatus[];
  tags: string[];
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
  taskView: TreeViewMode;
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
};
const dayCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const planningCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const visibleDayOptions = [7, 14, 21, 31];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function addDays(date: string, count: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + count);
  return next.toISOString().slice(0, 10);
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

function sortedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.treeOrder - b.treeOrder);
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
    tags: normalizeTags(filters?.tags)
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

function normalizeState(rawState: AppState): AppState {
  return {
    ...rawState,
    settings: {
      ...defaultSettings,
      ...(rawState.settings ?? {}),
      taskView: rawState.settings?.taskView === "board" ? "board" : "list",
      treeFilters: normalizeTreeFilters(rawState.settings?.treeFilters),
      boardHiddenStatuses: normalizeTaskStatuses(rawState.settings?.boardHiddenStatuses),
      panelsCollapsed: {
        ...defaultSettings.panelsCollapsed,
        ...(rawState.settings?.panelsCollapsed ?? {})
      }
    },
    dailyCapacities: rawState.dailyCapacities ?? {},
    tasks: (rawState.tasks ?? []).map((task) => ({ ...task, tags: normalizeTags(task.tags) })),
    prioTaskIds: rawState.prioTaskIds ?? [],
    prioDurations: rawState.prioDurations ?? {},
    bookings: rawState.bookings ?? []
  };
}

function createTimeOptions(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const count = Math.max(1, Math.floor((endMinutes - startMinutes) / 15) + 1);
  return Array.from({ length: count }, (_, index) => minutesToTime(startMinutes + index * 15));
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
  const [quickAdd, setQuickAdd] = useState({ prio: "", cal: "" });
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [calendarStartDate, setCalendarStartDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(() => new Set());
  const [changedTaskId, setChangedTaskId] = useState<string | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const dirtyRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const stateVersionRef = useRef(0);
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
    if (!state) return;
    stateRef.current = state;
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

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } finally {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      stateRef.current = null;
      dirtyRef.current = false;
      hasLoadedRef.current = false;
      setState(null);
      setAuthUser(null);
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
    for (const booking of state?.bookings ?? []) counts.set(booking.taskId, (counts.get(booking.taskId) ?? 0) + 1);
    return counts;
  }, [state?.bookings]);
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
    return sortedTasks(state?.tasks ?? []).filter((task) => {
      const matchesQuery = !query || task.title.toLowerCase().includes(query);
      const matchesStatus = treeFilters.statuses.length === 0 || treeFilters.statuses.includes(task.status);
      const taskTags = task.tags ?? [];
      const matchesTags = treeFilters.tags.length === 0 || treeFilters.tags.every((tag) => taskTags.includes(tag));
      return matchesQuery && matchesStatus && matchesTags;
    });
  }, [state?.tasks, treeFilters.query, treeFilters.statuses, treeFilters.tags]);
  const days = useMemo(
    () => {
      const nextDays: string[] = [];
      let cursor = calendarStartDate;
      while (nextDays.length < settings.visibleDayCount) {
        if (settings.showWeekends || !isWeekend(cursor)) nextDays.push(cursor);
        cursor = addDays(cursor, 1);
      }
      return nextDays;
    },
    [calendarStartDate, settings.showWeekends, settings.visibleDayCount]
  );
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
    if (!settingsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !settingsMenuRef.current?.contains(target)) setSettingsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

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
                Code senden
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

  function upsertTask(title: string, target?: "prio" | "cal", date = today, initialStatus?: TaskStatus): Task | null {
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
      status,
      done: status === "Done" || status === "Aborted",
      treeOrder: 0
    };

    updateState((draft) => {
      const existingTasks = sortedTasks(draft.tasks);
      const tasks = [
        { ...task, treeOrder: 0 },
        ...existingTasks.map((existingTask, index) => ({ ...existingTask, treeOrder: index + 1 }))
      ];
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

  function updateTask(taskId: string, patch: Partial<Task>) {
    setChangedTaskId(taskId);
    updateState((draft) => ({
      ...draft,
      tasks: draft.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    }));
  }

  function setTaskDone(taskId: string, done: boolean) {
    updateTask(taskId, { done, status: done ? "Done" : "Ready" });
  }

  function moveTaskBeforeInTree(sourceTaskId: string, targetTaskId: string) {
    updateState((draft) => {
      const tasks = sortedTasks(draft.tasks);
      const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
      const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
      return { ...draft, tasks: moveItemToDropTarget(tasks, sourceIndex, targetIndex).map((task, treeOrder) => ({ ...task, treeOrder })) };
    });
  }

  function addToPrio(taskId: string) {
    updateState((draft) => {
      if (draft.prioTaskIds.includes(taskId)) return draft;
      const task = draft.tasks.find((candidate) => candidate.id === taskId);
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
    updateState((draft) => ({
      ...draft,
      tasks: sortedTasks(draft.tasks)
        .filter((task) => task.id !== taskId)
        .map((task, treeOrder) => ({ ...task, treeOrder })),
      prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
      prioDurations: Object.fromEntries(Object.entries(draft.prioDurations ?? {}).filter(([id]) => id !== taskId)),
      bookings: draft.bookings.filter((booking) => booking.taskId !== taskId)
    }));
  }

  function bookTask(taskId: string, date: string, startTime?: string, source: "tree" | "prio" = "tree") {
    updateState((draft) => {
      const task = draft.tasks.find((candidate) => candidate.id === taskId);
      const durationMinutes =
        source === "prio"
          ? (draft.prioDurations?.[taskId] ?? durationForPlanning(task?.estimateMinutes, settings.defaultPrioDurationMinutes))
          : durationForPlanning(task?.estimateMinutes, settings.defaultPrioDurationMinutes);
      const { [taskId]: _removed, ...prioDurations } = draft.prioDurations ?? {};
      return {
        ...draft,
        prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
        prioDurations,
        tasks: draft.tasks.map((candidate) =>
          candidate.id === taskId && candidate.status !== "Done" ? { ...candidate, status: "Started" } : candidate
        ),
        bookings: [...draft.bookings, { id: uid("booking"), taskId, date, startTime, durationMinutes }]
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
      const tasks = sortedTasks(
        draft.tasks.map((task) =>
          task.id === taskId ? { ...task, status, done: status === "Done" || status === "Aborted" } : task
        )
      );
      if (!targetTaskId) return { ...draft, tasks: tasks.map((task, treeOrder) => ({ ...task, treeOrder })) };
      const sourceIndex = tasks.findIndex((task) => task.id === taskId);
      const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
      return { ...draft, tasks: moveItemToDropTarget(tasks, sourceIndex, targetIndex).map((task, treeOrder) => ({ ...task, treeOrder })) };
    });
  }

  function scrollToTask(taskId: string) {
    updateSettings({ panelsCollapsed: { ...settings.panelsCollapsed, tree: false } });
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
        variant={options?.boardStatus ? "board" : "list"}
        expanded={expandedTaskIds.has(task.id)}
        showUnsavedDot={changedTaskId === task.id && saveState !== "saved" && saveState !== "idle"}
        onToggleExpanded={() => toggleTaskDetails(task.id)}
        onDragStart={() => setDragPayload({ kind: "tree-task", taskId: task.id })}
        onDragEnd={() => setDragPayload(null)}
        onDropOnTask={() => {
          if (dragPayload?.kind === "tree-task" || dragPayload?.kind === "prio-task") {
            if (options?.boardStatus) moveTaskToBoardStatus(dragPayload.taskId, options.boardStatus, task.id);
            else if (dragPayload.kind === "tree-task") moveTaskBeforeInTree(dragPayload.taskId, task.id);
          }
          setDragPayload(null);
        }}
        onDone={(done) => setTaskDone(task.id, done)}
        onTitle={(title) => updateTask(task.id, { title })}
        onStatus={(status) => updateTask(task.id, { status, done: status === "Done" || status === "Aborted" })}
        onEstimate={(estimateMinutes) => updateTask(task.id, { estimateMinutes })}
        onDueDate={(dueDate) => updateTask(task.id, { dueDate: dueDate || undefined })}
        onDescription={(description) => updateTask(task.id, { description })}
        onTags={(tags) => updateTask(task.id, { tags: normalizeTags(tags) })}
        onDelete={() => deleteTask(task.id)}
      />
    );
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
              {(treeFilters.query || treeFilters.statuses.length > 0 || treeFilters.tags.length > 0) && (
                <button
                  className="filter-reset-chip"
                  title="Filter zurücksetzen"
                  onClick={() => updateSettings({ treeFilters: { query: "", statuses: [], tags: [] } })}
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
            <div className="list">{filteredTreeTasks.map((task) => renderTreeTaskCard(task))}</div>
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
                  const columnTasks = filteredTreeTasks.filter((task) => task.status === status);
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
                        {columnTasks.map((task) => renderTreeTaskCard(task, { boardStatus: status }))}
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
              if (!task) return null;
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
        >
          <div className="cal-tools">
            <div className="quick-add">
              <input
                placeholder="Direkt heute in Cal anlegen"
                value={quickAdd.cal}
                onChange={(event) => setQuickAdd({ ...quickAdd, cal: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    upsertTask(quickAdd.cal, "cal", today);
                    setQuickAdd({ ...quickAdd, cal: "" });
                  }
                }}
              />
              <button
                className="icon-button"
                title="In Cal anlegen"
                onClick={() => {
                  upsertTask(quickAdd.cal, "cal", today);
                  setQuickAdd({ ...quickAdd, cal: "" });
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <select
              className="day-count-select"
              aria-label="Sichtbare Tage"
              value={settings.visibleDayCount}
              onChange={(event) => updateSettings({ visibleDayCount: Number(event.target.value) })}
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
            <button className="soft-button icon-button" title="Zurück blättern" onClick={() => setCalendarStartDate(addDays(calendarStartDate, -settings.visibleDayCount))}>
              <ChevronLeft size={15} />
            </button>
            <button className="soft-button today-button" onClick={() => setCalendarStartDate(today)}>
              Heute
            </button>
            <button className="soft-button icon-button" title="Vorwärts blättern" onClick={() => setCalendarStartDate(addDays(calendarStartDate, settings.visibleDayCount))}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="calendar-scroll">
            <div className="calendar-grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))` }}>
              {days.map((date) => (
                <DayColumn
                  key={date}
                  date={date}
                  bookings={state.bookings.filter((booking) => booking.date === date)}
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
                />
              ))}
            </div>
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
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.showWeekends}
            onChange={(event) => onSettingsChange({ showWeekends: event.target.checked })}
          />
          Wochenenden anzeigen
        </label>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  allTags,
  bookingCount,
  variant = "list",
  expanded,
  showUnsavedDot,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  onDropOnTask,
  onDone,
  onTitle,
  onStatus,
  onEstimate,
  onDueDate,
  onDescription,
  onTags,
  onDelete
}: {
  task: Task;
  allTags: string[];
  bookingCount: number;
  variant?: "list" | "board";
  expanded: boolean;
  showUnsavedDot: boolean;
  onToggleExpanded: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnTask: () => void;
  onDone: (done: boolean) => void;
  onTitle: (title: string) => void;
  onStatus: (status: TaskStatus) => void;
  onEstimate: (estimate: number | undefined) => void;
  onDueDate: (date: string) => void;
  onDescription: (description: string) => void;
  onTags: (tags: string[]) => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`task-card task-card-${variant} status-card ${statusMeta[task.status].className}`}
      data-task-id={task.id}
      draggable
      onDragStart={(event) => {
        event.currentTarget.classList.add("dragging-source");
        onDragStart();
      }}
      onDragEnd={(event) => {
        event.currentTarget.classList.remove("dragging-source");
        onDragEnd();
      }}
      onDragOver={(event) => event.preventDefault()}
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
          <span>{estimateToLabel(task.estimateMinutes)}</span>
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
        <button className="icon-button ghost danger" title="Aufgabe löschen" onClick={onDelete}>
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

function DayColumn({
  date,
  bookings,
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
  onCapacityChange
}: {
  date: string;
  bookings: Booking[];
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
}) {
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ area: "allocation" | "time"; startTime?: string } | null>(null);
  const [resizingBooking, setResizingBooking] = useState<{ bookingId: string; startMinutes: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRef = useRef<HTMLElement | null>(null);
  const allocations = bookings.filter((booking) => !booking.startTime);
  const scheduled = bookings.filter((booking) => booking.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  const bookedMinutes = bookings.reduce((sum, booking) => sum + booking.durationMinutes, 0);
  const fillPercent = Math.min(100, (bookedMinutes / capacity.dayCapacityMinutes) * 100);
  const planningPercent = Math.min(100, (capacity.planningCapacityMinutes / capacity.dayCapacityMinutes) * 100);
  const redCapacityThreshold =
    capacity.planningCapacityMinutes + (capacity.dayCapacityMinutes - capacity.planningCapacityMinutes) * 0.8;
  const capacityLevel =
    bookedMinutes >= redCapacityThreshold
      ? "over-plan"
      : bookedMinutes >= capacity.planningCapacityMinutes * 0.8
        ? "near-plan"
        : "under-plan";
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
    if (!editingBookingId) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const currentDay = dayColumnRef.current;
      if (!currentDay?.contains(target)) {
        setEditingBookingId(null);
        return;
      }
      const clickedEditor = (target as Element).closest(".booking-editor");
      const clickedOpenBooking = (target as Element).closest(`[data-booking-id="${editingBookingId}"]`);
      if (!clickedEditor && !clickedOpenBooking) setEditingBookingId(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [editingBookingId]);

  return (
    <section className={`day-column ${isMonday(date) ? "week-start" : ""}`} ref={dayColumnRef}>
      <header className={`${date === today ? "today" : ""} ${isWeekend(date) ? "weekend" : ""}`}>{formatDate(date)}</header>
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
              task={taskById.get(booking.taskId)}
              isEditing={editingBookingId === booking.id}
              onDrag={() => onBookingDrag(booking.id)}
              onDragEnd={onBookingDragEnd}
              onOpen={() => setEditingBookingId(booking.id)}
            />
            {editingBookingId === booking.id && (
              <BookingEditor
                booking={booking}
                task={taskById.get(booking.taskId)}
                timeOptions={timeOptions}
                onChange={onBookingChange}
                onOpenTask={() => onOpenTask(booking.taskId)}
                onDelete={(bookingId) => {
                  onBookingDelete(bookingId);
                  setEditingBookingId(null);
                }}
                onClose={() => setEditingBookingId(null)}
              />
            )}
          </div>
        ))}
      </div>
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
          {scheduled.map((booking) => {
            const startMinutes = timeToMinutes(booking.startTime!);
            const top = Math.max(0, (startMinutes - calendarStartMinutes) * minuteHeight);
            const height = Math.max(36, booking.durationMinutes * minuteHeight);
            return (
              <div className="scheduled-booking" key={booking.id} style={{ top, height }}>
                <BookingCard
                  booking={booking}
                  task={taskById.get(booking.taskId)}
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
                    task={taskById.get(booking.taskId)}
                    timeOptions={timeOptions}
                    onChange={onBookingChange}
                    onOpenTask={() => onOpenTask(booking.taskId)}
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
  if (!task) return null;
  return (
    <article
      className={`booking-card status-card ${statusMeta[task.status].className} ${isEditing ? "editing" : ""}`}
      data-booking-id={booking.id}
      draggable
      onDragStart={(event) => {
        event.currentTarget.classList.add("dragging-source");
        onDrag();
      }}
      onDragEnd={(event) => {
        event.currentTarget.classList.remove("dragging-source");
        onDragEnd();
      }}
      onClick={onOpen}
      title="Buchung bearbeiten"
    >
      <div className="booking-head">
        <StatusIcon status={task.status} />
        <strong>{task.title}</strong>
      </div>
      {onResizeStart && <div className="booking-resize-handle" title="Dauer ändern" onPointerDown={onResizeStart} />}
    </article>
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
      {task && (
        <div className="booking-editor-summary">
          <div className="booking-editor-title">
            <StatusIcon status={task.status} />
            <strong>{task.title}</strong>
          </div>
          <div className="booking-editor-meta">
            {task.dueDate && <span className={`task-deadline-pill ${deadlineTone(task.dueDate)}`}>{formatOptionalDate(task.dueDate)}</span>}
            {(task.tags ?? []).map((tag) => (
              <span className="task-tag-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="booking-controls">
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
