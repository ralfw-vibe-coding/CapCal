// Reactor: orchestriert Anmeldung, Abmeldung und das Laden der Sitzung.
//
// Komponiert den AuthProvider (External) mit den Taskspace-RPUs der Domaene.
// Technologieagnostisch: kein React. Das Portal triggert diese Ablaeufe und
// rendert die Ergebnisse, ruft aber selbst weder Provider noch mehrere RPUs.

import type { AuthProvider } from "../external_providers/authProvider";
import type { LoadTaskspaceRpu } from "../domain/rpus/loadTaskspaceRpu";
import type { ResetTaskspaceRpu } from "../domain/rpus/resetTaskspaceRpu";
import type { AuthUser } from "../domain/types";

export type LoadSessionResult =
  | { kind: "ready"; user: AuthUser | null }
  | { kind: "unauthorized" };

export type VerifyOtpResult =
  | { kind: "ok"; user: AuthUser; loaded: boolean }
  | { kind: "error"; message: string };

export class SessionReactor {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly loadTaskspace: LoadTaskspaceRpu,
    private readonly resetTaskspace: ResetTaskspaceRpu
  ) {}

  // Beim Start: Taskspace laden; bei fehlender Anmeldung Login anfordern,
  // sonst zusaetzlich den angemeldeten Nutzer ermitteln.
  async loadSession(): Promise<LoadSessionResult> {
    const result = await this.loadTaskspace.process();
    if (result.kind === "unauthorized") return { kind: "unauthorized" };
    const user = await this.authProvider.me();
    return { kind: "ready", user };
  }

  async requestOtp(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await this.authProvider.requestOtp(email);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "OTP konnte nicht angefordert werden." };
    }
  }

  // Anmeldung verifizieren und unmittelbar den Taskspace laden.
  async verifyOtp(email: string, otp: string): Promise<VerifyOtpResult> {
    let user: AuthUser;
    try {
      user = await this.authProvider.verify(email, otp);
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : "Anmeldung fehlgeschlagen." };
    }
    const result = await this.loadTaskspace.process();
    return { kind: "ok", user, loaded: result.kind === "ok" };
  }

  // Abmelden und den lokalen Domaenenzustand leeren.
  async logout(): Promise<void> {
    try {
      await this.authProvider.logout();
    } finally {
      this.resetTaskspace.process();
    }
  }
}
