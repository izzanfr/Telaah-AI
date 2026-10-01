/* Telaah AI: antarmuka klasifikasi sentimen yang bisa ditukar.
 *
 * Setiap mesin (engine) mengikuti kontrak yang sama:
 *   engine.id, engine.name
 *   engine.needs(text, analysis)   -> string[]  teks yang butuh probabilitas model (boleh kosong)
 *   engine.classify(text, ctx)     -> Hasil | null (null = bahan belum siap, mis. model belum selesai)
 *     ctx = { question: 'pengalaman' | 'saran' | ..., analysis: hasil T.NLP.analyze(text) }
 *
 * Hasil = {
 *   sentimen:  'positive' | 'neutral' | 'mixed' | 'negative',
 *   aspek:     { [aspectId]: 'positive' | 'neutral' | 'mixed' | 'negative' },
 *   keyakinan: 0..1,
 *   alasan:    satu kalimat,
 *   // tambahan untuk UI
 *   probs: [pos, neu, neg], skor: -1..1, aspekSkor: { [aspectId]: -1..1 },
 *   tinjau: boolean, alasanTinjau: string, sumber: 'ai' | 'leksikon'
 * }
 *
 * Mesin LLM kelak cukup mengikuti kontrak ini (needs() kosong, classify() membaca hasil yang sudah diambil),
 * tanpa mengubah pipeline aplikasi.
 */
window.T = window.T || {};
(function (T) {
  'use strict';
  const ORDER = ['positive', 'neutral', 'negative'];
  const countWords = t => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const lexProbs = c => (c === 0 ? [1 / 3, 1 / 3, 1 / 3] : [Math.max(c, 0), 1 - Math.abs(c), Math.max(-c, 0)]);
  const argmax = a => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
  const tilt = v => (v >= 0.15 ? 'positive' : v <= -0.15 ? 'negative' : 'neutral');
  const aspLabel = id => (T.LEX.aspects.find(a => a.id === id) || { label: id }).label;
  const SENT_WORD = { positive: 'positif', negative: 'negatif', neutral: 'netral', mixed: 'campuran' };

  function contrastTail(text, cfg) {
    const re = new RegExp(cfg.contrastPattern, 'gi');
    let m, last = null;
    while ((m = re.exec(text))) last = m;
    if (!last) return null;
    const tail = text.slice(last.index + last[0].length).replace(/^[ ,.;]+|[ ,.;]+$/g, '');
    return countWords(tail) >= 2 ? tail : null;
  }

  /** Gabungkan probabilitas model (+ klausa kontras) dengan leksikon. Mengembalikan [pos, neu, neg]. */
  function combine(pFull, pTail, lexScore, words, cfg) {
    let P = pFull.slice();
    if (pTail) P = P.map((v, i) => (1 - cfg.contrastWeight) * v + cfg.contrastWeight * pTail[i]);
    const L = lexProbs(lexScore);
    const lw = words <= cfg.shortMaxWords && lexScore !== 0 ? cfg.shortLexWeight : cfg.lexWeight;
    return P.map((v, i) => (v + lw * L[i]) / (1 + lw));
  }

  /**
   * Bagian bersama semua mesin: label Campuran, sentimen per aspek, aturan tinjau, alasan.
   * cls: [{ i, text, skor (-1..1), polar: 'positive'|'negative'|null, aspects }]
   */
  function finish({ a, question, cfg, label, conf, probs, skor, cls, sumber, contrast }) {
    const pos = cls.filter(c => c.polar === 'positive'), neg = cls.filter(c => c.polar === 'negative');
    let sentimen = label, alasan = '', sugNeutral = false;
    const isMixed = a.clauses.length > 1 && pos.length && neg.length;
    if (isMixed) {
      sentimen = 'mixed';
      conf = Math.min(Math.max(...pos.map(c => c.strength)), Math.max(...neg.map(c => c.strength)));
    } else if (sumber === 'ai' && question === 'saran' && a.score === 0 && conf < cfg.reviewConfidence) {
      sentimen = 'neutral'; sugNeutral = true; // usulan tanpa nada jelas
    }

    // Sentimen per aspek: rata-rata skor klausa tempat aspek disebut
    const aspekSkor = {}, aspek = {};
    a.aspects.forEach(asp => {
      const xs = cls.filter(c => asp.clauses.includes(c.i));
      const s = xs.length ? xs.reduce((t, c) => t + c.skor, 0) / xs.length : skor;
      aspekSkor[asp.id] = +s.toFixed(3);
      // Aspek yang dipuji di satu klausa dan dikritik di klausa lain: Campuran
      aspek[asp.id] = xs.some(c => c.polar === 'positive') && xs.some(c => c.polar === 'negative') ? 'mixed' : tilt(s);
    });

    // Alasan singkat (satu kalimat), dari bukti yang ada
    const names = xs => [...new Set(xs.flatMap(c => c.aspects))].map(aspLabel);
    const list = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' dan ' + xs[xs.length - 1] : xs[0]);
    const words = pol => [...new Set(a.hits.filter(h => (pol === 'positive' ? h.v > 0 : h.v < 0)).map(h => h.term))].slice(0, 2).map(w => `“${w}”`);
    if (sentimen === 'mixed') {
      const p = names(pos), n = names(neg);
      const same = p.length && p.length === n.length && p.every(x => n.includes(x));
      alasan = same ? `Ada pujian dan keluhan sekaligus tentang ${list(p)}.`
        : `Ada pujian${p.length ? ' pada ' + list(p) : ''} sekaligus keluhan${n.length ? ' pada ' + list(n) : ''}.`;
    } else if (sugNeutral) alasan = 'Berisi usulan tanpa nada positif atau negatif yang jelas.';
    else if (sentimen === 'neutral') alasan = 'Tidak ada nada positif atau negatif yang kuat.';
    else {
      const w = words(sentimen);
      alasan = w.length ? `Nada ${SENT_WORD[sentimen]} dari ${w.join(' dan ')}${contrast ? ', dengan klausa setelah kata kontras diperhitungkan' : ''}.`
        : `Model AI membaca keseluruhan kalimat sebagai ${SENT_WORD[sentimen]}.`;
    }

    // Aturan tinjau: keyakinan rendah ATAU Campuran ATAU model & leksikon bertentangan
    const lexLabel = T.NLP.labelOf(a.score);
    const conflict = sumber === 'ai' && sentimen !== 'mixed' && !sugNeutral && lexLabel !== sentimen && Math.abs(a.score) >= cfg.reviewLexConflict;
    const lowConf = sumber === 'ai' && conf < cfg.reviewConfidence;
    const tinjau = sentimen === 'mixed' || lowConf || conflict;
    const alasanTinjau = sentimen === 'mixed' ? 'memuat pujian dan kritik sekaligus'
      : sugNeutral ? 'saran tanpa nada jelas, dianggap netral'
      : lowConf ? `keyakinan AI di bawah ${Math.round(cfg.reviewConfidence * 100)}%`
      : conflict ? 'model & leksikon tidak sepakat' : '';
    const klausa = cls.map(c => ({ text: c.text, polar: c.polar, aspects: c.aspects }));
    return { sentimen, aspek, keyakinan: conf, alasan, probs, skor, aspekSkor, tinjau, alasanTinjau, sumber, contrast: !!contrast, klausa };
  }

  /** Mesin utama: IndoRoBERTa (probabilitas dari probsOf) + leksikon, per kalimat dan per klausa. */
  function hybrid(cfg, probsOf) {
    const ttaText = t => (cfg.ttaTemplate && countWords(t) <= cfg.ttaMaxWords ? cfg.ttaTemplate.replace('{}', t.toLowerCase()) : null);
    const textsFor = t => [t, ttaText(t)].filter(Boolean);
    function mp(t) {
      const p = probsOf(t); if (!p) return null;
      const ta = ttaText(t); if (!ta) return p;
      const q = probsOf(ta); if (!q) return null;
      return p.map((v, i) => (v + q[i]) / 2);
    }
    const clauseList = a => (a.clauses.length > 1 ? a.clauses : []);
    return {
      id: 'hybrid', name: 'IndoRoBERTa + leksikon', ttaText,
      needs(text, a) {
        if (a.empty) return [];
        const tail = contrastTail(text, cfg);
        return [text, tail, ...clauseList(a).filter(c => c.words >= 2).map(c => c.text)].filter(Boolean).flatMap(textsFor);
      },
      classify(text, { question, analysis: a }) {
        if (a.empty) return null;
        const pF = mp(text); if (!pF) return null;
        const tail = contrastTail(text, cfg);
        const pT = tail ? mp(tail) : null;
        if (tail && !pT) return null;
        const F = combine(pF, pT, a.score, countWords(text), cfg);
        const i = argmax(F);
        const cls = [];
        for (const c of clauseList(a)) {
          let sk, strength;
          const pc = c.words >= 2 ? mp(c.text) : null;
          if (c.words >= 2 && !pc) return null;
          if (pc) { const G = combine(pc, null, c.lex, c.words, cfg); sk = G[0] - G[2]; strength = Math.max(...G); }
          else { sk = c.lex; strength = Math.abs(c.lex); }
          // Klausa dianggap berpolaritas bila skornya cukup kuat dan leksikon tidak menyatakan sebaliknya
          const agree = c.lex === 0 || Math.sign(c.lex) === Math.sign(sk);
          const need = c.lex === 0 ? cfg.mixedMinModel : cfg.mixedMin;
          cls.push({ ...c, skor: sk, strength, polar: Math.abs(sk) >= need && agree ? (sk > 0 ? 'positive' : 'negative') : null });
        }
        return finish({ a, question, cfg, label: ORDER[i], conf: F[i], probs: F, skor: F[0] - F[2], cls, sumber: 'ai', contrast: !!pT });
      }
    };
  }

  /** Mesin cadangan tanpa model: hanya leksikon. */
  function lexicon(cfg) {
    return {
      id: 'lexicon', name: 'Leksikon',
      needs: () => [],
      classify(text, { question, analysis: a }) {
        if (a.empty) return null;
        const cls = (a.clauses.length > 1 ? a.clauses : []).map(c => ({ ...c, skor: c.lex, strength: Math.abs(c.lex),
          polar: Math.abs(c.lex) >= cfg.mixedMin ? (c.lex > 0 ? 'positive' : 'negative') : null }));
        return finish({ a, question, cfg, label: a.label, conf: Math.abs(a.score), probs: lexProbs(a.score), skor: a.score, cls, sumber: 'leksikon', contrast: false });
      }
    };
  }

  T.Classifier = { hybrid, lexicon, combine, contrastTail, countWords, lexProbs, ORDER };
})(window.T);
