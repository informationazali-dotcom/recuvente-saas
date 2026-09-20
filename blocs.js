// ============================================================================
// PRODUCT PAGE BUILDER — cœur "pur" (aucun JSX, aucune dépendance React/Supabase)
// ----------------------------------------------------------------------------
// Ce fichier contient TOUT ce qui décrit une page produit :
//   • le registre des blocs (types, valeurs par défaut, champs éditables) ;
//   • les 3 templates de départ (COD Conversion / Premium / Storytelling) ;
//   • la normalisation d'une configuration (JSON) venant de la base ;
//   • la connexion au système existant de RecuVente (bundles, complément "bump",
//     zone de livraison) — le Builder N'A PAS son propre système de commande ;
//   • l'"AI Page Architect" (proposition de structure, sans jamais inventer de
//     preuve, d'avis, de chiffre ou de prix).
//
// Ajouter un bloc = ajouter UNE entrée dans REGISTRE_BLOCS (+ son rendu dans
// PageProduitRenderer.jsx). Ajouter un template = ajouter UNE entrée dans TEMPLATES.
// ============================================================================

export const VERSION_CONFIG = 1;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

export function idAleatoire(prefixe = "b") {
  return `${prefixe}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// Version allégée d'une photo pour l'affichage. Les produits importés depuis Shopify gardent
// l'adresse d'origine (cdn.shopify.com) : ce sont des originaux de plusieurs Mo, alors qu'une
// carte produit en affiche 200 px. Le CDN de Shopify fournit la bonne taille si on la lui
// demande (`width=`), sans rien changer à la photo stockée. Toute autre adresse est renvoyée
// telle quelle — aucun risque de casser une image.
export function urlImageLegere(url, largeur = 600) {
  if (!url || typeof url !== "string") return url;
  try {
    const u = new URL(url);
    if (u.hostname !== "cdn.shopify.com") return url;
    if (u.searchParams.has("width") || u.searchParams.has("height")) return url;
    u.searchParams.set("width", String(Math.round(largeur)));
    return u.toString();
  } catch (_) {
    return url;
  }
}

// Même règle d'affichage que CataloguePublic.formaterDevise : XOF/XAF → "F CFA".
export function libelleDevise(code) {
  return code === "XOF" || code === "XAF" ? "F CFA" : code || "";
}

// ===== BOUTIQUE MULTI-PAYS : AFFICHAGE DANS LA MONNAIE DU CLIENT =====
// Les prix restent enregistrés dans la devise de la boutique (base de données, commandes, statistiques :
// rien ne change). Seul l'AFFICHAGE peut être converti pour un client d'un autre pays, avec le taux
// saisi par le commerçant (Réglages → Pays de livraison). Une seule variable module « MONNAIE »
// est réglée par la boutique publique ; hors boutique (tableau de bord, éditeurs) elle vaut null :
// aucun changement de comportement.
let MONNAIE = null; // { devise, libelle, taux, decimales } ou null

export function definirMonnaieAffichage(m) { MONNAIE = m && m.taux > 0 ? m : null; }
export function monnaieAffichage() { return MONNAIE; }

// Devise habituelle de chaque pays (modifiable par le commerçant). XOF et XAF ont la même parité (1 = 1).
export const DEVISE_PAR_DEFAUT_PAYS = { CI: "XOF", SN: "XOF", ML: "XOF", BF: "XOF", TG: "XOF", BJ: "XOF", GN: "GNF", CM: "XAF", GA: "XAF", CD: "CDF", MA: "MAD", DZ: "DZD", TN: "TND", GH: "GHS", NG: "NGN", FR: "EUR" };
export const DEVISES_PROPOSEES = ["XOF", "XAF", "GNF", "CDF", "MAD", "DZD", "TND", "GHS", "NGN", "EUR", "USD"];
const DECIMALES_DEVISE = { EUR: 2, USD: 2, GHS: 2, MAD: 2, TND: 2 };

// Monnaie d'affichage pour un pays : null = on garde la devise de la boutique (aucune conversion).
// `devisesPays` = { GN: { devise: "GNF", taux1000: 15000 } } où taux1000 = montant local pour 1 000 de la devise de base.
// Parités FIXES par la loi (1 euro = 655,957 F CFA, pour le XOF comme pour le XAF) : aucun taux à saisir.
const PARITE_EURO_CFA = 655.957;
export function tauxFixe(devise, base) {
  const a = String(devise || "").toUpperCase(), b = String(base || "").toUpperCase();
  const cfa = (x) => x === "XOF" || x === "XAF";
  if (cfa(a) && cfa(b)) return 1;
  if (a === "EUR" && cfa(b)) return 1 / PARITE_EURO_CFA;
  if (cfa(a) && b === "EUR") return PARITE_EURO_CFA;
  return 0;
}
// Taux pour 1 unité de la devise de la boutique : 1) taux saisi par le commerçant, 2) parité fixe (euro/F CFA),
// 3) taux du jour (tauxAuto = { EUR: 0.0015, … } reçu du serveur). Sinon : on affiche la devise de la boutique.
export function monnaieDuPays(devisesPays, deviseBase, codePays, tauxAuto) {
  const base = String(deviseBase || "").toUpperCase();
  const reglage = (devisesPays && devisesPays[codePays]) || {};
  const devise = String(reglage.devise || DEVISE_PAR_DEFAUT_PAYS[codePays] || "").toUpperCase();
  if (!devise || !base || devise === base) return null;
  let taux = Number(reglage.taux1000) > 0 ? Number(reglage.taux1000) / 1000 : 0;
  let auto = false;
  if (!taux) { taux = tauxFixe(devise, base); auto = taux > 0; }
  if (!taux && tauxAuto && Number(tauxAuto[devise]) > 0) { taux = Number(tauxAuto[devise]); auto = true; }
  if (!taux) return null; // aucun taux connu : on n'invente rien, on affiche la devise de la boutique
  return { devise, libelle: libelleDevise(devise), taux, auto, decimales: DECIMALES_DEVISE[devise] ?? 0 };
}

// Nombre déjà converti et arrondi, formaté à la française (utilisé à la place de .toLocaleString("fr-FR")).
export function montantAffiche(n) {
  const v = Number(n);
  if (!MONNAIE) return v.toLocaleString("fr-FR");
  if (!Number.isFinite(v)) return String(v);
  const f = 10 ** MONNAIE.decimales;
  return (Math.round(v * MONNAIE.taux * f) / f).toLocaleString("fr-FR", { maximumFractionDigits: MONNAIE.decimales });
}

export function formaterMontant(n, devise) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  if (MONNAIE) return `${montantAffiche(v)} ${MONNAIE.libelle}`.trim();
  return `${Math.round(v).toLocaleString("fr-FR")} ${devise || ""}`.trim();
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 0.2;
  const n = parseInt(m[1], 16);
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

// Texte lisible posé sur un fond de la couleur choisie (jamais de texte invisible).
export function couleurTextePourFond(hexFond) {
  return luminance(hexFond) > 0.6 ? "#16231F" : "#ffffff";
}

export function couleurValide(hex, secours = "#1a7a3c") {
  return /^#[0-9a-f]{6}$/i.test(String(hex || "").trim()) ? String(hex).trim() : secours;
}

// Convertit une URL vidéo (YouTube / Vimeo / fichier direct) en description de lecture.
export function analyserVideo(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}`, poster: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vim = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return { type: "iframe", src: `https://player.vimeo.com/video/${vim[1]}`, poster: null };
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(u) && /^https?:\/\//i.test(u)) return { type: "fichier", src: u, poster: null };
  return null;
}

export function textePlat(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Description du produit : UNE seule logique, partagée par l'éditeur (aperçu) et la page
// publique, pour que ce que le marchand voit dans l'éditeur soit exactement ce que voit le client.
// • nettoyerHtmlDescription : même assainissement que la fiche historique (CataloguePublic).
// • structureDescriptionProduit : sépare les « points forts » (liste à puces courte, affichée en
//   cases à cocher sous le titre) du reste de la description (texte, images, vidéo).
// ---------------------------------------------------------------------------

export function nettoyerHtmlDescription(html) {
  if (!html || typeof document === "undefined") return "";
  const div = document.createElement("div");
  div.innerHTML = String(html);
  ["script", "iframe", "object", "embed", "link", "style", "meta", "base", "form"].forEach((tag) => {
    div.querySelectorAll(tag).forEach((el) => el.remove());
  });
  div.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const nom = attr.name.toLowerCase();
      const valeur = attr.value.trim().toLowerCase();
      if (nom.startsWith("on")) el.removeAttribute(attr.name);
      else if ((nom === "href" || nom === "src") && (valeur.startsWith("javascript:") || valeur.startsWith("data:text/html"))) el.removeAttribute(attr.name);
    });
  });
  return div.innerHTML;
}

export function descriptionAUnContenu(html) {
  if (!html) return false;
  return /<(img|video)\b/i.test(html) || String(html).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

export function structureDescriptionProduit(html) {
  const propre = nettoyerHtmlDescription(html);
  if (!propre) return { points: [], reste: "" };
  const conteneur = document.createElement("div");
  conteneur.innerHTML = propre;
  const texteLi = (li) => (li.textContent || "").replace(/\s+/g, " ").trim();
  const itemsDe = (l) => Array.from(l.children).filter((c) => c.tagName === "LI");
  const listes = Array.from(conteneur.querySelectorAll("ul, ol"));
  let choisie = listes.find((l) => l.getAttribute("data-rv") === "points-forts");
  if (!choisie) {
    choisie = listes.find((l) => {
      if (l.parentElement && l.parentElement.closest("li")) return false; // pas de sous-liste
      const items = itemsDe(l);
      if (items.length < 2 || items.length > 8) return false;
      return items.every((li) => { const tx = texteLi(li); return tx.length > 0 && tx.length <= 160; });
    });
  }
  if (!choisie) return { points: [], reste: propre };
  const points = itemsDe(choisie)
    .map((li) => texteLi(li).replace(/^[\s✔✓✅☑️•·\-–]+/u, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (points.length === 0) return { points: [], reste: propre };
  // On retire la liste choisie, et le conteneur qui ne contiendrait plus qu'elle.
  let parent = choisie.parentElement;
  choisie.remove();
  while (parent && parent !== conteneur && !parent.textContent.trim() && !parent.querySelector("img,video")) {
    const suivant = parent.parentElement;
    parent.remove();
    parent = suivant;
  }
  return { points, reste: conteneur.innerHTML };
}

// Points forts pour l'aperçu de l'éditeur ET la page publique.
export function extrairePointsDescription(html) {
  if (!html || typeof document === "undefined") return [];
  return structureDescriptionProduit(html).points;
}

// ---------------------------------------------------------------------------
// Offres : miroir EXACT de prixUnitairePourBundle (CataloguePublic.jsx).
// Les offres du Builder sont converties en "bundles" du système existant : c'est le
// même moteur de prix / de commande qui s'applique, aucun doublon de logique.
// ---------------------------------------------------------------------------

export function prixUnitairePourBundle(prixVente, bundle) {
  if (!bundle) return Number(prixVente);
  if ((bundle.mode || "pourcentage") === "prix_fixe") {
    const total = Number(bundle.prix_fixe);
    return total > 0 && bundle.qty > 0 ? total / bundle.qty : Number(prixVente);
  }
  if (bundle.mode === "offert") {
    const nbOfferts = Math.min(Number(bundle.nb_offerts) || 0, bundle.qty - 1);
    return bundle.qty > 0 ? (Number(prixVente) * (bundle.qty - nbOfferts)) / bundle.qty : Number(prixVente);
  }
  return Number(prixVente) * (1 - (Number(bundle.discount) || 0) / 100);
}

export function convertirOffreEnBundle(offre) {
  const qty = Math.max(1, Math.floor(Number(offre.qty) || 1));
  const total = Number(offre.prix_total);
  const base = { id: String(offre.id), qty, label: offre.label || (qty === 1 ? "1 produit" : `${qty} produits`), badge: offre.badge || undefined };
  if (Number.isFinite(total) && total > 0) return { ...base, mode: "prix_fixe", prix_fixe: total, discount: 0 };
  return { ...base, mode: "pourcentage", discount: Math.min(90, Math.max(0, Number(offre.reduction_pct) || 0)) };
}

// Liste d'offres prête à afficher (prix calculés, économie réelle uniquement).
// • Si le bloc "Offres" contient des offres → elles sont utilisées.
// • Sinon → on reprend les bundles déjà configurés sur le produit (aucun doublon).
export function calculerOffresAffichees(produit, blocOffres) {
  const prixVente = Number(produit?.prix_vente) || 0;
  const prixBarre = Number(produit?.prix_barre);
  const prixReference = Number.isFinite(prixBarre) && prixBarre > prixVente ? prixBarre : prixVente;
  const propres = Array.isArray(blocOffres?.props?.offres) ? blocOffres.props.offres.filter((o) => o && o.id) : [];
  const source = propres.length > 0 ? "builder" : "produit";
  const brutes = propres.length > 0
    ? propres
    : (Array.isArray(produit?.bundles) ? produit.bundles : []).map((b) => ({ ...b, __bundle: true }));
  const liste = brutes.map((o) => {
    const bundle = o.__bundle ? o : convertirOffreEnBundle(o);
    const qty = bundle.qty;
    const total = prixUnitairePourBundle(prixVente, bundle) * qty;
    let ancien = Number(o.ancien_prix_total);
    if (!(Number.isFinite(ancien) && ancien > 0)) ancien = prixReference * qty;
    const economie = ancien > total ? Math.round(ancien - total) : 0;
    return {
      id: String(bundle.id),
      label: bundle.label,
      qty,
      total: Math.round(total),
      parUnite: qty > 1 ? Math.round(total / qty) : null,
      pctEco: ancien > total && ancien > 0 ? Math.round((1 - total / ancien) * 100) : 0,
      ancienTotal: economie > 0 ? Math.round(ancien) : null,
      economie,
      cadeau: o.cadeau || "",
      badge: o.badge || (bundle.mode === "offert" && bundle.nb_offerts ? `🎁 ${bundle.nb_offerts} offert${bundle.nb_offerts > 1 ? "s" : ""}` : ""),
      texte: o.texte || "",
      couleurFond: bundle.couleur_fond || null,
    };
  });
  return { source, liste };
}

// Packs prêts à l'emploi : 1 / 2 / 3 produits. Le commerçant choisit ses remises (modifiables
// ensuite) ; l'économie affichée est calculée sur le vrai prix du produit, jamais inventée.
export function packsRapides(pcts = [0, 10, 15]) {
  const noms = ["1 produit", "2 produits", "3 produits"];
  const badges = ["", "Le plus populaire", "Meilleur prix"];
  return [1, 2, 3].map((qty, i) => ({
    id: idAleatoire("o"), label: noms[i], qty, prix_total: "", ancien_prix_total: "",
    reduction_pct: Math.max(0, Math.min(90, Number(pcts[i]) || 0)) || "",
    cadeau: "", badge: badges[i], texte: "",
  }));
}

// Applique la configuration du Builder sur l'objet produit utilisé par le tunnel de commande
// existant (bundles + complément "bump"). Le tunnel de CataloguePublic lit ces champs tels
// quels : aucune modification de sa logique de prix / de commande n'est nécessaire.
export function fusionnerConfigDansProduit(produit, config) {
  if (!produit) return produit;
  const blocs = blocsActifs(config);
  const fusion = { ...produit, _pageFusionnee: true };
  const blocOffres = blocs.find((b) => b.type === "offres");
  if (blocOffres && Array.isArray(blocOffres.props.offres) && blocOffres.props.offres.length > 0) {
    fusion.bundles = blocOffres.props.offres.filter((o) => o && o.id).map(convertirOffreEnBundle);
  }
  const complement = blocs.find((b) => (b.type === "bundles" || b.type === "upsell") && b.props.produit_id);
  if (complement) {
    fusion.bump_produit_id = complement.props.produit_id;
    const ps = complement.props.prix_special;
    fusion.bump_prix_special = ps === "" || ps == null || !Number.isFinite(Number(ps)) ? null : Number(ps);
  }
  return fusion;
}

// Offre présélectionnée à l'ouverture de la page.
// • offres saisies dans le Builder : celle marquée "par défaut", sinon la première ;
// • bundles repris du produit : celle marquée "par défaut", sinon aucune (= 1 unité, comportement historique).
export function offreParDefaut(produit, config) {
  const blocs = blocsActifs(config);
  const blocOffres = blocs.find((b) => b.type === "offres");
  if (!blocOffres) return null;
  // Produit à variantes : les offres ne sont pas proposées (règle historique) → aucune présélection.
  if (Array.isArray(produit?.options) && produit.options.length > 0) return null;
  const { source, liste } = calculerOffresAffichees(produit, blocOffres);
  if (liste.length === 0) return null;
  const trouve = liste.find((o) => o.id === blocOffres.props.offre_defaut_id);
  if (trouve) return trouve;
  return source === "builder" ? liste[0] : null;
}

// Zone de livraison envoyée au système existant. Sans champ additionnel activé, renvoie
// EXACTEMENT form.zone (comportement historique inchangé).
export function composerZoneLivraison(form) {
  const ville = String(form?.zone || "").trim();
  const commune = String(form?.commune || "").trim();
  const instructions = String(form?.instructions || "").trim();
  if (!commune && !instructions) return form?.zone;
  return [ville, commune].filter(Boolean).join(" — ") + (instructions ? ` (Instructions : ${instructions})` : "");
}

// ---------------------------------------------------------------------------
// Registre des blocs (V1 : 20 blocs)
// ---------------------------------------------------------------------------
// Types de champs pris en charge par le panneau de propriétés :
//   texte | zone | oui_non | nombre | choix | image | produit | produits | liste
// Une "liste" décrit ses sous-champs dans `sous` et sa fabrique d'élément dans `nouvelElement`.

export const CATEGORIES_BLOCS = [
  { id: "structure", label: "Structure" },
  { id: "contenu", label: "Contenu" },
  { id: "preuves", label: "Preuves" },
  { id: "vente", label: "Offres & ventes" },
  { id: "commande", label: "Commande & livraison" },
];

const ICONES_REASSURANCE = ["💵", "📞", "🚚", "🔒", "✅", "🛡️", "↩️", "💬"];

const CHAMPS_INFO_COMMUNS = [
  { cle: "badge", label: "Badge (optionnel)", type: "texte", placeholder: "Ex : Nouveau" },
  { cle: "titre", label: "Titre", type: "texte", aide: "Vide = nom du produit." },
  { cle: "sous_titre", label: "Sous-titre / promesse", type: "zone", aide: "Une phrase courte qui explique le bénéfice principal." },
  { cle: "afficher_avis", label: "Afficher la note et les avis", type: "oui_non", aide: "Affiché seulement s'il existe de vrais avis." },
  { cle: "afficher_prix", label: "Afficher le prix", type: "oui_non" },
  { cle: "afficher_ancien_prix", label: "Afficher l'ancien prix", type: "oui_non", aide: "Seulement si un ancien prix supérieur existe sur le produit." },
  { cle: "afficher_economie", label: "Afficher l'économie", type: "oui_non" },
  { cle: "benefices", label: "Bénéfices principaux (✓)", type: "liste", sous: [{ cle: "texte", label: "Bénéfice", type: "texte" }], nouvelElement: () => ({ texte: "" }), max: 6 },
  { cle: "utiliser_points_forts", label: "Reprendre les « points forts » de la description", type: "oui_non", aide: "Utilisé si la liste ci-dessus est vide." },
  { cle: "afficher_offres", label: "Afficher les offres / packs", type: "oui_non" },
  { cle: "afficher_cod", label: "Afficher « Paiement à la livraison »", type: "oui_non" },
  { cle: "afficher_reassurance", label: "Afficher la réassurance (livraison, COD…)", type: "oui_non" },
  { cle: "afficher_stock", label: "Afficher le stock restant", type: "oui_non", aide: "Uniquement quand il reste ≤ 5 unités (donnée réelle du produit)." },
  { cle: "cta_texte", label: "Texte du bouton (optionnel)", type: "texte", aide: "Vide = texte du bouton défini dans « Page »." },
];

const PROPS_INFO_DEFAUT = () => ({
  badge: "", titre: "", sous_titre: "",
  afficher_avis: true, afficher_prix: true, afficher_ancien_prix: true, afficher_economie: true,
  benefices: [], utiliser_points_forts: true,
  afficher_offres: true, afficher_cod: true, afficher_reassurance: true, afficher_stock: false,
  cta_texte: "",
});

export const REGISTRE_BLOCS = {
  hero: {
    label: "Hero", icone: "🏠", categorie: "structure", unique: true,
    description: "Galerie à gauche, informations et offres à droite (desktop) — galerie puis infos (mobile).",
    defaut: () => ({ ...PROPS_INFO_DEFAUT(), video_url: "", ratio_galerie: "carre" }),
    champs: [
      ...CHAMPS_INFO_COMMUNS,
      { cle: "video_url", label: "Vidéo dans la galerie", type: "video", aide: "Collez un lien (YouTube, Vimeo, .mp4) ou envoyez une vidéo depuis votre ordinateur." },
      { cle: "ratio_galerie", label: "Format de la galerie", type: "choix", options: [{ v: "carre", l: "Carré" }, { v: "portrait", l: "Portrait (4:5)" }] },
    ],
  },
  galerie: {
    label: "Galerie produit", icone: "🖼️", categorie: "structure", unique: true,
    description: "Grande galerie seule : image principale, miniatures, zoom, vidéo, plein écran.",
    defaut: () => ({ video_url: "", ratio_galerie: "carre", afficher_miniatures: true, zoom: true }),
    champs: [
      { cle: "video_url", label: "Vidéo", type: "video", aide: "Collez un lien (YouTube, Vimeo, .mp4) ou envoyez une vidéo depuis votre ordinateur." },
      { cle: "ratio_galerie", label: "Format", type: "choix", options: [{ v: "carre", l: "Carré" }, { v: "portrait", l: "Portrait (4:5)" }] },
      { cle: "afficher_miniatures", label: "Afficher les miniatures", type: "oui_non" },
      { cle: "zoom", label: "Autoriser le zoom / plein écran", type: "oui_non" },
    ],
  },
  info_produit: {
    label: "Infos produit", icone: "🏷️", categorie: "structure", unique: true,
    description: "Titre, prix, bénéfices, offres et bouton — sans galerie (à combiner avec « Galerie produit »).",
    defaut: () => PROPS_INFO_DEFAUT(),
    champs: CHAMPS_INFO_COMMUNS,
  },
  benefices: {
    label: "Bénéfices", icone: "✨", categorie: "contenu",
    description: "Les principaux bénéfices, en cartes.",
    defaut: () => ({ titre: "Les bénéfices", sous_titre: "", colonnes: "3", utiliser_points_forts: true, items: [] }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "sous_titre", label: "Sous-titre", type: "texte" },
      { cle: "colonnes", label: "Colonnes (desktop)", type: "choix", options: [{ v: "2", l: "2" }, { v: "3", l: "3" }, { v: "4", l: "4" }] },
      { cle: "utiliser_points_forts", label: "Reprendre les « points forts » de la description", type: "oui_non", aide: "Utilisé si aucune carte n'est ajoutée." },
      {
        cle: "items", label: "Cartes", type: "liste", max: 8,
        sous: [{ cle: "icone", label: "Icône (emoji)", type: "texte" }, { cle: "titre", label: "Titre", type: "texte" }, { cle: "texte", label: "Texte", type: "zone" }],
        nouvelElement: () => ({ icone: "✔️", titre: "", texte: "" }),
      },
    ],
  },
  video: {
    label: "Vidéo / démonstration", icone: "🎬", categorie: "contenu",
    description: "Démonstration du produit (lien YouTube / Vimeo, ou fichier envoyé depuis votre ordinateur). Chargée seulement au clic.",
    defaut: () => ({ titre: "Voir le produit en action", sous_titre: "", url: "", legende: "" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "sous_titre", label: "Sous-titre", type: "texte" },
      { cle: "url", label: "Vidéo", type: "video", aide: "Collez un lien (YouTube, Vimeo, .mp4) OU envoyez un fichier depuis votre ordinateur. Sans vidéo, le bloc n'apparaît pas sur la page publique." },
      { cle: "legende", label: "Légende", type: "texte" },
    ],
  },
  comment_ca_marche: {
    label: "Comment ça fonctionne", icone: "🪜", categorie: "contenu",
    description: "Étapes numérotées (utilisation du produit ou déroulé de la commande).",
    defaut: () => ({
      titre: "Comment ça marche", sous_titre: "",
      etapes: [
        { titre: "Vous commandez", texte: "Remplissez le formulaire, sans payer maintenant." },
        { titre: "On vous appelle", texte: "Notre équipe confirme votre commande par téléphone." },
        { titre: "Vous payez à la livraison", texte: "Vous recevez votre commande et vous payez à la réception." },
      ],
    }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "sous_titre", label: "Sous-titre", type: "texte" },
      { cle: "etapes", label: "Étapes", type: "liste", max: 6, sous: [{ cle: "titre", label: "Titre", type: "texte" }, { cle: "texte", label: "Texte", type: "zone" }], nouvelElement: () => ({ titre: "", texte: "" }) },
    ],
  },
  offres: {
    label: "Offres & packs", icone: "🎁", categorie: "vente", unique: true,
    description: "« Choisissez votre offre » : 1 / 2 / 3 produits, prix, économie, cadeau, badge. Branché sur le moteur de bundles existant.",
    defaut: () => ({ titre: "Choisissez votre offre", sous_titre: "", offres: [], offre_defaut_id: "", afficher_economie: true, affichage: "cartes" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "sous_titre", label: "Sous-titre", type: "texte" },
      { cle: "affichage", label: "Présentation des packs", type: "choix", options: [{ v: "cartes", l: "Cartes avec photos (recommandé)" }, { v: "liste", l: "Liste simple" }], aide: "Les cartes s'utilisent pour 2 à 4 packs ; au-delà, la liste s'affiche automatiquement." },
      { cle: "afficher_economie", label: "Afficher « Économisez X »", type: "oui_non", aide: "Calculé sur de vrais prix uniquement." },
      { cle: "offres", label: "Offres", type: "offres" },
    ],
  },
  bundles: {
    label: "Offre groupée", icone: "📦", categorie: "vente", unique: true,
    description: "Produit principal + un produit complémentaire du catalogue, à prix spécial.",
    defaut: () => ({ titre: "Offre groupée", texte: "", produit_id: "", prix_special: "", badge: "" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "texte", label: "Texte", type: "zone" },
      { cle: "produit_id", label: "Produit complémentaire (catalogue)", type: "produit" },
      { cle: "prix_special", label: "Prix spécial du complément", type: "nombre", aide: "Vide = prix normal du produit." },
      { cle: "badge", label: "Badge", type: "texte" },
    ],
  },
  avis: {
    label: "Avis clients", icone: "⭐", categorie: "preuves", unique: true,
    description: "Affiche les VRAIS avis approuvés de la boutique pour ce produit. Rien n'est inventé.",
    defaut: () => ({ titre: "Avis clients", max: 6, afficher_photos: true, afficher_note: true }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "max", label: "Nombre d'avis affichés", type: "nombre" },
      { cle: "afficher_note", label: "Afficher la note moyenne", type: "oui_non" },
      { cle: "afficher_photos", label: "Afficher les photos clients", type: "oui_non" },
    ],
  },
  ugc: {
    label: "Photos / vidéos clients (UGC)", icone: "📸", categorie: "preuves",
    description: "Contenus clients que VOUS fournissez (photos, vidéos, témoignages réels). Vide = masqué.",
    defaut: () => ({ titre: "Photos de nos clients", colonnes: "3", items: [] }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "colonnes", label: "Colonnes (desktop)", type: "choix", options: [{ v: "2", l: "2" }, { v: "3", l: "3" }, { v: "4", l: "4" }] },
      {
        cle: "items", label: "Contenus", type: "liste", max: 12,
        sous: [{ cle: "image", label: "Photo", type: "image" }, { cle: "video_url", label: "Vidéo (optionnel)", type: "video" }, { cle: "nom", label: "Prénom du client", type: "texte" }, { cle: "texte", label: "Témoignage réel", type: "zone" }],
        nouvelElement: () => ({ image: "", video_url: "", nom: "", texte: "" }),
      },
    ],
  },
  reassurance: {
    label: "Réassurance", icone: "🛡️", categorie: "commande",
    description: "Paiement à la livraison, confirmation téléphonique, livraison à domicile…",
    defaut: () => ({
      titre: "",
      items: [
        { icone: "💵", titre: "Paiement à la livraison", texte: "Vous payez uniquement à la réception." },
        { icone: "📞", titre: "Confirmation par téléphone", texte: "Nous vous appelons pour valider votre commande." },
        { icone: "🚚", titre: "Livraison à domicile", texte: "" },
      ],
    }),
    champs: [
      { cle: "titre", label: "Titre (optionnel)", type: "texte" },
      { cle: "items", label: "Garanties", type: "liste", max: 8, sous: [{ cle: "icone", label: "Icône (emoji)", type: "texte", suggestions: ICONES_REASSURANCE }, { cle: "titre", label: "Titre", type: "texte" }, { cle: "texte", label: "Texte", type: "zone" }], nouvelElement: () => ({ icone: "✅", titre: "", texte: "" }) },
    ],
  },
  comparaison: {
    label: "Comparaison", icone: "⚖️", categorie: "preuves",
    description: "Tableau « nous vs autres ». Les critères sont ceux que VOUS renseignez.",
    defaut: () => ({ titre: "Pourquoi nous choisir ?", colonne_nous: "", colonne_autres: "Autres solutions", lignes: [] }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "colonne_nous", label: "Nom de la colonne « nous »", type: "texte", aide: "Vide = nom du produit." },
      { cle: "colonne_autres", label: "Nom de la colonne « autres »", type: "texte" },
      { cle: "lignes", label: "Critères", type: "liste", max: 10, sous: [{ cle: "critere", label: "Critère", type: "texte" }, { cle: "nous", label: "Nous : oui ?", type: "oui_non" }, { cle: "autres", label: "Autres : oui ?", type: "oui_non" }], nouvelElement: () => ({ critere: "", nous: true, autres: false }) },
    ],
  },
  faq: {
    label: "FAQ", icone: "❓", categorie: "contenu", unique: true,
    description: "Questions fréquentes (dépliables). Génère aussi les données structurées FAQ pour Google.",
    defaut: () => ({
      titre: "Questions fréquentes",
      items: [
        { question: "Comment se passe le paiement ?", reponse: "Vous payez à la livraison, quand vous recevez votre commande." },
        { question: "Comment ma commande est-elle confirmée ?", reponse: "Après votre commande, notre équipe vous appelle pour confirmer les informations de livraison." },
      ],
    }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "items", label: "Questions", type: "liste", max: 12, sous: [{ cle: "question", label: "Question", type: "texte" }, { cle: "reponse", label: "Réponse", type: "zone" }], nouvelElement: () => ({ question: "", reponse: "" }) },
    ],
  },
  upsell: {
    label: "Upsell (ajoutez à la commande)", icone: "➕", categorie: "vente", unique: true,
    description: "« Ajoutez ceci à votre commande » : un produit du catalogue ajouté en un clic.",
    defaut: () => ({ titre: "Ajoutez ceci à votre commande", produit_id: "", prix_special: "", texte: "" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "produit_id", label: "Produit du catalogue", type: "produit" },
      { cle: "prix_special", label: "Prix spécial", type: "nombre", aide: "Vide = prix normal du produit." },
      { cle: "texte", label: "Texte", type: "zone" },
    ],
  },
  cross_sell: {
    label: "Cross-sell (produits complémentaires)", icone: "🛍️", categorie: "vente", unique: true,
    description: "« Vous pourriez également aimer » : produits réels du catalogue.",
    defaut: () => ({ titre: "Vous pourriez également aimer", mode: "auto", produit_ids: [], max: 6 }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "mode", label: "Sélection", type: "choix", options: [{ v: "auto", l: "Automatique (règles existantes du produit)" }, { v: "manuel", l: "Manuelle" }] },
      { cle: "produit_ids", label: "Produits", type: "produits", visibleSi: { mode: "manuel" } },
      { cle: "max", label: "Nombre maximum", type: "nombre" },
    ],
  },
  formulaire_cod: {
    label: "Formulaire COD", icone: "📝", categorie: "commande", unique: true,
    description: "Formulaire de commande RecuVente (nom, téléphone, ville, livraison, engagement). Crée la commande dans le workflow existant.",
    defaut: () => ({ titre: "Commander — paiement à la livraison", sous_titre: "Remplissez le formulaire : nous vous appelons pour confirmer, vous payez à la réception." }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "sous_titre", label: "Sous-titre", type: "zone" },
    ],
  },
  livraison: {
    label: "Informations de livraison", icone: "🚚", categorie: "commande", unique: true,
    description: "Frais réels (produit / boutique), politique de livraison, zones et délais que vous renseignez.",
    defaut: () => ({ titre: "Livraison", afficher_frais: true, afficher_politique: true, zones: "", delai: "", texte: "" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "afficher_frais", label: "Afficher les frais de livraison réels", type: "oui_non" },
      { cle: "afficher_politique", label: "Afficher la politique de livraison de la boutique", type: "oui_non" },
      { cle: "zones", label: "Zones livrées", type: "zone", aide: "Ex : Abidjan (toutes communes), Yamoussoukro…" },
      { cle: "delai", label: "Délai de livraison", type: "texte", aide: "Écrivez uniquement un délai que vous tenez réellement." },
      { cle: "texte", label: "Texte libre", type: "zone" },
    ],
  },
  description: {
    label: "Description du produit", icone: "📄", categorie: "contenu",
    description: "Affiche la description complète du produit (texte, images, vidéo) telle que saisie dans la fiche produit.",
    defaut: () => ({ titre: "Description du produit" }),
    champs: [
      { cle: "titre", label: "Titre de la section", type: "texte", aide: "Le contenu vient de la description du produit : modifiez-la dans la fiche produit." },
    ],
  },
  texte: {
    label: "Texte personnalisé", icone: "📝", categorie: "contenu",
    description: "Un titre et un texte libre.",
    defaut: () => ({ titre: "", texte: "", alignement: "gauche" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "texte", label: "Texte", type: "zone" },
      { cle: "alignement", label: "Alignement", type: "choix", options: [{ v: "gauche", l: "Gauche" }, { v: "centre", l: "Centré" }] },
    ],
  },
  image_texte: {
    label: "Image + Texte", icone: "🖼️", categorie: "contenu",
    description: "Une image d'un côté, un texte de l'autre.",
    defaut: () => ({ image: "", titre: "", texte: "", position: "gauche", bouton_texte: "" }),
    champs: [
      { cle: "image", label: "Image", type: "image" },
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "texte", label: "Texte", type: "zone" },
      { cle: "position", label: "Position de l'image", type: "choix", options: [{ v: "gauche", l: "Gauche" }, { v: "droite", l: "Droite" }] },
      { cle: "bouton_texte", label: "Bouton (optionnel)", type: "texte", aide: "Le bouton renvoie vers la commande." },
    ],
  },
  cta: {
    label: "Appel à l'action", icone: "👉", categorie: "vente",
    description: "Bandeau avec un bouton qui mène à la commande.",
    defaut: () => ({ titre: "", texte: "", bouton_texte: "" }),
    champs: [
      { cle: "titre", label: "Titre", type: "texte" },
      { cle: "texte", label: "Texte", type: "zone" },
      { cle: "bouton_texte", label: "Texte du bouton", type: "texte", aide: "Vide = texte du bouton défini dans « Page »." },
    ],
  },
};

export const TYPES_BLOCS = Object.keys(REGISTRE_BLOCS);

// ---------------------------------------------------------------------------
// Blocs : création, duplication, manipulation
// ---------------------------------------------------------------------------

export function creerBloc(type, surcharges = {}) {
  const def = REGISTRE_BLOCS[type];
  if (!def) return null;
  return {
    id: idAleatoire("b"),
    type,
    visible: true,
    montrer: { desktop: true, mobile: true },
    props: { ...def.defaut(), ...surcharges },
  };
}

export function dupliquerBloc(bloc) {
  const def = REGISTRE_BLOCS[bloc?.type];
  if (!def || def.unique) return null;
  const copie = JSON.parse(JSON.stringify(bloc));
  copie.id = idAleatoire("b");
  return copie;
}

export function deplacerElement(liste, de, vers) {
  if (de === vers || de < 0 || vers < 0 || de >= liste.length || vers >= liste.length) return liste;
  const copie = liste.slice();
  const [x] = copie.splice(de, 1);
  copie.splice(vers, 0, x);
  return copie;
}

export function blocsActifs(config) {
  return (Array.isArray(config?.blocs) ? config.blocs : []).filter((b) => b && b.visible !== false && REGISTRE_BLOCS[b.type]);
}

// ---------------------------------------------------------------------------
// Thème & réglages globaux
// ---------------------------------------------------------------------------

export const THEME_DEFAUT = {
  couleur: "",            // vide = couleur de la boutique
  fond: "blanc",          // blanc | creme
  police_titres: "sans",  // sans | serif
  rayon: "doux",          // net | doux | rond
  espacement: "normal",   // compact | normal | aere
};

export const CTA_TEXTE_DEFAUT = "COMMANDER — PAIEMENT À LA LIVRAISON";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const TEMPLATES = {
  cod_conversion: {
    id: "cod_conversion",
    nom: "COD Conversion",
    pour: "La majorité des produits",
    description: "Hero → description → vidéo → pourquoi → bénéfices → étapes → preuves → offres → réassurance → FAQ → compléments.",
    theme: { fond: "blanc", police_titres: "sans", rayon: "doux", espacement: "normal" },
    blocs: [
      ["hero"],
      ["description"],
      ["video"],
      ["image_texte", { titre: "Pourquoi ce produit ?" }],
      ["benefices"],
      ["comment_ca_marche"],
      ["avis"],
      ["ugc"],
      ["offres"],
      ["reassurance"],
      ["livraison"],
      ["faq"],
      ["cross_sell"],
    ],
  },
  premium: {
    id: "premium",
    nom: "Premium",
    pour: "Beauté, mode, luxe, marques",
    description: "Visuel large et aéré, typographie élégante, peu de blocs : image de marque d'abord.",
    theme: { fond: "creme", police_titres: "serif", rayon: "net", espacement: "aere" },
    blocs: [
      ["hero", { afficher_reassurance: false }],
      ["description"],
      ["image_texte", { titre: "L'esprit du produit", position: "droite" }],
      ["benefices", { titre: "Ce qui le distingue", colonnes: "3" }],
      ["galerie", { ratio_galerie: "portrait" }],
      ["avis"],
      ["ugc"],
      ["offres"],
      ["reassurance"],
      ["faq"],
      ["cross_sell", { titre: "Complétez votre sélection" }],
    ],
  },
  storytelling: {
    id: "storytelling",
    nom: "Storytelling",
    pour: "Produits à expliquer, techniques, bien-être, nouveautés",
    description: "Problème → histoire → démonstration → étapes → bénéfices → preuves → offre : on explique avant de vendre.",
    theme: { fond: "blanc", police_titres: "sans", rayon: "doux", espacement: "aere" },
    blocs: [
      ["hero", { afficher_offres: false, afficher_reassurance: false }],
      ["description"],
      ["texte", { titre: "Le problème", alignement: "centre" }],
      ["image_texte", { titre: "Notre histoire", position: "gauche" }],
      ["video"],
      ["comment_ca_marche", { titre: "Comment l'utiliser" }],
      ["benefices"],
      ["comparaison"],
      ["avis"],
      ["ugc"],
      ["offres"],
      ["reassurance"],
      ["faq"],
      ["cta"],
    ],
  },
};

export const IDS_TEMPLATES = Object.keys(TEMPLATES);

export function creerConfig(templateId = "cod_conversion") {
  const tpl = TEMPLATES[templateId] || TEMPLATES.cod_conversion;
  return {
    version: VERSION_CONFIG,
    template: tpl.id,
    theme: { ...THEME_DEFAUT, ...tpl.theme },
    cta: { texte: CTA_TEXTE_DEFAUT, sous_texte: "", action: "popup", couleur: "" },
    sticky: { mobile: true, desktop: true },
    formulaire: { commune: false, instructions: false },
    seo: { titre: "", description: "" },
    desc_migree: true,
    sticky_v2: true,
    blocs: tpl.blocs.map(([type, surcharges]) => creerBloc(type, surcharges || {})).filter(Boolean),
  };
}

// Change de template EN CONSERVANT le contenu déjà saisi : pour chaque type de bloc présent
// dans l'ancienne page, ses propriétés sont reprises dans le nouveau template. Les blocs
// ajoutés à la main qui n'existent pas dans le nouveau template sont conservés à la fin.
export function appliquerTemplate(configActuelle, templateId) {
  const neuve = creerConfig(templateId);
  const anciens = Array.isArray(configActuelle?.blocs) ? configActuelle.blocs : [];
  const utilises = new Set();
  const blocs = neuve.blocs.map((b) => {
    const ancien = anciens.find((a) => a.type === b.type && !utilises.has(a.id));
    if (!ancien) return b;
    utilises.add(ancien.id);
    return { ...b, id: ancien.id, visible: ancien.visible !== false, montrer: ancien.montrer || b.montrer, props: { ...b.props, ...ancien.props } };
  });
  anciens.forEach((a) => { if (!utilises.has(a.id)) blocs.push(a); });
  return {
    ...neuve,
    cta: configActuelle?.cta || neuve.cta,
    sticky: configActuelle?.sticky || neuve.sticky,
    formulaire: configActuelle?.formulaire || neuve.formulaire,
    seo: configActuelle?.seo || neuve.seo,
    theme: { ...neuve.theme, couleur: configActuelle?.theme?.couleur || "" },
    blocs,
  };
}

// ---------------------------------------------------------------------------
// Normalisation / validation (config lue en base, potentiellement ancienne ou abîmée)
// ---------------------------------------------------------------------------

const MAX_BLOCS = 60;

function texteBorne(v, max = 4000) {
  return typeof v === "string" ? v.slice(0, max) : v;
}

function nettoyerValeur(v, profondeur = 0) {
  if (profondeur > 5) return null;
  if (typeof v === "string") return texteBorne(v);
  if (typeof v === "number" || typeof v === "boolean" || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => nettoyerValeur(x, profondeur + 1));
  if (typeof v === "object") {
    const out = {};
    Object.keys(v).slice(0, 60).forEach((k) => { out[k] = nettoyerValeur(v[k], profondeur + 1); });
    return out;
  }
  return null;
}

export function normaliserConfig(brute) {
  const base = creerConfig(brute?.template && TEMPLATES[brute.template] ? brute.template : "cod_conversion");
  if (!brute || typeof brute !== "object") return base;
  const vus = new Set();
  const blocs = (Array.isArray(brute.blocs) ? brute.blocs : [])
    .slice(0, MAX_BLOCS)
    .filter((b) => b && REGISTRE_BLOCS[b.type])
    .map((b) => {
      let id = typeof b.id === "string" && b.id ? b.id.slice(0, 40) : idAleatoire("b");
      if (vus.has(id)) id = idAleatoire("b");
      vus.add(id);
      const def = REGISTRE_BLOCS[b.type];
      return {
        id,
        type: b.type,
        visible: b.visible !== false,
        montrer: { desktop: b.montrer?.desktop !== false, mobile: b.montrer?.mobile !== false },
        props: { ...def.defaut(), ...(nettoyerValeur(b.props) || {}) },
      };
    });
  // Pages créées avant l'existence du bloc « Description du produit » : on l'ajoute UNE fois,
  // juste après l'en-tête (hero / galerie / infos), pour que la description déjà rédigée
  // apparaisse. Le marchand peut ensuite le masquer ou le supprimer (le drapeau évite le retour).
  const aDescription = blocs.some((b) => b.type === "description");
  if (!aDescription && !brute.desc_migree && blocs.length > 0) {
    let i = 0;
    while (i < blocs.length && ["hero", "galerie", "info_produit"].includes(blocs[i].type)) i += 1;
    blocs.splice(i, 0, { id: idAleatoire("b"), type: "description", visible: true, montrer: { desktop: true, mobile: true }, props: REGISTRE_BLOCS.description.defaut() });
  }
  return {
    version: VERSION_CONFIG,
    template: base.template,
    desc_migree: true,
    theme: { ...THEME_DEFAUT, ...(nettoyerValeur(brute.theme) || {}) },
    cta: { ...base.cta, ...(nettoyerValeur(brute.cta) || {}) },
    // Barre collante : depuis la v2 elle est aussi active sur ordinateur (avant : mobile seulement).
    sticky: { ...base.sticky, ...(nettoyerValeur(brute.sticky) || {}), ...(brute.sticky_v2 ? {} : { desktop: true }) },
    sticky_v2: true,
    formulaire: { ...base.formulaire, ...(nettoyerValeur(brute.formulaire) || {}) },
    seo: { ...base.seo, ...(nettoyerValeur(brute.seo) || {}) },
    blocs,
  };
}

// Vrai si la configuration reçue du serveur est exploitable pour un rendu public.
export function configPubliqueValide(config) {
  return !!config && typeof config === "object" && Array.isArray(config.blocs) && config.blocs.length > 0;
}

// ---------------------------------------------------------------------------
// Un bloc a-t-il quelque chose à montrer ? (public : pas de section vide, pas de faux contenu)
// ctx = { produit, produits, avis, pointsForts, blocOffres, hasOptions }
// ---------------------------------------------------------------------------

export function blocEstVide(bloc, ctx = {}) {
  const p = bloc.props || {};
  const rempli = (s) => typeof s === "string" && s.trim().length > 0;
  switch (bloc.type) {
    case "benefices":
      return !(p.items || []).some((i) => rempli(i.titre) || rempli(i.texte)) && !(p.utiliser_points_forts && (ctx.pointsForts || []).length > 0);
    case "video": return !analyserVideo(p.url);
    case "comment_ca_marche": return !(p.etapes || []).some((e) => rempli(e.titre) || rempli(e.texte));
    case "offres": return calculerOffresAffichees(ctx.produit, bloc).liste.length === 0 || ctx.hasOptions;
    case "bundles":
    case "upsell": return !p.produit_id || !(ctx.produits || []).some((x) => x.produit_id === p.produit_id && x.produit_id !== ctx.produit?.produit_id);
    case "avis": return (ctx.avis || []).length === 0;
    case "ugc": return !(p.items || []).some((i) => rempli(i.image) || rempli(i.texte) || analyserVideo(i.video_url));
    case "reassurance": return !(p.items || []).some((i) => rempli(i.titre) || rempli(i.texte));
    case "comparaison": return !(p.lignes || []).some((l) => rempli(l.critere));
    case "faq": return !(p.items || []).some((i) => rempli(i.question) && rempli(i.reponse));
    case "cross_sell": return (ctx.produitsCrossSell || []).length === 0;
    case "description": return !descriptionAUnContenu(ctx.descriptionReste);
    case "texte": return !rempli(p.texte);
    // Un titre seul (ex. « Pourquoi ce produit ? » pré-rempli par le template) ne suffit pas :
    // sans texte ni image, le bloc ne s'affiche pas publiquement.
    case "image_texte": return !rempli(p.image) && !rempli(p.texte);
    case "cta": return false;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// AI PAGE ARCHITECT — proposition de structure (déterministe, sans invention)
// ---------------------------------------------------------------------------
// Règle d'or : l'Architect décide QUELS blocs mettre et dans quel ordre. Il ne rédige aucune
// preuve, aucun avis, aucun chiffre, aucun résultat, aucun prix, aucun stock, aucun timer.
// Le contenu des blocs de preuve reste vide tant que le commerçant ne le fournit pas
// (les blocs vides ne s'affichent pas sur la page publique).
//
// Branchement futur d'un LLM : sa réponse doit passer par assainirPropositionExterne().

export const CATEGORIES_PRODUIT = [
  { v: "bien_etre", l: "Bien-être / santé" },
  { v: "beaute", l: "Beauté / soins" },
  { v: "mode", l: "Mode / accessoires" },
  { v: "luxe", l: "Luxe / premium" },
  { v: "electronique", l: "Électronique / high-tech" },
  { v: "maison", l: "Maison / cuisine" },
  { v: "professionnel", l: "Matériel professionnel" },
  { v: "autre", l: "Autre" },
];

export const OBJECTIFS_PAGE = [
  { v: "commandes_confirmees", l: "Augmenter les commandes confirmées" },
  { v: "panier_moyen", l: "Augmenter le panier moyen" },
  { v: "lancement", l: "Lancer un nouveau produit" },
  { v: "expliquer", l: "Expliquer un produit technique" },
  { v: "image_marque", l: "Renforcer l'image de marque" },
];

export const MODES_VENTE = [
  { v: "cod", l: "Paiement à la livraison (COD)" },
  { v: "cod_depot", l: "COD avec dépôt selon mes règles" },
];

const RAISONS = {
  hero: "Galerie + prix + offres + bouton : la première chose que voit le visiteur.",
  video: "Une démonstration réduit les doutes avant l'achat.",
  image_texte: "Explique en une image et quelques lignes pourquoi ce produit.",
  benefices: "Traduit les caractéristiques en bénéfices concrets.",
  comment_ca_marche: "Rassure sur l'utilisation ou sur le déroulé de la commande.",
  avis: "Affiche uniquement les vrais avis déjà reçus.",
  ugc: "Photos / vidéos clients que vous fournissez.",
  offres: "Packs quantité branchés sur le moteur de bundles existant.",
  reassurance: "COD, confirmation téléphonique, livraison : lève les freins du COD.",
  livraison: "Frais, zones et délais réels : réduit les commandes non honorées.",
  faq: "Répond aux objections avant qu'elles ne bloquent la commande.",
  cross_sell: "Propose des produits réels du catalogue.",
  upsell: "Ajoute un produit du catalogue en un clic.",
  bundles: "Produit principal + complément à prix spécial.",
  formulaire_cod: "Le formulaire crée directement la commande RecuVente.",
  description: "Reprend la description déjà écrite dans la fiche produit (texte, images, vidéo).",
  texte: "Pose le problème ou le contexte avant la solution.",
  galerie: "Mise en valeur visuelle supplémentaire.",
  comparaison: "Tableau que VOUS renseignez (aucun critère inventé).",
  cta: "Relance vers la commande après l'argumentaire.",
};

const A_FOURNIR = {
  video: (b) => (b.aVideo ? "Collez un lien ou envoyez la vidéo depuis votre ordinateur." : "Aucune vidéo déclarée : le bloc reste masqué tant qu'il n'y a pas de lien."),
  ugc: (b) => (b.aUGC ? "Ajoutez vos photos / vidéos clients dans le bloc." : "Aucun contenu client déclaré : bloc masqué tant qu'il est vide."),
  benefices: () => "Rédigez vos bénéfices (ou ils seront repris des « points forts » de la description).",
  avis: (b) => (b.nbAvisReels > 0 ? `${b.nbAvisReels} avis réel(s) seront affichés automatiquement.` : "Aucun avis approuvé pour l'instant : bloc masqué tant qu'il n'y en a pas."),
  comparaison: () => "Ajoutez vos propres critères de comparaison (aucun n'est inventé).",
  image_texte: () => "Ajoutez une image et votre texte.",
  description: () => "Automatique : repris de la description de la fiche produit (masqué si elle est vide).",
  texte: () => "Rédigez le texte.",
  cross_sell: (b) => (b.nbProduitsCatalogue > 1 ? "Automatique : les produits proviennent de votre catalogue." : "Ajoutez d'autres produits au catalogue pour activer ce bloc."),
  upsell: () => "Choisissez le produit à proposer dans le bloc.",
  bundles: () => "Choisissez le produit complémentaire dans le bloc.",
  offres: (b) => (b.aOffres ? "Vos bundles existants seront repris." : "Ajoutez vos packs (quantité, prix) dans le bloc : aucun prix n'est inventé."),
};

export function proposerStructure(brief = {}) {
  const cat = brief.categorie || "autre";
  const obj = brief.objectif || "commandes_confirmees";
  const avertissements = [];

  let template = "cod_conversion";
  if (["beaute", "mode", "luxe"].includes(cat) || obj === "image_marque") template = "premium";
  else if (["bien_etre", "electronique", "professionnel"].includes(cat) || obj === "expliquer" || obj === "lancement") template = "storytelling";

  const ordre = [];
  const ajouter = (type) => { if (!ordre.includes(type)) ordre.push(type); };

  if (template === "premium") {
    ["hero", "description", "image_texte", "benefices", "galerie", "avis", "ugc", "offres", "reassurance", "faq", "cross_sell"].forEach(ajouter);
  } else if (template === "storytelling") {
    ["hero", "description", "texte", "image_texte", "video", "comment_ca_marche", "benefices", "comparaison", "avis", "ugc", "offres", "reassurance", "faq", "cta"].forEach(ajouter);
  } else {
    ["hero", "description", "video", "image_texte", "benefices", "comment_ca_marche", "avis", "ugc", "offres", "reassurance", "livraison", "faq", "cross_sell"].forEach(ajouter);
  }

  // Ajustements selon l'objectif
  if (obj === "panier_moyen") {
    if (brief.aComplementaires !== false) { const i = ordre.indexOf("offres"); ordre.splice(i + 1, 0, "upsell"); }
    if (!ordre.includes("livraison")) ordre.splice(ordre.indexOf("faq"), 0, "livraison");
  }
  if (obj === "commandes_confirmees") {
    if (!ordre.includes("livraison")) ordre.splice(ordre.indexOf("faq") >= 0 ? ordre.indexOf("faq") : ordre.length - 1, 0, "livraison");
    if (!ordre.includes("comment_ca_marche")) ordre.splice(ordre.indexOf("reassurance") >= 0 ? ordre.indexOf("reassurance") : ordre.length - 1, 0, "comment_ca_marche");
  }
  if (brief.mode === "cod_depot") {
    if (!ordre.includes("livraison")) ordre.splice(ordre.indexOf("faq") >= 0 ? ordre.indexOf("faq") : ordre.length - 1, 0, "livraison");
    avertissements.push("Mode COD avec dépôt : les règles de dépôt déjà configurées dans RecuVente s'appliquent telles quelles au formulaire. Ajoutez une phrase claire dans « Livraison » si vous le souhaitez.");
  }
  if (brief.aComplementaires === false) { const i = ordre.indexOf("cross_sell"); if (i >= 0) ordre.splice(i, 1); }

  if (cat === "bien_etre") {
    avertissements.push("Bien-être / santé : aucune promesse de guérison ni résultat médical n'est générée. Ne rédigez que des informations que vous pouvez justifier.");
  }
  avertissements.push("L'Architect ne crée jamais d'avis, de témoignage, de chiffre, de stock, de compte à rebours ni de prix : ces contenus restent à fournir par vous.");

  const ctx = {
    aVideo: !!brief.aVideo, aUGC: !!brief.aUGC, aOffres: !!brief.aOffres,
    nbAvisReels: Number(brief.nbAvisReels) || 0, nbProduitsCatalogue: Number(brief.nbProduitsCatalogue) || 0,
  };
  const blocs = ordre.map((type) => ({
    type,
    label: REGISTRE_BLOCS[type].label,
    raison: RAISONS[type] || "",
    aFournir: A_FOURNIR[type] ? A_FOURNIR[type](ctx) : "",
  }));

  return {
    template,
    templateNom: TEMPLATES[template].nom,
    blocs,
    avertissements,
    resume: `Template « ${TEMPLATES[template].nom} » — ${blocs.length} blocs pour « ${brief.produit || "ce produit"} ».`,
  };
}

// Construit la configuration correspondant à une proposition. Les contenus déjà saisis dans
// `configActuelle` (même type de bloc) sont conservés : appliquer une structure ne détruit rien.
export function appliquerProposition(proposition, configActuelle, contexteProduit = {}) {
  const tpl = TEMPLATES[proposition.template] || TEMPLATES.cod_conversion;
  const base = creerConfig(tpl.id);
  const anciens = Array.isArray(configActuelle?.blocs) ? configActuelle.blocs : [];
  const utilises = new Set();
  const blocs = proposition.blocs.map((pb) => {
    const modele = base.blocs.find((b) => b.type === pb.type);
    const neuf = creerBloc(pb.type, modele ? modele.props : {});
    const ancien = anciens.find((a) => a.type === pb.type && !utilises.has(a.id));
    if (ancien) { utilises.add(ancien.id); return { ...neuf, id: ancien.id, visible: ancien.visible !== false, montrer: ancien.montrer || neuf.montrer, props: { ...neuf.props, ...ancien.props } }; }
    if (pb.type === "offres" && Array.isArray(contexteProduit.bundles) && contexteProduit.bundles.length > 0) {
      neuf.props.offres = []; // les bundles du produit sont repris automatiquement
    }
    return neuf;
  });
  anciens.forEach((a) => { if (!utilises.has(a.id)) blocs.push(a); });
  return {
    ...base,
    cta: configActuelle?.cta || base.cta,
    sticky: configActuelle?.sticky || base.sticky,
    formulaire: configActuelle?.formulaire || base.formulaire,
    seo: configActuelle?.seo || base.seo,
    theme: { ...base.theme, couleur: configActuelle?.theme?.couleur || "" },
    blocs,
  };
}

// Garde-fou pour une future réponse de LLM : on ne garde QUE le template et les types de
// blocs connus (+ une raison courte). Tout contenu "de preuve" venant de l'IA est ignoré.
export function assainirPropositionExterne(json) {
  const template = TEMPLATES[json?.template] ? json.template : "cod_conversion";
  const vus = new Set();
  const blocs = (Array.isArray(json?.blocs) ? json.blocs : [])
    .map((b) => (typeof b === "string" ? { type: b } : b))
    .filter((b) => b && REGISTRE_BLOCS[b.type] && !vus.has(b.type) && (vus.add(b.type), true))
    .map((b) => ({ type: b.type, label: REGISTRE_BLOCS[b.type].label, raison: String(b.raison || RAISONS[b.type] || "").slice(0, 200), aFournir: "" }));
  return { template, templateNom: TEMPLATES[template].nom, blocs, avertissements: ["Proposition externe assainie : seuls les types de blocs ont été conservés."], resume: "" };
}

// ---------------------------------------------------------------------------
// Produits complémentaires affichés par le bloc Cross-sell
// (reprend les règles de la fiche actuelle : ids choisis / collection / meilleures ventes)
// ---------------------------------------------------------------------------

export function produitsCrossSell(produit, produits, collectionsManuelles, props = {}) {
  const max = Math.max(1, Math.min(12, Number(props.max) || 6));
  const autres = (produits || []).filter((p) => p.produit_id !== produit?.produit_id);
  if (props.mode === "manuel") {
    return (props.produit_ids || []).map((id) => autres.find((p) => p.produit_id === id)).filter(Boolean).slice(0, max);
  }
  const idsChoisis = Array.isArray(produit?.produits_similaires_ids) ? produit.produits_similaires_ids : [];
  const collection = produit?.produits_similaires_collection_id
    ? (collectionsManuelles || []).find((c) => c.id === produit.produits_similaires_collection_id)
    : null;
  const ids = [...new Set([...(collection ? collection.produitIds || [] : []), ...idsChoisis])].filter((id) => id !== produit?.produit_id);
  if (ids.length > 0) return ids.map((id) => autres.find((p) => p.produit_id === id)).filter(Boolean).slice(0, max);
  return autres.slice().sort((a, b) => (b.nb_ventes || 0) - (a.nb_ventes || 0)).slice(0, max);
}

// ============================================================================
//  Couleurs saisies à la main
//  Un champ couleur du Store Builder accepte du texte libre : « F7EEDF » (sans #) ou « #fff »
//  n'est pas une couleur CSS valide sous cette forme (ou seulement en partie). Résultat côté
//  boutique : fond ignoré, texte blanc sur fond blanc (pied de page « invisible »), boutons
//  de l'éditeur gris. Ces fonctions réparent la saisie ; elles ne changent aucune couleur valide.
// ============================================================================
export function normaliserHex(v) {
  const m = String(v ?? "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return "";
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

// Couleur utilisable en CSS : « #rrggbb » (réparé si besoin), rgb()/hsl() acceptés tels quels, sinon `secours`.
export function couleurCssSure(v, secours = "") {
  const h = normaliserHex(v);
  if (h) return h;
  const s = String(v ?? "").trim();
  return /^(rgb|hsl)a?\([^)]*\)$/i.test(s) ? s : secours;
}

function canaux(v) {
  const h = normaliserHex(v);
  if (h) return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = String(v ?? "").match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Luminance relative WCAG (0 = noir, 1 = blanc) ; null si la couleur n'est pas lisible.
export function luminanceCouleur(v) {
  const c = canaux(v);
  if (!c) return null;
  const [r, g, b] = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratioContraste(a, b) {
  const la = luminanceCouleur(a), lb = luminanceCouleur(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function estClaire(v) {
  const l = luminanceCouleur(v);
  return l != null && l > 0.45;
}

// Couleur de texte lisible sur ce fond (blanc sur fond foncé, encre sur fond clair).
export function texteSurFond(fond, clair = "#ffffff", fonce = "#16231F") {
  return estClaire(fond) ? fonce : clair;
}

// Répare les couleurs saisies sans « # » dans une configuration de boutique (Store Builder).
// Ne touche qu'aux champs de couleur ; rend une copie, l'original n'est pas modifié.
export function reparerCouleurs(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return cfg;
  const out = { ...cfg };
  const reparer = (v) => { const h = normaliserHex(v); return h || v; };
  Object.keys(out).forEach((k) => {
    const v = out[k];
    if (typeof v === "string" && /(color|couleur|fond)$/i.test(k)) out[k] = reparer(v);
  });
  if (out.sectionColors && typeof out.sectionColors === "object") {
    out.sectionColors = Object.fromEntries(Object.entries(out.sectionColors).map(([k, v]) => [k, typeof v === "string" ? reparer(v) : v]));
  }
  if (out.sectionStyles && typeof out.sectionStyles === "object") {
    out.sectionStyles = Object.fromEntries(Object.entries(out.sectionStyles).map(([k, st]) => {
      if (!st || typeof st !== "object") return [k, st];
      const s2 = { ...st };
      ["fond", "bordureCouleur"].forEach((c) => { if (typeof s2[c] === "string") s2[c] = reparer(s2[c]); });
      return [k, s2];
    }));
  }
  return out;
}

// Pendant la frappe : « F7EEDF » devient « #F7EEDF » dès qu'on tape des chiffres/lettres hexadécimaux.
// (On n'agrandit pas « #fff » en « #ffffff » ici, pour ne pas gêner celui qui tape encore.)
export function completerDieze(v) {
  const s = String(v ?? "");
  return /^[0-9a-f]{3,8}$/i.test(s.trim()) ? `#${s.trim()}` : s;
}
