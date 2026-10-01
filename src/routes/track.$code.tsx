import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  Ban,
  Check,
  ChefHat,
  Download,
  Loader2,
  Receipt,
  RefreshCw,
  Timer,
  Wallet,
} from "lucide-react";
import { GoldButton, PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { formatIDR } from "@/lib/barista-data";
import { rowToOrder } from "@/lib/orders-db";
import { downloadReceipt } from "@/lib/receipt";
import { PAYMENTS, paymentLabelFor } from "@/lib/payments";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/track/$code")({
  head: () => ({
    meta: [
      { title: "Status Pesanan — Digital Barista by Scoffey" },
      {
        name: "description",
        content:
          "Pantau status pesanan Scoffey secara langsung: menunggu konfirmasi barista, sedang diracik, atau siap diambil.",
      },
      { property: "og:title", content: "Status Pesanan — Digital Barista by Scoffey" },
      {
        property: "og:description",
        content: "Lacak pesananmu dan batalkan atau ubah pembayaran selagi belum diterima barista.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

type Row = {
  id: string;
  code: string;
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

const STEPS = [
  {
    key: "baru",
    title: "Menunggu konfirmasi barista",
    desc: "Pesananmu sudah masuk. Barista akan segera menerimanya.",
    icon: Timer,
  },
  {
    key: "diproses",
    title: "Diterima & sedang diracik",
    desc: "Barista menerima pesananmu dan mulai meracik.",
    icon: ChefHat,
  },
  {
    key: "selesai",
    title: "Siap diambil",
    desc: "Pesananmu sudah selesai. Selamat menikmati!",
    icon: Check,
  },
] as const;

function TrackPage() {
  const { code } = useParams({ from: "/track/$code" });
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editPay, setEditPay] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("orders")
      .select("*")
      .eq("code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (err) setError(err.message);
    else {
      setError(null);
      setRow((data as Row | null) ?? null);
    }
    setLoading(false);
  }, [code]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`track-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .subscribe();
    const poll = setInterval(() => void load(), 15000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [code, load]);

  const status = row?.status || "baru";
  const pending = status === "baru";
  const cancelled = status === "dibatalkan";
  const activeIndex = STEPS.findIndex((s) => s.key === status);

  async function cancelOrder() {
    if (!row) return;
    setBusy(true);
    const { error: err } = await supabase
      .from("orders")
      .update({ status: "dibatalkan" })
      .eq("id", row.id)
      .eq("status", "baru");
    setBusy(false);
    if (err) {
      setError(t("Pesanan sudah diterima barista, tidak bisa dibatalkan."));
      void load();
      return;
    }
    void load();
  }

  async function changePayment(id: string) {
    if (!row) return;
    setBusy(true);
    const { error: err } = await supabase
      .from("orders")
      .update({ payment: paymentLabelFor(id) })
      .eq("id", row.id)
      .eq("status", "baru");
    setBusy(false);
    setEditPay(false);
    if (err) {
      setError(t("Pesanan sudah diterima barista, pembayaran tidak bisa diubah."));
    }
    void load();
  }

  if (loading) {
    return (
      <PhoneShell title={t("STATUS PESANAN")} back="/home">
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("Memuat…")}
        </p>
      </PhoneShell>
    );
  }

  if (!row) {
    return (
      <PhoneShell title={t("STATUS PESANAN")} back="/home">
        <p className="mt-4 text-sm text-muted-foreground">
          {t("Pesanan tidak ditemukan. Periksa kembali kode pesananmu.")}
        </p>
        <Link
          to="/home"
          className="mt-4 inline-flex rounded-2xl border border-primary/60 px-4 py-2.5 text-sm font-semibold text-primary"
        >
          {t("Kembali ke Home")}
        </Link>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell title={t("STATUS PESANAN")} back="/home">
      <section className="mt-2 rounded-2xl border border-primary/40 bg-card/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{row.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              #{row.code} · {row.customer} · {t(row.option)}
            </p>
            <p className="text-xs text-muted-foreground">{row.payment}</p>
          </div>
          <p className="shrink-0 font-semibold text-primary">{formatIDR(row.total)}</p>
        </div>
      </section>

      {cancelled ? (
        <div className="mt-4 rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <Ban className="size-4" /> {t("Pesanan dibatalkan")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Pesanan ini sudah kamu batalkan sebelum diterima barista.")}
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            const Icon = s.icon;
            return (
              <li
                key={s.key}
                className={`flex gap-3 rounded-2xl border p-4 ${
                  active
                    ? "border-primary/60 bg-accent/30"
                    : done
                      ? "border-border bg-card/40"
                      : "border-border/60 bg-card/20 opacity-60"
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${
                    done || active
                      ? "border-primary/60 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {active && s.key !== "selesai" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t(s.title)}</span>
                  <span className="block text-xs text-muted-foreground">{t(s.desc)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {pending && (
        <>
          <div className="mt-5">
            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.68rem] uppercase text-muted-foreground"
                >
                  <RefreshCw className="size-3" /> {t("Muat ulang")}
                </button>
              }
            >
              {t("Masih bisa diubah")}
            </SectionLabel>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Selama barista belum menerima pesanan, kamu masih bisa mengganti metode pembayaran atau membatalkan pesanan.",
            )}
          </p>

          {editPay ? (
            <div className="mt-3 space-y-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void changePayment(p.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-3 text-left text-sm text-foreground disabled:opacity-50"
                >
                  <span>
                    {t(p.label)}
                    <span className="block text-[0.7rem] text-muted-foreground">{t(p.hint)}</span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEditPay(false)}
                className="w-full rounded-2xl border border-border px-4 py-2.5 text-xs uppercase tracking-[0.1em] text-muted-foreground"
              >
                {t("Batal")}
              </button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEditPay(true)}
                className="flex items-center justify-center gap-2 rounded-2xl border border-primary/60 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-primary"
              >
                <Wallet className="size-4" /> {t("Ubah pembayaran")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelOrder()}
                className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/60 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-destructive disabled:opacity-50"
              >
                <Ban className="size-4" /> {t("Batalkan pesanan")}
              </button>
            </div>
          )}
        </>
      )}

      {!pending && !cancelled && (
        <p className="mt-4 rounded-2xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
          {t("Pesanan sudah diterima barista, jadi tidak bisa dibatalkan atau diubah lagi.")}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void downloadReceipt(rowToOrder(row))}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-xs font-semibold uppercase tracking-[0.1em] text-foreground"
        >
          <Download className="size-4" /> {t("Nota PDF")}
        </button>
        <Link
          to="/orders"
          className="flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-xs font-semibold uppercase tracking-[0.1em] text-foreground"
        >
          <Receipt className="size-4" /> {t("Riwayat")}
        </Link>
      </div>

      <div className="mt-4">
        <Link to="/home" className="block">
          <GoldButton>{t("Kembali ke Home")}</GoldButton>
        </Link>
      </div>
    </PhoneShell>
  );
}
