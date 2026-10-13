/* Construction du DOM sans innerHTML : tout texte (plaque, légende, compte) est inséré comme texte, jamais comme balisage. */
export function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach((k) => {
    const v = attrs[k];
    if (v === false || v === null || v === undefined) return;
    if (k === 'class') e.className = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  });
  enfants.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
export function monter(racine, ...noeuds) { racine.replaceChildren(...noeuds); }
