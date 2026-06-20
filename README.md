# WhatsApp Assistant Bot

Bot WhatsApp pintar yang dirancang sebagai Asisten Pribadi berbasis AI. Proyek ini memadukan LLM (Groq API) dengan integrasi lokal (PostgreSQL & Regex) untuk memberikan pengalaman asisten yang cepat, kontekstual, dan sangat efisien.

## 🚀 Fitur yang Telah Dibangun

1. **AI Chat & Long-term Memory**
   - Obrolan natural menggunakan **Llama 3.3 70B** (Groq API) dengan fitur *auto-fallback* secara *seamless* ke Llama 3.1 8B jika limit API utama sedang habis.
   - **Memori Jangka Panjang:** Bot otomatis mengekstrak fakta dan preferensi pengguna dari obrolan, lalu menyimpannya di database (PostgreSQL) agar bot tidak mudah lupa.
   - **Context Window:** Riwayat obrolan (history) otomatis kadaluwarsa setelah 30 menit untuk menghemat token dan menjaga percakapan tetap relevan.
   - Manajemen Memori: `!ai memory` (melihat daftar ingatan), `!ai forget <id>` (melupakan ingatan spesifik), `!ai clear` (menghapus riwayat percakapan saat ini).

2. **Sistem Pengingat (Reminder) Super Cerdas**
   - Mendeteksi instruksi waktu alami (contoh: "ingatkan aku 10 menit lagi", "besok jam 8 pagi rapat").
   - Mendukung pengingat rutin / berulang dengan mode Cron (contoh: "ingatkan setiap hari jam 07:00 sarapan").
   - Manajemen pengingat: `!reminder list`, `!reminder hapus <id>`, `!reminder stop <id>`.

3. **Fitur "Tunda" (Snooze)**
   - Saat alarm pengingat berbunyi, Anda cukup membalas pesan bot dengan "tunda 15 menit" atau "nanti sejam lagi", dan bot akan otomatis menunda serta menjadwalkan ulang alarm tersebut.

4. **Message Edit Handler**
   - Mengubah isi pengingat kini cukup dengan meng-*edit* pesan pembuatannya di WhatsApp. Bot akan mendeteksi event edit pesan (protocolMessage type 14) dan langsung memperbarui waktu atau isi agenda di database secara otomatis tanpa perintah tambahan.

5. **Knowledge Base Pribadi**
   - Bot mendukung penyimpanan referensi penting milik pengguna agar bisa dipakai ulang saat chat AI.
   - Perintah yang tersedia:
     - `!kb help`
     - `!kb list`
     - `!kb tambah Judul | Isi catatan | tag1,tag2`
     - `!kb cari <kata kunci>`
     - `!kb hapus <nomor>`
   - Knowledge Base akan ikut dimasukkan ke konteks AI jika relevan dengan pertanyaan pengguna.

6. **Daily Planner Otomatis**
   - Bot mendukung planner harian yang bisa dijadwalkan untuk mengirim ringkasan agenda otomatis pada jam tertentu.
   - Perintah yang tersedia:
     - `!plan help`
     - `!plan besok 07:00 | review task, meeting tim, follow up client`
     - `!plan list`
     - `!plan hariini`
     - `!plan hapus <id>`
   - Planner disimpan di database dan dicek otomatis setiap menit bersama scheduler reminder.

7. **Server & Health Monitoring**
   - Ketik `!status` atau `!ping` untuk melihat kesehatan server bot: Uptime, penggunaan RAM, status & latensi Database (PostgreSQL), dan jumlah pengingat yang sedang aktif.

8. **Typo Correction (Levenshtein Distance)**
   - Dilengkapi algoritma lokal untuk mendeteksi *typo* pada pemanggilan perintah secara diam-diam (*silent*). Jika Anda mengetik `!remindr` atau `!ia`, bot akan otomatis mengoreksinya di latar belakang untuk menghemat panggilan API ke AI.

---

## 💻 Persyaratan Sistem

- **Node.js** (v18 atau lebih baru)
- **PostgreSQL** (terinstal dan berjalan di latar belakang)
- **Groq API Key** (Gratis, dapat diambil di [console.groq.com](https://console.groq.com/))

---

## 🛠️ Panduan Instalasi (Untuk Laptop / Server Lain)

Jika Anda men-clone (*pull*) proyek ini dari GitHub ke laptop atau server lain, ikuti langkah berikut:

### 1. Download & Masuk ke Folder
```bash
git clone <url-repo-github-anda>
cd wbot
```

### 2. Install Dependensi (Library)
```bash
npm install
```

### 3. Siapkan Database PostgreSQL
Pastikan Anda sudah menginstal PostgreSQL di laptop/server tersebut. 
Anda hanya perlu memastikan PostgreSQL *running*, kemudian buat user/password sesuka Anda.
**Catatan:** Anda tidak perlu membuat database `wbot` maupun tabel-tabelnya secara manual. Saat bot dijalankan pertama kali, aplikasi akan otomatis membuat database `wbot` dan membangun semua tabel strukturnya.

### 4. Konfigurasi Environment Variables (`.env`)
Aplikasi membutuhkan file konfigurasi. Salin file template yang sudah disediakan:
```bash
cp .env.example .env
```
Buka file `.env` di teks editor, dan sesuaikan isinya:
```env
# WhatsApp config
SESSION_DIR=./auth_info

# Groq API config
GROQ_API_KEY=masukkan_api_key_groq_anda_disini

# Database config
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres            # Sesuaikan dengan username PostgreSQL Anda
DB_PASSWORD=password_rahasia # Sesuaikan dengan password PostgreSQL Anda
DB_NAME=wbot
```

### 5. Jalankan Bot

**Opsi umum:**
```bash
npm run dev
```

**Jika memakai Windows PowerShell dan muncul error `npm.ps1 cannot be loaded`:**
```bat
npm.cmd run dev
```

**Alternatif paling aman tanpa npm:**
```bat
node src/index.js
```

### 6. Login WhatsApp (Scan QR Code)
- Saat pertama kali dijalankan, sebuah **QR Code** akan muncul di layar terminal.
- Buka WhatsApp di HP Anda -> pilih **Perangkat Tertaut (Linked Devices)** -> **Tautkan Perangkat**.
- Scan QR Code yang muncul di terminal.
- Tunggu beberapa saat hingga muncul pesan: `"Koneksi WhatsApp sukses terhubung!"`. Bot siap melayani Anda!

**Catatan sesi login:**
- Session WhatsApp disimpan di folder `auth_info/` (atau sesuai nilai `SESSION_DIR` di file `.env`).
- Selama folder session itu masih ada dan akun tidak logout, Anda **tidak perlu scan QR lagi** saat bot dijalankan ulang.
- QR hanya perlu di-scan ulang jika folder session terhapus, session rusak, atau WhatsApp melakukan logout perangkat.

### 7. Menjalankan Test
```bash
node src/testDB.js
node src/testReminder.js
node src/testMemory.js
node src/testFase4.js
```

**Catatan penting:**
- PostgreSQL harus dalam keadaan aktif sebelum menjalankan bot atau test.
- Jika PostgreSQL mati, aplikasi akan gagal konek ke `localhost:5432`.

---

## 📂 Struktur Direktori Utama
- `src/ai/`: Pusat kecerdasan bot (Brain, Gemini Chat AI, Memory Service, Reminder Service, Knowledge Base Service, dan Planner Service).
- `src/bot/`: Logika komunikasi dengan WhatsApp Baileys (Client, Message Handler, Router).
- `src/database/`: Konfigurasi & Inisialisasi PostgreSQL (`db.js`).
- `src/testFase4.js`: Skrip verifikasi fitur FASE 4 termasuk edit handler, knowledge base, planner, dan status server.

---

