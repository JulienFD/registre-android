export var TYPES = { formation: { l: 'Formation', c: '--t-form' }, parcours: { l: 'Parcours long', c: '--t-parc' }, formateur: { l: 'Presta formateur', c: '--t-pf' }, stagiaire: { l: 'Presta stagiaire', c: '--t-ps' } };
export var COLS = [['brouillon', 'Entrée en cours'], ['atelier', 'En atelier'], ['controle', 'Contrôle qualité'], ['pret', 'Prête à sortir']];
export var SLOTS = [
    ['avg', 'Avant gauche (3/4)'], ['av', 'Face avant'], ['avd', 'Avant droit (3/4)'], ['d', 'Côté droit'],
    ['ard', 'Arrière droit (3/4)'], ['ar', 'Face arrière'], ['arg', 'Arrière gauche (3/4)'], ['g', 'Côté gauche'],
    ['toit', 'Toit et capot'], ['cpt', 'Compteur : km et voyants'], ['ia', 'Intérieur avant'], ['ir', 'Intérieur arrière et coffre']
].map(function (a) { return { k: a[0], l: a[1] } });
export var SORTIE_REQ = 8;
export var CHECK = [
    ['avant', 'Avant : pare-chocs, calandre, optiques'], ['capot', 'Capot et ailes avant'],
    ['gauche', 'Côté gauche : portières, bas de caisse'], ['droit', 'Côté droit : portières, bas de caisse'],
    ['arriere', 'Arrière : pare-chocs, hayon ou coffre, feux'], ['toit', 'Toit'],
    ['vitres', 'Pare-brise, vitres, rétroviseurs'], ['jantes', 'Jantes, enjoliveurs et pneus'],
    ['peinture', 'Peinture et vernis : état général'], ['sieges', 'Sièges et garnitures'],
    ['tableau', 'Tableau de bord, console, ciel de toit'], ['tapis', 'Tapis et moquettes'],
    ['voyants', 'Voyants allumés au tableau de bord'], ['papiers', 'Papiers et accessoires à bord']
].map(function (a) { return { k: a[0], l: a[1] } });
export var PANELS = [['capot', 'Capot'], ['toit', 'Toit'], ['avg', 'Aile avant gauche'], ['avd', 'Aile avant droite'], ['pavg', 'Porte avant gauche'], ['pavd', 'Porte avant droite'], ['parg', 'Porte arrière gauche'], ['pard', 'Porte arrière droite'], ['arg', 'Aile arrière gauche'], ['ard', 'Aile arrière droite'], ['coffre', 'Coffre ou hayon'], ['pcav', 'Pare-chocs avant'], ['pcar', 'Pare-chocs arrière']];
export var WORKER = 'vendor/pdf.worker.min.js';
export var DMG = [['rayure', 'Rayure', '#d9480f'], ['impact', 'Impact / bosse', '#b3261e'], ['eclat', 'Éclat', '#7048e8'], ['rouille', 'Rouille / corrosion', '#8d5524'], ['usure', 'Usure / salissure', '#495057'], ['autre', 'Autre', '#0b7285']];
export var VIEWS = {
    top: { w: 200, h: 400, lab: 'Dessus', sh: [['b', 'r', 30, 10, 140, 380, 56], ['g', 'r', 48, 105, 104, 52, 12], ['g', 'r', 54, 282, 92, 44, 10], ['g', 'r', 52, 160, 96, 120, 14], ['w', 'r', 12, 66, 22, 52, 7], ['w', 'r', 166, 66, 22, 52, 7], ['w', 'r', 12, 286, 22, 52, 7], ['w', 'r', 166, 286, 22, 52, 7], ['w', 'r', 6, 128, 24, 14, 5], ['w', 'r', 170, 128, 24, 14, 5]] },
    left: { w: 400, h: 170, lab: 'Côté gauche', sh: [['b', 'r', 12, 66, 376, 66, 26], ['b', 'r', 96, 22, 190, 52, 22], ['g', 'r', 112, 32, 70, 34, 10], ['g', 'r', 196, 32, 76, 34, 10], ['w', 'c', 100, 134, 28], ['w', 'c', 300, 134, 28]] }
};
VIEWS.right = { w: 400, h: 170, lab: 'Côté droit', sh: VIEWS.left.sh.map(function (s) { return s[1] === 'r' ? [s[0], 'r', 400 - s[2] - s[4], s[3], s[4], s[5], s[6]] : [s[0], 'c', 400 - s[2], s[3], s[4]] }) };
export var CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
export var PLAQUE = { fr: { ph: 'Ex. AB-123-CD', max: 9 }, etr: { ph: 'Ex. B-AB 1234', max: 12 } };
export var FL = { plaque: 'Plaque', plaqueType: 'Type de plaque', marque: 'Marque', modele: 'Modèle', couleur: 'Couleur', km: 'Kilométrage', fuel: 'Carburant', cles: 'Clés', objets: 'Objets à bord', type: 'Nature', rattache: 'Rattaché à', resp: 'Responsable', ops: 'À faire', dit: 'Dit au client', dateLimite: 'Date limite', engageValide: 'Engagement validé par', exclu: 'À ne pas faire', sortiePrevue: 'Sortie prévue', recep: 'Réceptionné par', clientNom: 'Client', clientTel: 'Tél. client', clientMail: 'Mail client', copie: 'Copie client', clientAbsent: 'Client absent', mesNotes: 'Notes mesures', remisPar: 'Rendu par', remisA: 'Récupéré par', notesSortie: 'Notes de sortie', opsFaites: 'Travaux confirmés' };
export var CK = [['lavage', 'Découvert après lavage'], ['info', 'Information ou correction'], ['photo', 'Photos complémentaires'], ['client', 'Remarque du client'], ['autre', 'Autre']];
export function ckLabel(k) { return (CK.filter(function (c) { return c[0] === k })[0] || [0, 'Complément'])[1] }
