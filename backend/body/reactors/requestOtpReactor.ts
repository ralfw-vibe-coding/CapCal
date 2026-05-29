// Reactor (Backend): orchestriert die OTP-Anforderung.
//
// Komponiert die Identity-RPU StartOtp (Nutzer + Token) mit dem Email-Provider
// (Versand). Technologieagnostisch; die HTTP-Schicht ruft nur diesen Reactor.

import type { StartOtpRpu } from "../domains/identity/rpus/startOtpRpu";
import type { EmailProvider } from "../external_providers/emailProvider";

export class RequestOtpReactor {
  constructor(
    private readonly startOtp: StartOtpRpu,
    private readonly emailProvider: EmailProvider
  ) {}

  async process(email: string): Promise<void> {
    const result = await this.startOtp.process({ email });
    await this.emailProvider.sendOtp(result.email, result.code);
  }
}
