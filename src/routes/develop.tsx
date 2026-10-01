import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CloudUpload,
  Database,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { useBarista } from "@/lib/barista-store";
import {
  devBackupNow,
  devCreateUser,
  devDeleteRow,
  devDeleteUser,
  devListBackups,
  devListRows,
  devListUsers,
  devRestore,
  devSaveRow,
  devSetPassword,
  devSetRole,
} from "@/lib/develop.functions";

export const Route = createFileRoute("/develop")({
  head: () => ({
    meta: [
      { title: "Panel Developer — Digital Barista by Scoffey" },
      { name: "description", content: "Panel developer Scoffey: kelola semua data, akun, serta backup dan restore ke Google Drive." },
      { property: "og:title", content: "Panel Developer — Digital Barista by Scoffey" },
      { property: "og:description", content: "Kelola data, akun, dan backup Scoffey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevelopPage,
});

const TABLES = [
  { id: "menu_items", label: "Menu" },
  { id: "orders", label: "Pesanan" },
  { id: "stock_items", label: "Stok" },
  { id: "expenses", label: "Pengeluaran" },
  { id: "attendance", label: "Presensi" },
  { id: "plans", label: "Langganan" },
  { id: "profiles", label: "Profil" },
  { id: "user_roles", label: "Peran" },
] as const;
type TableId = (typeof TABLES)[number]["id"];
const ROLES = ["admin", "barista", "customer", "developer"] as const;
type Tab = "data" | "users" | "backup";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function DevelopPage() {
  const { authReady, roles } = useBarista();
  const [isDev, setIsDev] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("data");
  const listUsers = useServerFn(devListUsers);

  // Akses ditentukan server: panggilan gagal = bukan developer.
  useEffect(() => {
    if (!authReady) return;
    listUsers()
      .then(() => setIsDev(true))
      .catch(() => setIsDev(false));
  }, [authReady, listUsers, roles]);

  if (!authReady || isDev === null) {
    return (
      <PhoneShell title="PANEL DEVELOPER">
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </p>
      </PhoneShell>
    );
  }
  if (!isDev) {
    return (
      <PhoneShell title="PANEL DEVELOPER">
        <p className="mt-4 text-sm text-muted-foreground">Halaman ini khusus untuk akun developer.</p>
        <Link to="/auth" className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary">
          Masuk sebagai developer
        </Link>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell title="PANEL DEVELOPER" back="/profile">
      <p className="mt-3 text-sm text-muted-foreground">
        Kendali penuh: ubah semua data, kelola akun, serta backup & restore ke Google Drive.
      </p>
      <div role="tablist" className="mt-4 grid grid-cols-3 rounded-full border border-border bg-card/60 p-1">
        {(
          [
            { id: "data", label: "Data", icon: Database },
            { id: "users", label: "Akun", icon: Users },
            { id: "backup", label: "Backup", icon: CloudUpload },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] transition-colors ${
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === "data" && <DataTab />}
      {tab === "users" && <UsersTab />}
      {tab === "backup" && <BackupTab />}
    </PhoneShell>
  );
}

/* ---------------- Data ---------------- */
function DataTab() {
  const [table, setTable] = useState<TableId>("menu_items");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ text: string; isNew: boolean } | null>(null);
  const list = useServerFn(devListRows);
  const save = useServerFn(devSaveRow);
  const del = useServerFn(devDeleteRow);

  const load = useCallback(() => {
    setLoading(true);
    list({ data: { table } })
      .then((r) => {
        setRows(r);
        setMsg(null);
      })
      .catch((e) => setMsg(errMsg(e)))
      .finally(() => setLoading(false));
  }, [list, table]);
  useEffect(load, [load]);

  async function onSave() {
    if (!editing) return;
    try {
      const row = JSON.parse(editing.text) as Record<string, unknown>;
      await save({ data: { table, row } });
      setEditing(null);
      setMsg("Tersimpan.");
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus baris ini secara permanen?")) return;
    try {
      await del({ data: { table, id } });
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  const template = () => {
    const sample = rows[0] ?? {};
    const blank: Record<string, unknown> = {};
    Object.keys(sample).forEach((k) => {
      if (!["id", "created_at", "updated_at"].includes(k)) blank[k] = sample[k];
    });
    return JSON.stringify(blank, null, 2);
  };

  const summary = (r: Record<string, unknown>) =>
    String(r["name"] ?? r["code"] ?? r["email"] ?? r["staff_name"] ?? r["description"] ?? r["drink_name"] ?? r["role"] ?? r["id"]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTable(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              table === t.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <SectionLabel>{`${TABLES.find((t) => t.id === table)?.label} · ${rows.length}`}</SectionLabel>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[0.7rem] uppercase text-muted-foreground">
            <RefreshCw className="size-3" /> Muat
          </button>
          <button
            onClick={() => setEditing({ text: template(), isNew: true })}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[0.7rem] font-semibold uppercase text-primary-foreground"
          >
            <Plus className="size-3" /> Tambah
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}
      {editing && (
        <div className="mt-3 rounded-2xl border border-primary/50 bg-card/80 p-3">
          <p className="label-caps text-primary">{editing.isNew ? "Baris baru" : "Ubah baris"} (format JSON)</p>
          <textarea
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            rows={12}
            className="mt-2 w-full rounded-xl border border-border bg-background/60 p-2 font-mono text-xs text-foreground outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={() => void onSave()} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              <Save className="size-3" /> Simpan
            </button>
            <button onClick={() => setEditing(null)} className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Batal
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60">
          {rows.map((r) => (
            <li key={String(r["id"])} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <button
                onClick={() => setEditing({ text: JSON.stringify(r, null, 2), isNew: false })}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm text-foreground">{summary(r)}</span>
                <span className="block truncate text-[0.68rem] text-muted-foreground">
                  {String(r["created_at"] ?? "").slice(0, 16).replace("T", " ")}
                </span>
              </button>
              <button onClick={() => void onDelete(String(r["id"]))} aria-label="Hapus" className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {!rows.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada data.</li>}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Users ---------------- */
type UserRow = { id: string; email: string; created_at: string; last_sign_in_at: string | null; roles: string[] };

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", password: "", role: "barista" as (typeof ROLES)[number] });
  const list = useServerFn(devListUsers);
  const create = useServerFn(devCreateUser);
  const setPw = useServerFn(devSetPassword);
  const setRole = useServerFn(devSetRole);
  const remove = useServerFn(devDeleteUser);

  const load = useCallback(() => {
    setLoading(true);
    list()
      .then(setUsers)
      .catch((e) => setMsg(errMsg(e)))
      .finally(() => setLoading(false));
  }, [list]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  return (
    <section className="mt-6">
      <SectionLabel>Buat akun</SectionLabel>
      <div className="mt-2 grid gap-2 rounded-2xl border border-border bg-card/60 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none" />
        <input placeholder="Kata sandi (min. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ROLES)[number] })} className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => void run(() => create({ data: form }), "Akun dibuat.")}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold uppercase text-primary-foreground"
        >
          <Plus className="size-3" /> Buat
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-primary">{msg}</p>}

      <div className="mt-6"><SectionLabel>{`Semua akun · ${users.length}`}</SectionLabel></div>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</p>
      ) : (
        <ul className="mt-2 grid gap-3 md:grid-cols-2">
          {users.map((u) => (
            <li key={u.id} className="rounded-2xl border border-border bg-card/60 p-3.5">
              <p className="truncate text-sm font-semibold text-foreground">{u.email}</p>
              <p className="text-[0.68rem] text-muted-foreground">
                Terakhir masuk: {u.last_sign_in_at ? u.last_sign_in_at.slice(0, 16).replace("T", " ") : "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLES.map((r) => {
                  const on = u.roles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => void run(() => setRole({ data: { userId: u.id, role: r, on: !on } }), "Peran diperbarui.")}
                      className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    const pw = prompt(`Kata sandi baru untuk ${u.email} (min. 8 karakter):`);
                    if (pw) void run(() => setPw({ data: { userId: u.id, password: pw } }), "Kata sandi diganti.");
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary"
                >
                  <KeyRound className="size-3" /> Ganti sandi
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Hapus akun ${u.email}?`)) void run(() => remove({ data: { userId: u.id } }), "Akun dihapus.");
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" /> Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Backup ---------------- */
type BackupFile = { id: string; name: string; size?: string; createdTime: string };

function BackupTab() {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = useServerFn(devListBackups);
  const backup = useServerFn(devBackupNow);
  const restore = useServerFn(devRestore);

  const load = useCallback(() => {
    setLoading(true);
    list()
      .then(setFiles)
      .catch((e) => setMsg(errMsg(e)))
      .finally(() => setLoading(false));
  }, [list]);
  useEffect(load, [load]);

  async function onBackup() {
    setBusy("backup");
    try {
      const r = await backup();
      setMsg(`Backup tersimpan di Google Drive: ${r.name} (${r.images} foto).`);
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(null);
  }

  async function onRestore(f: BackupFile) {
    if (!confirm(`Pulihkan data dari ${f.name}? Data dengan ID yang sama akan ditimpa.`)) return;
    setBusy(f.id);
    try {
      const r = await restore({ data: { fileId: f.id } });
      const total = Object.values(r.summary).reduce((a, b) => a + b, 0);
      setMsg(`Restore selesai: ${total} baris data dan ${r.images} foto dipulihkan.`);
    } catch (e) {
      setMsg(errMsg(e));
    }
    setBusy(null);
  }

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <p className="label-caps text-primary">Google Drive</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Semua data dan foto menu otomatis di-backup setiap hari pukul 00:00 ke folder "Scoffey Backups".
        </p>
        <button
          disabled={busy !== null}
          onClick={() => void onBackup()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold uppercase text-primary-foreground disabled:opacity-50"
        >
          {busy === "backup" ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />} Backup sekarang
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-primary">{msg}</p>}
      <div className="mt-6 flex items-center justify-between">
        <SectionLabel>{`Riwayat backup · ${files.length}`}</SectionLabel>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[0.7rem] uppercase text-muted-foreground">
          <RefreshCw className="size-3" /> Muat
        </button>
      </div>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</p>
      ) : (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/60">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{f.name}</p>
                <p className="text-[0.68rem] text-muted-foreground">
                  {new Date(f.createdTime).toLocaleString("id-ID")} · {f.size ? `${(Number(f.size) / 1024).toFixed(0)} KB` : ""}
                </p>
              </div>
              <button
                disabled={busy !== null}
                onClick={() => void onRestore(f)}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
              >
                {busy === f.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Restore
              </button>
            </li>
          ))}
          {!files.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada backup.</li>}
        </ul>
      )}
    </section>
  );
}
