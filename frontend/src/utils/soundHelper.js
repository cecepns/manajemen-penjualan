import soundAnteraja from '../assets/sound-scan/ANTERAJA.mpeg';
import soundIdExpress from '../assets/sound-scan/ID-EXPRESS.mpeg';
import soundJtCargo from '../assets/sound-scan/J&T-CARGO.mpeg';
import soundJt from '../assets/sound-scan/J&T.mpeg';
import soundJne from '../assets/sound-scan/JNE.mpeg';
import soundPos from '../assets/sound-scan/POS.mpeg';
import soundSpx from '../assets/sound-scan/SPX.mpeg';

export const COURIER_SOUND_MAP = {
  'ANTERAJA.mpeg': soundAnteraja,
  'ID-EXPRESS.mpeg': soundIdExpress,
  'J&T-CARGO.mpeg': soundJtCargo,
  'J&T.mpeg': soundJt,
  'JNE.mpeg': soundJne,
  'POS.mpeg': soundPos,
  'SPX.mpeg': soundSpx,
};

export const AVAILABLE_SOUNDS = [
  { file: 'SPX.mpeg', label: 'SPX (Shopee Xpress)' },
  { file: 'POS.mpeg', label: 'POS Indonesia' },
  { file: 'ID-EXPRESS.mpeg', label: 'ID Express' },
  { file: 'J&T.mpeg', label: 'J&T Express' },
  { file: 'JNE.mpeg', label: 'JNE Express' },
  { file: 'J&T-CARGO.mpeg', label: 'J&T Cargo' },
  { file: 'ANTERAJA.mpeg', label: 'Anteraja' },
];

let isMuted = false;

export function setScanMuted(muted) {
  isMuted = !!muted;
}

export function getScanMuted() {
  return isMuted;
}

/**
 * Memutar suara audio kurir berdasarkan nama file suara (misal: 'SPX.mpeg').
 * Mengembalikan Promise boolean (true jika berhasil diputar, false jika gagal/di-mute).
 */
export async function playCourierSound(soundFileName) {
  if (isMuted) return false;
  const src = COURIER_SOUND_MAP[soundFileName];
  if (!src) {
    console.warn('File audio scan tidak terdaftar:', soundFileName);
    return false;
  }
  try {
    const audio = new Audio(src);
    audio.preload = 'auto';
    await audio.play();
    return true;
  } catch (err) {
    console.warn('Gagal memutar audio scan (mungkin perlu interaksi user terlebih dahulu):', err);
    return false;
  }
}

/**
 * Deteksi ekspedisi secara lokal berdasarkan prefix kode/resi yang diinput.
 * Prefiks diurutkan berdasarkan panjang karakter terpanjang lebih dulu.
 */
export function matchCourierPrefix(codeOrResi, prefixes = []) {
  if (!codeOrResi || !Array.isArray(prefixes)) return null;
  const target = String(codeOrResi).trim().toUpperCase();
  const sorted = [...prefixes].sort(
    (a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0)
  );
  for (const c of sorted) {
    if (c.is_active === 0 || c.is_active === false) continue;
    const pfx = String(c.prefix || '').trim().toUpperCase();
    if (pfx && target.startsWith(pfx)) {
      return c;
    }
  }
  return null;
}
