/* Compression et tampon : même recette que le Registre (1600 px, JPEG q 0,78, bandeau plaque · date · auteur · phase). */
import { tampon } from './pur.mjs';

const COTE_MAX = 1600;
const QUALITE = 0.78;

// source : ImageBitmap, <video> ou <img>. Renvoie un Blob JPEG.
export function compresser(source, o) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const k = Math.min(1, COTE_MAX / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(source, 0, 0, w, h);
  const fs = Math.max(14, Math.round(w / 58));
  x.font = '600 ' + fs + 'px sans-serif';
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, h - fs * 1.9, w, fs * 1.9);
  x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText(tampon(o.plaque, o.ts, o.qui, o.phase), fs * 0.6, h - fs * 0.95);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', QUALITE));
}

// Photo choisie ou prise avec l'appareil du téléphone : orientation EXIF respectée.
export function depuisFichier(fichier) {
  return createImageBitmap(fichier, { imageOrientation: 'from-image' });
}
