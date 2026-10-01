"""Eksperimen v6, di atas TTA v5:
  1. lower: semua teks diubah ke huruf kecil sebelum masuk model (SmSA, data latih model, seluruhnya huruf kecil).
  2. tau: bila keyakinan akhir < tau DAN leksikon tidak menemukan kata bersentimen, label menjadi netral
     (komentar tanpa sinyal jelas, mis. "Urutan materi training", lebih tepat dianggap netral).
Pemilihan HANYA dari dev (feedback_gold 90 + SmSA validation). Dilaporkan pada test_v2 dan SmSA test.
Kasus yang dilaporkan pengguna (real-ui-2) dilaporkan terpisah dan tidak dipakai memilih."""
import json, os
import numpy as np
import tta_eval as E
from tta_eval import load, words, tail, lexp, ORDER, DATA

def P(t, lower):
    return E.P(t.lower() if lower else t)

def model_p(t, cfg):
    p = P(t, cfg['lower'])
    if words(t) <= cfg['maxw']:
        q = P(E.TEMPLATES['a'].format(t.lower() if cfg['lower'] else t), cfg['lower'])
        p = (p + q) / 2
    return p

def predict(t, ls, cfg):
    p = model_p(t, cfg)
    tl = tail(t)
    if tl: p = 0.6 * p + 0.4 * model_p(tl, cfg)
    lw = cfg['short'] if words(t) <= 3 and ls != 0 else cfg['lex']
    F = (p + lw * lexp(ls)) / (1 + lw)
    lab = ORDER[int(F.argmax())]
    if ls == 0 and F.max() < cfg['tau']: lab = 'neutral'
    return lab

def acc(rows, cfg):
    return round(100 * np.mean([predict(t, s, cfg) == y for t, y, s in rows]), 1)

if __name__ == '__main__':
    S = load()
    ui = [(r['text'], r['label']) for r in json.load(open(os.path.join(DATA, 'feedback_ui2.json'), encoding='utf-8'))]
    sc = E.lex([t for t, _ in ui]); S['ui2'] = [(t, y, s) for (t, y), s in zip(ui, sc)]
    v5 = {'lower': False, 'maxw': 5, 'short': 0.5, 'lex': 0.25, 'tau': 0}
    grid = [dict(v5, lower=lw, tau=tau) for lw in [False, True] for tau in [0, 0.5, 0.6, 0.7, 0.8, 0.9]]
    res = []
    for c in grid:
        res.append((acc(S['dev_feedback'], c) + acc(S['smsa_valid'], c), c))
    json.dump(E.cache, open(E.CACHE, 'w', encoding='utf-8'))
    res.sort(key=lambda r: -r[0])
    for sc_, c in res[:6]: print('dev', acc(S['dev_feedback'], c), 'smsa_val', acc(S['smsa_valid'], c), c)
    best = res[0][1]
    print('\n== TEST ==')
    for n, c in [('v5 (sekarang)', v5), ('v6 terpilih', best)]:
        print(f"{n:14s} test_v2 {acc(S['test_v2'], c)}  smsa_test {acc(S['smsa_test'], c)}  laporan-pengguna {acc(S['ui2'], c)} (n={len(ui)})")
    for t, y, s in S['ui2']: print(' ', y[:3], predict(t, s, v5)[:3], '->', predict(t, s, best)[:3], '|', t[:60])

# ---- v6b: huruf kecil HANYA di dalam template TTA + bobot leksikon untuk teks pendek ----
def model_p2(t, cfg):
    p = E.P(t)
    if words(t) <= cfg['maxw']:
        p = (p + E.P(E.TEMPLATES['a'].format(t.lower()))) / 2
    return p

def predict2(t, ls, cfg):
    p = model_p2(t, cfg); tl = tail(t)
    if tl: p = 0.6 * p + 0.4 * model_p2(tl, cfg)
    lw = cfg['short'] if words(t) <= 3 and ls != 0 else cfg['lex']
    F = (p + lw * lexp(ls)) / (1 + lw)
    return ORDER[int(F.argmax())], float(F.max())

def run_v6b():
    S = load()
    ui = [(r['text'], r['label']) for r in json.load(open(os.path.join(DATA, 'feedback_ui2.json'), encoding='utf-8'))]
    sc = E.lex([t for t, _ in ui]); S['ui2'] = [(t, y, s) for (t, y), s in zip(ui, sc)]
    fb = json.load(open(os.path.join(DATA, 'feedback_gold.json'), encoding='utf-8'))
    S['unseen'] = [r for r, g in zip(S['dev_feedback'], fb) if g['src'] != 'real']
    a = lambda rows, c: round(100 * np.mean([predict2(t, s, c)[0] == y for t, y, s in rows]), 1)
    res = []
    for sh in [0.5, 1, 2, 4, 8]:
        c = {'maxw': 5, 'short': sh, 'lex': 0.25}
        res.append((a(S['dev_feedback'], c) + a(S['smsa_valid'], c), sh, c))
    for r in res: print('dev', a(S['dev_feedback'], r[2]), 'smsa_val', a(S['smsa_valid'], r[2]), r[2])
    best = max(res, key=lambda r: (r[0], r[1]))[2]
    print('terpilih', best)
    for k in ['test_v2', 'unseen', 'smsa_test', 'ui2']: print(' ', k, a(S[k], best))
    for t, y, s in S['ui2']: print('   ', y[:3], '->', predict2(t, s, best)[0][:3], round(predict2(t, s, best)[1], 2), '|', t[:50])
    json.dump(E.cache, open(E.CACHE, 'w', encoding='utf-8'))
