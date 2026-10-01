"""Uji aturan klausa kontras ("X, tapi Y" → Y lebih berbobot) di atas hybrid int8.
Validasi pada SmSA valid+test agar tidak hanya cocok dengan data feedback sintetis."""
import json, os, re
import numpy as np, pandas as pd, onnxruntime as ort
from transformers import AutoTokenizer
from sklearn.metrics import accuracy_score, f1_score

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')  # dataset uji
MD = os.path.join(HERE, '..', '..', 'models', 'indonesian-sentiment')
tok = AutoTokenizer.from_pretrained(MD)
sess = ort.InferenceSession(os.path.join(MD, 'onnx', 'model_quantized.onnx'), providers=['CPUExecutionProvider'])
O = ['positive', 'neutral', 'negative']
D = json.load(open(os.path.join(HERE, 'probs.json')))
CONTRAST = re.compile(r'\b(tapi|tetapi|namun|sayangnya|sayang|cuma|hanya saja|but|however)\b', re.I)

def infer(texts):
    out = []
    for i in range(0, len(texts), 32):
        enc = tok(texts[i:i + 32], padding=True, truncation=True, max_length=512, return_tensors='np')
        lg = sess.run(None, {k: enc[k].astype(np.int64) for k in ['input_ids', 'attention_mask']})[0]
        e = np.exp(lg - lg.max(1, keepdims=True)); out += (e / e.sum(1, keepdims=True)).tolist()
    return np.array(out)

def lexp(c): return [1 / 3] * 3 if c == 0 else [max(c, 0), 1 - abs(c), max(-c, 0)]

def final(ds, P, w_after):
    texts = D[ds]['text']
    P = P.copy()
    idx, tails = [], []
    for i, t in enumerate(texts):
        m = list(CONTRAST.finditer(t))
        if m:
            tail = t[m[-1].end():].strip(' ,.;')
            if len(tail.split()) >= 2: idx.append(i); tails.append(tail)
    if idx and w_after > 0:
        T = infer(tails)
        for k, i in enumerate(idx): P[i] = (1 - w_after) * P[i] + w_after * T[k]
    L = np.array([lexp(c) for c in D[ds]['lex_score']]); w = np.array([len(t.split()) for t in texts])
    lw = np.full(len(P), 0.25); lw[(w <= 3) & (np.array(D[ds]['lex_score']) != 0)] = 1.0
    F = (P + lw[:, None] * L) / (1 + lw[:, None])
    return [O[i] for i in F.argmax(1)], len(idx)

for ds in ['smsa_valid', 'smsa_test', 'feedback']:
    P = np.load(os.path.join(HERE, f'int8_{ds}.npy')) if os.path.exists(os.path.join(HERE, f'int8_{ds}.npy')) else infer(D[ds]['text'])
    if ds == 'smsa_valid': np.save(os.path.join(HERE, 'int8_smsa_valid.npy'), P)
    y = D[ds]['label']
    for wa in [0, 0.4, 0.5, 0.6, 0.7]:
        pred, n = final(ds, P, wa)
        print(f'{ds:10} w_after={wa}  acc {accuracy_score(y, pred) * 100:5.1f}  macroF1 {f1_score(y, pred, labels=O, average="macro") * 100:5.1f}  (kalimat kontras: {n})')
