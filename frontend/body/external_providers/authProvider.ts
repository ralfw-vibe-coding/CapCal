// External Provider: Proxy auf die Auth-Endpunkte des Backends.
//
// Auth ist nicht Teil der Domaene. Dieser Provider kapselt die HTTP-Aufrufe;
// aufgerufen wird er ausschliesslich von Reactors, nie vom Portal.

import type { AuthUser } from "../domain/types";

export class AuthProvider {
  async me(): Promise<AuthUser | null> {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) return null;
    return ((await response.json()) as { user: AuthUser }).user;
  }

  async requestOtp(email: string): Promise<void> {
    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async verify(email: string, otp: string): Promise<AuthUser> {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, otp })
    });
    if (!response.ok) throw new Error(await response.text());
    return ((await response.json()) as { user: AuthUser }).user;
  }

  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  }
}
