import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL est obligatoire");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
const schema = `ci_command_${randomUUID().replaceAll("-", "")}`;
const table = (name) => `"${schema}".${name}`;

async function execute(client, commandId, { fail = false } = {}) {
  try {
    await client.query("BEGIN");
    const existing = await client.query(`select receipt from ${table("receipts")} where command_id = $1`, [commandId]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0].receipt;
    }
    await client.query(`update ${table("state")} set effects = effects + 1 where singleton`);
    if (fail) throw new Error("injected fault");
    const receipt = { commandId, status: "accepted" };
    await client.query(`insert into ${table("receipts")}(command_id, receipt) values ($1, $2)`, [commandId, receipt]);
    await client.query("COMMIT");
    return receipt;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

await pool.query(`create schema "${schema}"`);
await pool.query(`create table ${table("state")}(singleton boolean primary key default true check(singleton), effects integer not null); insert into ${table("state")}(effects) values (0)`);
await pool.query(`create table ${table("receipts")}(command_id text primary key, receipt jsonb not null)`);
let firstConnection;
let secondConnection;
try {
  firstConnection = await pool.connect();
  secondConnection = await pool.connect();
  assert.notEqual(
    (await firstConnection.query("select pg_backend_pid() as pid")).rows[0].pid,
    (await secondConnection.query("select pg_backend_pid() as pid")).rows[0].pid,
    "le canari exige deux connexions PostgreSQL distinctes",
  );
  await assert.rejects(execute(firstConnection, `fault-${randomUUID()}`, { fail: true }), /injected fault/);
  assert.equal((await pool.query(`select effects from ${table("state")}`)).rows[0].effects, 0, "la faute doit annuler l'effet persistant");

  const commandId = `stable-${randomUUID()}`;
  const first = await execute(firstConnection, commandId);
  const second = await execute(secondConnection, commandId);
  assert.deepEqual(second, first, "deux connexions doivent rendre le même reçu");
  assert.equal((await pool.query(`select effects from ${table("state")}`)).rows[0].effects, 1, "le rejeu ne doit pas doubler l'effet");
  assert.equal((await pool.query(`select count(*)::int as count from ${table("receipts")} where command_id = $1`, [commandId])).rows[0].count, 1);
} finally {
  firstConnection?.release();
  secondConnection?.release();
  await pool.query(`drop schema "${schema}" cascade`);
  await pool.end();
}
