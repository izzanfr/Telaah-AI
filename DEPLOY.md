# Deploy Telaah AI ke Vercel

Aplikasi (±0,5 MB) di-deploy ke **Vercel**; model AI (126 MB) disimpan di **Hugging Face Hub**,
karena paket Vercel Hobby membatasi unggahan 100 MB per deployment.

Yang **tidak** ikut di-deploy (diatur `.vercelignore`): `samples/`, `evaluation/` (data asli),
berkas model lokal `models/indonesian-sentiment/`, dan alat lokal (`serve.py`, `start.bat`).
Tombol *Muat data contoh* di versi online memakai data **fiktif** (`assets/js/sample-data.js`).

---

## 1. Unggah model ke Hugging Face (sekali saja)

1. Buat akun di <https://huggingface.co/join>.
2. Buat repo model baru: <https://huggingface.co/new>
   - **Model name**: `telaah-indonesian-sentiment-onnx`
   - **License**: MIT
   - **Visibility**: **Public** (harus publik agar bisa dimuat browser tanpa login)
3. Unggah isi folder `models/indonesian-sentiment/` dengan struktur yang sama:

   ```
   README.md              config.json          tokenizer.json
   tokenizer_config.json  special_tokens_map.json
   vocab.json             merges.txt           LICENSE-MODEL.md
   onnx/model_quantized.onnx
   ```

   **Cara A: lewat browser.** Di repo, buka *Files and versions* → *Add file* → *Upload files*,
   lalu seret semua berkas di atas **beserta folder `onnx`** (berkas .onnx harus berada di dalam folder `onnx/`).

   **Cara B: lewat terminal** (dari folder proyek):

   ```bash
   pip install -U huggingface_hub
   hf auth login
   hf upload izzanfr/telaah-indonesian-sentiment-onnx models/indonesian-sentiment .
   ```

   (Pada versi lama `huggingface_hub`, ganti `hf` dengan `huggingface-cli`.)

4. Buka `models/manifest.json` dan ganti baris `remote`:

   ```json
   "remote": "izzanfr/telaah-indonesian-sentiment-onnx",
   ```

## 2. Deploy aplikasi ke Vercel

**Cara termudah: Vercel CLI** (dari folder proyek, butuh Node.js):

```bash
npx vercel
```

Ikuti pertanyaannya (login, nama proyek). Saat ditanya pengaturan: *Framework* = **Other**,
*Build Command* = kosong, *Output Directory* = `.` (titik). Setelah preview berhasil:

```bash
npx vercel --prod
```

## 3. Cek setelah deploy

- Buka URL Vercel → klik **Muat data contoh** → chip di kanan atas berubah dari *Memuat model AI* menjadi **IndoRoBERTa · AI aktif**
  (unduhan pertama 126 MB dari Hugging Face; selanjutnya di-cache browser).
- Klik chip tersebut: di dialog *Keandalan analisis sentimen* tertulis *sumber: huggingface.co/izzanfr/...*.
- Bila chip menunjukkan *Mode leksikon*, periksa isi `remote` di `models/manifest.json` dan pastikan repo Hugging Face publik
  serta berkas `.onnx` ada di folder `onnx/`.

## Catatan penting

- **Privasi**: data yang diunggah pengguna tetap diproses di browser masing-masing dan tidak dikirim ke server.
  Namun URL Vercel bersifat publik; siapa pun yang tahu URL-nya bisa membuka aplikasi.
- **Paket Vercel**: Hobby (gratis) ditujukan untuk pemakaian pribadi/non-komersial. Untuk pemakaian kantor,
  gunakan paket **Pro**; Pro juga menyediakan proteksi kata sandi untuk membatasi akses.
- **Foto instruktur** dimuat langsung dari situs inixindojogja.co.id, tidak ikut di-deploy.
- **Memperbarui aplikasi**: ubah berkas, lalu jalankan lagi `npx vercel --prod`. Model di Hugging Face tidak perlu diunggah ulang.
