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
  Kanban,
  LayoutTemplate,
  Link,
  List as ListIcon,
  ListTodo,
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
import {
  addDays,
  addMonths,
  browserUtcOffset,
  createCalendarPeriod,
  createMonthDays,
  createTimeOptions,
  dateFromDateTime,
  datePart,
  deadlineTone,
  defaultSettings,
  endOfMonth,
  estimateToLabel,
  externalEventDates,
  externalEventTimeLabel,
  externalTimedSegmentForDate,
  formatDate,
  formatMonthTileDay,
  formatMonthTitle,
  formatOptionalDate,
  isMonday,
  isMultiDayTimedExternalEvent,
  isWeekend,
  maskVisibleApiKey,
  minutesBetween,
  minutesToLabel,
  minutesToTime,
  minutesToTimeLabel,
  nextVisibleDate,
  normalizeTags,
  normalizeTaskStatuses,
  normalizeTaskVisibleIn,
  normalizeTreeFilters,
  parseDurationInput,
  plainTextFromHtml,
  safeMarkdownHref,
  sortByOrder,
  sortedBoardTasks,
  startOfMonth,
  statuses,
  timeFromDateTime,
  timeToMinutes,
  today,
  uid,
  type AppSettings,
  type AppState,
  type AuthUser,
  type Booking,
  type CalendarViewMode,
  type DailyCapacity,
  type DayTemplate,
  type GoogleCalendarEvent,
  type GoogleCalendarItem,
  type GoogleCalendarState,
  type ICloudCalendarItem,
  type ICloudCalendarState,
  type Task,
  type TaskChecklistItem,
  type TaskStatus,
  type TaskVisibleIn,
  type TreeFilterSettings,
  type TreeViewMode,
  type UserProfile,
  type UserSettingsState
} from "../frontend/body/domain";
import { createDomain } from "../frontend/body/domain/domain";
import type { DayCapacity } from "../frontend/body/domain/rpus/getDayCapacityRpu";

const domain = createDomain();

type DragPayload =
  | { kind: "tree-task"; taskId: string }
  | { kind: "prio-task"; taskId: string }
  | { kind: "booking"; bookingId: string };

const durationOptions = Array.from({ length: 15 }, (_, index) => 30 + index * 15);
const estimateOptionGroups = [
  { label: "Klein", options: [30, 60, 90, 120] },
  { label: "Mittel", options: [150, 180, 210, 240] },
  { label: "Groß", options: [300, 360, 420, 480] }
];
const estimateOptions = estimateOptionGroups.flatMap((group) => group.options);
const minuteHeight = 1.1;

// Anzeige-Geometrie: ordnet sich ueberlappende Eintraege in Spalten an, damit
// sie sich im Kalender nicht verdecken. Reine Portal-Darstellung.
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

const statusMeta: Record<TaskStatus, { label: string; icon: typeof Circle; className: string }> = {
  Backlog: { label: "Backlog", icon: Circle, className: "status-backlog" },
  Ready: { label: "Ready", icon: CircleDot, className: "status-ready" },
  Started: { label: "Started", icon: Loader, className: "status-started" },
  Blocked: { label: "Blocked", icon: AlertOctagon, className: "status-blocked" },
  Done: { label: "Done", icon: Check, className: "status-done" },
  Aborted: { label: "Aborted", icon: ArchiveX, className: "status-aborted" }
};

const dayCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const planningCapacityOptions = Array.from({ length: 17 }, (_, index) => 120 + index * 30);
const visibleDayOptions = [7, 14, 21, 31];
const utcOffsetOptions = Array.from({ length: 27 }, (_, index) => index - 12).map((offset) => {
  const sign = offset >= 0 ? "+" : "-";
  return `UTC${sign}${Math.abs(offset).toString().padStart(2, "0")}:00`;
});

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|(?<!\*)\*[^*\s][^*]*\*|_[^_\s][^_]*_|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = safeMarkdownHref(linkMatch[2]);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            {linkMatch[1]}
          </a>
        ) : (
          token
        )
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const href = safeMarkdownHref(token);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            {token}
          </a>
        ) : (
          token
        )
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
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
  const [pendingTaskScrollId, setPendingTaskScrollId] = useState<string | null>(null);
  const [forcedHierarchyExpandedIds, setForcedHierarchyExpandedIds] = useState<Set<string>>(() => new Set());
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
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
  const handledTaskHashRef = useRef("");
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
      const result = await domain.loadTaskspace.process();
      if (result.kind === "unauthorized") {
        setAuthRequired(true);
        return;
      }
      const normalizedState = result.state;
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
      await domain.saveTaskspace.process({ state: currentState, keepalive: options.keepalive });
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
      domain.commitTaskspace.process({ state: null });
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
  const hierarchyExpandedTaskIds = useMemo(
    () => Array.from(new Set([...(settings.hierarchyExpandedTaskIds ?? []), ...forcedHierarchyExpandedIds])),
    [forcedHierarchyExpandedIds, settings.hierarchyExpandedTaskIds]
  );
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
  const taskMetrics = useMemo(() => domain.getTaskMetrics.process(), [state]);
  const bookingCountByTaskId = taskMetrics.bookingCountByTaskId;
  const bookedMinutesByTaskId = useMemo(
    () => domain.getBookedMinutesByTask.process(),
    [state]
  );
  const childCountByTaskId = taskMetrics.childCountByTaskId;
  const activeChildCountByTaskId = taskMetrics.activeChildCountByTaskId;
  const parentTitleByTaskId = taskMetrics.parentTitleByTaskId;
  const tasksByParentId = useMemo(() => domain.getTasksByParent.process(), [state]);
  const treeFilters = settings.treeFilters;
  const availableTags = useMemo(() => domain.getAvailableTags.process(), [state]);
  const visibleBoardStatuses = useMemo(() => domain.getVisibleBoardStatuses.process(), [state]);
  const filteredTreeTasks = useMemo(() => domain.getFilteredTreeTasks.process(), [state]);
  const prioList = useMemo(() => domain.getPrioList.process(), [state]);
  const getDayCapacity = (date: string, externalEvents: GoogleCalendarEvent[]) =>
    domain.getDayCapacity.process({ date, externalEvents, calendarStartMinutes, calendarEndMinutes });
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
      for (const date of externalEventDates(event)) {
        byDate.set(date, [...(byDate.get(date) ?? []), event]);
      }
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

  useEffect(() => {
    if (!pendingTaskScrollId) return;
    let cancelled = false;
    let attempts = 0;

    function tryScroll() {
      if (cancelled) return;
      const target = document.querySelector(`[data-task-id="${pendingTaskScrollId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightTaskId(pendingTaskScrollId);
        setPendingTaskScrollId(null);
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(tryScroll, 50);
    }

    window.requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [pendingTaskScrollId, settings.taskView, settings.hierarchyExpandedTaskIds, filteredTaskIds]);

  useEffect(() => {
    if (!highlightTaskId) return;
    const timeout = window.setTimeout(() => setHighlightTaskId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [highlightTaskId]);

  useEffect(() => {
    if (!state) return;

    function openTaskHash(force = false) {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const taskId = params.get("task");
      if (!taskId) return;
      if (!force && handledTaskHashRef.current === window.location.hash) return;
      if (!taskById.has(taskId)) return;
      handledTaskHashRef.current = window.location.hash;
      showTaskFromPermalink(taskId);
    }

    openTaskHash();
    function handleHashChange() {
      openTaskHash(true);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [state?.tasks, taskById]);

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
    const current = domain.getTaskspace.process();
    if (!current) return;
    const next = mutator(current);
    domain.commitTaskspace.process({ state: next });
    setState(next);
  }

  // Pull: nach einer Command-RPU den Render-Snapshot frisch aus dem Store ziehen.
  function refreshState() {
    setState(domain.getTaskspace.process());
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
    setForcedHierarchyExpandedIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
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
    const created = domain.createTask.process({ title, target, date, initialStatus, parentId });
    refreshState();
    return created;
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
    const created = upsertTask(title, undefined, today, undefined, parentId);
    if (!created) return;
    setChildTaskTitles((current) => ({ ...current, [parentId]: "" }));
    expandHierarchyTask(parentId);
  }

  function detachTaskFromParent(taskId: string) {
    domain.detachTaskFromParent.process({ taskId });
    refreshState();
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setChangedTaskId(taskId);
    domain.updateTask.process({ taskId, patch });
    refreshState();
  }

  function setTaskDone(taskId: string, done: boolean) {
    updateTask(taskId, { done, status: done ? "Done" : "Ready" });
  }

  function moveTaskBeforeInList(sourceTaskId: string, targetTaskId: string) {
    domain.moveTaskInList.process({ sourceTaskId, targetTaskId });
    refreshState();
  }

  function moveTaskBeforeInTree(sourceTaskId: string, targetTaskId: string) {
    domain.moveTaskInTree.process({ sourceTaskId, targetTaskId });
    refreshState();
  }

  function moveTaskAsChild(sourceTaskId: string, parentId: string) {
    domain.moveTaskAsChild.process({ sourceTaskId, parentId });
    refreshState();
    expandHierarchyTask(parentId);
  }

  function addToPrio(taskId: string) {
    domain.addToPrio.process({ taskId });
    refreshState();
  }

  function removeFromPrio(taskId: string) {
    domain.removeFromPrio.process({ taskId });
    refreshState();
  }

  function moveBeforeInPrio(sourceTaskId: string, targetTaskId: string) {
    domain.moveInPrio.process({ sourceTaskId, targetTaskId });
    refreshState();
  }

  function deleteTask(taskId: string) {
    domain.deleteTask.process({ taskId });
    refreshState();
  }

  function toggleTaskArchived(taskId: string) {
    domain.toggleTaskArchived.process({ taskId });
    refreshState();
  }

  function bookTask(taskId: string, date: string, startTime?: string, source: "tree" | "prio" = "tree") {
    domain.bookTask.process({ taskId, date, startTime, source });
    refreshState();
  }

  function addLooseBooking(label: string, date = today, startTime?: string) {
    domain.addLooseBooking.process({ label, date, startTime });
    refreshState();
  }

  function addDefaultLooseBooking(date: string) {
    addLooseBooking("Neue Buchung", date);
  }

  function saveDayAsTemplate(date: string, name: string) {
    const result = domain.saveDayAsTemplate.process({ date, name });
    refreshState();
    return result;
  }

  function applyDayTemplate(templateId: string, date: string) {
    const count = domain.applyDayTemplate.process({ templateId, date });
    refreshState();
    return count;
  }

  function deleteDayTemplate(templateId: string) {
    domain.deleteDayTemplate.process({ templateId });
    refreshState();
  }

  function linkBookingToTask(bookingId: string, taskId: string) {
    domain.linkBookingToTask.process({ bookingId, taskId });
    refreshState();
  }

  function createTaskFromBookingBefore(bookingId: string, targetTaskId: string, mode: "list" | "hierarchy" | "board" = "list") {
    domain.createTaskFromBooking.process({ bookingId, targetTaskId, mode });
    refreshState();
  }

  function updateBooking(bookingId: string, patch: Partial<Booking>) {
    domain.updateBooking.process({ bookingId, patch });
    refreshState();
  }

  function deleteBooking(bookingId: string) {
    domain.deleteBooking.process({ bookingId });
    refreshState();
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
    domain.moveTaskToBoardStatus.process({ taskId, status, targetTaskId });
    refreshState();
  }

  function scrollToTask(taskId: string, options: { expandDetails?: boolean } = {}) {
    const shouldExpandDetails = options.expandDetails ?? true;
    const expandedIds = new Set([...(settings.hierarchyExpandedTaskIds ?? []), ...ancestorTaskIds(taskId)]);
    setForcedHierarchyExpandedIds((current) => new Set([...current, ...ancestorTaskIds(taskId)]));
    updateSettings({
      taskView: "hierarchy",
      hierarchyExpandedTaskIds: [...expandedIds],
      panelsCollapsed: { ...settings.panelsCollapsed, tree: false }
    });
    if (shouldExpandDetails) {
      setExpandedTaskIds((current) => {
        const next = new Set(current);
        next.add(taskId);
        return next;
      });
    }
    setPendingTaskScrollId(taskId);
  }

  function taskPermalink(taskId: string) {
    const url = new URL(window.location.href);
    url.hash = `task=${encodeURIComponent(taskId)}`;
    return url.toString();
  }

  async function copyTaskPermalink(taskId: string) {
    const permalink = taskPermalink(taskId);
    try {
      await navigator.clipboard.writeText(permalink);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = permalink;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  }

  function showTaskFromPermalink(taskId: string) {
    const task = taskById.get(taskId);
    if (!task) return;
    const visibleIn = normalizeTaskVisibleIn(task.visibleIn);
    const hierarchyVisible = visibleIn.hierarchy || Boolean(task.parentId) || (childCountByTaskId.get(task.id) ?? 0) > 0;
    const taskView: TreeViewMode = hierarchyVisible ? "hierarchy" : visibleIn.list ? "list" : "board";
    const ancestorIds = ancestorTaskIds(taskId);
    const expandedIds = new Set([...(settings.hierarchyExpandedTaskIds ?? []), ...ancestorIds]);
    setForcedHierarchyExpandedIds((current) => new Set([...current, ...ancestorIds]));
    updateSettings({
      taskView,
      hierarchyExpandedTaskIds: [...expandedIds],
      treeFilters: {
        ...settings.treeFilters,
        query: "",
        statuses: [],
        tags: [],
        showArchived: Boolean(task.archived)
      },
      boardHiddenStatuses: settings.boardHiddenStatuses.filter((status) => status !== task.status),
      panelsCollapsed: { ...settings.panelsCollapsed, tree: false }
    });
    setPendingTaskScrollId(taskId);
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
        isHighlighted={highlightTaskId === task.id}
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
        onChecklist={(checklist) => updateTask(task.id, { checklist })}
        onVisibility={(visibleIn) => updateTask(task.id, { visibleIn })}
        onGoToHierarchy={() => scrollToTask(task.id)}
        onCopyPermalink={() => copyTaskPermalink(task.id)}
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
              isHighlighted={highlightTaskId === task.id}
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
              onChecklist={(checklist) => updateTask(task.id, { checklist })}
              onVisibility={(visibleIn) => updateTask(task.id, { visibleIn })}
              onGoToHierarchy={() => scrollToTask(task.id)}
              onCopyPermalink={() => copyTaskPermalink(task.id)}
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
      const result = domain.importTaskspace.process({ json: await file.text() });
      if (result.kind === "error") {
        setSaveError(result.message);
        setSaveState("error");
        return;
      }
      stateRef.current = result.state;
      setState(result.state);
      setSaveError("");
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
            {prioList.map(({ task, durationMinutes: prioDuration }) => {
              const showStatusPresentation = normalizeTaskVisibleIn(task.visibleIn).board;
              return (
                <div
                  className={`prio-card status-card ${statusMeta[task.status].className} ${!showStatusPresentation ? "no-board-status" : ""}`}
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
                  {showStatusPresentation && <StatusIcon status={task.status} />}
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
                getDayCapacity={getDayCapacity}
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
                    getDayCapacity={getDayCapacity}
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
                    onOpenTask={(taskId) => scrollToTask(taskId, { expandDetails: false })}
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
          Default Status
          <select value={settings.defaultTaskStatus} onChange={(event) => onSettingsChange({ defaultTaskStatus: event.target.value as TaskStatus })}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
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
        <div className="settings-check-spacer" />
        <label className="settings-check">
          <input type="checkbox" checked={settings.showWeekends} onChange={(event) => onSettingsChange({ showWeekends: event.target.checked })} />
          Wochenende anzeigen
        </label>
      </div>
    </div>
  );
}

function EditableMarkdownField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = ""
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(!value.trim());
  const lines = value.split("\n");
  const hasText = value.trim().length > 0;

  if (editing || !hasText) {
    return (
      <textarea
        className={className}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onDragStart={(event) => event.preventDefault()}
      />
    );
  }

  return (
    <div
      className={`markdown-preview ${className}`}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") setEditing(true);
      }}
    >
      {lines.map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) {
          return (
            <p className="markdown-bullet" key={index}>
              <span>•</span>
              <span>{renderInlineMarkdown(bullet[1], `${ariaLabel}-${index}`)}</span>
            </p>
          );
        }
        return line.trim() ? (
          <p key={index}>{renderInlineMarkdown(line, `${ariaLabel}-${index}`)}</p>
        ) : (
          <p className="markdown-empty-line" key={index} />
        );
      })}
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
  isHighlighted = false,
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
  onChecklist,
  onVisibility,
  onGoToHierarchy,
  onCopyPermalink,
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
  isHighlighted?: boolean;
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
  onChecklist: (checklist: TaskChecklistItem[]) => void;
  onVisibility: (visibleIn: TaskVisibleIn) => void;
  onGoToHierarchy: () => void;
  onCopyPermalink: () => Promise<void>;
  onDetachParent: () => void;
  childTaskTitle: string;
  onChildTaskTitleChange: (title: string) => void;
  onAddChildTask: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [parentMenuOpen, setParentMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [permalinkCopied, setPermalinkCopied] = useState(false);
  const parentMenuRef = useRef<HTMLSpanElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!parentMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !parentMenuRef.current?.contains(target)) setParentMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [parentMenuOpen]);

  useEffect(() => {
    if (!deleteConfirm) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !deleteButtonRef.current?.contains(target)) setDeleteConfirm(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [deleteConfirm]);

  useEffect(() => {
    if (!permalinkCopied) return;
    const timeout = window.setTimeout(() => setPermalinkCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [permalinkCopied]);

  const taskVisibleIn = normalizeTaskVisibleIn(task.visibleIn);
  const showStatusPresentation = taskVisibleIn.board;

  return (
    <article
      className={`task-card task-card-${variant} status-card ${statusMeta[task.status].className} ${!showStatusPresentation ? "no-board-status" : ""} ${task.archived ? "archived" : ""} ${isDropTarget ? "task-drop-target" : ""} ${isHierarchySortTarget ? "hierarchy-sort-target" : ""} ${isHighlighted ? "task-reference-highlight" : ""}`}
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
          {showStatusPresentation && <StatusIcon status={task.status} />}
          <strong>{task.title}</strong>
          {(task.checklist?.length ?? 0) > 0 && <ListTodo className="task-inline-icon" size={14} />}
          {showUnsavedDot && <span className="task-unsaved-dot" title="Ungespeicherte Änderung" />}
        </div>
        <div className="task-compact-meta">
          {showStatusPresentation && <span className={`task-status-pill ${statusMeta[task.status].className}`}>{task.status}</span>}
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
          <button
            className={`task-permalink-button ${permalinkCopied ? "copied" : ""}`}
            title={permalinkCopied ? "Link kopiert" : "Permalink kopieren"}
            onClick={(event) => {
              event.stopPropagation();
              void onCopyPermalink().then(() => setPermalinkCopied(true));
            }}
          >
            {permalinkCopied ? <Check size={11} /> : <Link size={11} />}
          </button>
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
          ref={deleteButtonRef}
          className={`icon-button ghost danger ${deleteConfirm ? "confirm-delete" : ""}`}
          title={
            childCount > 0
              ? "Aufgaben mit Unteraufgaben können noch nicht gelöscht werden"
              : deleteConfirm
                ? "Erneut klicken zum Löschen"
                : "Aufgabe löschen"
          }
          disabled={childCount > 0}
          onClick={(event) => {
            event.stopPropagation();
            if (deleteConfirm) {
              onDelete();
              setDeleteConfirm(false);
            } else {
              setDeleteConfirm(true);
            }
          }}
        >
          {deleteConfirm ? <span className="confirm-delete-mark">?</span> : <Trash2 size={15} />}
        </button>
      </div>
      {expanded && (
        <div className="task-detail-panel">
          <TaskVisibilityToggles
            visibleIn={normalizeTaskVisibleIn(task.visibleIn)}
            hierarchyLocked={Boolean(task.parentId) || childCount > 0}
            onVisibility={onVisibility}
          />
          <label>
            <input placeholder="Titel" value={task.title} onChange={(event) => onTitle(event.target.value)} />
          </label>
          <label>
            <EditableMarkdownField
              placeholder="Beschreibung"
              value={task.description ?? ""}
              onChange={onDescription}
              ariaLabel="Aufgabenbeschreibung"
            />
          </label>
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
          <TaskTagPicker allTags={allTags} task={task} onTags={onTags} />
          <TaskChecklistEditor checklist={task.checklist ?? []} onChecklist={onChecklist} />
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

function TaskVisibilityToggles({
  visibleIn,
  hierarchyLocked,
  onVisibility
}: {
  visibleIn: TaskVisibleIn;
  hierarchyLocked: boolean;
  onVisibility: (visibleIn: TaskVisibleIn) => void;
}) {
  const effectiveVisibleIn = { ...visibleIn, hierarchy: hierarchyLocked ? true : visibleIn.hierarchy };
  const items: Array<{ key: keyof TaskVisibleIn; title: string; icon: typeof Circle; locked?: boolean }> = [
    { key: "list", title: "In Liste anzeigen", icon: ListIcon },
    { key: "board", title: "Im Board anzeigen", icon: Kanban },
    { key: "hierarchy", title: hierarchyLocked ? "Hierarchie ist bei Parent/Child-Aufgaben erforderlich" : "In Hierarchie anzeigen", icon: FolderTree, locked: hierarchyLocked }
  ];

  function toggle(key: keyof TaskVisibleIn, locked?: boolean) {
    if (locked) return;
    const enabledCount = Object.values(effectiveVisibleIn).filter(Boolean).length;
    if (effectiveVisibleIn[key] && enabledCount <= 1) return;
    onVisibility({ ...effectiveVisibleIn, [key]: !effectiveVisibleIn[key] });
  }

  return (
    <div className="task-view-toggles" aria-label="Aufgabe in Ansichten anzeigen">
      {items.map(({ key, title, icon: Icon, locked }) => (
        <button
          className={`task-view-toggle ${effectiveVisibleIn[key] ? "enabled" : "disabled"}`}
          disabled={locked}
          key={key}
          title={title}
          type="button"
          onClick={() => toggle(key, locked)}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

function TaskChecklistEditor({
  checklist,
  onChecklist
}: {
  checklist: TaskChecklistItem[];
  onChecklist: (checklist: TaskChecklistItem[]) => void;
}) {
  const [newItemText, setNewItemText] = useState("");

  function addItem() {
    const text = newItemText.trim();
    if (!text) return;
    onChecklist([...checklist, { id: uid("check"), text, done: false }]);
    setNewItemText("");
  }

  return (
    <div className="task-checklist">
      <div className="task-checklist-header">
        <ListTodo size={14} />
        <span>Checkliste</span>
      </div>
      {checklist.length > 0 && (
        <div className="task-checklist-items">
          {checklist.map((item) => (
            <div className={`task-checklist-item ${item.done ? "done" : ""}`} key={item.id}>
              <button
                className={`check-button ${item.done ? "checked" : ""}`}
                title="Checklisteneintrag abhaken"
                onClick={() =>
                  onChecklist(checklist.map((candidate) => (candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate)))
                }
              >
                {item.done && <Check size={13} />}
              </button>
              <input
                disabled={item.done}
                value={item.text}
                onChange={(event) =>
                  onChecklist(checklist.map((candidate) => (candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate)))
                }
                onBlur={() => onChecklist(checklist.filter((candidate) => candidate.text.trim()))}
              />
              <button className="icon-button ghost danger" title="Checklisteneintrag löschen" onClick={() => onChecklist(checklist.filter((candidate) => candidate.id !== item.id))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="task-checklist-add">
        <input
          placeholder="Neuer Checklisteneintrag"
          value={newItemText}
          onChange={(event) => setNewItemText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addItem();
          }}
        />
        <button className="icon-button" title="Checklisteneintrag hinzufügen" onClick={addItem}>
          <Plus size={15} />
        </button>
      </div>
    </div>
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
  getDayCapacity,
  onOpenDay
}: {
  months: string[];
  showWeekends: boolean;
  bookings: Booking[];
  externalEventsByDate: Map<string, GoogleCalendarEvent[]>;
  getDayCapacity: (date: string, externalEvents: GoogleCalendarEvent[]) => DayCapacity;
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
                const externalEvents = externalEventsByDate.get(date) ?? [];
                const { capacity, bookedMinutes, level, isOverbooked } = getDayCapacity(date, externalEvents);
                const bookingCount = (bookingsByDate.get(date) ?? []).length + externalEvents.length;
                const bookedPercent = capacity.dayCapacityMinutes > 0 ? (bookedMinutes / capacity.dayCapacityMinutes) * 100 : 0;
                const fillPercent = Math.min(100, bookedPercent);
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
  getDayCapacity,
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
  getDayCapacity: (date: string, externalEvents: GoogleCalendarEvent[]) => DayCapacity;
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
  const [currentMinuteOfDay, setCurrentMinuteOfDay] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRef = useRef<HTMLElement | null>(null);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);
  const allocations = bookings.filter((booking) => !booking.startTime);
  const scheduled = bookings.filter((booking) => booking.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
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
    ...googleScheduled.flatMap((event): TimedCalendarEntry[] => {
      const segment = externalTimedSegmentForDate(event, date, calendarStartMinutes, calendarEndMinutes);
      if (!segment) return [];
      return [{
        kind: "external",
        id: event.id,
        startMinutes: segment.startMinutes,
        endMinutes: segment.endMinutes,
        event
      }];
    })
  ]);
  const dayCapacity = getDayCapacity(date, googleEvents);
  const bookedMinutes = dayCapacity.bookedMinutes;
  const fillPercent = Math.min(100, (bookedMinutes / capacity.dayCapacityMinutes) * 100);
  const planningPercent = Math.min(100, (capacity.planningCapacityMinutes / capacity.dayCapacityMinutes) * 100);
  const capacityLevel = dayCapacity.level;
  const isOverflowingDay = dayCapacity.isOverbooked;
  const timelineHeight = (calendarEndMinutes - calendarStartMinutes) * minuteHeight;
  const showCurrentTimeLine = date === today && currentMinuteOfDay >= calendarStartMinutes && currentMinuteOfDay <= calendarEndMinutes;
  const currentTimeLineTop = (currentMinuteOfDay - calendarStartMinutes) * minuteHeight;
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
    if (date !== today) return;
    function updateCurrentMinute() {
      const now = new Date();
      setCurrentMinuteOfDay(now.getHours() * 60 + now.getMinutes());
    }
    updateCurrentMinute();
    let interval: number | undefined;
    const now = new Date();
    const delayToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeout = window.setTimeout(() => {
      updateCurrentMinute();
      interval = window.setInterval(updateCurrentMinute, 60_000);
    }, delayToNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [date]);

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
          <div className="booking-shell allocation-booking-shell" key={booking.id} style={{ height: Math.max(36, booking.durationMinutes * minuteHeight) }}>
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
          {showCurrentTimeLine && (
            <div className="current-time-line" style={{ top: currentTimeLineTop }}>
              <span>{minutesToTime(currentMinuteOfDay)}</span>
            </div>
          )}
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
  const showStatusPresentation = task ? normalizeTaskVisibleIn(task.visibleIn).board : true;
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
      className={`booking-card status-card ${task ? statusMeta[task.status].className : "loose-booking"} ${task && !showStatusPresentation ? "no-board-status" : ""} ${task?.archived ? "archived-booking" : ""} ${isEditing ? "editing" : ""}`}
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
        {task ? showStatusPresentation ? <StatusIcon status={task.status} /> : null : <CalendarDays size={14} />}
        <strong>{title}</strong>
        {(task?.checklist?.length ?? 0) > 0 && <ListTodo size={13} />}
        {task?.archived && <Archive size={13} />}
      </div>
      {onResizeStart && <div className="booking-resize-handle" title="Dauer ändern" onPointerDown={onResizeStart} />}
    </article>
  );
}

function GoogleEventCard({ event, compact = false, onOpen }: { event: GoogleCalendarEvent; compact?: boolean; onOpen: () => void }) {
  const timeLabel = externalEventTimeLabel(event);
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
  const timeLabel = externalEventTimeLabel(event);
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
  const [manualDuration, setManualDuration] = useState(minutesToTimeLabel(booking.durationMinutes));
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const durationMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setManualDuration(minutesToTimeLabel(booking.durationMinutes));
  }, [booking.durationMinutes]);

  useEffect(() => {
    if (!durationMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !durationMenuRef.current?.contains(target)) {
        setDurationMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [durationMenuOpen]);

  function commitManualDuration() {
    const durationMinutes = parseDurationInput(manualDuration);
    if (!durationMinutes || durationMinutes <= 0) {
      setManualDuration(minutesToTimeLabel(booking.durationMinutes));
      return;
    }
    onChange(booking.id, { durationMinutes });
  }

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
          <div className="booking-duration-controls">
            <div className="booking-duration-combo" ref={durationMenuRef}>
              <input
                aria-label="Dauer"
                inputMode="numeric"
                value={manualDuration}
                onFocus={() => setDurationMenuOpen(true)}
                onChange={(event) => setManualDuration(event.target.value)}
                onBlur={commitManualDuration}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                    setDurationMenuOpen(false);
                  }
                  if (event.key === "Escape") {
                    setManualDuration(minutesToTimeLabel(booking.durationMinutes));
                    setDurationMenuOpen(false);
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                className="booking-duration-toggle"
                type="button"
                title="Dauer auswählen"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setDurationMenuOpen((open) => !open)}
              >
                <ChevronDown size={14} />
              </button>
              {durationMenuOpen && (
                <div className="booking-duration-menu" role="listbox" aria-label="Dauervorschläge">
                  {durationOptions.map((minutes) => {
                    const label = minutesToTimeLabel(minutes);
                    return (
                      <button
                        className={minutes === booking.durationMinutes ? "active" : ""}
                        key={minutes}
                        type="button"
                        role="option"
                        aria-selected={minutes === booking.durationMinutes}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setManualDuration(label);
                          setDurationMenuOpen(false);
                          onChange(booking.id, { durationMinutes: minutes });
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </label>
        <button className="icon-button ghost" title="Buchung löschen" onClick={() => onDelete(booking.id)}>
          <Trash2 size={14} />
        </button>
        <label className="booking-description-field">
          <span>Beschreibung</span>
          <EditableMarkdownField
            placeholder="Beschreibung"
            value={booking.description ?? ""}
            onChange={(description) => onChange(booking.id, { description })}
            ariaLabel="Buchungsbeschreibung"
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
