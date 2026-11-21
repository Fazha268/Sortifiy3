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

// Penyimpanan Memori Sementara
let usersMemory = [
  { id: 1, nama: "Demo User", kelas: "Informatika", total_poin: 100 }
];
let quizHistoryMemory = [];

// Konfigurasi Multer Upload
const isVercel = process.env.VERCEL === '1';
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = isVercel
      ? path.join('/tmp', 'uploads')
      : path.join(__dirname, 'public', 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

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

  if (!nama || !kelas) {
    return res.status(400).json({
      success: false,
      message: 'Nama dan kelas wajib diisi.'
    });
  }

  let user = usersMemory.find(
    u => u.nama === nama && u.kelas === kelas
  );

  if (!user) {
    user = {
      id: usersMemory.length + 1,
      nama,
      kelas,
      total_poin: 0
    };

    usersMemory.push(user);
  }

  res.json({ success: true, data: user });
});

// 2. Endpoint Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const sortedUsers = [...usersMemory].sort(
    (a, b) => b.total_poin - a.total_poin
  );

  res.json(sortedUsers);
});

// 3. Endpoint Smart Scan AI
app.post('/api/scan', upload.single('image'), async (req, res) => {
  try {
    const userId = req.body.user_id;

    // Validasi foto
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Data foto tidak ditemukan.'
      });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Pastikan format gambar valid
    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'File yang diunggah harus berupa gambar.'
      });
    }

    // Kirim gambar ke Gemini AI
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',

      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',

        systemInstruction: `
          Kamu adalah AI Computer Vision khusus
          untuk mengidentifikasi dan mengklasifikasikan sampah.

          Analisis objek berdasarkan gambar yang benar-benar
          diberikan pengguna.

          Jangan menebak objek yang tidak terlihat jelas.
          Jangan selalu menganggap objek sebagai plastik.
          Identifikasi material dan bentuk objek terlebih dahulu.
        `
      },

      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        },
        {
          text: `
            Identifikasi objek sampah pada gambar.

            Pilih SATU kategori utama dari tiga kategori berikut:

            1. Sampah Organik
               Contoh: sisa makanan, daun, kulit buah.

            2. Sampah Anorganik
               Contoh: botol plastik, kertas, kardus,
               kaleng, kaca, dan kemasan.

            3. Sampah B3
               Contoh: baterai bekas, lampu neon,
               limbah bahan kimia, dan benda berbahaya.

            ATURAN PENTING:
            - Kenali objek sesuai gambar, bukan berdasarkan contoh.
            - Jangan otomatis memilih plastik.
            - Bedakan kertas, tisu, plastik, logam, dan kaca.
            - Jika objek tidak dapat dikenali, nyatakan
              bahwa objek tidak dapat diidentifikasi.
            - Jangan mengarang material yang tidak terlihat.
            - Tisu kertas yang kotor tidak boleh dianggap
              sebagai bahan yang dapat didaur ulang.
            - Untuk sistem ini, gunakan hanya tiga kategori utama.

            Berikan hasil JSON dengan format:

            {
              "teridentifikasi": true,
              "kategori": "Sampah Anorganik",
              "jenis": "Tisu Kertas",
              "poin": 20,
              "deskripsi": "Panduan pengolahan sampah."
            }

            Jika objek tidak dapat dikenali:

            {
              "teridentifikasi": false,
              "kategori": "",
              "jenis": "Tidak diketahui",
              "poin": 0,
              "deskripsi": "Objek tidak dapat diidentifikasi."
            }

            Poin harus berada pada rentang 10 sampai 30
            jika objek berhasil diidentifikasi.
          `
        }
      ]
    });

    // Ambil hasil AI
    const rawText = response.text ? response.text.trim() : '';

    if (!rawText) {
      throw new Error('Gemini tidak memberikan respons.');
    }

    const aiResult = JSON.parse(rawText);

    // Validasi hasil identifikasi
    if (aiResult.teridentifikasi !== true) {
      return res.status(422).json({
        success: false,
        message: 'Objek belum dapat dikenali. Silakan foto ulang dengan pencahayaan yang lebih baik.'
      });
    }

    const kategoriValid = [
      'Sampah Organik',
      'Sampah Anorganik',
      'Sampah B3'
    ];

    if (!kategoriValid.includes(aiResult.kategori)) {
      throw new Error('Kategori AI tidak valid.');
    }

    if (
      typeof aiResult.jenis !== 'string' ||
      !aiResult.jenis.trim() ||
      !Number.isFinite(Number(aiResult.poin)) ||
      Number(aiResult.poin) < 10 ||
      Number(aiResult.poin) > 30
    ) {
      throw new Error('Data hasil klasifikasi tidak valid.');
    }

    // Susun hasil untuk frontend
    const finalKategori =
      `${aiResult.kategori} - ${aiResult.jenis}`;

    const finalPoin = Number(aiResult.poin);

    const finalDeskripsi =
      aiResult.deskripsi || 'Kelola sampah sesuai jenisnya.';

    // Tambahkan poin hanya jika klasifikasi berhasil
    if (userId) {
      const user = usersMemory.find(u => u.id == userId);

      if (user) {
        user.total_poin += finalPoin;
      }
    }

    // Kirim hasil ke frontend
    return res.json({
      success: true,
      kategori: finalKategori,
      poin: finalPoin,
      deskripsi: finalDeskripsi
    });

  } catch (error) {
    console.error('SMART SCAN ERROR:', error);

    return res.status(502).json({
      success: false,
      message: 'AI gagal memproses gambar. Silakan coba kembali.'
    });

  } finally {
    // Hapus file sementara setelah selesai diproses
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error(
          'Gagal menghapus file sementara:',
          cleanupError
        );
      }
    }
  }
});

// 4. Endpoint Tambah Poin & Simpan Riwayat Kuis
app.post('/api/add-quiz-points', (req, res) => {
  const { user_id, score, total_soal, poin } = req.body;

  if (poin === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Data tidak valid.'
    });
  }

  const tanggal = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  if (user_id) {
    quizHistoryMemory.unshift({
      user_id,
      score: score || 0,
      total_soal: total_soal || 5,
      poin,
      tanggal
    });

    const user = usersMemory.find(u => u.id == user_id);

    if (user) {
      user.total_poin += Number(poin);
    }
  }

  res.json({
    success: true,
    message: 'Poin & riwayat kuis berhasil disimpan.'
  });
});

// 5. Endpoint Ambil Riwayat Kuis User
app.get('/api/quiz-history/:user_id', (req, res) => {
  const userId = req.params.user_id;

  const userHistory = quizHistoryMemory.filter(
    h => h.user_id == userId
  );

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
  app.listen(PORT, () => {
    console.log(
      `Server Sortify AI berjalan di http://localhost:${PORT}`
    );
  });
}

module.exports = app;