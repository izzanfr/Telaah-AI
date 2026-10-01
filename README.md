# Telaah AI · Analisis Feedback

Alat web untuk menganalisis sentimen dan isi feedback peserta pelatihan. Semua proses berjalan di browser: tidak ada server dan tidak ada data yang dikirim keluar.

## Menjalankan

Klik dua kali **`start.bat`** (Windows), atau jalankan server lokal:

```bash
python serve.py
```

(`serve.py` sama seperti `python -m http.server`, tetapi menyuruh browser selalu memeriksa versi terbaru aplikasi.)

lalu buka http://localhost:5510. **Model AI hanya aktif lewat `http://`.** Bila `index.html` dibuka langsung (`file://`), aplikasi otomatis memakai mesin leksikon. Koneksi internet dibutuhkan saat pertama dibuka untuk memuat pustaka dari CDN (Transformers.js, Chart.js, d3-cloud, pdf.js, SheetJS, Lucide) dan font; model (126 MB) dimuat dari folder `models/` lokal.

## Deploy online

Lihat **[DEPLOY.md](DEPLOY.md)**: aplikasi di Vercel, model AI di Hugging Face Hub, data asli tidak ikut di-deploy.

## Sumber data

- **PDF laporan feedback kelas** (format "Feedback Kelas …"): nama kelas, tanggal, jumlah respons, rating layanan, rekomendasi, rating instruktur, jawaban "Pengalaman", dan jawaban "Saran" dibaca otomatis. Beberapa file bisa diunggah sekaligus.
- **CSV / Excel**: pilih kolom teks, kelas, jenis pertanyaan, dan rating lewat pemetaan kolom.
- **Tempel teks**: satu komentar per baris.

Tombol *Muat data contoh* memakai data **fiktif** (`assets/js/sample-data.js`). Laporan asli untuk pemakaian lokal ada di `samples/` dan bisa diimpor lewat *Impor data*.

## Tampilan

Identitas visual mengikuti logo (`assets/img/`): navy `#0A2150` dengan aksen teal `#0AAFA4`, latar putih dominan, font **Plus Jakarta Sans**, serta mode gelap. Warna sentimen (hijau-teal / abu slate / koral) sudah diuji aman untuk buta warna dan selalu disertai label teks.

## Fitur

| Tab | Isi |
|---|---|
| Ringkasan | Judul otomatis, gauge Net Sentiment Score (% positif − % negatif), KPI (positif, rating, rekomendasi, tingkat respons), waffle chart komposisi sentimen (1 kotak = 1 komentar), diverging bar per kelas, temuan otomatis, daftar *perlu perhatian*, sebaran panjang vs. skor, kutipan pilihan |
| Kata & Frasa | Wordcloud warna-warni (kata / 2 kata / 3 kata; bisa diwarnai menurut sentimen; bisa diklik), istilah teratas dengan batang terpecah per nada, kata pembeda per nada, kedalaman komentar, daftar kata yang diabaikan (bisa diubah) |
| Aspek | Peta 8 aspek (Materi, Instruktur, Layanan, Fasilitas, Waktu, Manfaat Kerja, Suasana, Tools/Teknis) per kalimat, matriks prioritas aspek (gelembung: frekuensi × skor), heatmap aspek × kelas |
| Skor & Rating | Perbandingan kelas, **leaderboard instruktur** (podium 3 besar, urut per OVR/atribut/responden/sebutan), kartu instruktur berfoto ala kartu pemain (skala 0–99, kode instruktur sebagai posisi) + arena head-to-head & radar, rating layanan, keselarasan rating vs. nada teks |
| Jelajah | Semua komentar dengan sorotan kata sentimen, tag aspek/saran, urutan, dan **koreksi label manual** |

Filter global (kelas, jenis pertanyaan, sentimen, aspek, pencarian, kata dari wordcloud) berlaku untuk semua tab. Ekspor tersedia sebagai CSV, PNG wordcloud, JSON, dan cetak laporan. Tekan `/` untuk langsung ke kolom pencarian.

## Daftar instruktur

`assets/js/instructors.js` berisi 16 instruktur Inixindo Jogja: kode (mis. `YIF`), nama resmi, panggilan, dan nama berkas foto. Nama di laporan PDF dicocokkan otomatis ke daftar ini (mis. "Satya Tegar Kusuma" → `YST`). Foto dimuat langsung dari [inixindojogja.co.id/instructor](https://inixindojogja.co.id/instructor/) (varian 300×300); bila gagal dimuat, kartu menampilkan inisial. Untuk menambah atau mengubah instruktur, cukup edit berkas tersebut.

## Cara kerja analisis sentimen

Telaah AI memakai **pipeline hybrid** yang dipilih lewat evaluasi pada data berlabel manusia (detail: `evaluation/`, angka: `models/manifest.json`, dan tombol status model di aplikasi).

1. **IndoRoBERTa**: [`w11wo/indonesian-roberta-base-sentiment-classifier`](https://huggingface.co/w11wo/indonesian-roberta-base-sentiment-classifier) (MIT, 124 jt parameter, dilatih pada SmSA/IndoNLU), dikonversi ke ONNX int8 dan dijalankan **di browser** dengan Transformers.js. Satu komentar per inferensi, tanpa token spesial (sesuai cara model dilatih) → skor deterministik.
2. **Klausa kontras**: bila ada *tapi/namun/sayangnya/cuma…*, klausa setelahnya dinilai ulang (bobot 40%).
3. **Leksikon** Bahasa Indonesia (`assets/js/lexicon.js`, `nlp.js`) ikut memberi suara (bobot 0,25; 2,0 untuk komentar ≤3 kata) dan menjadi dasar sorotan kata, aspek, serta cadangan bila model tak tersedia.
4. **Perlu ditinjau**: keyakinan < 70% atau konflik kuat model–leksikon. Filter khusus tersedia di tab Jelajah; koreksi manual selalu menang.

### Hasil evaluasi (akurasi, diukur di browser)

| Dataset | Leksikon lama | Model saja | **Hybrid (dipakai)** |
|---|---|---|---|
| SmSA test (500 kalimat, held-out) | 75,4% | 93,2% | **93,2%** |
| Feedback pelatihan (90 komentar) | 86,7%¹ | 83,3% | **87,8%** |
| ↳ 60 komentar yang tidak dipakai menyusun leksikon | 80,0% | 86,7% | **86,7%** |

¹ bias ke atas: leksikon disusun dari 30 komentar asli di set ini.
Komentar yang **tidak** ditandai “Perlu ditinjau” akurat 95,8% (SmSA) dan 91,7% (feedback).
Delapan model sentimen Bahasa Indonesia/multibahasa dibandingkan; parameter pipeline dipilih dari SmSA *validation*, bukan dari set uji.

Model ini **mengklasifikasi**, bukan menghasilkan teks. Ia tidak dapat “berhalusinasi”, tetapi tetap bisa keliru (terutama sarkasme dan kalimat campuran).

### Mengulang evaluasi

```bash
cd evaluation/scripts
python evaluate.py        # butuh torch, transformers, pandas, scikit-learn; lexicon via Node
```

`export_onnx.py` membuat ulang `models/indonesian-sentiment/` dari model Hugging Face. Dataset: SmSA (IndoNLU, CC BY-SA 4.0), NusaX-Senti (CC BY-SA 4.0), dan `feedback_gold.json` (buatan proyek ini).

### Mesin leksikon (pendukung)

`assets/js/nlp.js` memakai leksikon Bahasa Indonesia + Inggris (`assets/js/lexicon.js`) dengan:
normalisasi slang (`kren`, `bgt`, `yg`, …), stemmer ringan (me-/ber-/di-/-kan/-nya), frasa (`luar biasa`, `terima kasih`), negasi (`tidak`, `kurang`, `tanpa`), penguat/pelemah (`sangat`, `banget`, `cukup`), toleransi salah ketik, emotikon, dan penekanan huruf kapital. Skor per komentar berada di rentang −1…+1 (positif ≥ 0,15, negatif ≤ −0,15).

Kosakata, kata kunci aspek, dan stopword bisa ditambah langsung di `lexicon.js`.

## Penyimpanan

Semua tersimpan otomatis di browser (`localStorage`) dan bertahan setelah refresh: data kelas, koreksi label manual, kata yang diabaikan, serta pilihan tampilan (tab, filter, urutan, pengaturan wordcloud, urutan leaderboard, pasangan di arena). Penyimpanan ini per browser; tombol *Reset* mengembalikan filter, dan *Hapus semua* di dialog impor menghapus data.
