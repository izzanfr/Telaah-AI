/* Telaah AI: leksikon sentimen Bahasa Indonesia (+ Inggris umum)
 * Bobot -3 … +3. Bentuk dasar & bentuk berimbuhan yang umum ditulis langsung,
 * sisanya ditangani oleh stemmer ringan di nlp.js.
 */
window.T = window.T || {};

T.LEX = {
  positive: {
    baik: 2, bagus: 2, keren: 2.5, mantap: 2.5, oke: 1, puas: 2, memuaskan: 2.5, kepuasan: 1,
    senang: 2, menyenangkan: 2.5, gembira: 2, seru: 2, menarik: 2, tertarik: 1.2,
    bermanfaat: 2.5, manfaat: 1.5, berguna: 2, membantu: 2, terbantu: 2, bantu: 1,
    jelas: 1.5, mudah: 1.5, paham: 1.2, dipahami: 1.2, memahami: 0.8, pemahaman: 0.6,
    mengerti: 1.2, dimengerti: 1.2, informatif: 2, insightful: 2.5, insight: 1.2,
    inspiratif: 2.5, 'luar biasa': 3, hebat: 2.5, kompeten: 2, profesional: 2,
    ramah: 2, sigap: 1.5, sabar: 1.5, interaktif: 1.5, enerjik: 1.5, energik: 1.5,
    komunikatif: 1.5, lengkap: 1.2, nyaman: 2, santai: 0.8, relaxing: 1, rileks: 1,
    asyik: 2, sukses: 1.5, berkesan: 2.5, terbaik: 3, 'the best': 3, best: 3,
    great: 2.5, good: 2, nice: 2, excellent: 3, amazing: 3, awesome: 3, love: 2.5,
    helpful: 2, useful: 2, interesting: 2, fun: 2, clear: 1.5, appreciate: 2,
    thanks: 1.5, thank: 1.5, 'terima kasih': 1.5, berbobot: 2, aplikatif: 2, runtut: 1.5,
    sistematis: 1.5, terstruktur: 1.5, praktis: 1.5, relevan: 1.5, kekinian: 1.2,
    menguasai: 2, cakap: 1.5, mendukung: 1.5, kooperatif: 1.5, responsif: 1.5,
    efektif: 2, efisien: 1.5, produktif: 1.5, recommended: 2.5, suka: 2, cocok: 1.5,
    sesuai: 1, pas: 1, tepat: 1, 'tepat waktu': 1.5, lancar: 1.5, maksimal: 1.5, optimal: 1.5,
    top: 2, juara: 2.5, istimewa: 2.5, sempurna: 3, positif: 1.5, bangga: 2,
    menambah: 0.8, wawasan: 1, ilmu: 0.8, semangat: 1.5, antusias: 1.5, memotivasi: 2,
    motivasi: 1, kondusif: 1.5, bersih: 1.2, enak: 1.8, kece: 2, jos: 2, gokil: 2,
    sip: 1.5, ciamik: 2.5, apik: 2, memukau: 2.5, mengesankan: 2.5, mencerahkan: 2,
    bagusnya: 2, terbaru: 0.8, update: 0.8, detail: 0.8, rinci: 1, solutif: 2,
    bersahabat: 2, hangat: 1.2, akrab: 1.2, fleksibel: 1.2, worth: 2, worthit: 2.5,
    menyegarkan: 1.8, puasss: 2, wow: 2, happy: 2, satisfied: 2, recommend: 2
  },
  negative: {
    buruk: -2.5, jelek: -2.5, lambat: -1.5, lama: -0.6, membosankan: -2.5, bosan: -2,
    sulit: -1.5, susah: -1.5, rumit: -1.5, bingung: -1.8, membingungkan: -2, ribet: -1.5,
    masalah: -1.8, permasalahan: -1.8, bermasalah: -2, kendala: -1.5, terkendala: -1.5,
    error: -1.8, gagal: -2, kecewa: -2.5, mengecewakan: -2.5, kesal: -2, kacau: -2.5,
    telat: -1.8, terlambat: -1.8, molor: -1.8, mahal: -1.2, sempit: -1.2, panas: -1,
    berisik: -1.5, lelet: -1.8, lemot: -1.8, kehabisan: -1.5, habis: -0.8,
    terbatas: -1, keterbatasan: -1, singkat: -0.5, capek: -1.5, lelah: -1.5,
    ngantuk: -1.5, mengantuk: -1.5, monoton: -1.5, kaku: -1.2, bad: -2.5, poor: -2.5,
    boring: -2.5, slow: -1.5, confusing: -2, difficult: -1.5, problem: -1.8, issue: -1.2,
    disappointed: -2.5, worst: -3, perbaiki: -0.3, diperbaiki: -0.3, memperbaiki: -0.3,
    pusing: -1.8, tertinggal: -1, ketinggalan: -1, rusak: -2, mati: -1, putus: -1,
    kotor: -1.8, bau: -1.5, gerah: -1.2, cepat: 0, terburu: -1.5, buru: -1,
    kurang: -1.2, minim: -1.2, kecil: -0.4, sayang: -0.6, sayangnya: -1, sia: -1.5,
    percuma: -2, rugi: -2, keluhan: -1.5, komplain: -1.5, mengeluh: -1.5, lag: -1.5,
    ngelag: -1.5, delay: -1.5, tertunda: -1.2, ditunda: -1, berantakan: -2, asal: -0.8
  },
  // Kata yang memulai klausa baru (untuk deteksi Campuran & sentimen per aspek)
  clauseBreakers: ['tapi', 'tetapi', 'namun', 'sayangnya', 'cuma', 'hanya saja', 'kendala', 'kendalanya',
    'kekurangan', 'kekurangannya', 'sedangkan', 'padahal', 'meskipun', 'walaupun', 'walau', 'meski', 'sementara',
    'but', 'however', 'although', 'though'],

  // Isu berulang yang dikenali dengan pola (nama bawaan bisa diganti pengguna). Diuji pada klausa negatif.
  issuePatterns: [
    { id: 'ujian-belum-diajarkan', name: 'Materi ujian belum diajarkan', re: '(diuji|diujikan|ujian|soal|asesmen|assessment|sertifikasi|uji kompetensi)[^.]*\\b(belum|tidak|tdk|blm)\\s+(semua\\s+)?(diajarkan|dibahas|disampaikan|dijelaskan|diberikan)|(belum|tidak|tdk|blm)\\s+(diajarkan|dibahas|disampaikan|dijelaskan)[^.]*(diuji|diujikan|ujian|soal|asesmen)' },
    { id: 'materi-tak-sesuai-uji', name: 'Materi tidak sesuai kompetensi yang diujikan', re: '(belum|tidak|tdk|kurang)\\s+sesuai[^.]*(kompetensi|diujikan|ujian|uji|skema)' },
    { id: 'audio', name: 'Gangguan audio/suara', re: '\\b(suara|audio|mic|mik|mikrofon|sound|speaker|volume)\\b[^.]*\\b(putus|mati|macet|kecil|pelan|kresek|echo|gema|terputus|tidak terdengar|kurang terdengar|kurang jelas|tidak jelas|hilang|delay)|\\b(tidak|kurang)\\s+terdengar' },
    { id: 'koneksi', name: 'Koneksi / platform bermasalah', re: '\\b(koneksi|internet|wifi|sinyal|jaringan|zoom|gmeet|meet|platform|server|link|streaming)\\b[^.]*\\b(putus|lemot|lambat|lelet|error|down|terputus|gangguan|bermasalah|lag|ngelag|susah|sulit|tidak stabil)' },
    { id: 'waktu-kurang', name: 'Waktu pelatihan kurang', re: '\\b(waktu|durasi|jam|hari|sesi)\\b[^.]*\\b(kurang|singkat|terbatas|mepet|sedikit)|terlalu (cepat|singkat|padat)|terburu' },
    { id: 'praktik-kurang', name: 'Porsi praktik kurang', re: '\\b(praktik|praktek|hands.on|latihan)\\b[^.]*\\b(kurang|sedikit|minim|terbatas)|(kurang|minim)\\s+(praktik|praktek|latihan)' },
    { id: 'ruangan', name: 'Kenyamanan ruangan', re: '\\b(ruang|ruangan|ac|kelas|tempat)\\b[^.]*\\b(dingin|panas|gerah|sempit|berisik|bau|kotor)' },
    { id: 'modul', name: 'Modul/materi belum dibagikan', re: '\\b(modul|materi|slide|file|rekaman)\\b[^.]*\\b(belum|tidak)\\s+(dibagikan|dikirim|diberikan|dishare|ada)' },
    { id: 'konsumsi', name: 'Konsumsi kurang memuaskan', re: '\\b(konsumsi|makan|makanan|snack|coffee|kopi)\\b[^.]*\\b(kurang|tidak enak|telat|sedikit|dingin|habis)' }
  ],

  // Frasa multi-kata digabung sebelum skoring
  phrases: ['luar biasa', 'terima kasih', 'tepat waktu', 'the best', 'worth it', 'hanya saja'],
  negators: ['tidak', 'tak', 'bukan', 'belum', 'jangan', 'tanpa', 'no', 'not', 'never', 'nor', 'dont', 'isnt', 'wasnt'],
  intensifiers: {
    sangat: 1.5, amat: 1.4, sungguh: 1.4, benar: 1.2, paling: 1.5, super: 1.5,
    very: 1.5, really: 1.3, so: 1.2, terlalu: 1.3, begitu: 1.2, makin: 1.1, semakin: 1.1,
    lebih: 1.1, sangatlah: 1.5, extremely: 1.6, pretty: 1.1, totally: 1.4
  },
  postIntensifiers: { banget: 1.4, sekali: 1.3, abis: 1.3, pol: 1.4, parah: 1.3 },
  dampeners: { cukup: 0.7, lumayan: 0.7, agak: 0.6, sedikit: 0.6, rather: 0.7, quite: 0.8, somewhat: 0.6 },
  suggestion: [
    'semoga', 'sebaiknya', 'saran', 'mohon', 'tolong', 'harap', 'diharapkan', 'harapan', 'perlu',
    'supaya', 'agar', 'perbaiki', 'diperbaiki', 'memperbaiki', 'ditingkatkan', 'tingkatkan',
    'ditambah', 'ditambahkan', 'tambahkan', 'seharusnya', 'hendaknya', 'usul', 'usulan', 'sarankan',
    'disarankan', 'should', 'please', 'suggest', 'suggestion', 'improve'
  ],
  emoticons: { positive: [':)', ':-)', ':d', '=)', ':]', '😊', '😁', '😀', '👍', '🙏', '❤', '🔥', '👏', '🥰', '😍'], negative: [':(', ':-(', '=(', '😞', '😡', '👎', '😢', '😠'] },

  slang: {
    bgt: 'banget', bngt: 'banget', bangett: 'banget', sgt: 'sangat', sngt: 'sangat',
    yg: 'yang', dgn: 'dengan', dg: 'dengan', tp: 'tapi', tpi: 'tapi', utk: 'untuk', untk: 'untuk',
    krn: 'karena', karna: 'karena', gk: 'tidak', ga: 'tidak', gak: 'tidak', nggak: 'tidak',
    ngga: 'tidak', enggak: 'tidak', engga: 'tidak', tdk: 'tidak', kagak: 'tidak', blm: 'belum',
    sdh: 'sudah', udah: 'sudah', udh: 'sudah', jg: 'juga', bs: 'bisa', dr: 'dari', pd: 'pada',
    kren: 'keren', krenn: 'keren', mantul: 'mantap', mantab: 'mantap', mantep: 'mantap',
    ok: 'oke', okay: 'oke', okey: 'oke', okee: 'oke', okelah: 'oke', apalgi: 'apalagi',
    pemahanan: 'pemahaman', adallah: 'adalah', bener: 'benar', bnr: 'benar', thx: 'thanks',
    makasih: 'terima kasih', makasi: 'terima kasih', mksh: 'terima kasih', trims: 'terima kasih',
    tq: 'terima kasih', seneng: 'senang', asik: 'asyik', byk: 'banyak', bnyk: 'banyak',
    lbh: 'lebih', org: 'orang', sy: 'saya', aq: 'aku', kalo: 'kalau', klo: 'kalau', gmn: 'bagaimana',
    abiss: 'abis', abisss: 'abis', bagu: 'bagus', bgs: 'bagus', baguss: 'bagus', gud: 'good',
    nice: 'nice', mkn: 'makin', smakin: 'semakin', dpt: 'dapat', sm: 'sama', aja: 'saja',
    ajah: 'saja', emg: 'memang', emang: 'memang', bikin: 'membuat', gampang: 'mudah',
    susa: 'susah', jelass: 'jelas', rekomen: 'recommended', rekomended: 'recommended',
    josss: 'jos', joss: 'jos', sipp: 'sip', sippp: 'sip', mager: 'malas', bete: 'bosan',
    bosen: 'bosan', eror: 'error', lemott: 'lemot', pelaksaaan: 'pelaksanaan', energik: 'enerjik',
    worthit: 'worth it'
  },

  stopwords: `yang dan di ke dari untuk dengan pada dalam ini itu adalah ialah akan juga atau karena sehingga
    serta saya aku kami kita kamu anda mereka dia ia beliau nya lah pun sih deh dong kok ya yuk nih tuh lagi
    sudah telah masih bisa dapat ada sebagai oleh bagi tentang terkait hingga sampai secara para setiap tiap
    semua seluruh banyak beberapa lebih sangat sekali banget tetap namun tetapi tapi jika kalau agar supaya
    maka bahwa apa siapa bagaimana kenapa mengapa dimana kapan mana hal jadi buat sama saat ketika selama kali
    per sebelum sesudah setelah sedang sambil bahkan hanya cuma saja lalu kemudian begitu demikian tersebut
    antara atas bawah luar sini situ sana yaitu yakni seperti apakah pula lain lainnya sendiri the a an and or
    of to in for is it this that with on at be are was were very so just as by from mas mbak pak bu bapak ibu
    kalian berdua orang depan kedepannya depannya abis memang terus nanti kan si sang punya harus mau ingin
    merasa rasa membuat dibuat menjadi kami kamu kita apalagi juga oleh untuk utk pula mungkin hari selalu
    amat benar paling super makin semakin cukup lumayan agak sedikit terlalu my me i we you your our they
    was been has have had do does did can will would could not no jadi toh gitu gini dll dsb dst`.split(/\s+/).filter(Boolean),

  // Stopword bawaan domain, tampil sebagai chip yang bisa dihapus pengguna
  domainStopwords: ['pelatihan', 'training', 'inixindo', 'jogja', 'kelas', 'peserta'],

  shortAllowed: ['ai', 'ui', 'ux', 'it', 'bi', 'ml', 'ok'],

  aspects: [
    { id: 'materi', label: 'Materi & Konten', icon: 'book-open',
      keys: ['materi', 'bahasan', 'modul', 'topik', 'konten', 'kurikulum', 'silabus', 'insight', 'insightful', 'ilmu',
        'pengetahuan', 'wawasan', 'berbobot', 'runtut', 'aplikatif', 'contoh', 'praktik', 'praktek', 'latihan',
        'prompt', 'teknik', 'studi', 'kasus', 'slide', 'handout', 'kekinian', 'terbaru'] },
    { id: 'instruktur', label: 'Instruktur', icon: 'presentation',
      keys: ['instruktur', 'pengajar', 'pemateri', 'trainer', 'narasumber', 'fasilitator', 'mentor', 'menguasai',
        'kompeten', 'penjelasan', 'menjelaskan', 'pemaparan', 'interaktif', 'enerjik', 'komunikatif', 'master',
        'mengajar', 'ajar', 'guru', 'coach', 'speaker'] },
    { id: 'layanan', label: 'Layanan & Staf', icon: 'hand-helping',
      keys: ['pelayanan', 'layanan', 'driver', 'admin', 'panitia', 'staf', 'staff', 'pendaftaran', 'registrasi',
        'kooperatif', 'ramah', 'sigap', 'sabar', 'penjemputan', 'jemput', 'cs', 'service', 'respons', 'responsif'] },
    { id: 'waktu', label: 'Waktu & Jadwal', icon: 'clock',
      keys: ['waktu', 'jadwal', 'durasi', 'jam', 'tepat waktu', 'telat', 'terlambat', 'molor', 'singkat', 'padat',
        'lama', 'cepat', 'terburu', 'delay', 'tertunda'] },
    { id: 'manfaat', label: 'Manfaat Kerja', icon: 'briefcase',
      keys: ['pekerjaan', 'kerja', 'tugas', 'produktivitas', 'produktif', 'diaplikasikan', 'aplikasikan',
        'diterapkan', 'terapkan', 'menerapkan', 'bermanfaat', 'manfaat', 'berguna', 'membantu', 'relevan', 'skill',
        'keterampilan', 'karir', 'karier', 'kantor', 'bisnis'] },
    { id: 'suasana', label: 'Suasana Belajar', icon: 'sparkles',
      keys: ['suasana', 'seru', 'santai', 'relaxing', 'menyenangkan', 'menarik', 'asyik', 'fun', 'serius', 'kondusif',
        'nyaman', 'membosankan', 'bosan', 'monoton', 'ngantuk', 'berkesan', 'rileks', 'relaks'] },
    { id: 'teknis', label: 'Teknis/Fasilitas', icon: 'plug',
      keys: ['fasilitas', 'ruang', 'ruangan', 'tempat', 'lokasi', 'gedung', 'ac', 'konsumsi', 'makan', 'makanan',
        'snack', 'kopi', 'hotel', 'kamar', 'kursi', 'meja', 'parkir', 'toilet', 'proyektor', 'layar', 'lampu',
        'suara', 'audio', 'mic', 'mik', 'mikrofon', 'microphone', 'speaker', 'sound', 'headset', 'volume', 'echo',
        'koneksi', 'internet', 'wifi', 'sinyal', 'jaringan', 'zoom', 'gmeet', 'meet', 'teams', 'platform', 'lms',
        'link', 'server', 'video', 'kamera', 'streaming', 'token', 'berlangganan', 'langganan', 'akun', 'lisensi',
        'software', 'aplikasi', 'website', 'web', 'tools', 'tool', 'laptop', 'komputer', 'pc', 'error', 'login',
        'genai', 'chatgpt', 'gemini', 'claude', 'copilot'] }
  ]
};
