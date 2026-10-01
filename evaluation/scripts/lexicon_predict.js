// Jalankan mesin leksikon aplikasi (kode yang sama persis) pada daftar teks.
// Pemakaian: node lexicon_predict.js <input.json: ["teks", ...]> <output.json>
const fs = require('fs'), vm = require('vm'), path = require('path');
const APP = path.join(__dirname, '..', '..', 'assets', 'js');
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ['lexicon', 'nlp']) {
  vm.runInContext(fs.readFileSync(path.join(APP, f + '.js'), 'utf8').replace(/^window\.T = window\.T \|\| \{\};/m, 'window.T = window.T || {}; var T = window.T;'), ctx);
}
const T = ctx.window.T;
const texts = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const t0 = Date.now();
const out = texts.map(t => {
  const a = T.NLP.analyze(t);
  return { label: a.label === 'empty' ? 'neutral' : a.label, score: a.score };
});
fs.writeFileSync(process.argv[3], JSON.stringify({ preds: out, ms: Date.now() - t0 }));
