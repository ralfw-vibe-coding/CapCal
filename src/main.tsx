import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertOctagon,
  ArchiveX,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  GripVertical,
  ListTree,
  Loader,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Timer,
  X
} from "lucide-react";
import "./styles.css";
import { useEffect, useMemo, useRef, useState } from "react";

type TaskStatus = "Backlog" | "Ready" | "Started" | "Blocked" | "Done" | "Aborted";

type Task = {
  id: string;
  title: string;
  dueDate?: string;
  estimateMinutes: number;
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

type AppSettings = {
  defaultTreeDurationMinutes: number;
  defaultPrioDurationMinutes: number;
  defaultDayCapacityMinutes: number;
  defaultPlanningCapacityMinutes: number;
  calendarStartTime: string;
  calendarEndTime: string;
  showWeekends: boolean;
  visibleDayCount: number;
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

function normalizeState(rawState: AppState): AppState {
  return {
    ...rawState,
    settings: {
      ...defaultSettings,
      ...(rawState.settings ?? {}),
      panelsCollapsed: {
        ...defaultSettings.panelsCollapsed,
        ...(rawState.settings?.panelsCollapsed ?? {})
      }
    },
    dailyCapacities: rawState.dailyCapacities ?? {},
    tasks: rawState.tasks ?? [],
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [newTask, setNewTask] = useState({ title: "", dueDate: "", estimateMinutes: 30 });
  const [quickAdd, setQuickAdd] = useState({ prio: "", cal: "" });
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [calendarStartDate, setCalendarStartDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeFilters, setTreeFilters] = useState<{ query: string; status: "All" | TaskStatus }>({ query: "", status: "All" });
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/state")
      .then((response) => response.json())
      .then((loadedState) => setState(normalizeState(loadedState)))
      .catch(() => {
        setState(normalizeState({ dailyCapacities: {}, tasks: [], prioTaskIds: [], bookings: [] }));
        setSaveState("error");
      });
  }, []);

  useEffect(() => {
    if (!state) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state)
      })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [state]);

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
  const filteredTreeTasks = useMemo(() => {
    const query = treeFilters.query.trim().toLowerCase();
    return sortedTasks(state?.tasks ?? []).filter((task) => {
      const matchesQuery = !query || task.title.toLowerCase().includes(query);
      const matchesStatus = treeFilters.status === "All" || task.status === treeFilters.status;
      return matchesQuery && matchesStatus;
    });
  }, [state?.tasks, treeFilters.query, treeFilters.status]);
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
    settings.panelsCollapsed.tree ? "64px" : settings.panelsCollapsed.cal ? "minmax(520px, 1.35fr)" : "minmax(360px, 0.95fr)",
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

  if (!state) {
    return (
      <main className="loading">
        <Loader className="spin" size={28} />
        CapCal wird geladen
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

  function upsertTask(title: string, target?: "prio" | "cal", date = today): Task | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const estimateMinutes = settings.defaultTreeDurationMinutes;
    const planningDurationMinutes = durationForPlanning(estimateMinutes, settings.defaultPrioDurationMinutes);
    const task: Task = {
      id: uid("task"),
      title: trimmed,
      dueDate: target === "cal" ? date : undefined,
      estimateMinutes,
      status: target === "cal" ? "Started" : "Ready",
      done: false,
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

  function updateTask(taskId: string, patch: Partial<Task>) {
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

  const startedCount = state.tasks.filter((task) => task.status === "Started").length;
  const blockedCount = state.tasks.filter((task) => task.status === "Blocked").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">
            <Sparkles size={19} />
            <span>CapCal</span>
          </div>
          <p>Tree, Prio und Cal für echte Kapazitätsplanung.</p>
        </div>
        <div className="topbar-metrics">
          <Metric icon={Loader} label="Started" value={startedCount} className="status-started" />
          <Metric icon={AlertOctagon} label="Blocked" value={blockedCount} className="status-blocked" />
          <div className={`save-pill save-${saveState}`}>
            {saveState === "saving" ? "Speichert" : saveState === "error" ? "Speicherfehler" : "Gespeichert"}
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
        </div>
      </header>

      <section className="workspace" style={{ gridTemplateColumns: workspaceColumns }}>
        <Panel
          title="Aufgaben"
          icon={ListTree}
          collapsed={settings.panelsCollapsed.tree}
          onToggle={() => togglePanel("tree")}
          className="tree-panel"
        >
          <div className="tree-filters">
            <div className="filter-control">
              <input
                aria-label="Aufgaben suchen"
                placeholder="Suchen"
                value={treeFilters.query}
                onChange={(event) => setTreeFilters((current) => ({ ...current, query: event.target.value }))}
              />
              {treeFilters.query && (
                <button
                  className="filter-clear"
                  title="Suche zurücksetzen"
                  onClick={() => setTreeFilters((current) => ({ ...current, query: "" }))}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="filter-control">
              <select
                aria-label="Status filtern"
                value={treeFilters.status}
                onChange={(event) => setTreeFilters((current) => ({ ...current, status: event.target.value as "All" | TaskStatus }))}
              >
                <option value="All">Alle Status</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            {(treeFilters.query || treeFilters.status !== "All") && (
              <button
                className="icon-button ghost tree-filter-reset"
                title="Filter zurücksetzen"
                onClick={() => setTreeFilters({ query: "", status: "All" })}
              >
                <X size={14} />
              </button>
            )}
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
            <select
              aria-label="Aufwand in Minuten"
              value={newTask.estimateMinutes}
              onChange={(event) => setNewTask({ ...newTask, estimateMinutes: Number(event.target.value) })}
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToTimeLabel(minutes)}
                </option>
              ))}
            </select>
            <button className="primary icon-button" title="Aufgabe anlegen" onClick={addTreeTask}>
              <Plus size={17} />
            </button>
          </div>

          <div className="list">
            {filteredTreeTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onDragStart={() => setDragPayload({ kind: "tree-task", taskId: task.id })}
                onDropOnTask={() => {
                  if (dragPayload?.kind === "tree-task") moveTaskBeforeInTree(dragPayload.taskId, task.id);
                  setDragPayload(null);
                }}
                onDone={(done) => setTaskDone(task.id, done)}
                onStatus={(status) => updateTask(task.id, { status, done: status === "Done" || status === "Aborted" })}
                onEstimate={(estimateMinutes) => updateTask(task.id, { estimateMinutes })}
                onDueDate={(dueDate) => updateTask(task.id, { dueDate: dueDate || undefined })}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
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
                  onDragStart={() => setDragPayload({ kind: "prio-task", taskId: task.id })}
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
                    <span>{formatOptionalDate(task.dueDate)}</span>
                  </div>
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
                  isDragging={dragPayload !== null}
                  onBookingChange={updateBooking}
                  onBookingDelete={deleteBooking}
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
  onDrop
}: {
  title: string;
  icon: typeof Circle;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className: string;
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
      </header>
      {!collapsed && children}
    </section>
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
          <select
            value={settings.defaultTreeDurationMinutes}
            onChange={(event) => onSettingsChange({ defaultTreeDurationMinutes: Number(event.target.value) })}
          >
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutesToTimeLabel(minutes)}
              </option>
            ))}
          </select>
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
  onDragStart,
  onDropOnTask,
  onDone,
  onStatus,
  onEstimate,
  onDueDate,
  onDelete
}: {
  task: Task;
  onDragStart: () => void;
  onDropOnTask: () => void;
  onDone: (done: boolean) => void;
  onStatus: (status: TaskStatus) => void;
  onEstimate: (estimate: number) => void;
  onDueDate: (date: string) => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`task-card status-card ${statusMeta[task.status].className}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDropOnTask();
      }}
    >
      <GripVertical className="drag-handle" size={15} />
      <div className="task-main">
        <button className={`check-button ${task.done ? "checked" : ""}`} title="Erledigt" onClick={() => onDone(!task.done)}>
          {task.done && <Check size={14} />}
        </button>
        <div>
          <div className="task-title">
            <StatusIcon status={task.status} />
            <strong>{task.title}</strong>
          </div>
          <div className="task-meta">
            <input type="date" value={task.dueDate ?? ""} onChange={(event) => onDueDate(event.target.value)} />
            <select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)}>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select
              aria-label="Aufwand"
              value={task.estimateMinutes}
              onChange={(event) => onEstimate(Number(event.target.value))}
            >
              {durationOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToTimeLabel(minutes)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-button ghost danger" title="Aufgabe löschen" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
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
  isDragging,
  onBookingChange,
  onBookingDelete,
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
  isDragging: boolean;
  onBookingChange: (bookingId: string, patch: Partial<Booking>) => void;
  onBookingDelete: (bookingId: string) => void;
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
              onOpen={() => setEditingBookingId(booking.id)}
            />
            {editingBookingId === booking.id && (
              <BookingEditor
                booking={booking}
                timeOptions={timeOptions}
                onChange={onBookingChange}
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
          {dropPreview?.area === "time" && dropPreview.startTime && (
            <div
              className="timeline-drop-preview"
              style={{ top: (timeToMinutes(dropPreview.startTime) - calendarStartMinutes) * minuteHeight }}
            >
              <span>{dropPreview.startTime}</span>
            </div>
          )}
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
                    timeOptions={timeOptions}
                    onChange={onBookingChange}
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
      </div>
    </section>
  );
}

function BookingCard({
  booking,
  task,
  isEditing,
  onDrag,
  onOpen,
  onResizeStart
}: {
  booking: Booking;
  task?: Task;
  isEditing: boolean;
  onDrag: () => void;
  onOpen: () => void;
  onResizeStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  if (!task) return null;
  return (
    <article
      className={`booking-card status-card ${statusMeta[task.status].className} ${isEditing ? "editing" : ""}`}
      data-booking-id={booking.id}
      draggable
      onDragStart={onDrag}
      onClick={onOpen}
      title="Buchung bearbeiten"
    >
      <div className="booking-head">
        <StatusIcon status={task.status} />
        <strong>{task.title}</strong>
      </div>
      <div className="booking-read-meta">
        <span>
          {booking.startTime ? <Clock3 size={12} /> : <CalendarDays size={12} />}
          {booking.startTime ?? "Allokation"}
        </span>
        <span>
          <Timer size={12} />
          {minutesToTimeLabel(booking.durationMinutes)}
        </span>
      </div>
      {onResizeStart && <div className="booking-resize-handle" title="Dauer ändern" onPointerDown={onResizeStart} />}
    </article>
  );
}

function BookingEditor({
  booking,
  timeOptions,
  onChange,
  onDelete,
  onClose
}: {
  booking: Booking;
  timeOptions: string[];
  onChange: (bookingId: string, patch: Partial<Booking>) => void;
  onDelete: (bookingId: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="booking-editor" onClick={(event) => event.stopPropagation()}>
      <button className="icon-button ghost editor-close" title="Editor schließen" onClick={onClose}>
        <X size={14} />
      </button>
      <div className="booking-controls">
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
    <div className="metric">
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
