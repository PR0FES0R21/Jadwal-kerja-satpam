# Jaga MongoDB API

Server Node.js 24 ini menyimpan akun, sesi login, catatan saat ini, dan versi sebelumnya di MongoDB Atlas. Frontend Sites mengaksesnya melalui proxy HTTPS; credential MongoDB tidak dikirim ke browser.

Render: build `npm ci --prefix backend --omit=dev`; start `node backend/server.mjs`.

Environment server:
- `MONGODB_URI`: URI database lengkap, password dengan URL encoding.
- `MONGODB_DATABASE`: `jaga`.
- `JAGA_API_KEY`: secret acak yang sama dengan secret pada Sites.
- `OWNER_EMAIL`: email akun ChatGPT pemilik aplikasi.
- `NODE_VERSION`: `24`.

Environment Sites:
- `JAGA_BACKEND_URL`: URL HTTPS server Render.
- `JAGA_API_KEY`: secret yang sama.
- `JAGA_OWNER_EMAIL`: email pemilik yang sama.

Pembuatan akun dan pemulihan password memerlukan identitas pemilik dari ChatGPT. Username/password aplikasi kemudian digunakan untuk login biasa. Sesi HttpOnly berlaku 90 hari dan diperpanjang ketika aktif. Password di-hash menggunakan scrypt dan salt acak. Token sesi disimpan sebagai hash.

Setiap perubahan disimpan dengan transaksi MongoDB: salinan versi lama + perubahan saat ini + tanda idempotensi. Penulisan hanya diterima jika revision cocok. Versi lama tidak dihapus otomatis. Tidak tersedia endpoint penghapusan permanen catatan. TTL hanya berlaku untuk sesi dan penghitung percobaan login.

Versi sebelumnya di database bukan cadangan terpisah dari cluster. Tetap unduh JSON ke tempat terpisah; aktifkan backup Atlas sesuai paket yang tersedia untuk melindungi dari hilangnya seluruh cluster.

Pastikan Network Access Atlas mengizinkan alamat keluar Render di region server. Hindari membuka database ke semua IP bila rentang IP Render yang tepat tersedia.

`/health` menguji proses HTTP. `/ready` dengan authorization internal menguji koneksi database. Health HTTP sukses tidak membuktikan MongoDB terhubung.
