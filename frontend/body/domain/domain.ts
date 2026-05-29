// Composition Root der Frontend-Domaene.
//
// Hier werden der In-Memory-Store und der Domain State Provider erzeugt und in
// die RPUs injiziert. Store und Provider bleiben damit Implementierungsdetails
// der Domaene; nach aussen sind nur die RPUs sichtbar. Das Portal ruft
// ausschliesslich diese RPUs auf und kennt weder Store, Provider noch
// internen Zustand.

import { TaskspaceStateProvider } from "./providers/taskspaceStateProvider";
import { CommitTaskspaceRpu } from "./rpus/commitTaskspaceRpu";
import { GetAvailableTagsRpu } from "./rpus/getAvailableTagsRpu";
import { GetBookedMinutesByTaskRpu } from "./rpus/getBookedMinutesByTaskRpu";
import { GetDayCapacityRpu } from "./rpus/getDayCapacityRpu";
import { GetFilteredTreeTasksRpu } from "./rpus/getFilteredTreeTasksRpu";
import { GetPrioListRpu } from "./rpus/getPrioListRpu";
import { GetTaskMetricsRpu } from "./rpus/getTaskMetricsRpu";
import { GetTasksByParentRpu } from "./rpus/getTasksByParentRpu";
import { GetTaskspaceRpu } from "./rpus/getTaskspaceRpu";
import { GetVisibleBoardStatusesRpu } from "./rpus/getVisibleBoardStatusesRpu";
import { ImportTaskspaceRpu } from "./rpus/importTaskspaceRpu";
import { LoadTaskspaceRpu } from "./rpus/loadTaskspaceRpu";
import { SaveTaskspaceRpu } from "./rpus/saveTaskspaceRpu";
import { TaskspaceStore } from "./taskspaceStore";

export function createDomain() {
  const store = new TaskspaceStore();
  const stateProvider = new TaskspaceStateProvider();

  return {
    // Taskspace-weite RPUs (Persistenz-Kante / transitional)
    loadTaskspace: new LoadTaskspaceRpu(stateProvider, store),
    saveTaskspace: new SaveTaskspaceRpu(stateProvider),
    importTaskspace: new ImportTaskspaceRpu(store),
    getTaskspace: new GetTaskspaceRpu(store),
    commitTaskspace: new CommitTaskspaceRpu(store),

    // Query-RPUs (Kapazitaet)
    getBookedMinutesByTask: new GetBookedMinutesByTaskRpu(store),
    getDayCapacity: new GetDayCapacityRpu(store),

    // Query-RPUs (View-Modelle fuer Liste/Board/Hierarchie)
    getTaskMetrics: new GetTaskMetricsRpu(store),
    getTasksByParent: new GetTasksByParentRpu(store),
    getFilteredTreeTasks: new GetFilteredTreeTasksRpu(store),
    getAvailableTags: new GetAvailableTagsRpu(store),
    getVisibleBoardStatuses: new GetVisibleBoardStatusesRpu(store),
    getPrioList: new GetPrioListRpu(store)
  };
}

export type Domain = ReturnType<typeof createDomain>;
