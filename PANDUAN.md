# Jaga — Kode sumber aplikasi

Versi 2, 8 Oktober 2026. Commit sumber: 423909686d555632e38ae9c6bb9927b86d32ec77

## Isi dan fitur

Kalender siklus P1 → P2 → M1 → M2 → L1 → L2, acuan Pagi 1 tanggal 12 Oktober 2026. Pagi 08.00–20.00 WIB; malam 20.00–08.00 keesokan hari. Long shift adalah istirahat dari Pagi 2 pukul 20.00 hingga Malam 1 pukul 20.00.

Tukar jaga dua arah, pelunasan FIFO, histori lunas dan tautan pembayaran, lembur, filter, laporan CSV, serta cadangan JSON. Marker tukar jaga/lembur muncul hanya pada tanggal mulai. Long shift ditampilkan sebagai bar yang menghubungkan dua tanggal, termasuk ketika melewati batas pekan.

## Menjalankan di komputer

1. Ekstrak ZIP dan buka terminal di folder `Jaga`.
2. Pasang Node.js versi 22.13 atau lebih baru, serta pnpm sesuai `packageManager` pada `package.json` (pnpm 11.25.0).
3. Jalankan:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Buka http://localhost:5173 di browser. Jika terminal menunjukkan alamat lain, gunakan alamat tersebut. Komputer dengan Node.js dan pnpm diperlukan; Android dapat digunakan untuk mengunduh dan menyimpan ZIP ini.

## Pemeriksaan dan build

```sh
pnpm exec tsc --noEmit
pnpm build
```

Proyek ini menggunakan React, TypeScript, Vinext/Vite, dan integrasi Cloudflare Workers. Build produksi ditujukan untuk lingkungan Cloudflare/Sites. Untuk hosting lain, sesuaikan konfigurasi build dan hosting. Berkas `.openai/hosting.json` mengidentifikasi Site yang sudah ada, bukan credential.

## Berkas utama

- `app/page.tsx`: antarmuka, kalender, formulir, filter, dan halaman laporan.
- `app/globals.css`: tampilan dan responsivitas.
- `lib/jaga.ts`: siklus jadwal, marker, FIFO, validasi, perhitungan jam, dan penyimpanan.
- `public/sw.js`: service worker dan cache.
- `public/manifest.webmanifest`: metadata PWA.
- `package.json` dan `pnpm-lock.yaml`: dependency dan perintah proyek.

## Data pribadi

ZIP ini berisi kode sumber, bukan catatan kerja yang tersimpan di browser. Data aplikasi disimpan melalui IndexedDB pada perangkat dan alamat situs tempat aplikasi dibuka; data tidak berpindah otomatis ke localhost atau domain baru.

Untuk memindahkan catatan: pada aplikasi lama buka Pengaturan → Unduh cadangan JSON, kemudian pada aplikasi yang baru jalankan Pengaturan → Pulihkan cadangan. Unduh cadangan data lama sebelum melakukan pemulihan.

Kode dapat diedit dan dikembangkan sendiri. Ketentuan lisensi dependency pihak ketiga tetap berlaku. README.md bawaan proyek memuat penjelasan teknis starter lebih lanjut.
