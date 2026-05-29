// Composition Root der Identity-Domaene.
//
// Erzeugt den IdentityStore und injiziert ihn in die Identity-RPUs. Nach
// aussen sind nur die RPUs sichtbar.

import { IdentityStore } from "./providers/identityStore";
import { ConsumeOtpRpu } from "./rpus/consumeOtpRpu";
import { FindUserByApiKeyRpu } from "./rpus/findUserByApiKeyRpu";
import { GetUserSettingsRpu } from "./rpus/getUserSettingsRpu";
import { RotateApiKeyRpu } from "./rpus/rotateApiKeyRpu";
import { StartOtpRpu } from "./rpus/startOtpRpu";
import { UpdateProfileRpu } from "./rpus/updateProfileRpu";

export function createIdentityDomain() {
  const store = new IdentityStore();
  return {
    startOtp: new StartOtpRpu(store),
    consumeOtp: new ConsumeOtpRpu(store),
    findUserByApiKey: new FindUserByApiKeyRpu(store),
    getUserSettings: new GetUserSettingsRpu(store),
    updateProfile: new UpdateProfileRpu(store),
    rotateApiKey: new RotateApiKeyRpu(store)
  };
}

export type IdentityDomain = ReturnType<typeof createIdentityDomain>;
