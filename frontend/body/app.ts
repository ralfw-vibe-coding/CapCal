// Composition Root des Frontend-Prozesses.
//
// Verdrahtet die Domaene (Store + RPUs), die External Provider und die
// Reactors. Das Portal konsumiert nur das Ergebnis: einzelne RPUs fuer simple
// Trigger (View-/Zustandsabfragen, einfache Commands) und Reactors fuer
// Ablaeufe, die Provider und/oder mehrere RPUs zusammenfassen.

import { createDomain } from "./domain/domain";
import { AuthProvider } from "./external_providers/authProvider";
import { SessionReactor } from "./reactors/sessionReactor";

export function createApp() {
  const domain = createDomain();

  const authProvider = new AuthProvider();

  const reactors = {
    session: new SessionReactor(authProvider, domain.loadTaskspace, domain.resetTaskspace)
  };

  return { domain, reactors };
}

export type App = ReturnType<typeof createApp>;
