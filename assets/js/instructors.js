/* Telaah AI: daftar instruktur Inixindo Jogja.
 *
 * code  : kode instruktur (dipakai sebagai label posisi di kartu)
 * name  : nama resmi
 * nicks : panggilan yang mungkin muncul di komentar peserta
 * photo : nama berkas foto di https://inixindojogja.co.id/instructor/
 *
 * Foto dimuat langsung dari situs Inixindo (varian 300×300). Bila gagal dimuat
 * (offline / berkas berubah), kartu otomatis menampilkan inisial.
 * Catatan: YWA ↔ "Wawan" dan YCT ↔ "Arfan" dicocokkan dari nama berkas foto.
 */
window.T = window.T || {};

T.ROSTER = [
  { code: 'AY',  name: 'Andi Yuniantoro',       nicks: ['andi'],              photo: '1-Pak-Andi' },
  { code: 'YMT', name: 'Mustofa',               nicks: ['mustofa', 'tofa'],   photo: '2-Mustofa' },
  { code: 'YAT', name: 'Andrian The',           nicks: ['andrian'],           photo: '16-Andrian' },
  { code: 'YAN', name: 'Andu Sutaryo',          nicks: ['andu'],              photo: '4-Andu' },
  { code: 'YWA', name: 'Arindra Saktiawan',     nicks: ['arindra', 'wawan'],  photo: '8-Wawan' },
  { code: 'YUA', name: 'Umar Affandi',          nicks: ['umar'],              photo: '6-Umar' },
  { code: 'YYH', name: 'Yanuar Hadiyanto',      nicks: ['yanuar'],            photo: '7-Yanuar' },
  { code: 'YCT', name: 'Citra Arfanudin',       nicks: ['citra', 'arfan'],    photo: '3-Arfan' },
  { code: 'YAH', name: 'Arinal Hak',            nicks: ['arinal'],            photo: '10-Arinal' },
  { code: 'YFZ', name: 'Faizal Ramadhan',       nicks: ['faizal'],            photo: '9-Faizal' },
  { code: 'YIF', name: 'Izzan Faikar Ramadhy',  nicks: ['izzan'],             photo: '11-Izzan' },
  { code: 'YDN', name: 'Doni Setyawan',         nicks: ['doni'],              photo: '5-Doni' },
  { code: 'YRZ', name: 'Amru Rizal',            nicks: ['rizal', 'amru'],     photo: '12-Rizal' },
  { code: 'YDF', name: 'Dickyfli Perdana',      nicks: ['dickyfli', 'dicky'], photo: '13-Dicky' },
  { code: 'YST', name: 'Satya Tegar',           nicks: ['satya'],             photo: '14-Satya' },
  { code: 'YAQ', name: 'Ach. Nur Aqil Wahid',   nicks: ['aqil'],              photo: '15-Aqil' }
];

T.ROSTER_PHOTO_BASE = 'https://inixindojogja.co.id/wp-content/uploads/2026/03/';

(function () {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  /** Cocokkan nama dari laporan ke entri daftar (semua kata nama resmi ada di nama laporan, atau kode sama). */
  T.findInstructor = function (reportName) {
    const raw = String(reportName || '').trim();
    const byCode = T.ROSTER.find(r => r.code.toLowerCase() === raw.toLowerCase());
    if (byCode) return byCode;
    const words = new Set(norm(raw));
    const full = T.ROSTER.filter(r => norm(r.name).every(w => words.has(w)));
    if (full.length === 1) return full[0];
    // Cadangan: kata pertama laporan sama dengan salah satu panggilan
    const first = norm(raw)[0];
    const nick = T.ROSTER.filter(r => r.nicks.includes(first));
    return nick.length === 1 ? nick[0] : null;
  };
  T.instructorPhoto = r => (r && r.photo ? `${T.ROSTER_PHOTO_BASE}${r.photo}-300x300.jpg` : null);
})();
