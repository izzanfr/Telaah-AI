"""Ekspor w11wo/indonesian-roberta-base-sentiment-classifier ke ONNX + kuantisasi int8,
lalu verifikasi akurasinya terhadap versi PyTorch (harus hampir identik)."""
import json, os, shutil, time
import numpy as np, pandas as pd
import onnxruntime as ort
from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer
from sklearn.metrics import accuracy_score, f1_score

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')  # dataset uji
MID = 'w11wo/indonesian-roberta-base-sentiment-classifier'
OUT = os.path.join(HERE, '..', '..', 'models', 'indonesian-sentiment')
TMP = os.path.join(HERE, 'onnx_tmp')
ORDER = ['positive', 'neutral', 'negative']

shutil.rmtree(TMP, ignore_errors=True)
model = ORTModelForSequenceClassification.from_pretrained(MID, export=True)
tok = AutoTokenizer.from_pretrained(MID, use_fast=True)
model.save_pretrained(TMP); tok.save_pretrained(TMP)

q = ORTQuantizer.from_pretrained(TMP)
qcfg = AutoQuantizationConfig.avx2(is_static=False, per_channel=True)
q.quantize(save_dir=os.path.join(TMP, 'q'), quantization_config=qcfg)

# Susun sesuai struktur yang diharapkan Transformers.js
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, 'onnx'))
for f in ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.json', 'merges.txt']:
    if os.path.exists(os.path.join(TMP, f)): shutil.copy(os.path.join(TMP, f), OUT)
shutil.copy(os.path.join(TMP, 'q', 'model_quantized.onnx'), os.path.join(OUT, 'onnx', 'model_quantized.onnx'))

# Verifikasi
def run(path, texts):
    sess = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
    names = [i.name for i in sess.get_inputs()]
    probs, t0 = [], time.time()
    for i in range(0, len(texts), 32):
        enc = tok(texts[i:i + 32], padding=True, truncation=True, max_length=512, return_tensors='np')
        feed = {k: enc[k].astype(np.int64) for k in names if k in enc}
        logits = sess.run(None, feed)[0]
        e = np.exp(logits - logits.max(1, keepdims=True)); probs += (e / e.sum(1, keepdims=True)).tolist()
    return np.array(probs), (time.time() - t0) / len(texts) * 1000

smsa = pd.read_csv(os.path.join(DATA, 'smsa_test.tsv'), sep='\t', header=None, names=['text', 'label'], quoting=3)
fb = pd.DataFrame(json.load(open(os.path.join(DATA, 'feedback_gold.json'), encoding='utf-8')))
rep = {}
for tag, path in [('fp32', os.path.join(TMP, 'model.onnx')), ('int8', os.path.join(OUT, 'onnx', 'model_quantized.onnx'))]:
    for ds, df in [('smsa_test', smsa), ('feedback', fb)]:
        p, ms = run(path, df.text.tolist())
        pred = [ORDER[i] for i in p.argmax(1)]
        rep[f'{tag}/{ds}'] = (round(accuracy_score(df.label, pred) * 100, 1), round(f1_score(df.label, pred, average='macro') * 100, 1), round(ms, 1))
        if tag == 'int8': np.save(os.path.join(HERE, f'int8_{ds}.npy'), p)
print(json.dumps(rep, indent=1))
print('size MB', round(os.path.getsize(os.path.join(OUT, 'onnx', 'model_quantized.onnx')) / 1e6, 1))
print(os.listdir(OUT), json.load(open(os.path.join(OUT, 'config.json')))['id2label'])
