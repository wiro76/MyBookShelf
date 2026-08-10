import { createClient } from "@supabase/supabase-js";
import { requireMediaStorageEnvironment, requireRuntimeEnvironment } from "@/shared/config/environment";
import type { PersonalCoverObjectStore } from "../application/store-personal-cover";
import type { PrivateMediaStorage } from "../application/resolve-cover-url";

export function createSupabasePrivateMediaStorage(source: NodeJS.ProcessEnv = process.env): PrivateMediaStorage & PersonalCoverObjectStore {
  const { supabaseUrl } = requireRuntimeEnvironment(source);
  const { bucket, serviceRoleKey } = requireMediaStorageEnvironment(source);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  return {
    async putObject(objectKey, bytes, contentType) {
      const { error } = await client.storage.from(bucket).upload(objectKey, bytes, { contentType, upsert: true });
      if (error) throw new Error("MEDIA_OBJECT_UPLOAD_UNAVAILABLE");
    },
    async createSignedUrl(objectKey, expiresInSeconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(objectKey, expiresInSeconds);
      if (error || !data?.signedUrl) throw new Error("MEDIA_SIGNED_URL_UNAVAILABLE");
      return data.signedUrl;
    },
  };
}
