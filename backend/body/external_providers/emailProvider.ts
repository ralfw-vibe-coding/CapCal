// External Provider: OTP-Mailversand ueber Resend.
//
// Ohne RESEND_API_KEY wird der Code stattdessen ins Serverlog geschrieben
// (lokale Entwicklung).

import { randomUUID } from "node:crypto";
import { getEnv } from "../env";

export class EmailProvider {
  async sendOtp(email: string, code: string): Promise<void> {
    const apiKey = getEnv("RESEND_API_KEY");
    const from = getEnv("AUTH_FROM_EMAIL") ?? "CapCal <onboarding@resend.dev>";
    if (!apiKey) {
      console.log(`[CapCal] OTP fuer ${email}: ${code}`);
      return;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID()
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "Dein CapCal Login-Code",
        text: `Dein CapCal Login-Code lautet: ${code}\n\nDer Code ist 5 Minuten gueltig.`
      })
    });
    if (!response.ok) throw new Error(`Resend error: ${await response.text()}`);
  }
}
