/**
 * Bank kalimat untuk berbagai keperluan
 * Bisa ditambah kapan saja
 */

// Default text untuk /highlight
const DEFAULT_HIGHLIGHT_NOTES = [
  "Hasil rapi, clean, dan presisi ✨",
  "Kerja bagus! Detailnya diperhatikan banget 👏",
  "Progress keliatan banget dari waktu ke waktu 🔥",
  "Standar kerja yang diharapkan! 👍",
  "Nah ini, hasil yang memuaskan 💪",
  "Detail kecil bikin hasil jauh lebih bagus!",
  "Konsistensi seperti ini yang kita cari 🎯"
];

// Bank kalimat POSITIVE (untuk reward, progress)
const POSITIVE_MESSAGES = {
  consistent: [
    "🔥 Konsistensi adalah kunci!",
    "👏 Luar biasa, pertahankan!",
    "💪 Ini yang namanya profesional!",
    "🎯 Target konsistensi tercapai!",
    "🌟 Jadi panutan buat yang lain!"
  ],
  improvement: [
    "📈 Progress keliatan banget!",
    "✨ Perbaikannya signifikan!",
    "🚀 Naik level!",
    "💯 Usaha tidak mengkhianati hasil!",
    "🎉 Terus tingkatkan!"
  ],
  active: [
    "⚡ Paling cepat hari ini!",
    "🏃 Semangat paginya luar biasa!",
    "⏰ Disiplin waktu patut dicontoh!",
    "🌟 Pembuka hari yang produktif!",
    "💪 Energi positif untuk tim!"
  ],
  progress_up: [
    "🔥 Perkembangan bagus!",
    "📈 Dari sebelumnya belum konsisten → sekarang lebih stabil",
    "💪 Keep going! Kerja bagus!",
    "🎯 Target improvement tercapai!",
    "🌟 Ini bukti kalau usaha tidak sia-sia!"
  ],
  progress_stable: [
    "👌 Konsisten itu juga progress!",
    "👍 Stabil dan bisa diandalkan!",
    "💪 Pertahankan momentum ini!",
    "🎯 Konsistensi adalah kunci keberhasilan!"
  ]
};

// Bank kalimat EDUKASI (untuk /edukasi, /studycase, /notice)
const EDUKASI_MESSAGES = {
  tips: [
    "Lighting yang baik membuat foto lebih jelas dan profesional.",
    "Pastikan hasil kerja difoto dari sudut yang sama untuk perbandingan yang akurat.",
    "Kebersihan area kerja juga mempengaruhi kualitas hasil foto.",
    "Detail kecil seperti tepian yang rapi bikin hasil beda kelas.",
    "Foto sebelum (before) jangan sampai terlewat, itu penting untuk dokumentasi."
  ],
  studycase: [
    "Beberapa hasil masih kurang rata di bagian tepi. Coba perhatikan tekanan tangan.",
    "Ini cukup sering terjadi, jadi penting banget diperhatikan: waktu pengeringan.",
    "Kesalahan kecil yang sering terjadi: lupa foto before. Biasakan sebelum mulai.",
    "Worth diperhatikan: gunakan alat yang selalu bersih untuk hasil maksimal."
  ],
  notice: [
    "Biar kerjaan lebih rapi & ter-track, pastikan selalu foto before & after ya.",
    "Yuk kita samakan standar biar hasil lebih konsisten di semua outlet.",
    "Timing sangat penting. Usahakan foto after langsung setelah selesai.",
    "Komunikasi dengan customer juga bagian dari quality service."
  ]
};

/**
 * Ambil random message dari array
 */
function getRandomMessage(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Ambil default note untuk highlight
 */
function getDefaultHighlightNote() {
  return getRandomMessage(DEFAULT_HIGHLIGHT_NOTES);
}

/**
 * Ambil positive message berdasarkan tipe
 */
function getPositiveMessage(type) {
  const messages = POSITIVE_MESSAGES[type];
  return getRandomMessage(messages);
}

/**
 * Ambil edukasi message berdasarkan tipe
 */
function getEdukasiMessage(type) {
  const messages = EDUKASI_MESSAGES[type];
  return getRandomMessage(messages);
}

module.exports = {
  getDefaultHighlightNote,
  getPositiveMessage,
  getEdukasiMessage,
  // Export arrays juga kalau mau diakses langsung
  DEFAULT_HIGHLIGHT_NOTES,
  POSITIVE_MESSAGES,
  EDUKASI_MESSAGES
};