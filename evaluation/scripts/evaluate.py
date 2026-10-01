"""Bandingkan mesin leksikon Telaah dengan model transformer sentimen Bahasa Indonesia.

Dataset:
  - SmSA test (IndoNLU, 500): held-out resmi, label manusia
  - NusaX-Senti Indonesia test (400). Catatan: sumbernya turunan SmSA (potensi bocor)
  - Feedback pelatihan (90): 30 komentar asli + 60 sintetis, label ditetapkan sebelum evaluasi
"""
import json, os, subprocess, sys, time
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')  # dataset uji
LABELS = ['positive', 'neutral', 'negative']

def load():
    smsa = pd.read_csv(os.path.join(DATA, 'smsa_test.tsv'), sep='\t', header=None, names=['text', 'label'], quoting=3)
    nusax = pd.read_csv(os.path.join(DATA, 'nusax_test.csv'))[['text', 'label']]
    fb = pd.DataFrame(json.load(open(os.path.join(DATA, 'feedback_gold.json'), encoding='utf-8')))
    return {'smsa_test': smsa, 'nusax_test': nusax, 'feedback': fb}

def norm_label(l):
    l = str(l).lower()
    if l.startswith('pos'): return 'positive'
    if l.startswith('neg'): return 'negative'
    if l.startswith('neu') or l.startswith('netral'): return 'neutral'
    return l

def lexicon_predict(texts):
    inp, out = os.path.join(HERE, '_lex_in.json'), os.path.join(HERE, '_lex_out.json')
    json.dump(list(texts), open(inp, 'w', encoding='utf-8'), ensure_ascii=False)
    subprocess.run(['node', os.path.join(HERE, 'lexicon_predict.js'), inp, out], check=True)
    r = json.load(open(out, encoding='utf-8'))
    return [p['label'] for p in r['preds']], r['ms']

def hf_predict(model_id, texts, device):
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch
    tok = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForSequenceClassification.from_pretrained(model_id).to(device).eval()
    id2label = {int(k): norm_label(v) for k, v in model.config.id2label.items()}
    # Beberapa model memakai LABEL_0/1/2; pakai urutan SmSA (positive, neutral, negative) bila perlu
    if not set(id2label.values()) <= set(LABELS):
        id2label = {0: 'positive', 1: 'neutral', 2: 'negative'}
    preds, t0 = [], time.time()
    texts = list(texts)
    for i in range(0, len(texts), 32):
        enc = tok(texts[i:i + 32], padding=True, truncation=True, max_length=256, return_tensors='pt').to(device)
        with torch.no_grad():
            logits = model(**enc).logits
        preds += [id2label[int(k)] for k in logits.argmax(-1).tolist()]
    return preds, int((time.time() - t0) * 1000), id2label

def score(y, p):
    return {
        'acc': round(accuracy_score(y, p) * 100, 1),
        'macro_f1': round(f1_score(y, p, labels=LABELS, average='macro', zero_division=0) * 100, 1),
        **{f'f1_{l[:3]}': round(f1_score(y, p, labels=[l], average='macro', zero_division=0) * 100, 1) for l in LABELS},
        'cm': confusion_matrix(y, p, labels=LABELS).tolist(),
    }

MODELS = [
    'w11wo/indonesian-roberta-base-sentiment-classifier',
    'ayameRushia/bert-base-indonesian-1.5G-sentiment-analysis-smsa',
    'ayameRushia/roberta-base-indonesian-1.5G-sentiment-analysis-smsa',
    'mdhugol/indonesia-bert-sentiment-classification',
    'Aardiiiiy/indobertweet-base-Indonesian-sentiment-analysis',
    'taufiqdp/indonesian-sentiment',
    'lxyuan/distilbert-base-multilingual-cased-sentiments-student',
    'cardiffnlp/twitter-xlm-roberta-base-sentiment',
]

if __name__ == '__main__':
    import torch
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    data = load()
    results, preds_store = {}, {}
    only = sys.argv[1:] or None
    runs = [('lexicon', None)] + [(m, m) for m in MODELS]
    for name, mid in runs:
        if only and name not in only: continue
        results[name] = {}
        try:
            for ds, df in data.items():
                if mid is None:
                    p, ms = lexicon_predict(df.text)
                    mapping = None
                else:
                    p, ms, mapping = hf_predict(mid, df.text, device)
                results[name][ds] = {**score(df.label.tolist(), p), 'ms': ms}
                preds_store.setdefault(name, {})[ds] = p
            if mapping: results[name]['_labels'] = mapping
            print(name, {k: (v['acc'], v['macro_f1']) for k, v in results[name].items() if not k.startswith('_')}, flush=True)
        except Exception as e:
            results[name] = {'error': str(e)[:300]}
            print(name, 'ERROR', str(e)[:300], flush=True)
    json.dump(results, open(os.path.join(HERE, 'results.json'), 'w'), indent=1)
    json.dump(preds_store, open(os.path.join(HERE, 'preds.json'), 'w'), ensure_ascii=False)
