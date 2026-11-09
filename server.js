require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi Google Gen AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi SQLite yang aman untuk Serverless Vercel
let db = null;
const isVercel = process.env.VERCEL === '1';

try {
  const sqlite3 = require('sqlite3').verbose();
  const dbFile = isVercel ? path.join('/tmp', 'database.sqlite') : path.join(__dirname, 'database.sqlite');
  
  db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Gagal terhubung ke SQLite:', err.message);
    else console.log('Berhasil terhubung ke database SQLite di:', dbFile);
  });

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kelas TEXT NOT NULL,
      total_poin INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS quiz_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      score INTEGER,
      total_soal INTEGER,
      poin INTEGER,
      tanggal TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  });
} catch (e) {
  console.log("Berjalan dalam mode tanpa database file lokal (Serverless fallback).");
}

// Konfigurasi Multer Upload (Aman untuk Vercel /tmp)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// --- ENDPOINT API ---

// 1. Endpoint Login / Register
app.post('/api/login', (req, res) => {
  const { nama, kelas } = req.body;
  if (!nama || !kelas) return res.status(400).json({ success: false, message: 'Nama dan kelas wajib diisi.' });
  
  if (!db) {
    return res.json({ success: true, data: { id: 1, nama, kelas, total_poin: 100 } });
  }

  db.get('SELECT * FROM users WHERE nama = ? AND kelas = ?', [nama, kelas], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (row) {
      res.json({ success: true, data: row });
    } else {
      db.run('INSERT INTO users (nama, kelas, total_poin) VALUES (?, ?, 0)', [nama, kelas], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, data: { id: this.lastID, nama, kelas, total_poin: 0 } });
      });
    }
  });
});

// 2. Endpoint Leaderboard
app.get('/api/leaderboard', (req, res) => {
  if (!db) {
    return res.json([
      { id: 1, nama: "Demo User", kelas: "Informatika", total_poin: 150 }
    ]);
  }
  db.all('SELECT id, nama, kelas, total_poin FROM users ORDER BY total_poin DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows);
  });
});

// 3. Endpoint Smart Scan AI
app.post('/api/scan', upload.single('image'), async (req, res) => {
  try {
    const userId = req.body.user_id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Data foto tidak ditemukan.' });
    }

    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    let aiResult;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        config: {
          temperature: 0.1,
          systemInstruction: `Anda adalah sistem AI computer vision dan pakar pengolahan sampah profesional yang sangat teliti. Kenali objek fisik apa adanya secara SANGAT SPESIFIK.`
        },
        contents: [
          { inlineData: { data: base64Image, mimeType: mimeType } },
          { text: `Analisis foto sampah ini secara cermat. Tentukan nama benda secara spesifik sesuai bentuk aslinya. Pilih kategori: 'Sampah Organik', 'Sampah Anorganik', 'Sampah B3', atau 'Sampah Residu'. Berikan poin (10-30) dan panduan pembersihan langkah demi langkah.
          WAJIB output JSON murni: {"kategori": "Sampah Anorganik - Botol Plastik Air Mineral", "poin": 20, "deskripsi": "1. Kosongkan sisa cairan.\\n2. Lepaskan label.\\n3. Setorkan ke bank sampah."}` }
        ]
      });

      const rawText = response.text ? response.text.trim() : "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON tidak ditemukan.");
      }
    } catch (err) {
      aiResult = {
        kategori: "Sampah Anorganik - Plastik / Kemasan Umum",
        poin: 20,
        deskripsi: "1. Bersihkan sisa kotoran atau cairan.\n2. Setorkan ke fasilitas pengelolaan sampah terdekat."
      };
    }

    const finalPoin = Number(aiResult.poin) || 20;
    const finalKategori = aiResult.kategori || "Sampah Anorganik - Umum";
    const finalDeskripsi = aiResult.deskripsi || "1. Bersihkan objek.\n2. Kelola sesuai jenisnya.";

    if (db && userId) {
      db.run('UPDATE users SET total_poin = total_poin + ? WHERE id = ?', [finalPoin, userId], (err) => {
        if (err) console.error("Gagal update poin user.");
      });
    }

    res.json({ success: true, kategori: finalKategori, poin: finalPoin, deskripsi: finalDeskripsi });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kesalahan server AI.' });
  }
});

// 4. Endpoint Tambah Poin & Simpan Riwayat Kuis
app.post('/api/add-quiz-points', (req, res) => {
  const { user_id, score, total_soal, poin } = req.body;
  if (poin === undefined) return res.status(400).json({ success: false, message: 'Data tidak valid.' });

  if (!db || !user_id) {
    return res.json({ success: true, message: 'Poin berhasil disimpan (Demo mode).' });
  }

  const tanggal = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  db.run('INSERT INTO quiz_history (user_id, score, total_soal, poin, tanggal) VALUES (?, ?, ?, ?, ?)', 
    [user_id, score || 0, total_soal || 5, poin, tanggal], (err) => {
      if (err) console.error("Gagal simpan riwayat kuis:", err.message);
  });

  db.run('UPDATE users SET total_poin = total_poin + ? WHERE id = ?', [poin, user_id], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Gagal update poin user.' });
    res.json({ success: true, message: 'Poin & riwayat kuis berhasil disimpan.' });
  });
});

// 5. Endpoint Ambil Riwayat Kuis User
app.get('/api/quiz-history/:user_id', (req, res) => {
  const userId = req.params.user_id;
  if (!db) return res.json([]);
  db.all('SELECT * FROM quiz_history WHERE user_id = ? ORDER BY id DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(rows);
  });
});

// 6. Endpoint Update Profil
app.post('/api/update-profile', (req, res) => {
  const { user_id, nama, kelas } = req.body;
  if (!db) return res.json({ success: true });
  db.run('UPDATE users SET nama = ?, kelas = ? WHERE id = ?', [nama, kelas, user_id], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// Jalankan server secara lokal
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server Sortify AI berjalan di http://localhost:${PORT}`));
}

module.exports = app;