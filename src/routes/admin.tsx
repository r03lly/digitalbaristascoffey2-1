import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Calculator,
  ChevronRight,
  Coffee,
  CreditCard,
  Fingerprint,
  HandCoins,
  Package,
  Receipt,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { formatIDR } from "@/lib/barista-data";
import { useBarista } from "@/lib/barista-store";
import { getLang, t } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Laporan Transaksi & Keuangan — Digital Barista by Scoffey" },
      {
        name: "description",
        content:
          "Dashboard barista/admin Scoffey: rekap transaksi, pendapatan, pajak, biaya layanan, dan tip barista.",
      },
      { property: "og:title", content: "Laporan Transaksi & Keuangan — Digital Barista" },
      {
        property: "og:description",
        content: "Rekap penjualan harian, metode pembayaran, dan catatan tip barista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type RangeKey = "today" | "week" | "month" | "year";

const MANAGE_LINKS = [
  { to: "/admin-recap", label: "Rekap Transaksi", desc: "Lihat pesanan, omzet & tip harian", icon: Receipt },
  { to: "/admin-menu", label: "Kelola menu & harga", desc: "Tambah item dan ubah harga", icon: UtensilsCrossed },
  { to: "/admin-finance", label: "Laporan keuangan", desc: "Pemasukan, pengeluaran, dan laba", icon: Wallet },
  { to: "/admin-stock", label: "Stok bahan", desc: "Pantau bahan baku dan stok menipis", icon: Package },
  { to: "/admin-attendance", label: "Presensi barista", desc: "Rekap kehadiran dan jam kerja", icon: Fingerprint },
] as const;

const RANGES: { id: RangeKey; label: string }[] = [
  { id: "today", label: "Harian" },
  { id: "week", label: "Mingguan" },
  { id: "month", label: "Bulanan" },
  { id: "year", label: "Tahunan" },
];

function inRange(when: string, range: RangeKey) {
  const d = new Date(when);
  const now = new Date();
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "week") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return d >= start && d <= now;
  }
  if (range === "month")
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return d.getFullYear() === now.getFullYear();
}

function AdminPage() {
  const { dbOrders, isAdmin, authReady } = useBarista();
  const orders = dbOrders;
  const [range, setRange] = useState<RangeKey>("today");
  const [trendMode, setTrendMode] = useState<"day" | "month">("day");
  const [expenses, setExpenses] = useState<{ spent_on: string; amount: number }[]>([]);

  // Pengeluaran harian dari Laporan keuangan, untuk menghitung laba.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    supabase
      .from("expenses")
      .select("spent_on, amount")
      .then(({ data }) => {
        if (alive && data) setExpenses(data.map((e) => ({ spent_on: e.spent_on, amount: Number(e.amount) || 0 })));
      });
    return () => {
      alive = false;
    };
  }, [isAdmin]);



  const rows = useMemo(() => orders.filter((o) => inRange(o.when, range)), [orders, range]);

  const sum = (pick: (o: (typeof rows)[number]) => number) =>
    rows.reduce((s, o) => s + pick(o), 0);

  const net = sum((o) => o.price);
  const tax = sum((o) => o.tax);
  const service = sum((o) => o.service);
  const tip = sum((o) => o.tip);
  const gross = sum((o) => o.total);
  const avg = rows.length ? Math.round(gross / rows.length) : 0;

  const byPayment = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    rows.forEach((o) => {
      const key = o.payment;
      const prev = map.get(key) ?? { count: 0, total: 0 };
      map.set(key, { count: prev.count + 1, total: prev.total + o.total });
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const locale = getLang() === "id" ? "id-ID" : "en-US";

  /** Rekap 7 hari terakhir: pendapatan, jumlah transaksi, pesan manis, tip. */
  const daily = useMemo(() => {
    const days: {
      key: string;
      label: string;
      total: number;
      count: number;
      notes: number;
      tip: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(locale, { day: "2-digit", month: "short" }),
        total: 0,
        count: 0,
        notes: 0,
        tip: 0,
      });
    }
    orders.forEach((o) => {
      const key = new Date(o.when).toISOString().slice(0, 10);
      const day = days.find((x) => x.key === key);
      if (!day) return;
      day.total += o.total;
      day.count += 1;
      day.tip += o.tip;
      if (o.note?.trim()) day.notes += 1;
    });
    return days;
  }, [orders, locale]);

  /** Rekap 6 bulan terakhir. */
  const monthly = useMemo(() => {
    const months: { key: string; label: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - i);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(locale, { month: "short" }),
        total: 0,
        count: 0,
      });
    }
    orders.forEach((o) => {
      const d = new Date(o.when);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (!m) return;
      m.total += o.total;
      m.count += 1;
    });
    return months;
  }, [orders, locale]);

  /** Tren penjualan vs laba: 14 hari atau 12 bulan terakhir. Laba = penjualan − pengeluaran. */
  const trend = useMemo(() => {
    const items: { key: string; label: string; sales: number; profit: number }[] = [];
    if (trendMode === "day") {
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        items.push({
          key: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString(locale, { day: "2-digit", month: "short" }),
          sales: 0,
          profit: 0,
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() - i);
        items.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: d.toLocaleDateString(locale, { month: "short" }),
          sales: 0,
          profit: 0,
        });
      }
    }
    const find = (k: string) => items.find((x) => x.key === k);
    orders.forEach((o) => {
      if ((o.status ?? "baru") === "dibatalkan") return;
      const d = new Date(o.when);
      const k = trendMode === "day" ? d.toISOString().slice(0, 10) : `${d.getFullYear()}-${d.getMonth()}`;
      const it = find(k);
      if (it) it.sales += o.total;
    });
    expenses.forEach((e) => {
      const d = new Date(`${e.spent_on}T00:00:00`);
      const k = trendMode === "day" ? e.spent_on : `${d.getFullYear()}-${d.getMonth()}`;
      const it = find(k);
      if (it) it.profit -= e.amount;
    });
    items.forEach((it) => {
      it.profit += it.sales;
    });
    return items;
  }, [orders, expenses, trendMode, locale]);

  const signature = rows.filter((o) => o.kind === "signature").length;
  const regular = rows.length - signature;

  if (authReady && !isAdmin) {
    return (
      <PhoneShell title={t("DASHBOARD ADMIN")}>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Halaman ini khusus untuk admin Scoffey.")}
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary"
        >
          {t("Masuk sebagai admin")}
        </Link>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell title={t("DASHBOARD ADMIN")}>
      <p className="mt-3 text-sm text-muted-foreground">
        {t("Rekap transaksi dan keuangan untuk akun admin Scoffey.")}
      </p>

      {/* Menu pengelolaan */}
      <nav aria-label={t("Menu pengelolaan")} className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        {MANAGE_LINKS.map(({ to, label, desc, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3.5 transition-colors hover:border-primary/60 hover:bg-card"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-tight font-semibold text-foreground">{t(label)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t(desc)}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </nav>

      {/* Ringkasan periode */}
      <section className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>{t("Ringkasan")}</SectionLabel>
          <div
            role="tablist"
            aria-label={t("Ringkasan")}
            className="inline-flex rounded-full border border-border bg-card/60 p-1"
          >
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={range === r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-full px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  range === r.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(r.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Banknote} label={t("Total penerimaan")} value={formatIDR(gross)} accent />
          <Stat icon={Receipt} label={t("Jumlah transaksi")} value={String(rows.length)} />
          <Stat icon={Calculator} label={t("Rata-rata per transaksi")} value={formatIDR(avg)} />
          <Stat icon={HandCoins} label={t("Tip barista")} value={formatIDR(tip)} accent />
        </div>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="label-caps text-primary">{t("Rincian keuangan")}</h3>
          </div>
          <dl className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            <Row label={t("Penjualan minuman (net)")} value={formatIDR(net)} />
            <Row label={t("Pajak (11%)")} value={formatIDR(tax)} />
            <Row label={t("Biaya layanan")} value={formatIDR(service)} />
            <Row label={t("Tip barista (kategori khusus)")} value={formatIDR(tip)} />
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <dt className="label-caps text-foreground">{t("Total penerimaan")}</dt>
              <dd className="display-title text-xl font-bold text-primary">{formatIDR(gross)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Racikan signature")}: {signature} · {t("Menu reguler")}: {regular}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-primary" />
            <h3 className="label-caps text-primary">{t("Metode pembayaran")}</h3>
          </div>
          {byPayment.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {byPayment.map(([name, v]) => (
                <li key={name} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-foreground">{name}</span>
                  <span className="text-muted-foreground">
                    {v.count}x · <span className="font-semibold text-primary">{formatIDR(v.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("Belum ada transaksi.")}</p>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section>
          <SectionLabel>{t("Pendapatan harian")}</SectionLabel>
          <BarChart
            data={daily.map((d) => ({ label: d.label, value: d.total }))}
            empty={t("Belum ada data untuk grafik.")}
          />
        </section>
        <section>
          <SectionLabel>{t("Pendapatan bulanan")}</SectionLabel>
          <BarChart
            data={monthly.map((m) => ({ label: m.label, value: m.total }))}
            empty={t("Belum ada data untuk grafik.")}
          />
        </section>
      </div>

      {/* Tren penjualan & keuntungan */}
      <section className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>{t("Tren penjualan & keuntungan")}</SectionLabel>
          <div
            role="tablist"
            aria-label={t("Tren penjualan & keuntungan")}
            className="inline-flex rounded-full border border-border bg-card/60 p-1"
          >
            {(
              [
                { id: "day" as const, label: "14 hari" },
                { id: "month" as const, label: "12 bulan" },
              ]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={trendMode === m.id}
                onClick={() => setTrendMode(m.id)}
                className={`rounded-full px-3.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  trendMode === m.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(m.label)}
              </button>
            ))}
          </div>
        </div>
        <TrendChart
          data={trend}
          empty={t("Belum ada data untuk grafik.")}
          salesLabel={t("Penjualan")}
          profitLabel={t("Keuntungan")}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Keuntungan = penjualan − pengeluaran harian.")}
        </p>
      </section>

      <div className="mt-6">
        <Link
          to="/profile"
          className="flex items-center justify-center rounded-2xl border border-border py-3.5 text-sm font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-primary"
        >
          {t("Kembali ke Profil")}
        </Link>
      </div>
    </PhoneShell>
  );
}

function Stat({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: typeof Coffee;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-primary/70" />}
      </div>
      <p
        className={`display-title mt-2 text-xl font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function BarChart({
  data,
  empty,
}: {
  data: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!max)
    return (
      <p className="mt-2 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex h-36 items-end gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[0.6rem] text-muted-foreground">
              {d.value ? Math.round(d.value / 1000) + "k" : ""}
            </span>
            <div
              className="w-full rounded-t-md bg-primary/80"
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
              aria-hidden="true"
            />
            <span className="text-[0.6rem] tracking-tight text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  data,
  empty,
  salesLabel,
  profitLabel,
}: {
  data: { key: string; label: string; sales: number; profit: number }[];
  empty: string;
  salesLabel: string;
  profitLabel: string;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.sales, Math.abs(d.profit))), 0);
  const legend = (
    <div className="flex items-center gap-4 text-[0.68rem] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-primary/85" aria-hidden /> {salesLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-cream/70" aria-hidden /> {profitLabel}
      </span>
    </div>
  );
  if (!max)
    return (
      <p className="mt-2 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3">{legend}</div>
      <div className="flex h-40 items-end gap-1.5 overflow-hidden">
        {data.map((d) => (
          <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex h-full w-full items-end justify-center gap-[3px]">
              <div
                className="w-1/2 max-w-3 rounded-t-sm bg-primary/85"
                style={{ height: `${d.sales ? Math.max((d.sales / max) * 100, 2) : 0}%` }}
                title={`${salesLabel}: ${formatIDR(d.sales)}`}
                aria-hidden="true"
              />
              <div
                className={`w-1/2 max-w-3 rounded-t-sm ${d.profit < 0 ? "bg-destructive/80" : "bg-cream/70"}`}
                style={{
                  height: `${d.profit ? Math.max((Math.abs(d.profit) / max) * 100, 2) : 0}%`,
                }}
                title={`${profitLabel}: ${formatIDR(d.profit)}`}
                aria-hidden="true"
              />
            </div>
            <span className="text-[0.55rem] tracking-tight text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
