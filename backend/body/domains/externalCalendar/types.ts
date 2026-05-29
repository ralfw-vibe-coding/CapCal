// Typen der External-Calendar-Domaene (Verbindungs-Settings).

import type { ExternalCalendarItem } from "./providers/calendarCache";

export type { ExternalCalendarItem };

// Interne Verbindung inkl. entschluesseltem Refresh-Token (nur fuer Reactors).
export type GoogleConnection = {
  connected: boolean;
  googleEmail?: string;
  refreshToken?: string;
  calendars: ExternalCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};

// Oeffentliche Sicht (ohne Token), wie sie das Frontend erhaelt.
export type PublicCalendarStatus = {
  connected: boolean;
  googleEmail?: string;
  appleId?: string;
  calendars: ExternalCalendarItem[];
  connectedAt?: string;
  updatedAt?: string;
};
