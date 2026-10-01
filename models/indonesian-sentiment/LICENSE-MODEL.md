# Lisensi model

Folder ini berisi versi ONNX int8 dari
[w11wo/indonesian-roberta-base-sentiment-classifier](https://huggingface.co/w11wo/indonesian-roberta-base-sentiment-classifier)
karya **Wilson Wongso**, dirilis dengan lisensi **MIT**. Model dasar: `flax-community/indonesian-roberta-base`,
di-fine-tune pada dataset SmSA (IndoNLU).

Konversi: `optimum` → ONNX, lalu kuantisasi dinamis int8 per-channel (AVX2). Bobot tidak diubah selain kuantisasi.
Akurasi setelah kuantisasi pada SmSA test: 93,0% (asli 93,2%).
