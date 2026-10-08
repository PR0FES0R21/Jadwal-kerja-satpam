# Jaga MongoDB API — Netlify

Server Node.js 24 ini menyimpan akun, sesi login, catatan saat ini, dan versi sebelumnya di MongoDB Atlas. Frontend Sites mengaksesnya melalui proxy HTTPS; credential MongoDB tidak dikirim ke browser.

## Deploy Netlify

Import repository `PR0FES0R21/Jadwal-kerja-satpam`, branch `main`. Root `netlify.toml` mengatur base directory `backend`, build `npm ci --omit=dev`, publish `public`, dan Functions `netlify/functions`. Kode frontend Sites tidak diterbitkan oleh deploy ini.

Tambahkan `MONGODB_URI`, `MONGODB_DATABASE=jaga`, `JAGA_API_KEY`, dan `OWNER_EMAIL` lewat Netlify Environment Variables dengan scope Functions (atau All scopes). Set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x`. NODE_VERSION=24 sudah diatur untuk build. Jangan menaruh credential di repository atau netlify.toml. Perubahan env memerlukan deploy ulang.

Setelah publish, GET `/health` harus 200. GET `/ready` dengan header `Authorization: Bearer <JAGA_API_KEY>` harus mengembalikan `{ready:true}` untuk membuktikan koneksi MongoDB; endpoint ini membuat indeks sesi/pemulihan, tidak membuat akun atau menulis jadwal. Health saja tidak membuktikan koneksi database.

Frontend Sites tetap memakai alamat yang sekarang. Setelah backend lolos pengujian, atur `JAGA_BACKEND_URL` ke origin HTTPS Netlify dan API key yang sama, lalu publish frontend. Jangan aktifkan konfigurasi frontend sebelum database terbukti terhubung.

Untuk lokal, `npm start --prefix backend` menjalankan adapter HTTP dari core API yang sama. Adapter Netlify tidak membuka port dan memakai Web Request/Response. Batas JSON 4 MiB menyediakan ruang di bawah batas payload Netlify. Pool MongoDB digunakan ulang selama instance hangat, maksimum 5 koneksi dengan idle timeout 10 detik. Initialization yang gagal menutup client dan bisa dicoba kembali.

Environment server:
- `MONGODB_URI`: URI database lengkap, password dengan URL encoding.
- `MONGODB_DATABASE`: `jaga`.
- `JAGA_API_KEY`: secret acak yang sama dengan secret pada Sites.
- `OWNER_EMAIL`: email akun ChatGPT pemilik aplikasi.
- `NODE_VERSION`: `24`.

Environment Sites:
- `JAGA_BACKEND_URL`: URL HTTPS backend Netlify.
- `JAGA_API_KEY`: secret yang sama.
- `JAGA_OWNER_EMAIL`: email pemilik yang sama.

Pembuatan akun dan pemulihan password memerlukan identitas pemilik dari ChatGPT. Username/password aplikasi kemudian digunakan untuk login biasa. Sesi HttpOnly berlaku 90 hari dan diperpanjang ketika aktif. Password di-hash menggunakan scrypt dan salt acak. Token sesi disimpan sebagai hash.

Setiap perubahan disimpan dengan transaksi MongoDB: salinan versi lama + perubahan saat ini + tanda idempotensi. Penulisan hanya diterima jika revision cocok. Versi lama tidak dihapus otomatis. Tidak tersedia endpoint penghapusan permanen catatan. TTL hanya berlaku untuk sesi dan penghitung percobaan login.

Versi sebelumnya di database bukan cadangan terpisah dari cluster. Tetap unduh JSON ke tempat terpisah; aktifkan backup Atlas sesuai paket yang tersedia untuk melindungi dari hilangnya seluruh cluster.

Pastikan Network Access Atlas mengizinkan koneksi keluar backend Netlify. Hindari membuka database ke semua IP bila alamat/rentang keluar yang tetap tersedia.

`/health` menguji proses HTTP. `/ready` dengan authorization internal menguji koneksi database. Health HTTP sukses tidak membuktikan MongoDB terhubung.
