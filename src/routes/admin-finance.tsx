import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Printer, Trash2, Wallet } from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { PeriodFilter } from "@/components/PeriodFilter";
import { supabase } from "@/integrations/supabase/client";
import { formatIDR } from "@/lib/barista-data";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { inPeriod, localDateKey, periodLabel, printReport, locale, type PeriodMode } from "@/lib/print-table";

export const Route = createFileRoute("/admin-finance")({
  head: () => ({
    meta: [
      { title: "Laporan Keuangan — Digital Barista by Scoffey" },
      { name: "description", content: "Laporan keuangan Scoffey: pemasukan, pengeluaran harian, dan laba per hari, bulan, atau tahun." },
      { property: "og:title", content: "Laporan Keuangan Scoffey" },
      { property: "og:description", content: "Catat pengeluaran harian dan cetak laporan laba rugi Scoffey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

type Expense = { id: string; spent_on: string; category: string; description: string; amount: number };
const CATEGORIES = ["Bahan baku", "Gaji", "Sewa", "Listrik & air", "Operasional", "Lainnya"];
const today = () => localDateKey(new Date());

function FinancePage() {
  const { isAdmin, authReady, dbOrders } = useBarista();
  const [mode, setMode] = useState<PeriodMode>("day");
  const [value, setValue] = useState(today);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ spent_on: today(), category: CATEGORIES[0]!, description: "", amount: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("expenses").select("*").order("spent_on", { ascending: false });
    if (err) setError(err.message);
    else setExpenses((data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })));
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const orders = useMemo(
    () => dbOrders.filter((o) => (o.status ?? "baru") !== "dibatalkan" && inPeriod(localDateKey(o.when), mode, value)),
    [dbOrders, mode, value],
  );
  const exp = useMemo(() => expenses.filter((e) => inPeriod(e.spent_on, mode, value)), [expenses, mode, value]);
  const income = orders.reduce((s, o) => s + o.total, 0);
  const spent = exp.reduce((s, e) => s + e.amount, 0);
  const profit = income - spent;
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    exp.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [exp]);
  const byPay = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    orders.forEach((o) => {
      const k = o.payment || "-";
      const p = m.get(k) ?? { count: 0, total: 0 };
      m.set(k, { count: p.count + 1, total: p.total + o.total });
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [orders]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(draft.amount);
    if (!amount || amount < 0) return setError(t("Isi nominal pengeluaran yang benar."));
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("expenses").insert({
      spent_on: draft.spent_on, category: draft.category, description: draft.description.trim(), amount, created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (err) return setError(err.message);
    setError(null);
    setDraft((d) => ({ ...d, description: "", amount: "" }));
    void load();
  }

  async function remove(id: string) {
    if (!confirm(t("Hapus pengeluaran ini?"))) return;
    const { error: err } = await supabase.from("expenses").delete().eq("id", id);
    if (err) setError(err.message);
    void load();
  }

  function print() {
    const ok = printReport({
      title: t("Laporan Keuangan — Scoffey"),
      subtitle: periodLabel(mode, value),
      cards: [
        { label: t("Pemasukan"), value: formatIDR(income) },
        { label: t("Pengeluaran"), value: formatIDR(spent) },
        { label: t("Laba bersih"), value: formatIDR(profit) },
        { label: t("Transaksi"), value: String(orders.length) },
      ],
      sections: [
        {
          title: t("Pemasukan (penjualan)"), right: [3],
          head: [t("Tanggal"), t("Kode"), t("Menu"), t("Total")],
          rows: orders.map((o) => [new Date(o.when).toLocaleString(locale()), o.id, o.name, formatIDR(o.total)]),
          foot: [t("Total"), "", "", formatIDR(income)],
        },
        {
          title: t("Pengeluaran"), right: [3],
          head: [t("Tanggal"), t("Kategori"), t("Keterangan"), t("Nominal")],
          rows: exp.map((e) => [e.spent_on, t(e.category), e.description || "-", formatIDR(e.amount)]),
          foot: [t("Total"), "", "", formatIDR(spent)],
        },
        {
          title: t("Pengeluaran per kategori"), right: [1],
          head: [t("Kategori"), t("Nominal")],
          rows: byCat.map(([k, v]) => [t(k), formatIDR(v)]),
        },
      ],
    });
    if (!ok) setError(t("Izinkan pop-up di browser untuk mencetak laporan."));
  }

  if (authReady && !isAdmin) return <AdminOnly title={t("LAPORAN KEUANGAN")} />;

  const input = "rounded-xl border border-input bg-background/40 px-3 py-2 text-sm text-foreground";
  return (
    <PhoneShell title={t("LAPORAN KEUANGAN")} back="/admin" nav>
      <p className="mt-3 text-sm text-muted-foreground">{t("Pemasukan dari penjualan dikurangi pengeluaran harian.")}</p>
      <div className="mt-3"><PeriodFilter mode={mode} value={value} onChange={(m, v) => { setMode(m); setValue(v); }} /></div>
      <p className="mt-2 text-xs text-muted-foreground">{periodLabel(mode, value)}</p>

      <section className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card label={t("Pemasukan")} value={formatIDR(income)} accent />
        <Card label={t("Pengeluaran")} value={formatIDR(spent)} />
        <Card label={t("Laba bersih")} value={formatIDR(profit)} accent={profit >= 0} />
        <Card label={t("Transaksi")} value={String(orders.length)} />
      </section>

      <button type="button" onClick={print} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
        <Printer className="size-4" /> {t("Cetak laporan")}
      </button>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <section className="mt-5">
        <SectionLabel>{t("Metode pembayaran")}</SectionLabel>
        {byPay.length ? (
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {byPay.map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-border bg-card/60 p-3">
                <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">{k} · {v.count}x</p>
                <p className="display-title mt-1 text-lg font-bold text-primary">{formatIDR(v.total)}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">{t("Belum ada transaksi.")}</p>}
      </section>

      <section className="mt-5">
        <SectionLabel>{t("Rincian pemasukan")}</SectionLabel>
        <div className="mt-2 max-h-[28rem] overflow-auto rounded-2xl border border-border bg-card/60">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-card text-left text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("Waktu")}</th><th className="px-3 py-2">{t("Kode")}</th>
                <th className="px-3 py-2">{t("Pelanggan")}</th><th className="px-3 py-2">{t("Menu")}</th>
                <th className="px-3 py-2">{t("Pembayaran")}</th><th className="px-3 py-2 text-right">{t("Total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(o.when).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-2 text-muted-foreground">{o.id}</td>
                  <td className="px-3 py-2 text-foreground">{o.customer || "-"}</td>
                  <td className="px-3 py-2 text-foreground">{o.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{o.payment || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-primary">{formatIDR(o.total)}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={6} className="px-3 py-3 text-muted-foreground">{t("Belum ada transaksi.")}</td></tr>}
            </tbody>
            {orders.length > 0 && (
              <tfoot><tr className="border-t border-border font-semibold">
                <td colSpan={5} className="px-3 py-2 text-foreground">{t("Total")}</td>
                <td className="px-3 py-2 text-right text-primary">{formatIDR(income)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="mt-5">
        <SectionLabel>{t("Pengeluaran")}</SectionLabel>
        <form onSubmit={add} className="mt-2 grid gap-2 rounded-2xl border border-border bg-card/60 p-3 md:grid-cols-5">
          <input type="date" className={input} value={draft.spent_on} onChange={(e) => setDraft({ ...draft, spent_on: e.target.value })} />
          <select className={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <input className={input} placeholder={t("Keterangan")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <input type="number" min="0" className={input} placeholder={t("Nominal")} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <button disabled={saving} className="inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Plus className="size-4" /> {t("Tambah")}
          </button>
        </form>
        <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card/60">
          {exp.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate text-foreground">{t(e.category)}{e.description ? ` — ${e.description}` : ""}</p>
                <p className="text-xs text-muted-foreground">{e.spent_on}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">{formatIDR(e.amount)}</span>
                <button type="button" onClick={() => remove(e.id)} aria-label={t("Hapus")} className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
          {!exp.length && <li className="px-4 py-3 text-sm text-muted-foreground">{t("Belum ada pengeluaran.")}</li>}
        </ul>
      </section>

      {byCat.length > 0 && (
        <section className="mt-5">
          <SectionLabel>{t("Pengeluaran per kategori")}</SectionLabel>
          <ul className="mt-2 space-y-2">
            {byCat.map(([k, v]) => (
              <li key={k} className="flex justify-between rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm">
                <span className="text-foreground">{t(k)}</span><span className="text-primary">{formatIDR(v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PhoneShell>
  );
}

export function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={`display-title mt-1 text-lg font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export function AdminOnly({ title }: { title: string }) {
  return (
    <PhoneShell title={title} back="/profile">
      <p className="mt-4 text-sm text-muted-foreground">{t("Halaman ini khusus untuk admin Scoffey.")}</p>
      <Link to="/auth" className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary">{t("Masuk sebagai admin")}</Link>
    </PhoneShell>
  );
}
