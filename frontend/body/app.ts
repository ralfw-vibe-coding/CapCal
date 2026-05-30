// Composition Root des Frontend-Prozesses.
//
// Verdrahtet die Domaene (Store + RPUs), die External Provider und die
// Reactors. Das Portal konsumiert nur das Ergebnis: einzelne RPUs fuer simple
// Trigger (View-/Zustandsabfragen, einfache Commands) und Reactors fuer
// Ablaeufe, die Provider und/oder mehrere RPUs zusammenfassen.

import { createDomain } from "./domain/domain";
import { AuthProvider } from "./external_providers/authProvider";
import { GoogleCalendarProvider } from "./external_providers/googleCalendarProvider";
import { ICloudCalendarProvider } from "./external_providers/icloudCalendarProvider";
import { UserSettingsProvider } from "./external_providers/userSettingsProvider";
import { ExternalCalendarReactor } from "./reactors/externalCalendarReactor";
import { SessionReactor } from "./reactors/sessionReactor";
import { UserSettingsReactor } from "./reactors/userSettingsReactor";

export function createApp() {
  const domain = createDomain();

  const authProvider = new AuthProvider();
  const userSettingsProvider = new UserSettingsProvider();
  const googleCalendarProvider = new GoogleCalendarProvider();
  const icloudCalendarProvider = new ICloudCalendarProvider();

  const reactors = {
    session: new SessionReactor(authProvider, domain.loadTaskspace, domain.resetTaskspace),
    userSettings: new UserSettingsReactor(userSettingsProvider),
    externalCalendar: new ExternalCalendarReactor(googleCalendarProvider, icloudCalendarProvider)
  };

  return { domain, reactors };
}

export type App = ReturnType<typeof createApp>;
