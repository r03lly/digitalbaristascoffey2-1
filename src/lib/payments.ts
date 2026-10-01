/** Metode pembayaran dipakai bersama oleh halaman checkout dan pelacakan pesanan. */
export const PAYMENTS = [
  { id: "QRIS", label: "QRIS", hint: "Scan sekali, semua aplikasi bisa" },
  { id: "DANA", label: "DANA", hint: "0821-4855-115 · Ahmad Adib Raihan" },
  { id: "GoPay", label: "GoPay", hint: "0821-4855-115 · Ahmad Adib Raihan" },
  {
    id: "Transfer Bank",
    label: "Transfer Bank",
    hint: "Seabank · 901773318448 · Ahmad Adib Raihan",
  },
  { id: "Tunai di Kasir", label: "Tunai di Kasir", hint: "Bayar langsung ke barista" },
];

export const EWALLETS = [
  { id: "DANA", number: "0821-4855-115", name: "Ahmad Adib Raihan" },
  { id: "GoPay", number: "0821-4855-115", name: "Ahmad Adib Raihan" },
];

export const BANK = { id: "Seabank", number: "901773318448", name: "Ahmad Adib Raihan" };

/** Label lengkap (dengan nomor tujuan) untuk metode pembayaran tertentu. */
export function paymentLabelFor(id: string) {
  const wallet = EWALLETS.find((w) => w.id === id);
  if (wallet) return `${wallet.id} · ${wallet.number} (${wallet.name})`;
  if (id === "Transfer Bank") return `${BANK.id} · ${BANK.number} (${BANK.name})`;
  return id;
}
