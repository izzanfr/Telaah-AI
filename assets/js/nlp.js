/* Telaah AI: mesin NLP ringan: normalisasi, stemming, skor sentimen berbasis leksikon,
 * deteksi aspek, dan n-gram. Semua berjalan di browser, tanpa server.
 */
(function (T) {
  const L = T.LEX;
  const LEX = Object.assign({}, L.positive, L.negative);
  const NEG = new Set(L.negators);
  const STOP = new Set(L.stopwords);
  const SUGG = new Set(L.suggestion);
  const PHRASES = new Set(L.phrases);
  const SHORT_OK = new Set(L.shortAllowed);
  const BREAK = new Set(L.clauseBreakers);
  const LONG_KEYS = Object.keys(LEX).filter(k => k.length >= 6 && !k.includes(' ')).sort((a, b) => b.length - a.length);
  const NYA_KEEP = new Set(['tanya', 'bertanya', 'punya', 'hanya', 'dunia', 'karunia', 'penanya', 'sanya', 'bunya']);

  // Indeks aspek: kunci -> [aspectId]
  const ASPECT_INDEX = new Map();
  L.aspects.forEach(a => a.keys.forEach(k => {
    if (!ASPECT_INDEX.has(k)) ASPECT_INDEX.set(k, []);
    ASPECT_INDEX.get(k).push(a.id);
  }));

  function collapseRepeats(w) {
    return w.replace(/(.)\1{2,}/g, '$1');
  }

  function normalizeWord(raw) {
    let w = raw.toLowerCase();
    if (L.slang[w]) return L.slang[w];
    w = collapseRepeats(w);
    if (L.slang[w]) return L.slang[w];
    if (!LEX[w] && /(.)\1$/.test(w)) {
      const trimmed = w.slice(0, -1);
      if (LEX[trimmed] || L.slang[trimmed]) return L.slang[trimmed] || trimmed;
    }
    return w;
  }

  // Stemmer ringan: menghasilkan kandidat bentuk dasar, dari paling mirip.
  function stemCandidates(w) {
    const out = [w];
    let base = w;
    for (const p of ['nya', 'lah', 'kah', 'pun']) {
      if (base.length > p.length + 3 && base.endsWith(p)) { base = base.slice(0, -p.length); out.push(base); break; }
    }
    const sufs = ['kan', 'an', 'i'];
    const pres = ['meng', 'meny', 'mem', 'men', 'me', 'peng', 'peny', 'pem', 'pen', 'pe', 'ber', 'be', 'ter', 'di', 'ke', 'se'];
    const withSuf = [base];
    for (const s of sufs) if (base.length > s.length + 3 && base.endsWith(s)) withSuf.push(base.slice(0, -s.length));
    for (const b of withSuf) {
      out.push(b);
      for (const p of pres) {
        if (b.length > p.length + 2 && b.startsWith(p)) {
          const r = b.slice(p.length);
          out.push(r);
          if (p === 'meny' || p === 'peny') out.push('s' + r);
          if (p === 'men' || p === 'pen') out.push('t' + r);
          if (p === 'mem' || p === 'pem') out.push('p' + r);
          if (p === 'meng' || p === 'peng') out.push('k' + r);
        }
      }
    }
    return out;
  }

  const lookupCache = new Map();
  function lookup(w) {
    if (lookupCache.has(w)) return lookupCache.get(w);
    let val = null;
    if (LEX[w] !== undefined) val = { w: LEX[w], key: w };
    if (!val) {
      for (const c of stemCandidates(w)) {
        if (LEX[c] !== undefined) { val = { w: LEX[c], key: c }; break; }
      }
    }
    if (!val && w.length >= 8) {
      // Toleransi salah ketik, mis. "amenyenangkan" → "menyenangkan"
      const hit = LONG_KEYS.find(k => w.includes(k) && !w.startsWith(k) && k.length >= w.length - 2);
      if (hit) val = { w: LEX[hit], key: hit };
    }
    if (val && val.w === 0) val = null;
    lookupCache.set(w, val);
    return val;
  }

  function displayTerm(w) {
    if (w.endsWith('nya') && w.length >= 7 && !NYA_KEEP.has(w)) return w.slice(0, -3);
    return w;
  }

  // Tokenisasi dengan posisi asli agar bisa di-highlight di teks sumber
  function tokenize(text) {
    const toks = [];
    const re = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu;
    let m, sentence = 0, prevEnd = 0;
    while ((m = re.exec(text))) {
      const gap = text.slice(prevEnd, m.index);
      if (toks.length && /[.!?;\n]/.test(gap)) sentence++;
      const raw = m[0];
      // "benar-benar" / "materi-materi" → pecah jadi dua token
      const parts = raw.split(/[-']/);
      let offset = m.index;
      for (const part of parts) {
        if (!part) { offset += 1; continue; }
        const normRaw = normalizeWord(part);
        // Slang bisa menghasilkan dua kata (mis. makasih → terima kasih)
        toks.push({ raw: part, norm: normRaw, start: offset, end: offset + part.length, s: sentence });
        offset += part.length + 1;
      }
      prevEnd = m.index + raw.length;
    }
    // Gabungkan frasa multi-kata
    const merged = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], n = toks[i + 1];
      if (n && n.s === t.s && PHRASES.has(t.norm + ' ' + n.norm)) {
        merged.push({ raw: text.slice(t.start, n.end), norm: t.norm + ' ' + n.norm, start: t.start, end: n.end, s: t.s });
        i++;
      } else merged.push(t);
    }
    // Klausa: batas kalimat, koma/titik koma, atau kata pemisah (tapi, namun, kendala, ...)
    let c = 0;
    merged.forEach((t, i) => {
      if (i) {
        const p = merged[i - 1];
        const why = t.s !== p.s ? 's' : BREAK.has(t.norm) ? 'w' : /[,;:()\n]|\.\.|\s-\s/.test(text.slice(p.end, t.start)) ? 'p' : '';
        if (why) { c++; t.cb = why; }
      }
      t.c = c;
    });
    return merged;
  }

  function isEmptyAnswer(text) {
    const t = (text || '').trim().toLowerCase();
    if (!t) return true;
    if (/^[-\u2013\u2014_.,\s/]*$/.test(t)) return true;
    const c = t.replace(/[.!]+$/, '');
    if (/^(tidak|tdk|belum|blm|ga|gak|nggak|ngga|enggak|no)\s+(ada\s+)?(saran|masukan|kritik|komentar|tanggapan)(\s+(lagi|apa-apa|apapun))?$/.test(c)) return true;
    return ['tidak ada', 'ga ada', 'gak ada', 'nggak ada', 'tdk ada', 'belum ada', 'none', 'n/a', 'na', 'nothing', 'no', 'tidak', 'nihil', 'kosong', 'cukup', 'sudah cukup', 'no comment', 'no suggestion'].includes(c);
  }

  function scoreTokens(toks, text) {
    let sum = 0;
    const hits = [];
    const sentSums = new Map();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const w = t.norm;
      if (NEG.has(w)) continue;
      if (w === 'kurang') {
        // "kurang jelas" → dibalik; "kurang" sendiri → negatif
        const next = toks.slice(i + 1, i + 3).find(x => x.s === t.s && lookup(x.norm));
        if (next && lookup(next.norm).w > 0) continue;
      }
      const lx = lookup(w);
      if (!lx) continue;
      let v = lx.w;
      // Pengubah sebelum kata
      let negated = false;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const p = toks[j];
        if (p.s !== t.s) break;
        if (L.intensifiers[p.norm]) v *= L.intensifiers[p.norm];
        else if (L.dampeners[p.norm]) v *= L.dampeners[p.norm];
        else if (NEG.has(p.norm)) { negated = true; break; }
        else if (p.norm === 'kurang' && v > 0) { negated = true; break; }
        else if (lookup(p.norm)) break;
      }
      const nx = toks[i + 1];
      if (nx && nx.s === t.s && L.postIntensifiers[nx.norm]) v *= L.postIntensifiers[nx.norm];
      if (negated) v = v > 0 ? -v * 0.8 : -v * 0.5;
      // Penekanan huruf kapital (bukan seluruh teks kapital)
      if (t.raw.length > 3 && t.raw === t.raw.toUpperCase() && text !== text.toUpperCase()) v *= 1.2;
      sum += v;
      sentSums.set(t.s, (sentSums.get(t.s) || 0) + v);
      hits.push({ start: t.start, end: t.end, v: +v.toFixed(2), term: lx.key, negated, c: t.c });
    }
    const low = text.toLowerCase();
    L.emoticons.positive.forEach(e => { if (low.includes(e)) sum += 1; });
    L.emoticons.negative.forEach(e => { if (low.includes(e)) sum -= 1; });
    if (/!/.test(text) && sum !== 0) sum *= 1.1;
    return { sum, hits, sentSums };
  }

  const compound = s => s / Math.sqrt(s * s + 4);
  const THRESH = 0.15;
  const labelOf = c => (c >= THRESH ? 'positive' : c <= -THRESH ? 'negative' : 'neutral');

  /** Pecah teks menjadi klausa: [{ i, start, end, text, words, lex, aspects }]. */
  function buildClauses(toks, hits, text) {
    const by = new Map();
    toks.forEach(t => { if (!by.has(t.c)) by.set(t.c, []); by.get(t.c).push(t); });
    const out = [];
    by.forEach((ts, i) => {
      const sum = hits.filter(h => h.c === i).reduce((a, h) => a + h.v, 0);
      const start = ts[0].start, end = ts[ts.length - 1].end;
      out.push({ i, start, end, text: text.slice(start, end), words: ts.length, lex: +compound(sum).toFixed(3), aspects: [], cont: ts[0].cb === 'p' });
    });
    return out;
  }

  function detectAspects(toks, clauses, extraKeys) {
    const found = new Map(); // klausa -> Set(aspectId)
    const add = (id, c) => { if (!found.has(c)) found.set(c, new Set()); found.get(c).add(id); };
    toks.forEach(t => {
      const cands = [t.norm, displayTerm(t.norm), ...stemCandidates(t.norm).slice(1, 4)];
      for (const c of cands) {
        const ids = ASPECT_INDEX.get(c);
        if (ids) { ids.forEach(id => add(id, t.c)); break; }
      }
      if (extraKeys && extraKeys.has(t.norm)) add('instruktur', t.c);
    });
    // Keluhan teknis ("suara pemateri putus") milik Teknis/Fasilitas, bukan Materi/Instruktur
    found.forEach(ids => { if (ids.has('teknis')) { ids.delete('materi'); ids.delete('instruktur'); } });
    // Klausa lanjutan setelah koma tanpa kata aspek ("Materi pas, mudah dipahami") mewarisi aspek klausa sebelumnya
    clauses.forEach((cl, k) => {
      if (k && cl.cont && !found.has(cl.i) && found.has(clauses[k - 1].i)) found.set(cl.i, new Set(found.get(clauses[k - 1].i)));
    });
    const per = new Map(); // aspectId -> [klausa]
    found.forEach((ids, c) => ids.forEach(id => { if (!per.has(id)) per.set(id, []); per.get(id).push(c); }));
    const out = [];
    per.forEach((cs, id) => {
      const cl = cs.map(i => clauses.find(x => x.i === i)).filter(Boolean);
      cl.forEach(x => x.aspects.push(id));
      const s = cl.reduce((a, x) => a + x.lex, 0) / Math.max(cl.length, 1);
      out.push({ id, score: +s.toFixed(3), clauses: cs, span: [cl[0].start, cl[0].end] });
    });
    return out;
  }

  /** Analisis satu teks feedback. extraKeys: nama instruktur (lowercase) sebagai kunci aspek. */
  function analyze(text, extraKeys) {
    const empty = isEmptyAnswer(text);
    const toks = tokenize(text || '');
    const { sum, hits } = scoreTokens(toks, text || '');
    const c = empty ? 0 : compound(sum);
    const clauses = empty ? [] : buildClauses(toks, hits, text || '');
    const terms = toks
      .map(t => displayTerm(t.norm))
      .filter(w => !/^\d+$/.test(w) && (w.length >= 3 || SHORT_OK.has(w)));
    const suggestion = !empty && toks.some(t => SUGG.has(t.norm));
    return {
      empty,
      score: +c.toFixed(3),
      raw: +sum.toFixed(2),
      label: empty ? 'empty' : labelOf(c),
      hits,
      tokens: toks,
      terms,
      clauses,
      aspects: empty ? [] : detectAspects(toks, clauses, extraKeys),
      suggestion,
      words: toks.length
    };
  }

  /** Hitung n-gram dari kumpulan dokumen yang sudah dianalisis. */
  function ngrams(docs, n, stopSet) {
    const counts = new Map();
    const isStop = w => STOP.has(w) || stopSet.has(w) || NEG.has(w) || /^\d+$/.test(w) || (w.length < 3 && !SHORT_OK.has(w));
    docs.forEach(d => {
      const seen = new Set();
      const bySent = new Map();
      d.a.tokens.forEach(t => {
        const w = displayTerm(t.norm);
        if (!bySent.has(t.s)) bySent.set(t.s, []);
        bySent.get(t.s).push(w);
      });
      bySent.forEach(words => {
        if (n === 1) {
          words.forEach(w => { if (!isStop(w)) bump(w); });
        } else {
          // Untuk frasa: buang stopword tapi pertahankan negasi ("tidak jelas")
          const kept = words.filter(w => NEG.has(w) || !isStop(w));
          for (let i = 0; i + n <= kept.length; i++) {
            const g = kept.slice(i, i + n);
            if (NEG.has(g[g.length - 1])) continue;
            if (new Set(g).size < g.length) continue;
            bump(g.join(' '));
          }
        }
      });
      function bump(k) {
        let e = counts.get(k);
        if (!e) { e = { term: k, count: 0, docs: 0, scoreSum: 0 }; counts.set(k, e); }
        e.count++;
        if (!seen.has(k)) { seen.add(k); e.docs++; e.scoreSum += d.a.score; }
      }
    });
    return [...counts.values()]
      .map(e => ({ ...e, avg: e.scoreSum / e.docs }))
      .sort((a, b) => b.count - a.count || b.docs - a.docs || a.term.localeCompare(b.term));
  }

  /** Apakah dokumen mengandung term (kata atau frasa) setelah normalisasi. */
  function docHasTerm(d, term) {
    const words = d.a.tokens.map(t => displayTerm(t.norm));
    const parts = term.split(' ');
    if (parts.length === 1) return words.includes(term) || d.a.tokens.some(t => t.norm === term);
    const seq = words.filter(w => NEG.has(w) || !STOP.has(w));
    for (let i = 0; i + parts.length <= seq.length; i++) {
      if (parts.every((p, k) => seq[i + k] === p)) return true;
    }
    return false;
  }

  T.NLP = { analyze, compound, ngrams, docHasTerm, tokenize, isEmptyAnswer, labelOf, THRESH, STOP, NEG, displayTerm };
})(window.T);
