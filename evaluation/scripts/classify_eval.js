// Evaluasi pipeline 4 kelas memakai KODE APLIKASI YANG SAMA (lexicon.js, nlp.js, classifier.js).
// Probabilitas model diambil dari cache Python (_tta_cache.json, ONNX Runtime, model yang sama).
// Pemakaian:
//   node classify_eval.js need   -> tulis _need.json (teks yang belum punya probabilitas)
//   node classify_eval.js run    -> pilih parameter di set dev, laporkan di set uji
const fs = require('fs'), vm = require('vm'), path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..'), DATA = path.join(HERE, '..', 'data');
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ['lexicon', 'nlp', 'classifier']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', f + '.js'), 'utf8').replace(/^window\.T = window\.T \|\| \{\};/m, 'window.T = window.T || {}; var T = window.T;'), ctx);
}
const T = ctx.window.T;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'manifest.json'), 'utf8'));
const CACHE = path.join(HERE, '_tta_cache.json');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const tsv = f => fs.readFileSync(path.join(DATA, f), 'utf8').trim().split('\n').map(l => { const i = l.lastIndexOf('\t'); return { text: l.slice(0, i), label: l.slice(i + 1).trim() }; });

const SETS = {
  dev_mixed: read('mixed_dev.json'), dev_feedback4: read('feedback_gold_4class.json'), smsa_valid: tsv('smsa_valid.tsv'),
  test_mixed: read('mixed_test.json'), test_v2_4: read('feedback_test_v2_4class.json'), smsa_test: tsv('smsa_test.tsv'),
  spec: read('spec_cases.json')
};
const analyzed = new Map();
const A = t => { if (!analyzed.has(t)) analyzed.set(t, T.NLP.analyze(t)); return analyzed.get(t); };

function engine(cfg) { return T.Classifier.hybrid(cfg, t => cache[t] || null); }

if (process.argv[2] === 'need') {
  const need = new Set();
  const grid = [manifest.pipeline];
  for (const rows of Object.values(SETS)) for (const r of rows) for (const cfg of grid) engine({ ...cfg, mixedMin: 0.3, mixedMinModel: 0.5 }).needs(r.text, A(r.text)).forEach(t => { if (!cache[t]) need.add(t); });
  fs.writeFileSync(path.join(HERE, '_need.json'), JSON.stringify([...need]));
  console.log('perlu dihitung:', need.size);
  process.exit(0);
}

function evalSet(rows, cfg) {
  const E = engine(cfg); let ok = 0, mixedPred = 0;
  const out = rows.map(r => { const res = A(r.text).empty ? { sentimen: 'neutral' } : E.classify(r.text, { question: 'pengalaman', analysis: A(r.text) }); if (!res) throw new Error('probabilitas hilang: ' + r.text); if (res.sentimen === r.label) ok++; if (res.sentimen === 'mixed') mixedPred++; return res; });
  return { acc: +(100 * ok / rows.length).toFixed(1), mixedRate: +(100 * mixedPred / rows.length).toFixed(1), out };
}

const base = manifest.pipeline;
const grid = [];
for (const mixedMin of [0.2, 0.3, 0.4, 0.5]) for (const mixedMinModel of [0.4, 0.5, 0.6, 0.7, 0.8]) grid.push({ ...base, mixedMin, mixedMinModel });
const scored = grid.map(cfg => {
  const dm = evalSet(SETS.dev_mixed, cfg), df = evalSet(SETS.dev_feedback4, cfg), sv = evalSet(SETS.smsa_valid, cfg);
  return { cfg, dm: dm.acc, df: df.acc, sv: sv.acc, svMixed: sv.mixedRate, obj: dm.acc + df.acc + sv.acc };
}).sort((a, b) => b.obj - a.obj);
console.log('Pemilihan (dev saja): mixed_dev, feedback90 (4 kelas), SmSA valid (3 kelas; prediksi Campuran dihitung salah)');
scored.slice(0, 6).forEach(s => console.log(`  mixedMin=${s.cfg.mixedMin} mixedMinModel=${s.cfg.mixedMinModel}  mixed_dev ${s.dm}  feedback4 ${s.df}  smsa_val ${s.sv} (campuran ${s.svMixed}%)`));
const best = scored[0].cfg;
const noMix = { ...base, mixedMin: 9, mixedMinModel: 9 };
console.log('\nUji (tidak dipakai memilih):');
for (const [name, cfg] of [['tanpa Campuran (v6)', noMix], ['4 kelas (terpilih)', best]]) {
  const r = k => evalSet(SETS[k], cfg);
  const tm = r('test_mixed'), tv = r('test_v2_4'), st = r('smsa_test');
  console.log(`  ${name.padEnd(20)} mixed_test ${tm.acc}  test_v2(4 kelas) ${tv.acc}  smsa_test ${st.acc} (campuran ${st.mixedRate}%)`);
}
console.log('\nKasus spesifikasi:');
const E = engine(best);
SETS.spec.forEach(c => {
  const res = E.classify(c.text, { question: 'pengalaman', analysis: A(c.text) });
  const asp = c.aspects ? Object.entries(c.aspects).map(([k, v]) => `${k}:${res.aspek[k] || '-'}${res.aspek[k] === v ? '' : '(harap ' + v + ')'}`).join(' ') : '';
  console.log(`  (${c.id}) harap ${c.label} -> ${res.sentimen} ${Math.round(res.keyakinan * 100)}% tinjau=${res.tinjau} ${res.sentimen === c.label ? 'LULUS' : 'GAGAL'} ${asp}\n      aspek=${JSON.stringify(res.aspek)} alasan="${res.alasan}"`);
});
console.log('\nKesalahan mixed_test:');
evalSet(SETS.test_mixed, best).out.forEach((res, i) => { const r = SETS.test_mixed[i]; if (res.sentimen !== r.label) console.log(`  ${r.label} -> ${res.sentimen} | ${r.text}`); });
fs.writeFileSync(path.join(HERE, '_best_mixed.json'), JSON.stringify({ mixedMin: best.mixedMin, mixedMinModel: best.mixedMinModel }));
