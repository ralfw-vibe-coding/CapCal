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
  GripVertical,
  ListTree,
  Loader,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X
} from "lucide-react";
import "./styles.css";
import { useEffect, useMemo, useState } from "react";

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

type AppState = {
  dailyCapacities?: Record<string, DailyCapacity>;
  tasks: Task[];
  prioTaskIds: string[];
  bookings: Booking[];
};

type DragPayload =
  | { kind: "tree-task"; taskId: string }
  | { kind: "prio-task"; taskId: string }
  | { kind: "booking"; bookingId: string };

const statuses: TaskStatus[] = ["Backlog", "Ready", "Started", "Blocked", "Done", "Aborted"];
const defaultDuration = 30;
const durationOptions = Array.from({ length: 15 }, (_, index) => 30 + index * 15);
const hours = Array.from({ length: 15 }, (_, index) => index + 6);
const calendarStartMinutes = 6 * 60;
const calendarEndMinutes = 20 * 60;
const minuteHeight = 1.1;
const timeOptions = Array.from({ length: 57 }, (_, index) => {
  const minutes = 6 * 60 + index * 15;
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
});

const statusMeta: Record<TaskStatus, { label: string; icon: typeof Circle; className: string }> = {
  Backlog: { label: "Backlog", icon: Circle, className: "status-backlog" },
  Ready: { label: "Ready", icon: CircleDot, className: "status-ready" },
  Started: { label: "Started", icon: Loader, className: "status-started" },
  Blocked: { label: "Blocked", icon: AlertOctagon, className: "status-blocked" },
  Done: { label: "Done", icon: Check, className: "status-done" },
  Aborted: { label: "Aborted", icon: ArchiveX, className: "status-aborted" }
};

const today = new Date().toISOString().slice(0, 10);
const defaultCapacity: DailyCapacity = {
  dayCapacityMinutes: 480,
  planningCapacityMinutes: 360
};

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

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [collapsed, setCollapsed] = useState({ tree: false, prio: false, cal: false });
  const [newTask, setNewTask] = useState({ title: "", dueDate: "", estimateMinutes: 30 });
  const [quickAdd, setQuickAdd] = useState({ prio: "", cal: "" });
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [visibleDays, setVisibleDays] = useState(8);

  useEffect(() => {
    fetch("/api/state")
      .then((response) => response.json())
      .then(setState)
      .catch(() => {
        setState({ dailyCapacities: {}, tasks: [], prioTaskIds: [], bookings: [] });
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

  const taskById = useMemo(() => new Map(state?.tasks.map((task) => [task.id, task]) ?? []), [state?.tasks]);
  const days = useMemo(() => Array.from({ length: visibleDays }, (_, index) => addDays(today, index)), [visibleDays]);
  const workspaceColumns = [
    collapsed.tree ? "64px" : collapsed.cal ? "minmax(520px, 1.35fr)" : "minmax(360px, 0.95fr)",
    collapsed.prio ? "64px" : "minmax(310px, 0.8fr)",
    collapsed.cal ? "64px" : "minmax(520px, 1.45fr)"
  ].join(" ");

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

  function upsertTask(title: string, target?: "prio" | "cal", date = today): Task | null {
    const trimmed = title.trim();
    if (!trimmed) return null;
    const task: Task = {
      id: uid("task"),
      title: trimmed,
      dueDate: target === "cal" ? date : undefined,
      estimateMinutes: 30,
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
        bookings: [...draft.bookings]
      };
      if (target === "prio") next.prioTaskIds.push(task.id);
      if (target === "cal") {
        next.bookings.push({ id: uid("booking"), taskId: task.id, date, durationMinutes: defaultDuration });
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
    setNewTask({ title: "", dueDate: "", estimateMinutes: 30 });
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
    updateState((draft) =>
      draft.prioTaskIds.includes(taskId) ? draft : { ...draft, prioTaskIds: [...draft.prioTaskIds, taskId] }
    );
  }

  function removeFromPrio(taskId: string) {
    updateState((draft) => ({ ...draft, prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId) }));
  }

  function moveBeforeInPrio(sourceTaskId: string, targetTaskId: string) {
    updateState((draft) => {
      const prioTaskIds = draft.prioTaskIds.includes(sourceTaskId) ? [...draft.prioTaskIds] : [...draft.prioTaskIds, sourceTaskId];
      const sourceIndex = prioTaskIds.indexOf(sourceTaskId);
      const targetIndex = prioTaskIds.indexOf(targetTaskId);
      return { ...draft, prioTaskIds: moveItemToDropTarget(prioTaskIds, sourceIndex, targetIndex) };
    });
  }

  function deleteTask(taskId: string) {
    updateState((draft) => ({
      ...draft,
      tasks: sortedTasks(draft.tasks)
        .filter((task) => task.id !== taskId)
        .map((task, treeOrder) => ({ ...task, treeOrder })),
      prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
      bookings: draft.bookings.filter((booking) => booking.taskId !== taskId)
    }));
  }

  function bookTask(taskId: string, date: string, startTime?: string) {
    updateState((draft) => ({
      ...draft,
      prioTaskIds: draft.prioTaskIds.filter((id) => id !== taskId),
      tasks: draft.tasks.map((task) =>
        task.id === taskId && task.status !== "Done" ? { ...task, status: "Started" } : task
      ),
      bookings: [
        ...draft.bookings,
        {
          id: uid("booking"),
          taskId,
          date,
          startTime,
          durationMinutes: draft.tasks.find((task) => task.id === taskId)?.estimateMinutes ?? defaultDuration
        }
      ]
    }));
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
    if (dragPayload.kind === "tree-task" || dragPayload.kind === "prio-task") bookTask(dragPayload.taskId, date, startTime);
    setDragPayload(null);
  }

  function togglePanel(panel: keyof typeof collapsed) {
    setCollapsed((current) => ({ ...current, [panel]: !current[panel] }));
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
        </div>
      </header>

      <section className="workspace" style={{ gridTemplateColumns: workspaceColumns }}>
        <Panel
          title="Aufgaben"
          icon={ListTree}
          collapsed={collapsed.tree}
          onToggle={() => togglePanel("tree")}
          className="tree-panel"
        >
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
            {sortedTasks(state.tasks).map((task) => (
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
          collapsed={collapsed.prio}
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
              return (
                <div
                  className="prio-card"
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
                    value={task.estimateMinutes}
                    onChange={(event) => updateTask(task.id, { estimateMinutes: Number(event.target.value) })}
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
          collapsed={collapsed.cal}
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
            <button className="soft-button" onClick={() => setVisibleDays((count) => Math.max(4, count - 2))}>
              <ChevronLeft size={15} /> Weniger
            </button>
            <button className="soft-button" onClick={() => setVisibleDays((count) => count + 2)}>
              Mehr <ChevronRight size={15} />
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
                  taskById={taskById}
                  onDrop={handleDrop}
                  onBookingDrag={(bookingId) => setDragPayload({ kind: "booking", bookingId })}
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
      className={`task-card ${task.status === "Blocked" ? "attention" : ""}`}
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
  taskById,
  onDrop,
  onBookingDrag,
  onBookingChange,
  onBookingDelete,
  onCapacityChange
}: {
  date: string;
  bookings: Booking[];
  capacity: DailyCapacity;
  taskById: Map<string, Task>;
  onDrop: (date: string, startTime?: string) => void;
  onBookingDrag: (bookingId: string) => void;
  onBookingChange: (bookingId: string, patch: Partial<Booking>) => void;
  onBookingDelete: (bookingId: string) => void;
  onCapacityChange: (patch: Partial<DailyCapacity>) => void;
}) {
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const allocations = bookings.filter((booking) => !booking.startTime);
  const scheduled = bookings.filter((booking) => booking.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  const bookedMinutes = bookings.reduce((sum, booking) => sum + booking.durationMinutes, 0);
  const fillPercent = Math.min(100, (bookedMinutes / capacity.dayCapacityMinutes) * 100);
  const planningPercent = Math.min(100, (capacity.planningCapacityMinutes / capacity.dayCapacityMinutes) * 100);
  const timelineHeight = (calendarEndMinutes - calendarStartMinutes) * minuteHeight;

  return (
    <section className="day-column">
      <header className={date === today ? "today" : ""}>{formatDate(date)}</header>
      <div className="capacity-strip">
        <div className="capacity-label">
          <span>{minutesToLabel(bookedMinutes)} gebucht</span>
          <strong>{minutesToLabel(capacity.dayCapacityMinutes)}</strong>
        </div>
        <div className="capacity-bar" title={`Planungskapazität: ${minutesToLabel(capacity.planningCapacityMinutes)}`}>
          <div className="capacity-fill" style={{ width: `${fillPercent}%` }} />
          <div className="planning-marker" style={{ left: `${planningPercent}%` }} />
        </div>
        <div className="capacity-controls">
          <label>
            Tag
            <select
              value={capacity.dayCapacityMinutes}
              onChange={(event) => onCapacityChange({ dayCapacityMinutes: Number(event.target.value) })}
            >
              {[240, 300, 360, 420, 480, 540, 600].map((minutes) => (
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
              {[180, 240, 300, 360, 420, 480].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutesToLabel(minutes)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="allocation-zone" onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(date)}>
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
        <div className="timeline" style={{ height: timelineHeight }}>
          {hours.map((hour) => (
            <div
              className="timeline-hour-line"
              key={hour}
              style={{ top: (hour * 60 - calendarStartMinutes) * minuteHeight }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(date, `${hour.toString().padStart(2, "0")}:00`)}
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
                  onOpen={() => setEditingBookingId(booking.id)}
                />
                {editingBookingId === booking.id && (
                  <BookingEditor
                    booking={booking}
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
  onOpen
}: {
  booking: Booking;
  task?: Task;
  isEditing: boolean;
  onDrag: () => void;
  onOpen: () => void;
}) {
  if (!task) return null;
  return (
    <article
      className={`booking-card ${isEditing ? "editing" : ""}`}
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
        <span>{booking.startTime ?? "Allokation"}</span>
        <span>{minutesToTimeLabel(booking.durationMinutes)}</span>
      </div>
    </article>
  );
}

function BookingEditor({
  booking,
  onChange,
  onDelete,
  onClose
}: {
  booking: Booking;
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
