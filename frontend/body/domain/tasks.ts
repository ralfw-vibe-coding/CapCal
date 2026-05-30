// Domaenenlogik fuer Aufgaben: Sortierung, Normalisierung, Status- und Tag-Regeln.
// Reine Funktionen, keine UI-Technologie.

import { statuses } from "./constants";
import { uid } from "./id";
import type {
  DayTemplate,
  DayTemplateSlot,
  Task,
  TaskChecklistItem,
  TaskStatus,
  TaskVisibleIn,
  TreeFilterSettings
} from "./types";

export function statusAfterMoveToPrio(status: TaskStatus) {
  if (status === "Backlog") return "Ready";
  if (status === "Blocked") return "Started";
  return status;
}

export function sortByOrder<T extends { id: string }>(items: T[], order: (item: T) => number | undefined) {
  return [...items].sort((a, b) => (order(a) ?? 0) - (order(b) ?? 0) || a.id.localeCompare(b.id));
}

export function sortedTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.treeOrder);
}

export function sortedListTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.listOrder);
}

export function sortedBoardTasks(tasks: Task[]) {
  return sortByOrder(tasks, (task) => task.boardOrder);
}

export function normalizeTaskVisibleIn(visibleIn?: Partial<TaskVisibleIn>): TaskVisibleIn {
  return {
    list: visibleIn?.list ?? true,
    board: visibleIn?.board ?? true,
    hierarchy: visibleIn?.hierarchy ?? true
  };
}

export function moveItemToDropTarget<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function durationForPlanning(taskDurationMinutes: number | undefined, defaultPrioDurationMinutes: number) {
  return taskDurationMinutes && taskDurationMinutes <= 120 ? taskDurationMinutes : defaultPrioDurationMinutes;
}

export function normalizeTreeFilters(filters?: Partial<TreeFilterSettings> | null): TreeFilterSettings {
  return {
    query: filters?.query ?? "",
    statuses: (filters?.statuses ?? []).filter((status): status is TaskStatus => statuses.includes(status as TaskStatus)),
    tags: normalizeTags(filters?.tags),
    showArchived: filters?.showArchived ?? false
  };
}

export function normalizeTaskStatuses(rawStatuses?: unknown[] | null): TaskStatus[] {
  return (rawStatuses ?? []).filter((status): status is TaskStatus => statuses.includes(status as TaskStatus));
}

export function normalizeTags(rawTags?: unknown[] | string | null): string[] {
  const values = Array.isArray(rawTags) ? rawTags : typeof rawTags === "string" ? rawTags.split(",") : [];
  return Array.from(
    new Set(
      values
        .map((tag) => String(tag).trim())
        .filter(Boolean)
    )
  );
}

export function normalizeTasks(tasks: Task[]): Task[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const cleanedTasks = tasks.map((task, index) => {
    const legacyOrder = task.treeOrder ?? index;
    const rawChecklist = Array.isArray(task.checklist) ? task.checklist : [];
    return {
    ...task,
    parentId: task.parentId && task.parentId !== task.id && taskIds.has(task.parentId) ? task.parentId : undefined,
    checklist: rawChecklist
      .map((item, itemIndex): TaskChecklistItem | null => {
        if (typeof item === "string") return { id: uid("check"), text: item, done: false };
        if (!item || typeof item !== "object") return null;
        const rawItem = item as Partial<TaskChecklistItem>;
        return {
          id: typeof rawItem.id === "string" ? rawItem.id : uid(`check-${index}-${itemIndex}`),
          text: typeof rawItem.text === "string" ? rawItem.text : "",
          done: Boolean(rawItem.done)
        };
      })
      .filter((item): item is TaskChecklistItem => Boolean(item)),
    visibleIn: normalizeTaskVisibleIn(task.visibleIn),
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

export function normalizeDayTemplates(rawTemplates?: unknown[] | null): DayTemplate[] {
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
