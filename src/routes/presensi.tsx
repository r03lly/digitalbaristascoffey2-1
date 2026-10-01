import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, Fingerprint, LogIn, LogOut, User } from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { locale, localDateKey } from "@/lib/print-table";
import { clock, hoursBetween } from "./admin-attendance";

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

type Row = { id: string; work_date: string; check_in: string; check_out: string | null; note: string };

const nav = [
  { to: "/barista", label: "Pesanan", icon: ClipboardList },
  { to: "/presensi", label: "Presensi", icon: Fingerprint },
  { to: "/orders", label: "Riwayat", icon: CalendarClock },
  { to: "/profile", label: "Profile", icon: User },
];

function PresensiPage() {
  const { isBarista, authReady, userName } = useBarista();
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = localDateKey(new Date());
  const today = rows.find((r) => r.work_date === todayKey);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error: err } = await supabase.from("attendance").select("*").eq("user_id", u.user.id).order("work_date", { ascending: false }).limit(31);
    if (err) setError(err.message);
    else setRows(data ?? []);
  }, []);
  useEffect(() => { if (isBarista) void load(); }, [isBarista, load]);

  async function checkIn() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setBusy(false);
    const { error: err } = await supabase.from("attendance").insert({
      user_id: u.user.id, staff_name: userName || u.user.email || t("Barista"), work_date: todayKey, note: note.trim(),
    });
    setBusy(false);
    if (err) return setError(err.message);
    setError(null); setNote(""); void load();
  }

  async function checkOut() {
    if (!today) return;
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
          {new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {!today ? t("Kamu belum absen masuk.") : today.check_out
            ? `${t("Selesai")}: ${t("masuk")} ${clock(today.check_in)}, ${t("pulang")} ${clock(today.check_out)}.`
            : `${t("Sudah masuk pukul")} ${clock(today.check_in)}. ${t("Jangan lupa absen pulang.")}`}
        </p>
        {!today?.check_out && (
          <>
            <input placeholder={t("Catatan (opsional)")} value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-3 w-full rounded-xl border border-input bg-background/40 px-3 py-2 text-sm text-foreground" />
            <button type="button" disabled={busy} onClick={() => void (today ? checkOut() : checkIn())}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-60">
              {today ? <><LogOut className="size-4" /> {t("Absen pulang")}</> : <><LogIn className="size-4" /> {t("Absen masuk")}</>}
            </button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>

      <section className="mt-5">
        <SectionLabel>{t("Riwayat 31 hari")}</SectionLabel>
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
              <span className="text-foreground">{r.work_date}</span>
              <span className="text-xs text-muted-foreground">
                {clock(r.check_in)} – {clock(r.check_out)}
                {r.check_out ? ` · ${hoursBetween(r.check_in, r.check_out)?.toFixed(1)} ${t("jam")}` : ""}
              </span>
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted-foreground">{t("Belum ada riwayat presensi.")}</li>}
        </ul>
      </section>
    </PhoneShell>
  );
}
