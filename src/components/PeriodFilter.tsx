import { t } from "@/lib/i18n";
import type { PeriodMode } from "@/lib/print-table";

export function PeriodFilter({
  mode,
  value,
  onChange,
}: {
  mode: PeriodMode;
  value: string;
  onChange: (mode: PeriodMode, value: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const switchMode = (m: PeriodMode) => {
    const base = value.length >= 4 ? value : today;
    const full = (base + today.slice(base.length)).slice(0, 10);
    if (m === "range") {
      onChange(m, `${monthStart}..${today}`);
      return;
    }
    onChange(m, m === "day" ? full : m === "month" ? full.slice(0, 7) : full.slice(0, 4));
  };
  const [from, to] = mode === "range" ? value.split("..") : [];
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));
  const cls = "rounded-xl border border-input bg-background/40 px-3 py-1.5 text-sm text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["day", "month", "year", "range"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => switchMode(m)}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase ${
            mode === m
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card/60 text-muted-foreground"
          }`}
        >
          {m === "day" ? t("Hari") : m === "month" ? t("Bulan") : m === "year" ? t("Tahun") : t("Rentang")}
        </button>
      ))}
      {mode === "day" && (
        <input type="date" aria-label={t("Pilih tanggal")} value={value} onChange={(e) => onChange(mode, e.target.value)} className={cls} />
      )}
      {mode === "month" && (
        <input type="month" aria-label={t("Pilih bulan")} value={value} onChange={(e) => onChange(mode, e.target.value)} className={cls} />
      )}
      {mode === "year" && (
        <select aria-label={t("Pilih tahun")} value={value} onChange={(e) => onChange(mode, e.target.value)} className={cls}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      <div className="flex w-full flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{t("Dari")}</span>
        <input
          type="date"
          aria-label={t("Dari tanggal")}
          value={from ?? ""}
          onChange={(e) => onChange("range", `${e.target.value || monthStart}..${to ?? today}`)}
          className={cls}
        />
        <span className="text-xs font-semibold uppercase text-muted-foreground">{t("sampai")}</span>
        <input
          type="date"
          aria-label={t("Sampai tanggal")}
          value={to ?? ""}
          onChange={(e) => onChange("range", `${from ?? monthStart}..${e.target.value || today}`)}
          className={cls}
        />
      </div>
    </div>
  );
}
