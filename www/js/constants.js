export var TYPES = { formation: { l: 'Formation', c: '--t-form' }, parcours: { l: 'Parcours long', c: '--t-parc' }, formateur: { l: 'Presta formateur', c: '--t-pf' }, stagiaire: { l: 'Presta stagiaire', c: '--t-ps' } };
export var FORMATIONS = [
  'C09 : Appliquer des techniques de polissage et de lustrage automobile à la polisseuse orbitale et roto-orbitale',
  'P25 : Polissage et polilustrage',
  'P26 : Detailing complet : lavage, polissage, ponçage et smart repair',
  'M9 : Devenir detailer automobile',
  'E10M9 : Ouvrir son centre de detailing',
  'MC02 : Réaliser un lavage intérieur et extérieur d’un véhicule (esthétisme automobile)',
  'M17 : Nettoyage d’un véhicule à la vapeur',
  'E10M17 : Créer son entreprise de lavage auto',
  'Préparation esthétique : lavage automobile intérieur et extérieur',
  'Nettoyage automobile',
  'M19 : Pose de covering',
  'M19P : Perfectionnement pose de covering',
  'E10M19 : Créer son activité de covering',
  'M20 : Pose de film PPF',
  'M21 : Pose à sec de PPF de couleur',
  'M22 : Pulvérisation de PPF (PPS)',
  'M33 : Pose de PPF sur laqués et film teinté sur optiques de phare',
  'P35 : Maîtrise complète du PPF : pose humide, pose à sec, surfaces complexes',
  'E10M20 : Créer son activité de pose de PPF',
  'M24 : Pose de film teinté solaire automobile',
  'E10M24 : Créer son activité de vitres teintées',
  'P34 : Métiers de la pose de film sur véhicule',
  'M15 : Réparer et teindre le cuir automobile',
  'E10M15 : Créer son activité de rénovation cuir',
  'M36 : Débosselage sans peinture (DSP)',
  'M32 : Réparation d’impacts sur pare-brise et rénovation des optiques',
  'Rénovation des optiques de phares en polycarbonate',
  'M31 : Car staging et valorisation VO',
  'P30 : Retour de leasing et valorisation VO',
  'Detailing, spécialité carrosserie',
  'P29 : Detailing, covering, PPF, cuir et nettoyage vapeur'
];
export var COLS = [['brouillon', 'Entrée en cours'], ['atelier', 'En atelier'], ['controle', 'Contrôle qualité'], ['pret', 'Prête à sortir']];
export var SLOTS = [
    ['avg', 'Avant gauche (3/4)'], ['av', 'Face avant'], ['avd', 'Avant droit (3/4)'], ['d', 'Côté droit'],
    ['ard', 'Arrière droit (3/4)'], ['ar', 'Face arrière'], ['arg', 'Arrière gauche (3/4)'], ['g', 'Côté gauche'],
    ['toit', 'Toit et capot'], ['cpt', 'Compteur : km et voyants'], ['ia', 'Intérieur avant'], ['ir', 'Intérieur arrière et coffre']
].map(function (a) { return { k: a[0], l: a[1] } });
export var SORTIE_REQ = 8;
export var PANELS = [['capot', 'Capot'], ['toit', 'Toit'], ['avg', 'Aile avant gauche'], ['avd', 'Aile avant droite'], ['pavg', 'Porte avant gauche'], ['pavd', 'Porte avant droite'], ['parg', 'Porte arrière gauche'], ['pard', 'Porte arrière droite'], ['arg', 'Aile arrière gauche'], ['ard', 'Aile arrière droite'], ['coffre', 'Coffre ou hayon'], ['pcav', 'Pare-chocs avant'], ['pcar', 'Pare-chocs arrière']];
export var WORKER = 'vendor/pdf.worker.min.js';
export var CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
export var PLAQUE = { fr: { ph: 'Ex. AB-123-CD', max: 9 }, etr: { ph: 'Ex. B-AB 1234', max: 12 } };
export var FL = { plaque: 'Plaque', plaqueType: 'Type de plaque', marque: 'Marque', modele: 'Modèle', couleur: 'Couleur', km: 'Kilométrage', fuel: 'Carburant', cles: 'Clés', objets: 'Objets à bord', type: 'Nature', rattache: 'Formation', debutFormation: 'Début de la formation', resp: 'Responsable', ops: 'À faire', dit: 'Dit au client', dateLimite: 'Date limite', engageValide: 'Engagement validé par', exclu: 'À ne pas faire', sortiePrevue: 'Sortie prévue', recep: 'Réceptionné par', clientNom: 'Client', clientTel: 'Tél. client', clientMail: 'Mail client', copie: 'Copie client', clientAbsent: 'Client absent', mesNotes: 'Notes mesures', remisPar: 'Rendu par', remisA: 'Récupéré par', notesSortie: 'Notes de sortie', opsFaites: 'Travaux confirmés' };
export var CK = [['lavage', 'Découvert après lavage'], ['info', 'Information ou correction'], ['photo', 'Photos complémentaires'], ['client', 'Remarque du client'], ['autre', 'Autre']];
export function ckLabel(k) { return (CK.filter(function (c) { return c[0] === k })[0] || [0, 'Complément'])[1] }
