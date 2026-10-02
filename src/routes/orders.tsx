import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ClipboardList,
  Coffee,
  CupSoda,
  Download,
  Loader2,
  Search,
  Sparkles,
  Timer,
  User,
} from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { formatIDR } from "@/lib/barista-data";
import { useBarista } from "@/lib/barista-store";
import { rowToOrder } from "@/lib/orders-db";
import { downloadReceipt } from "@/lib/receipt";
import { getLang, t } from "@/lib/i18n";
import { fetchMenuItems, type MenuRow } from "@/lib/menu-db";
import { isToday, printDailyReport } from "@/lib/report-print";
import { Printer } from "lucide-react";

type RecapItem = {
  name: string;
  emoji: string;
  baru: number;
  diproses: number;
  selesai: number;
  sold: number;
};

/** Hitung rekap per menu dari daftar pesanan. */
function buildRecap(rows: OrderRowLike[], menu: MenuRow[]): RecapItem[] {
  const stat = new Map<string, { label: string; baru: number; diproses: number; selesai: number }>();
  const add = (name: string, status: string, qty: number) => {
    const label = name.trim();
    const key = label.toLowerCase();
    if (!key) return;
    const cur = stat.get(key) ?? { label, baru: 0, diproses: 0, selesai: 0 };
    const s = status === "diproses" ? "diproses" : status === "selesai" ? "selesai" : "baru";
    cur[s] += qty;
    stat.set(key, cur);
  };
  rows.forEach((r) => {
    const lines = Array.isArray(r.lines) ? (r.lines as Line[]) : [];
    const status = r.status || "baru";
    if (r.kind === "regular" && lines.length) {
      lines.forEach((l) => add(String(l.name ?? l.label ?? ""), status, qtyOf(l.amount)));
    } else {
      add(r.name, status, 1);
    }
  });
  const known = new Set(menu.map((m) => m.name.trim().toLowerCase()));
  const items = menu.map((m) => {
    const s = stat.get(m.name.trim().toLowerCase()) ?? { baru: 0, diproses: 0, selesai: 0 };
    return {
      name: m.name,
      emoji: m.emoji,
      baru: s.baru,
      diproses: s.diproses,
      selesai: s.selesai,
      sold: s.baru + s.diproses + s.selesai,
    };
  });
  const extras = [...stat.entries()]
    .filter(([k]) => !known.has(k))
    .map(([, v]) => ({
      name: v.label,
      emoji: "✨",
      baru: v.baru,
      diproses: v.diproses,
      selesai: v.selesai,
      sold: v.baru + v.diproses + v.selesai,
    }));
  return [...items, ...extras].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name));
}

type OrderRowLike = {
  name: string;
  kind: string;
  status: string;
  lines: unknown;
};

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Riwayat Pesanan — Digital Barista by Scoffey" },
      {
        name: "description",
        content:
          "Lihat riwayat pesanan Scoffey: racikan sebelumnya, status penyajian, dan struk digital.",
      },
      { property: "og:title", content: "Riwayat Pesanan — Digital Barista by Scoffey" },
      {
        property: "og:description",
        content: "Riwayat pesanan pelanggan dan antrean pengambilan pesanan untuk barista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

type Row = {
  id: string;
  code: string;
  user_id: string | null;
  customer: string;
  name: string;
  price: number;
  tax: number;
  service: number;
  tip: number;
  total: number;
  match_score: number;
  payment: string;
  option: string;
  note: string;
  kind: string;
  status: string;
  lines: unknown;
  created_at: string;
};

type Line = { label?: string; name?: string; amount?: string; value?: string };

function qtyOf(amount?: string) {
  const m = /^\s*(\d+)\s*x/i.exec(amount ?? "");
  return m ? Number(m[1]) : 1;
}

const STATUS_LABEL: Record<string, string> = {
  baru: "Menunggu",
  diproses: "Diterima",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

const FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "baru", label: "Menunggu" },
  { key: "diproses", label: "Diterima" },
  { key: "selesai", label: "Selesai" },
  { key: "dibatalkan", label: "Dibatalkan" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];


function OrdersPage() {
  const { userId, isBarista, isAdmin, authReady } = useBarista();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuRow[]>([]);

  const locale = getLang() === "id" ? "id-ID" : "en-US";

  const load = useCallback(async () => {
    let q = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!isBarista) {
      if (!userId) {
        setRows([]);
        setLoading(false);
        return;
      }
      q = q.eq("user_id", userId);
    }
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, [isBarista, userId]);

  useEffect(() => {
    if (!authReady) return;
    void load();
    if (!isBarista) return;
    const channel = supabase
      .channel("orders-history")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authReady, isBarista, load]);

  useEffect(() => {
    void fetchMenuItems()
      .then(setMenu)
      .catch(() => setMenu([]));
  }, []);


  const list = useMemo(() => {
    const s = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "semua" || (r.status || "baru") === filter) &&
        (!s ||
          r.name.toLowerCase().includes(s) ||
          r.customer.toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s)),
    );
  }, [rows, filter, query]);


  /** Jumlah pesanan per status untuk ditampilkan sebagai angka di tombol filter. */
  const statusCount = useMemo(() => {
    const c: Record<Filter, number> = {
      semua: rows.length,
      baru: 0,
      diproses: 0,
      selesai: 0,
      dibatalkan: 0,
    };
    rows.forEach((r) => {
      const s = (r.status || "baru") as Filter;
      if (s === "baru" || s === "diproses" || s === "selesai" || s === "dibatalkan") c[s] += 1;
    });

    return c;
  }, [rows]);


  const todayRows = useMemo(() => rows.filter((r) => isToday(r.created_at)), [rows]);
  const todayRecap = useMemo(() => buildRecap(todayRows, menu), [todayRows, menu]);

  /** Rekap per menu: staf hanya melihat pesanan hari ini. */
  const menuRecap = useMemo(
    () => (isBarista ? todayRecap : buildRecap(rows, menu)),
    [isBarista, todayRecap, rows, menu],
  );
  const summaryRows = isBarista ? todayRows : rows;
  const [payFilter, setPayFilter] = useState("");
  const todayPaid = useMemo(() => todayRows.filter((r) => (r.status || "baru") !== "dibatalkan"), [todayRows]);
  const payRecap = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    todayPaid.forEach((o) => {
      const k = o.payment || "-";
      const p = m.get(k) ?? { count: 0, total: 0 };
      m.set(k, { count: p.count + 1, total: p.total + o.total });
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [todayPaid]);
  const payShown = payFilter ? todayPaid.filter((o) => (o.payment || "-") === payFilter) : todayPaid;
  const summarySpend = summaryRows.reduce((sum, r) => sum + r.total, 0);

  function cetakLaporan() {
    const ok = printDailyReport(todayRows, todayRecap);
    if (!ok) setError(t("Izinkan pop-up di browser untuk mencetak laporan."));
  }

  async function setStatus(id: string, status: "baru" | "diproses" | "selesai") {
    setBusyId(id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    const { error: err } = await supabase.from("orders").update({ status }).eq("id", id);
    if (err) {
      setError(err.message);
      void load();
    }
    setBusyId(null);
  }

  const staffNav = [
    { to: "/orders", label: "Riwayat", icon: ClipboardList },
    { to: "/barista", label: "Pesanan", icon: Coffee },
    { to: "/profile", label: "Profile", icon: User },
  ];

  const title = isBarista ? t("Pesanan Masuk") : t("Riwayat Pesanan");

  if (!authReady) {
    return (
      <PhoneShell title={title} back="/profile" nav>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("Memuat…")}
        </p>
      </PhoneShell>
    );
  }

  if (!userId) {
    return (
      <PhoneShell title={title} back="/home" nav>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Masuk ke akunmu untuk melihat riwayat pesanan sebelumnya.")}
        </p>
        <Link
          to="/auth"
          className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary"
        >
          {t("Masuk / Daftar")}
        </Link>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell
      title={title}
      back={isBarista ? "/barista" : "/profile"}
      nav
      navItems={isBarista || isAdmin ? staffNav : undefined}
    >
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card/60 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{summaryRows.length}</p>
          <p className="label-caps text-muted-foreground">{isBarista ? t("Pesanan hari ini") : t("Total pesanan")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-primary">{formatIDR(summarySpend)}</p>
          <p className="label-caps text-muted-foreground">
            {isBarista ? t("Nilai pesanan hari ini") : t("Total belanja")}
          </p>
        </div>
      </div>

      <>
          <div className="mt-4">
            <SectionLabel>{isBarista ? t("Rekap menu hari ini") : t("Rekap menu")}</SectionLabel>
          </div>
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-card/60">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b border-border/60 px-3 py-2 text-[0.6rem] uppercase tracking-[0.08em] text-muted-foreground">
              <span>{t("Menu")}</span>
              <span className="text-right">{t("Semua")}</span>
              <span className="text-right">{t("Menunggu")}</span>
              <span className="text-right">{t("Diproses")}</span>
              <span className="text-right">{t("Selesai")}</span>
            </div>

            {menuRecap.length ? (
              <ul className="divide-y divide-border/40">
                {menuRecap.map((m) => (
                  <li
                    key={m.name}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2 text-xs"
                  >
                    <span className="truncate text-foreground">
                      {m.emoji ? `${m.emoji} ` : ""}
                      {m.name}
                    </span>
                    <span className="w-8 text-right font-semibold text-primary">{m.sold}</span>
                    <span className="w-8 text-right text-muted-foreground">{m.baru}</span>
                    <span className="w-8 text-right text-muted-foreground">{m.diproses}</span>
                    <span className="w-8 text-right text-muted-foreground">{m.selesai}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {t("Menu belum tersedia.")}
              </p>
            )}
          </div>
        </>

      <div className="mt-4 rounded-2xl border border-border bg-card/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("Laporan hari ini")}</p>
            <p className="text-xs text-muted-foreground">
              {todayRows.length} {t("pesanan")} ·{" "}
              {formatIDR(todayRows.reduce((s, r) => s + r.total, 0))}
            </p>
          </div>
          <button
            type="button"
            onClick={cetakLaporan}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Printer className="size-4" /> {t("Cetak")}
          </button>
        </div>
      </div>

      {isBarista && (
        <section className="mt-4">
          <SectionLabel>{t("Metode pembayaran hari ini")}</SectionLabel>
          {payRecap.length ? (
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              {payRecap.map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-border bg-card/60 p-3">
                  <p className="text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">{k} · {v.count}x</p>
                  <p className="mt-1 text-base font-bold text-primary">{formatIDR(v.total)}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-muted-foreground">{t("Belum ada transaksi.")}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>{t("Rincian pemasukan hari ini")}</SectionLabel>
            <select aria-label={t("Filter pembayaran")} value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className="rounded-xl border border-input bg-background/40 px-3 py-1.5 text-sm text-foreground">
              <option value="">{t("Semua pembayaran")}</option>
              {payRecap.map(([k]) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="mt-2 max-h-[24rem] overflow-auto rounded-2xl border border-border bg-card/60">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("Waktu")}</th><th className="px-3 py-2">{t("Kode")}</th>
                  <th className="px-3 py-2">{t("Pelanggan")}</th><th className="px-3 py-2">{t("Menu")}</th>
                  <th className="px-3 py-2">{t("Pembayaran")}</th><th className="px-3 py-2 text-right">{t("Total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payShown.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(o.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.code}</td>
                    <td className="px-3 py-2 text-foreground">{o.customer || "-"}</td>
                    <td className="px-3 py-2 text-foreground">{o.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{o.payment || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-primary">{formatIDR(o.total)}</td>
                  </tr>
                ))}
                {!payShown.length && <tr><td colSpan={6} className="px-3 py-3 text-muted-foreground">{t("Belum ada transaksi.")}</td></tr>}
              </tbody>
              {payShown.length > 0 && (
                <tfoot><tr className="border-t border-border font-semibold">
                  <td colSpan={5} className="px-3 py-2 text-foreground">{t("Total")} ({payShown.length})</td>
                  <td className="px-3 py-2 text-right text-primary">{formatIDR(payShown.reduce((s, o) => s + o.total, 0))}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </section>
      )}






      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("Memuat…")}
        </p>
      )}

    </PhoneShell>
  );
}
