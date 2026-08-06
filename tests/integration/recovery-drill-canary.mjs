import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { createBackupPoint, createFilesystemBackupStore } from "../../scripts/recovery/create-backup.mjs";
import { restoreBackupPoint } from "../../scripts/recovery/restore-backup.mjs";
import { sha256Bytes } from "../../scripts/recovery/manifest.mjs";
import {
  createSupabaseDatabasePort,
  createSupabaseStoragePort,
  recoveryCliVersion,
} from "../../scripts/recovery/supabase-ports.mjs";

const { Client } = pg;
const required = [
  "RECOVERY_SOURCE_DATABASE_URL", "RECOVERY_SOURCE_API_URL", "RECOVERY_SOURCE_SERVICE_ROLE_KEY",
  "RECOVERY_SOURCE_ANON_KEY", "RECOVERY_SOURCE_CONTAINER", "RECOVERY_TARGET_DATABASE_URL",
  "RECOVERY_TARGET_API_URL", "RECOVERY_TARGET_SERVICE_ROLE_KEY", "RECOVERY_TARGET_ANON_KEY",
  "RECOVERY_TARGET_CONTAINER", "RECOVERY_WORK_DIRECTORY",
];
for (const name of required) assert.ok(process.env[name], `${name} est obligatoire`);

const source = {
  databaseUrl: process.env.RECOVERY_SOURCE_DATABASE_URL,
  apiUrl: process.env.RECOVERY_SOURCE_API_URL,
  serviceKey: process.env.RECOVERY_SOURCE_SERVICE_ROLE_KEY,
  anonKey: process.env.RECOVERY_SOURCE_ANON_KEY,
  container: process.env.RECOVERY_SOURCE_CONTAINER,
};
const target = {
  databaseUrl: process.env.RECOVERY_TARGET_DATABASE_URL,
  apiUrl: process.env.RECOVERY_TARGET_API_URL,
  serviceKey: process.env.RECOVERY_TARGET_SERVICE_ROLE_KEY,
  anonKey: process.env.RECOVERY_TARGET_ANON_KEY,
  container: process.env.RECOVERY_TARGET_CONTAINER,
};
const workDirectory = process.env.RECOVERY_WORK_DIRECTORY;
const backupRoot = join(workDirectory, "backup-points");
const proofPath = join(workDirectory, "proofs", "latest.json");
await mkdir(backupRoot, { recursive: true });

const query = async (databaseUrl, text, values = []) => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
};
const sourceClient = createClient(source.apiUrl, source.serviceKey, { auth: { persistSession: false } });
const targetAnonClient = createClient(target.apiUrl, target.anonKey, { auth: { persistSession: false } });
const email = `recovery-${randomUUID()}@example.invalid`;
const password = `R-${randomUUID()}-aA9!`;
const created = await sourceClient.auth.admin.createUser({ email, password, email_confirm: true });
assert.equal(created.error, null, created.error?.message);
const ownerId = created.data.user.id;
const bucket = "recovery-private";
const expectedObjects = [
  { key: "nested/content.bin", bytes: Buffer.from("my-bookshelf-recovery-canary") },
  { key: "empty.bin", bytes: Buffer.alloc(0) },
].map((object) => ({ ...object, sha256: sha256Bytes(object.bytes) }));

await query(source.databaseUrl, `
  create schema recovery_canary;
  create table recovery_canary.records (
    id uuid primary key,
    owner_id uuid not null references auth.users(id),
    payload text not null,
    object_key text not null,
    object_sha256 text not null check (object_sha256 ~ '^[a-f0-9]{64}$')
  );
  alter table recovery_canary.records enable row level security;
  create policy own_records on recovery_canary.records
    for select to authenticated using (owner_id = (select auth.uid()));
  grant usage on schema recovery_canary to authenticated;
  grant select on recovery_canary.records to authenticated;
`, []);
const recordId = randomUUID();
await query(
  source.databaseUrl,
  "insert into recovery_canary.records(id, owner_id, payload, object_key, object_sha256) values ($1, $2, $3, $4, $5)",
  [recordId, ownerId, "snapshot-v1", expectedObjects[0].key, expectedObjects[0].sha256],
);

assert.equal((await sourceClient.storage.createBucket(bucket, { public: false })).error, null);
for (const object of expectedObjects) {
  const { error } = await sourceClient.storage.from(bucket).upload(object.key, object.bytes, {
    contentType: "application/octet-stream",
  });
  assert.equal(error, null, error?.message);
}

const historyBefore = (await query(source.databaseUrl, "select version from supabase_migrations.schema_migrations order by version")).rows.map(({ version }) => version);
const backupId = randomUUID();
const backup = await createBackupPoint({
  backupId,
  sourceEnvironment: "local",
  sourceFingerprint: "local-recovery-source-v1",
  pitrAvailable: false,
  sourceDatabaseUrl: source.databaseUrl,
}, {
  barrier: { async assertActive() {} },
  database: createSupabaseDatabasePort({
    sourceDatabaseUrl: source.databaseUrl,
    sourceContainer: source.container,
    targetContainer: target.container,
    targetFingerprint: "local-recovery-target-v1",
  }),
  storage: createSupabaseStoragePort({
    apiUrl: source.apiUrl,
    serviceRoleKey: source.serviceKey,
    databaseUrl: source.databaseUrl,
  }),
  store: createFilesystemBackupStore(backupRoot),
});
assert.equal(backup.manifest.supabaseCliVersion, recoveryCliVersion);

await query(source.databaseUrl, "update recovery_canary.records set payload = 'source-mutated' where id = $1", [recordId]);
await sourceClient.storage.from(bucket).remove(expectedObjects.map(({ key }) => key));

const restored = await restoreBackupPoint({
  pointDirectory: backup.pointDirectory,
  proofPath,
  sourceFingerprint: "local-recovery-source-v1",
  targetFingerprint: "local-recovery-target-v1",
  targetEnvironment: "local",
}, {
  database: createSupabaseDatabasePort({
    sourceDatabaseUrl: source.databaseUrl,
    sourceContainer: source.container,
    targetContainer: target.container,
    targetFingerprint: "local-recovery-target-v1",
    assertTarget: async () => {
      const state = await query(target.databaseUrl, `select
        to_regclass('recovery_canary.records') is null as schema_empty,
        to_regclass('supabase_migrations.schema_migrations') as history_table
      `);
      const historyEmpty = state.rows[0].history_table === null ||
        (await query(target.databaseUrl, "select count(*) = 0 as empty from supabase_migrations.schema_migrations")).rows[0].empty;
      return state.rows[0].schema_empty && historyEmpty;
    },
    verifyTarget: async () => {
      const record = await query(target.databaseUrl, "select owner_id, payload, object_key, object_sha256 from recovery_canary.records where id = $1", [recordId]);
      assert.deepEqual(record.rows, [{
        owner_id: ownerId,
        payload: "snapshot-v1",
        object_key: expectedObjects[0].key,
        object_sha256: expectedObjects[0].sha256,
      }]);
      const referenced = backup.manifest.objects.find(({ bucket: manifestBucket, key }) => manifestBucket === bucket && key === record.rows[0].object_key);
      assert.equal(referenced?.sha256, record.rows[0].object_sha256);
      const history = (await query(target.databaseUrl, "select version from supabase_migrations.schema_migrations order by version")).rows.map(({ version }) => version);
      assert.deepEqual(history, historyBefore);
      const authUsers = await query(target.databaseUrl, "select count(*)::int as count from auth.users where id = $1", [ownerId]);
      assert.equal(authUsers.rows[0].count, 1);
      const buckets = await query(target.databaseUrl, "select public from storage.buckets where id = $1", [bucket]);
      assert.deepEqual(buckets.rows, [{ public: false }]);
      const visible = async (identity) => {
        const client = new Client({ connectionString: target.databaseUrl });
        await client.connect();
        try {
          await client.query("begin");
          await client.query("set local role authenticated");
          await client.query("select set_config('request.jwt.claim.sub', $1, true)", [identity]);
          const result = await client.query("select count(*)::int as count from recovery_canary.records");
          await client.query("rollback");
          return result.rows[0].count;
        } finally {
          await client.end();
        }
      };
      assert.equal(await visible(ownerId), 1);
      assert.equal(await visible(randomUUID()), 0);
      const signIn = await targetAnonClient.auth.signInWithPassword({ email, password });
      assert.equal(signIn.error, null, signIn.error?.message);
      assert.equal(signIn.data.user?.id, ownerId);
      return { dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true };
    },
  }),
  storage: createSupabaseStoragePort({
    apiUrl: target.apiUrl,
    serviceRoleKey: target.serviceKey,
    databaseUrl: target.databaseUrl,
    reconcileMetadata: true,
  }),
  proofStore: createFilesystemBackupStore(backupRoot),
  cleanupTarget: async () => {
    await query(target.databaseUrl, `
      drop schema if exists recovery_canary cascade;
      truncate table auth.identities, auth.users, storage.objects, storage.buckets cascade;
      drop schema if exists supabase_migrations cascade;
    `);
  },
});
assert.equal(restored.proof.verdict, "passed");
process.stdout.write(`RECOVERY_DRILL_PASSED ${backup.manifestSha256} ${restored.proof.durationMs}ms\n`);
