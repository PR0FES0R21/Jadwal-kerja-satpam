# Jaga MongoDB API

Node.js 24 dan MongoDB Atlas. `api.mjs` menangani akun dan catatan. `browser.mjs` menangani endpoint `/api/cloud/*` dengan cookie HttpOnly, pemeriksaan origin, dan credential internal. Netlify menerbitkan fungsi bersama frontend pada satu domain. Tidak ada identitas dari layanan eksternal yang diperlukan.

## Environment

- `MONGODB_URI`: URI database lengkap; URL-encode karakter khusus pada password.
- `MONGODB_DATABASE`: default `jaga`.
- `JAGA_API_KEY`: secret internal acak, tidak dikirim ke browser.
- `AWS_LAMBDA_JS_RUNTIME`: `nodejs24.x` jika dipakai di Netlify.
- `PORT`: default 10000 untuk adapter HTTP lokal.

Variabel Netlify perlu scope Functions dan deploy ulang setelah perubahan. `/health` menguji proses. `/ready` dengan `Authorization: Bearer <JAGA_API_KEY>` menguji koneksi database. Health HTTP saja tidak membuktikan MongoDB tersambung.

## Akun

`/auth/register` membuat ID acak, user, dan state kosong dalam satu transaksi. Username unik dan dinormalisasi menjadi huruf kecil. Akun lama dengan ID `owner` tetap dipertahankan beserta data dan versinya. `/auth/login` menghasilkan sesi 90 hari. `/auth/recover` memerlukan username, password baru, dan kode pemulihan; kode diganti dan sesi sebelumnya dicabut. `/auth/recovery-key` memerlukan sesi dan password saat ini sebelum menerbitkan kode baru.

Semua endpoint data memperoleh ID pengguna dari sesi server, termasuk state, versi, pemulihan versi, dan operasi idempoten. ID pengguna yang diberikan browser tidak digunakan. Setup berbasis identitas pemilik tidak tersedia lagi.

## Durabilitas

Setiap penulisan menggunakan transaksi MongoDB dengan majority write concern: versi sebelumnya, perubahan terbaru, dan tanda idempotensi. Revision harus cocok. Tidak ada endpoint hapus permanen data. TTL hanya untuk sesi dan pembatas percobaan.

Riwayat dalam cluster bukan cadangan terpisah. Tetap gunakan cadangan JSON atau backup Atlas untuk melindungi dari hilangnya seluruh cluster.

Pool koneksi digunakan ulang, maksimum 5 koneksi dengan idle timeout 10 detik. Initialization yang gagal menutup client dan dapat dicoba lagi. JSON dibatasi 4 MiB.
