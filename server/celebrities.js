// Tahmin edilecek ünlü isimler havuzu.
const CELEBRITIES = [
  "Tarkan", "Sezen Aksu", "Barış Manço", "Cem Yılmaz", "Kemal Sunal",
  "Şahan Gökbakar", "Hadise", "Mustafa Sandal", "Ajda Pekkan", "İbrahim Tatlıses",
  "Müslüm Gürses", "Sertab Erener", "Gülşen", "Demet Akalın", "Kenan İmirzalıoğlu",
  "Kıvanç Tatlıtuğ", "Beren Saat", "Çağatay Ulusoy", "Hazal Kaya", "Fahriye Evcen",
  "Burak Özçivit", "Engin Altan Düzyatan", "Haluk Bilginer", "Şener Şen", "Uğur Yücel",
  "Tolga Çevik", "Okan Bayülgen", "Acun Ilıcalı", "Mehmet Ali Erbil", "Beyazıt Öztürk",
  "Ata Demirer", "Yılmaz Erdoğan", "Nejat İşler", "Rıza Kocaoğlu", "Serdar Ortaç",
  "Murat Boz", "Gökhan Özoğuz", "Athena", "maNga", "Teoman",
  "Candan Erçetin", "Yıldız Tilbe", "Bergen", "Zeki Müren", "Orhan Gencebay",
  "Ferdi Tayfur", "Ebru Gündeş", "Nazan Öncel", "Sibel Can", "Burcu Esmersoy",
  "Mustafa Ceceli", "Edis", "Simge", "Aleyna Tilki", "Melike Şahin",
  "Mabel Matiz", "Gripin", "Sagopa Kajmer", "Ceza", "Ezhel",
  "Mesut Özil", "Arda Turan", "Hakan Şükür", "Hakan Çalhanoğlu", "Burak Yılmaz",
  "Arda Güler", "Cengiz Ünder", "Rüştü Reçber", "Nuri Şahin", "Emre Belözoğlu",
  "Fatih Terim", "Mustafa Denizli", "Galatasaray", "Fenerbahçe", "Beşiktaş",
  "Mustafa Kemal Atatürk", "Fatih Sultan Mehmet", "Nasreddin Hoca", "Yunus Emre", "Mevlana",
  "Orhan Pamuk", "Elif Şafak", "Sabahattin Ali", "Nazım Hikmet", "Aziz Nesin",
  "Reşat Nuri Güntekin", "Yaşar Kemal", "Ahmet Hamdi Tanpınar", "Cahit Arf", "Aziz Sancar",
  "Hande Erçel", "Demet Özdemir", "Hazal Subaşı", "Serenay Sarıkaya", "Neslihan Atagül",
  "Tuba Büyüküstün", "Meryem Uzerli", "Özge Gürel", "Burak Deniz", "Can Yaman",
  "Ali Koç", "Mansur Yavaş", "Ekrem İmamoğlu", "Kemal Kılıçdaroğlu", "Devlet Bahçeli",
  "Şenol Güneş", "Ozan Tufan", "Caner Erkin", "Cenk Tosun", "İrfan Can Kahveci",
  "Volkan Demirel", "Alex de Souza", "Didier Drogba", "Wesley Sneijder", "Robin van Persie",
  "Yalçın Çakır", "Fatih Portakal", "Mehmet Barlas", "Cüneyt Özdemir", "Nevşin Mengü",
  "Enver Aysever", "İlker Ayrık", "Hıncal Uluç", "Rasim Ozan Kütahyalı", "Ahmet Hakan",
  "Ozan Dolunay", "Erkan Petekkaya", "İbrahim Çelikkol", "Aras Bulut İynemli", "Çağlar Ertuğrul",
  "Burak Deniz", "Alina Boz", "Afra Saraçoğlu", "Boran Kuzum", "Aybüke Pusat",
  "Şevval Sam", "Funda Arar", "Nükhet Duru", "Sezen Cumhur Önal", "Kayahan",
  "Nilüfer", "Mazhar Alanson", "Fuat Güner", "Özdemir Erdoğan", "Selda Bağcan",
  "Esin Afşar", "Cem Karaca", "Erkin Koray", "Barış Akarsu", "Nazan Öncel",
  "Yavuz Bingöl", "Grup Vitamin", "Volkan Konak", "Sinan Akçıl", "Soner Sarıkabadayı",
  "İzel", "Nil Karaibrahimgil", "Ajda Pekkan", "Nükhet Ruacan", "Göksel",
  "Zuhal Olcay", "Perihan Savaş", "Türkan Şoray", "Kadir İnanır", "Cüneyt Arkın",
  "Şener Şen", "Tarık Akan", "Hülya Koçyiğit", "Fatma Girik", "Ediz Hun",
  "Sadri Alışık", "Adile Naşit", "Münir Özkul", "İlyas Salman", "Perran Kutman",
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeName(s) {
  return (s || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9ğüşöç ]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function isGuessCorrect(guess, answer) {
  const g = normalizeName(guess);
  const a = normalizeName(answer);
  if (!g) return false;
  if (g === a) return true;
  const maxDist = a.length >= 10 ? 2 : a.length >= 5 ? 1 : 0;
  return levenshtein(g, a) <= maxDist;
}

module.exports = { CELEBRITIES, shuffle, normalizeName, isGuessCorrect };
