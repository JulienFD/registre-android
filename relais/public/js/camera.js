/* Caméra du téléphone : flux direct si autorisé, sinon l'appareil photo natif via un champ fichier. */
export async function demarrer(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('caméra indisponible');
  const flux = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
  });
  video.srcObject = flux;
  await video.play();
  return { arreter: () => flux.getTracks().forEach((t) => t.stop()) };
}

// Ouvre l'appareil photo natif ; résout avec le fichier, ou null si l'utilisateur annule.
export function choisirFichier(capture) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    if (capture) i.setAttribute('capture', 'environment');
    i.addEventListener('change', () => res(i.files && i.files[0] ? i.files[0] : null), { once: true });
    i.addEventListener('cancel', () => res(null), { once: true });
    i.click();
  });
}
