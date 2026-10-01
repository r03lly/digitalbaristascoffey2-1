// Server-only helpers for developer tools: full backup/restore to Google Drive.
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
export const BACKUP_TABLES = [
  "menu_items",
  "orders",
  "stock_items",
  "expenses",
  "attendance",
  "plans",
  "profiles",
  "user_roles",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
const BUCKET = "menu-images";
const FOLDER_NAME = "Scoffey Backups";

function headers(extra: Record<string, string> = {}) {
  const lk = process.env["LOVABLE_API_KEY"];
  const ck = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !ck) throw new Error("Google Drive belum tersambung");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": ck, ...extra };
}

async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: headers((init.headers as Record<string, string>) ?? {}),
  });
  if (!res.ok) throw new Error(`Google Drive [${res.status}]: ${await res.text()}`);
  return res;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function folderId(): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = (await (await drive(`/drive/v3/files?q=${q}&fields=files(id)`)).json()) as {
    files: { id: string }[];
  };
  if (found.files[0]) return found.files[0].id;
  const created = (await (
    await drive(`/drive/v3/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    })
  ).json()) as { id: string };
  return created.id;
}

async function listAllImages(sb: Awaited<ReturnType<typeof admin>>, prefix = ""): Promise<string[]> {
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  const out: string[] = [];
  for (const f of data ?? []) {
    const path = prefix ? `${prefix}/${f.name}` : f.name;
    if (f.id) out.push(path);
    else out.push(...(await listAllImages(sb, path)));
  }
  return out;
}

export async function createBackup(trigger: "manual" | "auto") {
  const sb = await admin();
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select("*").range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[t] = rows;
  }
  const images: { path: string; type: string; data: string }[] = [];
  for (const path of await listAllImages(sb)) {
    const { data } = await sb.storage.from(BUCKET).download(path);
    if (!data) continue;
    images.push({
      path,
      type: data.type || "application/octet-stream",
      data: Buffer.from(await data.arrayBuffer()).toString("base64"),
    });
  }
  const payload = JSON.stringify({ version: 1, created_at: new Date().toISOString(), trigger, tables, images });
  const stamp = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const name = `scoffey-backup-${stamp}-${trigger}.json`;
  const parent = await folderId();
  const boundary = "scoffeyboundary" + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [parent], mimeType: "application/json" }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;
  const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,name,size`, {
    method: "POST",
    headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }),
    body,
  });
  if (!res.ok) throw new Error(`Google Drive [${res.status}]: ${await res.text()}`);
  const file = (await res.json()) as { id: string; name: string; size?: string };
  return { ...file, rows: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), images: images.length };
}

export async function listBackups() {
  const parent = await folderId();
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const r = (await (
    await drive(`/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=50&fields=files(id,name,size,createdTime)`)
  ).json()) as { files: { id: string; name: string; size?: string; createdTime: string }[] };
  return r.files;
}

export async function restoreBackup(fileId: string) {
  const res = await drive(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  const backup = (await res.json()) as {
    tables: Record<string, Record<string, unknown>[]>;
    images?: { path: string; type: string; data: string }[];
  };
  const sb = await admin();
  const summary: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows = backup.tables?.[t];
    if (!rows) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const conflict = t === "user_roles" ? "user_id,role" : "id";
      // Lewati baris yang terhubung ke akun yang tidak ada lagi.
      const { error } = await sb.from(t).upsert(chunk as never, { onConflict: conflict });
      if (error) {
        for (const row of chunk) await sb.from(t).upsert(row as never, { onConflict: conflict });
      }
    }
    summary[t] = rows.length;
  }
  let imgs = 0;
  for (const img of backup.images ?? []) {
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(img.path, Buffer.from(img.data, "base64"), { contentType: img.type, upsert: true });
    if (!error) imgs++;
  }
  return { summary, images: imgs };
}
