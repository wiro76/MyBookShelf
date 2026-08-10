import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import { LibraryGroupsError, validateAssignThemeInput, validateCreateGroupInput, validateCreateThemeInput, validateRemoveGroupMemberInput, validateRemoveThemeMemberInput, type LibraryGroup, type LibraryTheme } from "../domain/library-groups";
import { groupMemberRemovalDigest, groupRequestDigest, themeAssignmentDigest, themeMemberRemovalDigest, themeRequestDigest, type LibraryGroupReceipt, type LibraryGroupsRepository, type LibraryMembershipReceipt, type LibraryThemeReceipt } from "../application/library-groups";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;
const iso = (value: Date | string) => new Date(value).toISOString();

async function loadGroup(client: PoolClient, userId: string, groupId: string): Promise<LibraryGroup> {
  const result = await client.query<{ id: string; name: string; group_order: number; copy_id: string | null; status: "want-to-read" | "in-progress" | "completed" | null }>(`select groups.id, groups.name, groups.group_order, members.copy_id, placements.status from library.library_groups groups left join library.library_group_members members on members.group_id = groups.id and members.user_id = groups.user_id left join library.placements placements on placements.copy_id = members.copy_id and placements.user_id = groups.user_id where groups.user_id = $1 and groups.id = $2 order by members.member_order`, [userId, groupId]);
  if (!result.rows[0]) throw new LibraryGroupsError("LIBRARY_GROUP_NOT_FOUND");
  const statusCounts = { "want-to-read": 0, "in-progress": 0, completed: 0 } as Record<LibraryGroup["statusCounts"] extends Readonly<Record<infer K, number>> ? K : never, number>;
  for (const row of result.rows) if (row.status) statusCounts[row.status] += 1;
  return { id: result.rows[0].id, name: result.rows[0].name, groupOrder: result.rows[0].group_order, copyIds: result.rows.flatMap((row) => row.copy_id ? [row.copy_id] : []), statusCounts };
}

async function loadTheme(client: PoolClient, userId: string, themeId: string): Promise<LibraryTheme> {
  const result = await client.query<{ id: string; name: string; label: string; icon: string | null; pattern: string | null; color: string | null; copy_id: string | null }>(`select themes.id, themes.name, themes.label, themes.icon, themes.pattern, themes.color, members.copy_id from library.library_themes themes left join library.library_theme_members members on members.theme_id = themes.id and members.user_id = themes.user_id where themes.user_id = $1 and themes.id = $2 order by members.copy_id`, [userId, themeId]);
  if (!result.rows[0]) throw new LibraryGroupsError("LIBRARY_THEME_NOT_FOUND");
  const row = result.rows[0];
  return { id: row.id, name: row.name, label: row.label, icon: row.icon, pattern: row.pattern, color: row.color, copyIds: result.rows.flatMap((item) => item.copy_id ? [item.copy_id] : []) };
}

const assertCopies = async (client: PoolClient, userId: string, copyIds: readonly string[]) => {
  const result = await client.query<{ id: string }>("select id from library.copies where user_id = $1 and id = any($2::uuid[]) for update", [userId, copyIds]);
  if (result.rows.length !== copyIds.length) throw new LibraryGroupsError("LIBRARY_GROUP_COPY_NOT_FOUND");
};

export function createPostgresLibraryGroupsRepository(transaction: Transaction = authenticatedTransaction): LibraryGroupsRepository {
  return {
    listGroups(userId) {
      if (!UUID.test(userId)) return Promise.reject(new LibraryGroupsError());
      return transaction(userId, async (client) => {
        const rows = await client.query<{ id: string }>("select id from library.library_groups where user_id = $1 order by group_order, id", [userId]);
        return Promise.all(rows.rows.map((row) => loadGroup(client, userId, row.id)));
      });
    },
    listThemes(userId) {
      if (!UUID.test(userId)) return Promise.reject(new LibraryGroupsError());
      return transaction(userId, async (client) => {
        const rows = await client.query<{ id: string }>("select id from library.library_themes where user_id = $1 order by name, id", [userId]);
        return Promise.all(rows.rows.map((row) => loadTheme(client, userId, row.id)));
      });
    },
    createGroup(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryGroupsError());
      const input = validateCreateGroupInput(rawInput);
      const requestSha = groupRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':library-groups', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; group_id: string; created_at: Date | string }>("select request_sha256, group_id, created_at from library.library_group_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== requestSha) throw new LibraryGroupsError("LIBRARY_GROUP_COMMAND_REUSED");
          return { commandId, commandType: "library.group.create", status: "replayed", group: await loadGroup(client, userId, replay.rows[0].group_id), confirmedAt: iso(replay.rows[0].created_at) } satisfies LibraryGroupReceipt;
        }
        await assertCopies(client, userId, input.copyIds);
        const group = await client.query<{ id: string; created_at: Date | string }>("insert into library.library_groups (user_id, name, group_order) select $1, $2, coalesce(max(group_order), -1) + 1 from library.library_groups where user_id = $1 returning id, created_at", [userId, input.name]);
        for (const [memberOrder, copyId] of input.copyIds.entries()) await client.query("insert into library.library_group_members (user_id, group_id, copy_id, member_order) values ($1, $2, $3, $4)", [userId, group.rows[0].id, copyId, memberOrder]);
        await client.query("insert into library.library_group_receipts (user_id, command_id, request_sha256, group_id, created_at) values ($1, $2, $3, $4, $5)", [userId, commandId, requestSha, group.rows[0].id, group.rows[0].created_at]);
        return { commandId, commandType: "library.group.create", status: "confirmed", group: await loadGroup(client, userId, group.rows[0].id), confirmedAt: iso(group.rows[0].created_at) } satisfies LibraryGroupReceipt;
      });
    },
    createTheme(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryGroupsError());
      const input = validateCreateThemeInput(rawInput);
      const requestSha = themeRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':library-groups', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; theme_id: string; created_at: Date | string }>("select request_sha256, theme_id, created_at from library.library_theme_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== requestSha) throw new LibraryGroupsError("LIBRARY_THEME_COMMAND_REUSED");
          return { commandId, commandType: "library.theme.create", status: "replayed", theme: await loadTheme(client, userId, replay.rows[0].theme_id), confirmedAt: iso(replay.rows[0].created_at) } satisfies LibraryThemeReceipt;
        }
        const theme = await client.query<{ id: string; created_at: Date | string }>("insert into library.library_themes (user_id, name, label, icon, pattern, color) values ($1, $2, $3, $4, $5, $6) returning id, created_at", [userId, input.name, input.label, input.icon, input.pattern, input.color]);
        await client.query("insert into library.library_theme_receipts (user_id, command_id, request_sha256, theme_id, command_type, created_at) values ($1, $2, $3, $4, 'create', $5)", [userId, commandId, requestSha, theme.rows[0].id, theme.rows[0].created_at]);
        return { commandId, commandType: "library.theme.create", status: "confirmed", theme: await loadTheme(client, userId, theme.rows[0].id), confirmedAt: iso(theme.rows[0].created_at) } satisfies LibraryThemeReceipt;
      });
    },
    assignTheme(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryGroupsError());
      const input = validateAssignThemeInput(rawInput);
      const requestSha = themeAssignmentDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':library-groups', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; theme_id: string; created_at: Date | string }>("select request_sha256, theme_id, created_at from library.library_theme_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== requestSha) throw new LibraryGroupsError("LIBRARY_THEME_COMMAND_REUSED");
          return { commandId, commandType: "library.theme.assign", status: "replayed", theme: await loadTheme(client, userId, replay.rows[0].theme_id), confirmedAt: iso(replay.rows[0].created_at) } satisfies LibraryThemeReceipt;
        }
        await client.query("select id from library.library_themes where user_id = $1 and id = $2 for update", [userId, input.themeId]);
        await assertCopies(client, userId, input.copyIds);
        for (const copyId of input.copyIds) await client.query("insert into library.library_theme_members (user_id, theme_id, copy_id) values ($1, $2, $3) on conflict do nothing", [userId, input.themeId, copyId]);
        const createdAt = new Date();
        await client.query("insert into library.library_theme_receipts (user_id, command_id, request_sha256, theme_id, command_type, created_at) values ($1, $2, $3, $4, 'assign', $5)", [userId, commandId, requestSha, input.themeId, createdAt]);
        return { commandId, commandType: "library.theme.assign", status: "confirmed", theme: await loadTheme(client, userId, input.themeId), confirmedAt: createdAt.toISOString() } satisfies LibraryThemeReceipt;
      });
    },
    removeGroupMember(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryGroupsError());
      const input = validateRemoveGroupMemberInput(rawInput);
      const requestSha = groupMemberRemovalDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':library-groups', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; target_id: string; copy_id: string; created_at: Date | string }>("select request_sha256, target_id, copy_id, created_at from library.library_membership_removal_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== requestSha) throw new LibraryGroupsError("LIBRARY_GROUP_COMMAND_REUSED");
          return { commandId, commandType: "library.group.remove-member", status: "replayed", targetId: replay.rows[0].target_id, copyId: replay.rows[0].copy_id, confirmedAt: iso(replay.rows[0].created_at) } satisfies LibraryMembershipReceipt;
        }
        await client.query("select id from library.library_groups where user_id = $1 and id = $2 for update", [userId, input.groupId]);
        const deleted = await client.query("delete from library.library_group_members where user_id = $1 and group_id = $2 and copy_id = $3", [userId, input.groupId, input.copyId]);
        if (deleted.rowCount !== 1) throw new LibraryGroupsError("LIBRARY_GROUP_MEMBER_NOT_FOUND");
        await client.query("delete from library.library_groups groups where groups.user_id = $1 and groups.id = $2 and not exists (select 1 from library.library_group_members members where members.user_id = groups.user_id and members.group_id = groups.id)", [userId, input.groupId]);
        const createdAt = new Date();
        await client.query("insert into library.library_membership_removal_receipts (user_id, command_id, request_sha256, target_type, target_id, copy_id, created_at) values ($1, $2, $3, 'group', $4, $5, $6)", [userId, commandId, requestSha, input.groupId, input.copyId, createdAt]);
        return { commandId, commandType: "library.group.remove-member", status: "confirmed", targetId: input.groupId, copyId: input.copyId, confirmedAt: createdAt.toISOString() } satisfies LibraryMembershipReceipt;
      });
    },
    removeThemeMember(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryGroupsError());
      const input = validateRemoveThemeMemberInput(rawInput);
      const requestSha = themeMemberRemovalDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':library-groups', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; target_id: string; copy_id: string; created_at: Date | string }>("select request_sha256, target_id, copy_id, created_at from library.library_membership_removal_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== requestSha) throw new LibraryGroupsError("LIBRARY_THEME_COMMAND_REUSED");
          return { commandId, commandType: "library.theme.remove-member", status: "replayed", targetId: replay.rows[0].target_id, copyId: replay.rows[0].copy_id, confirmedAt: iso(replay.rows[0].created_at) } satisfies LibraryMembershipReceipt;
        }
        await client.query("select id from library.library_themes where user_id = $1 and id = $2 for update", [userId, input.themeId]);
        const deleted = await client.query("delete from library.library_theme_members where user_id = $1 and theme_id = $2 and copy_id = $3", [userId, input.themeId, input.copyId]);
        if (deleted.rowCount !== 1) throw new LibraryGroupsError("LIBRARY_THEME_MEMBER_NOT_FOUND");
        const createdAt = new Date();
        await client.query("insert into library.library_membership_removal_receipts (user_id, command_id, request_sha256, target_type, target_id, copy_id, created_at) values ($1, $2, $3, 'theme', $4, $5, $6)", [userId, commandId, requestSha, input.themeId, input.copyId, createdAt]);
        return { commandId, commandType: "library.theme.remove-member", status: "confirmed", targetId: input.themeId, copyId: input.copyId, confirmedAt: createdAt.toISOString() } satisfies LibraryMembershipReceipt;
      });
    },
  };
}
