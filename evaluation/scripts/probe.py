"""Probe: probabilitas model (ONNX lokal, tanpa token spesial, B=1) + skor leksikon untuk daftar teks.
Pemakaian: python probe.py "teks 1" "teks 2" ...   (atau tanpa argumen untuk kasus bawaan)"""
import json, os, subprocess, sys, tempfile
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(HERE, '..', '..', 'models', 'indonesian-sentiment')
tok = Tokenizer.from_file(os.path.join(MD, 'tokenizer.json'))
sess = ort.InferenceSession(os.path.join(MD, 'onnx', 'model_quantized.onnx'), providers=['CPUExecutionProvider'])
ORDER = ['positive', 'neutral', 'negative']

def norm(t):  # sama dengan normalize() di model.js: huruf kapital semua -> kecil
    letters = [c for c in t if c.isalpha()]
    return t.lower() if letters and sum(c.isupper() for c in letters) / len(letters) > 0.6 else t

def probs(t):
    ids = tok.encode(norm(t), add_special_tokens=False).ids[:510] or [3]
    x = {'input_ids': np.array([ids], dtype=np.int64), 'attention_mask': np.ones((1, len(ids)), dtype=np.int64)}
    z = sess.run(None, x)[0][0]; e = np.exp(z - z.max()); return (e / e.sum()).tolist()

def lex(texts):
    fi, fo = tempfile.mktemp(suffix='.json'), tempfile.mktemp(suffix='.json')
    json.dump(texts, open(fi, 'w', encoding='utf-8'), ensure_ascii=False)
    subprocess.run(['node', os.path.join(HERE, 'lexicon_predict.js'), fi, fo], check=True)
    return [p['score'] for p in json.load(open(fo, encoding='utf-8'))['preds']]

if __name__ == '__main__':
    texts = sys.argv[1:] or ['seperti biasa, amazing !', 'amazing', 'ok', 'oke lah', 'sudah baik', 'mantap', 'seperti biasa, mantap']
    for t, s in zip(texts, lex(texts)):
        p = probs(t)
        print(f'{t[:50]:50s} model={[round(v, 2) for v in p]} -> {ORDER[int(np.argmax(p))]:8s} lex={s:+.2f}')
