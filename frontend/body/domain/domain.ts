// Composition Root der Frontend-Domaene.
//
// Hier wird der Domain State Provider erzeugt und in die RPUs injiziert. Der
// Provider bleibt damit ein Implementierungsdetail der Domaene; nach aussen
// sind nur die RPUs sichtbar. Das Portal ruft ausschliesslich diese RPUs auf
// und kennt weder Provider noch internen Zustand.

import { TaskspaceStateProvider } from "./providers/taskspaceStateProvider";
import { ImportTaskspaceRpu } from "./rpus/importTaskspaceRpu";
import { LoadTaskspaceRpu } from "./rpus/loadTaskspaceRpu";
import { SaveTaskspaceRpu } from "./rpus/saveTaskspaceRpu";

export function createDomain() {
  const stateProvider = new TaskspaceStateProvider();
  return {
    loadTaskspace: new LoadTaskspaceRpu(stateProvider),
    saveTaskspace: new SaveTaskspaceRpu(stateProvider),
    importTaskspace: new ImportTaskspaceRpu()
  };
}

export type Domain = ReturnType<typeof createDomain>;
