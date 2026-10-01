/* Telaah AI: pembaca sumber data: PDF laporan feedback (format Inixindo),
 * CSV/Excel, dan teks tempel.
 */
(function (T) {
  let uid = 0;
  const newId = p => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`;

  /* ---------- PDF → baris teks ---------- */
  async function pdfToText(file) {
    if (!window.pdfjsLib) throw new Error('Pustaka PDF belum termuat. Periksa koneksi internet.');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const rows = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find(r => Math.abs(r.y - y) < 2.5);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, w: it.width, str: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => {
        r.items.sort((a, b) => a.x - b.x);
        let s = '', lastEnd = null;
        r.items.forEach(it => {
          if (lastEnd !== null && it.x - lastEnd > 1.2 && !s.endsWith(' ') && !it.str.startsWith(' ')) s += ' ';
          s += it.str;
          lastEnd = it.x + it.w;
        });
        lines.push(s.replace(/\s+/g, ' ').trim());
      });
    }
    return lines.join('\n');
  }

  /* ---------- Parser laporan feedback kelas ---------- */
  function parseReportText(text, fileName) {
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const ds = {
      id: newId('ds'), source: fileName || 'Laporan', kind: 'pdf',
      name: '', date: '', respondents: null, participants: null,
      ratings: { overall: null, services: [], serviceTotal: null, recommend: null, instructors: [], instructorAvg: null, total: null },
      feedback: []
    };

    let section = null;   // 'pengalaman' | 'saran' | 'other'
    let collecting = false;
    let current = null;
    let expectDate = false, expectCount = false;

    const flush = () => {
      if (current) {
        current.text = current.text.trim();
        ds.feedback.push(current);
        current = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let m;

      // Jumlah respons bisa berada di baris yang sama dengan tanggal (tata letak dua kolom)
      if ((m = line.match(/(\d+)\s*Feedback\s*\/\s*(\d+)\s*Peserta/i))) {
        ds.respondents = +m[1]; ds.participants = +m[2]; expectCount = false;
        line = line.replace(m[0], '').trim();
        if (!line) continue;
      }
      line = line.replace(/\s*Total Feedback\s*\/\s*Total Peserta:?\s*/i, ' ').trim();
      if (!line) { expectCount = true; continue; }
      // Nomor pertanyaan dari kolom kiri yang menempel ke baris jawaban: "3 18. bagus"
      line = line.replace(/^\d{1,2}\s+(?=\d+\.\s)/, '');
      // …atau ke baris lanjutan jawaban: "5 supaya bisa …" (bukan baris pertanyaan)
      if (collecting && current && /^\d{1,2}\s+\S/.test(line) && !/^\d+\.\s/.test(line) && !/[?%]|\(skala/i.test(line)) {
        line = line.replace(/^\d{1,2}\s+/, '');
      }

      if ((m = line.match(/^Feedback Kelas\s*["“”](.+?)["“”]\s*$/i)) || (m = line.match(/^Feedback Kelas\s+(.+)$/i))) {
        if (!ds.name) ds.name = m[1].replace(/^["“]|["”]$/g, '').trim();
        continue;
      }
      if (/^Tanggal\s*&\s*Waktu/i.test(line)) {
        const rest = line.replace(/^Tanggal\s*&\s*Waktu\s*:?/i, '').trim();
        if (/\d{4}/.test(rest)) ds.date = rest; else expectDate = true;
        continue;
      }
      if (expectDate && /\d{4}/.test(line)) { ds.date = line; expectDate = false; continue; }
      if (expectCount && !/^Umum$/i.test(line)) continue;
      expectCount = false;

      // Penanda bagian
      if (/^#\s*/.test(line)) {
        flush(); collecting = false;
        if (/ceritakan|pengalaman/i.test(line)) section = 'pengalaman';
        else if (/apa yang bisa kami lakukan|saran|masukan|percaya dan puas/i.test(line)) section = 'saran';
        else section = 'other';
        continue;
      }
      if (/^Cerita Pengalaman Peserta$/i.test(line) || /^(Jawaban|Tanggapan) Peserta$/i.test(line)) {
        flush(); collecting = section === 'pengalaman' || section === 'saran'; continue;
      }
      if (/^Umum$/i.test(line) || /^Rata\s*-\s*Rata$/i.test(line)) { flush(); collecting = false; continue; }
      // Nomor pertanyaan yang berdiri sendiri (sering terselip di tengah daftar jawaban)
      if (/^\d{1,2}$/.test(line)) continue;

      // Rata-rata
      if ((m = line.match(/^Rata\s*-\s*Rata Feedback Instruktur\s+([\d.,]+)/i))) { ds.ratings.instructorAvg = num(m[1]); continue; }
      if ((m = line.match(/^Total Rata\s*-\s*Rata\s+([\d.,]+)/i))) { ds.ratings.total = num(m[1]); flush(); collecting = false; continue; }
      if (/^Rata\s*-\s*Rata \(skala/i.test(line)) continue;

      // Rekomendasi (NPS-like)
      if ((m = line.match(/merekomendasikan.*?([\d.,]+)\s*%\s*$/i))) { flush(); collecting = false; ds.ratings.recommend = num(m[1]); continue; }

      // Rating instruktur: "... (Nama)(skala 5) 4.9"
      if ((m = line.match(/^(?:\d+\s+)?(.+?)\s*\(([^()]+)\)\s*\(skala\s*\d+\)\s*([\d.,]+)$/i))) {
        flush(); collecting = false;
        ds.ratings.instructors.push({ aspect: cleanAspect(m[1]), name: m[2].trim(), score: num(m[3]) });
        continue;
      }
      // Pengalaman umum (pertanyaan 1)
      if ((m = line.match(/^(?:\d+\s+)?Bagaimana pengalaman pelatihan.*?\(skala\s*\d+\)\s*([\d.,]+)$/i))) {
        flush(); collecting = false; ds.ratings.overall = num(m[1]); continue;
      }
      // Rating layanan: "Materi sesuai harapan (skala 5) 5"
      if ((m = line.match(/^(.+?)\s*\(skala\s*\d+\)\s*([\d.,]+)$/i))) {
        flush(); collecting = false;
        ds.ratings.services.push({ label: m[1].trim(), score: num(m[2]) });
        continue;
      }
      if ((m = line.match(/^Total\s+([\d.,]+)$/i))) { ds.ratings.serviceTotal = num(m[1]); continue; }
      // Baris pertanyaan bernomor "4 Seberapa ..." (tanpa titik) mengakhiri pengumpulan
      if (/^\d+\s+[A-Z]/.test(line) && !/^\d+\.\s/.test(line)) { flush(); collecting = false; continue; }

      if (!collecting) continue;

      if ((m = line.match(/^(\d+)\.\s*(.*)$/))) {
        flush();
        current = { id: newId('fb'), n: +m[1], text: m[2], question: section, datasetId: ds.id };
      } else if (current) {
        current.text += ' ' + line;
      }
    }
    flush();
    if (!ds.name) ds.name = (fileName || 'Kelas').replace(/\.(pdf|txt)$/i, '').replace(/^Feedback Kelas\s*/i, '');
    return ds;
  }

  const ASPECT_SHORT = [
    [/^Bagaimana pengalaman/i, 'Pengalaman dipandu'],
    [/^Penjelasan/i, 'Penjelasan'],
    [/^Interaksi/i, 'Interaksi'],
    [/^Penguasaan/i, 'Penguasaan materi']
  ];
  function cleanAspect(s) {
    const c = s.replace(/^\d+\s+/, '').replace(/\?\s*$/, '').replace(/\.$/, '').trim();
    const hit = ASPECT_SHORT.find(([re]) => re.test(c));
    return hit ? hit[1] : c;
  }
  function num(s) { return parseFloat(String(s).replace(',', '.')); }

  /* ---------- CSV / Excel ---------- */
  async function readTable(file) {
    if (!window.XLSX) throw new Error('Pustaka spreadsheet belum termuat. Periksa koneksi internet.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { rows, columns };
  }

  function guessColumns(rows, columns) {
    const avgLen = c => rows.slice(0, 200).reduce((s, r) => s + String(r[c] || '').length, 0) / Math.max(1, Math.min(rows.length, 200));
    const byName = re => columns.find(c => re.test(c));
    const text = byName(/feedback|komentar|ulasan|review|pesan|saran|cerita|jawaban|text|teks|comment|opini/i)
      || [...columns].sort((a, b) => avgLen(b) - avgLen(a))[0];
    const cls = byName(/kelas|class|course|pelatihan|program|produk|kategori|batch/i) || '';
    const q = byName(/pertanyaan|question|tipe|jenis/i) || '';
    const rating = byName(/rating|skor|score|nilai|bintang|star/i) || '';
    return { text, cls, q, rating };
  }

  function tableToDatasets(rows, map, fileName) {
    const groups = new Map();
    rows.forEach((r, i) => {
      const text = String(r[map.text] ?? '').trim();
      if (!text) return;
      const cls = map.cls ? String(r[map.cls] || '').trim() || 'Tanpa kelas' : fileName.replace(/\.(csv|xlsx|xls|tsv)$/i, '');
      if (!groups.has(cls)) groups.set(cls, []);
      let question = 'pengalaman';
      if (map.q) question = /saran|masukan|suggest|improve|harap/i.test(String(r[map.q])) ? 'saran' : 'pengalaman';
      const rating = map.rating ? num(r[map.rating]) : null;
      groups.get(cls).push({ text, question, rating: Number.isFinite(rating) ? rating : null, n: i + 1 });
    });
    return [...groups.entries()].map(([name, items]) => {
      const ds = blankDataset(name, fileName, 'table');
      const rated = items.filter(x => x.rating !== null);
      if (rated.length) ds.ratings.overall = +(rated.reduce((s, x) => s + x.rating, 0) / rated.length).toFixed(2);
      ds.respondents = items.length;
      ds.feedback = items.map(x => ({ id: newId('fb'), n: x.n, text: x.text, question: x.question, datasetId: ds.id }));
      return ds;
    });
  }

  function pasteToDataset(text, name, question) {
    const ds = blankDataset(name || 'Teks tempel', 'Tempel teks', 'paste');
    const items = text.split(/\r?\n/).map(s => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
    ds.respondents = items.length;
    ds.feedback = items.map((t, i) => ({ id: newId('fb'), n: i + 1, text: t, question: question || 'pengalaman', datasetId: ds.id }));
    return ds;
  }

  function blankDataset(name, source, kind) {
    return {
      id: newId('ds'), source, kind, name, date: '', respondents: null, participants: null,
      ratings: { overall: null, services: [], serviceTotal: null, recommend: null, instructors: [], instructorAvg: null, total: null },
      feedback: []
    };
  }

  T.Parsers = { pdfToText, parseReportText, readTable, guessColumns, tableToDatasets, pasteToDataset };
})(window.T);
