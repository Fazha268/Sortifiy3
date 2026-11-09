# 🌱 Sortify - Aplikasi Edukasi Pemilahan Sampah Berbasis AI

> **Sortify** adalah platform web interaktif berbasis *Eco-Tech* dan *Gamification* yang dirancang untuk mengedukasi masyarakat, khususnya pelajar, mengenai pemilahan, pembersihan, dan pengolahan sampah yang benar dengan bantuan teknologi kecerdasan buatan (*AI-simulated detection*). Proyek ini dikembangkan sebagai bagian dari tugas mata kuliah Manajemen Proyek Perangkat Lunak (MPPL).

---

## 🚀 Fitur Utama

1. **🤖 Smart Scan AI**: 
   * Unggah foto sampah atau gunakan kamera perangkat secara langsung.
   * AI mendeteksi kategori sampah secara otomatis (Organik, Anorganik, atau B3) lengkap dengan tingkat akurasi.
   * Dilengkapi fitur koreksi manual dan panduan penanganan (*cleaning & processing guide*) instan.
   * Klaim +10 poin setiap berhasil melaporkan pemilahan sampah.
2. **🏆 Leaderboard (Papan Peringkat)**:
   * Menampilkan daftar peringkat pengguna berdasarkan total poin yang dikumpulkan secara *real-time* dari database PostgreSQL.
3. **🧠 Kuis Edukasi Interaktif**:
   * Bank soal berisi 10 pertanyaan seputar pemilahan sampah.
   * Sistem pengacakan otomatis (*Fisher-Yates Shuffle*) yang mengambil 5 soal unik setiap kali kuis dimulai.
   * Dilengkapi animasi visual, umpan balik jawaban langsung, dan opsi navigasi penutup sesi (*Coba Kuis Lagi*, *Leaderboard*, *Smart Scan*).
4. **📖 Panduan Pengolahan Sampah**:
   * Informasi lengkap mengenai tata cara pembersihan, pengemasan, dan pendauran ulang sampah Organik, Anorganik, dan B3.
5. **👤 Profil Pengguna**:
   * Kustomisasi foto profil (unggah foto baru, bingkai melingkar pas, dan tombol hapus foto yang tersimpan secara lokal).
   * Pemantauan total poin terkumpul dan informasi kelas (X, XI, XII).

---

## 🛠️ Tech Stack

* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **Frontend**: HTML5, CSS3, Bootstrap 5, Bootstrap Icons, JavaScript (ES6)
* **Storage**: `localStorage` untuk manajemen sesi pengguna & avatar

---

## 📊 Struktur Database (PostgreSQL)

Aplikasi ini menggunakan 3 tabel relasional utama:
1. **`users`**: Menyimpan data identitas pengguna (`user_id`, `nama`, `kelas`, `created_at`).
2. **`kategori_sampah`**: Tabel master referensi kategori sampah (`kategori_id`, `nama_kategori`, `deskripsi`).
3. **`laporan_sampah`**: Menyimpan riwayat pemindaian dan perolehan poin (`laporan_id`, `user_id`, `kategori_id`, `foto_url`, `created_at`).

---

## ⚙️ Cara Instalasi & Menjalankan Proyek

Ikuti langkah-langkah berikut untuk menjalankan proyek ini di komputer lokal kamu:

### 1. Prasyarat
Pastikan komputer kamu sudah terinstal:
* [Node.js](https://nodejs.org/)
* [PostgreSQL](https://www.postgresql.org/)

### 2. Kloning Repositori & Install Dependensi
```bash
# Masuk ke direktori proyek
cd sortify

# Install dependencies Node.js
npm install