// Composition Root des Backend-Prozesses.
//
// Verdrahtet die Domaenen (taskspace-Persistenz, identity), die External
// Provider (Email) und die Reactors. Die Head-Portale (HTTP) konsumieren nur
// dieses Ergebnis: einzelne RPUs fuer simple Faelle, Reactors fuer Ablaeufe,
// die Provider und RPUs zusammenfassen. Session-Cookie-Krypto liegt separat im
// Head (head/session).

import { createBackendDomain } from "./domains/taskspace/domain";
import { createExternalCalendarDomain } from "./domains/externalCalendar/domain";
import { createIdentityDomain } from "./domains/identity/domain";
import { EmailProvider } from "./external_providers/emailProvider";
import { GoogleCalendarApiProvider } from "./external_providers/googleCalendarApiProvider";
import { GoogleCalendarReactor } from "./reactors/googleCalendarReactor";
import { RequestOtpReactor } from "./reactors/requestOtpReactor";

export function createBackendApp() {
  const taskspace = createBackendDomain();
  const identity = createIdentityDomain();
  const externalCalendar = createExternalCalendarDomain();

  const emailProvider = new EmailProvider();
  const googleApi = new GoogleCalendarApiProvider();

  const reactors = {
    requestOtp: new RequestOtpReactor(identity.startOtp, emailProvider),
    googleCalendar: new GoogleCalendarReactor(googleApi, externalCalendar)
  };

  return { taskspace, identity, externalCalendar, reactors };
}

export type BackendApp = ReturnType<typeof createBackendApp>;
