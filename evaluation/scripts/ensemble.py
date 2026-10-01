"""Eksperimen ensemble. Bobot dipilih HANYA dari SmSA validation; dilaporkan pada SmSA test & feedback."""
import json, itertools, os
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')  # dataset uji
D = json.load(open(os.path.join(HERE, 'probs.json')))
G = json.load(open(os.path.join(DATA, 'feedback_gold.json'), encoding='utf-8'))
ORDER = ['positive', 'neutral', 'negative']
W11, MDH, CDF, TFQ = ('w11wo/indonesian-roberta-base-sentiment-classifier', 'mdhugol/indonesia-bert-sentiment-classification',
                      'cardiffnlp/twitter-xlm-roberta-base-sentiment', 'taufiqdp/indonesian-sentiment')

def lex_probs(scores):
    out = []
    for c in scores:
        if c == 0: out.append([1 / 3] * 3)  # tidak ada sinyal leksikon → tidak memihak
        else: out.append([max(c, 0), 1 - abs(c), max(-c, 0)])
    return np.array(out)

def words(ds):
    return np.array([len(t.split()) for t in D[ds]['text']])

def predict(ds, cfg):
    P = sum(w * np.array(D[ds][m]) for m, w in cfg['models'].items())
    L = lex_probs(D[ds]['lex_score'])
    lw = np.full(len(P), cfg.get('lex', 0.0))
    if cfg.get('short_lex'):  # teks pendek: model latih-ulasan kurang andal, beri bobot leksikon lebih
        sh = (words(ds) <= 3) & (np.array(D[ds]['lex_score']) != 0)
        lw[sh] = cfg['short_lex']
    P = P / sum(cfg['models'].values())
    F = (P + lw[:, None] * L) / (1 + lw[:, None])
    return [ORDER[i] for i in F.argmax(1)], F

def metr(ds, pred, idx=None):
    y = D[ds]['label']
    if idx is not None: y = [y[i] for i in idx]; pred = [pred[i] for i in idx]
    return round(accuracy_score(y, pred) * 100, 1), round(f1_score(y, pred, labels=ORDER, average='macro', zero_division=0) * 100, 1)

cands = []
singles = {'w11wo': {W11: 1}, 'mdhugol': {MDH: 1}, 'cardiff': {CDF: 1}, 'taufiq': {TFQ: 1}}
pairs = {'w11wo+mdhugol': {W11: 1, MDH: 1}, 'w11wo+cardiff': {W11: 1, CDF: 1}, 'mdhugol+cardiff': {MDH: 1, CDF: 1},
         'w11wo+mdhugol+cardiff': {W11: 1, MDH: 1, CDF: 1}}
for name, models in {**singles, **pairs}.items():
    for lex in [0, 0.25, 0.5, 0.75, 1.0]:
        for sl in [None, 1.0, 2.0, 4.0]:
            cands.append((f'{name} lex={lex} short={sl}', {'models': models, 'lex': lex, 'short_lex': sl}))

rows = []
for name, cfg in cands:
    pv, _ = predict('smsa_valid', cfg)
    rows.append((metr('smsa_valid', pv)[1], name, cfg))
rows.sort(key=lambda r: -r[0])

fb_real = [i for i, x in enumerate(G) if x['src'] == 'real']
fb_syn = [i for i, x in enumerate(G) if x['src'] == 'synthetic']

def report(name, cfg):
    pt, _ = predict('smsa_test', cfg); pf, _ = predict('feedback', cfg)
    return f"{name:44} SmSA-test {metr('smsa_test', pt)}  feedback {metr('feedback', pf)}  real {metr('feedback', pf, fb_real)[0]}  synth {metr('feedback', pf, fb_syn)[0]}"

print('== baseline ==')
lexcfg = {'models': {W11: 1}, 'lex': 1e6}
print(report('lexicon only', lexcfg))
for n, m in singles.items(): print(report(n, {'models': m}))
print('\n== terbaik per keluarga (dipilih dari SmSA valid macro-F1) ==')
seen = set()
for f1v, name, cfg in rows:
    fam = name.split(' ')[0]
    key = (fam, cfg['lex'] > 0, cfg.get('short_lex') is not None)
    if key in seen: continue
    seen.add(key)
    print(f'valid {f1v:5}  ' + report(name, cfg))
