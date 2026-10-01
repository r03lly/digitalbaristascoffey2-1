import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, CalendarClock, Check, Coffee, Timer } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { formatIDR } from "@/lib/barista-data";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { AdminOnly } from "./admin-finance";

export const Route = createFileRoute("/admin-recap")({
  head: () => ({
    meta: [
      { title: "Rekap Transaksi — Digital Barista by Scoffey" },
      {
        name: "description",
        content: "Rekap transaksi Scoffey per tanggal: pesanan masuk, omzet, status, dan tip.",
      },
      { property: "og:title", content: "Rekap Transaksi — Digital Barista" },
      { property: "og:description", content: "Rekap pesanan, omzet, status, dan tip per tanggal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRecapPage,
});

function AdminRecapPage() {
  const { dbOrders, isAdmin, authReady } = useBarista();
  const [pickedDate, setPickedDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });

  /** Rekap semua pesanan pada tanggal yang dipilih. */
  const dayRecap = useMemo(() => {
    const all = dbOrders.filter((o) => {
      const d = new Date(o.when);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10) === pickedDate;
    });
    const valid = all.filter((o) => (o.status ?? "baru") !== "dibatalkan");
    const by = (s: string) => all.filter((o) => (o.status ?? "baru") === s).length;
    return {
      list: all,
      count: valid.length,
      baru: by("baru"),
      diproses: by("diproses"),
      selesai: by("selesai"),
      dibatalkan: by("dibatalkan"),
      total: valid.reduce((s, o) => s + o.total, 0),
      tip: valid.reduce((s, o) => s + o.tip, 0),
    };
  }, [dbOrders, pickedDate]);

  if (authReady && !isAdmin) return <AdminOnly title={t("REKAP TRANSAKSI")} />;

  return (
    <PhoneShell title={t("REKAP TRANSAKSI")} back="/admin" nav>
      <p className="mt-3 text-sm text-muted-foreground">
        {t("Rekap pesanan, omzet, dan tip per tanggal.")}
      </p>

      <section className="mt-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h3 className="label-caps text-primary">{t("Rekap per tanggal")}</h3>
          </div>
          <input
            type="date"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            aria-label={t("Pilih tanggal rekap")}
            className="rounded-xl border border-input bg-background/40 px-3 py-1.5 text-sm text-foreground"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("Pesanan masuk")} value={String(dayRecap.count)} />
          <Stat label={t("Selesai disajikan")} value={String(dayRecap.selesai)} />
          <Stat label={t("Omzet")} value={formatIDR(dayRecap.total)} accent />
          <Stat label={t("Tip diterima")} value={formatIDR(dayRecap.tip)} accent />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatusBox icon={Coffee} label={t("Baru")} value={dayRecap.baru} />
          <StatusBox icon={Timer} label={t("Diterima")} value={dayRecap.diproses} />
          <StatusBox icon={Check} label={t("Selesai")} value={dayRecap.selesai} />
          <StatusBox icon={Ban} label={t("Batal")} value={dayRecap.dibatalkan} />
        </div>

        <ul className="mt-3 divide-y divide-border">
          {dayRecap.list.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate text-foreground">{o.name}</p>
                <p className="text-xs text-muted-foreground">
                  #{o.id} · {o.customer} · {t(o.status ?? "baru")}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-primary">{formatIDR(o.total)}</span>
            </li>
          ))}
          {!dayRecap.list.length && (
            <li className="py-2 text-sm text-muted-foreground">
              {t("Belum ada transaksi pada tanggal ini.")}
            </li>
          )}
        </ul>
      </section>
    </PhoneShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3.5">
      <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p
        className={`display-title mt-2 text-xl font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coffee;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-lg leading-none font-bold text-foreground">{value}</p>
        <p className="mt-1 truncate text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
