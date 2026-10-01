"""Hitung probabilitas model untuk teks di _need.json dan simpan ke _tta_cache.json."""
import json, os
from probe import probs
HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '_tta_cache.json')
cache = json.load(open(C, encoding='utf-8')) if os.path.exists(C) else {}
need = json.load(open(os.path.join(HERE, '_need.json'), encoding='utf-8'))
for i, t in enumerate(need):
    cache[t] = probs(t)
    if i % 200 == 0: print(i, len(need), flush=True)
json.dump(cache, open(C, 'w', encoding='utf-8'))
print('selesai', len(need))
