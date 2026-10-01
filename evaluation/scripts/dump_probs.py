"""Simpan probabilitas (positive, neutral, negative) tiap model + skor leksikon untuk eksperimen ensemble."""
import json, os
import numpy as np, pandas as pd, torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import evaluate as E

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')  # dataset uji
data = E.load()
data['smsa_valid'] = pd.read_csv(os.path.join(DATA, 'smsa_valid.tsv'), sep='\t', header=None, names=['text', 'label'], quoting=3)
MODELS = ['w11wo/indonesian-roberta-base-sentiment-classifier', 'mdhugol/indonesia-bert-sentiment-classification',
          'cardiffnlp/twitter-xlm-roberta-base-sentiment', 'taufiqdp/indonesian-sentiment']
ORDER = ['positive', 'neutral', 'negative']
dev = 'cuda'
out = {ds: {'label': df.label.tolist(), 'text': df.text.tolist()} for ds, df in data.items()}

# Leksikon: skor compound + label
for ds, df in data.items():
    inp, o = os.path.join(HERE, '_i.json'), os.path.join(HERE, '_o.json')
    json.dump(df.text.tolist(), open(inp, 'w', encoding='utf-8'), ensure_ascii=False)
    os.system(f'node "{os.path.join(HERE, "lexicon_predict.js")}" "{inp}" "{o}"')
    r = json.load(open(o, encoding='utf-8'))['preds']
    out[ds]['lex_score'] = [p['score'] for p in r]

for m in MODELS:
    tok = AutoTokenizer.from_pretrained(m)
    mod = AutoModelForSequenceClassification.from_pretrained(m).to(dev).eval()
    labs = [E.norm_label(v) for _, v in sorted(mod.config.id2label.items())]
    if not set(labs) <= set(ORDER): labs = ORDER
    perm = [labs.index(l) for l in ORDER]
    for ds, df in data.items():
        probs = []
        texts = df.text.tolist()
        for i in range(0, len(texts), 32):
            enc = tok(texts[i:i + 32], padding=True, truncation=True, max_length=256, return_tensors='pt').to(dev)
            with torch.no_grad():
                p = mod(**enc).logits.softmax(-1).cpu().numpy()[:, perm]
            probs += p.tolist()
        out[ds][m] = probs
    print('done', m, flush=True)
json.dump(out, open(os.path.join(HERE, 'probs.json'), 'w'))
