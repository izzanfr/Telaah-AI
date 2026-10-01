"""Eksperimen v5: Test-Time Augmentation (TTA) berbasis konteks untuk komentar pendek.

Masalah: model dilatih pada ulasan panjang (SmSA). Komentar sangat pendek ("ok", "sudah baik")
berada di luar distribusi latihnya sehingga prediksinya acak dan sering yakin-salah.
Teknik: bungkus komentar pendek dalam beberapa kalimat konteks netral ("Menurut saya pelatihannya {t}")
lalu rata-ratakan probabilitasnya. Konteks menggeser input kembali ke distribusi latih (domain adaptation
tanpa pelatihan ulang), dan rata-rata beberapa template mengurangi varians.

Protokol anti-bocor:
  - Template, ambang panjang dan bobot dipilih HANYA dari set dev: feedback_gold.json (90) + SmSA validation.
  - Dilaporkan pada set uji: feedback_test_v2.json (140, label ditetapkan sebelum evaluasi) + SmSA test (500).
"""
import json, os, re, itertools, sys
import numpy as np
from probe import probs, lex, ORDER

HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, '..', 'data')
CACHE = os.path.join(HERE, '_tta_cache.json')
cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
def P(t):
    if t not in cache: cache[t] = probs(t)
    return np.array(cache[t])

TEMPLATES = {
    'a': 'Menurut saya pelatihannya {}',
    'b': 'Kesan saya tentang pelatihan ini: {}',
    'c': 'Pelatihan ini {}',
    'd': 'Secara keseluruhan pelatihannya {}',
    'e': 'Pendapat saya soal kelas ini, {}',
}
CONTRAST = r'\b(tapi|tetapi|namun|sayangnya|sayang|cuma|hanya saja|but|however)\b'

def words(t): return len(t.split())
def tail(t):
    ms = list(re.finditer(CONTRAST, t, re.I))
    if not ms: return None
    s = re.sub(r'^[ ,.;]+|[ ,.;]+$', '', t[ms[-1].end():])
    return s if words(s) >= 2 else None
def lexp(c): return np.array([1/3]*3) if c == 0 else np.array([max(c, 0), 1-abs(c), max(-c, 0)])

def model_p(t, cfg):
    p = P(t)
    if cfg['tta'] and words(t) <= cfg['maxw']:
        aug = [P(TEMPLATES[k].format(t)) for k in cfg['tta']]
        p = (cfg['wraw'] * p + sum(aug)) / (cfg['wraw'] + len(aug))
    return p

def predict(t, ls, cfg):
    p = model_p(t, cfg)
    tl = tail(t)
    if tl: p = 0.6 * p + 0.4 * model_p(tl, cfg)
    lw = cfg['short'] if words(t) <= 3 and ls != 0 else cfg['lex']
    F = (p + lw * lexp(ls)) / (1 + lw)
    return ORDER[int(F.argmax())], F

def load():
    fb = json.load(open(os.path.join(DATA, 'feedback_gold.json'), encoding='utf-8'))
    v2 = json.load(open(os.path.join(DATA, 'feedback_test_v2.json'), encoding='utf-8'))
    rd = lambda f: [(l.rsplit('\t', 1)[0], l.rsplit('\t', 1)[1].strip()) for l in open(os.path.join(DATA, f), encoding='utf-8').read().strip().split('\n')]
    sets = {'dev_feedback': [(r['text'], r['label']) for r in fb], 'smsa_valid': rd('smsa_valid.tsv'),
            'test_v2': [(r['text'], r['label']) for r in v2], 'smsa_test': rd('smsa_test.tsv')}
    for k, rows in sets.items():
        sc = lex([t for t, _ in rows]); sets[k] = [(t, y, s) for (t, y), s in zip(rows, sc)]
    return sets

def acc(rows, cfg, sub=None):
    ok = [predict(t, s, cfg)[0] == y for t, y, s in rows if sub is None or sub(t)]
    return round(100 * sum(ok) / max(len(ok), 1), 1), len(ok)

if __name__ == '__main__':
    S = load()
    base = {'tta': '', 'maxw': 0, 'wraw': 1, 'lex': 0.25, 'short': 2.0}
    grid = [base] + [{'tta': tt, 'maxw': mw, 'wraw': wr, 'lex': 0.25, 'short': sh}
                     for tt in ['a', 'ab', 'abc', 'abcd', 'abcde', 'ad', 'acd']
                     for mw in [3, 5, 8, 12] for wr in [0, 1] for sh in [0.5, 1.0, 2.0]]
    res = []
    for i, cfg in enumerate(grid):
        dv = acc(S['dev_feedback'], cfg)[0]; sv = acc(S['smsa_valid'], cfg)[0]
        res.append((dv + sv, dv, sv, cfg))
        if i % 20 == 0: json.dump(cache, open(CACHE, 'w', encoding='utf-8')); print('..', i, len(grid), flush=True)
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'))
    res.sort(key=lambda r: -r[0])
    print('BASE dev', acc(S['dev_feedback'], base), 'smsa_valid', acc(S['smsa_valid'], base))
    for r in res[:8]: print('dev', r[1], 'smsa_val', r[2], r[3])
    best = res[0][3]
    short = lambda t: words(t) <= 3
    print('\n== TEST (tidak dipakai untuk memilih) ==')
    for name, cfg in [('sekarang (hybrid v4)', base), ('TTA terpilih', best)]:
        print(f"{name:22s} test_v2 {acc(S['test_v2'], cfg)}  pendek(<=3 kata) {acc(S['test_v2'], cfg, short)}  smsa_test {acc(S['smsa_test'], cfg)}")
    json.dump({'best': best}, open(os.path.join(HERE, '_tta_best.json'), 'w'))
