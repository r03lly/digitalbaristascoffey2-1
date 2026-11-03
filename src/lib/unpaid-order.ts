// Halaman 10: kunci pembayaran. Id pesanan yang sudah dibuat tapi belum dibayar
// disimpan di sessionStorage (dengan waktu) supaya kunci bertahan saat halaman
// dimuat ulang, dan terbuka otomatis setelah 12 jam sebagai pengaman.
export const UNPAID_KEY = "scoffey-unpaid-order";
export const UNPAID_TTL = 12 * 60 * 60 * 1000;

export function saveUnpaidId(id: string) {
  try {
    sessionStorage.setItem(UNPAID_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearUnpaidId() {
  try {
    sessionStorage.removeItem(UNPAID_KEY);
  } catch {
    /* ignore */
  }
}

export function readUnpaidId(): string | null {
  try {
    const raw = sessionStorage.getItem(UNPAID_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; ts?: number };
    if (!parsed.id || !parsed.ts || Date.now() - parsed.ts > UNPAID_TTL) {
      clearUnpaidId();
      return null;
    }
    return parsed.id;
  } catch {
    clearUnpaidId();
    return null;
  }
}
