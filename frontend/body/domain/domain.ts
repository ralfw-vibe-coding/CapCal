// Composition Root der Frontend-Domaene.
//
// Hier werden der In-Memory-Store und der Domain State Provider erzeugt und in
// die RPUs injiziert. Store und Provider bleiben damit Implementierungsdetails
// der Domaene; nach aussen sind nur die RPUs sichtbar. Das Portal ruft
// ausschliesslich diese RPUs auf und kennt weder Store, Provider noch
// internen Zustand.

import { TaskspaceStateProvider } from "./providers/taskspaceStateProvider";
import { AddLooseBookingRpu } from "./rpus/addLooseBookingRpu";
import { AddToPrioRpu } from "./rpus/addToPrioRpu";
import { ApplyDayTemplateRpu } from "./rpus/applyDayTemplateRpu";
import { BookTaskRpu } from "./rpus/bookTaskRpu";
import { CreateTaskRpu } from "./rpus/createTaskRpu";
import { CreateTaskFromBookingRpu } from "./rpus/createTaskFromBookingRpu";
import { DeleteBookingRpu } from "./rpus/deleteBookingRpu";
import { DeleteDayTemplateRpu } from "./rpus/deleteDayTemplateRpu";
import { DeleteTaskRpu } from "./rpus/deleteTaskRpu";
import { DetachTaskFromParentRpu } from "./rpus/detachTaskFromParentRpu";
import { LinkBookingToTaskRpu } from "./rpus/linkBookingToTaskRpu";
import { GetAvailableTagsRpu } from "./rpus/getAvailableTagsRpu";
import { GetBookedMinutesByTaskRpu } from "./rpus/getBookedMinutesByTaskRpu";
import { GetBookingsForDateRpu } from "./rpus/getBookingsForDateRpu";
import { GetDayCapacityRpu } from "./rpus/getDayCapacityRpu";
import { GetDayTemplatesRpu } from "./rpus/getDayTemplatesRpu";
import { GetFilteredTreeTasksRpu } from "./rpus/getFilteredTreeTasksRpu";
import { GetPrioListRpu } from "./rpus/getPrioListRpu";
import { GetSettingsRpu } from "./rpus/getSettingsRpu";
import { GetStatusCountsRpu } from "./rpus/getStatusCountsRpu";
import { GetTaskByIdMapRpu } from "./rpus/getTaskByIdMapRpu";
import { GetTaskMetricsRpu } from "./rpus/getTaskMetricsRpu";
import { GetTasksByParentRpu } from "./rpus/getTasksByParentRpu";
import { GetTaskspaceRpu } from "./rpus/getTaskspaceRpu";
import { GetVisibleBoardStatusesRpu } from "./rpus/getVisibleBoardStatusesRpu";
import { ImportTaskspaceRpu } from "./rpus/importTaskspaceRpu";
import { LoadTaskspaceRpu } from "./rpus/loadTaskspaceRpu";
import { MoveInPrioRpu } from "./rpus/moveInPrioRpu";
import { MoveTaskAsChildRpu } from "./rpus/moveTaskAsChildRpu";
import { MoveTaskInListRpu } from "./rpus/moveTaskInListRpu";
import { MoveTaskInTreeRpu } from "./rpus/moveTaskInTreeRpu";
import { MoveTaskToBoardStatusRpu } from "./rpus/moveTaskToBoardStatusRpu";
import { RemoveFromPrioRpu } from "./rpus/removeFromPrioRpu";
import { ResetTaskspaceRpu } from "./rpus/resetTaskspaceRpu";
import { SaveDayAsTemplateRpu } from "./rpus/saveDayAsTemplateRpu";
import { SaveTaskspaceRpu } from "./rpus/saveTaskspaceRpu";
import { SetPrioDurationRpu } from "./rpus/setPrioDurationRpu";
import { ToggleTaskArchivedRpu } from "./rpus/toggleTaskArchivedRpu";
import { UpdateBookingRpu } from "./rpus/updateBookingRpu";
import { UpdateCapacityDefaultsRpu } from "./rpus/updateCapacityDefaultsRpu";
import { UpdateDailyCapacityRpu } from "./rpus/updateDailyCapacityRpu";
import { UpdateSettingsRpu } from "./rpus/updateSettingsRpu";
import { UpdateTaskRpu } from "./rpus/updateTaskRpu";
import { TaskspaceStore } from "./taskspaceStore";

export function createDomain() {
  const store = new TaskspaceStore();
  const stateProvider = new TaskspaceStateProvider();

  return {
    // Taskspace-weite RPUs (Persistenz-Kante)
    loadTaskspace: new LoadTaskspaceRpu(stateProvider, store),
    saveTaskspace: new SaveTaskspaceRpu(stateProvider, store),
    importTaskspace: new ImportTaskspaceRpu(store),
    resetTaskspace: new ResetTaskspaceRpu(store),
    getTaskspace: new GetTaskspaceRpu(store),

    // Query-RPUs (Kapazitaet)
    getBookedMinutesByTask: new GetBookedMinutesByTaskRpu(store),
    getDayCapacity: new GetDayCapacityRpu(store),

    // Query-RPUs (View-Modelle fuer Liste/Board/Hierarchie)
    getTaskMetrics: new GetTaskMetricsRpu(store),
    getTasksByParent: new GetTasksByParentRpu(store),
    getFilteredTreeTasks: new GetFilteredTreeTasksRpu(store),
    getAvailableTags: new GetAvailableTagsRpu(store),
    getVisibleBoardStatuses: new GetVisibleBoardStatusesRpu(store),
    getPrioList: new GetPrioListRpu(store),
    getSettings: new GetSettingsRpu(store),
    getTaskById: new GetTaskByIdMapRpu(store),
    getStatusCounts: new GetStatusCountsRpu(store),
    getBookingsForDate: new GetBookingsForDateRpu(store),
    getDayTemplates: new GetDayTemplatesRpu(store),

    // Command-RPUs (Aufgaben-Lebenszyklus)
    createTask: new CreateTaskRpu(store),
    updateTask: new UpdateTaskRpu(store),
    deleteTask: new DeleteTaskRpu(store),
    toggleTaskArchived: new ToggleTaskArchivedRpu(store),
    detachTaskFromParent: new DetachTaskFromParentRpu(store),

    // Command-RPUs (Reihenfolge / Hierarchie)
    moveTaskInList: new MoveTaskInListRpu(store),
    moveTaskInTree: new MoveTaskInTreeRpu(store),
    moveTaskAsChild: new MoveTaskAsChildRpu(store),
    moveTaskToBoardStatus: new MoveTaskToBoardStatusRpu(store),

    // Command-RPUs (Priorisierung)
    addToPrio: new AddToPrioRpu(store),
    removeFromPrio: new RemoveFromPrioRpu(store),
    moveInPrio: new MoveInPrioRpu(store),

    // Command-RPUs (Buchungen)
    bookTask: new BookTaskRpu(store),
    addLooseBooking: new AddLooseBookingRpu(store),
    createTaskFromBooking: new CreateTaskFromBookingRpu(store),
    updateBooking: new UpdateBookingRpu(store),
    deleteBooking: new DeleteBookingRpu(store),
    linkBookingToTask: new LinkBookingToTaskRpu(store),

    // Command-RPUs (Tagesvorlagen)
    saveDayAsTemplate: new SaveDayAsTemplateRpu(store),
    applyDayTemplate: new ApplyDayTemplateRpu(store),
    deleteDayTemplate: new DeleteDayTemplateRpu(store),

    // Command-RPUs (Settings / Kapazitaet / Prio-Dauer)
    updateSettings: new UpdateSettingsRpu(store),
    updateCapacityDefaults: new UpdateCapacityDefaultsRpu(store),
    updateDailyCapacity: new UpdateDailyCapacityRpu(store),
    setPrioDuration: new SetPrioDurationRpu(store)
  };
}

export type Domain = ReturnType<typeof createDomain>;
