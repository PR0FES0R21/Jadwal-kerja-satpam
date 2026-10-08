# Jaga — Kalender Kerja

Aplikasi kalender shift, tukar jaga dua arah dengan perhitungan FIFO, lembur, dan long shift. Setiap pengguna mendaftar memakai username/password sendiri. Akun, sesi, jadwal, dan riwayat versi tersimpan di MongoDB. Tampilan aplikasi dapat di-host sepenuhnya di Netlify.

## Deploy ke Netlify

Hubungkan repository ini, branch `main`, lalu gunakan konfigurasi root `netlify.toml`. Base directory: `frontend`; build command: `npm ci --include=dev && npm ci --prefix ../backend --omit=dev && npm run build`; publish directory: `dist`; Functions directory: `../backend/netlify/functions`. Frontend React/Vite dan API diterbitkan bersamaan pada satu domain. Build memasang dependency frontend dari lockfile npm sendiri, meskipun deteksi awal Netlify memakai pnpm root. `NETLIFY_NEXT_PLUGIN_SKIP=true` menonaktifkan runtime Next.js yang mungkin tersimpan dari konfigurasi lama di dashboard.

Set `MONGODB_URI`, `MONGODB_DATABASE=jaga`, dan `JAGA_API_KEY` pada environment variables dengan scope Functions. Gunakan Node.js 24; jika menggunakan `AWS_LAMBDA_JS_RUNTIME`, isi `nodejs24.x`. Simpan semua credential di environment, bukan repository. Konfigurasi email pemilik tidak diperlukan. Perubahan environment memerlukan deploy ulang.

Buka domain Netlify untuk masuk atau mendaftar. Sesudah mendaftar, unduh kode pemulihan dan simpan di tempat aman. Kode dapat digunakan sekali untuk mengganti password tanpa menghapus data; proses pemulihan memberikan kode baru. Akun lama tetap dapat login dengan username/password yang sama dan menyiapkan kode melalui pengaturan akun.

## Pengembangan mandiri

Node.js 24 diperlukan. Jalankan `npm ci --prefix frontend` dan `npm ci --prefix backend`. Set environment backend, lalu jalankan `npm start --prefix backend` dan `npm run dev --prefix frontend` dalam terminal terpisah. API browser memakai cookie HttpOnly dan akses pada origin yang sama.

Frontend mandiri memakai `frontend/main.tsx`, komponen UI di `components/`, halaman kalender di `app/page.tsx`, dan logika kalender di `lib/`. Build menghasilkan `frontend/dist`. File hosting alternatif dan starter pada root tidak diperlukan untuk menjalankan deployment Netlify ini.

## Penyimpanan dan keamanan akun

Setiap data, sesi, riwayat versi, dan ID operasi dibatasi oleh ID pengguna dari sesi server. Username tidak membedakan huruf besar/kecil dan memiliki indeks unik. Password disimpan sebagai hash scrypt dengan salt acak. Sesi 90 hari diperpanjang saat aktif. Token sesi dan kode pemulihan disimpan sebagai hash.

Perubahan jadwal menyimpan salinan versi sebelumnya dan memakai transaksi serta revision untuk menghindari penimpaan dari perangkat lain. Tidak tersedia endpoint penghapusan permanen catatan. Cadangan JSON dapat diunduh dan diimpor. Data lokal versi sebelumnya tetap tersedia untuk pemindahan setelah login; jika berpindah domain, unduh JSON dari domain lama dan impor pada domain baru.

`npm test --prefix backend` memeriksa pendaftaran, login, isolasi antar akun, idempotensi, konflik versi, pemulihan, kompatibilitas akun lama, dan cookie browser.

## PWA dan mode offline

Buka aplikasi lewat HTTPS, lalu ketuk **Pasang Jaga**. Di Android/Chrome, menu **Instal aplikasi** atau **Tambahkan ke layar utama** juga tersedia. Di iPhone/Safari, gunakan **Bagikan → Tambahkan ke Layar Utama**. PWA memakai login dan MongoDB yang sama dengan versi browser.

Service worker menyimpan tampilan dan aset build yang sesuai. Setelah login online berhasil, salinan catatan terakhir akun aktif disimpan di IndexedDB selama maksimal 90 hari. Saat koneksi tidak tersedia, kalender, riwayat, laporan, dan unduhan cadangan bisa dibuka dalam mode baca. Perubahan tetap memerlukan konfirmasi server; tidak ada antrean perubahan offline. Jika sambungan putus saat mengisi formulir, isian tetap tersedia untuk dicoba kembali.

Salinan offline diperbarui setelah server mengonfirmasi penyimpanan atau pemulihan versi. Logout dan pergantian akun menghapus salinan akun sebelumnya. Cache service worker hanya berisi aset aplikasi; respons API, password, token sesi, dan kode pemulihan tidak masuk cache. Menghapus data browser dapat menghapus salinan offline, sedangkan data utama tetap tersimpan di MongoDB.

Pembaruan muncul lewat tombol **Perbarui aplikasi**. Tombol menunggu formulir, proses penyimpanan, dan tampilan kode pemulihan selesai agar muat ulang tidak membuang isian. Build menyisipkan nama aset yang sebenarnya ke precache dan memberi versi cache berdasarkan isi build.
