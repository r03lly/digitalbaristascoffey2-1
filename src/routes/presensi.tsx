import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, Fingerprint, LogIn, LogOut, User } from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { locale, localDateKey } from "@/lib/print-table";
import { clock, hoursBetween } from "./admin-attendance";
import { Button } from "@/components/ui/button";
import { deviceAttendanceTime, selectedAttendance } from "@/lib/attendance";

export const Route = createFileRoute("/presensi")({
  head: () => ({
    meta: [
      { title: "Presensi Barista — Absen Masuk & Pulang | Scoffey" },
      { name: "description", content: "Barista Scoffey mencatat jam masuk dan jam pulang setiap hari kerja." },
      { property: "og:title", content: "Presensi Barista Scoffey" },
      { property: "og:description", content: "Absen masuk dan pulang untuk barista Scoffey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PresensiPage,
});

type Row = { id: string; barista_name_id: string | null; staff_name: string; work_date: string; check_in: string; check_out: string | null; note: string };
type StaffName = { id: string; name: string; active: boolean };

const nav = [
  { to: "/barista", label: "Pesanan", icon: ClipboardList },
  { to: "/presensi", label: "Presensi", icon: Fingerprint },
  { to: "/orders", label: "Riwayat", icon: CalendarClock },
  { to: "/profile", label: "Profile", icon: User },
];

function PresensiPage() {
  const { isBarista, authReady } = useBarista();
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<StaffName[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [deviceNow, setDeviceNow] = useState(() => new Date());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = localDateKey(deviceNow);
  const today = selectedAttendance(rows, selectedId, todayKey);
  const selectedName = names.find((n) => n.id === selectedId);
  const history = rows.filter((r) => !selectedId || r.barista_name_id === selectedId);

  useEffect(() => {
    const timer = window.setInterval(() => setDeviceNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setLoading(false);
    const [attendance, staff] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", u.user.id).gte("work_date", localDateKey(new Date(Date.now() - 30 * 86400000))).order("check_in", { ascending: false }),
      supabase.from("barista_names").select("id,name,active").order("name"),
    ]);
    setLoading(false);
    if (attendance.error || staff.error) setError(attendance.error?.message ?? staff.error?.message ?? null);
    else { setRows(attendance.data ?? []); setNames(staff.data ?? []); setError(null); }
  }, []);
  useEffect(() => { if (isBarista) void load(); }, [isBarista, load]);

  async function checkIn() {
    if (!selectedName?.active || loading || busy) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setBusy(false);
    const { error: err } = await supabase.from("attendance").insert({
      user_id: u.user.id, barista_name_id: selectedName.id, staff_name: selectedName.name,
      ...deviceAttendanceTime(), note: note.trim(),
    });
    setBusy(false);
    if (err) return setError(err.code === "23505" ? t("Nama ini sudah absen hari ini.") : err.message);
    setError(null); setNote(""); await load();
  }

  async function checkOut() {
    if (!today || busy) return;
    setBusy(true);
    const { error: err } = await supabase.from("attendance").update({
      check_out: new Date().toISOString(), note: [today.note, note.trim()].filter(Boolean).join(" · "),
    }).eq("id", today.id);
    setBusy(false);
    if (err) return setError(err.message);
    setError(null); setNote(""); void load();
  }

  if (authReady && !isBarista) {
    return (
      <PhoneShell title={t("PRESENSI")} back="/profile">
        <p className="mt-4 text-sm text-muted-foreground">{t("Halaman ini khusus untuk barista Scoffey.")}</p>
        <Link to="/auth" className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary">{t("Masuk sebagai staf")}</Link>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell title={t("PRESENSI")} back="/barista" nav navItems={nav}>
      <section className="mt-3 rounded-2xl border border-border bg-card/60 p-4">
        <p className="label-caps text-primary">{t("Hari ini")}</p>
        <p className="mt-1 text-sm text-foreground">
          {deviceNow.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-primary" suppressHydrationWarning>{deviceNow.toLocaleTimeString(locale())}</p>
        <label htmlFor="attendance-name" className="mt-4 block text-sm font-medium text-foreground">{t("Nama barista")}</label>
        <select id="attendance-name" value={selectedId} disabled={busy || loading}
          onChange={(e) => { setSelectedId(e.target.value); setNote(""); setError(null); }}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
          <option value="">{t("Pilih nama barista")}</option>
          {names.filter((n) => n.active || rows.some((r) => r.barista_name_id === n.id && !r.check_out)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {!loading && !names.some((n) => n.active) && <p className="mt-2 text-sm text-muted-foreground">{t("Belum ada nama barista aktif.")}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          {!selectedId ? t("Pilih nama barista") : !today ? t("Kamu belum absen masuk.") : today.check_out
            ? `${t("Selesai")}: ${t("masuk")} ${clock(today.check_in)}, ${t("pulang")} ${clock(today.check_out)}.`
            : `${t("Sudah masuk pukul")} ${clock(today.check_in)}. ${t("Jangan lupa absen pulang.")}`}
        </p>
        {!today?.check_out && (
          <>
            <input placeholder={t("Catatan (opsional)")} value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-3 w-full rounded-xl border border-input bg-background/40 px-3 py-2 text-sm text-foreground" />
            <Button type="button" disabled={busy || loading || !selectedId || (!today && !selectedName?.active)} onClick={() => void (today ? checkOut() : checkIn())}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-60">
              {today ? <><LogOut className="size-4" /> {t("Absen pulang")}</> : <><LogIn className="size-4" /> {t("Absen masuk")}</>}
            </Button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>

      <section className="mt-5">
        <SectionLabel>{t("Riwayat 31 hari")}</SectionLabel>
        <ul className="mt-2 space-y-2">
          {history.map((r) => (
            <li key={r.id} className="flex justify-between rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
              <span className="text-foreground">{r.staff_name}<span className="block text-xs text-muted-foreground">{r.work_date}</span></span>
              <span className="text-xs text-muted-foreground">
                {clock(r.check_in)} – {clock(r.check_out)}
                {r.check_out ? ` · ${hoursBetween(r.check_in, r.check_out)?.toFixed(1)} ${t("jam")}` : ""}
              </span>
            </li>
          ))}
          {!history.length && <li className="text-sm text-muted-foreground">{t("Belum ada riwayat presensi.")}</li>}
        </ul>
      </section>
    </PhoneShell>
  );
}
