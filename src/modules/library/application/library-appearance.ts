import { validateAppearancePreference, type AppearancePreference } from "../domain/library-appearance";

export type StoredAppearancePreference = AppearancePreference & Readonly<{ version: number; updatedAt: string }>;

export interface LibraryAppearanceRepository {
  load(userId: string): Promise<StoredAppearancePreference | null>;
  save(userId: string, preference: AppearancePreference, requestId: string): Promise<StoredAppearancePreference>;
}

export function validateAppearanceCommand(input: unknown): AppearancePreference {
  return validateAppearancePreference(input);
}
