// Typen der Identity-Domaene (Nutzer, Profil, Einstellungen).

export type AuthUser = {
  id: number;
  email: string;
};

export type UserProfile = {
  name?: string;
  initials?: string;
  timezone?: string;
};

export type UserSettings = {
  user: AuthUser;
  profile: UserProfile;
  apiKeyMasked?: string;
  apiKeyLastUsedAt?: string;
};
