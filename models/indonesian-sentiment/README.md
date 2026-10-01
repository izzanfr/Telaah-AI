---
license: mit
language:
  - id
library_name: transformers.js
pipeline_tag: text-classification
base_model: w11wo/indonesian-roberta-base-sentiment-classifier
datasets:
  - indonlp/indonlu
tags:
  - onnx
  - transformers.js
  - sentiment-analysis
  - indonesian
---

# Indonesian RoBERTa Sentiment (ONNX int8)

Versi **ONNX int8** dari [`w11wo/indonesian-roberta-base-sentiment-classifier`](https://huggingface.co/w11wo/indonesian-roberta-base-sentiment-classifier)
karya **Wilson Wongso** (lisensi MIT), untuk dijalankan langsung di browser dengan
[Transformers.js](https://huggingface.co/docs/transformers.js). Dipakai oleh aplikasi **Telaah AI** (analisis feedback peserta pelatihan).

- Label: `0 = positive`, `1 = neutral`, `2 = negative`
- Konversi: `optimum` → ONNX, lalu kuantisasi dinamis int8 per-channel (AVX2). Bobot tidak diubah selain kuantisasi.
- Ukuran: 126 MB (`onnx/model_quantized.onnx`)

## Penting: tanpa token spesial

Model asli dilatih **tanpa** token `<s>` / `</s>` (post-processor tokenizer-nya hanya ByteLevel).
Tokenisasi harus memakai `add_special_tokens: false`:

```js
import { AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers';

const id = '<username>/telaah-indonesian-sentiment-onnx';
const tokenizer = await AutoTokenizer.from_pretrained(id);
const model = await AutoModelForSequenceClassification.from_pretrained(id, { dtype: 'q8', device: 'wasm' });

const enc = tokenizer('materinya sangat membantu', { add_special_tokens: false, truncation: true, max_length: 510 });
const { logits } = await model(enc);
```

Proses satu teks per inferensi agar skor deterministik (kuantisasi dinamis menghitung rentang per batch).

## Akurasi (SmSA test, 500 kalimat)

| Versi | Akurasi | Macro-F1 |
|---|---|---|
| Asli (PyTorch fp32) | 93,2% | 91,0 |
| ONNX int8, tanpa token spesial | 93,4% | 91,2 |
| ONNX int8, dengan token spesial | 91,0% | 86,6 |

Diukur ulang dengan skrip evaluasi Telaah AI. Pada feedback pelatihan (90 komentar), pipeline Telaah AI (model + leksikon) mencapai 87,8%.

## Keterbatasan

Dilatih pada ulasan & komentar umum (SmSA), bukan khusus feedback pelatihan. Sarkasme dan kalimat campuran pujian/keluhan
adalah sumber kesalahan terbesar. Model mengklasifikasi (positif/netral/negatif), tidak menghasilkan teks.
