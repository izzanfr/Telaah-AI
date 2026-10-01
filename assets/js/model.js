/* Telaah AI: model sentimen transformer (lokal, di browser).
 *
 * Sumber model:
 *   1. Folder lokal ./models/<id>/ bila ada (menjalankan aplikasi di komputer sendiri).
 *   2. Bila tidak ada (mis. versi online di Vercel), dari Hugging Face Hub sesuai
 *      `remote` di models/manifest.json.
 * Model ONNX int8 dimuat lewat Transformers.js. Tokenisasi dan inferensi
 * berjalan di perangkat; tidak ada teks yang dikirim ke server. Bila model gagal dimuat
 * (mis. dibuka lewat file:// atau offline), aplikasi tetap berjalan memakai leksikon.
 *
 * Catatan penting: model w11wo/indonesian-roberta-base-sentiment-classifier dilatih TANPA
 * token spesial <s>/</s> (post-processor tokenizer-nya hanya ByteLevel). Menambahkannya
 * menurunkan akurasi SmSA test dari 93,4% ke 91,0%, jadi add_special_tokens: false.
 */
import { AutoTokenizer, AutoModelForSequenceClassification, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js';

const MODEL_DIR = 'models/';
const MANIFEST = MODEL_DIR + 'manifest.json';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL(MODEL_DIR, location.href).href;

/** Pilih sumber model: folder lokal bila tersedia, selain itu Hugging Face Hub. */
async function resolveSource(manifest) {
  try {
    const r = await fetch(`${MODEL_DIR}${manifest.id}/config.json`, { method: 'HEAD', cache: 'no-cache' });
    if (r.ok) return { id: manifest.id, remote: false };
  } catch (e) { /* lanjut ke remote */ }
  const remote = String(manifest.remote || '').trim();
  if (!remote || remote.startsWith('GANTI_')) throw new Error('Model lokal tidak ditemukan dan "remote" di models/manifest.json belum diisi.');
  return { id: remote, remote: true };
}

const state = { status: 'idle', manifest: null, tokenizer: null, model: null, error: null, device: 'wasm', msPerText: null };
const listeners = new Set();
const emit = () => listeners.forEach(fn => { try { fn({ ...state }); } catch (e) { /* abaikan */ } });
let loading = null;

async function load(onProgress) {
  if (state.status === 'ready') return state;
  if (loading) return loading;
  if (location.protocol === 'file:') {
    state.status = 'unavailable';
    state.error = 'Model AI butuh server. Jalankan start.bat (atau python serve.py). Sementara memakai leksikon.';
    emit(); return state;
  }
  loading = (async () => {
    state.status = 'loading'; emit();
    try {
      const res = await fetch(MANIFEST, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Manifest model tidak ditemukan di ' + MANIFEST);
      state.manifest = await res.json();
      const src = await resolveSource(state.manifest);
      env.allowLocalModels = !src.remote;
      env.allowRemoteModels = src.remote;
      state.source = src.remote ? `huggingface.co/${src.id}` : 'lokal';
      const progress_callback = p => { if (onProgress && p.status === 'progress') onProgress(p); };
      state.tokenizer = await AutoTokenizer.from_pretrained(src.id, { progress_callback });
      // WASM: model int8 berjalan jauh lebih cepat di CPU/WASM daripada WebGPU
      state.model = await AutoModelForSequenceClassification.from_pretrained(src.id, {
        dtype: state.manifest.dtype || 'q8', device: 'wasm', progress_callback
      });
      state.status = 'ready';
    } catch (e) {
      console.warn('[Telaah AI] Model gagal dimuat:', e);
      state.status = 'unavailable';
      state.error = e.message || String(e);
    }
    loading = null;
    emit();
    return state;
  })();
  return loading;
}

/** Teks yang seluruhnya kapital ("berteriak") di luar distribusi data latih SmSA yang huruf kecil. */
function normalize(t) {
  const s = (t && t.trim()) || '-';
  const caps = (s.match(/[A-Z]/g) || []).length;
  return caps >= 4 && s === s.toUpperCase() ? s.toLowerCase() : s;
}

function softmax(row) {
  const m = Math.max(...row);
  const e = row.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

/**
 * Klasifikasikan teks → [{ label, confidence, probs: {positive, neutral, negative} }] (urutan input dipertahankan).
 * Setiap teks diproses sendiri agar skornya tidak dipengaruhi teks lain.
 */
async function classify(texts, onBatch) {
  if (state.status !== 'ready') throw new Error('Model belum siap');
  const id2label = state.model.config.id2label; // {0: positive, 1: neutral, 2: negative}
  // Satu teks per inferensi: kuantisasi int8 dinamis menghitung rentang per batch, jadi batch
  // membuat skor sebuah komentar bergantung pada komentar lain. B = 1 → hasil deterministik.
  const order = texts.map((t, i) => i);
  const out = new Array(texts.length);
  const B = 1;
  const t0 = performance.now();
  for (let k = 0; k < order.length; k += B) {
    const idx = order.slice(k, k + B);
    const batch = idx.map(i => normalize(texts[i]));
    const enc = state.tokenizer(batch, { padding: false, truncation: true, max_length: 510, add_special_tokens: false });
    const { logits } = await state.model(enc);
    const [n, c] = logits.dims;
    const data = logits.data;
    for (let r = 0; r < n; r++) {
      const p = softmax(Array.from(data.slice(r * c, r * c + c)));
      const probs = { positive: 0, neutral: 0, negative: 0 };
      p.forEach((v, j) => { const lab = String(id2label[j] ?? id2label[String(j)]).toLowerCase(); if (lab in probs) probs[lab] = v; });
      const label = Object.keys(probs).reduce((a, b) => (probs[a] >= probs[b] ? a : b));
      out[idx[r]] = { label, confidence: probs[label], probs };
    }
    if (onBatch) onBatch(Math.min(k + B, texts.length), texts.length);
    await new Promise(r => setTimeout(r, 0)); // beri napas ke UI
  }
  state.msPerText = texts.length ? (performance.now() - t0) / texts.length : null;
  return out;
}

window.TelaahModel = {
  load, classify,
  get state() { return { ...state }; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
};
window.dispatchEvent(new Event('telaah-model-module'));
