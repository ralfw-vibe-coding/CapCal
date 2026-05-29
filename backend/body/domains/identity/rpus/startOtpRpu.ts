// Command-RPU (Identity): bereitet eine OTP-Anmeldung vor.
//
// Stellt den Nutzer sicher (Upsert), erzeugt einen 6-stelligen Code und legt
// ein Token an. Liefert den Code zurueck, damit ein Reactor ihn per Mail
// versenden kann.

import { randomInt } from "node:crypto";
import type { IdentityStore } from "../providers/identityStore";
import type { Rpu } from "./rpu";

export type StartOtpRequest = { email: string };
export type StartOtpResponse = { email: string; code: string };

export class StartOtpRpu implements Rpu<StartOtpRequest, Promise<StartOtpResponse>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: StartOtpRequest): Promise<StartOtpResponse> {
    const email = request.email.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Bitte eine gueltige E-Mail-Adresse eingeben.");
    await this.store.ensureSchema();
    const user = await this.store.upsertUser(email);
    const code = randomInt(100000, 1000000).toString();
    await this.store.createToken(user.id, code);
    return { email, code };
  }
}
