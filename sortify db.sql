-- 1. Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    kelas VARCHAR(50) NOT NULL,
    total_poin INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Master Kategori Sampah
CREATE TABLE IF NOT EXISTS kategori_sampah (
    id SERIAL PRIMARY KEY,
    nama_kategori VARCHAR(50) NOT NULL,
    deskripsi TEXT
);

INSERT INTO kategori_sampah (id, nama_kategori, deskripsi) 
VALUES
(1, 'Organik', 'Sampah yang mudah membusuk dan terurai secara alami (sisa makanan, daun).'),
(2, 'Anorganik', 'Sampah yang sulit terurai dan dapat didaur ulang (plastik, kertas, kaca, logam).'),
(3, 'B3', 'Sampah Bahan Berbahaya dan Beracun (baterai, lampu, obat kedaluwarsa).')
ON CONFLICT (id) DO NOTHING;

-- 3. Tabel Transaksi Laporan Sampah
CREATE TABLE IF NOT EXISTS laporan_sampah (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    kategori_id INT REFERENCES kategori_sampah(id) ON DELETE RESTRICT,
    foto_url TEXT, 
    poin_didapat INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Panduan Sampah
CREATE TABLE IF NOT EXISTS panduan_sampah (
    id SERIAL PRIMARY KEY,
    kategori_id INT REFERENCES kategori_sampah(id) ON DELETE CASCADE,
    nama_sampah VARCHAR(100) NOT NULL,
    cara_membersihkan TEXT,
    cara_mengemas TEXT,
    ide_daur_ulang TEXT
);