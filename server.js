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

// Penyimpanan Memori Sementara (Aman & Anti-Crash untuk Vercel Serverless)
let usersMemory = [
  { id: 1, nama: "Demo User", kelas: "Informatika", total_poin: 100 }
];
let quizHistoryMemory = [];

// Konfigurasi Multer Upload (Aman untuk Vercel /tmp)
const isVercel = process.env.VERCEL === '1';
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
  
  let user = usersMemory.find(u => u.nama === nama && u.kelas === kelas);
  if (!user) {
    user = { id: usersMemory.length + 1, nama, kelas, total_poin: 0 };
    usersMemory.push(user);
  }
  res.json({ success: true, data: user });
});

// 2. Endpoint Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const sortedUsers = [...usersMemory].sort((a, b) => b.total_poin - a.total_poin);
  res.json(sortedUsers);
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

    if (userId) {
      const user = usersMemory.find(u => u.id == userId);
      if (user) user.total_poin += finalPoin;
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

  const tanggal = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  if (user_id) {
    quizHistoryMemory.unshift({ user_id, score: score || 0, total_soal: total_soal || 5, poin, tanggal });
    const user = usersMemory.find(u => u.id == user_id);
    if (user) user.total_poin += Number(poin);
  }

  res.json({ success: true, message: 'Poin & riwayat kuis berhasil disimpan.' });
});

// 5. Endpoint Ambil Riwayat Kuis User
app.get('/api/quiz-history/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const userHistory = quizHistoryMemory.filter(h => h.user_id == userId);
  res.json(userHistory);
});

// 6. Endpoint Update Profil
app.post('/api/update-profile', (req, res) => {
  const { user_id, nama, kelas } = req.body;
  const user = usersMemory.find(u => u.id == user_id);
  if (user) {
    user.nama = nama || user.nama;
    user.kelas = kelas || user.kelas;
  }
  res.json({ success: true });
});

// Jalankan server secara lokal
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server Sortify AI berjalan di http://localhost:${PORT}`));
}

module.exports = app;