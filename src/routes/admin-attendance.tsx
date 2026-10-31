import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, Plus, Power, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { PeriodFilter } from "@/components/PeriodFilter";
import { supabase } from "@/integrations/supabase/client";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { inPeriod, localDateKey, periodLabel, printReport, locale, type PeriodMode } from "@/lib/print-table";
import { AdminOnly, Card } from "./admin-finance";

export const Route = createFileRoute("/admin-attendance")({
  head: () => ({
    meta: [
      { title: "Presensi Barista — Digital Barista by Scoffey" },
      { name: "description", content: "Rekap presensi barista Scoffey: jam masuk, jam pulang, dan durasi kerja." },
      { property: "og:title", content: "Presensi Barista Scoffey" },
      { property: "og:description", content: "Lihat dan cetak rekap kehadiran barista per hari, bulan, atau tahun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttendanceAdmin,
});

type Row = { id: string; staff_name: string; work_date: string; check_in: string; check_out: string | null; note: string };

export function hoursBetween(a: string, b: string | null) {
  if (!b) return null;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}
export const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "—";

function AttendanceAdmin() {
  const { isAdmin, authReady } = useBarista();
  const [mode, setMode] = useState<PeriodMode>("month");
  const [value, setValue] = useState(() => localDateKey(new Date()).slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    const [attendance, staff] = await Promise.all([
      supabase.from("attendance").select("*").order("check_in", { ascending: false }),
      supabase.from("barista_names").select("id,name,active").order("name"),
    ]);
    if (attendance.error || staff.error) setError(attendance.error?.message ?? staff.error?.message ?? null);
    else { setRows(attendance.data ?? []); setNames(staff.data ?? []); setError(null); }
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  async function addName(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || saving) return;
    setSaving(true);
    const { error: err } = await supabase.from("barista_names").insert({ name: newName.trim() });
    if (err) setError(err.code === "23505" ? t("Nama barista sudah ada.") : err.message);
    else { setNewName(""); await load(); }
    setSaving(false);
  }

  async function toggleName(id: string, active: boolean) {
    setSaving(true);
    const { error: err } = await supabase.from("barista_names").update({ active: !active }).eq("id", id);
    if (err) setError(err.message);
    else await load();
    setSaving(false);
  }

  function startEdit(id: string, name: string) {
    setEditId(id);
    setEditValue(name);
  }

  async function saveName() {
    if (!editId || !editValue.trim() || saving) return;
    setSaving(true);
    const { error: err } = await supabase.from("barista_names").update({ name: editValue.trim() }).eq("id", editId);
    if (err) setError(err.code === "23505" ? t("Nama barista sudah ada.") : err.message);
    else { setEditId(null); await load(); }
    setSaving(false);
  }

  async function deleteName(id: string, name: string) {
    if (!window.confirm(t("Hapus nama ini? Riwayat presensi tetap tersimpan."))) return;
    setSaving(true);
    // Riwayat presensi menyimpan snapshot nama, jadi cukup lepas referensi ID-nya lalu hapus.
    const { error: errRel } = await supabase.from("attendance").update({ barista_name_id: null }).eq("barista_name_id", id);
    if (errRel) { setError(errRel.message); setSaving(false); return; }
    const { error: err } = await supabase.from("barista_names").delete().eq("id", id);
    if (err) setError(err.message);
    else { if (editId === id) setEditId(null); await load(); }
    setSaving(false);
  }

  const list = useMemo(() => rows.filter((r) => inPeriod(r.work_date, mode, value)), [rows, mode, value]);
  const perStaff = useMemo(() => {
    const m = new Map<string, { days: number; hours: number }>();
    list.forEach((r) => {
      const p = m.get(r.staff_name) ?? { days: 0, hours: 0 };
      m.set(r.staff_name, { days: p.days + 1, hours: p.hours + (hoursBetween(r.check_in, r.check_out) ?? 0) });
    });
    return [...m.entries()];
  }, [list]);

  function print() {
    const ok = printReport({
      title: t("Laporan Presensi Barista — Scoffey"),
      subtitle: periodLabel(mode, value),
      cards: [{ label: t("Total kehadiran"), value: String(list.length) }, { label: t("Barista"), value: String(perStaff.length) }],
      sections: [
        { title: t("Rekap per barista"), right: [1, 2], head: [t("Nama"), t("Hari hadir"), t("Total jam")], rows: perStaff.map(([n, v]) => [n, String(v.days), v.hours.toFixed(1)]) },
        {
          title: t("Detail presensi"), right: [4],
          head: [t("Tanggal"), t("Nama"), t("Jam masuk"), t("Jam pulang"), t("Jam kerja"), t("Catatan")],
          rows: list.map((r) => [r.work_date, r.staff_name, clock(r.check_in), clock(r.check_out), hoursBetween(r.check_in, r.check_out)?.toFixed(1) ?? "-", r.note || "-"]),
        },
      ],
    });
    if (!ok) setError(t("Izinkan pop-up di browser untuk mencetak laporan."));
  }

  if (authReady && !isAdmin) return <AdminOnly title={t("PRESENSI BARISTA")} />;

  return (
    <PhoneShell title={t("PRESENSI BARISTA")} back="/admin" nav>
      <section className="mt-4">
        <SectionLabel>{t("Daftar nama barista")}</SectionLabel>
        <form onSubmit={(e) => void addName(e)} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="new-barista-name" className="sr-only">{t("Nama barista")}</label>
          <input id="new-barista-name" value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={100}
            placeholder={t("Nama barista")} className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
          <Button type="submit" disabled={saving || !newName.trim()}><Plus />{t("Tambah nama")}</Button>
        </form>
        <ul className="mt-3 divide-y divide-border">
          {names.map((n) => <li key={n.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            {editId === n.id ? (
              <>
                <label htmlFor={`edit-barista-${n.id}`} className="sr-only">{t("Nama barista")}</label>
                <input id={`edit-barista-${n.id}`} value={editValue} onChange={(e) => setEditValue(e.target.value)} maxLength={100}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" />
                <span className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" disabled={saving || !editValue.trim()} onClick={() => void saveName()} aria-label={t("Simpan")}><Check /></Button>
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditId(null)} aria-label={t("Batalkan")}><X /></Button>
                </span>
              </>
            ) : (
              <>
                <span className="min-w-0 break-words text-foreground">{n.name}<span className="ml-2 text-xs text-muted-foreground">{t(n.active ? "Aktif" : "Nonaktif")}</span></span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => startEdit(n.id, n.name)} aria-label={`${t("Ubah nama")} ${n.name}`}><Pencil /></Button>
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => void toggleName(n.id, n.active)} aria-label={`${t(n.active ? "Nonaktifkan" : "Aktifkan")} ${n.name}`}><Power /></Button>
                  <Button variant="outline" size="sm" className="text-destructive" disabled={saving} onClick={() => void deleteName(n.id, n.name)} aria-label={`${t("Hapus nama")} ${n.name}`}><Trash2 /></Button>
                </span>
              </>
            )}
          </li>)}
          {!names.length && <li className="py-3 text-sm text-muted-foreground">{t("Belum ada nama barista aktif.")}</li>}
        </ul>
      </section>
      <div className="mt-3"><PeriodFilter mode={mode} value={value} onChange={(m, v) => { setMode(m); setValue(v); }} /></div>
      <p className="mt-2 text-xs text-muted-foreground">{periodLabel(mode, value)}</p>
      <section className="mt-3 grid grid-cols-2 gap-2">
        <Card label={t("Total kehadiran")} value={String(list.length)} accent />
        <Card label={t("Barista hadir")} value={String(perStaff.length)} />
      </section>
      <button type="button" onClick={print} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
        <Printer className="size-4" /> {t("Cetak presensi")}
      </button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {perStaff.length > 0 && (
        <section className="mt-5">
          <SectionLabel>{t("Rekap per barista")}</SectionLabel>
          <ul className="mt-2 space-y-2">
            {perStaff.map(([n, v]) => (
              <li key={n} className="flex justify-between rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
                <span className="text-foreground">{n}</span>
                <span className="text-muted-foreground">{v.days} {t("hari")} · <span className="text-primary">{v.hours.toFixed(1)} {t("jam")}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <SectionLabel>{t("Detail presensi")}</SectionLabel>
        <ul className="mt-2 space-y-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
              <div className="flex justify-between gap-2">
                <p className="text-foreground">{r.staff_name}</p>
                <p className="text-xs text-muted-foreground">{r.work_date}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Jam masuk")} {clock(r.check_in)} · {t("Jam pulang")} {clock(r.check_out)}
                {r.check_out ? ` · ${hoursBetween(r.check_in, r.check_out)?.toFixed(1)} ${t("jam")}` : ` · ${t("masih bekerja")}`}
              </p>
              {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
            </li>
          ))}
          {!list.length && <li className="text-sm text-muted-foreground">{t("Belum ada presensi pada periode ini.")}</li>}
        </ul>
      </section>
    </PhoneShell>
  );
}
