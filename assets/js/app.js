/* Telaah AI: aplikasi utama */
(function (T) {
  'use strict';
  const { NLP, Parsers, LEX } = T;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const STORE_KEY = 'telaah.v1';
  const SENTS = ['positive', 'neutral', 'negative'];
  const SENT_LABEL = { positive: 'Positif', neutral: 'Netral', negative: 'Negatif', empty: 'Kosong' };
  const Q_LABEL = { pengalaman: 'Pengalaman', saran: 'Saran', other: 'Lainnya' };
  const ASPECTS = LEX.aspects;
  const aspectById = Object.fromEntries(ASPECTS.map(a => [a.id, a]));

  const S = {
    datasets: [],
    docs: [],
    overrides: {},
    stop: new Set(LEX.domainStopwords),
    filters: { classes: new Set(), question: 'all', sentiments: new Set(SENTS), aspect: 'all', q: '', term: null },
    tab: 'ringkasan',
    cloud: { n: 1, color: 'vivid', max: 80 },
    explorer: { sort: 'order', showEmpty: false, review: false, limit: 30 },
    charts: {},
    tableQueue: [],
    useModel: true,      // pakai model AI bila tersedia
    modelCfg: null,      // parameter pipeline dari models/manifest.json
    modelRun: null,      // { done, total } saat inferensi berjalan
    modelLoad: null      // progres unduh model (0–100)
  };
  const ORDER = ['positive', 'neutral', 'negative'];

  /* ====================================================================
     Utilitas
     ==================================================================== */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); };
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const hasAI = d => S.useModel && !!d.m;
  const autoLabel = d => (hasAI(d) ? d.m.label : d.a.label);
  const autoScore = d => (hasAI(d) ? d.m.score : d.a.score);
  const labelOf = d => S.overrides[d.key] || autoLabel(d);
  const sentColor = l => cssVar(l === 'positive' ? '--pos' : l === 'negative' ? '--neg' : '--neu');
  const tiltLabel = v => (v >= NLP.THRESH ? 'positive' : v <= -NLP.THRESH ? 'negative' : 'neutral');

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' toast--err' : '');
    el.innerHTML = `<i data-lucide="${type === 'err' ? 'circle-alert' : 'check-circle-2'}"></i><span>${msg}</span>`;
    $('#toasts').appendChild(el);
    icons();
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); }, type === 'err' ? 5200 : 3200);
  }

  /* ====================================================================
     Persistensi
     ==================================================================== */
  const OVR_KEY = 'telaah.overrides';
  const UI_KEY = 'telaah.ui';
  // Koreksi label disimpan terpisah dari data kelas: bila data besar membuat penyimpanan
  // penuh, koreksi manual tetap aman.
  function save() {
    try { localStorage.setItem(OVR_KEY, JSON.stringify(S.overrides)); } catch (e) { /* abaikan */ }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ datasets: S.datasets, stop: [...S.stop] }));
    } catch (e) { toast('Penyimpanan browser penuh: data kelas tidak tersimpan permanen.', 'err'); }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        S.datasets = Array.isArray(d.datasets) ? d.datasets : [];
        if (d.overrides) S.overrides = d.overrides; // format lama
        if (Array.isArray(d.stop)) S.stop = new Set(d.stop);
      }
    } catch (e) { /* abaikan */ }
    try { const o = JSON.parse(localStorage.getItem(OVR_KEY) || 'null'); if (o) S.overrides = o; } catch (e) { /* abaikan */ }
    try { S.useModel = localStorage.getItem('telaah.useModel') !== '0'; } catch (e) { /* abaikan */ }
    loadUI();
  }

  /** Simpan pilihan tampilan (filter, tab, urutan, dsb.) agar bertahan setelah refresh. */
  const saveUI = debounce(() => {
    const f = S.filters;
    const ui = {
      tab: S.tab,
      filters: { classes: [...f.classes], question: f.question, sentiments: [...f.sentiments], aspect: f.aspect, q: f.q, term: f.term },
      cloud: S.cloud,
      explorer: { sort: S.explorer.sort, showEmpty: S.explorer.showEmpty, review: S.explorer.review },
      lbSort: S.lbSort || 'ovr',
      h2h: S.h2h || []
    };
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* abaikan */ }
  }, 150);
  function loadUI() {
    let ui;
    try { ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); } catch (e) { ui = null; }
    if (!ui) return;
    if (ui.tab) S.tab = ui.tab;
    const f = ui.filters || {};
    if (Array.isArray(f.classes)) S.filters.classes = new Set(f.classes);
    if (['all', 'pengalaman', 'saran'].includes(f.question)) S.filters.question = f.question;
    if (Array.isArray(f.sentiments) && f.sentiments.length) S.filters.sentiments = new Set(f.sentiments.filter(x => SENTS.includes(x)));
    if (!S.filters.sentiments.size) S.filters.sentiments = new Set(SENTS);
    if (typeof f.aspect === 'string' && (f.aspect === 'all' || aspectById[f.aspect])) S.filters.aspect = f.aspect;
    if (typeof f.q === 'string') S.filters.q = f.q;
    if (typeof f.term === 'string' || f.term === null) S.filters.term = f.term ?? null;
    if (ui.cloud) {
      if ([1, 2, 3].includes(ui.cloud.n)) S.cloud.n = ui.cloud.n;
      if (['vivid', 'sent', 'mono'].includes(ui.cloud.color)) S.cloud.color = ui.cloud.color;
      if (ui.cloud.max >= 20 && ui.cloud.max <= 150) S.cloud.max = ui.cloud.max;
    }
    if (ui.explorer) {
      if (typeof ui.explorer.sort === 'string') S.explorer.sort = ui.explorer.sort;
      S.explorer.showEmpty = !!ui.explorer.showEmpty;
      S.explorer.review = !!ui.explorer.review;
    }
    if (typeof ui.lbSort === 'string') S.lbSort = ui.lbSort;
    if (Array.isArray(ui.h2h)) S.h2h = ui.h2h;
  }

  /* ====================================================================
     Data
     ==================================================================== */
  function rebuildDocs() {
    const extra = new Set();
    S.datasets.forEach(ds => (ds.ratings?.instructors || []).forEach(i => {
      const first = i.name.toLowerCase().split(/\s+/)[0];
      if (first.length >= 3) extra.add(first);
    }));
    S.docs = [];
    S.datasets.forEach(ds => ds.feedback.forEach(f => {
      S.docs.push({
        ...f,
        dsName: ds.name,
        key: `${ds.name}|${f.question}|${f.n}|${f.text.slice(0, 48)}`,
        a: NLP.analyze(f.text, extra)
      });
    }));
    // Hilangkan pilihan kelas yang sudah tidak ada
    S.filters.classes.forEach(id => { if (!S.datasets.some(d => d.id === id)) S.filters.classes.delete(id); });
    if (S.modelCfg) S.docs.forEach(d => applyModel(d));
    if (S.docs.length) runModel();
  }

  /* ====================================================================
     Model AI (IndoRoBERTa) + pipeline hybrid
     Logika ini identik dengan pipeline yang dievaluasi di Python
     (lihat models/manifest.json → benchmarks).
     ==================================================================== */
  const MCACHE_KEY = 'telaah.mcache.v4';
  const mcache = new Map();
  try { Object.entries(JSON.parse(localStorage.getItem(MCACHE_KEY) || '{}')).forEach(([k, v]) => mcache.set(k, v)); } catch (e) { /* abaikan */ }
  const saveMCache = debounce(() => {
    try {
      const entries = [...mcache.entries()].slice(-4000);
      localStorage.setItem(MCACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch (e) { /* penuh; cache hanya di memori */ }
  }, 800);

  const countWords = t => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const lexProbs = c => (c === 0 ? [1 / 3, 1 / 3, 1 / 3] : [Math.max(c, 0), 1 - Math.abs(c), Math.max(-c, 0)]);
  const argmax = a => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);

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

  function planDoc(d, cfg) {
    const tail = contrastTail(d.text, cfg);
    const sents = d.a.aspects.map(a => (a.span ? d.text.slice(a.span[0], a.span[1]) : null));
    return { tail, sents };
  }

  function applyModel(d) {
    const cfg = S.modelCfg;
    if (!cfg || d.a.empty) { d.m = null; return; }
    const pF = mcache.get(d.text);
    if (!pF) { d.m = null; return; }
    const { tail, sents } = planDoc(d, cfg);
    const pT = tail ? mcache.get(tail) : null;
    if (tail && !pT) { d.m = null; return; }
    const F = combine(pF, pT, d.a.score, countWords(d.text), cfg);
    const i = argmax(F), label = ORDER[i], conf = F[i];
    const lexLabel = NLP.labelOf(d.a.score);
    const conflict = lexLabel !== label && Math.abs(d.a.score) >= cfg.reviewLexConflict;
    const aspects = {};
    d.a.aspects.forEach((a, k) => {
      const st = sents[k], pa = st && mcache.get(st);
      if (pa) { const Fa = combine(pa, null, a.score, countWords(st), cfg); aspects[a.id] = Fa[0] - Fa[2]; }
    });
    d.m = {
      label, confidence: conf, probs: F, score: F[0] - F[2],
      review: conf < cfg.reviewConfidence || conflict,
      reason: conf < cfg.reviewConfidence ? 'keyakinan rendah' : conflict ? 'model & leksikon tidak sepakat' : '',
      modelLabel: ORDER[argmax(pF)], contrast: !!pT, aspects
    };
  }

  let modelToken = 0;
  async function runModel() {
    const TM = window.TelaahModel;
    if (!S.useModel || !TM) { renderModelChip(); return; }
    const token = ++modelToken;
    if (TM.state.status !== 'ready') {
      S.modelLoad = 0; renderModelChip();
      const st = await TM.load(p => {
        if (TM.state.status === 'loading' && p.file && /\.onnx$/.test(p.file)) { S.modelLoad = Math.round(p.progress || 0); renderModelChip(); }
      });
      S.modelLoad = null;
      if (st.status !== 'ready') { renderModelChip(); if (token === modelToken) renderAll(); return; }
    }
    S.modelCfg = TM.state.manifest.pipeline;
    const need = new Set();
    S.docs.forEach(d => {
      if (d.a.empty) return;
      const { tail, sents } = planDoc(d, S.modelCfg);
      [d.text, tail, ...sents].forEach(t => { if (t && !mcache.has(t)) need.add(t); });
    });
    if (need.size) {
      const arr = [...need];
      S.modelRun = { done: 0, total: arr.length }; renderModelChip();
      try {
        const res = await TM.classify(arr, (done, total) => { S.modelRun = { done, total }; renderModelChip(); });
        arr.forEach((t, i) => mcache.set(t, [res[i].probs.positive, res[i].probs.neutral, res[i].probs.negative].map(v => +v.toFixed(5))));
        saveMCache();
      } catch (e) {
        console.warn('[Telaah AI] inferensi gagal', e);
        toast('Model AI gagal menganalisis. Memakai leksikon.', 'err');
      }
      S.modelRun = null;
    }
    S.modelLoad = null;
    if (token !== modelToken) { renderModelChip(); return; }
    S.docs.forEach(d => applyModel(d));
    renderAll();
    renderModelChip();
  }

  let manifestCache = null;
  async function getManifest() {
    if (window.TelaahModel?.state.manifest) return window.TelaahModel.state.manifest;
    if (manifestCache) return manifestCache;
    try { const r = await fetch('models/manifest.json', { cache: 'no-cache' }); if (r.ok) manifestCache = await r.json(); } catch (e) { /* file:// */ }
    return manifestCache;
  }

  async function renderModelDialog() {
    const box = $('#modelBody');
    const M = await getManifest();
    const TM = window.TelaahModel, st = TM ? TM.state : { status: 'idle' };
    const ms = modelStats(S.docs.filter(d => !d.a.empty));
    const statusTxt = !S.useModel ? 'Model AI dimatikan. Semua komentar dinilai dengan leksikon.'
      : st.status === 'ready' ? `Model aktif di perangkat ini (${st.device === 'webgpu' ? 'WebGPU' : 'WebAssembly'}, sumber: ${st.source || 'lokal'}). ${ms.ai} komentar dinilai AI.`
      : st.status === 'loading' || S.modelLoad !== null ? 'Model sedang dimuat…'
      : st.status === 'unavailable' ? (st.error || 'Model tidak tersedia.') : 'Model belum dimuat.';
    $('#useModel').checked = S.useModel;
    const b = M?.benchmarks || [];
    const cell = (o, k) => (o && o[k] != null ? fmt(o[k], 1) + '%' : '–');
    const best = row => Math.max(row.lexicon?.acc || 0, row.model?.acc || 0, row.hybrid?.acc || 0);
    box.innerHTML = `
      <div class="mstatus" data-tone="${S.useModel && st.status === 'ready' ? 'ok' : st.status === 'unavailable' ? 'warn' : 'idle'}">
        <i data-lucide="${S.useModel && st.status === 'ready' ? 'shield-check' : 'info'}"></i><p>${esc(statusTxt)}</p>
      </div>

      ${ms.ai ? `<div class="mstats">
        <div><b>${fmt(ms.ai)}</b><span>dinilai AI</span></div>
        <div><b>${fmt(pct(ms.agree, ms.ai))}%</b><span>sepakat dengan leksikon</span></div>
        <div><b>${fmt(ms.review)}</b><span>perlu ditinjau</span></div>
      </div>` : ''}

      <h3 class="msec">Cara kerja</h3>
      <ol class="msteps">
        <li><b>IndoRoBERTa</b> (${esc(M?.params || '124 juta parameter')}, dilatih pada ${esc(M?.trainedOn || 'SmSA')}) membaca seluruh komentar dan memberi probabilitas positif / netral / negatif.</li>
        <li>Bila ada kata kontras (<i>tapi, namun, sayangnya, cuma…</i>), klausa setelahnya dinilai ulang dan diberi bobot ${M ? Math.round(M.pipeline.contrastWeight * 100) : 40}%.</li>
        <li><b>Leksikon</b> Bahasa Indonesia ikut memberi suara (bobot ${M ? M.pipeline.lexWeight : 0.25}), lebih besar untuk komentar ≤${M ? M.pipeline.shortMaxWords : 3} kata seperti “ok”, “mantap”.</li>
        <li>Komentar dengan keyakinan &lt; ${M ? Math.round(M.pipeline.reviewConfidence * 100) : 70}% atau yang sinyal model & leksikonnya bertentangan ditandai <b>Perlu ditinjau</b>.</li>
        <li>Semua berjalan di browser Anda. Teks tidak dikirim ke mana pun.</li>
      </ol>

      <h3 class="msec">Hasil uji (akurasi)</h3>
      ${b.length ? `<div class="table-wrap"><table class="data-table data-table--compact mtable">
        <thead><tr><th scope="col">Dataset</th><th scope="col" class="num">Leksikon lama</th><th scope="col" class="num">Model saja</th><th scope="col" class="num">Hybrid (dipakai)</th></tr></thead>
        <tbody>${b.map(r => `<tr>
          <td class="name">${esc(r.dataset)}<small>${r.n} kalimat berlabel</small></td>
          <td class="num">${cell(r.lexicon, 'acc')}</td><td class="num">${cell(r.model, 'acc')}</td>
          <td class="num"><span class="score-chip ${r.hybrid.acc >= best(r) - 0.001 ? 'score-chip--hi' : 'score-chip--mid'}">${cell(r.hybrid, 'acc')}</span></td></tr>
          ${r.review ? `<tr class="subrow"><td class="name" colspan="3"><small>↳ ditandai “Perlu ditinjau”: ${fmt(r.review.flaggedPct, 1)}% komentar · menangkap ${esc(r.review.errorsCaught)} kesalahan</small></td><td class="num"><small>tidak ditandai: <b>${fmt(r.review.accUnflagged, 1)}%</b></small></td></tr>` : ''}
          ${r.lexicon?.unseen != null ? `<tr class="subrow"><td class="name"><small>↳ komentar yang tidak dipakai menyusun leksikon</small></td><td class="num">${cell(r.lexicon, 'unseen')}</td><td class="num">${cell(r.model, 'unseen')}</td><td class="num"><b>${cell(r.hybrid, 'unseen')}</b></td></tr>` : ''}`).join('')}
        </tbody></table></div>
        <p class="mnote">${b.map(r => `<b>${esc(r.dataset)}:</b> ${esc(r.note)}`).join('<br>')}${M.measurement ? `<br>${esc(M.measurement)}` : ''}</p>` : '<p class="mnote">Data benchmark tidak dapat dimuat (buka lewat server lokal).</p>'}

      ${M?.comparedModels ? `<h3 class="msec">Model yang dibandingkan <small>akurasi SmSA test</small></h3>
      <ul class="mcompare">${M.comparedModels.slice().sort((a, b) => b.smsa - a.smsa).map(m => `
        <li class="${m.chosen ? 'is-chosen' : ''}"><span class="mcompare__name">${esc(m.name.replace(/^[^/]+\//, ''))}${m.chosen ? ' <em>dipilih</em>' : ''}</span>
          <span class="mcompare__bar"><span style="width:${Math.max(0, (m.smsa - 60) / 40 * 100)}%"></span></span><b>${fmt(m.smsa, 1)}%</b></li>`).join('')}
      </ul>` : ''}

      <h3 class="msec">Keterbatasan</h3>
      <ul class="mlimits">${(M?.limitations || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${M ? `<p class="mnote">Model: <a href="${esc(M.url)}" target="_blank" rel="noopener">${esc(M.base)}</a> oleh ${esc(M.author)} · lisensi ${esc(M.license)} · ${esc(M.format)}, ${M.sizeMB} MB · dievaluasi ${esc(M.evaluatedOn)}.</p>` : ''}`;
    icons();
  }

  function modelStats(docs) {
    const ai = docs.filter(d => hasAI(d));
    const review = ai.filter(d => d.m.review && !S.overrides[d.key]).length;
    const agree = ai.filter(d => d.m.label === d.a.label).length;
    return { total: docs.length, ai: ai.length, review, agree };
  }

  function renderModelChip() {
    const btn = $('#modelBtn');
    if (!btn) return;
    const TM = window.TelaahModel, st = TM ? TM.state.status : 'idle';
    let tone = 'idle', text = 'Model AI', sub = '';
    if (!S.useModel) { tone = 'off'; text = 'Mode leksikon'; sub = 'AI dimatikan'; }
    else if (S.modelRun) { tone = 'busy'; text = 'Menganalisis'; sub = `${S.modelRun.done}/${S.modelRun.total}`; }
    else if (st === 'loading') { tone = 'busy'; text = 'Memuat model AI'; sub = S.modelLoad ? S.modelLoad + '%' : '…'; }
    else if (st === 'ready') { tone = 'ok'; text = 'IndoRoBERTa'; sub = 'AI aktif'; }
    else if (st === 'unavailable') { tone = 'warn'; text = 'Mode leksikon'; sub = 'model tak tersedia'; }
    btn.dataset.tone = tone;
    btn.innerHTML = `<span class="model-chip__dot"></span><span class="model-chip__text"><b>${text}</b><small>${sub}</small></span>`;
    btn.setAttribute('aria-label', `Status analisis: ${text} ${sub}. Klik untuk detail keandalan model.`);
    if ($('#modelDialog')?.open) renderModelDialog();
  }

  function addDatasets(list) {
    let added = 0, comments = 0;
    list.forEach(ds => {
      const dupe = S.datasets.findIndex(x => x.name === ds.name && x.date === ds.date && x.kind === ds.kind);
      if (dupe >= 0) S.datasets.splice(dupe, 1, ds); else S.datasets.push(ds);
      added++; comments += ds.feedback.length;
    });
    rebuildDocs(); save(); renderAll();
    if (added) toast(`${added} sumber dimuat · ${fmt(comments)} komentar`);
  }

  function selectedDatasets() {
    return S.filters.classes.size ? S.datasets.filter(d => S.filters.classes.has(d.id)) : S.datasets;
  }

  /** Dokumen setelah filter. opts.skip: nama filter yang diabaikan. */
  function filtered(opts = {}) {
    const f = S.filters, skip = new Set(opts.skip || []);
    const q = f.q.trim().toLowerCase();
    return S.docs.filter(d => {
      if (d.a.empty && !opts.includeEmpty) return false;
      if (!skip.has('classes') && f.classes.size && !f.classes.has(d.datasetId)) return false;
      if (!skip.has('question') && f.question !== 'all' && d.question !== f.question) return false;
      if (!skip.has('aspect') && f.aspect !== 'all' && !d.a.aspects.some(a => a.id === f.aspect)) return false;
      if (!skip.has('q') && q && !d.text.toLowerCase().includes(q)) return false;
      if (!skip.has('term') && f.term && !NLP.docHasTerm(d, f.term)) return false;
      if (!skip.has('sent') && !d.a.empty && !f.sentiments.has(labelOf(d))) return false;
      return true;
    });
  }

  function countLabels(docs) {
    const c = { positive: 0, neutral: 0, negative: 0 };
    docs.forEach(d => { const l = labelOf(d); if (c[l] !== undefined) c[l]++; });
    return c;
  }
  const avgScore = docs => (docs.length ? docs.reduce((s, d) => s + effScore(d), 0) / docs.length : 0);
  /** Net Sentiment Score: % positif dikurangi % negatif (netral tidak dihitung). Rentang −100…+100. */
  const nssOf = c => { const n = c.positive + c.neutral + c.negative; return n ? pct(c.positive, n) - pct(c.negative, n) : 0; };
  const nssDocs = docs => nssOf(countLabels(docs));
  const nssBand = v => (v >= 60 ? 'Sangat positif' : v >= 20 ? 'Positif' : v > -20 ? 'Campuran' : v > -60 ? 'Negatif' : 'Sangat negatif');
  // Skor mengikuti koreksi manual agar indeks konsisten dengan label
  function effScore(d) {
    const o = S.overrides[d.key];
    const sc = autoScore(d);
    if (!o || o === autoLabel(d)) return sc;
    return o === 'positive' ? Math.max(0.5, Math.abs(sc)) : o === 'negative' ? -Math.max(0.5, Math.abs(sc)) : 0;
  }

  function aspectStats(docs) {
    return ASPECTS.map(asp => {
      const rows = [];
      docs.forEach(d => {
        const hit = d.a.aspects.find(x => x.id === asp.id);
        if (!hit) return;
        const ms = hasAI(d) && d.m.aspects ? d.m.aspects[asp.id] : undefined;
        rows.push({ d, s: ms !== undefined ? ms : hit.score, span: hit.span });
      });
      const c = { positive: 0, neutral: 0, negative: 0 };
      rows.forEach(r => c[tiltLabel(r.s)]++);
      const net = rows.length ? rows.reduce((s, r) => s + r.s, 0) / rows.length : 0;
      // Contoh: kalimat dengan nada paling kuat, utamakan yang cukup informatif
      const cands = rows.slice()
        .sort((a, b) => (Math.abs(b.s) + (b.d.a.words > 3 ? 1 : 0)) - (Math.abs(a.s) + (a.d.a.words > 3 ? 1 : 0)))
        .map(r => ({ id: r.d.id + ':' + (r.span ? r.span[0] : 0), text: r.span ? r.d.text.slice(r.span[0], r.span[1]) : r.d.text }));
      return { ...asp, n: rows.length, c, net, example: cands[0] || null, cands, rows };
    });
  }

  function weightedAvg(items) {
    const valid = items.filter(i => i.v != null && !isNaN(i.v));
    if (!valid.length) return null;
    const w = valid.reduce((s, i) => s + (i.w || 1), 0);
    return valid.reduce((s, i) => s + i.v * (i.w || 1), 0) / w;
  }

  function dateRange(dss) {
    const dates = dss.map(d => d.date).filter(Boolean);
    if (!dates.length) return '';
    if (dates.length === 1) return dates[0].replace(/^(.+?) - \1$/, '$1');
    const parsed = dates.flatMap(s => s.split(/\s+-\s+/)).map(s => new Date(s)).filter(d => !isNaN(d));
    if (!parsed.length) return `${dates.length} periode`;
    const min = new Date(Math.min(...parsed)), max = new Date(Math.max(...parsed));
    const o = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${min.toLocaleDateString('id-ID', o)} – ${max.toLocaleDateString('id-ID', o)}`;
  }

  /* ====================================================================
     Render: kerangka & filter
     ==================================================================== */
  function renderAll() {
    saveUI();
    const has = S.datasets.length > 0;
    $('#emptyState').hidden = has;
    $('#filterbar').hidden = !has;
    $('.tabs').hidden = !has;
    $$('.panel').forEach(p => { p.hidden = !has || p.dataset.panel !== S.tab; });
    renderMeta();
    if (!has) { icons(); return; }
    renderFilters();
    renderTab();
    icons();
  }

  function renderMeta() {
    const el = $('#datasetMeta');
    if (!S.datasets.length) { el.innerHTML = ''; return; }
    const n = S.docs.filter(d => !d.a.empty).length;
    el.innerHTML = `<span><b>${S.datasets.length}</b> kelas</span><span class="sep"></span><span><b>${fmt(n)}</b> komentar</span>${dateRange(S.datasets) ? `<span class="sep"></span><span>${esc(dateRange(S.datasets))}</span>` : ''}`;
  }

  function renderFilters() {
    const f = S.filters;
    // Kelas
    const clsCount = f.classes.size;
    $('#classValue').textContent = !clsCount ? `Semua (${S.datasets.length})` : clsCount === 1 ? truncate(S.datasets.find(d => f.classes.has(d.id))?.name || '', 28) : `${clsCount} dipilih`;
    $('#classBtn').classList.toggle('is-active', clsCount > 0);
    $('#classList').innerHTML = S.datasets.map(ds => {
      const n = S.docs.filter(d => d.datasetId === ds.id && !d.a.empty).length;
      return `<label class="checkrow"><input type="checkbox" value="${ds.id}" ${f.classes.has(ds.id) ? 'checked' : ''}><span>${esc(ds.name)}<small>${esc(ds.date || ds.source)} · ${n} komentar</small></span></label>`;
    }).join('');

    // Pertanyaan
    $$('#questionSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === f.question)));

    // Sentimen (hitungan mengabaikan filter sentimen)
    const base = filtered({ skip: ['sent'] });
    const c = countLabels(base);
    $$('#sentToggles .stoggle').forEach(b => {
      b.setAttribute('aria-pressed', String(f.sentiments.has(b.dataset.s)));
      b.querySelector('.stoggle__n').textContent = c[b.dataset.s];
    });

    // Aspek
    const aspBase = filtered({ skip: ['aspect'] });
    const aspItems = [{ id: 'all', label: 'Semua aspek', icon: 'layers', n: aspBase.length }]
      .concat(ASPECTS.map(a => ({ ...a, n: aspBase.filter(d => d.a.aspects.some(x => x.id === a.id)).length })));
    $('#aspectMenu').innerHTML = aspItems.map(a =>
      `<button role="menuitemradio" aria-checked="${f.aspect === a.id}" data-aspect="${a.id}"><i data-lucide="${a.icon}"></i><span>${esc(a.label)}</span><span class="count">${a.n}</span></button>`).join('');
    $('#aspectValue').textContent = f.aspect === 'all' ? 'Semua' : aspectById[f.aspect].label;
    $('#aspectBtn').classList.toggle('is-active', f.aspect !== 'all');

    // Chip aktif
    const chips = [];
    if (f.term) chips.push(`<button class="achip" data-clear="term" aria-label="Hapus filter kata ${esc(f.term)}"><small>kata</small>${esc(f.term)}<i data-lucide="x"></i></button>`);
    $('#activeChips').innerHTML = chips.join('');

    const active = f.classes.size || f.question !== 'all' || f.sentiments.size < 3 || f.aspect !== 'all' || f.q || f.term;
    $('#resetBtn').hidden = !active;
    if ($('#searchInput').value !== f.q) $('#searchInput').value = f.q;

    const shown = filtered();
    $('#tabCount').textContent = shown.length;
  }

  function renderTab() {
    const map = { ringkasan: renderOverview, kata: renderWords, aspek: renderAspects, skor: renderScores, jelajah: renderExplorer };
    (map[S.tab] || renderOverview)();
  }

  function setTab(tab, push = true) {
    if (!['ringkasan', 'kata', 'aspek', 'skor', 'jelajah'].includes(tab)) tab = 'ringkasan';
    S.tab = tab;
    $$('.tabs a').forEach(a => {
      const on = a.dataset.tab === tab;
      a.setAttribute('aria-selected', String(on));
      a.tabIndex = on ? 0 : -1;
    });
    if (push && location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    renderAll();
  }

  /* ====================================================================
     Chart.js helpers
     ==================================================================== */
  function chartDefaults() {
    if (!window.Chart) return false;
    Chart.defaults.font.family = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.font.weight = '500';
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--line');
    Chart.defaults.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    const tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = '#0A2150';
    tt.titleColor = '#FFFFFF';
    tt.bodyColor = 'rgba(255,255,255,.85)';
    tt.borderColor = 'rgba(255,255,255,.08)'; tt.borderWidth = 1;
    tt.padding = 12; tt.cornerRadius = 10; tt.boxPadding = 5; tt.titleFont = { weight: '700', size: 12.5 }; tt.bodyFont = { size: 12 };
    tt.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.legend.labels.color = cssVar('--ink-2');
    return true;
  }
  function makeChart(id, config) {
    if (S.charts[id]) { S.charts[id].destroy(); delete S.charts[id]; }
    const el = document.getElementById(id);
    if (!el || !chartDefaults()) return null;
    S.charts[id] = new Chart(el, config);
    return S.charts[id];
  }

  /* ====================================================================
     Tab: Ringkasan
     ==================================================================== */
  function renderOverview() {
    const docs = filtered();
    const base = filtered({ skip: ['sent'] });
    const c = countLabels(base);
    const total = base.length;
    const dss = selectedDatasets();
    const posP = pct(c.positive, total);

    // Hero
    const aspects = aspectStats(base).filter(a => a.n);
    const topAsp = aspects.slice().sort((a, b) => b.c.positive - a.c.positive)[0];
    const words = NLP.ngrams(base, 1, S.stop).slice(0, 3).map(t => `“${esc(t.term)}”`);
    $('#heroEyebrow').innerHTML = `<i data-lucide="calendar-range"></i>${dss.length} kelas${dateRange(dss) ? ' · ' + esc(dateRange(dss)) : ''}`;
    let headline;
    if (!total) headline = 'Belum ada komentar yang cocok dengan <span class="accent">filter</span> ini.';
    else if (posP >= 80) headline = `Peserta <span class="accent">sangat puas</span>: ${fmt(posP)}% komentar bernada positif.`;
    else if (posP >= 60) headline = `Mayoritas peserta <span class="accent">puas</span>, dengan beberapa catatan.`;
    else if (posP >= 40) headline = `Tanggapan <span class="accent">beragam</span>: pujian dan kritik berimbang.`;
    else headline = `Ada <span class="accent">sinyal masalah</span> yang perlu ditindaklanjuti.`;
    $('#heroHeadline').innerHTML = headline;
    $('#heroLede').innerHTML = total
      ? `${topAsp ? `Aspek yang paling sering dipuji adalah <b>${esc(topAsp.label)}</b>. ` : ''}${words.length ? `Kata yang paling sering muncul: ${words.join(', ')}.` : ''}`
      : 'Longgarkan filter di atas atau tekan Reset.';

    // Gauge setengah lingkaran
    $('#sentGauge').innerHTML = gaugeSvg(nssOf(c), c, total);

    // KPIs
    const empties = S.docs.filter(d => d.a.empty && (!S.filters.classes.size || S.filters.classes.has(d.datasetId))).length;
    const rating = weightedAvg(dss.map(d => ({ v: d.ratings?.total ?? d.ratings?.overall, w: d.respondents || 1 })));
    const rec = weightedAvg(dss.map(d => ({ v: d.ratings?.recommend, w: d.respondents || 1 })));
    const resp = dss.reduce((s, d) => s + (d.respondents || 0), 0);
    const part = dss.reduce((s, d) => s + (d.participants || 0), 0);
    const kpis = [
      { icon: 'message-square-text', label: 'Komentar dianalisis', value: fmt(total), foot: (() => { const ms = modelStats(base); return ms.ai ? `${fmt(ms.review)} perlu ditinjau · ${fmt(empties)} kosong` : `${fmt(empties)} jawaban kosong dilewati`; })() },
      { icon: 'smile', label: 'Bernada positif', value: fmt(posP), unit: '%', meter: posP, foot: `${c.positive} dari ${total} komentar` },
      { icon: 'star', label: 'Rating rata-rata', value: rating == null ? '–' : fmt(rating, 2), unit: rating == null ? '' : '/5', meter: rating == null ? null : rating / 5 * 100, foot: rating == null ? 'Tidak ada data rating' : 'Tertimbang jumlah responden' },
      { icon: 'share-2', label: 'Rekomendasi', value: rec == null ? '–' : fmt(rec), unit: rec == null ? '' : '%', meter: rec, foot: rec == null ? 'Tidak ada data' : 'Dari pertanyaan rekomendasi' },
      { icon: 'users', label: 'Tingkat respons', value: part ? fmt(pct(resp, part)) : '–', unit: part ? '%' : '', meter: part ? pct(resp, part) : null, foot: part ? `${resp} dari ${part} peserta` : 'Jumlah peserta tidak diketahui' }
    ];
    $('#kpis').innerHTML = kpis.map(k => `
      <div class="kpi">
        <span class="kpi__label"><span class="kpi__icon"><i data-lucide="${k.icon}"></i></span>${k.label}</span>
        <span class="kpi__value">${k.value}${k.unit ? `<small>${k.unit}</small>` : ''}</span>
        ${k.meter != null ? `<div class="meter" role="img" aria-label="${fmt(k.meter)}%"><span style="width:${Math.max(0, Math.min(100, k.meter))}%"></span></div>` : ''}
        <span class="kpi__foot">${k.foot}</span>
      </div>`).join('');

    renderComposition(base, c);
    renderInsights(base, c, aspects, dss);
    renderAttention(docs);
    renderClassBars();
    renderScatter(docs);
    renderQuotes(docs);
  }

  function renderInsights(base, c, aspects, dss) {
    const out = [];
    const total = base.length;
    if (!total) { $('#insights').innerHTML = '<li>Tidak ada komentar pada filter ini.</li>'; return; }
    out.push(`<b>${fmt(pct(c.positive, total))}%</b> komentar positif, <b>${fmt(pct(c.neutral, total))}%</b> netral, dan <b>${fmt(pct(c.negative, total))}%</b> negatif dari ${total} komentar.`);

    const praised = aspects.filter(a => a.c.positive).sort((a, b) => b.c.positive - a.c.positive).slice(0, 2);
    if (praised.length) out.push(`Paling sering dipuji: ${praised.map(a => `<span class="tag">${esc(a.label)} · ${a.c.positive}×</span>`).join(' dan ')}.`);

    const weak = aspects.filter(a => a.c.negative).sort((a, b) => a.net - b.net)[0];
    if (weak) {
      const negWords = new Map();
      weak.rows.forEach(r => r.d.a.hits.filter(h => h.v < 0).forEach(h => negWords.set(h.term, (negWords.get(h.term) || 0) + 1)));
      const ex = [...negWords.keys()].slice(0, 3).map(w => `“${esc(w)}”`).join(', ');
      out.push(`Titik lemah: <span class="tag">${esc(weak.label)}</span> dengan ${weak.c.negative} sebutan bernada negatif${ex ? `, muncul kata ${ex}` : ''}.`);
    }

    const ms = modelStats(base);
    if (ms.ai) out.push(`Dinilai oleh <b>model AI IndoRoBERTa</b> + leksikon. <b>${ms.review}</b> komentar ditandai <span class="tag">Perlu ditinjau</span> karena keyakinan rendah atau sinyal yang bertentangan. Cek di tab Jelajah.`);
    const sugg = base.filter(d => d.a.suggestion).length;
    if (sugg) out.push(`<b>${sugg}</b> komentar berisi saran eksplisit. Lihat daftar <i>Perlu perhatian</i> di samping.`);

    const short = base.filter(d => d.a.words <= 3).length;
    if (pct(short, total) >= 30) out.push(`<b>${fmt(pct(short, total))}%</b> komentar hanya ≤3 kata (mis. “baik”, “ok”). Pertanyaan terbuka yang lebih spesifik bisa menghasilkan masukan yang lebih kaya.`);

    if (dss.length > 1) {
      const per = dss.map(ds => ({ ds, docs: base.filter(d => d.datasetId === ds.id) })).filter(x => x.docs.length)
        .map(x => ({ ...x, nss: nssDocs(x.docs) })).sort((a, b) => b.nss - a.nss);
      if (per.length > 1) out.push(`NSS tertinggi di <span class="tag">${esc(truncate(per[0].ds.name, 40))}</span> (${signed(per[0].nss, 0)}), terendah di <span class="tag">${esc(truncate(per[per.length - 1].ds.name, 40))}</span> (${signed(per[per.length - 1].nss, 0)}).`);
    }

    dss.forEach(ds => {
      const r = ds.ratings || {};
      const rating = r.total ?? r.overall;
      if (rating != null && r.recommend != null && r.recommend < (rating / 5) * 100 - 15) {
        out.push(`Di <span class="tag">${esc(truncate(ds.name, 40))}</span>, rating ${fmt(rating, 2)}/5 tapi hanya <b>${fmt(r.recommend)}%</b> yang akan merekomendasikan. Kepuasan belum sepenuhnya menjadi advokasi.`);
      }
      if (ds.participants && ds.respondents != null && pct(ds.respondents, ds.participants) < 80) {
        out.push(`Tingkat respons <span class="tag">${esc(truncate(ds.name, 40))}</span> hanya ${fmt(pct(ds.respondents, ds.participants))}%, jadi hasil mungkin belum mewakili seluruh peserta.`);
      }
    });

    const bi = NLP.ngrams(base, 2, S.stop).filter(t => t.count > 1).slice(0, 3);
    if (bi.length) out.push(`Frasa berulang: ${bi.map(t => `<span class="tag">${esc(t.term)} · ${t.count}×</span>`).join(' ')}.`);

    $('#insights').innerHTML = out.map(s => `<li><span>${s}</span></li>`).join('');
  }

  function renderAttention(docs) {
    const list = docs.filter(d => labelOf(d) === 'negative' || d.a.suggestion)
      .sort((a, b) => effScore(a) - effScore(b));
    $('#attnCount').textContent = list.length;
    $('#attention').innerHTML = list.length ? list.map(d => {
      const neg = labelOf(d) === 'negative';
      return `<li><button data-open="${d.id}">
        <span class="attn__icon attn__icon--${neg ? 'neg' : 'sug'}"><i data-lucide="${neg ? 'triangle-alert' : 'lightbulb'}"></i></span>
        <span>${esc(truncate(d.text, 220))}<span class="attn__meta">${neg ? 'Negatif' : 'Saran'} · ${esc(truncate(d.dsName, 36))} · ${Q_LABEL[d.question] || ''}</span></span>
      </button></li>`;
    }).join('') : '<li class="none">Tidak ada komentar negatif atau saran pada filter ini.</li>';
  }

  /** Gauge setengah lingkaran (SVG) untuk Net Sentiment Score −100…+100. */
  function gaugeSvg(v, c, total) {
    const cx = 150, cy = 142, r = 112;
    const pt = x => { const a = Math.PI * (1 - (x + 100) / 200); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arc = (a, b) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
    const val = Math.max(-100, Math.min(100, v));
    const [nx, ny] = pt(val);
    const n = c.positive + c.neutral + c.negative;
    const pp = pct(c.positive, n), pn = pct(c.negative, n);
    const band = nssBand(val);
    const bandIcon = val >= 20 ? 'trending-up' : val <= -20 ? 'trending-down' : 'minus';
    const tick = (x, label) => { const [tx, ty] = pt(x); const [ox, oy] = [cx + (tx - cx) * 1.2, cy + (ty - cy) * 1.2]; return `<text class="gauge__tick" x="${ox.toFixed(1)}" y="${(oy + 4).toFixed(1)}" text-anchor="middle">${label}</text>`; };
    return `
      <p class="gauge__label">Net Sentiment Score</p>
      <svg viewBox="0 0 300 176" role="img" aria-label="Net Sentiment Score ${Math.round(val)}: ${fmt(pp)} persen positif dikurangi ${fmt(pn)} persen negatif">
        <path d="${arc(-100, -21)}" fill="none" stroke="#FF8F86" stroke-opacity=".32" stroke-width="16" stroke-linecap="butt"/>
        <path d="${arc(-19, 19)}" fill="none" stroke="#C9D2E3" stroke-opacity=".28" stroke-width="16" stroke-linecap="butt"/>
        <path d="${arc(21, 100)}" fill="none" stroke="#2FCFC2" stroke-opacity=".32" stroke-width="16" stroke-linecap="butt"/>
        ${Math.abs(val) > 0.5 ? `<path d="${val > 0 ? arc(0, val) : arc(val, 0)}" fill="none" stroke="${val >= 20 ? '#2FCFC2' : val <= -20 ? '#FF8F86' : '#E3E8F2'}" stroke-width="16" stroke-linecap="round"/>` : ''}
        <line x1="${cx}" y1="${cy - r - 12}" x2="${cx}" y2="${cy - r + 12}" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
        <circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="11" fill="#fff" stroke="#0A2150" stroke-width="4"/>
        ${tick(-100, '−100')}${tick(0, '0')}${tick(100, '+100')}
        <text class="gauge__value" x="${cx}" y="${cy - 6}" text-anchor="middle">${val > 0.5 ? '+' : val < -0.5 ? '−' : ''}${fmt(Math.abs(val))}</text>
        <text class="gauge__unit" x="${cx}" y="${cy + 18}" text-anchor="middle">${esc(band)}</text>
      </svg>
      <p class="gauge__formula"><span class="gf gf--pos">${fmt(pp)}% positif</span><span class="gf__op">−</span><span class="gf gf--neg">${fmt(pn)}% negatif</span></p>
      <p class="gauge__note"><i data-lucide="${bandIcon}"></i>Netral tidak dihitung. Dari ${fmt(total)} komentar.</p>`;
  }

  /** Waffle: satu kotak per komentar + ringkasan per label. */
  function renderComposition(base, c) {
    const total = base.length;
    const order = { positive: 0, neutral: 1, negative: 2 };
    const docs = base.slice().sort((a, b) => order[labelOf(a)] - order[labelOf(b)] || effScore(b) - effScore(a));
    const per = Math.max(1, Math.ceil(docs.length / 240));
    const cells = [];
    for (let i = 0; i < docs.length; i += per) {
      const d = docs[i], l = labelOf(d);
      cells.push(`<button class="waffle__cell waffle__cell--${l} ${S.filters.sentiments.has(l) ? '' : 'is-off'}" role="listitem" data-open="${d.id}"
        title="${esc(SENT_LABEL[l])} · ${esc(truncate(d.text, 90))}" aria-label="${SENT_LABEL[l]}: ${esc(truncate(d.text, 60))}"></button>`);
    }
    const cols = Math.max(6, Math.min(24, Math.ceil(Math.sqrt(cells.length * 2.2))));
    $('#waffle').style.gridTemplateColumns = `repeat(${cols}, minmax(0, 38px))`;
    $('#waffle').innerHTML = total ? cells.join('') + (per > 1 ? `<p class="waffle__note">1 kotak ≈ ${per} komentar</p>` : '') : '<p class="none" style="grid-column:1/-1">Tidak ada data</p>';
    const segs = [['positive', 'pos'], ['neutral', 'neu'], ['negative', 'neg']];
    $('#sentStrip').innerHTML = segs.map(([l, k]) => `
      <button class="sent-row ${S.filters.sentiments.has(l) ? '' : 'is-off'}" data-solo="${l}" aria-label="${SENT_LABEL[l]}: ${c[l]} komentar. Klik untuk memfilter.">
        <span class="dot dot--${k}"></span>
        <span class="sent-row__name">${SENT_LABEL[l]}<small>${c[l]} komentar</small></span>
        <span class="sent-row__pct">${fmt(pct(c[l], total))}%</span>
        <span class="sent-row__bar"><span style="width:${pct(c[l], total)}%;background:var(--${k})"></span></span>
      </button>`).join('');
  }

  /** Diverging bar per kelas: negatif ke kiri, positif ke kanan, netral di tengah. */
  function renderClassBars() {
    const base = filtered({ skip: ['classes', 'sent'] });
    const rows = S.datasets.map(ds => {
      const docs = base.filter(d => d.datasetId === ds.id);
      const c = countLabels(docs);
      return { ds, c, n: docs.length, nss: nssOf(c) };
    }).filter(r => r.n).sort((a, b) => b.nss - a.nss);
    if (!rows.length) { $('#classBars').innerHTML = '<p class="none">Tidak ada data.</p>'; return; }
    const lbl = (p, min) => (p >= min ? fmt(p) + '%' : '');
    $('#classBars').innerHTML = rows.map(r => {
      const pp = pct(r.c.positive, r.n), pn = pct(r.c.neutral, r.n), pg = pct(r.c.negative, r.n);
      const half = pn / 2;
      // Skala: setengah lebar = 100%
      const neuLeft = 50 - half / 2, negLeft = neuLeft - pg / 2;
      const active = S.filters.classes.size === 1 && S.filters.classes.has(r.ds.id);
      return `<button class="dbar ${active ? 'is-active' : ''}" data-class="${r.ds.id}" aria-label="${esc(r.ds.name)}: ${fmt(pp)}% positif, ${fmt(pn)}% netral, ${fmt(pg)}% negatif">
        <span class="dbar__name"><span>${esc(r.ds.name)}</span><small>${r.n} komentar</small></span>
        <span class="dbar__track">
          ${pg ? `<span class="dbar__seg dbar__seg--neg" style="left:${negLeft}%;width:${pg / 2}%">${lbl(pg, 12)}</span>` : ''}
          ${pn ? `<span class="dbar__seg dbar__seg--neu" style="left:${neuLeft}%;width:${half}%;${pg ? '' : 'border-radius:6px 0 0 6px;'}">${lbl(pn, 14)}</span>` : ''}
          ${pp ? `<span class="dbar__seg dbar__seg--pos" style="left:${50 + half / 2}%;width:${pp / 2}%">${lbl(pp, 10)}</span>` : ''}
        </span>
        <span class="dbar__idx">${signed(r.nss, 0)}<small>NSS</small></span>
      </button>`;
    }).join('') + `
      <div class="dbar-axis" aria-hidden="true"><span></span><div><span>100%</span><span>50%</span><span>0</span><span>50%</span><span>100%</span></div><span></span></div>
      <div class="dbar-legend"><span><span class="dot dot--neg"></span>Negatif</span><span><span class="dot dot--neu"></span>Netral (dibagi dua di tengah)</span><span><span class="dot dot--pos"></span>Positif</span></div>`;
  }

  function renderScatter(docs) {
    const surface = cssVar('--surface');
    makeChart('scatterChart', {
      type: 'scatter',
      data: {
        datasets: SENTS.map(l => ({
          label: SENT_LABEL[l],
          data: docs.filter(d => labelOf(d) === l).map(d => ({ x: Math.max(1, d.a.words), y: effScore(d), id: d.id, text: d.text })),
          backgroundColor: color(sentColor(l), 0.85), borderColor: surface, borderWidth: 2,
          pointRadius: 7, pointHoverRadius: 9, pointHitRadius: 10, pointStyle: ['circle', 'rectRounded', 'triangle'][SENTS.indexOf(l)]
        }))
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { type: 'logarithmic', title: { display: true, text: 'Jumlah kata (skala log)' }, grid: { color: cssVar('--line') }, border: { display: false },
            ticks: { callback: v => ([1, 2, 5, 10, 20, 50, 100, 200].includes(v) ? v : '') } },
          y: { min: -1.1, max: 1.1, title: { display: true, text: 'Skor sentimen' }, grid: { color: ctx => (ctx.tick.value === 0 ? cssVar('--line-strong') : cssVar('--line')) }, border: { display: false },
            afterBuildTicks: ax => { ax.ticks = [-1, -0.5, 0, 0.5, 1].map(v => ({ value: v })); },
            ticks: { callback: v => signed(v, 1) } }
        },
        plugins: {
          legend: { position: 'bottom', align: 'start' },
          tooltip: { callbacks: {
            title: items => wrap(items[0].raw.text, 56).slice(0, 4),
            label: ctx => ` ${ctx.dataset.label} · skor ${signed(ctx.raw.y)} · ${ctx.raw.x} kata`
          } }
        },
        onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
        onClick: (e, el) => { if (el.length) openDoc(el[0].element.$context.raw.id); }
      }
    });
  }
  function wrap(s, n) {
    const words = s.split(/\s+/), lines = []; let cur = '';
    words.forEach(w => { if ((cur + ' ' + w).trim().length > n) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; });
    if (cur.trim()) lines.push(cur.trim());
    if (lines.length > 4) lines[3] += '…';
    return lines;
  }

  function renderQuotes(docs) {
    const rank = d => Math.abs(effScore(d)) * Math.log2(d.a.words + 1);
    const pos = docs.filter(d => labelOf(d) === 'positive').sort((a, b) => rank(b) - rank(a));
    const neg = docs.filter(d => labelOf(d) !== 'positive').sort((a, b) => effScore(a) - effScore(b) || b.a.words - a.a.words);
    const pick = [...pos.slice(0, neg.length ? 2 : 3), ...neg.slice(0, 1)].slice(0, 3);
    $('#quotes').innerHTML = pick.length ? pick.map(d => `
      <figure class="quote" data-open="${d.id}" tabindex="0" role="button" aria-label="Buka komentar di penjelajah">
        <i data-lucide="quote" class="quote__mark"></i>
        <blockquote>${esc(truncate(d.text, 260))}</blockquote>
        <footer><span>${esc(truncate(d.dsName, 40))}</span>${labelChip(d, false)}</footer>
      </figure>`).join('') : '<div class="none">Belum ada kutipan.</div>';
  }

  function labelChip(d, interactive = true) {
    const l = labelOf(d);
    const manual = !!S.overrides[d.key];
    const icon = l === 'positive' ? 'thumbs-up' : l === 'negative' ? 'thumbs-down' : l === 'empty' ? 'circle-dashed' : 'minus';
    const tag = interactive ? 'button' : 'span';
    return `<${tag} class="label-btn" data-label="${l}" ${interactive ? `data-relabel="${d.id}" aria-haspopup="menu" aria-label="Label ${SENT_LABEL[l]}${manual ? ' (manual)' : ''}. Klik untuk mengoreksi."` : ''}>
      ${manual ? '<span class="manual" title="Dikoreksi manual"></span>' : ''}${SENT_LABEL[l]}${interactive && l !== 'empty' ? '<i data-lucide="chevron-down"></i>' : ''}</${tag}>`;
  }

  /* ====================================================================
     Tab: Kata & Frasa
     ==================================================================== */
  function renderWords() {
    saveUI();
    const docs = filtered({ skip: ['term'] });
    const terms = NLP.ngrams(docs, S.cloud.n, S.stop);
    renderCloud(terms);
    $('#cloudLegend').hidden = S.cloud.color !== 'sent';
    $('#cloudSub').textContent = S.cloud.color === 'sent'
      ? 'Ukuran = frekuensi. Warna = rata-rata sentimen komentar yang memuatnya. Klik kata untuk memfilter.'
      : 'Ukuran = frekuensi. Klik kata untuk memfilter. Pilih "Sentimen" untuk mewarnai kata menurut nadanya.';
    renderTermList(terms, docs);
    renderDistinct(docs);
    renderLenChart(docs);
    renderStopwords();
    $$('#gramSeg button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.n === S.cloud.n)));
    $('#maxWords').value = S.cloud.max; $('#maxWordsOut').textContent = S.cloud.max;
    $$('#colorSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.c === S.cloud.color)));
  }

  function termColor(t, mono, strong) {
    if (mono) return strong ? cssVar('--teal') : cssVar('--brand-2');
    const l = tiltLabel(t.avg);
    return l === 'positive' ? cssVar('--pos') : l === 'negative' ? cssVar('--neg') : cssVar('--muted');
  }

  let cloudToken = 0;
  // PRNG deterministik agar tata letak stabil antar-render
  const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  function renderCloud(allTerms) {
    const svg = $('#cloud');
    const wrapEl = svg.parentElement;
    const terms = allTerms.slice(0, S.cloud.max);
    $('#cloudEmpty').hidden = terms.length > 0;
    const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
    svg.innerHTML = '';
    S.cloudPlaced = [];
    if (!w || !terms.length) return;
    if (!(window.d3 && d3.layout && d3.layout.cloud)) { $('#cloudEmpty').hidden = false; $('#cloudEmpty').textContent = 'Pustaka wordcloud belum termuat. Periksa koneksi internet.'; return; }
    const token = ++cloudToken;
    const n = S.cloud.n;
    const maxC = terms[0].count, minC = terms[terms.length - 1].count;
    const maxSize = Math.min(w / (n === 1 ? 7 : n === 2 ? 12 : 17), h / 4.4);
    const minSize = w < 600 ? 11 : 13;
    const size = cnt => (maxC === minC ? (minSize + maxSize) / 2.4 : minSize + (maxSize - minSize) * Math.pow((cnt - minC) / (maxC - minC), 0.7));
    const weight = cnt => (cnt >= maxC * 0.5 ? 800 : cnt >= maxC * 0.25 ? 700 : 600);
    const mode = S.cloud.color, mono = mode === 'mono';
    const vivid = ['--v1', '--v2', '--v3', '--v4', '--v5', '--v6', '--v7', '--v8'].map(cssVar);
    const rank = new Map(terms.map((t, k) => [t.term, k]));
    const colorFor = d => (mode === 'vivid' ? vivid[rank.get(d.text) % vivid.length] : termColor(d.t, mono, d.t.count >= maxC * 0.6));
    d3.layout.cloud()
      .size([w, h])
      .words(terms.map(t => ({ text: t.term, size: size(t.count), weight: weight(t.count), t })))
      .padding(n === 1 ? 4 : 3)
      .rotate(0)
      .font('Plus Jakarta Sans')
      .fontWeight(d => d.weight)
      .fontSize(d => d.size)
      .spiral('archimedean')
      .random(seeded(42))
      .on('end', placed => {
        if (token !== cloudToken) return;
        S.cloudPlaced = placed.map(d => ({ ...d, color: colorFor(d) }));
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.innerHTML = `<g transform="translate(${w / 2},${h / 2})">${S.cloudPlaced.map((d, k) => `
          <text class="cloud-word ${S.filters.term === d.text ? 'is-active' : ''}" data-term="${esc(d.text)}" tabindex="0" role="button"
            aria-label="${esc(d.text)}: ${d.t.count} kali, skor ${signed(d.t.avg)}"
            x="${d.x.toFixed(1)}" y="${d.y.toFixed(1)}" text-anchor="middle"
            style="font-size:${d.size.toFixed(1)}px;font-weight:${d.weight};fill:${d.color};animation-delay:${Math.min(k * 12, 600)}ms">${esc(d.text)}</text>`).join('')}</g>`;
        const dropped = terms.length - placed.length;
        svg.setAttribute('aria-label', `Wordcloud: ${placed.slice(0, 10).map(d => `${d.text} (${d.t.count})`).join(', ')}${dropped > 0 ? `. ${dropped} istilah tidak muat` : ''}`);
      })
      .start();
  }

  function showCloudTip(el) {
    const tip = $('#cloudTip');
    const d = (S.cloudPlaced || []).find(x => x.text === el.dataset.term);
    if (!d) return;
    const wr = el.closest('.cloud-wrap').getBoundingClientRect(), r = el.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(d.text)}</b> <span>· ${d.t.count}× · ${d.t.docs} komentar · skor ${signed(d.t.avg)}</span>`;
    tip.style.left = (r.left - wr.left + r.width / 2) + 'px';
    tip.style.top = (r.top - wr.top) + 'px';
    tip.hidden = false;
  }

  /** Istilah teratas: batang proporsional, dipecah menurut sentimen komentar yang memuatnya. */
  function renderTermList(terms, docs) {
    const top = terms.slice(0, 15);
    $('#topTermsSub').textContent = `${top.length} ${S.cloud.n === 1 ? 'kata' : 'frasa ' + S.cloud.n + ' kata'} teratas dari ${docs.length} komentar. Batang dipecah menurut nada komentar.`;
    if (!top.length) { $('#termList').innerHTML = '<li class="none">Belum ada istilah.</li>'; return; }
    const maxC = top[0].count;
    $('#termList').innerHTML = top.map((t, i) => {
      const having = docs.filter(d => NLP.docHasTerm(d, t.term));
      const c = countLabels(having);
      const n = having.length || 1;
      const w = pct(t.count, maxC);
      const segs = SENTS.filter(l => c[l]).map(l => `<span style="width:${w * c[l] / n}%;background:var(--${l.slice(0, 3)})"></span>`).join('');
      return `<li><button data-term="${esc(t.term)}" class="${S.filters.term === t.term ? 'is-active' : ''}"
        aria-label="${esc(t.term)}: ${t.count} kali, ${c.positive} positif, ${c.neutral} netral, ${c.negative} negatif" title="${t.docs} komentar · ${c.positive} positif / ${c.neutral} netral / ${c.negative} negatif">
        <span class="termlist__rank">${i + 1}</span>
        <span class="termlist__term">${esc(t.term)}</span>
        <span class="termlist__bar">${segs}</span>
        <span class="termlist__n">${t.count}</span>
      </button></li>`;
    }).join('');
  }

  function renderDistinct(docs) {
    const posDocs = docs.filter(d => labelOf(d) === 'positive');
    const restDocs = docs.filter(d => labelOf(d) !== 'positive');
    const count = ds => { const m = new Map(); let N = 0; NLP.ngrams(ds, 1, S.stop).forEach(t => { m.set(t.term, t.count); N += t.count; }); return { m, N }; };
    const A = count(posDocs), B = count(restDocs);
    const V = new Set([...A.m.keys(), ...B.m.keys()]).size || 1;
    const lo = (X, Y) => [...X.m.entries()].map(([t, c]) => ({
      t, c, s: Math.log((c + 0.5) / (X.N + V * 0.5)) - Math.log(((Y.m.get(t) || 0) + 0.5) / (Y.N + V * 0.5))
    })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.c - a.c).slice(0, 8);
    const col = (title, dot, list, empty) => `
      <div>
        <h3><span class="dot dot--${dot}"></span>${title}</h3>
        ${list.length ? `<ol>${list.map(x => `<li><button data-term="${esc(x.t)}"><span>${esc(x.t)}</span><small>${x.c}×</small></button></li>`).join('')}</ol>` : `<p class="none">${empty}</p>`}
      </div>`;
    $('#distinct').innerHTML = col('Khas nada positif', 'pos', lo(A, B), 'Belum ada komentar positif.') +
      col('Khas nada netral & negatif', 'neg', lo(B, A), 'Belum ada komentar netral/negatif.');
  }

  function renderLenChart(docs) {
    const bins = [[1, 2, '1–2'], [3, 5, '3–5'], [6, 10, '6–10'], [11, 25, '11–25'], [26, 50, '26–50'], [51, Infinity, '51+']];
    const surface = cssVar('--surface');
    makeChart('lenChart', {
      type: 'bar',
      data: {
        labels: bins.map(b => b[2] + ' kata'),
        datasets: SENTS.map(l => ({
          label: SENT_LABEL[l],
          data: bins.map(([a, b]) => docs.filter(d => labelOf(d) === l && d.a.words >= a && d.a.words <= b).length),
          backgroundColor: sentColor(l), borderColor: surface, borderWidth: { top: 2 }, borderSkipped: false, borderRadius: 6, maxBarThickness: 48
        }))
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--line') }, border: { display: false } }
        },
        plugins: { legend: { position: 'bottom', align: 'start' } }
      }
    });
  }

  function renderStopwords() {
    $('#stopChips').innerHTML = [...S.stop].sort().map(w =>
      `<span class="chip">${esc(w)}<button data-unstop="${esc(w)}" aria-label="Hapus ${esc(w)} dari daftar abaikan"><i data-lucide="x"></i></button></span>`).join('')
      || '<span class="card__sub">Belum ada kata yang diabaikan.</span>';
  }

  function setTerm(term) {
    S.filters.term = S.filters.term === term ? null : term;
    renderAll();
    if (S.filters.term) toast(`Filter kata: “${esc(term)}”. Lihat komentarnya di tab Jelajah.`);
  }

  /* ====================================================================
     Tab: Aspek
     ==================================================================== */
  function renderAspects() {
    const docs = filtered({ skip: ['aspect'] });
    const stats = aspectStats(docs).sort((a, b) => b.n - a.n);
    const maxN = Math.max(1, ...stats.map(s => s.n));
    // Utamakan contoh kalimat yang berbeda antaraspek
    const usedEx = new Set();
    stats.forEach(a => {
      const pick = a.cands.find(c => !usedEx.has(c.id)) || a.cands[0];
      if (pick) { usedEx.add(pick.id); a.example = pick; }
    });
    $('#aspectTable tbody').innerHTML = stats.map(a => {
      const tot = a.n || 1;
      return `<tr data-aspect-row="${a.id}" class="${S.filters.aspect === a.id ? 'is-active' : ''} ${a.n ? '' : 'is-zero'}" tabindex="0">
        <td><span class="asp-name"><span class="asp-icon"><i data-lucide="${a.icon}"></i></span>${esc(a.label)}</span></td>
        <td><div class="hbar"><div class="hbar__track"><div class="hbar__fill" style="width:${pct(a.n, maxN)}%"></div></div><b>${a.n}</b></div></td>
        <td>
          <div class="mix" role="img" aria-label="${a.c.positive} positif, ${a.c.neutral} netral, ${a.c.negative} negatif">
            ${a.c.positive ? `<span style="flex:${a.c.positive};background:var(--pos)"></span>` : ''}
            ${a.c.neutral ? `<span style="flex:${a.c.neutral};background:var(--neu)"></span>` : ''}
            ${a.c.negative ? `<span style="flex:${a.c.negative};background:var(--neg)"></span>` : ''}
          </div>
          <div class="mix-label"><span>+${a.c.positive}</span><span>○${a.c.neutral}</span><span>−${a.c.negative}</span></div>
        </td>
        <td class="num"><span class="net ${a.net >= NLP.THRESH ? 'net--pos' : a.net <= -NLP.THRESH ? 'net--neg' : ''}">${a.n ? signed(a.net) : '–'}</span></td>
        <td class="hide-md"><div class="example" title="${esc(a.example?.text || '')}">${a.example ? '“' + esc(a.example.text) + '”' : '<span style="color:var(--muted)">Belum disebut</span>'}</div></td>
      </tr>`;
      void tot;
    }).join('');

    renderAspectMatrix(stats.filter(x => x.n), docs.length);

    // Heatmap aspek × kelas
    const dss = selectedDatasets();
    const rows = stats.filter(s => s.n);
    if (!rows.length) { $('#aspectHeat').innerHTML = '<tr><td class="none">Belum ada aspek terdeteksi.</td></tr>'; return; }
    const head = `<thead><tr><th scope="col"></th>${dss.map(ds => `<th scope="col" title="${esc(ds.name)}">${esc(truncate(ds.name, 26))}</th>`).join('')}</tr></thead>`;
    const body = rows.map(a => `<tr><td class="rowlabel">${esc(a.label)}</td>${dss.map(ds => {
      const rs = a.rows.filter(r => r.d.datasetId === ds.id);
      if (!rs.length) return '<td><span class="cell" style="color:var(--muted)">·</span></td>';
      const net = rs.reduce((s, r) => s + r.s, 0) / rs.length;
      const strength = Math.round(Math.min(1, Math.abs(net)) * 60 + 12);
      const tone = net >= NLP.THRESH ? 'var(--pos)' : net <= -NLP.THRESH ? 'var(--neg)' : 'var(--neu)';
      return `<td><span class="cell" style="background:color-mix(in oklab, ${tone} ${strength}%, var(--surface))" title="${rs.length} sebutan · skor ${signed(net)}">${rs.length}</span></td>`;
    }).join('')}</tr>`).join('');
    $('#aspectHeat').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  /** Matriks prioritas: x = % komentar yang membahas, y = skor bersih, ukuran = jumlah sebutan. */
  function renderAspectMatrix(rows, totalDocs) {
    const maxShare = Math.max(10, ...rows.map(a => pct(a.n, totalDocs)));
    const xMax = Math.min(100, Math.ceil((maxShare * 1.2) / 10) * 10);
    const midX = xMax / 2;
    const labelPlugin = {
      id: 'bubbleLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: ca, scales } = chart;
        ctx.save();
        ctx.strokeStyle = cssVar('--line-strong'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        const x0 = scales.x.getPixelForValue(midX), y0 = scales.y.getPixelForValue(0.3);
        ctx.beginPath(); ctx.moveTo(x0, ca.top); ctx.lineTo(x0, ca.bottom); ctx.moveTo(ca.left, y0); ctx.lineTo(ca.right, y0); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = cssVar('--muted');
        const quadBoxes = [];
        const quad = (txt, right, top) => {
          const w = ctx.measureText(txt).width, x = right ? ca.right - 8 - w : ca.left + 8, y = top ? ca.top + 6 : ca.bottom - 18;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(txt, x, y);
          quadBoxes.push({ x, y, w, h: 12 });
        };
        quad('KEKUATAN UTAMA', true, true); quad('PRIORITAS PERBAIKAN', true, false);
        quad('POTENSI', false, true); quad('PANTAU', false, false);
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif'; ctx.fillStyle = cssVar('--ink');
        const boxes = quadBoxes.slice();
        const hit = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
        const pts = chart.getDatasetMeta(0).data.map((el, k) => ({ el, a: rows[k], r: el.options.radius || 8 }));
        pts.forEach(p => boxes.push({ x: p.el.x - p.r - 4, y: p.el.y - p.r - 4, w: p.r * 2 + 8, h: p.r * 2 + 8 }));
        pts.sort((p, q) => q.a.n - p.a.n).forEach(({ el, a, r }) => {
          const tw = ctx.measureText(a.label).width, th = 14;
          const opts = [
            [el.x + r + 6, el.y - th / 2], [el.x - r - 6 - tw, el.y - th / 2],
            [el.x - tw / 2, el.y - r - 4 - th], [el.x - tw / 2, el.y + r + 4],
            [el.x + r + 6, el.y - th / 2 - 15], [el.x + r + 6, el.y - th / 2 + 15],
            [el.x - r - 6 - tw, el.y - th / 2 - 15], [el.x - r - 6 - tw, el.y - th / 2 + 15],
            [el.x + r + 6, el.y - th / 2 + 30], [el.x + r + 6, el.y - th / 2 - 30]
          ];
          let pos = opts.find(([x, y]) => x >= ca.left && x + tw <= ca.right && y >= ca.top && y + th <= ca.bottom && !hit({ x, y, w: tw, h: th }));
          if (!pos) pos = opts[0];
          const [x, y] = pos;
          boxes.push({ x, y, w: tw, h: th });
          if (Math.abs(y + th / 2 - el.y) > r) {
            ctx.strokeStyle = cssVar('--line-strong'); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(el.x, el.y); ctx.lineTo(x < el.x ? x + tw : x, y + th / 2); ctx.stroke();
          }
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(a.label, x, y + 1);
        });
        ctx.restore();
      }
    };
    makeChart('aspectChart', {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Aspek',
          data: rows.map(a => ({ x: pct(a.n, totalDocs), y: +a.net.toFixed(3), r: 7 + Math.sqrt(a.n) * 3.2 })),
          backgroundColor: rows.map(a => color(sentColor(tiltLabel(a.net)), 0.28)),
          borderColor: rows.map(a => sentColor(tiltLabel(a.net))), borderWidth: 2,
          hoverBackgroundColor: rows.map(a => color(sentColor(tiltLabel(a.net)), 0.5)), hoverBorderWidth: 2.5
        }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 4, right: 4 } },
        scales: {
          x: { min: 0, max: xMax, title: { display: true, text: '% komentar yang membahas' }, grid: { color: cssVar('--line') }, border: { display: false }, ticks: { callback: v => v + '%' } },
          y: { min: -1.1, max: 1.3, title: { display: true, text: 'Skor bersih' }, grid: { color: cssVar('--line') }, border: { display: false },
            afterBuildTicks: ax => { ax.ticks = [-1, -0.5, 0, 0.5, 1].map(v => ({ value: v })); }, ticks: { callback: v => signed(v, 1) } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => rows[items[0].dataIndex].label,
            label: ctx => { const a = rows[ctx.dataIndex]; return ` ${a.n} sebutan (${fmt(ctx.raw.x)}% komentar) · skor ${signed(a.net)}`; }
          } }
        },
        onHover: (e, el) => { e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
        onClick: (e, el) => { if (el.length) toggleAspect(rows[el[0].index].id); }
      },
      plugins: [labelPlugin]
    });
  }

  /** Warna hex → rgba dengan alfa. */
  function color(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function toggleAspect(id) {
    S.filters.aspect = S.filters.aspect === id ? 'all' : id;
    renderAll();
  }

  /* ====================================================================
     Tab: Skor & Rating
     ==================================================================== */
  function renderScores() {
    saveUI();
    const dss = selectedDatasets();
    const base = filtered({ skip: ['sent', 'classes'] });

    // Tabel perbandingan kelas
    const head = `<thead><tr><th scope="col">Kelas</th><th scope="col" class="num">Respons</th><th scope="col" class="num">Pengalaman</th><th scope="col" class="num">Layanan</th><th scope="col" class="num">Instruktur</th><th scope="col" class="num">Rekomendasi</th><th scope="col" class="num">Total</th><th scope="col" class="num">% positif</th><th scope="col" class="num" title="Net Sentiment Score: % positif − % negatif">NSS teks</th></tr></thead>`;
    const score = v => (v == null ? '<span class="score-chip">–</span>' : `<span class="score-chip score-chip--${v >= 4.5 ? 'hi' : v >= 3.5 ? 'mid' : 'lo'}">${fmt(v, 2)}</span>`);
    const pbar = v => `<span class="pctbar"><i style="--w:${Math.max(0, Math.min(100, v))}%"></i>${fmt(v)}%</span>`;
    const body = dss.map(ds => {
      const r = ds.ratings || {};
      const docs = base.filter(d => d.datasetId === ds.id);
      const c = countLabels(docs);
      return `<tr>
        <td class="name">${esc(ds.name)}<small>${esc(ds.date || ds.source)}</small></td>
        <td class="num">${ds.respondents ?? '–'}${ds.participants ? `/${ds.participants}` : ''}</td>
        <td class="num">${score(r.overall)}</td>
        <td class="num">${score(r.serviceTotal)}</td>
        <td class="num">${score(r.instructorAvg)}</td>
        <td class="num">${r.recommend == null ? '–' : pbar(r.recommend)}</td>
        <td class="num">${score(r.total)}</td>
        <td class="num">${docs.length ? pbar(pct(c.positive, docs.length)) : '–'}</td>
        <td class="num"><b>${docs.length ? signed(nssOf(c), 0) : '–'}</b></td>
      </tr>`;
    }).join('');
    $('#classTable').innerHTML = head + '<tbody>' + body + '</tbody>';

    // Rating layanan (gabungan)
    const labels = [...new Set(dss.flatMap(ds => (ds.ratings?.services || []).map(s => s.label)))];
    const overall = weightedAvg(dss.map(d => ({ v: d.ratings?.overall, w: d.respondents || 1 })));
    const barRows = [];
    if (overall != null) barRows.push({ label: 'Pengalaman pelatihan secara umum', v: overall, per: dss.map(d => ({ n: d.name, v: d.ratings?.overall })) });
    labels.forEach(lb => {
      const per = dss.map(d => ({ n: d.name, v: (d.ratings?.services || []).find(s => s.label === lb)?.score, w: d.respondents || 1 }));
      barRows.push({ label: lb, v: weightedAvg(per), per });
    });
    $('#serviceBars').innerHTML = barRows.length ? barRows.map(r => `
      <div class="bar-row">
        <div class="bar-row__head"><span>${esc(r.label)}</span><b>${fmt(r.v, 2)}</b></div>
        <div class="bar-track" role="img" aria-label="${esc(r.label)}: ${fmt(r.v, 2)} dari 5"><div class="bar-fill" style="width:${pct(r.v, 5)}%"></div></div>
        ${dss.length > 1 ? `<div class="bar-sub">${r.per.filter(p => p.v != null).map(p => `<span>${esc(truncate(p.n, 22))} <b>${fmt(p.v, 1)}</b></span>`).join('')}</div>` : ''}
      </div>`).join('') : '<p class="none">Sumber data ini tidak memuat rating layanan.</p>';

    // Instruktur
    const inst = new Map();
    const aspectsSet = [];
    dss.forEach(ds => (ds.ratings?.instructors || []).forEach(i => {
      if (!aspectsSet.includes(i.aspect)) aspectsSet.push(i.aspect);
      if (!inst.has(i.name)) inst.set(i.name, { name: i.name, cells: {}, classes: new Set() });
      const e = inst.get(i.name);
      e.classes.add(ds.id);
      (e.cells[i.aspect] = e.cells[i.aspect] || []).push({ v: i.score, w: ds.respondents || 1 });
    }));
    renderInstructors(inst, aspectsSet, dss);

    // Keselarasan: satu baris per kelas, titik-titik di satu skala 0-100 (makin rapat makin selaras)
    const AL_KEYS = [['r', 'Rating'], ['k', 'Rekomendasi'], ['p', '% positif'], ['n', 'NSS']];
    const rowsA = dss.map(ds => {
      const r = ds.ratings || {};
      const docs = base.filter(d => d.datasetId === ds.id);
      const c = countLabels(docs);
      const rating = r.total ?? r.overall;
      const nss = docs.length ? nssOf(c) : null;
      const pts = [
        ['r', rating == null ? null : pct(rating, 5), rating == null ? '–' : fmt(rating, 2)],
        ['k', r.recommend ?? null, r.recommend == null ? '–' : fmt(r.recommend) + '%'],
        ['p', docs.length ? pct(c.positive, docs.length) : null, docs.length ? fmt(pct(c.positive, docs.length)) + '%' : '–'],
        ['n', nss == null ? null : (nss + 100) / 2, nss == null ? '–' : signed(nss, 0)]
      ];
      const ok = pts.map(x => x[1]).filter(v => v != null);
      const lo = ok.length ? Math.min(...ok) : 0, hi = ok.length ? Math.max(...ok) : 0, spread = Math.round(hi - lo);
      const st = ok.length < 2 ? ['na', 'circle-help', 'Data belum cukup']
        : spread <= 15 ? ['ok', 'check', 'Selaras']
        : r.recommend != null && rating != null && r.recommend < pct(rating, 5) - 15 ? ['warn', 'alert-triangle', 'Rekomendasi tertinggal']
        : ['warn', 'alert-triangle', 'Nada komentar berbeda'];
      const tip = st[0] === 'ok' ? 'Angka rating dan isi komentar bercerita sama.' : st[0] === 'na' ? 'Data belum cukup untuk dibandingkan.'
        : st[2] === 'Rekomendasi tertinggal' ? 'Rating tinggi, tapi niat merekomendasikan lebih rendah. Gali alasannya.' : 'Ada selisih antara rating dan nada komentar. Baca komentar netral/negatif.';
      const d0 = Math.max(0, Math.min(50, Math.floor((lo - 8) / 10) * 10));
      const cl = v => (Math.max(d0, Math.min(100, v)) - d0) / (100 - d0) * 100;
      return { st, spread, html: `<li class="alr alr--${st[0]}" title="${esc(tip)}">
        <span class="alr__ic"><i data-lucide="${st[1]}"></i></span>
        <div class="alr__main">
          <div class="alr__head"><b class="alr__name">${esc(ds.name)}</b><span class="alr__gap">${ok.length > 1 ? `selisih <b>${spread}</b>` : '–'}</span></div>
          <div class="alr__stats">${pts.map(([k, , t]) => `<span class="alr__stat alr__stat--${k}"><i></i>${t}</span>`).join('')}</div>
          <div class="alr__track" role="img" aria-label="${esc(st[2])}, selisih ${spread} poin">${ok.length > 1 ? `<span class="alr__band" style="left:${cl(lo)}%;width:${Math.max(cl(hi) - cl(lo), 1)}%"></span>` : ''}${pts.filter(x => x[1] != null).map(([k, v]) => `<span class="alr__dot alr__dot--${k}" style="left:${cl(v)}%"></span>`).join('')}<span class="alr__ax alr__ax--l">${d0}</span><span class="alr__ax alr__ax--r">100</span></div>
        </div>
      </li>` };
    });
    const nOk = rowsA.filter(x => x.st[0] === 'ok').length, nWarn = rowsA.filter(x => x.st[0] === 'warn').length;
    rowsA.sort((x, y) => (y.st[0] === 'warn') - (x.st[0] === 'warn') || y.spread - x.spread);
    $('#alignment').innerHTML = `
      <div class="al__top">
        <div class="al__sum"><span class="al__pill al__pill--ok"><i data-lucide="check"></i>${nOk} selaras</span><span class="al__pill al__pill--warn"><i data-lucide="alert-triangle"></i>${nWarn} perlu dicek</span></div>
        <div class="al__legend">${AL_KEYS.map(([k, l]) => `<span><i class="alr__dot alr__dot--${k}"></i>${l}</span>`).join('')}</div>
      </div>
      <ul class="al__list">${rowsA.map(x => x.html).join('')}</ul>
      <p class="al__foot">Keempat ukuran disetarakan ke skala 0-100. Makin rapat titiknya, makin selaras rating dan isi komentar.</p>`;
  }

  /* ---------- Instruktur: leaderboard, kartu pemain, arena ---------- */
  const ATTR_CODE = { 'Pengalaman dipandu': 'PGL', 'Penjelasan': 'PJL', 'Interaksi': 'INT', 'Penguasaan materi': 'MTR' };
  const attrCode = a => ATTR_CODE[a] || a.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const to99 = v => Math.max(1, Math.min(99, Math.round(((v - 1) / 4) * 99)));
  const tierOf = o => (o >= 95 ? 'icon' : o >= 85 ? 'gold' : o >= 70 ? 'silver' : 'bronze');
  const initials = n => n.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1).map(w => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
  const shortName = n => { const w = n.split(/\s+/).filter(Boolean); return (w.length > 2 ? `${w[0]} ${w.slice(1, -1).map(x => x[0] + '.').join(' ')} ${w[w.length - 1]}` : n).toUpperCase(); };
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ARENA = ['#7EA6FF', '#2FCFC2', '#F2B64A'];
  const SMALL_SAMPLE = 10;

  function instructorProfiles(inst, aspectsSet, dss) {
    const docs = S.docs.filter(d => !d.a.empty && (!S.filters.classes.size || S.filters.classes.has(d.datasetId)));
    return [...inst.values()].map(e => {
      const r = T.findInstructor ? T.findInstructor(e.name) : null;
      const displayName = r ? r.name : e.name;
      const stats = aspectsSet.map(a => ({ a, code: attrCode(a), v: e.cells[a] ? weightedAvg(e.cells[a]) : null }));
      const avg = weightedAvg(stats.filter(x => x.v != null).map(x => ({ v: x.v })));
      const resp = dss.filter(ds => e.classes.has(ds.id)).reduce((t, ds) => t + (ds.respondents || 0), 0);
      // Sebutan di komentar: nama depan + panggilan dari daftar instruktur
      const keys = [...new Set([...(r ? r.nicks : []), e.name.split(/\s+/)[0].toLowerCase()])].filter(k => k.length >= 3);
      const re = keys.length ? new RegExp('\\b(' + keys.map(reEsc).join('|') + ')\\b', 'i') : null;
      const ment = re ? docs.filter(d => re.test(d.text)) : [];
      return {
        ...e, roster: r, code: r ? r.code : 'INS', displayName, photo: T.instructorPhoto ? T.instructorPhoto(r) : null,
        stats, avg, ovr: to99(avg), resp, ment: ment.length, mentPos: ment.filter(d => labelOf(d) === 'positive').length
      };
    });
  }

  /** Urutkan & beri peringkat (nilai sama = peringkat sama). */
  function rankList(list, key) {
    const val = e => (key === 'ovr' ? e.avg : key === 'resp' ? e.resp : key === 'ment' ? e.ment : (e.stats.find(x => x.code === key)?.v ?? -1));
    const out = list.slice().sort((a, b) => val(b) - val(a) || b.resp - a.resp || a.displayName.localeCompare(b.displayName));
    let prev = null, rank = 0;
    out.forEach((e, i) => { const v = Math.round(val(e) * 1000); if (v !== prev) { rank = i + 1; prev = v; } e.rank = rank; });
    return out;
  }

  // ---- Carousel kartu: geser dengan drag (mouse), swipe (sentuh), panah & keyboard ----
  function updateCardNav() {
    const w = $('#pcardsWrap'), c = $('#pcarousel'); if (!w || !c) return;
    const max = w.scrollWidth - w.clientWidth;
    c.classList.toggle('is-scrollable', max > 4);
    c.classList.toggle('can-l', w.scrollLeft > 4);
    c.classList.toggle('can-r', w.scrollLeft < max - 4);
    const bar = $('#pBar');
    if (bar && max > 4) { const vis = w.clientWidth / w.scrollWidth; bar.style.width = (vis * 100) + '%'; bar.style.transform = `translateX(${(w.scrollLeft / max) * (1 / vis - 1) * 100}%)`; }
  }
  function initCardDrag() {
    const w = $('#pcardsWrap'); if (!w) return;
    let down = false, moved = false, startX = 0, startL = 0, lastX = 0, lastT = 0, vel = 0, raf = 0;
    const stopGlide = () => cancelAnimationFrame(raf);
    const glide = () => {
      vel *= 0.94; if (Math.abs(vel) < 0.3) { w.classList.remove('is-dragging'); return; }
      w.scrollLeft -= vel; raf = requestAnimationFrame(glide);
    };
    w.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      stopGlide(); down = true; moved = false;
      startX = lastX = e.clientX; startL = w.scrollLeft; lastT = performance.now(); vel = 0;
    });
    window.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) { moved = true; w.classList.add('is-dragging'); w.setPointerCapture?.(e.pointerId); }
      if (!moved) return;
      const now = performance.now();
      vel = (e.clientX - lastX) / Math.max(now - lastT, 1) * 16; lastX = e.clientX; lastT = now;
      w.scrollLeft = startL - dx;
    });
    const end = () => {
      if (!down) return; down = false;
      if (moved) raf = requestAnimationFrame(glide); else w.classList.remove('is-dragging');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // klik setelah drag jangan dianggap klik
    w.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    w.addEventListener('dragstart', e => e.preventDefault());
    w.addEventListener('scroll', () => requestAnimationFrame(updateCardNav), { passive: true });
    window.addEventListener('resize', updateCardNav);
    const step = dir => { stopGlide(); const card = w.querySelector('.pcard'); const d = card ? card.offsetWidth + 26 : 300; w.scrollBy({ left: dir * d * Math.max(1, Math.floor(w.clientWidth / d) - 1 || 1), behavior: 'smooth' }); };
    $('#pPrev').addEventListener('click', () => step(-1));
    $('#pNext').addEventListener('click', () => step(1));
    w.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
  }

  const avatar = (e, cls) => `<span class="${cls}">${e.photo ? `<img src="${esc(e.photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}<span class="av-initials">${esc(initials(e.displayName))}</span></span>`;

  function renderInstructors(inst, aspectsSet, dss) {
    const list = instructorProfiles(inst, aspectsSet, dss);
    const arena = $('#arena');
    const missing = (T.ROSTER || []).filter(r => !list.some(e => e.roster === r));
    if (!list.length) {
      $('#pcards').innerHTML = '<p class="none">Sumber data ini tidak memuat rating instruktur.</p>';
      $('#podium').innerHTML = ''; $('#leaderboard').innerHTML = '<li class="none">Belum ada rating instruktur pada data yang dimuat.</li>';
      $('#lbSort').innerHTML = ''; $('#lbMissing').hidden = true;
      arena.hidden = true;
      if (S.charts.radarChart) { S.charts.radarChart.destroy(); delete S.charts.radarChart; }
      return;
    }
    arena.hidden = false;

    // ---- Leaderboard ----
    const sorts = [['ovr', 'OVR'], ...aspectsSet.map(a => [attrCode(a), attrCode(a)]), ['resp', 'Responden'], ['ment', 'Disebut']];
    if (!sorts.some(([k]) => k === S.lbSort)) S.lbSort = 'ovr';
    const sortLabel = { ovr: 'overall', resp: 'jumlah responden', ment: 'sebutan di komentar' }[S.lbSort] || (aspectsSet.find(a => attrCode(a) === S.lbSort) || S.lbSort).toLowerCase();
    $('#lbSort').innerHTML = sorts.map(([k, l]) => `<button role="radio" data-lb="${k}" aria-checked="${S.lbSort === k}">${l}</button>`).join('');
    const ranked = rankList(list, S.lbSort);
    const keyVal = e => {
      if (S.lbSort === 'ovr') return [e.ovr, 'OVR'];
      if (S.lbSort === 'resp') return [fmt(e.resp), 'responden'];
      if (S.lbSort === 'ment') return [e.ment + '×', 'disebut'];
      const st = e.stats.find(x => x.code === S.lbSort);
      return [st && st.v != null ? to99(st.v) : '–', S.lbSort];
    };
    $('#lbSub').textContent = `${list.length} instruktur dengan rating, diurutkan menurut ${sortLabel}. Klik untuk membandingkan di arena.`;

    const top = ranked.slice(0, 3);
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
    $('#podium').innerHTML = order.map(e => {
      const place = top.indexOf(e) + 1;
      const [v, lbl] = keyVal(e);
      return `<button class="podium__slot podium__slot--${place}" data-pick="${esc(e.name)}" aria-label="Peringkat ${e.rank}: ${esc(e.displayName)}, ${v} ${lbl}">
        <span class="podium__crown" aria-hidden="true">${place === 1 ? '<i data-lucide="crown"></i>' : ''}</span>
        ${avatar(e, 'podium__av')}
        <span class="podium__medal">${e.rank}</span>
        <b class="podium__name">${esc(shortName(e.displayName))}</b>
        <span class="podium__code">${esc(e.code)}</span>
        <span class="podium__block"><b>${v}</b><small>${esc(lbl)}</small></span>
      </button>`;
    }).join('');

    $('#leaderboard').innerHTML = ranked.map(e => {
      const picked = (S.h2h || []).includes(e.name);
      return `<li><button class="lb__row ${picked ? 'is-picked' : ''} lb__row--r${Math.min(e.rank, 4)}" data-pick="${esc(e.name)}" aria-label="Peringkat ${e.rank}: ${esc(e.displayName)}. Klik untuk membandingkan.">
        <span class="lb__rank">${e.rank}</span>
        ${avatar(e, 'lb__av')}
        <span class="lb__who">
          <b>${esc(e.displayName)}</b>
          <small><span class="lb__code">${esc(e.code)}</span>${e.classes.size} kelas · ${fmt(e.resp)} responden${e.resp < SMALL_SAMPLE ? ' · <em title="Kurang dari 10 responden: skor bisa berubah banyak dengan data baru">sampel kecil</em>' : ''}</small>
          <span class="lb__bar"><i style="width:${e.ovr}%"></i></span>
        </span>
        <span class="lb__attrs">${e.stats.map(x => `<span class="${S.lbSort === x.code ? 'is-key' : ''}" title="${esc(x.a)}: ${x.v == null ? '–' : fmt(x.v, 2) + ' / 5'}"><b>${x.v == null ? '–' : to99(x.v)}</b><small>${x.code}</small></span>`).join('')}</span>
        <span class="lb__ovr ${S.lbSort === 'ovr' ? 'is-key' : ''}"><b>${e.ovr}</b><small>OVR</small></span>
      </button></li>`;
    }).join('');
    const miss = $('#lbMissing');
    miss.hidden = !missing.length;
    miss.innerHTML = missing.length ? `<i data-lucide="user-round-x"></i><span><b>${missing.length} instruktur</b> belum punya rating di data yang dimuat: ${missing.map(r => `<span class="lb__chip" title="${esc(r.name)}">${esc(r.code)}</span>`).join('')}</span>` : '';

    // ---- Kartu pemain (urut overall) ----
    const byOvr = rankList(list, 'ovr');
    $('#pcards').innerHTML = byOvr.map(e => `
      <article class="pcard pcard--${tierOf(e.ovr)}" tabindex="0"
        aria-label="${esc(e.displayName)} (${esc(e.code)}): overall ${e.ovr}, ${e.stats.map(x => `${x.a} ${x.v == null ? 'tidak ada' : to99(x.v)}`).join(', ')}">
        <div class="pcard__inner">
          ${byOvr.length > 1 ? `<span class="pcard__rank">#${e.rank}</span>` : ''}
          <div class="pcard__head">
            <div class="pcard__ovr"><b>${e.ovr}</b><span>${esc(e.code)}</span></div>
            ${avatar(e, 'pcard__photo')}
          </div>
          <h3 class="pcard__name">${esc(shortName(e.displayName))}</h3>
          <div class="pcard__stats">${e.stats.map(x => `<div title="${esc(x.a)}: ${x.v == null ? '–' : fmt(x.v, 2) + ' / 5'}"><b>${x.v == null ? '–' : to99(x.v)}</b><span>${x.code}</span></div>`).join('')}</div>
          <div class="pcard__foot">
            <span><i data-lucide="graduation-cap"></i>${e.classes.size} kelas</span>
            <span><i data-lucide="users"></i>${fmt(e.resp)}</span>
            <span title="Disebut di komentar peserta"><i data-lucide="message-circle"></i>${e.ment}×</span>
          </div>
        </div>
      </article>`).join('');

    requestAnimationFrame(updateCardNav);

    // ---- Arena head-to-head ----
    const names = byOvr.map(e => e.name);
    S.h2h = (S.h2h || []).filter(n => names.includes(n));
    for (const n of names) { if (S.h2h.length >= Math.min(2, names.length)) break; if (!S.h2h.includes(n)) S.h2h.push(n); }
    const pair = S.h2h.map(n => list.find(e => e.name === n));
    const [A, B] = pair;
    const sel = (idx, cur) => `<label class="h2h__pick h2h__pick--${idx ? 'b' : 'a'}"><span class="sr-only">Instruktur ${idx ? 'kanan' : 'kiri'}</span>
      <select data-h2h="${idx}">${byOvr.map(e => `<option value="${esc(e.name)}" ${e.name === cur ? 'selected' : ''}>${esc(e.code)} · ${esc(e.displayName)}</option>`).join('')}</select></label>`;
    const rows = [
      ...aspectsSet.map(a => ({ label: a, code: attrCode(a), a: A.stats.find(x => x.a === a)?.v, b: B ? B.stats.find(x => x.a === a)?.v : null, kind: 'rating' })),
      { label: 'Overall', code: 'OVR', a: A.avg, b: B ? B.avg : null, kind: 'rating' },
      { label: 'Kelas diampu', code: 'KLS', a: A.classes.size, b: B ? B.classes.size : null, kind: 'count' },
      { label: 'Disebut di komentar', code: 'SBT', a: A.ment, b: B ? B.ment : null, kind: 'count' }
    ];
    const maxCount = k => Math.max(1, ...rows.filter(r => r.code === k).flatMap(r => [r.a || 0, r.b || 0]));
    const width = (r, v) => (v == null ? 0 : r.kind === 'rating' ? to99(v) : (v / maxCount(r.code)) * 100);
    const show = (r, v) => (v == null ? '–' : r.kind === 'rating' ? `<b>${to99(v)}</b><small>${fmt(v, 2)}</small>` : `<b>${v}</b>`);
    const win = (x, y) => x != null && y != null && x > y + 1e-9;
    $('#h2h').innerHTML = `
      <div class="h2h__top">
        ${sel(0, A.name)}
        ${B ? sel(1, B.name) : '<span></span>'}
      </div>
      <div class="h2h__faces">
        <span class="h2h__face h2h__face--a">${avatar(A, 'h2h__av')}</span>
        <span class="h2h__vs">${B ? 'VS' : 'PROFIL'}</span>
        ${B ? `<span class="h2h__face h2h__face--b">${avatar(B, 'h2h__av')}</span>` : ''}
      </div>
      <div class="h2h__rows">${rows.map(r => `
        <div class="h2h__row">
          <span class="h2h__val h2h__val--a ${win(r.a, r.b) ? 'is-win' : ''}">${show(r, r.a)}</span>
          <span class="h2h__bar h2h__bar--a"><i style="width:${width(r, r.a)}%"></i></span>
          <span class="h2h__label"><b>${r.code}</b><small>${esc(r.label)}</small></span>
          <span class="h2h__bar h2h__bar--b"><i style="width:${B ? width(r, r.b) : 0}%"></i></span>
          <span class="h2h__val h2h__val--b ${win(r.b, r.a) ? 'is-win' : ''}">${B ? show(r, r.b) : ''}</span>
        </div>`).join('')}
      </div>
      <p class="h2h__note">Skala 0–99 = (rating − 1) ÷ 4 × 99. Angka kecil = rating asli 1–5.${B ? ' Nilai lebih tinggi disorot.' : ''}</p>`;
    renderRadar(pair.filter(Boolean), aspectsSet);
  }

  /** Radar atribut di arena (tema gelap ala game). */
  function renderRadar(list, aspectsSet) {
    if (aspectsSet.length < 3) { if (S.charts.radarChart) { S.charts.radarChart.destroy(); delete S.charts.radarChart; } return; }
    const vals = list.flatMap(e => e.stats.map(s => s.v)).filter(v => v != null);
    const min = Math.max(1, Math.floor((Math.min(...vals) - 0.3) * 2) / 2);
    makeChart('radarChart', {
      type: 'radar',
      data: {
        labels: aspectsSet.map(attrCode),
        datasets: list.map((e, k) => ({
          label: `${e.code} · ${e.displayName}`,
          data: aspectsSet.map(a => { const v = e.stats.find(s => s.a === a)?.v; return v == null ? null : +v.toFixed(2); }),
          borderColor: ARENA[k], backgroundColor: color(ARENA[k], 0.18), borderWidth: 2.5,
          pointBackgroundColor: ARENA[k], pointBorderColor: '#0A1A3D', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7,
          pointStyle: ['circle', 'rectRounded', 'triangle'][k]
        }))
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 6, bottom: 4, left: 8, right: 8 } },
        scales: { r: {
          min, max: 5,
          ticks: { stepSize: 0.25, display: false },
          grid: { color: 'rgba(255,255,255,.12)' }, angleLines: { color: 'rgba(255,255,255,.14)' },
          pointLabels: { color: 'rgba(255,255,255,.9)', font: { size: 13, weight: '800' }, padding: 16 }
        } },
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,.85)', usePointStyle: true, font: { weight: '600' }, padding: 16 } },
          tooltip: { callbacks: { title: items => aspectsSet[items[0].dataIndex], label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw, 2)} / 5 (${to99(ctx.raw)})` } }
        }
      }
    });
    $('#radarSub').textContent = `Rating peserta (skala 1–5) dikonversi ke skala 0–99 ala kartu pemain. Sumbu radar dimulai dari ${fmt(min, 1)} agar selisih kecil terlihat.`;
  }

  /* ====================================================================
     Tab: Jelajah
     ==================================================================== */
  function highlight(d) {
    const text = d.text;
    const ranges = d.a.hits.map(h => ({ s: h.start, e: h.end, c: h.v > 0 ? 'h-pos' : 'h-neg', title: `${h.term} ${signed(h.v)}${h.negated ? ' (dinegasi)' : ''}` }));
    const q = S.filters.q.trim().toLowerCase();
    if (q) {
      const low = text.toLowerCase(); let i = 0;
      while ((i = low.indexOf(q, i)) >= 0) { ranges.push({ s: i, e: i + q.length, c: 'h-q', title: 'Cocok pencarian' }); i += q.length; }
    }
    ranges.sort((a, b) => a.s - b.s || (a.c === 'h-q' ? -1 : 1));
    let out = '', pos = 0;
    ranges.forEach(r => {
      if (r.s < pos) return;
      out += esc(text.slice(pos, r.s)) + `<span class="${r.c}" title="${esc(r.title)}">${esc(text.slice(r.s, r.e))}</span>`;
      pos = r.e;
    });
    return out + esc(text.slice(pos));
  }

  function renderExplorer() {
    saveUI();
    let docs = filtered({ includeEmpty: S.explorer.showEmpty });
    if (S.explorer.review) docs = docs.filter(d => hasAI(d) && d.m.review && !S.overrides[d.key]);
    const sorters = {
      order: null,
      'conf-asc': (a, b) => (hasAI(a) ? a.m.confidence : 2) - (hasAI(b) ? b.m.confidence : 2),
      'score-desc': (a, b) => effScore(b) - effScore(a),
      'score-asc': (a, b) => effScore(a) - effScore(b),
      'len-desc': (a, b) => b.a.words - a.a.words,
      'len-asc': (a, b) => a.a.words - b.a.words
    };
    if (sorters[S.explorer.sort]) docs = docs.slice().sort(sorters[S.explorer.sort]);
    const total = S.docs.filter(d => !d.a.empty).length;
    const shown = docs.slice(0, S.explorer.limit);
    $('#explorerCount').innerHTML = `Menampilkan <b>${shown.length}</b> dari <b>${docs.length}</b> komentar terfilter <span style="color:var(--muted)">(total ${total})</span>`;
    $('#feed').innerHTML = shown.length ? shown.map(d => {
      const l = labelOf(d);
      const sc = effScore(d);
      const left = sc >= 0 ? 50 : 50 + sc * 50, width = Math.abs(sc) * 50;
      return `<article class="fcard" data-label="${l}" id="doc-${d.id}">
        <span class="fcard__rail" aria-hidden="true"></span>
        <div>
          <p class="fcard__text">${highlight(d)}</p>
          <div class="fcard__meta">
            <span class="tagc"><i data-lucide="graduation-cap"></i>${esc(truncate(d.dsName, 40))}</span>
            <span class="tagc"><i data-lucide="${d.question === 'saran' ? 'lightbulb' : 'message-circle'}"></i>${Q_LABEL[d.question] || 'Komentar'} #${d.n}</span>
            ${d.a.aspects.map(a => `<span class="tagc">${esc(aspectById[a.id].label)}</span>`).join('')}
            ${d.a.suggestion ? '<span class="tagc tagc--sug"><i data-lucide="lightbulb"></i>Berisi saran</span>' : ''}
            <span class="tagc tagc--mono">${d.a.words} kata</span>
            ${hasAI(d) && d.m.review && !S.overrides[d.key] ? `<span class="tagc tagc--review" title="${esc(d.m.reason)}"><i data-lucide="eye"></i>Perlu ditinjau</span>` : ''}
          </div>
        </div>
        <div class="fcard__side">
          ${labelChip(d)}
          ${d.a.empty ? '' : `<div style="display:flex;align-items:center;gap:8px"><span class="scorebar" role="img" aria-label="Skor ${signed(sc)}"><span style="left:${left}%;width:${width}%;background:${sentColor(l)}"></span></span><span class="score-num">${signed(sc)}</span></div>`}
          ${d.a.empty ? '' : sourceBadge(d)}
        </div>
      </article>`;
    }).join('') : '<div class="none">Tidak ada komentar yang cocok. Coba longgarkan filter.</div>';
    $('#moreBtn').hidden = docs.length <= S.explorer.limit;
    $('#sortSel').value = S.explorer.sort;
    $('#showEmpty').checked = S.explorer.showEmpty;
    $('#onlyReview').checked = S.explorer.review;
    const ms = modelStats(filtered());
    $('#reviewCount').textContent = ms.ai ? ms.review : '–';
  }

  function sourceBadge(d) {
    if (S.overrides[d.key]) return '<span class="src-badge src-badge--manual" title="Label dikoreksi manual"><i data-lucide="user-check"></i>Manual</span>';
    if (!hasAI(d)) return '<span class="src-badge" title="Dinilai dengan leksikon"><i data-lucide="book-a"></i>Leksikon</span>';
    const pc = Math.round(d.m.confidence * 100);
    const p = d.m.probs;
    return `<span class="src-badge src-badge--ai" title="Probabilitas: positif ${Math.round(p[0] * 100)}%, netral ${Math.round(p[1] * 100)}%, negatif ${Math.round(p[2] * 100)}%${d.m.contrast ? ' · klausa kontras diperhitungkan' : ''}">
      <i data-lucide="sparkles"></i>AI · ${pc}% yakin</span>`;
  }

  function openDoc(id) {
    const d = S.docs.find(x => x.id === id);
    if (!d) return;
    // Pastikan komentar terlihat walau filter menyembunyikannya
    if (!filtered({ includeEmpty: true }).some(x => x.id === id)) {
      S.filters.sentiments = new Set(SENTS); S.filters.term = null; S.filters.q = ''; S.filters.aspect = 'all';
    }
    const list = filtered({ includeEmpty: S.explorer.showEmpty });
    const sorted = S.explorer.sort === 'order' ? list : list;
    const idx = sorted.findIndex(x => x.id === id);
    if (idx >= S.explorer.limit) S.explorer.limit = idx + 10;
    setTab('jelajah');
    requestAnimationFrame(() => {
      const el = document.getElementById('doc-' + id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-flash');
      setTimeout(() => el.classList.remove('is-flash'), 1600);
    });
  }

  /* ====================================================================
     Menu koreksi label
     ==================================================================== */
  function openLabelMenu(btn, id) {
    const d = S.docs.find(x => x.id === id);
    if (!d || d.a.empty) return;
    const menu = $('#labelMenu');
    const cur = labelOf(d);
    menu.innerHTML = `<div class="menu__head"><span>Koreksi label</span></div>` +
      SENTS.map(l => `<button role="menuitemradio" aria-checked="${cur === l}" data-set="${l}"><span class="dot dot--${l.slice(0, 3)}" style="margin-top:6px"></span><span>${SENT_LABEL[l]}</span></button>`).join('') +
      (S.overrides[d.key] ? `<button role="menuitem" data-set="auto"><i data-lucide="rotate-ccw"></i><span><b>Kembalikan otomatis</b><small>Label otomatis: ${SENT_LABEL[autoLabel(d)]} (${hasAI(d) ? 'AI ' + Math.round(d.m.confidence * 100) + '% yakin' : 'leksikon ' + signed(d.a.score)})</small></span></button>` : '');
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const mw = 240;
    menu.style.minWidth = mw + 'px';
    menu.style.left = Math.max(12, Math.min(window.innerWidth - mw - 12, r.right - mw)) + 'px';
    const below = r.bottom + 6;
    menu.style.top = (below + 200 > window.innerHeight ? Math.max(12, r.top - 6 - menu.offsetHeight) : below) + 'px';
    icons();
    menu.dataset.doc = id;
    btn.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus();
  }

  /* ====================================================================
     Impor
     ==================================================================== */
  async function handleFiles(files) {
    const list = [...files];
    if (!list.length) return;
    const out = [];
    for (const file of list) {
      const ext = file.name.split('.').pop().toLowerCase();
      try {
        if (ext === 'pdf') {
          const text = await Parsers.pdfToText(file);
          const ds = Parsers.parseReportText(text, file.name);
          if (!ds.feedback.length && !ds.ratings.services.length) {
            // Bukan format laporan: perlakukan setiap baris sebagai komentar
            const alt = Parsers.pasteToDataset(text, file.name.replace(/\.pdf$/i, ''), 'pengalaman');
            alt.source = file.name; alt.kind = 'pdf-raw';
            out.push(alt);
            toast(`${esc(file.name)}: format laporan tidak dikenali, setiap baris dibaca sebagai komentar.`, 'err');
          } else out.push(ds);
        } else if (ext === 'txt') {
          const text = await file.text();
          out.push(/Feedback Kelas/i.test(text) ? Parsers.parseReportText(text, file.name) : Parsers.pasteToDataset(text, file.name.replace(/\.txt$/i, '')));
        } else if (['csv', 'tsv', 'xlsx', 'xls'].includes(ext)) {
          const table = await Parsers.readTable(file);
          if (!table.rows.length) { toast(`${esc(file.name)} kosong.`, 'err'); continue; }
          S.tableQueue.push({ file, ...table });
        } else {
          toast(`${esc(file.name)}: format .${esc(ext)} belum didukung.`, 'err');
        }
      } catch (err) {
        console.error(err);
        toast(`Gagal membaca ${esc(file.name)}: ${esc(err.message)}`, 'err');
      }
    }
    if (out.length) addDatasets(out);
    renderSources();
    nextTable();
  }

  function nextTable() {
    const item = S.tableQueue[0];
    const mapper = $('#mapper');
    if (!item) { mapper.hidden = true; return; }
    if (!$('#importDialog').open) openImport();
    const g = Parsers.guessColumns(item.rows, item.columns);
    const opts = (sel, optional) => (optional ? '<option value="">(tidak ada)</option>' : '') + item.columns.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#mapperFile').textContent = `${item.file.name} · ${item.rows.length} baris`;
    $('#mapText').innerHTML = opts(g.text, false);
    $('#mapClass').innerHTML = opts(g.cls, true);
    $('#mapQ').innerHTML = opts(g.q, true);
    $('#mapRating').innerHTML = opts(g.rating, true);
    mapper.hidden = false;
    updateMapPreview();
  }
  function updateMapPreview() {
    const item = S.tableQueue[0]; if (!item) return;
    const col = $('#mapText').value;
    const sample = item.rows.map(r => String(r[col] ?? '').trim()).filter(Boolean).slice(0, 3);
    $('#mapPreview').innerHTML = `Pratinjau kolom teks:<ol>${sample.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  }

  function renderSources() {
    const el = $('#sourceList');
    el.innerHTML = S.datasets.length ? S.datasets.map(ds => `
      <li>
        <span class="src-icon"><i data-lucide="${ds.kind === 'pdf' ? 'file-text' : ds.kind === 'table' ? 'sheet' : 'clipboard'}"></i></span>
        <span class="src-main"><b title="${esc(ds.name)}">${esc(ds.name)}</b><small>${ds.feedback.filter(f => !NLP.isEmptyAnswer(f.text)).length} komentar${ds.date ? ' · ' + esc(ds.date) : ''} · ${esc(ds.source)}</small></span>
        <button class="btn btn--icon btn--text btn--danger" data-remove="${ds.id}" aria-label="Hapus ${esc(ds.name)}"><i data-lucide="trash-2"></i></button>
      </li>`).join('') : '<li class="empty-src">Belum ada sumber data.</li>';
    icons();
  }

  function openImport(tab) {
    const dlg = $('#importDialog');
    renderSources();
    if (tab) setImportTab(tab);
    if (!dlg.open) dlg.showModal();
    icons();
  }
  function setImportTab(t) {
    $$('#importTabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.it === t)));
    $$('[data-ipanel]').forEach(p => { p.hidden = p.dataset.ipanel !== t; });
    if (t === 'paste') setTimeout(() => $('#pasteText').focus(), 50);
  }

  function loadSample() {
    const list = T.SAMPLE_REPORTS.map(r => Parsers.parseReportText(r.text, r.file));
    addDatasets(list);
    renderSources();
  }

  /* ====================================================================
     Ekspor
     ==================================================================== */
  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportCsv() {
    const docs = filtered({ includeEmpty: true });
    const cols = ['kelas', 'tanggal', 'pertanyaan', 'no', 'komentar', 'jumlah_kata', 'skor', 'label_otomatis', 'label_final', 'dikoreksi_manual', 'sumber', 'keyakinan', 'prob_positif', 'prob_netral', 'prob_negatif', 'perlu_ditinjau', 'label_leksikon', 'aspek', 'berisi_saran', 'kata_sentimen'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(docs.map(d => {
      const ds = S.datasets.find(x => x.id === d.datasetId) || {};
      const ai = hasAI(d);
      return [ds.name, ds.date, Q_LABEL[d.question], d.n, d.text, d.a.words, +autoScore(d).toFixed(3), SENT_LABEL[autoLabel(d)], SENT_LABEL[labelOf(d)], S.overrides[d.key] ? 'ya' : 'tidak',
        ai ? 'model AI + leksikon' : 'leksikon', ai ? d.m.confidence.toFixed(3) : '', ai ? d.m.probs[0].toFixed(3) : '', ai ? d.m.probs[1].toFixed(3) : '', ai ? d.m.probs[2].toFixed(3) : '',
        ai ? (d.m.review ? 'ya' : 'tidak') : '', SENT_LABEL[d.a.label],
        d.a.aspects.map(a => aspectById[a.id].label).join('; '), d.a.suggestion ? 'ya' : 'tidak', d.a.hits.map(h => `${h.term}(${h.v})`).join('; ')].map(q).join(',');
    }));
    download(`telaah-ai-analisis-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast(`${docs.length} baris diekspor ke CSV`);
  }
  function exportCloud() {
    const go = () => {
      const svg = $('#cloud');
      const placed = S.cloudPlaced || [];
      if (!placed.length) { toast('Wordcloud masih kosong.', 'err'); return; }
      const [, , w, h] = (svg.getAttribute('viewBox') || '0 0 1000 460').split(' ').map(Number);
      const scale = 2;
      const out = document.createElement('canvas');
      out.width = w * scale; out.height = h * scale;
      const ctx = out.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = cssVar('--surface'); ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      placed.forEach(d => {
        ctx.font = `${d.weight} ${d.size}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = d.color;
        ctx.fillText(d.text, w / 2 + d.x, h / 2 + d.y);
      });
      out.toBlob(b => { download(`telaah-ai-wordcloud-${stamp()}.png`, b); toast('Wordcloud diunduh'); });
    };
    if (S.tab !== 'kata') { setTab('kata'); setTimeout(go, 900); } else go();
  }
  function exportJson() {
    const docs = S.docs.map(d => ({ kelas: d.dsName, pertanyaan: d.question, no: d.n, teks: d.text, skor: d.a.score, label: labelOf(d), aspek: d.a.aspects.map(a => a.id), saran: d.a.suggestion }));
    download(`telaah-ai-${stamp()}.json`, JSON.stringify({ dibuat: new Date().toISOString(), datasets: S.datasets, hasil: docs }, null, 2), 'application/json');
    toast('JSON diunduh');
  }
  function exportPrint() {
    document.body.classList.add('printing');
    const prevTab = S.tab;
    const prevLimit = S.explorer.limit;
    S.explorer.limit = 10000;
    $$('.panel').forEach(p => { p.hidden = false; });
    [renderOverview, renderWords, renderAspects, renderScores, renderExplorer].forEach(fn => fn());
    icons();
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing');
      S.explorer.limit = prevLimit;
      setTab(prevTab);
    }, 900);
  }

  /* ====================================================================
     Menu popover generik
     ==================================================================== */
  function bindMenu(btnSel, menuSel) {
    const btn = $(btnSel), menu = $(menuSel);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.hidden;
      closeMenus();
      if (open) {
        menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
        const first = menu.querySelector('input, button'); if (first) first.focus();
      }
    });
  }
  function closeMenus() {
    $$('.menu').forEach(m => { m.hidden = true; });
    $$('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  /* ====================================================================
     Event
     ==================================================================== */
  function bind() {
    // Tabs
    $$('.tabs a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setTab(a.dataset.tab); }));
    $('.tabs__inner').addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const tabs = $$('.tabs a'); const i = tabs.findIndex(t => t.dataset.tab === S.tab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setTab(n.dataset.tab); n.focus();
    });
    window.addEventListener('hashchange', () => setTab(location.hash.slice(1), false));

    // Menus
    bindMenu('#classBtn', '#classMenu');
    bindMenu('#aspectBtn', '#aspectMenu');
    bindMenu('#exportBtn', '#exportMenu');
    document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenus();
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#importDialog').open) { e.preventDefault(); $('#searchInput').focus(); }
    });

    // Kelas
    $('#classList').addEventListener('change', e => {
      const id = e.target.value;
      if (e.target.checked) S.filters.classes.add(id); else S.filters.classes.delete(id);
      if (S.filters.classes.size === S.datasets.length) S.filters.classes.clear();
      renderFilters(); renderTab(); icons();
      $('#classMenu').hidden = false;
    });
    $('#classAll').addEventListener('click', e => { e.stopPropagation(); S.filters.classes.clear(); renderAll(); $('#classMenu').hidden = false; });

    // Pertanyaan
    $('#questionSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.filters.question = b.dataset.q; renderAll();
    });

    // Sentimen
    $('#sentToggles').addEventListener('click', e => {
      const b = e.target.closest('.stoggle'); if (!b) return;
      const s = b.dataset.s, set = S.filters.sentiments;
      if (set.has(s) && set.size === 1) { S.filters.sentiments = new Set(SENTS); }
      else if (set.has(s)) set.delete(s); else set.add(s);
      renderAll();
    });
    $('#sentStrip').addEventListener('click', e => {
      const b = e.target.closest('[data-solo]'); if (!b) return;
      const s = b.dataset.solo, set = S.filters.sentiments;
      S.filters.sentiments = set.size === 1 && set.has(s) ? new Set(SENTS) : new Set([s]);
      renderAll();
    });

    // Aspek
    $('#aspectMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-aspect]'); if (!b) return;
      S.filters.aspect = b.dataset.aspect; closeMenus(); renderAll();
    });
    $('#aspectTable').addEventListener('click', e => { const r = e.target.closest('[data-aspect-row]'); if (r) toggleAspect(r.dataset.aspectRow); });
    $('#aspectTable').addEventListener('keydown', e => { const r = e.target.closest('[data-aspect-row]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleAspect(r.dataset.aspectRow); } });

    // Pencarian
    const onSearch = debounce(v => { S.filters.q = v; S.explorer.limit = 30; renderFilters(); renderTab(); icons(); }, 220);
    $('#searchInput').addEventListener('input', e => onSearch(e.target.value));

    // Chip & reset
    $('#activeChips').addEventListener('click', e => { const b = e.target.closest('[data-clear]'); if (b) { S.filters[b.dataset.clear] = null; renderAll(); } });
    $('#resetBtn').addEventListener('click', () => {
      S.filters = { classes: new Set(), question: 'all', sentiments: new Set(SENTS), aspect: 'all', q: '', term: null };
      S.explorer.limit = 30; renderAll(); toast('Semua filter direset');
    });

    // Delegasi global: buka dokumen, label, term
    document.addEventListener('click', e => {
      const open = e.target.closest('[data-open]');
      if (open) { openDoc(open.dataset.open); return; }
      const rl = e.target.closest('[data-relabel]');
      if (rl) { e.stopPropagation(); closeMenus(); openLabelMenu(rl, rl.dataset.relabel); return; }
      const cls = e.target.closest('[data-class]');
      if (cls) {
        const id = cls.dataset.class;
        S.filters.classes = S.filters.classes.size === 1 && S.filters.classes.has(id) ? new Set() : new Set([id]);
        renderAll(); return;
      }
      const term = e.target.closest('[data-term]');
      if (term) { setTerm(term.dataset.term); return; }
      const un = e.target.closest('[data-unstop]');
      if (un) { S.stop.delete(un.dataset.unstop); save(); renderAll(); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const ds = S.datasets.find(d => d.id === rm.dataset.remove);
        S.datasets = S.datasets.filter(d => d.id !== rm.dataset.remove);
        rebuildDocs(); save(); renderAll(); renderSources();
        if (ds) toast(`${esc(truncate(ds.name, 40))} dihapus`);
      }
    });
    document.addEventListener('keydown', e => {
      const q = e.target.closest && e.target.closest('.quote[data-open]');
      if (q && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDoc(q.dataset.open); }
    });

    $('#labelMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-set]'); if (!b) return;
      const d = S.docs.find(x => x.id === $('#labelMenu').dataset.doc);
      if (!d) return;
      // Koreksi manual selalu disimpan (dulu dibandingkan dengan label leksikon, padahal
      // label otomatis bisa berasal dari model AI, sehingga koreksi ikut terhapus).
      if (b.dataset.set === 'auto') delete S.overrides[d.key];
      else S.overrides[d.key] = b.dataset.set;
      save(); closeMenus(); renderAll();
      toast(b.dataset.set === 'auto' ? 'Label dikembalikan ke hasil otomatis' : `Label dikoreksi menjadi ${SENT_LABEL[b.dataset.set]}`);
    });

    // Word controls
    $('#gramSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.cloud.n = +b.dataset.n; renderWords(); icons(); });
    $('#colorSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.cloud.color = b.dataset.c; renderWords(); icons(); });
    const onMax = debounce(() => renderWords(), 150);
    $('#maxWords').addEventListener('input', e => { S.cloud.max = +e.target.value; $('#maxWordsOut').textContent = e.target.value; onMax(); });
    $('#cloudPng').addEventListener('click', exportCloud);
    const cloudWrap = $('.cloud-wrap');
    ['mouseover', 'focusin'].forEach(ev => cloudWrap.addEventListener(ev, e => { const t = e.target.closest('.cloud-word'); if (t) showCloudTip(t); }));
    ['mouseout', 'focusout'].forEach(ev => cloudWrap.addEventListener(ev, e => { if (e.target.closest('.cloud-word')) $('#cloudTip').hidden = true; }));
    cloudWrap.addEventListener('keydown', e => {
      const t = e.target.closest('.cloud-word');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setTerm(t.dataset.term); }
    });
    $('#stopForm').addEventListener('submit', e => {
      e.preventDefault();
      const words = $('#stopInput').value.toLowerCase().split(/[,\s]+/).filter(Boolean);
      words.forEach(w => S.stop.add(w));
      $('#stopInput').value = '';
      if (words.length) { save(); renderAll(); toast(`${words.length} kata ditambahkan ke daftar abaikan`); }
    });

    // Explorer
    $('#sortSel').addEventListener('change', e => { S.explorer.sort = e.target.value; renderExplorer(); icons(); });
    $('#showEmpty').addEventListener('change', e => { S.explorer.showEmpty = e.target.checked; renderExplorer(); icons(); });
    $('#moreBtn').addEventListener('click', () => { S.explorer.limit += 30; renderExplorer(); icons(); });
    $('#lbSort').addEventListener('click', e => {
      const b = e.target.closest('[data-lb]'); if (!b) return;
      S.lbSort = b.dataset.lb; renderScores(); icons();
    });
    initCardDrag();
    $('#tab-skor').addEventListener('click', e => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const name = b.dataset.pick;
      S.h2h = S.h2h || [];
      if (S.h2h[0] === name) return $('#arena').scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (S.h2h[1] === name) S.h2h[1] = S.h2h[0];
      S.h2h[0] = name;
      renderScores(); icons();
      $('#arena').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#h2h').addEventListener('change', e => {
      const sl = e.target.closest('[data-h2h]'); if (!sl) return;
      S.h2h[+sl.dataset.h2h] = sl.value;
      renderScores(); icons();
    });
    $('#onlyReview').addEventListener('change', e => { S.explorer.review = e.target.checked; S.explorer.limit = 30; renderExplorer(); icons(); });

    // Model AI
    $('#modelBtn').addEventListener('click', () => { const dlg = $('#modelDialog'); renderModelDialog(); if (!dlg.open) dlg.showModal(); });
    $('#useModel').addEventListener('change', e => {
      S.useModel = e.target.checked;
      try { localStorage.setItem('telaah.useModel', S.useModel ? '1' : '0'); } catch (err) { /* abaikan */ }
      renderModelChip(); renderAll(); renderModelDialog();
      if (S.useModel) runModel();
      toast(S.useModel ? 'Model AI diaktifkan' : 'Beralih ke mode leksikon');
    });

    // Theme
    $('#themeBtn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('telaah.theme', next); } catch (e) { /* abaikan */ }
      if (S.datasets.length) renderTab();
      icons();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.datasets.length) renderTab(); });

    // Import
    $('#importBtn').addEventListener('click', () => openImport('file'));
    $('#pasteOpenBtn').addEventListener('click', () => openImport('paste'));
    $('#loadSampleBtn').addEventListener('click', loadSample);
    $('#dlgSample').addEventListener('click', loadSample);
    $('#clearAll').addEventListener('click', () => {
      if (!S.datasets.length) return;
      if (!confirm('Hapus semua sumber data dan koreksi label dari perangkat ini?')) return;
      S.datasets = []; S.overrides = {}; rebuildDocs(); save(); renderAll(); renderSources(); toast('Semua data dihapus');
    });
    $('#importTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setImportTab(b.dataset.it); });
    const fileInput = $('#fileInput');
    fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
    ['#dropzone', '#emptyDrop'].forEach(sel => {
      const z = $(sel);
      z.addEventListener('click', () => fileInput.click());
      z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
      z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('is-over'); });
      z.addEventListener('dragleave', () => z.classList.remove('is-over'));
      z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('is-over'); handleFiles(e.dataTransfer.files); });
    });
    // Jatuhkan file di mana saja
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { if (!e.target.closest('.dropzone')) { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); } });

    $('#mapText').addEventListener('change', updateMapPreview);
    $('#mapCancel').addEventListener('click', () => { S.tableQueue.shift(); nextTable(); });
    $('#mapApply').addEventListener('click', () => {
      const item = S.tableQueue.shift(); if (!item) return;
      const list = Parsers.tableToDatasets(item.rows, { text: $('#mapText').value, cls: $('#mapClass').value, q: $('#mapQ').value, rating: $('#mapRating').value }, item.file.name);
      addDatasets(list); renderSources(); nextTable();
    });
    $('#pasteText').addEventListener('input', e => {
      const n = e.target.value.split(/\r?\n/).filter(s => s.trim()).length;
      $('#pasteHint').textContent = `${n} komentar`;
    });
    $('#pasteApply').addEventListener('click', () => {
      const text = $('#pasteText').value;
      if (!text.trim()) { toast('Tempel minimal satu komentar.', 'err'); $('#pasteText').focus(); return; }
      addDatasets([Parsers.pasteToDataset(text, $('#pasteName').value.trim() || 'Teks tempel', $('#pasteQ').value)]);
      $('#pasteText').value = ''; $('#pasteHint').textContent = '0 komentar';
      renderSources();
    });

    // Export
    $('#exportMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-export]'); if (!b) return;
      closeMenus();
      if (!S.datasets.length) { toast('Belum ada data untuk diekspor.', 'err'); return; }
      ({ csv: exportCsv, cloud: exportCloud, json: exportJson, print: exportPrint })[b.dataset.export]();
    });

    // Resize
    const setTopbar = () => document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px');
    setTopbar();
    const onResize = debounce(() => { setTopbar(); if (S.tab === 'kata' && S.datasets.length) renderWords(); icons(); }, 250);
    window.addEventListener('resize', onResize);
    const onScroll = () => $('#topbar').classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ====================================================================
     Mulai
     ==================================================================== */
  function init() {
    load();
    bind();
    rebuildDocs();
    renderModelChip();
    // model.js adalah ES module (dimuat setelah skrip ini); tunggu siap lalu jalankan
    window.addEventListener('telaah-model-module', () => { renderModelChip(); if (S.docs.length) runModel(); });
    setTab(location.hash.slice(1) || S.tab || 'ringkasan', false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.datasets.length) renderTab(); icons(); });
  }
  T.Hybrid = { combine, contrastTail, lexProbs, countWords, applyModel, get cache() { return mcache; }, get state() { return S; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.T);
