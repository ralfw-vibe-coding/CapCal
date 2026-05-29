// Composition Root der Backend-Domaene (Persistenz).
//
// Erzeugt den Domain State Provider und injiziert ihn in die Persistenz-RPUs.
// Die Head-Portale (HTTP) rufen nur diese RPUs.

import { createStateProvider } from "./providers/stateProvider";
import { LoadStateRpu } from "./rpus/loadStateRpu";
import { SaveStateRpu } from "./rpus/saveStateRpu";

export function createBackendDomain() {
  const stateProvider = createStateProvider();
  return {
    loadState: new LoadStateRpu(stateProvider),
    saveState: new SaveStateRpu(stateProvider)
  };
}

export type BackendDomain = ReturnType<typeof createBackendDomain>;
