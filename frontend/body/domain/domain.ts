// Composition Root der Frontend-Domaene.
//
// Hier werden der In-Memory-Store und der Domain State Provider erzeugt und in
// die RPUs injiziert. Store und Provider bleiben damit Implementierungsdetails
// der Domaene; nach aussen sind nur die RPUs sichtbar. Das Portal ruft
// ausschliesslich diese RPUs auf und kennt weder Store, Provider noch
// internen Zustand.

import { TaskspaceStateProvider } from "./providers/taskspaceStateProvider";
import { CommitTaskspaceRpu } from "./rpus/commitTaskspaceRpu";
import { GetBookedMinutesByTaskRpu } from "./rpus/getBookedMinutesByTaskRpu";
import { GetTaskspaceRpu } from "./rpus/getTaskspaceRpu";
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
    getBookedMinutesByTask: new GetBookedMinutesByTaskRpu(store)
  };
}

export type Domain = ReturnType<typeof createDomain>;
