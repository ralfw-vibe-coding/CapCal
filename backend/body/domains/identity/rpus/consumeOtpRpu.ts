// Command-RPU (Identity): verifiziert einen OTP-Code und liefert den Nutzer.
// Wirft bei ungueltigem oder abgelaufenem Code.

import type { IdentityStore } from "../providers/identityStore";
import type { AuthUser } from "../types";
import type { Rpu } from "./rpu";

export type ConsumeOtpRequest = { email: string; token: string };

export class ConsumeOtpRpu implements Rpu<ConsumeOtpRequest, Promise<AuthUser>> {
  constructor(private readonly store: IdentityStore) {}

  async process(request: ConsumeOtpRequest): Promise<AuthUser> {
    await this.store.ensureSchema();
    const user = await this.store.consumeToken(request.email, request.token);
    if (!user) throw new Error("Der Code ist ungueltig oder abgelaufen.");
    return user;
  }
}
