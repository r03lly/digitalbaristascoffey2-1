# Perbaikan Tampilan Landscape Mobile & Tablet

## Tujuan
Merapikan tampilan seluruh aplikasi ketika perangkat diputar ke posisi landscape, tanpa mengubah alur pemesanan atau data.

## Perubahan
- Sesuaikan bingkai aplikasi agar memakai lebar dan tinggi landscape secara efisien, bukan tetap menyerupai layar ponsel portrait sempit.
- Ringkas area merek, judul halaman, jarak vertikal, dan navigasi bawah pada layar landscape yang pendek.
- Pastikan isi utama tetap dapat digulir, tombol mudah dijangkau, dan tidak terpotong oleh navigasi.
- Pertahankan tampilan portrait dan desktop yang sudah ada.

## Validasi
- Periksa halaman awal, checkout, status pesanan, dan panel barista pada ukuran mobile landscape serta tablet landscape.
- Pastikan tidak ada teks, tombol, atau kartu yang bertumpuk atau keluar layar.

## Detail teknis
Tambahkan aturan responsif berbasis orientasi landscape dan tinggi viewport pada shell bersama, sehingga seluruh halaman mendapat perbaikan yang konsisten.
