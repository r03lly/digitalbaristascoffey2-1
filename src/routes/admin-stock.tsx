import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Minus, Package, Plus, Printer, Trash2 } from "lucide-react";
import { PhoneShell, SectionLabel } from "@/components/PhoneShell";
import { supabase } from "@/integrations/supabase/client";
import { useBarista } from "@/lib/barista-store";
import { t } from "@/lib/i18n";
import { locale, printReport } from "@/lib/print-table";
import { AdminOnly, Card } from "./admin-finance";

export const Route = createFileRoute("/admin-stock")({
  head: () => ({
    meta: [
      { title: "Stok Bahan — Digital Barista by Scoffey" },
      { name: "description", content: "Kelola stok bahan baku Scoffey: jumlah, satuan, dan peringatan stok menipis." },
      { property: "og:title", content: "Stok Bahan Scoffey" },
      { property: "og:description", content: "Pantau dan perbarui stok bahan baku kedai Scoffey." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Item = { id: string; name: string; unit: string; quantity: number; min_quantity: number; note: string; updated_at: string };

function StockPage() {
  const { isAdmin, authReady } = useBarista();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", unit: "gram", quantity: "" });

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("stock_items").select("*").order("name");
    if (err) setError(err.message);
    else setItems((data ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), min_quantity: Number(i.min_quantity) })));
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const { error: err } = await supabase.from("stock_items").insert({
      name: draft.name.trim(), unit: draft.unit.trim() || "pcs",
      quantity: Number(draft.quantity) || 0, min_quantity: 0,
    });
    if (err) return setError(err.message);
    setError(null);
    setDraft({ name: "", unit: draft.unit, quantity: "" });
    void load();
  }

  async function setQty(item: Item, quantity: number) {
    const q = Math.max(0, quantity);
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, quantity: q } : x)));
    const { error: err } = await supabase.from("stock_items").update({ quantity: q }).eq("id", item.id);
    if (err) { setError(err.message); void load(); }
  }

  async function remove(item: Item) {
    if (!confirm(`${t("Hapus")} ${item.name}?`)) return;
    const { error: err } = await supabase.from("stock_items").delete().eq("id", item.id);
    if (err) setError(err.message);
    void load();
  }

  const low = items.filter((i) => i.quantity <= i.min_quantity);

  function print() {
    const ok = printReport({
      title: t("Laporan Stok Bahan — Scoffey"),
      subtitle: new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      cards: [{ label: t("Jenis bahan"), value: String(items.length) }, { label: t("Stok menipis"), value: String(low.length) }],
      sections: [{
        title: t("Daftar stok"), right: [1, 2],
        head: [t("Bahan"), t("Jumlah"), t("Satuan"), t("Status")],
        rows: items.map((i) => [i.name, String(i.quantity), i.unit, i.quantity <= i.min_quantity ? t("MENIPIS") : t("Aman")]),
      }],
    });
    if (!ok) setError(t("Izinkan pop-up di browser untuk mencetak laporan."));
  }

  if (authReady && !isAdmin) return <AdminOnly title={t("STOK BAHAN")} />;
  const input = "rounded-xl border border-input bg-background/40 px-3 py-2 text-sm text-foreground";

  return (
    <PhoneShell title={t("STOK BAHAN")} back="/admin" nav>
      <section className="mt-3 grid grid-cols-2 gap-2">
        <Card label={t("Jenis bahan")} value={String(items.length)} />
        <Card label={t("Stok menipis")} value={String(low.length)} accent={low.length > 0} />
      </section>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <section className="mt-5 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center gap-2"><Package className="size-4 text-primary" /><h3 className="label-caps text-primary">{t("Tambah bahan")}</h3></div>
        <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-2">
          <input placeholder={t("Nama bahan (mis. Biji kopi arabika)")} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${input} col-span-2`} />
          <input type="number" min="0" step="any" placeholder={t("Jumlah")} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} className={input} />
          <input placeholder={t("Satuan (gram, liter, pcs)")} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={input} />
          <button className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="size-4" /> {t("Simpan")}</button>
        </form>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>{t("Daftar stok")}</SectionLabel>
          <button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            <Printer className="size-3.5" /> {t("Cetak stok")}
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-border bg-card/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-semibold">{t("Bahan")}</th>
                <th className="px-2 py-2.5 text-center font-semibold">{t("Jumlah")}</th>
                <th className="px-2 py-2.5 text-center font-semibold">{t("Status")}</th>
                <th className="w-8 px-2 py-2.5" aria-label={t("Hapus")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => {
                const isLow = i.quantity <= i.min_quantity;
                return (
                  <tr key={i.id} className={isLow ? "bg-destructive/5" : undefined}>
                    <td className="max-w-[9rem] px-3 py-2.5">
                      <p className="truncate font-medium text-foreground">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.unit}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" aria-label={t("Kurangi")} onClick={() => void setQty(i, i.quantity - 1)} className="rounded-lg border border-border p-1"><Minus className="size-3" /></button>
                        <input type="number" min="0" step="any" aria-label={`${t("Jumlah")} ${i.name}`} defaultValue={i.quantity} key={i.quantity}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== i.quantity) void setQty(i, v); }}
                          className="w-14 rounded-lg border border-input bg-background/40 px-1 py-1 text-center text-sm text-foreground" />
                        <button type="button" aria-label={t("Tambah")} onClick={() => void setQty(i, i.quantity + 1)} className="rounded-lg border border-border p-1"><Plus className="size-3" /></button>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isLow ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {isLow ? t("MENIPIS") : t("Aman")}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button type="button" aria-label={t("Hapus")} onClick={() => void remove(i)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">{t("Belum ada bahan. Tambahkan di atas.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PhoneShell>
  );
}
