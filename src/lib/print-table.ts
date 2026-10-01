import { getLang, t } from "@/lib/i18n";

/** Generic printable report: summary cards + one or more tables, opened in a print window. */
export type PrintSection = {
  title: string;
  head: string[];
  rows: string[][];
  foot?: string[];
  /** column indexes aligned right */
  right?: number[];
};

export const locale = () => (getLang() === "id" ? "id-ID" : "en-US");

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
}

export function printReport(opts: {
  title: string;
  subtitle: string;
  cards?: { label: string; value: string }[];
  sections: PrintSection[];
}) {
  const cell = (s: PrintSection, i: number, v: string, tag = "td") =>
    `<${tag}${s.right?.includes(i) ? ' class="r"' : ""}>${esc(v)}</${tag}>`;
  const sections = opts.sections
    .map(
      (s) => `<h2>${esc(s.title)}</h2><table>
<thead><tr>${s.head.map((h, i) => cell(s, i, h, "th")).join("")}</tr></thead>
<tbody>${
        s.rows.length
          ? s.rows.map((r) => `<tr>${r.map((v, i) => cell(s, i, v)).join("")}</tr>`).join("")
          : `<tr><td colspan="${s.head.length}" class="c">${esc(t("Tidak ada data"))}</td></tr>`
      }</tbody>
${s.foot ? `<tfoot><tr>${s.foot.map((v, i) => cell(s, i, v)).join("")}</tr></tfoot>` : ""}
</table>`,
    )
    .join("");
  const cards = (opts.cards ?? [])
    .map((c) => `<div class="card"><b>${esc(c.value)}</b><span>${esc(c.label)}</span></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
*{box-sizing:border-box}body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#1b1410;margin:32px;font-size:12px}
h1{font-size:18px;margin:0 0 2px}.sub{color:#7a6a5f;margin:0 0 18px}
.cards{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.card{border:1px solid #e2d8d0;border-radius:10px;padding:8px 14px;min-width:120px}
.card b{display:block;font-size:15px}.card span{color:#7a6a5f;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
h2{font-size:13px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #e8e0da;padding:5px 6px;text-align:left}
th{background:#f7f2ee;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
.r{text-align:right}.c{text-align:center;color:#7a6a5f}tfoot td{font-weight:700;border-top:2px solid #d8ccc3}
@media print{body{margin:12mm}}
</style></head><body>
<h1>${esc(opts.title)}</h1><p class="sub">${esc(opts.subtitle)} · ${esc(t("dicetak"))} ${esc(new Date().toLocaleString(locale()))}</p>
<div class="cards">${cards}</div>${sections}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function localDateKey(d: Date | string) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

export type PeriodMode = "day" | "month" | "year" | "range";

/** Does a YYYY-MM-DD key fall in the chosen period?
 *  `value` is YYYY-MM-DD, YYYY-MM, YYYY — or "YYYY-MM-DD..YYYY-MM-DD" for "range". */
export function inPeriod(dateKey: string, mode: PeriodMode, value: string) {
  if (mode === "day") return dateKey === value;
  if (mode === "month") return dateKey.slice(0, 7) === value;
  if (mode === "range") {
    const [from, to] = value.split("..");
    if (!from || !to) return false;
    return dateKey >= (from <= to ? from : to) && dateKey <= (from <= to ? to : from);
  }
  return dateKey.slice(0, 4) === value;
}

export function periodLabel(mode: PeriodMode, value: string) {
  if (mode === "day")
    return new Date(value + "T00:00:00").toLocaleDateString(locale(), {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  if (mode === "month")
    return new Date(value + "-01T00:00:00").toLocaleDateString(locale(), { month: "long", year: "numeric" });
  if (mode === "range") {
    const [from, to] = value.split("..");
    const fmt = (d?: string) =>
      d
        ? new Date(d + "T00:00:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" })
        : "";
    return `${t("Dari")} ${fmt(from)} ${t("sampai")} ${fmt(to)}`;
  }
  return `${t("Tahun")} ${value}`;
}
