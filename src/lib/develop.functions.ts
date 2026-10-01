import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TABLES = [
  "menu_items",
  "orders",
  "stock_items",
  "expenses",
  "attendance",
  "plans",
  "profiles",
  "user_roles",
] as const;
const ROLES = ["admin", "barista", "customer", "developer"] as const;

type Ctx = { supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: never }) => PromiseLike<{ data: unknown; error: { message: string } | null }> }; userId: string };

async function assertDeveloper(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "developer" as never,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Khusus developer");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const devListRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ table: z.enum(TABLES) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { data: rows, error } = await sb
      .from(data.table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return JSON.stringify(rows ?? []);
  });

export const devSaveRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ table: z.enum(TABLES), row: z.record(z.string(), z.unknown()) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { error } = await sb.from(data.table).upsert(data.row as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const devDeleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ table: z.enum(TABLES), id: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { error } = await sb.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const devListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const { data: roles } = await sb.from("user_roles").select("user_id, role");
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => String(r.role)),
    }));
  });

export const devCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ email: z.string().email(), password: z.string().min(8).max(72), role: z.enum(ROLES) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { data: u, error } = await sb.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !u.user) throw new Error(error?.message ?? "Gagal");
    await sb.from("user_roles").upsert({ user_id: u.user.id, role: data.role as never }, { onConflict: "user_id,role" });
    return { ok: true };
  });

export const devSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const { error } = await sb.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const devSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(ROLES), on: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const sb = await admin();
    const q = data.on
      ? sb.from("user_roles").upsert({ user_id: data.userId, role: data.role as never }, { onConflict: "user_id,role" })
      : sb.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role as never);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const devDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    if (data.userId === context.userId) throw new Error("Tidak bisa menghapus akun sendiri");
    const sb = await admin();
    const { error } = await sb.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const devBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const { createBackup } = await import("./develop.server");
    return createBackup("manual");
  });

export const devListBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const { listBackups } = await import("./develop.server");
    return listBackups();
  });

export const devRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ fileId: z.string().min(5) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertDeveloper(context as unknown as Ctx);
    const { restoreBackup } = await import("./develop.server");
    return restoreBackup(data.fileId);
  });
