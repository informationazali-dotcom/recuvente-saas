import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function genererRecuClientPDF(entreprise, form, produitOuvert, quantite, montantTotal, modeLivraison) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const vert = [26, 122, 60];
  const gris = [107, 113, 104];
  const sombre = [22, 35, 31];

  doc.setFillColor(...vert);
  doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(entreprise.nom.toUpperCase(), 15, 17);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Reçu de commande", 15, 24);

  doc.setTextColor(...sombre);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Commande du ${new Date().toLocaleDateString("fr-FR")}`, 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...gris);
  let y = 52;
  doc.text(`Client : ${form.client}`, 15, y); y += 6;
  doc.text(`Téléphone : ${form.tel}`, 15, y); y += 6;
  doc.text(`Livraison à : ${form.zone}`, 15, y); y += 6;
  if (modeLivraison) { doc.text(`Mode : ${modeLivraison}`, 15, y); y += 6; }

  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, 195, y);
  y += 8;

  doc.setTextColor(...sombre);
  doc.setFont("helvetica", "bold");
  doc.text(`${quantite} × ${produitOuvert.produit_nom}`, 15, y);
  doc.text(`${montantTotal.toLocaleString("fr-FR")} ${entreprise.devise}`, 195, y, { align: "right" });
  y += 10;

  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, 195, y);
  y += 8;
  doc.setFontSize(12);
  doc.text("Total", 15, y);
  doc.text(`${montantTotal.toLocaleString("fr-FR")} ${entreprise.devise}`, 195, y, { align: "right" });

  y += 16;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...gris);
  doc.text("Ce reçu confirme ta commande. Le paiement se fait à la livraison.", 15, y);

  doc.save(`recu-commande-${entreprise.nom.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}

// Nettoie le HTML des descriptions produit avant affichage publique — retire tout ce qui
// pourrait exécuter du code (scripts, gestionnaires d'événements, liens javascript:),
// sans dépendance externe, en gardant la mise en forme normale (gras, listes, images, liens).
function nettoyerHTML(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;

  const balisesInterdites = ["script", "iframe", "object", "embed", "link", "style", "meta", "base", "form"];
  balisesInterdites.forEach((tag) => {
    div.querySelectorAll(tag).forEach((el) => el.remove());
  });

  const tousLesElements = div.querySelectorAll("*");
  tousLesElements.forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const nom = attr.name.toLowerCase();
      const valeur = attr.value.trim().toLowerCase();
      if (nom.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if ((nom === "href" || nom === "src") && (valeur.startsWith("javascript:") || valeur.startsWith("data:text/html"))) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return div.innerHTML;
}

function lireCookieMeta(nom) {
  const match = document.cookie.match(new RegExp("(^| )" + nom + "=([^;]+)"));
  return match ? match[2] : null;
}

const TRADUCTIONS = {
  fr: {
    rechercher: "Rechercher un produit...",
    nousContacter: "Nous contacter",
    accueil: "Accueil",
    meilleuresVentes: "🔥 Meilleures ventes",
    nouveautes: "✨ Nouveautés",
    badgeLivraison: "🚚 Livraison rapide",
    badgePaiement: "💵 Paiement à la livraison",
    badgeSecurise: "🛡️ Achat sécurisé",
    bestSeller: "Best-seller",
    ventes: "vente(s)",
    avis: "avis",
    livraisonGratuite: "🎁 Livraison gratuite",
    livraisonGratuiteCourt: "Gratuit",
    fraisAChoisir: "🚚 Frais de livraison à choisir à la commande",
    deFraisLivraison: "de frais de livraison",
    plusQue: "Plus que",
    enStock: "en stock",
    offresDispo: "🔥 Offres quantité disponibles — choisis ton pack dans le formulaire de commande",
    aucuneDescription: "Aucune description disponible.",
    avisClients: "Avis clients",
    laisserAvis: "Laisser un avis",
    aucunAvis: "Aucun avis pour le moment. Sois le premier !",
    commandeEnvoyee: "Commande envoyée !",
    merciMerci: "Merci",
    vaTeContacter: "Ta commande est bien enregistrée. Un conseiller va t'appeler au",
    pourConfirmer: "très bientôt — merci de répondre, c'est indispensable pour valider ta livraison.",
    livraisonA: "Livraison à :",
    telephone: "Téléphone :",
    etMaintenant: "Et maintenant ?",
    etape1: "Un conseiller t'appelle pour confirmer ta commande — réponds à son appel",
    etape2: "Ton livreur t'appelle juste avant de passer, avec ta facture",
    etape3: "Tu payes à la réception, une fois satisfait(e)",
    uneQuestion: "💬 Une question ? Contacte-nous",
    continuerAchats: "← Continuer mes achats",
    tuPourraisAimer: "Tu pourrais aussi aimer",
    badgePaiement2: "Paiement à la livraison",
    badgeLivraison2: "Livraison rapide",
    badgeVerifie: "Vérifie avant de payer",
    merciCommander: "⚠️ Merci de ne commander que si tu es réellement intéressé(e)",
    commander: "Commander",
    tesCoordonnees: "Tes coordonnées",
    pourTeContacter: "Pour qu'on puisse te contacter et te livrer.",
    tonNom: "Ton nom",
    tonTelephone: "Ton numéro de téléphone",
    taVille: "Ta ville et ton quartier",
    quantite: "Quantité",
    offresQuantite: "🔥 OFFRES QUANTITÉ",
    prixFixe: "Prix fixe",
    modeLivraison: "Mode de livraison",
    choisisMode: "Choisis un mode de livraison pour continuer.",
    ajouteProduit: "➕ Ajoute un produit à ta commande",
    engagement: "⚠️ En confirmant, tu t'engages à réceptionner ce colis. Merci de ne pas commander \"pour voir\" si tu n'es pas certain(e) d'être intéressé(e).",
    telIncomplet: "⚠️ Ce numéro de téléphone semble incomplet. Vérifie-le avant de continuer.",
    dovaisCocherEngagement: "⚠️ Merci de cocher la case de confirmation avant d'envoyer ta commande.",
    caseEngagement: "Je confirme que je veux vraiment recevoir ce produit et que je répondrai à l'appel de confirmation.",
    onVaAppeler: "📞 Notre équipe t'appellera dans les prochaines heures pour confirmer ta commande — merci de répondre, même à un numéro que tu ne connais pas.",
    confirmer: "Confirmer",
    envoiEnCours: "Envoi...",
    combinaisonIndispo: "⚠️ Cette combinaison n'est pas disponible.",
    varianteRupture: "🔴 Cette variante est en rupture de stock.",
    livraisonRapide: "Livraison rapide",
    paiementLivraison: "Paiement à la livraison",
    retourFacile: "Retour facile",
    achatSecurise: "Achat sécurisé",
    boutique: "Boutique",
    informations: "Informations",
    contact: "Contact",
    politiqueLivraison: "Politique de livraison",
    politiqueRetours: "Politique de retours",
    confidentialite: "Confidentialité",
    discuterWhatsapp: "💬 Discuter sur WhatsApp",
    retourEnHaut: "▲ Retour en haut",
    resteInforme: "Reste informé(e)",
    texteInscriptionNewsletter: "Bonjour, je souhaite recevoir vos offres et nouveautés.",
    sInscrire: "S'inscrire",
    ajouterPanier: "Ajouter au panier",
    proposePar: "Propulsé par RecuVente",
    aucunProduit: "Aucun produit disponible pour le moment.",
    resultatsPour: "Résultats pour",
    tousLesProduits: "Tous les produits",
    voirTout: "Voir tout →",
    voirTousLesProduits: "Voir tous les produits",
    aucunResultat: "Aucun produit ne correspond à ta recherche.",
    retourAccueil: "← Retour à l'accueil",
    erreurGenerique: "Une erreur est survenue, réessaie.",
    envoyerAvis: "Envoyer mon avis",
    tonCommentaire: "Ton commentaire (optionnel)",
    nouveauBadge: "Nouveau",
    restants: "restants",
  },
  en: {
    rechercher: "Search for a product...",
    nousContacter: "Contact us",
    accueil: "Home",
    meilleuresVentes: "🔥 Best sellers",
    nouveautes: "✨ New arrivals",
    badgeLivraison: "🚚 Fast delivery",
    badgePaiement: "💵 Pay on delivery",
    badgeSecurise: "🛡️ Secure purchase",
    bestSeller: "Best-seller",
    ventes: "sale(s)",
    avis: "reviews",
    livraisonGratuite: "🎁 Free delivery",
    livraisonGratuiteCourt: "Free",
    fraisAChoisir: "🚚 Delivery fee to choose at checkout",
    deFraisLivraison: "delivery fee",
    plusQue: "Only",
    enStock: "left in stock",
    offresDispo: "🔥 Quantity deals available — pick your pack in the order form",
    aucuneDescription: "No description available.",
    avisClients: "Customer reviews",
    laisserAvis: "Leave a review",
    aucunAvis: "No reviews yet. Be the first!",
    commandeEnvoyee: "Order sent!",
    merciMerci: "Thank you",
    vaTeContacter: "Your order is confirmed. An advisor will call you at",
    pourConfirmer: "shortly — please answer, it's essential to arrange your delivery.",
    livraisonA: "Deliver to:",
    telephone: "Phone:",
    etMaintenant: "What happens next?",
    etape1: "An advisor calls to confirm your order — please answer",
    etape2: "Your courier calls just before arriving, with your invoice",
    etape3: "You pay on delivery, once you're satisfied",
    uneQuestion: "💬 A question? Contact us",
    continuerAchats: "← Continue shopping",
    tuPourraisAimer: "You might also like",
    badgePaiement2: "Pay on delivery",
    badgeLivraison2: "Fast delivery",
    badgeVerifie: "Check before you pay",
    merciCommander: "⚠️ Please only order if you're genuinely interested",
    commander: "Order",
    tesCoordonnees: "Your details",
    pourTeContacter: "So we can contact you and deliver.",
    tonNom: "Your name",
    tonTelephone: "Your phone number",
    taVille: "Your city and neighborhood",
    quantite: "Quantity",
    offresQuantite: "🔥 QUANTITY DEALS",
    prixFixe: "Fixed price",
    modeLivraison: "Delivery method",
    choisisMode: "Choose a delivery method to continue.",
    ajouteProduit: "➕ Add a product to your order",
    engagement: "⚠️ By confirming, you commit to receiving this package. Please don't order \"just to see\" if you're not sure you're interested.",
    telIncomplet: "⚠️ This phone number looks incomplete. Please check it before continuing.",
    dovaisCocherEngagement: "⚠️ Please check the confirmation box before sending your order.",
    caseEngagement: "I confirm I really want to receive this product and will answer the confirmation call.",
    onVaAppeler: "📞 Our team will call you within the next few hours to confirm your order — please answer, even from a number you don't recognize.",
    confirmer: "Confirm",
    envoiEnCours: "Sending...",
    combinaisonIndispo: "⚠️ This combination isn't available.",
    varianteRupture: "🔴 This variant is out of stock.",
    livraisonRapide: "Fast delivery",
    paiementLivraison: "Pay on delivery",
    retourFacile: "Easy returns",
    achatSecurise: "Secure purchase",
    boutique: "Shop",
    informations: "Information",
    contact: "Contact",
    politiqueLivraison: "Delivery policy",
    politiqueRetours: "Return policy",
    confidentialite: "Privacy",
    discuterWhatsapp: "💬 Chat on WhatsApp",
    retourEnHaut: "▲ Back to top",
    resteInforme: "Stay updated",
    texteInscriptionNewsletter: "Hello, I'd like to receive your offers and updates.",
    sInscrire: "Subscribe",
    ajouterPanier: "Add to cart",
    proposePar: "Powered by RecuVente",
    aucunProduit: "No products available right now.",
    resultatsPour: "Results for",
    tousLesProduits: "All products",
    voirTout: "See all →",
    voirTousLesProduits: "See all products",
    aucunResultat: "No products match your search.",
    retourAccueil: "← Back to home",
    nouveauBadge: "New",
    restants: "left",
    erreurGenerique: "Something went wrong, please try again.",
    envoyerAvis: "Submit my review",
    tonCommentaire: "Your comment (optional)",
  },
};
function luminance(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Pour un texte utilisant la couleur choisie par le marchand sur un fond clair :
// si la couleur est trop pâle pour rester lisible, on la fonce automatiquement
// (le marchand n'a rien à régler en plus, ça reste toujours lisible).
function couleurTexteLisible(hex) {
  if (!hex) return "#16231F";
  if (luminance(hex) > 0.72) return "#16231F";
  return hex;
}

// Pour un texte posé sur un fond de la couleur choisie : blanc si le fond est
// foncé, sombre si le fond est clair — jamais de texte invisible.
function couleurTextePourFond(hexFond) {
  return luminance(hexFond) > 0.6 ? "#16231F" : "#ffffff";
}

function slugifierProduit(nom) {
  return String(nom || "produit")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function urlEmbedVideo(url) {
  if (!url) return "";
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return url;
}

function creerTraducteur(langue) {
  const dict = TRADUCTIONS[langue] || TRADUCTIONS.fr;
  return (cle) => dict[cle] || TRADUCTIONS.fr[cle] || cle;
}

// Règles vérifiées précisément (réformes récentes des plans de numérotation) :
// - Côte d'Ivoire (CI) : passée à 10 chiffres le 31/01/2021, préfixes mobiles 01/05/07/25/27...
// - Bénin (BJ) : passé à 10 chiffres le 30/11/2024, préfixe "01" ajouté devant chaque numéro.
// Règles bien établies et stables (non réformées récemment) :
// - Sénégal (SN) : 9 chiffres, mobile commence par 7.
// - Mali (ML), Burkina Faso (BF), Togo (TG) : 8 chiffres.
// Pour les autres pays listés dans l'app, aucune règle précise n'a été vérifiée ici :
// on applique une plage large (8 à 12 chiffres) plutôt que d'inventer une précision qu'on n'a pas.
const REGLES_TELEPHONE_PAR_PAYS = {
  CI: { longueur: 10, regexPrefixe: /^(01|05|07|21|22|23|24|25|27|30|31|32|33|34|35|36)/, exemple: "07 12 34 56 78" },
  BJ: { longueur: 10, regexPrefixe: /^01/, exemple: "01 97 12 34 56" },
  SN: { longueur: 9, regexPrefixe: /^7/, exemple: "77 123 45 67" },
  ML: { longueur: 8, exemple: "70 12 34 56" },
  BF: { longueur: 8, exemple: "70 12 34 56" },
  TG: { longueur: 8, exemple: "90 12 34 56" },
};

function validerTelephone(numero, codePays) {
  const chiffres = (numero || "").replace(/\D/g, "");
  const regle = REGLES_TELEPHONE_PAR_PAYS[codePays];

  if (regle) {
    if (chiffres.length !== regle.longueur) {
      return { valide: false, message: `Un numéro ${codePays === "CI" ? "ivoirien" : codePays === "BJ" ? "béninois" : codePays === "SN" ? "sénégalais" : "valide pour ce pays"} doit comporter ${regle.longueur} chiffres (ex: ${regle.exemple}).` };
    }
    if (regle.regexPrefixe && !regle.regexPrefixe.test(chiffres)) {
      return { valide: false, message: `Ce numéro ne correspond pas à un préfixe valide (ex: ${regle.exemple}).` };
    }
    return { valide: true, message: "" };
  }

  // Pays sans règle précise vérifiée : on garde un contrôle large, honnête sur son imprécision.
  if (chiffres.length < 8 || chiffres.length > 12) {
    return { valide: false, message: "⚠️ Ce numéro de téléphone semble incomplet. Vérifie-le avant de continuer." };
  }
  return { valide: true, message: "" };
}

function prixUnitairePourBundle(prixVente, bundle) {
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

export default function CataloguePublic({ workspaceId: workspaceIdProp, slug, domaine }) {
  const [workspaceId, setWorkspaceId] = useState(workspaceIdProp || null);
  const [entreprise, setEntreprise] = useState(undefined);
  const [produits, setProduits] = useState([]);
  const [biensLocation, setBiensLocation] = useState([]);
  const [filtreCategorieBien, setFiltreCategorieBien] = useState(null);
  const [bienOuvert, setBienOuvert] = useState(null);
  const [modeChoisi, setModeChoisi] = useState(null);
  const [formBien, setFormBien] = useState({ client: "", tel: "", zone: "", dateDebut: "", dateFin: "", couleur: "" });
  const [envoiBienEnCours, setEnvoiBienEnCours] = useState(false);
  const [erreurEnvoiBien, setErreurEnvoiBien] = useState("");
  const [bienEnvoye, setBienEnvoye] = useState(false);
  const [collectionsManuelles, setCollectionsManuelles] = useState([]);
  const [avisBoutique, setAvisBoutique] = useState([]);
  const [sourceCampagne] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    const utmCampaign = params.get("utm_campaign");
    if (utmSource || utmCampaign) return [utmSource, utmCampaign].filter(Boolean).join(" — ");
    if (params.get("fbclid")) return "Facebook/Instagram Ads";
    if (params.get("ttclid")) return "TikTok Ads";
    return null;
  });
  const [erreur, setErreur] = useState(null);
  const [panier, setPanier] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rv_panier_${workspaceId}`) || "[]"); } catch (_) { return []; }
  });
  const [panierOuvert, setPanierOuvert] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(`rv_panier_${workspaceId}`, JSON.stringify(panier)); } catch (_) {}
  }, [panier, workspaceId]);

  function ajouterAuPanier(p, quantiteAjoutee = 1) {
    setPanier((liste) => {
      const existant = liste.find((it) => it.produit_id === p.produit_id);
      if (existant) {
        return liste.map((it) => it.produit_id === p.produit_id ? { ...it, quantite: it.quantite + quantiteAjoutee } : it);
      }
      return [...liste, { produit_id: p.produit_id, produit_nom: p.produit_nom, prix_unitaire: Number(p.prix_vente), photo_url: p.photo_url, quantite: quantiteAjoutee, livraison_gratuite: !!p.livraison_gratuite, frais_livraison_produit: p.frais_livraison_produit, frais_expedition_produit: p.frais_expedition_produit }];
    });
    setPanierOuvert(true);
  }

  function modifierQuantitePanier(produitId, nouvelleQuantite) {
    if (nouvelleQuantite <= 0) { retirerDuPanier(produitId); return; }
    setPanier((liste) => liste.map((it) => it.produit_id === produitId ? { ...it, quantite: nouvelleQuantite } : it));
  }

  function retirerDuPanier(produitId) {
    setPanier((liste) => liste.filter((it) => it.produit_id !== produitId));
  }

  function viderPanier() {
    setPanier([]);
  }

  const totalArticlesPanier = panier.reduce((s, it) => s + it.quantite, 0);
  const totalPanier = panier.reduce((s, it) => s + it.prix_unitaire * it.quantite, 0);
  const [produitOuvert, setProduitOuvert] = useState(null);

  useEffect(() => {
    if (entreprise === undefined || entreprise === null) return;

    function definirMeta(nomOuProp, contenu, estProperty) {
      const selecteur = estProperty ? `meta[property="${nomOuProp}"]` : `meta[name="${nomOuProp}"]`;
      let balise = document.querySelector(selecteur);
      if (!balise) {
        balise = document.createElement("meta");
        if (estProperty) balise.setAttribute("property", nomOuProp);
        else balise.setAttribute("name", nomOuProp);
        document.head.appendChild(balise);
      }
      balise.setAttribute("content", contenu || "");
    }

    // Chaque boutique doit afficher SON logo dans l'onglet du navigateur, pas
    // celui de RecuVente. setAttribute seul ne suffit pas toujours à forcer les
    // navigateurs à rafraîchir le favicon affiché : on supprime les anciens liens
    // et on en recrée de nouveaux, avec un paramètre pour casser le cache.
    if (entreprise.logo) {
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((lien) => lien.remove());
      const urlLogoAvecCache = `${entreprise.logo}${entreprise.logo.includes("?") ? "&" : "?"}v=${encodeURIComponent(entreprise.slug || "shop")}`;
      [
        { rel: "icon", type: "image/png", sizes: "192x192" },
        { rel: "icon", type: "image/png", sizes: "512x512" },
        { rel: "apple-touch-icon" },
      ].forEach((attrs) => {
        const lien = document.createElement("link");
        Object.entries(attrs).forEach(([k, v]) => lien.setAttribute(k, v));
        lien.setAttribute("href", urlLogoAvecCache);
        document.head.appendChild(lien);
      });
    }

    if (produitOuvert) {
      const titre = `${produitOuvert.produit_nom} — ${entreprise.nom}`;
      const description = (produitOuvert.produit_description || entreprise.description || "").replace(/<[^>]*>/g, "").slice(0, 160);
      document.title = titre;
      definirMeta("description", description);
      definirMeta("og:title", titre, true);
      definirMeta("og:description", description, true);
      if (produitOuvert.photo_url) definirMeta("og:image", produitOuvert.photo_url, true);
      definirMeta("og:type", "product", true);
    } else {
      const titre = entreprise.nom;
      const description = (entreprise.description || `Découvrez les produits de ${entreprise.nom}, paiement à la livraison.`).slice(0, 160);
      document.title = titre;
      definirMeta("description", description);
      definirMeta("og:title", titre, true);
      definirMeta("og:description", description, true);
      if (entreprise.logo) definirMeta("og:image", entreprise.logo, true);
      definirMeta("og:type", "website", true);
    }
  }, [entreprise, produitOuvert]);

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [form, setForm] = useState({ client: "", tel: "", zone: "", champPiege: "" });
  const momentOuvertureFormulaireRef = useRef(null);
  const [quantite, setQuantite] = useState(1);
  const [typeLivraisonChoisi, setTypeLivraisonChoisi] = useState(null);
  const [photoActive, setPhotoActive] = useState(0);
  const [avisListe, setAvisListe] = useState([]);
  const [afficherFormAvis, setAfficherFormAvis] = useState(false);
  const [formAvis, setFormAvis] = useState({ nom: "", note: 5, commentaire: "" });
  const [photoAvis, setPhotoAvis] = useState(null);
  const [photoAvisApercu, setPhotoAvisApercu] = useState("");
  const [envoiPhotoAvisEnCours, setEnvoiPhotoAvisEnCours] = useState(false);
  const [envoiAvis, setEnvoiAvis] = useState(false);
  const [avisEnvoye, setAvisEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [engagementCoche, setEngagementCoche] = useState(false);
  const [codePromoInput, setCodePromoInput] = useState("");
  const [codePromoApplique, setCodePromoApplique] = useState(null);
  const [codePromoMessage, setCodePromoMessage] = useState("");
  const [verificationCodePromoEnCours, setVerificationCodePromoEnCours] = useState(false);
  const [lienCopie, setLienCopie] = useState(false);
  const [politiqueOuverte, setPolitiqueOuverte] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [collectionOuverte, setCollectionOuverte] = useState(null);
  const [bundleChoisiId, setBundleChoisiId] = useState(null);
  const [optionsChoisies, setOptionsChoisies] = useState({});
  const [produitBumpId, setProduitBumpId] = useState(null);

  function chargerPixelFacebook(pixelId) {
    if (!pixelId || window.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
  }

  function chargerPixelTiktok(pixelId) {
    if (!pixelId || window.ttq) return;
    (function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      var ttq = (w[t] = w[t] || []);
      ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
      ttq.setAndDefer = function (t, e) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) {
        var e = ttq._i[t] || [];
        for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e;
      };
      ttq.load = function (e, n) {
        var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = i;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        var o = d.createElement("script");
        o.type = "text/javascript";
        o.async = !0;
        o.src = i + "?sdkid=" + e + "&lib=" + t;
        var a = d.getElementsByTagName("script")[0];
        a.parentNode.insertBefore(o, a);
      };
      ttq.load(pixelId);
      ttq.page();
    })(window, document, "ttq");
  }

  function trackEvenement(nom, params) {
    if (window.fbq) window.fbq("track", nom, params);
    if (window.ttq) {
      window.ttq.track(nom, {
        content_id: params?.content_ids?.[0],
        content_type: "product",
        content_name: params?.content_name,
        value: params?.value,
        currency: params?.currency,
      });
    }
  }

  useEffect(() => {
    if (workspaceIdProp || !slug) return;
    supabase.rpc("workspace_id_par_slug", { p_slug: slug }).then(({ data, error }) => {
      if (error || !data) {
        setErreur("Cette boutique est introuvable.");
        return;
      }
      setWorkspaceId(data);
    });
  }, [slug, workspaceIdProp]);

  useEffect(() => {
    if (workspaceIdProp || slug || !domaine) return;
    supabase.rpc("workspace_id_par_domaine", { p_domaine: domaine }).then(({ data, error }) => {
      if (error || !data) {
        setErreur("Cette boutique est introuvable.");
        return;
      }
      setWorkspaceId(data);
    });
  }, [domaine, slug, workspaceIdProp]);

  useEffect(() => {
    if (!workspaceId) return;

    // Enregistre une vraie visite (une seule fois par ouverture de page) — capte la source
    // si un lien publicitaire ajoute ?utm_source=facebook (ou autre) à l'adresse.
    const paramsUrl = new URLSearchParams(window.location.search);
    const sourceDetectee = paramsUrl.get("utm_source") || paramsUrl.get("source") || null;
    supabase.rpc("enregistrer_visite_boutique", { p_workspace_id: workspaceId, p_source: sourceDetectee }).then(() => {});

    supabase.rpc("catalogue_public", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce catalogue est introuvable ou vide.");
        return;
      }
      setEntreprise({
        nom: data[0].entreprise_nom,
        devise: data[0].devise,
        logo: data[0].logo_url,
        banniere: data[0].banniere_url,
        couleur: data[0].couleur_marque || "#1a7a3c",
        description: data[0].description_boutique,
        whatsapp: data[0].whatsapp_number,
        politiqueLivraison: data[0].politique_livraison,
        politiqueRetours: data[0].politique_retours,
        politiqueConfidentialite: data[0].politique_confidentialite,
        marqueBlanche: data[0].marque_blanche,
        fraisLivraison: Number(data[0].frais_livraison || 0),
        fraisExpedition: Number(data[0].frais_expedition || 0),
        facebookUrl: data[0].facebook_url,
        instagramUrl: data[0].instagram_url,
        tiktokUrl: data[0].tiktok_url,
        storeConfig: data[0].store_config_published || null,
        country: data[0].country || null,
        countriesLivraison: Array.isArray(data[0].countries_livraison) ? data[0].countries_livraison : [],
        depotRequis: data[0].depot_requis || false,
        depotMontant: data[0].depot_montant,
        depotMessage: data[0].depot_message || "",
        boutiqueActive: data[0].boutique_active !== false,
        slug: data[0].slug || null,
        labelLivraisonLocale: data[0].label_livraison_locale || "Livraison locale",
        labelLivraisonExpedition: data[0].label_livraison_expedition || "Autre ville",
        temoignagesManuels: Array.isArray(data[0].temoignages_manuels) ? data[0].temoignages_manuels : [],
        langue: data[0].langue || "fr",
      });
      chargerPixelFacebook(data[0].facebook_pixel_id);
      chargerPixelTiktok(data[0].tiktok_pixel_id);
      if (data[0].facebook_domain_verification) {
        const balise = document.createElement("meta");
        balise.name = "facebook-domain-verification";
        balise.content = data[0].facebook_domain_verification;
        document.head.appendChild(balise);
      }
      const listeProduits = data.filter((p) => p.produit_nom);
      setProduits(listeProduits);

      const idProduitDansUrl = new URLSearchParams(window.location.search).get("produit");
      if (idProduitDansUrl) {
        const suffixe8 = idProduitDansUrl.slice(-8);
        const trouve = listeProduits.find((p) => p.produit_id === idProduitDansUrl || p.produit_id.slice(0, 8) === suffixe8);
        if (trouve) {
          setProduitOuvert(trouve);
          setForm({ client: "", tel: "", zone: "" });
        }
      }

      // Petit chargement séparé, sans toucher à la fonction catalogue_public existante,
      // pour récupérer les textes personnalisables du design dédié Azali Express.
      if ((data[0].slug || "") === "azaliexpress") {
        supabase.rpc("azali_config_public", { p_workspace_id: workspaceId }).then(({ data: dataConfig }) => {
          if (dataConfig) {
            setEntreprise((e) => ({ ...e, azaliConfig: dataConfig }));
          }
        });
      }

      // Charge les véhicules/machines/bennes/maisons à 3 modes d'acquisition — réservé à cette
      // boutique précise (Luxury Car), aucune autre boutique n'est concernée par cette fonctionnalité.
      if ((data[0].slug || "") === "luxury-car") {
        supabase.rpc("biens_location_public", { p_workspace_id: workspaceId }).then(({ data: dataBiens }) => {
          setBiensLocation(dataBiens || []);
          const idBienDansUrl = new URLSearchParams(window.location.search).get("bien");
          if (idBienDansUrl && dataBiens) {
            const trouve = dataBiens.find((b) => b.id === idBienDansUrl || b.id.slice(0, 8) === idBienDansUrl.slice(-8));
            if (trouve) setBienOuvert(trouve);
          }
        });
      }
    });
  }, [workspaceId]);

  // Ces deux requêtes ne dépendent pas du résultat de catalogue_public : elles partent
  // en même temps (en parallèle), au lieu d'attendre qu'il ait fini — la boutique
  // s'affiche complètement d'un coup, plus de second temps de chargement visible.
  useEffect(() => {
    if (!workspaceId) return;

    supabase.rpc("temoignages_publics", { p_workspace_id: workspaceId }).then(({ data: dataTemoignages }) => {
      setAvisBoutique(dataTemoignages || []);
    });

    supabase.rpc("collections_publiques", { p_workspace_id: workspaceId }).then(({ data: dataCollections }) => {
      if (!dataCollections || dataCollections.length === 0) return;
      const parCollection = {};
      dataCollections.forEach((ligne) => {
        if (!parCollection[ligne.collection_id]) {
          parCollection[ligne.collection_id] = { id: ligne.collection_id, nom: ligne.collection_nom, ordre: ligne.ordre, produitIds: [] };
        }
        parCollection[ligne.collection_id].produitIds.push(ligne.produit_id);
      });
      setCollectionsManuelles(Object.values(parCollection).sort((a, b) => a.ordre - b.ordre));
    });
  }, [workspaceId]);

  function ouvrirProduit(p) {
    trackEvenement("ViewContent", { content_ids: [p.produit_id], content_name: p.produit_nom, value: Number(p.prix_vente), currency: entreprise?.devise || "XOF" });
    setProduitOuvert(p);
    setAfficherFormulaire(false);
    setForm({ client: "", tel: "", zone: "" });
    setQuantite(1);
    setBundleChoisiId(null);
    setOptionsChoisies({});
    setProduitBumpId(null);
    setTypeLivraisonChoisi(entreprise?.fraisExpedition > 0 ? null : "livraison");
    setPhotoActive(0);
    setEnvoye(false);
    setErreurEnvoi("");
    setAvisListe([]);
    setAfficherFormAvis(false);
    setFormAvis({ nom: "", note: 5, commentaire: "" });
    setAvisEnvoye(false);
    supabase.rpc("avis_produit_public", { p_produit_id: p.produit_id }).then(({ data }) => {
      // On n'affiche que les avis avec un vrai commentaire — un avis "juste des étoiles, sans texte"
      // n'apporte rien visuellement et alourdit la liste inutilement.
      setAvisListe((data || []).filter((a) => a.commentaire && a.commentaire.trim().length > 0));
    });
    const url = new URL(window.location.href);
    url.searchParams.set("produit", `${slugifierProduit(p.produit_nom)}-${p.produit_id.slice(0, 8)}`);
    window.history.pushState({}, "", url);
    window.scrollTo(0, 0);
  }

  async function soumettreAvis() {
    if (!formAvis.nom.trim()) return;
    setEnvoiAvis(true);
    let photoUrlEnvoi = null;
    if (photoAvis) {
      setEnvoiPhotoAvisEnCours(true);
      const extension = (photoAvis.name.split(".").pop() || "jpg").toLowerCase();
      const chemin = `avis-${produitOuvert.produit_id}-${Date.now()}.${extension}`;
      const { error: erreurUpload } = await supabase.storage.from("produits").upload(chemin, photoAvis, { upsert: true, contentType: photoAvis.type || undefined });
      if (!erreurUpload) {
        const { data: dataUrl } = supabase.storage.from("produits").getPublicUrl(chemin);
        photoUrlEnvoi = dataUrl.publicUrl;
      }
      setEnvoiPhotoAvisEnCours(false);
    }
    const { data, error } = await supabase.rpc("soumettre_avis_public_avec_photo", {
      p_workspace_id: workspaceId,
      p_produit_id: produitOuvert.produit_id,
      p_client_nom: formAvis.nom,
      p_note: formAvis.note,
      p_commentaire: formAvis.commentaire,
      p_photo_url: photoUrlEnvoi,
    });
    setEnvoiAvis(false);
    if (!error && data?.[0]?.succes) {
      setAvisEnvoye(true);
    }
  }

  function fermerProduit() {
    setProduitOuvert(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
  }

  function naviguerVersCollection(id) {
    setProduitOuvert(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
    setCollectionOuverte(id);
    window.scrollTo(0, 0);
  }

  async function verifierCodePromo(montantAvantRemise) {
    if (!codePromoInput.trim()) return;
    setVerificationCodePromoEnCours(true);
    setCodePromoMessage("");
    const { data, error } = await supabase.rpc("valider_code_promo", {
      p_workspace_id: workspaceId,
      p_code: codePromoInput.trim(),
      p_montant_commande: montantAvantRemise,
    });
    setVerificationCodePromoEnCours(false);
    const resultat = data && data[0];
    if (error || !resultat?.valide) {
      setCodePromoApplique(null);
      setCodePromoMessage(resultat?.message || "Code promo invalide.");
      return;
    }
    setCodePromoApplique({ code: codePromoInput.trim().toUpperCase(), montant_remise: Number(resultat.montant_remise) });
    setCodePromoMessage(resultat.message);
  }

  async function envoyerCommande() {
    if (form.champPiege) return; // Champ piège rempli = probablement un robot, on ignore silencieusement.
    if (momentOuvertureFormulaireRef.current && Date.now() - momentOuvertureFormulaireRef.current < 2500) {
      setErreurEnvoi("Merci de prendre un instant pour vérifier tes informations avant d'envoyer.");
      return;
    }
    if (!form.client.trim() || !form.tel.trim() || !form.zone.trim()) {
      setErreurEnvoi("Merci de renseigner ton nom, ton téléphone et ta ville/quartier.");
      return;
    }
    const chiffresTelEnvoi = form.tel.replace(/\D/g, "");
    if (chiffresTelEnvoi.length < 8) {
      setErreurEnvoi(t("telIncomplet"));
      return;
    }
    const verifTel = validerTelephone(form.tel, entreprise.country);
    if (!verifTel.valide) {
      setErreurEnvoi(verifTel.message);
      return;
    }
    if (!engagementCoche) {
      setErreurEnvoi(t("dovaisCocherEngagement"));
      return;
    }
    const optionsProduitEnvoi = Array.isArray(produitOuvert.options) ? produitOuvert.options : [];
    if (optionsProduitEnvoi.length > 0) {
      const toutesChoisiesEnvoi = optionsProduitEnvoi.every((o) => optionsChoisies[o.nom]);
      if (!toutesChoisiesEnvoi) {
        setErreurEnvoi(`⚠️ Merci de choisir ${optionsProduitEnvoi.map((o) => o.nom.toLowerCase()).join(", ")} avant de confirmer.`);
        return;
      }
      const varianteEnvoi = (Array.isArray(produitOuvert.variantes) ? produitOuvert.variantes : []).find((v) => optionsProduitEnvoi.every((o) => v.combinaison[o.nom] === optionsChoisies[o.nom]));
      if (!varianteEnvoi) {
        setErreurEnvoi("⚠️ Cette combinaison n'est pas disponible.");
        return;
      }
      if (Number(varianteEnvoi.stock ?? 0) <= 0) {
        setErreurEnvoi("⚠️ Cette variante est en rupture de stock.");
        return;
      }
    }
    const livraisonGratuiteV = !!produitOuvert.livraison_gratuite;
    const fraisExpeditionV = livraisonGratuiteV ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
    const aChoixLivraisonV = !livraisonGratuiteV && fraisExpeditionV > 0;
    if (aChoixLivraisonV && !typeLivraisonChoisi) {
      setErreurEnvoi("⚠️ Merci de choisir un mode de livraison ci-dessus avant de confirmer.");
      return;
    }
    setEnvoi(true);
    setErreurEnvoi("");
    const bundleActifEnvoi = optionsProduitEnvoi.length > 0 ? null : (Array.isArray(produitOuvert.bundles) ? produitOuvert.bundles : []).find((b) => b.id === bundleChoisiId) || null;
    const varianteChoisieEnvoi = optionsProduitEnvoi.length > 0
      ? (Array.isArray(produitOuvert.variantes) ? produitOuvert.variantes : []).find((v) => optionsProduitEnvoi.every((o) => v.combinaison[o.nom] === optionsChoisies[o.nom]))
      : null;
    const prixUnitaireEnvoi = varianteChoisieEnvoi
      ? (varianteChoisieEnvoi.prix != null ? Number(varianteChoisieEnvoi.prix) : Number(produitOuvert.prix_vente))
      : prixUnitairePourBundle(produitOuvert.prix_vente, bundleActifEnvoi);
    const nomProduitEnvoi = varianteChoisieEnvoi
      ? `${produitOuvert.produit_nom} — ${Object.values(varianteChoisieEnvoi.combinaison).join(" / ")}`
      : produitOuvert.produit_nom;
    const produitBump = produitBumpId ? produits.find((p) => p.produit_id === produitBumpId) : null;
    const items = [{
      produit_id: produitOuvert.produit_id,
      produit_nom: nomProduitEnvoi,
      quantite: quantite,
      prix_unitaire: prixUnitaireEnvoi,
    }];
    if (produitBump) {
      items.push({
        produit_id: produitBump.produit_id,
        produit_nom: produitBump.produit_nom,
        quantite: 1,
        prix_unitaire: produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(produitBump.prix_vente),
      });
    }
    // Applique la remise du code promo directement sur le prix du produit principal envoyé au
    // serveur — évite de devoir changer la structure de la fonction de création de commande existante.
    if (codePromoApplique && codePromoApplique.montant_remise > 0) {
      const remiseParUnite = codePromoApplique.montant_remise / quantite;
      items[0].prix_unitaire = Math.max(0, items[0].prix_unitaire - remiseParUnite);
    }
    const { data, error } = await supabase.rpc("creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: form.zone,
      p_items: items,
      p_type_livraison: (() => {
        const livraisonGratuiteP = !!produitOuvert.livraison_gratuite;
        const fraisExpeditionP = livraisonGratuiteP ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
        return !livraisonGratuiteP && fraisExpeditionP > 0 ? typeLivraisonChoisi : "livraison";
      })(),
      p_fbp: lireCookieMeta("_fbp"),
      p_fbc: lireCookieMeta("_fbc"),
      p_user_agent: navigator.userAgent,
      p_event_source_url: window.location.href,
      p_source_campagne: sourceCampagne,
    });
    setEnvoi(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoi(resultat?.message || t("erreurGenerique"));
      return;
    }
    trackEvenement("Lead", {
      content_ids: [produitOuvert.produit_id],
      value: items.reduce((s, it) => s + it.prix_unitaire * it.quantite, 0),
      currency: entreprise?.devise || "XOF",
    });
    if (codePromoApplique) {
      supabase.rpc("incrementer_utilisation_code_promo", { p_workspace_id: workspaceId, p_code: codePromoApplique.code }).then(() => {});
    }
    supabase.rpc("marquer_panier_converti", { p_workspace_id: workspaceId, p_tel: form.tel, p_produit_id: produitOuvert.produit_id }).then(() => {});
    setEnvoye(true);
  }

  // Détecte un panier abandonné : dès que le client a tapé un numéro de téléphone valide sur
  // une fiche produit et qu'il reste 5 secondes sans finaliser, on l'enregistre discrètement —
  // s'il commande ensuite, ce panier est automatiquement marqué comme converti.
  useEffect(() => {
    if (!produitOuvert || !workspaceId) return;
    const chiffresTel = (form.tel || "").replace(/\D/g, "");
    if (chiffresTel.length < 8 || envoye) return;
    const delai = setTimeout(() => {
      supabase.rpc("enregistrer_panier_abandonne", {
        p_workspace_id: workspaceId,
        p_client_nom: form.client || null,
        p_tel: form.tel,
        p_produit_id: produitOuvert.produit_id,
        p_produit_nom: produitOuvert.produit_nom,
        p_montant: Number(produitOuvert.prix_vente) || null,
      }).then(() => {});
    }, 5000);
    return () => clearTimeout(delai);
  }, [form.tel, form.client, produitOuvert?.produit_id, workspaceId, envoye]);

  async function envoyerCommandeBien() {
    if (!bienOuvert || !modeChoisi) return;
    if (!formBien.client.trim() || !formBien.tel.trim()) {
      setErreurEnvoiBien("Nom et téléphone obligatoires.");
      return;
    }
    if (modeChoisi === "location" && (!formBien.dateDebut || !formBien.dateFin)) {
      setErreurEnvoiBien("Choisis les dates de location.");
      return;
    }
    if (Array.isArray(bienOuvert.couleurs_disponibles) && bienOuvert.couleurs_disponibles.length > 0 && !formBien.couleur) {
      setErreurEnvoiBien("Choisis une couleur.");
      return;
    }
    setEnvoiBienEnCours(true);
    setErreurEnvoiBien("");
    const { data, error } = await supabase.rpc("creer_commande_bien_location_publique", {
      p_workspace_id: workspaceId,
      p_bien_id: bienOuvert.id,
      p_client: formBien.client,
      p_tel: formBien.tel,
      p_mode_acquisition: modeChoisi,
      p_date_debut: modeChoisi === "location" ? formBien.dateDebut : null,
      p_date_fin: modeChoisi === "location" ? formBien.dateFin : null,
      p_zone: formBien.zone || null,
      p_couleur: formBien.couleur || null,
    });
    setEnvoiBienEnCours(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoiBien(resultat?.message || "Erreur, réessaie.");
      return;
    }
    setBienEnvoye(true);
  }

  const couleur = entreprise?.couleur || "#1a7a3c";
  const t = creerTraducteur(entreprise?.langue);

  if (entreprise === undefined && !erreur) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "sans-serif", background: "#FAFAF7" }}>
        <style>{`@keyframes rvPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } } .rv-skel { animation: rvPulse 1.4s ease-in-out infinite; background: #E5E2D8; border-radius: 8px; }`}</style>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div className="rv-skel" style={{ width: 100, height: 32 }} />
          <div className="rv-skel" style={{ flex: 1, height: 32, borderRadius: 8 }} />
          <div className="rv-skel" style={{ width: 60, height: 32 }} />
        </div>
        <div className="rv-skel" style={{ margin: "0 16px 16px", height: 200, borderRadius: 14 }} />
        <div style={{ display: "flex", gap: 12, padding: "0 16px", overflow: "hidden" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ flexShrink: 0, width: 150 }}>
              <div className="rv-skel" style={{ width: "100%", height: 130, marginBottom: 8 }} />
              <div className="rv-skel" style={{ width: "80%", height: 12, marginBottom: 6 }} />
              <div className="rv-skel" style={{ width: "50%", height: 12 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (erreur) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
        </div>
      </div>
    );
  }

  if (entreprise && entreprise.boutiqueActive === false) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "sans-serif", background: "#FAFAF7" }}>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 380 }}>
          {entreprise.logo && <img src={entreprise.logo} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "contain", marginBottom: 14 }} />}
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: "#16231F" }}>Boutique temporairement indisponible</div>
          <div style={{ color: "#6B7168", fontSize: 13.5, lineHeight: 1.6 }}>
            Cette boutique n'accepte plus de commandes pour le moment. Reviens un peu plus tard.
          </div>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN FICHE BIEN À 3 MODES (véhicules de luxe, machines, bennes, maisons) =====
  if (bienOuvert) {
    const modesDisponibles = [
      bienOuvert.mode_location && { cle: "location", icone: "🔑", label: "Louer" },
      bienOuvert.mode_commander && { cle: "commander", icone: "📦", label: "Commander" },
      bienOuvert.mode_payer_maintenant && { cle: "payer_maintenant", icone: "💵", label: "Payer maintenant" },
    ].filter(Boolean);

    const nbJours = (modeChoisi === "location" && formBien.dateDebut && formBien.dateFin)
      ? Math.max(1, Math.round((new Date(formBien.dateFin) - new Date(formBien.dateDebut)) / 86400000) + 1)
      : 0;
    const montantEstime = modeChoisi === "location" ? nbJours * Number(bienOuvert.prix_jour || 0) : Number(bienOuvert.prix_vente_direct || 0);

    if (bienEnvoye) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", background: "#FAFAF7" }}>
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 20, padding: 32, textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 46, marginBottom: 14 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>Demande envoyée !</div>
            <div style={{ color: "#6B7168", fontSize: 13.5, lineHeight: 1.6 }}>
              Notre équipe va te contacter très vite sur {formBien.tel} pour confirmer les détails.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "sans-serif" }}>
        <div style={{ background: "white", padding: "14px 16px", borderBottom: "1px solid #ECE8DC", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { setBienOuvert(null); setModeChoisi(null); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{entreprise.nom}</div>
        </div>

        {bienOuvert.photo_url && <img src={bienOuvert.photo_url} alt="" style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />}

        <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{bienOuvert.categorie}</div>
          <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{bienOuvert.nom}</div>
          {bienOuvert.description && <div style={{ fontSize: 13.5, color: "#6B7168", lineHeight: 1.6, marginBottom: 18 }}>{bienOuvert.description}</div>}

          {Array.isArray(bienOuvert.couleurs_disponibles) && bienOuvert.couleurs_disponibles.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F", marginBottom: 8 }}>Choisis la couleur</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {bienOuvert.couleurs_disponibles.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setFormBien({ ...formBien, couleur: c }); setErreurEnvoiBien(""); }}
                    style={{ padding: "9px 16px", borderRadius: 999, border: `2px solid ${formBien.couleur === c ? couleur : "#ECE8DC"}`, background: formBien.couleur === c ? `${couleur}15` : "white", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F", marginBottom: 8 }}>Comment veux-tu ce bien ?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            {modesDisponibles.map((m) => (
              <button
                key={m.cle}
                onClick={() => { setModeChoisi(m.cle); setErreurEnvoiBien(""); }}
                style={{ flex: "1 1 auto", minWidth: 110, padding: "12px 10px", borderRadius: 12, border: `2px solid ${modeChoisi === m.cle ? couleur : "#ECE8DC"}`, background: modeChoisi === m.cle ? `${couleur}15` : "white", cursor: "pointer", textAlign: "center" }}
              >
                <div style={{ fontSize: 20 }}>{m.icone}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{m.label}</div>
              </button>
            ))}
          </div>

          {modeChoisi && (
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18 }}>
              {modeChoisi === "location" && (
                <>
                  <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 10 }}>{Number(bienOuvert.prix_jour).toLocaleString("fr-FR")} {entreprise.devise} / jour{Number(bienOuvert.caution_suggeree) > 0 && ` · Caution : ${Number(bienOuvert.caution_suggeree).toLocaleString("fr-FR")} ${entreprise.devise}`}</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Du</div>
                      <input type="date" value={formBien.dateDebut} onChange={(e) => setFormBien({ ...formBien, dateDebut: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Au</div>
                      <input type="date" value={formBien.dateFin} onChange={(e) => setFormBien({ ...formBien, dateFin: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                  </div>
                  {nbJours > 0 && (
                    <div style={{ background: "#EAF3DE", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: "#3B6D11" }}>
                      {nbJours} jour{nbJours > 1 ? "s" : ""} — Total : {montantEstime.toLocaleString("fr-FR")} {entreprise.devise}
                    </div>
                  )}
                </>
              )}
              {modeChoisi === "commander" && (
                <div style={{ background: "#EAF0FB", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: "#1E4B8C", lineHeight: 1.5 }}>
                  📦 Prix : <strong>{montantEstime.toLocaleString("fr-FR")} {entreprise.devise}</strong><br />
                  Délai estimé : <strong>{bienOuvert.delai_commande_estime || "à confirmer avec toi"}</strong>
                </div>
              )}
              {modeChoisi === "payer_maintenant" && (
                <div style={{ background: "#FBF3E3", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: "#8A6412" }}>
                  💵 Prix : <strong>{montantEstime.toLocaleString("fr-FR")} {entreprise.devise}</strong> — déjà disponible, livraison rapide.
                </div>
              )}

              <input placeholder="Ton nom complet" value={formBien.client} onChange={(e) => setFormBien({ ...formBien, client: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 8, boxSizing: "border-box" }} />
              <input placeholder="Ton numéro de téléphone" value={formBien.tel} onChange={(e) => setFormBien({ ...formBien, tel: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 8, boxSizing: "border-box" }} />
              <input placeholder="Ta ville / commune (optionnel)" value={formBien.zone} onChange={(e) => setFormBien({ ...formBien, zone: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 12, boxSizing: "border-box" }} />

              {erreurEnvoiBien && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{erreurEnvoiBien}</div>}

              <button
                onClick={envoyerCommandeBien}
                disabled={envoiBienEnCours}
                style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                {envoiBienEnCours ? "Envoi..." : `Confirmer ma demande`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== ÉCRAN FICHE PRODUIT (commande directe) =====
  if (produitOuvert) {
    const livraisonGratuite = !!produitOuvert.livraison_gratuite;
    const fraisLivraisonEffectif = livraisonGratuite ? 0 : Number(produitOuvert.frais_livraison_produit ?? entreprise.fraisLivraison ?? 0);
    const fraisExpeditionEffectif = livraisonGratuite ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
    const aChoixLivraison = !livraisonGratuite && fraisExpeditionEffectif > 0;
    const bundlesProduit = Array.isArray(produitOuvert.bundles) ? produitOuvert.bundles : [];
    const bundleActif = bundlesProduit.find((b) => b.id === bundleChoisiId) || null;
    const optionsProduitListe = Array.isArray(produitOuvert.options) ? produitOuvert.options : [];
    const variantesProduit = Array.isArray(produitOuvert.variantes) ? produitOuvert.variantes : [];
    const toutesOptionsChoisies = optionsProduitListe.length > 0 && optionsProduitListe.every((o) => optionsChoisies[o.nom]);
    const varianteActive = toutesOptionsChoisies
      ? variantesProduit.find((v) => optionsProduitListe.every((o) => v.combinaison[o.nom] === optionsChoisies[o.nom]))
      : null;
    const prixUnitaireEffectif = varianteActive
      ? (varianteActive.prix != null ? Number(varianteActive.prix) : Number(produitOuvert.prix_vente))
      : prixUnitairePourBundle(produitOuvert.prix_vente, bundleActif);
    const stockVarianteActive = varianteActive ? Number(varianteActive.stock ?? 0) : null;
    const varianteEnRupture = varianteActive && stockVarianteActive <= 0;
    const fraisLivraisonActuel = aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionEffectif : fraisLivraisonEffectif) : (fraisLivraisonEffectif || 0);

    if (envoye) {
      return (
        <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "sans-serif", display: "flex", justifyContent: "center", padding: "20px 16px" }}>
          <div style={{ width: "100%", maxWidth: 420, textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: "#16231F" }}>{t("commandeEnvoyee")}</div>
            <div style={{ fontSize: 13.5, color: "#6B7168", marginBottom: 24, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
              {t("merciMerci")} {form.client.split(" ")[0]} 🙏 {t("vaTeContacter")} <strong>{form.tel}</strong> {t("pourConfirmer")}
            </div>

            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #ECE8DC" }}>
                {produitOuvert.photo_url ? (
                  <img src={produitOuvert.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📦</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quantite} × {produitOuvert.produit_nom}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>{(prixUnitaireEffectif * quantite + fraisLivraisonActuel).toLocaleString("fr-FR")} {entreprise.devise}</div>
                  {(fraisLivraisonEffectif > 0 || fraisExpeditionEffectif > 0) && (
                    <div style={{ fontSize: 11, color: "#8A9089" }}>
                      dont {fraisLivraisonActuel.toLocaleString("fr-FR")} {entreprise.devise} de {typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "#6B7168", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#16231F" }}>{t("livraisonA")}</strong> {form.zone}</div>
                <div><strong style={{ color: "#16231F" }}>{t("telephone")}</strong> {form.tel}</div>
              </div>
            </div>

            <button
              onClick={() => genererRecuClientPDF(
                entreprise,
                form,
                produitOuvert,
                quantite,
                prixUnitaireEffectif * quantite + fraisLivraisonActuel,
                aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale) : null
              )}
              style={{ width: "100%", background: "white", border: `1.5px solid ${couleur}`, color: couleur, borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 20 }}
            >
              📄 Télécharger mon reçu
            </button>

            <div style={{ textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{t("etMaintenant")}</div>
              {[
                { n: "1", texte: t("etape1") },
                { n: "2", texte: t("etape2") },
                { n: "3", texte: t("etape3") },
              ].map((etape) => (
                <div key={etape.n} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#EAF3DE", color: "#3B6D11", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{etape.n}</div>
                  <div style={{ fontSize: 12.5, color: "#16231F" }}>{etape.texte}</div>
                </div>
              ))}
            </div>

            {entreprise.whatsapp && (
              <a
                href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, j'ai une question sur ma commande de "${produitOuvert.produit_nom}".`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", background: "#EAF3DE", color: "#3B6D11", border: "1px solid #C7DDA3", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, textDecoration: "none", marginBottom: 10 }}
              >
                {t("uneQuestion")}
              </a>
            )}
            <button
              onClick={fermerProduit}
              style={{ width: "100%", background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {t("continuerAchats")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: "100vh", background: "white", fontFamily: "sans-serif" }}>
        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={fermerProduit} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); fermerProduit(); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} />

        <style>{`
          .rv-shop-produit-wrap { max-width: 480px; margin: 0 auto; }
          @media (min-width: 900px) {
            .rv-shop-produit-wrap { max-width: 1000px; padding: 0 32px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start; margin-top: 24px; }
            .rv-shop-produit-photo-col { position: sticky; top: 24px; width: 100%; min-width: 0; }
            .rv-shop-produit-photo { border-radius: 16px; }
            .rv-shop-produit-back { display: none !important; }
            .rv-shop-produit-info { padding: 0 0 100px !important; }
            .rv-shop-cta-bar-inner { max-width: 1000px; margin: 0 auto; padding: 0 32px; box-sizing: border-box; }
          }
        `}</style>

        <div className="rv-shop-produit-wrap">
          <div className="rv-shop-produit-photo-col" style={{ position: "relative", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            {(() => {
              const toutesLesPhotos = [produitOuvert.photo_url, ...(produitOuvert.photos_galerie || [])].filter(Boolean);
              const photoAffichee = toutesLesPhotos[photoActive] || toutesLesPhotos[0];
              return (
                <>
                  <div className="rv-shop-produit-photo" style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden" }}>
                    {photoAffichee ? (
                      <img
                        src={photoAffichee}
                        alt={produitOuvert.produit_nom}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    ) : (
                      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>📦</div>
                    )}
                  </div>
                  {toutesLesPhotos.length > 1 && (
                    <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto" }}>
                      {toutesLesPhotos.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoActive(i)}
                          style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: "hidden", padding: 0, border: i === photoActive ? `2px solid ${couleur}` : "1px solid #ECE8DC", cursor: "pointer", background: "none" }}
                        >
                          <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            <button
              className="rv-shop-produit-back"
              onClick={fermerProduit}
              style={{ position: "absolute", top: 16, left: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
            >
              ←
            </button>
            <button
              onClick={() => {
                const lienAvecApercu = entreprise.slug
                  ? `${window.location.origin}/api/og-preview?boutique=${entreprise.slug}&produit=${produitOuvert.produit_id}`
                  : `${window.location.origin}/api/og-preview?catalogue=${workspaceId}&produit=${produitOuvert.produit_id}`;
                navigator.clipboard.writeText(lienAvecApercu);
                setLienCopie(true);
                setTimeout(() => setLienCopie(false), 2500);
              }}
              title="Copier le lien de partage (avec aperçu photo pour WhatsApp/Facebook)"
              style={{ position: "absolute", top: 16, right: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 16, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
            >
              {lienCopie ? "✅" : "🔗"}
            </button>
            {lienCopie && (
              <div style={{ position: "absolute", top: 58, right: 16, background: "#16231F", color: "white", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 8, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}>
                Lien de partage copié 👍
              </div>
            )}
          </div>

          <div className="rv-shop-produit-info" style={{ padding: "22px 18px 140px" }}>
            {produitOuvert.nb_ventes > 0 && (
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: "#8A6412", background: "#FBF3E3", padding: "3px 10px", borderRadius: 999, marginBottom: 10 }}>
                🔥 {t("bestSeller")} — {produitOuvert.nb_ventes} {t("ventes")}
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 21 }}>{produitOuvert.produit_nom}</div>

            {produitOuvert.note_moyenne && (
              <button
                onClick={() => document.getElementById("rv-shop-avis-section")?.scrollIntoView({ behavior: "smooth" })}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer" }}
              >
                <span style={{ color: "#e8920a", fontSize: 14 }}>{"★".repeat(Math.round(produitOuvert.note_moyenne))}{"☆".repeat(5 - Math.round(produitOuvert.note_moyenne))}</span>
                <span style={{ fontSize: 12.5, color: "#6B7168", textDecoration: "underline" }}>{produitOuvert.note_moyenne}/5 ({produitOuvert.nb_avis} avis)</span>
              </button>
            )}

            <div style={{ fontWeight: 700, fontSize: 24, color: couleur, marginTop: 10, marginBottom: 4 }}>
              {Number(produitOuvert.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
            </div>

            {livraisonGratuite ? (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#1F9D6E", background: "#EAF7F1", padding: "4px 10px", borderRadius: 999, marginBottom: 12 }}>
                {t("livraisonGratuite")}
              </div>
            ) : aChoixLivraison ? (
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                {t("fraisAChoisir")} ({entreprise.labelLivraisonLocale} : {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise} — {entreprise.labelLivraisonExpedition} : {fraisExpeditionEffectif.toLocaleString("fr-FR")} {entreprise.devise})
              </div>
            ) : (
              fraisLivraisonEffectif > 0 && (
                <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                  🚚 + {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise} {t("deFraisLivraison")}
                </div>
              )
            )}

            {produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5 && (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#D64933", background: "#FBEAE6", padding: "4px 10px", borderRadius: 999, marginBottom: 18 }}>
                ⚡ {t("plusQue")} {produitOuvert.stock_initial} {t("enStock")}
              </div>
            )}
            {!(produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5) && <div style={{ marginBottom: 10 }} />}

            {bundlesProduit.length > 0 && (
              <div style={{ background: "#fffdf7", border: "1px solid #F0DDA8", borderRadius: 10, padding: "9px 12px", marginBottom: 22, fontSize: 12, color: "#8A6412", fontWeight: 700 }}>
                🔥 Offres quantité disponibles — choisis ton pack dans le formulaire de commande
              </div>
            )}

            {produitOuvert.produit_description ? (
              <>
                <style>{`
                  .rv-description-riche img {
                    max-width: 100% !important;
                    width: 100% !important;
                    height: auto !important;
                    float: none !important;
                    display: block !important;
                    margin: 14px auto !important;
                    border-radius: 8px !important;
                    object-fit: contain !important;
                  }
                  .rv-description-riche * {
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                  }
                  .rv-description-riche table {
                    display: block !important;
                    overflow-x: auto !important;
                  }
                  .rv-description-riche h1, .rv-description-riche h2, .rv-description-riche h3, .rv-description-riche h4 {
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    color: #16231F !important;
                    margin: 22px 0 10px !important;
                    line-height: 1.4 !important;
                  }
                  .rv-description-riche h1:first-child, .rv-description-riche h2:first-child, .rv-description-riche h3:first-child {
                    margin-top: 0 !important;
                  }
                  .rv-description-riche p {
                    margin: 0 0 12px !important;
                    line-height: 1.65 !important;
                  }
                  .rv-description-riche strong, .rv-description-riche b {
                    font-weight: 700 !important;
                    color: #16231F !important;
                  }
                  .rv-description-riche ul, .rv-description-riche ol {
                    margin: 0 0 14px !important;
                    padding-left: 20px !important;
                  }
                  .rv-description-riche li {
                    margin-bottom: 7px !important;
                    line-height: 1.55 !important;
                  }
                  .rv-description-riche a {
                    color: ${couleur} !important;
                  }
                `}</style>
                <div
                  className="rv-description-riche"
                  style={{ fontSize: 14.5, color: "#16231F", lineHeight: 1.65, marginBottom: 26 }}
                  dangerouslySetInnerHTML={{ __html: nettoyerHTML(produitOuvert.produit_description) }}
                />
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#8A9089", fontStyle: "italic", marginBottom: 26 }}>{t("aucuneDescription")}</div>
            )}

            <div id="rv-shop-avis-section" style={{ borderTop: "1px solid #ECE8DC", paddingTop: 20, marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t("avisClients")} {avisListe.length > 0 && `(${avisListe.length})`}</div>
                {!afficherFormAvis && !avisEnvoye && (
                  <button onClick={() => setAfficherFormAvis(true)} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    {t("laisserAvis")}
                  </button>
                )}
              </div>

              {avisEnvoye && (
                <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#3B6D11" }}>
                  ✅ Merci pour ton avis ! Il sera visible après vérification.
                </div>
              )}

              {afficherFormAvis && !avisEnvoye && (
                <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setFormAvis({ ...formAvis, note: n })}
                        style={{ background: "none", border: "none", padding: 0, fontSize: 24, cursor: "pointer", color: n <= formAvis.note ? "#e8920a" : "#DDD8CC" }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder={t("tonNom")}
                    value={formAvis.nom}
                    onChange={(e) => setFormAvis({ ...formAvis, nom: e.target.value })}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <textarea
                    placeholder={t("tonCommentaire")}
                    value={formAvis.commentaire}
                    onChange={(e) => setFormAvis({ ...formAvis, commentaire: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  {photoAvisApercu ? (
                    <div style={{ position: "relative", display: "inline-block", marginBottom: 10 }}>
                      <img src={photoAvisApercu} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, border: "1px solid #DDD8CC" }} />
                      <button
                        onClick={() => { setPhotoAvis(null); setPhotoAvisApercu(""); }}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#D64933", color: "white", border: "none", fontSize: 12, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", border: "1px dashed #DDD8CC", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#6B7168", cursor: "pointer", marginBottom: 10 }}>
                      📷 Ajouter une photo (optionnel)
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const fichier = e.target.files?.[0];
                          if (!fichier) return;
                          if (fichier.size > 5 * 1024 * 1024) { alert("Photo trop lourde (max 5 Mo)."); return; }
                          setPhotoAvis(fichier);
                          setPhotoAvisApercu(URL.createObjectURL(fichier));
                        }}
                      />
                    </label>
                  )}
                  <button
                    onClick={soumettreAvis}
                    disabled={envoiAvis || !formAvis.nom.trim()}
                    style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", opacity: (envoiAvis || !formAvis.nom.trim()) ? 0.5 : 1 }}
                  >
                    {envoiPhotoAvisEnCours ? "Envoi de la photo..." : envoiAvis ? t("envoiEnCours") : t("envoyerAvis")}
                  </button>
                </div>
              )}

              {avisListe.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A9089", fontStyle: "italic" }}>{t("aucunAvis")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {avisListe.map((a, i) => (
                    <div key={i} style={{ background: "#FAFAF7", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{a.client_nom}</span>
                        <span style={{ color: "#e8920a", fontSize: 12 }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
                      </div>
                      {a.commentaire && <div style={{ fontSize: 13, color: "#16231F", marginTop: 4, lineHeight: 1.5 }}>{a.commentaire}</div>}
                      {a.photo_url && <img src={a.photo_url} alt="Photo du client" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, marginTop: 8, border: "1px solid #ECE8DC", cursor: "pointer" }} onClick={() => window.open(a.photo_url, "_blank")} />}
                    </div>
                  ))}
                </div>
              )}
            </div>


            {!envoye && !produitOuvert.masquer_produits_similaires && (() => {
              const idsChoisis = Array.isArray(produitOuvert.produits_similaires_ids) ? produitOuvert.produits_similaires_ids : [];
              const collectionChoisie = produitOuvert.produits_similaires_collection_id
                ? collectionsManuelles.find((c) => c.id === produitOuvert.produits_similaires_collection_id)
                : null;
              const idsDeCollection = collectionChoisie ? collectionChoisie.produitIds : [];
              const idsCombines = [...new Set([...idsDeCollection, ...idsChoisis])].filter((id) => id !== produitOuvert.produit_id);
              const similaires = idsCombines.length > 0
                ? idsCombines.map((id) => produits.find((p) => p.produit_id === id)).filter(Boolean)
                : produits
                    .filter((p) => p.produit_id !== produitOuvert.produit_id)
                    .sort((a, b) => (b.nb_ventes || 0) - (a.nb_ventes || 0))
                    .slice(0, 6);
              if (similaires.length === 0) return null;
              return (
                <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{t("tuPourraisAimer")}</div>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    {similaires.map((p) => (
                      <button
                        key={p.produit_id}
                        onClick={() => ouvrirProduit(p)}
                        style={{ flex: "0 0 130px", width: 130, background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ width: "100%", paddingTop: "100%", position: "relative", background: "#EEF0EA" }}>
                          {p.photo_url ? (
                            <img src={p.photo_url} alt={p.produit_nom} loading="lazy" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</div>
                          )}
                        </div>
                        <div style={{ padding: "8px 10px 10px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 2 }}>{Number(p.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {!envoye && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { icone: "💵", texte: t("badgePaiement2") },
                  { icone: "🚚", texte: t("badgeLivraison2") },
                  { icone: "✅", texte: t("badgeVerifie") },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {item.icone}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#3B6D11", fontWeight: 600, lineHeight: 1.3 }}>{item.texte}</div>
                  </div>
                ))}
              </div>
            )}

            {!envoye && (
              <div className="rv-shop-cta-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "14px 18px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)", zIndex: 20 }}>
                <div className="rv-shop-cta-bar-inner">
                  <div style={{ fontSize: 10.5, color: "#8A9089", textAlign: "center", marginBottom: 6 }}>
                    {t("merciCommander")}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => ajouterAuPanier(produitOuvert, quantite)}
                      style={{ flexShrink: 0, background: "white", border: `1.5px solid ${couleur}`, color: couleur, borderRadius: 12, padding: "0 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      🛒
                    </button>
                    <button
                      onClick={() => {
                        trackEvenement("InitiateCheckout", {
                          content_ids: [produitOuvert.produit_id],
                          value: prixUnitaireEffectif * quantite,
                          currency: entreprise?.devise || "XOF",
                        });
                        setAfficherFormulaire(true);
                        momentOuvertureFormulaireRef.current = Date.now();
                      }}
                      style={{ flex: 1, background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                    >
                      {`${t("commander")} — ${(prixUnitaireEffectif * quantite).toLocaleString("fr-FR")} ${entreprise.devise}`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {afficherFormulaire && !envoye && (
          <div
            onClick={() => setAfficherFormulaire(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 24px", maxHeight: "80vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{t("tesCoordonnees")}</div>
                <button onClick={() => setAfficherFormulaire(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
                {t("pourTeContacter")}
              </div>

              <input
                type="text"
                name="site_web"
                autoComplete="off"
                tabIndex={-1}
                value={form.champPiege}
                onChange={(e) => setForm({ ...form, champPiege: e.target.value })}
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                aria-hidden="true"
              />

              <input
                placeholder={t("tonNom")}
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                autoFocus
                style={inputStyle}
              />
              <input
                placeholder={t("tonTelephone")}
                value={form.tel}
                onChange={(e) => setForm({ ...form, tel: e.target.value })}
                style={inputStyle}
              />
              <input
                placeholder={t("taVille")}
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                style={inputStyle}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: "#6B7168" }}>{t("quantite")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => { setQuantite((q) => Math.max(1, q - 1)); setBundleChoisiId(null); }}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    −
                  </button>
                  <div style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{quantite}</div>
                  <button
                    onClick={() => { setQuantite((q) => q + 1); setBundleChoisiId(null); }}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {optionsProduitListe.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {optionsProduitListe.map((o) => (
                    <div key={o.nom} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#16231F", marginBottom: 6 }}>{o.nom} <span style={{ color: "#D64933" }}>*</span></div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {o.valeurs.map((val) => {
                          const actif = optionsChoisies[o.nom] === val;
                          return (
                            <button
                              key={val}
                              onClick={() => setOptionsChoisies((c) => ({ ...c, [o.nom]: val }))}
                              style={{ border: `1.5px solid ${actif ? couleur : "#DDD8CC"}`, background: actif ? "#EAF3DE" : "white", color: "#16231F", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {toutesOptionsChoisies && !varianteActive && (
                    <div style={{ fontSize: 11.5, color: "#D64933", marginTop: 4 }}>⚠️ Cette combinaison n'est pas disponible.</div>
                  )}
                  {varianteEnRupture && (
                    <div style={{ fontSize: 11.5, color: "#D64933", marginTop: 4, fontWeight: 700 }}>🔴 Cette variante est en rupture de stock.</div>
                  )}
                </div>
              )}

              {optionsProduitListe.length === 0 && bundlesProduit.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#b16b00", letterSpacing: ".04em", marginBottom: 8 }}>{t("offresQuantite")}</div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bundlesProduit.length, 3)}, 1fr)`, gap: 8 }}>
                    {bundlesProduit.map((b) => {
                      const actif = bundleChoisiId === b.id;
                      const totalBundle = prixUnitairePourBundle(produitOuvert.prix_vente, b) * b.qty;
                      const estPrixFixe = (b.mode || "pourcentage") === "prix_fixe";
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            if (actif) { setBundleChoisiId(null); setQuantite(1); }
                            else { setBundleChoisiId(b.id); setQuantite(b.qty); }
                          }}
                          style={{ textAlign: "left", border: `1.5px solid ${actif ? couleur : "#DDD8CC"}`, background: actif ? "#EAF3DE" : (b.couleur_fond || "white"), borderRadius: 10, padding: "8px 9px", cursor: "pointer" }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#16231F" }}>{b.label}</div>
                          {b.mode === "prix_fixe" && <div style={{ fontSize: 9.5, color: "#8A6412" }}>{t("prixFixe")}</div>}
                          {b.mode === "offert" && <div style={{ fontSize: 9.5, color: "#8A6412", fontWeight: 800 }}>🎁 {b.nb_offerts} offert{b.nb_offerts > 1 ? "s" : ""}</div>}
                          {(!b.mode || b.mode === "pourcentage") && b.discount > 0 && <div style={{ fontSize: 9.5, color: "#8A6412" }}>-{b.discount}%</div>}
                          <div style={{ fontSize: 12, fontWeight: 800, color: couleur, marginTop: 2 }}>{totalBundle.toLocaleString("fr-FR")} {entreprise.devise}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {livraisonGratuite && (
                <div style={{ background: "#EAF7F1", border: "1px solid #C7E8D6", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#1F9D6E", fontWeight: 700 }}>
                  🎁 Livraison gratuite pour ce produit
                </div>
              )}

              {aChoixLivraison && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#16231F", marginBottom: 6 }}>{t("modeLivraison")} <span style={{ color: "#D64933" }}>*</span></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setTypeLivraisonChoisi("livraison")}
                      style={{ flex: 1, textAlign: "left", background: typeLivraisonChoisi === "livraison" ? "#EAF3DE" : "white", border: `1.5px solid ${typeLivraisonChoisi === "livraison" ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>🏍️ {entreprise.labelLivraisonLocale}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise}</div>
                    </button>
                    <button
                      onClick={() => setTypeLivraisonChoisi("expedition")}
                      style={{ flex: 1, textAlign: "left", background: typeLivraisonChoisi === "expedition" ? "#EAF3DE" : "white", border: `1.5px solid ${typeLivraisonChoisi === "expedition" ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>🚛 {entreprise.labelLivraisonExpedition}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {fraisExpeditionEffectif.toLocaleString("fr-FR")} {entreprise.devise}</div>
                    </button>
                  </div>
                  {!typeLivraisonChoisi && <div style={{ fontSize: 11, color: "#8A6412", marginTop: 6 }}>{t("choisisMode")}</div>}
                  {typeLivraisonChoisi === "expedition" && entreprise.depotRequis && (
                    <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "9px 12px", marginTop: 8, fontSize: 11.5, color: "#8A6412", lineHeight: 1.5 }}>
                      💰 {entreprise.depotMessage ? entreprise.depotMessage.replace(/\{montant\}/g, `${(prixUnitaireEffectif * quantite + fraisExpeditionEffectif).toLocaleString("fr-FR")} ${entreprise.devise}`) : `Un dépôt de ${(prixUnitaireEffectif * quantite + fraisExpeditionEffectif).toLocaleString("fr-FR")} ${entreprise.devise} (le montant exact de ta commande) par Mobile Money est exigé avant l'expédition. Notre équipe te contactera pour l'organiser.`}
                    </div>
                  )}
                </div>
              )}

              {erreurEnvoi && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreurEnvoi}</div>}

              {(() => {
                const bumpProduit = produitOuvert.bump_produit_id ? produits.find((p) => p.produit_id === produitOuvert.bump_produit_id) : null;
                if (!bumpProduit) return null;
                const bumpPrix = produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(bumpProduit.prix_vente);
                const choisi = produitBumpId === bumpProduit.produit_id;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#16231F", marginBottom: 8 }}>{t("ajouteProduit")}</div>
                    <button
                      onClick={() => setProduitBumpId(choisi ? null : bumpProduit.produit_id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: choisi ? "#EAF3DE" : "white", border: `1.5px solid ${choisi ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${choisi ? couleur : "#DDD8CC"}`, background: choisi ? couleur : "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white", flexShrink: 0 }}>{choisi ? "✓" : ""}</span>
                      {bumpProduit.photo_url ? (
                        <img src={bumpProduit.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "#EEF0EA", flexShrink: 0 }} />
                      )}
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bumpProduit.produit_nom}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: couleur, flexShrink: 0 }}>
                        {produitOuvert.bump_prix_special != null && Number(produitOuvert.bump_prix_special) < Number(bumpProduit.prix_vente) && (
                          <span style={{ textDecoration: "line-through", color: "#8A9089", fontWeight: 500, marginRight: 5 }}>{Number(bumpProduit.prix_vente).toLocaleString("fr-FR")}</span>
                        )}
                        +{bumpPrix.toLocaleString("fr-FR")} {entreprise.devise}
                      </span>
                    </button>
                  </div>
                );
              })()}

              <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7168" }}>{quantite} × {produitOuvert.produit_nom}</span>
                  <span>{(prixUnitaireEffectif * quantite).toLocaleString("fr-FR")} {entreprise.devise}</span>
                </div>
                {produitBumpId && (() => {
                  const bump = produits.find((p) => p.produit_id === produitBumpId);
                  if (!bump) return null;
                  const prixBumpAffiche = produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(bump.prix_vente);
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#6B7168" }}>+ {bump.produit_nom}</span>
                      <span>{prixBumpAffiche.toLocaleString("fr-FR")} {entreprise.devise}</span>
                    </div>
                  );
                })()}
                {fraisLivraisonActuel > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7168" }}>
                    <span>🚚 {aChoixLivraison && typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}</span>
                    <span>+ {fraisLivraisonActuel.toLocaleString("fr-FR")} {entreprise.devise}</span>
                  </div>
                )}
                {codePromoApplique && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1F9D6E", fontWeight: 700 }}>
                    <span>🏷️ Code {codePromoApplique.code}</span>
                    <span>− {codePromoApplique.montant_remise.toLocaleString("fr-FR")} {entreprise.devise}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid #ECE8DC", marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 700, color: couleur }}>{Math.max(0, prixUnitaireEffectif * quantite + fraisLivraisonActuel + (produitBumpId ? (produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(produits.find((p) => p.produit_id === produitBumpId)?.prix_vente || 0)) : 0) - (codePromoApplique?.montant_remise || 0)).toLocaleString("fr-FR")} {entreprise.devise}</span>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                {codePromoApplique ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#EAF7F1", border: "1px solid #C3E8D8", borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ fontSize: 12, color: "#1F9D6E", fontWeight: 700 }}>✅ {codePromoMessage}</span>
                    <button onClick={() => { setCodePromoApplique(null); setCodePromoInput(""); setCodePromoMessage(""); }} style={{ background: "none", border: "none", color: "#1F9D6E", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Retirer</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      placeholder="Code promo (optionnel)"
                      value={codePromoInput}
                      onChange={(e) => setCodePromoInput(e.target.value)}
                      style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, boxSizing: "border-box", textTransform: "uppercase" }}
                    />
                    <button
                      onClick={() => verifierCodePromo(prixUnitaireEffectif * quantite + fraisLivraisonActuel + (produitBumpId ? (produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(produits.find((p) => p.produit_id === produitBumpId)?.prix_vente || 0)) : 0))}
                      disabled={verificationCodePromoEnCours || !codePromoInput.trim()}
                      style={{ background: "#16231F", color: "white", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      {verificationCodePromoEnCours ? "..." : "Appliquer"}
                    </button>
                  </div>
                )}
                {!codePromoApplique && codePromoMessage && (
                  <div style={{ fontSize: 11, color: "#D64933", marginTop: 4 }}>{codePromoMessage}</div>
                )}
              </div>

              <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 8, padding: "9px 12px", marginBottom: 10, fontSize: 11.5, color: "#3B6D11", lineHeight: 1.5 }}>
                {t("onVaAppeler")}
              </div>

              <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "9px 12px", marginBottom: 10, fontSize: 11.5, color: "#8A6412", lineHeight: 1.5 }}>
                {t("engagement")}
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, cursor: "pointer", fontSize: 12, color: "#16231F", lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={engagementCoche}
                  onChange={(e) => setEngagementCoche(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                />
                <span>{t("caseEngagement")}</span>
              </label>

              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 14, paddingTop: 10, borderTop: "1px solid #ECE8DC" }}>
                {[
                  { icone: "💵", texte: t("badgePaiement2") },
                  { icone: "🚚", texte: t("badgeLivraison2") },
                  { icone: "✅", texte: t("badgeVerifie") },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 14 }}>{item.icone}</span>
                    <span style={{ fontSize: 10, color: "#6B7168", fontWeight: 600 }}>{item.texte}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={envoyerCommande}
                disabled={envoi || !engagementCoche || (optionsProduitListe.length > 0 && (!toutesOptionsChoisies || !varianteActive || varianteEnRupture))}
                style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: envoi ? "default" : "pointer", opacity: (envoi || !engagementCoche || (optionsProduitListe.length > 0 && (!toutesOptionsChoisies || !varianteActive || varianteEnRupture))) ? 0.5 : 1, marginTop: 4 }}
              >
                {envoi ? t("envoiEnCours") : `${t("confirmer")} — ${Math.max(0, prixUnitaireEffectif * quantite + fraisLivraisonActuel + (produitBumpId ? (produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(produits.find((p) => p.produit_id === produitBumpId)?.prix_vente || 0)) : 0) - (codePromoApplique?.montant_remise || 0)).toLocaleString("fr-FR")} ${entreprise.devise}`}
              </button>
            </div>
          </div>
        )}
        <BulleWhatsApp whatsapp={entreprise.whatsapp} messageDefaut={`Bonjour, j'ai une question sur "${produitOuvert.produit_nom}".`} surCtaBar={!envoye} />
        {panierOuvert && (
          <PanierDrawer
            panier={panier}
            entreprise={entreprise}
            couleur={couleur}
            workspaceId={workspaceId}
            onFermer={() => setPanierOuvert(false)}
            onModifierQuantite={modifierQuantitePanier}
            onRetirer={retirerDuPanier}
            onViderPanier={viderPanier}
          />
        )}
      </div>
    );
  }

  // ===== ÉCRAN COLLECTION COMPLÈTE =====
  if (collectionOuverte) {
    const collectionManuelleActive = collectionOuverte.startsWith("manuelle-")
      ? collectionsManuelles.find((c) => c.id === collectionOuverte.replace("manuelle-", ""))
      : null;
    const listeCollection = collectionManuelleActive
      ? produits.filter((p) => collectionManuelleActive.produitIds.includes(p.produit_id))
      : collectionOuverte === "bestseller"
        ? [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes)
        : collectionOuverte === "nouveautes"
          ? produits.filter((p) => p.est_nouveau)
          : produits;
    const titreCollection = collectionManuelleActive
      ? `📁 ${collectionManuelleActive.nom}`
      : collectionOuverte === "bestseller" ? t("meilleuresVentes") : collectionOuverte === "nouveautes" ? t("nouveautes") : t("tousLesProduits");

    return (
      <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <style>{`
          .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
          .rv-shop-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
          .rv-shop-card:hover { box-shadow: 0 10px 24px rgba(22,35,31,0.12) !important; transform: translateY(-2px); }
          @media (max-width: 420px) { .rv-shop-header-whatsapp-txt { display: none; } .rv-shop-header-nom { display: none; } }
          .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          @media (min-width: 640px) { .rv-shop-content { max-width: 720px; padding: 0 24px; } .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
          @media (min-width: 960px) { .rv-shop-content { max-width: 1100px; padding: 0 32px; } .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; } }
          @media (min-width: 1280px) { .rv-shop-content, .rv-shop-header-inner { max-width: 1400px; } .rv-shop-grid { grid-template-columns: repeat(5, 1fr); } }
        `}</style>

        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={() => naviguerVersCollection(null)} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={collectionOuverte} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); naviguerVersCollection(null); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} />

        <div className="rv-shop-content" style={{ paddingTop: 20 }}>
          <button
            onClick={() => setCollectionOuverte(null)}
            style={{ background: "none", border: "none", color: "#6B7168", fontSize: 13, cursor: "pointer", marginBottom: 10, padding: 0 }}
          >
            {t("retourAccueil")}
          </button>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 18 }}>{titreCollection} ({listeCollection.length})</div>

          <div className="rv-shop-grid" style={{ paddingBottom: 40 }}>
            {listeCollection.map((p, i) => (
              <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
                <CarteProduit p={p} couleur={couleur} devise={entreprise.devise} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={ajouterAuPanier} estAzali={entreprise.slug === "azaliexpress"} />
              </RevealOnScroll>
            ))}
          </div>
        </div>

        <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} />
        <BulleWhatsApp whatsapp={entreprise.whatsapp} messageDefaut={`Bonjour, j'ai une question sur "${titreCollection}".`} />
        {panierOuvert && (
          <PanierDrawer
            panier={panier}
            entreprise={entreprise}
            couleur={couleur}
            workspaceId={workspaceId}
            onFermer={() => setPanierOuvert(false)}
            onModifierQuantite={modifierQuantitePanier}
            onRetirer={retirerDuPanier}
            onViderPanier={viderPanier}
          />
        )}
      </div>
    );
  }

  // ===== ÉCRAN CATALOGUE (accueil) =====
  const NOMBRE_OPTIMAL_PAR_COLLECTION = 5;
  const NOMBRE_MAX_ACCUEIL = 20;
  const meilleuresVentesToutes = [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes);
  const nouveautesToutes = produits.filter((p) => p.est_nouveau);
  const meilleuresVentes = meilleuresVentesToutes.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION);
  const nouveautes = nouveautesToutes.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION);
  const produitsFiltres = recherche.trim()
    ? produits.filter((p) => p.produit_nom.toLowerCase().includes(recherche.trim().toLowerCase()))
    : produits;

  if (entreprise.storeConfig && Array.isArray(entreprise.storeConfig.sections) && entreprise.storeConfig.sections.length > 0) {
    return (
      <>
        <PageAccueilPersonnalisee
          config={entreprise.storeConfig}
          entreprise={entreprise}
          couleur={couleur}
          produits={produits}
          meilleuresVentes={meilleuresVentes}
          meilleuresVentesToutes={meilleuresVentesToutes}
          nouveautes={nouveautes}
          nouveautesToutes={nouveautesToutes}
          collectionsManuelles={collectionsManuelles}
          recherche={recherche}
          setRecherche={setRecherche}
          produitsFiltres={produitsFiltres}
          ouvrirProduit={ouvrirProduit}
          naviguerVersCollection={naviguerVersCollection}
          setCollectionOuverte={setCollectionOuverte}
          setPolitiqueOuverte={setPolitiqueOuverte}
          politiqueOuverte={politiqueOuverte}
          NOMBRE_MAX_ACCUEIL={NOMBRE_MAX_ACCUEIL}
          avisBoutique={avisBoutique}
          totalArticlesPanier={totalArticlesPanier}
          onOuvrirPanier={() => setPanierOuvert(true)}
          onAjouterAuPanier={ajouterAuPanier}
          biensLocation={biensLocation}
          onOuvrirBien={(b) => setBienOuvert(b)}
        />
        {panierOuvert && (
          <PanierDrawer
            panier={panier}
            entreprise={entreprise}
            couleur={couleur}
            workspaceId={workspaceId}
            onFermer={() => setPanierOuvert(false)}
            onModifierQuantite={modifierQuantitePanier}
            onRetirer={retirerDuPanier}
            onViderPanier={viderPanier}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <style>{`
        .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
        .rv-shop-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .rv-shop-card:hover { box-shadow: 0 10px 24px rgba(22,35,31,0.12) !important; transform: translateY(-2px); }
        @media (max-width: 420px) { .rv-shop-header-whatsapp-txt { display: none; } .rv-shop-header-nom { display: none; } }
        .rv-shop-banner { height: 150px; }
        .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .rv-shop-collection-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
        .rv-shop-collection-scroll::-webkit-scrollbar { height: 5px; }
        .rv-shop-collection-scroll::-webkit-scrollbar-thumb { background: #DDD8CC; border-radius: 999px; }
        .rv-shop-collection-card { flex: 0 0 140px; min-width: 0; max-width: 140px; }
        @media (min-width: 640px) {
          .rv-shop-content { max-width: 720px; padding: 0 24px; }
          .rv-shop-banner { height: 240px; }
          .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .rv-shop-collection-scroll { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; gap: 16px; }
          .rv-shop-collection-card { flex: none; width: auto; min-width: 0; max-width: none; }
        }
        @media (min-width: 960px) {
          .rv-shop-content { max-width: 1100px; padding: 0 32px; }
          .rv-shop-banner { height: 340px; }
          .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .rv-shop-collection-scroll { grid-template-columns: repeat(4, 1fr); gap: 20px; }
        }
        @media (min-width: 1280px) {
          .rv-shop-content, .rv-shop-header-inner { max-width: 1400px; }
          .rv-shop-grid { grid-template-columns: repeat(5, 1fr); }
          .rv-shop-collection-scroll { grid-template-columns: repeat(5, 1fr); }
        }
      `}</style>

      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} />

      {entreprise.slug === "luxury-car" ? (
        <HeroLuxuryCar entreprise={entreprise} biensLocation={biensLocation} onOuvrirVehicule={(b) => setBienOuvert(b)} />
      ) : (
      <div className="rv-shop-banner" style={{ width: "100%", position: "relative", overflow: "hidden" }}>
        {entreprise.banniere ? (
          <img src={entreprise.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.05) 100%)" }} />
        <div className="rv-shop-hero-content" style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 16px 18px", display: "flex", alignItems: "flex-end", gap: 14 }}>
          {entreprise.logo && (
            <img
              src={entreprise.logo}
              alt={entreprise.nom}
              className="rv-shop-hero-logo"
              style={{ width: 76, height: 76, borderRadius: 16, objectFit: "contain", border: "3px solid white", boxShadow: "0 6px 18px rgba(0,0,0,0.4)", flexShrink: 0, background: "white" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div style={{ minWidth: 0, paddingBottom: 2 }}>
            <div className="rv-shop-hero-nom" style={{ fontWeight: 700, fontSize: 23, color: "white", textShadow: "0 1px 6px rgba(0,0,0,0.4)", lineHeight: 1.2 }}>{entreprise.nom}</div>
            {entreprise.description && (
              <div className="rv-shop-hero-desc" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 3, textShadow: "0 1px 4px rgba(0,0,0,0.4)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {entreprise.description}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {entreprise.slug === "luxury-car" && biensLocation.length > 0 && (
        <div id="rv-vehicules" style={{ background: "#0a0a0a", padding: "40px 20px", fontFamily: "'Georgia', serif" }}>
          <div style={{ maxWidth: 1300, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>
                {filtreCategorieBien ? filtreCategorieBien : "Notre catalogue"}
              </div>
              {filtreCategorieBien && (
                <button onClick={() => setFiltreCategorieBien(null)} style={{ background: "none", border: "1px solid rgba(212,175,55,0.4)", color: "#D4AF37", borderRadius: 6, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  ✕ Voir tout
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {biensLocation.filter((b) => !filtreCategorieBien || b.categorie === filtreCategorieBien).map((b) => (
                <CarteVehiculeLuxury key={b.id} b={b} devise={entreprise.devise} onOuvrir={(bien) => setBienOuvert(bien)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {entreprise.slug === "luxury-car" && <SectionsLuxuryCar entreprise={entreprise} biensLocation={biensLocation} />}

      <div className="rv-shop-content" style={{ paddingTop: 20, ...(entreprise.slug === "luxury-car" ? { background: "#0a0a0a", color: "white" } : {}) }}>
        {produits.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, marginTop: 40, paddingBottom: 40 }}>
            {t("aucunProduit")}
          </div>
        )}

        {!recherche.trim() && meilleuresVentes.length > 0 && (
          <SectionCollection
            titre={t("meilleuresVentes")}
            produits={meilleuresVentes}
            couleur={couleur}
            devise={entreprise.devise}
            langue={entreprise.langue}
            onOpen={ouvrirProduit}
            onAjouterAuPanier={ajouterAuPanier}
            estAzali={entreprise.slug === "azaliexpress"}
            voirTout={meilleuresVentesToutes.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte("bestseller") : null}
            libelleVoirTout={t("voirTout")}
          />
        )}

        {!recherche.trim() && nouveautes.length > 0 && (
          <SectionCollection
            titre={t("nouveautes")}
            produits={nouveautes}
            couleur={couleur}
            devise={entreprise.devise}
            langue={entreprise.langue}
            onOpen={ouvrirProduit}
            onAjouterAuPanier={ajouterAuPanier}
            estAzali={entreprise.slug === "azaliexpress"}
            voirTout={nouveautesToutes.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte("nouveautes") : null}
            libelleVoirTout={t("voirTout")}
          />
        )}

        {!recherche.trim() && collectionsManuelles.map((col) => {
          const produitsDeLaCollection = produits.filter((p) => col.produitIds.includes(p.produit_id));
          if (produitsDeLaCollection.length === 0) return null;
          return (
            <SectionCollection
              key={col.id}
              titre={`📁 ${col.nom}`}
              produits={produitsDeLaCollection.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION)}
              couleur={couleur}
              devise={entreprise.devise}
              langue={entreprise.langue}
              onOpen={ouvrirProduit}
              onAjouterAuPanier={ajouterAuPanier}
              estAzali={entreprise.slug === "azaliexpress"}
              voirTout={produitsDeLaCollection.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte(`manuelle-${col.id}`) : null}
              libelleVoirTout={t("voirTout")}
            />
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {recherche.trim() ? `${t("resultatsPour")} "${recherche.trim()}"` : t("tousLesProduits")}
          </div>
          {!recherche.trim() && produitsFiltres.length > NOMBRE_MAX_ACCUEIL && (
            <button onClick={() => setCollectionOuverte("tous")} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              {t("voirTout")}
            </button>
          )}
        </div>

        {produitsFiltres.length === 0 && recherche.trim() && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, padding: "20px 0 40px" }}>
            {t("aucunResultat")}
          </div>
        )}

        <div className="rv-shop-grid" style={{ paddingBottom: 20 }}>
          {(recherche.trim() ? produitsFiltres : produitsFiltres.slice(0, NOMBRE_MAX_ACCUEIL)).map((p, i) => (
            <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
              <CarteProduit p={p} couleur={couleur} devise={entreprise.devise} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={ajouterAuPanier} estAzali={entreprise.slug === "azaliexpress"} />
            </RevealOnScroll>
          ))}
        </div>

        {!recherche.trim() && produitsFiltres.length > NOMBRE_MAX_ACCUEIL && (
          <button
            onClick={() => setCollectionOuverte("tous")}
            style={{ display: "block", width: "100%", background: "white", border: `1px solid ${couleur}`, color: couleur, borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 20 }}
          >
            {t("voirTousLesProduits")} ({produitsFiltres.length}) →
          </button>
        )}
      </div>

      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} biensLocation={biensLocation} />

      {politiqueOuverte && (
        <div
          onClick={() => setPolitiqueOuverte(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {politiqueOuverte === "livraison" ? "Politique de livraison" : politiqueOuverte === "retours" ? "Politique de retours" : "Politique de confidentialité"}
              </div>
              <button onClick={() => setPolitiqueOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {politiqueOuverte === "livraison" ? entreprise.politiqueLivraison : politiqueOuverte === "retours" ? entreprise.politiqueRetours : entreprise.politiqueConfidentialite}
            </div>
          </div>
        </div>
      )}
      <BulleWhatsApp whatsapp={entreprise.whatsapp} />
      {panierOuvert && (
        <PanierDrawer
          panier={panier}
          entreprise={entreprise}
          couleur={couleur}
          workspaceId={workspaceId}
          onFermer={() => setPanierOuvert(false)}
          onModifierQuantite={modifierQuantitePanier}
          onRetirer={retirerDuPanier}
          onViderPanier={viderPanier}
        />
      )}
    </div>
  );
}

function PanierDrawer({ panier, entreprise, couleur, workspaceId, onFermer, onModifierQuantite, onRetirer, onViderPanier }) {
  const [etape, setEtape] = useState("liste"); // liste | form | envoye
  const [form, setForm] = useState({ client: "", tel: "", zone: "", champPiege: "" });
  const momentOuvertureRef = useRef(Date.now());
  const [typeLivraisonChoisi, setTypeLivraisonChoisi] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const total = panier.reduce((s, it) => s + Number(it.prix_unitaire) * it.quantite, 0);
  const auMoinsUnPayant = panier.some((it) => !it.livraison_gratuite);
  const fraisLivraisonDefaut = Number(entreprise.fraisLivraison || 0);
  const fraisExpeditionDefaut = Number(entreprise.fraisExpedition || 0);
  const aChoixLivraison = auMoinsUnPayant && fraisExpeditionDefaut > 0;
  const fraisLivraisonActuel = !auMoinsUnPayant ? 0 : (aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionDefaut : fraisLivraisonDefaut) : fraisLivraisonDefaut);
  const totalAvecLivraison = total + (typeLivraisonChoisi || !aChoixLivraison ? fraisLivraisonActuel : 0);

  async function envoyerCommandePanier() {
    if (form.champPiege) return; // Champ piège rempli = probablement un robot, on ignore silencieusement.
    if (Date.now() - momentOuvertureRef.current < 2500) {
      setErreur("Merci de prendre un instant pour vérifier tes informations avant d'envoyer.");
      return;
    }
    if (!form.client.trim() || !form.tel.trim() || !form.zone.trim()) {
      setErreur("Merci de renseigner ton nom, ton téléphone et ta ville/quartier.");
      return;
    }
    const chiffresTelPanier = form.tel.replace(/\D/g, "");
    if (chiffresTelPanier.length < 8) {
      setErreur("⚠️ Ce numéro de téléphone semble incomplet. Vérifie-le avant de continuer.");
      return;
    }
    const verifTelPanier = validerTelephone(form.tel, entreprise.country);
    if (!verifTelPanier.valide) {
      setErreur(verifTelPanier.message);
      return;
    }
    if (aChoixLivraison && !typeLivraisonChoisi) {
      setErreur("⚠️ Merci de choisir un mode de livraison avant de confirmer.");
      return;
    }
    setEnvoi(true);
    setErreur("");
    const items = panier.map((it) => ({ produit_id: it.produit_id, produit_nom: it.produit_nom, quantite: it.quantite, prix_unitaire: it.prix_unitaire }));
    const { data, error } = await supabase.rpc("creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: form.zone,
      p_items: items,
      p_type_livraison: aChoixLivraison ? typeLivraisonChoisi : "livraison",
      p_fbp: lireCookieMeta("_fbp"),
      p_fbc: lireCookieMeta("_fbc"),
      p_user_agent: navigator.userAgent,
      p_event_source_url: window.location.href,
    });
    setEnvoi(false);
    if (error || !data?.[0]?.succes) {
      setErreur(data?.[0]?.message || "Une erreur est survenue, réessaie.");
      return;
    }
    onViderPanier();
    setEtape("envoye");
  }

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", zIndex: 70, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, height: "100%", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{etape === "envoye" ? "✅ Commande envoyée" : "🛒 Mon panier"}</div>
          <button onClick={onFermer} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8A9089" }}>×</button>
        </div>

        {etape === "envoye" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 46, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, color: "#16231F", fontWeight: 700, marginBottom: 6 }}>Merci {form.client.split(" ")[0]} 🙏</div>
            <div style={{ fontSize: 13, color: "#6B7168", lineHeight: 1.6, marginBottom: 20 }}>
              Ta commande est bien enregistrée. Un conseiller va t'appeler au <strong>{form.tel}</strong> très bientôt — merci de répondre, c'est indispensable pour valider ta livraison.
            </div>
            <button onClick={onFermer} style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
              Continuer mes achats
            </button>
          </div>
        )}

        {etape !== "envoye" && panier.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "50px 0" }}>Ton panier est vide.</div>
        )}

        {etape === "liste" && panier.length > 0 && (
          <>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              {panier.map((it) => (
                <div key={it.produit_id} style={{ display: "flex", gap: 10, borderBottom: "1px solid #ECE8DC", paddingBottom: 12 }}>
                  {it.photo_url ? (
                    <img src={it.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: "#EEF0EA", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.produit_nom}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 2 }}>{Number(it.prix_unitaire).toLocaleString("fr-FR")} {entreprise.devise}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <button onClick={() => onModifierQuantite(it.produit_id, it.quantite - 1)} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #DDD8CC", background: "white", cursor: "pointer" }}>−</button>
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" }}>{it.quantite}</span>
                      <button onClick={() => onModifierQuantite(it.produit_id, it.quantite + 1)} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #DDD8CC", background: "white", cursor: "pointer" }}>+</button>
                      <button onClick={() => onRetirer(it.produit_id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#D64933", fontSize: 12, cursor: "pointer" }}>Retirer</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginBottom: 14, paddingTop: 10, borderTop: "2px solid #ECE8DC" }}>
              <span>Total</span><span style={{ color: couleur }}>{total.toLocaleString("fr-FR")} {entreprise.devise}</span>
            </div>
            <button onClick={() => setEtape("form")} style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Passer la commande →
            </button>
          </>
        )}

        {etape === "form" && (
          <>
            <button onClick={() => setEtape("liste")} style={{ background: "none", border: "none", color: "#6B7168", fontSize: 12.5, textAlign: "left", padding: 0, marginBottom: 14, cursor: "pointer" }}>← Retour au panier</button>
            <input
              type="text"
              name="site_web"
              autoComplete="off"
              tabIndex={-1}
              value={form.champPiege}
              onChange={(e) => setForm({ ...form, champPiege: e.target.value })}
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              aria-hidden="true"
            />
            <input placeholder="Ton nom complet" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
            <input placeholder="Ton numéro de téléphone" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
            <input placeholder="Ville / quartier" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 14, boxSizing: "border-box" }} />

            {aChoixLivraison && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Choisis ton mode de livraison</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setTypeLivraisonChoisi("livraison")} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${typeLivraisonChoisi === "livraison" ? couleur : "#DDD8CC"}`, background: typeLivraisonChoisi === "livraison" ? "#EAF3DE" : "white", cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>🏍️ {entreprise.labelLivraisonLocale}</div>
                    <div style={{ fontSize: 11, color: "#6B7168" }}>{fraisLivraisonDefaut.toLocaleString("fr-FR")} {entreprise.devise}</div>
                  </button>
                  <button onClick={() => setTypeLivraisonChoisi("expedition")} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${typeLivraisonChoisi === "expedition" ? couleur : "#DDD8CC"}`, background: typeLivraisonChoisi === "expedition" ? "#EAF3DE" : "white", cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>🚛 {entreprise.labelLivraisonExpedition}</div>
                    <div style={{ fontSize: 11, color: "#6B7168" }}>{fraisExpeditionDefaut.toLocaleString("fr-FR")} {entreprise.devise}</div>
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Articles</span><span>{total.toLocaleString("fr-FR")} {entreprise.devise}</span></div>
              {fraisLivraisonActuel > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7168" }}><span>Livraison</span><span>{fraisLivraisonActuel.toLocaleString("fr-FR")} {entreprise.devise}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, marginTop: 6, paddingTop: 6, borderTop: "1px solid #ECE8DC" }}><span>Total</span><span style={{ color: couleur }}>{totalAvecLivraison.toLocaleString("fr-FR")} {entreprise.devise}</span></div>
            </div>

            {erreur && <div style={{ background: "#FBEAE6", color: "#D64933", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5 }}>{erreur}</div>}

            <button onClick={envoyerCommandePanier} disabled={envoi} style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: envoi ? 0.7 : 1 }}>
              {envoi ? "Envoi..." : "Confirmer ma commande"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EnteteLuxuryCar({ entreprise, recherche, setRecherche, onLogoClick, biensLocation = [], onOuvrirCategorie }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const categories = [...new Set(biensLocation.map((b) => b.categorie).filter(Boolean))];

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#0a0a0a" }}>
      <div style={{ background: "#D4AF37", color: "#0a0a0a", textAlign: "center", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
        ✨ VÉHICULES DE LUXE · MATÉRIEL LOURD · IMPORT SUR MESURE DEPUIS LA CHINE
      </div>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div onClick={onLogoClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}>
          {entreprise.logo ? (
            <img src={entreprise.logo} alt={entreprise.nom} style={{ height: 42, objectFit: "contain" }} />
          ) : (
            <span style={{ fontWeight: 800, fontSize: 20, color: "#D4AF37", letterSpacing: "0.02em" }}>{entreprise.nom}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 160, display: "flex", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 6, overflow: "hidden" }}>
          <span style={{ padding: "10px 0 10px 14px", fontSize: 13, color: "#D4AF37" }}>🔍</span>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un véhicule, une machine..."
            style={{ flex: 1, border: "none", background: "transparent", padding: "10px 12px", fontSize: 13, outline: "none", color: "white" }}
          />
        </div>

        {entreprise.whatsapp && (
          <a
            href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.4)", color: "#D4AF37", padding: "9px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            💬 Nous contacter
          </a>
        )}
      </div>

      {categories.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(212,175,55,0.15)", overflowX: "auto" }}>
          <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 20px", display: "flex", gap: 4 }}>
            <button onClick={() => onOuvrirCategorie(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", padding: "12px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>TOUT VOIR</button>
            {categories.map((c) => (
              <button key={c} onClick={() => onOuvrirCategorie(c)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", padding: "12px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroLuxuryCar({ entreprise, biensLocation, onOuvrirVehicule }) {
  const vedettes = biensLocation.filter((b) => b.photo_url).slice(0, 3);
  return (
    <div style={{ position: "relative", background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 60%, #0a0a0a 100%)", padding: "40px 16px", overflow: "hidden", fontFamily: "'Georgia', serif" }}>
      <style>{`
        .rv-lux-hero-outer { max-width: 1300px; margin: 0 auto; position: relative; z-index: 2; display: grid; grid-template-columns: 1fr; gap: 28px; align-items: center; }
        .rv-lux-hero-images { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rv-lux-hero-images .rv-lux-main-img { grid-column: span 2; min-height: 180px !important; }
        .rv-lux-hero-title { font-size: clamp(24px,7vw,52px) !important; }
        @media (min-width: 860px) {
          .rv-lux-hero-outer { grid-template-columns: 1.1fr 1fr; gap: 40px; }
          .rv-lux-hero-images { grid-template-columns: ${vedettes.length >= 3 ? "1.3fr 1fr" : "1fr"}; }
          .rv-lux-hero-images .rv-lux-main-img { grid-column: auto; grid-row: ${vedettes.length >= 3 ? "span 2" : "auto"}; min-height: 220px !important; }
        }
      `}</style>
      <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.14), transparent 70%)" }} />
      <div className="rv-lux-hero-outer">
        <div>
          <div style={{ display: "inline-block", border: "1px solid #D4AF37", color: "#D4AF37", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", padding: "5px 12px", borderRadius: 30, marginBottom: 16 }}>
            EXCELLENCE & PRESTIGE
          </div>
          <div className="rv-lux-hero-title" style={{ fontWeight: 800, color: "white", lineHeight: 1.15, marginBottom: 14 }}>
            {entreprise.nom}<br /><span style={{ color: "#D4AF37" }}>Véhicules, machines & bien plus.</span>
          </div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, marginBottom: 22, maxWidth: 480 }}>
            {entreprise.description || "Louez, commandez ou achetez directement — voitures de luxe, engins de chantier, bennes et maisons préfabriquées, importés sur mesure ou disponibles immédiatement."}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" })}
              style={{ background: "#D4AF37", color: "#0a0a0a", border: "none", borderRadius: 6, padding: "13px 22px", fontWeight: 800, fontSize: 13, cursor: "pointer", letterSpacing: "0.03em" }}
            >
              Explorer le catalogue →
            </button>
            {entreprise.whatsapp && (
              <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "13px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                💬 Parler à un conseiller
              </a>
            )}
          </div>
        </div>

        {vedettes.length > 0 && (
          <div className="rv-lux-hero-images">
            <button className="rv-lux-main-img" onClick={() => onOuvrirVehicule(vedettes[0])} style={{ position: "relative", border: "none", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
              <img src={vedettes[0].photo_url} alt="" style={{ width: "100%", height: "100%", position: "absolute", inset: 0, objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent 60%)" }} />
              <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, textAlign: "left" }}>
                <div style={{ color: "#D4AF37", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" }}>{vedettes[0].categorie}</div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{vedettes[0].nom}</div>
              </div>
            </button>
            {vedettes.slice(1, 3).map((v) => (
              <button key={v.id} onClick={() => onOuvrirVehicule(v)} style={{ position: "relative", border: "none", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", minHeight: 100 }}>
                <img src={v.photo_url} alt="" style={{ width: "100%", height: "100%", position: "absolute", inset: 0, objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent 60%)" }} />
                <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, textAlign: "left" }}>
                  <div style={{ color: "white", fontWeight: 700, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nom}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CarteVehiculeLuxury({ b, devise, onOuvrir }) {
  return (
    <button onClick={() => onOuvrir(b)} style={{ textAlign: "left", background: "#141414", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 12, padding: 0, cursor: "pointer", overflow: "hidden", width: "100%" }}>
      {b.photo_url ? (
        <img src={b.photo_url} alt="" loading="lazy" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: 160, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🚗</div>
      )}
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{b.categorie}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nom}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {b.mode_location && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#D4AF37", border: "1px solid rgba(212,175,55,0.4)", padding: "2px 7px", borderRadius: 999 }}>🔑 Louer</span>}
          {b.mode_commander && <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.25)", padding: "2px 7px", borderRadius: 999 }}>📦 Commander</span>}
          {b.mode_payer_maintenant && <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.25)", padding: "2px 7px", borderRadius: 999 }}>💵 Direct</span>}
        </div>
      </div>
    </button>
  );
}

function SectionsLuxuryCar({ entreprise, biensLocation = [] }) {
  const nbCategories = new Set(biensLocation.map((b) => b.categorie).filter(Boolean)).size;
  return (
    <div style={{ background: "#0a0a0a", fontFamily: "'Georgia', serif" }}>
      {/* Bandeau de confiance */}
      <div style={{ borderTop: "1px solid rgba(212,175,55,0.15)", borderBottom: "1px solid rgba(212,175,55,0.15)", padding: "26px 20px" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
          {[
            ["🌍", "Import direct", "Depuis la Chine, sur commande"],
            ["🔑", "Location flexible", "À la journée, sans engagement long"],
            ["🛡️", "Achat sécurisé", "Véhicules et engins vérifiés"],
            ["💬", "Accompagnement", "Un conseiller dédié à chaque étape"],
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{f[0]}</span>
              <div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{f[1]}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>{f[2]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment ça marche — les 3 modes */}
      <div style={{ padding: "50px 20px", textAlign: "center" }}>
        <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>COMMENT ÇA MARCHE</div>
        <div style={{ color: "white", fontSize: "clamp(22px,3vw,32px)", fontWeight: 800, marginBottom: 36 }}>Trois façons d'obtenir ce dont vous avez besoin</div>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {[
            ["🔑", "LOUER", "Idéal pour un besoin ponctuel — voiture, engin ou matériel loué à la journée, avec caution."],
            ["📦", "COMMANDER", "Le bien n'est pas encore sur place ? On vous le fait venir directement de Chine, délai annoncé à l'avance."],
            ["💵", "PAYER MAINTENANT", "Déjà disponible en Côte d'Ivoire — vous payez et repartez rapidement avec votre bien."],
          ].map(([icone, titre, texte], i) => (
            <div key={i} style={{ background: "#141414", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 14, padding: "30px 24px" }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{icone}</div>
              <div style={{ color: "#D4AF37", fontWeight: 800, fontSize: 15, letterSpacing: "0.04em", marginBottom: 10 }}>{titre}</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.65 }}>{texte}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chiffres */}
      <div style={{ background: "#141414", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
          {[
            [`${biensLocation.length || 0}+`, "Biens disponibles"],
            [`${nbCategories || 0}`, "Catégories"],
            ["100%", "Vérifié avant livraison"],
            ["24/7", "Support client"],
          ].map(([valeur, label], i) => (
            <div key={i}>
              <div style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 800, color: "#D4AF37" }}>{valeur}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA final */}
      <div style={{ padding: "50px 20px", textAlign: "center" }}>
        <div style={{ color: "white", fontSize: "clamp(22px,3vw,30px)", fontWeight: 800, marginBottom: 10, maxWidth: 560, margin: "0 auto 10px" }}>
          Un projet précis en tête ?
        </div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 26, maxWidth: 460, margin: "0 auto 26px", lineHeight: 1.6 }}>
          Décrivez-nous ce que vous cherchez — véhicule, engin, matériel — et on vous accompagne, de la commande à la livraison.
        </div>
        {entreprise.whatsapp && (
          <a
            href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", background: "#D4AF37", color: "#0a0a0a", border: "none", borderRadius: 6, padding: "14px 32px", fontWeight: 800, fontSize: 13.5, textDecoration: "none", letterSpacing: "0.03em" }}
          >
            💬 Discuter avec un conseiller
          </a>
        )}
      </div>
    </div>
  );
}

function PiedPageLuxuryCar({ entreprise, biensLocation = [] }) {
  const anneeEnCours = new Date().getFullYear();
  const categories = [...new Set(biensLocation.map((b) => b.categorie).filter(Boolean))];
  return (
    <div style={{ background: "#0a0a0a", color: "rgba(255,255,255,0.6)", fontFamily: "'Georgia', serif" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "40px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 28, borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
        <div>
          {entreprise.logo ? (
            <img src={entreprise.logo} alt="" style={{ height: 38, objectFit: "contain", marginBottom: 12 }} />
          ) : (
            <div style={{ color: "#D4AF37", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>{entreprise.nom}</div>
          )}
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>{entreprise.description || "Véhicules de luxe, machines et matériel lourd — location, commande ou achat direct."}</div>
        </div>
        {categories.length > 0 && (
          <div>
            <div style={{ color: "#D4AF37", fontWeight: 700, fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Catégories</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {categories.map((c) => <span key={c} style={{ fontSize: 12.5 }}>{c}</span>)}
            </div>
          </div>
        )}
        <div>
          <div style={{ color: "#D4AF37", fontWeight: 700, fontSize: 12, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Contact</div>
          {entreprise.whatsapp && (
            <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, textDecoration: "none" }}>
              💬 Discuter sur WhatsApp
            </a>
          )}
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "16px 20px", fontSize: 11 }}>
        © {anneeEnCours} {entreprise.nom} — Tous droits réservés
      </div>
    </div>
  );
}

function EnteteAzaliExpress({ entreprise, couleur, recherche, setRecherche, onLogoClick, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, nbArticlesPanier = 0, onOuvrirPanier }) {
  const t = creerTraducteur(entreprise.langue);
  const [topbarVisible, setTopbarVisible] = useState(true);
  const [estFixe, setEstFixe] = useState(false);
  const messagesAnnonce = (entreprise.azaliConfig?.messagesAnnonce && entreprise.azaliConfig.messagesAnnonce.length > 0) ? entreprise.azaliConfig.messagesAnnonce : [
    { icone: "🚚", texte: "Livraison gratuite à Abidjan dès 50 000 FCFA" },
    { icone: "💸", texte: "Wave · Orange Money · MTN MoMo acceptés" },
    { icone: "🔄", texte: "Retour facile sous 7 jours" },
    { icone: "📦", texte: "Livraison partout en Côte d'Ivoire" },
  ];

  useEffect(() => {
    function onScroll() {
      const doitEtreFixe = window.scrollY > 34;
      setEstFixe(doitEtreFixe);
      // Le bandeau d'annonces disparaît tout seul dès qu'on commence à faire défiler la page,
      // pour laisser toute la place au contenu — plus besoin de le fermer à la main.
      if (doitEtreFixe) setTopbarVisible(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const styleFixe = estFixe ? { position: "fixed", top: 0, left: 0, right: 0, width: "100%", zIndex: 40, boxShadow: "0 2px 10px rgba(0,0,0,0.15)" } : {};

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      {estFixe && <div style={{ height: 52 }} />}
      <div style={styleFixe}>
        {topbarVisible && (
          <div style={{ background: "#145c2e", color: "rgba(255,255,255,0.92)", padding: "7px 30px", position: "relative" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
              {messagesAnnonce.map((m, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{m.icone} {m.texte}</span>
              ))}
            </div>
            <button onClick={() => setTopbarVisible(false)} aria-label="Fermer" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        )}

        <div style={{ background: couleur, padding: estFixe ? "6px 16px" : "10px 16px", transition: "padding 0.2s ease" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div onClick={onLogoClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
              {entreprise.logo ? (
                <img src={entreprise.logo} alt={entreprise.nom} style={{ height: estFixe ? 28 : 40, objectFit: "contain", transition: "height 0.2s ease" }} />
              ) : (
                <span style={{ fontWeight: 800, fontSize: estFixe ? 14 : 18, color: "white" }}>{entreprise.nom}</span>
              )}
            </div>

            {!estFixe && entreprise.country === "CI" && (
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.8)", flexShrink: 0, lineHeight: 1.3 }}>
                📍 Livrer à<br /><span style={{ fontWeight: 700, color: "white" }}>Abidjan ▾</span>
              </div>
            )}

            <div style={{ flex: 1, minWidth: 140, display: "flex", background: "white", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ padding: estFixe ? "6px 0 6px 12px" : "10px 0 10px 14px", fontSize: 13, color: "#8A9089" }}>🔍</span>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("rechercherProduit") || "Rechercher un produit, une marque..."}
                style={{ flex: 1, border: "none", background: "transparent", padding: estFixe ? "6px 8px" : "10px 10px", fontSize: 13, outline: "none" }}
              />
            </div>

            {!estFixe && entreprise.whatsapp && (
              <a
                href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "4px 10px", borderRadius: 6, textDecoration: "none", flexShrink: 0 }}
              >
                <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.75)" }}>Besoin d'aide ?</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>💬 WhatsApp</span>
              </a>
            )}

            <button
              onClick={onOuvrirPanier}
              style={{ position: "relative", background: "#e8920a", color: "white", border: "none", borderRadius: 8, padding: estFixe ? "6px 11px" : "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
            >
              🛒 {!estFixe && (t("panier") || "Panier")}
              {nbArticlesPanier > 0 && (
                <span style={{ position: "absolute", top: -6, right: -6, background: "#D64933", color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {nbArticlesPanier}
                </span>
              )}
            </button>
          </div>
        </div>

        {!estFixe && (
        <div style={{ background: "#145c2e", padding: "0 16px", overflowX: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
            <span
              onClick={() => onNaviguerVersCollection(null)}
              style={{ color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "10px 14px 10px 0", borderRight: "1px solid rgba(255,255,255,0.2)", marginRight: 6 }}
            >
              ☰ {t("toutesCollections") || "Toutes catégories"}
            </span>
            {collectionsManuelles.map((c) => (
              <span key={c.id} onClick={() => onNaviguerVersCollection(c.id)} style={{ color: "rgba(255,255,255,0.88)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "10px 10px" }}>
                {c.nom}
              </span>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              {aDesBestSellers && (
                <span onClick={() => onNaviguerVersCollection("bestseller")} style={{ color: "#e8920a", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "10px 10px" }}>
                  🔥 Promotions Flash
                </span>
              )}
              {aDesNouveautes && (
                <span onClick={() => onNaviguerVersCollection("nouveautes")} style={{ color: "#e8920a", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "10px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                  ✨ Nouveautés <span style={{ background: "#e8920a", color: "white", fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>NEW</span>
                </span>
              )}
              {entreprise.whatsapp && (
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, padding: "10px 0 10px 10px" }}>📞 {entreprise.whatsapp}</span>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {entreprise.whatsapp && (
        <div style={{ background: "#25d366", color: "white", textAlign: "center", padding: "8px 12px", fontSize: 12, fontWeight: 600 }}>
          💬 {t("besoinAide") || "Besoin d'aide ? Contactez-nous"} — réponse en moins de 30 min !{" "}
          <a
            href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "white", fontWeight: 700, textDecoration: "none", background: "rgba(255,255,255,0.22)", padding: "3px 10px", borderRadius: 4, marginLeft: 6 }}
          >
            {t("ecrireWhatsapp") || "Écrire sur WhatsApp"}
          </a>
        </div>
      )}
    </div>
  );
}

function EnteteBoutique({ entreprise, couleur, recherche, setRecherche, onLogoClick, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, collectionActive, headerConfig, nbArticlesPanier = 0, onOuvrirPanier, biensLocation = [], onOuvrirCategorieBien }) {
  if (entreprise.slug === "luxury-car") {
    return (
      <EnteteLuxuryCar
        entreprise={entreprise}
        recherche={recherche}
        setRecherche={setRecherche}
        onLogoClick={onLogoClick}
        biensLocation={biensLocation}
        onOuvrirCategorie={onOuvrirCategorieBien}
      />
    );
  }
  if (entreprise.slug === "azaliexpress") {
    return (
      <EnteteAzaliExpress
        entreprise={entreprise}
        couleur={couleur}
        recherche={recherche}
        setRecherche={setRecherche}
        onLogoClick={onLogoClick}
        collectionsManuelles={collectionsManuelles}
        aDesBestSellers={aDesBestSellers}
        aDesNouveautes={aDesNouveautes}
        onNaviguerVersCollection={onNaviguerVersCollection}
        nbArticlesPanier={nbArticlesPanier}
        onOuvrirPanier={onOuvrirPanier}
      />
    );
  }

  const aDesLiensPersonnalises = Array.isArray(headerConfig?.liens) && headerConfig.liens.length > 0;
  const aDesLiensNav = aDesLiensPersonnalises || aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0;
  const t = creerTraducteur(entreprise.langue);
  const bgHeader = headerConfig?.bgColor || couleur;
  const texteHeader = headerConfig?.textColor || "white";
  const afficherRecherche = headerConfig?.showSearch !== false;
  const afficherPanier = headerConfig?.showPanier !== false;

  return (
    <div style={{ background: bgHeader, borderBottom: "1px solid rgba(0,0,0,0.08)", position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ background: "rgba(0,0,0,0.12)", overflow: "hidden" }}>
        <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "6px 16px", display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap" }}>
          {headerConfig?.barreTop ? (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: texteHeader, opacity: 0.95, textAlign: "center" }}>{headerConfig.barreTop}</span>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: texteHeader, opacity: 0.95, textAlign: "center" }}>
              {[t("badgeLivraison"), t("badgePaiement"), t("badgeSecurise")].join("  ·  ")}
            </span>
          )}
        </div>
      </div>

      <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onLogoClick}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: onLogoClick ? "pointer" : "default", padding: 0, flexShrink: 0 }}
          >
            {entreprise.logo ? (
              <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
            ) : null}
            <span className="rv-shop-header-nom" style={{ fontWeight: 700, fontSize: 15, color: texteHeader, whiteSpace: "nowrap" }}>{entreprise.nom}</span>
          </button>

          {afficherRecherche && (
            <div className="rv-shop-header-search" style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#8A9089", pointerEvents: "none" }}>🔍</span>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("rechercher")}
                style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.4)", fontSize: 13.5, boxSizing: "border-box" }}
              />
            </div>
          )}

          {entreprise.whatsapp && (
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rv-shop-header-whatsapp"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#EAF3DE", color: "#3B6D11", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              💬 <span className="rv-shop-header-whatsapp-txt">{t("nousContacter")}</span>
            </a>
          )}

          {afficherPanier && onOuvrirPanier && (
            <button
              onClick={onOuvrirPanier}
              style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.2)", border: "none", color: texteHeader, width: 38, height: 38, borderRadius: 10, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
            >
              🛒
              {nbArticlesPanier > 0 && (
                <span style={{ position: "absolute", top: -5, right: -5, background: "#D64933", color: "white", fontSize: 10, fontWeight: 700, minWidth: 17, height: 17, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                  {nbArticlesPanier}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {aDesLiensNav && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", overflowX: "auto" }}>
          <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", gap: 4 }}>
            {aDesLiensPersonnalises ? (
              headerConfig.liens.map((lien) => (
                <a
                  key={lien.id}
                  href={lien.href || "#"}
                  target={lien.href && lien.href.startsWith("http") ? "_blank" : undefined}
                  rel={lien.href && lien.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ background: "none", border: "none", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: 600, color: texteHeader, opacity: 0.85, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" }}
                >
                  {lien.label}
                </a>
              ))
            ) : onNaviguerVersCollection && (
              [
                { id: null, label: t("accueil") },
                ...(aDesBestSellers ? [{ id: "bestseller", label: t("meilleuresVentes") }] : []),
                ...(aDesNouveautes ? [{ id: "nouveautes", label: t("nouveautes") }] : []),
                ...collectionsManuelles.map((col) => ({ id: `manuelle-${col.id}`, label: col.nom })),
              ].map((lien) => {
                const actif = collectionActive === lien.id;
                return (
                  <button
                    key={lien.label}
                    onClick={() => onNaviguerVersCollection(lien.id)}
                    style={{ background: "none", border: "none", borderBottom: actif ? `2px solid ${texteHeader}` : "2px solid transparent", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: actif ? 700 : 600, color: texteHeader, opacity: actif ? 1 : 0.85, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {lien.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCollection({ titre, produits, couleur, devise, langue, onOpen, voirTout, libelleVoirTout, onAjouterAuPanier, estAzali }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{titre}</div>
        {voirTout && (
          <button onClick={voirTout} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            {libelleVoirTout || "Voir tout →"}
          </button>
        )}
      </div>
      <div className="rv-shop-collection-scroll">
        {produits.map((p, i) => (
          <div key={p.produit_id} className="rv-shop-collection-card">
            <RevealOnScroll delai={(i % 6) * 50}>
              <CarteProduit p={p} couleur={couleur} devise={devise} onOpen={onOpen} langue={langue} onAjouterAuPanier={onAjouterAuPanier} estAzali={estAzali} />
            </RevealOnScroll>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevealOnScroll({ children, delai = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observateur = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observateur.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: `opacity 0.55s ease ${delai}ms, transform 0.55s ease ${delai}ms`,
      }}
    >
      {children}
    </div>
  );
}

function CarteProduit({ p, couleur, devise, onOpen, langue, onAjouterAuPanier, estAzali }) {
  const t = creerTraducteur(langue);
  const aDesVraisAvis = p.note_moyenne != null && Number(p.nb_avis) > 0;
  return (
    <div
      onClick={() => onOpen(p)}
      className="rv-shop-card"
      role="button"
      tabIndex={0}
      style={{ display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(22,35,31,0.04)" }}
    >
      <div style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden" }}>
        {p.photo_url ? (
          <img
            src={p.photo_url}
            alt={p.produit_nom}
            loading="lazy"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📦</div>
        )}
        {estAzali && (
          <span style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, zIndex: 2 }}>♡</span>
        )}
        {p.nb_ventes > 0 && (
          <div style={{ position: "absolute", top: 6, left: 6, background: "#8A6412", color: "white", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            🔥 {t("bestSeller")}
          </div>
        )}
        {p.est_nouveau && (
          <div style={{ position: "absolute", top: 6, right: estAzali ? 34 : 6, background: "#1a7a3c", color: "white", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            {t("nouveauBadge")}
          </div>
        )}
        {p.stock_initial != null && Number(p.stock_initial) > 0 && Number(p.stock_initial) <= 5 && (
          <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(214,73,51,0.92)", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            ⚡ {p.stock_initial} {t("restants")}
          </div>
        )}
        {p.livraison_gratuite && !(p.stock_initial != null && Number(p.stock_initial) > 0 && Number(p.stock_initial) <= 5) && (
          <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(31,157,110,0.92)", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            🎁 {t("livraisonGratuiteCourt")}
          </div>
        )}
        {onAjouterAuPanier && (
          <button
            onClick={(e) => { e.stopPropagation(); onAjouterAuPanier(p); }}
            aria-label={t("ajouterPanier")}
            style={{ position: "absolute", bottom: 6, right: 6, width: 32, height: 32, borderRadius: "50%", background: couleur, color: "white", border: "2px solid white", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
          >
            🛒
          </button>
        )}
      </div>
      <div style={{ padding: "10px 12px 14px" }}>
        {estAzali && <div style={{ fontSize: 8.5, fontWeight: 700, color: "#8A9089", letterSpacing: "0.3px", marginBottom: 2 }}>AZALIEXPRESS®</div>}
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3, minHeight: "2.6em" }}>{p.produit_nom}</div>
        {(aDesVraisAvis || estAzali) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ color: "#e8920a", fontSize: 11.5 }}>{aDesVraisAvis ? "★".repeat(Math.round(p.note_moyenne)) + "☆".repeat(5 - Math.round(p.note_moyenne)) : "★★★★★"}</span>
            <span style={{ fontSize: 10.5, color: "#8A9089" }}>({aDesVraisAvis ? p.nb_avis : "4.7"})</span>
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>
          {Number(p.prix_vente).toLocaleString("fr-FR")} {devise}
        </div>
        {estAzali && <div style={{ fontSize: 9.5, color: "#D64933", fontWeight: 700, marginTop: 3 }}>⚡ Stock limité</div>}
      </div>
    </div>
  );
}

function PiedPageAzaliExpress({ entreprise, onOuvrirPolitique, collectionsManuelles = [], onNaviguerVersCollection }) {
  const anneeEnCours = new Date().getFullYear();
  const t = creerTraducteur(entreprise.langue);
  const reseaux = [
    { url: entreprise.facebookUrl, icone: "📘" },
    { url: entreprise.instagramUrl, icone: "📷" },
    { url: entreprise.tiktokUrl, icone: "🎵" },
  ].filter((r) => r.url);

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{ background: "#3d3d3d", color: "white", textAlign: "center", padding: 13, fontSize: 13, cursor: "pointer", border: "none", width: "100%", display: "block", letterSpacing: "0.3px" }}
      >
        ▲ &nbsp; Retour en haut de page
      </button>

      <div style={{ background: "#1a7a3c", padding: "16px 20px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 14 }}>📬 {t("recevoirOffres") || "Recevez nos meilleures offres en exclusivité"}</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 11.5, marginTop: 2 }}>{t("newsletterTexte") || "Promotions flash · Nouveaux produits · Bons plans réservés aux abonnés"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder={t("votreEmail") || "Votre adresse email..."}
              style={{ padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 12.5, minWidth: 220 }}
            />
            <button style={{ background: "#e8920a", color: "white", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
              {t("sabonner") || "S'abonner"}
            </button>
          </div>
        </div>
      </div>

    <div style={{ background: "#131a22", color: "#9aa0a6", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 20px 20px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1.1fr", gap: 26, borderBottom: "1px solid #3a3a3a" }}>
        <div>
          {entreprise.logo ? (
            <img src={entreprise.logo} alt={entreprise.nom} style={{ height: 40, objectFit: "contain", marginBottom: 12, filter: "brightness(0) invert(1)" }} />
          ) : (
            <div style={{ fontWeight: 800, fontSize: 17, color: "white", marginBottom: 12 }}>{entreprise.nom}</div>
          )}
          <div style={{ fontSize: 12, lineHeight: 1.75, marginBottom: 16, maxWidth: 280 }}>
            {entreprise.description || "La première grande plateforme e-commerce de Côte d'Ivoire. Des milliers de produits de qualité importés directement pour vous, livrés rapidement partout en Côte d'Ivoire — et bientôt dans toute l'Afrique de l'Ouest."}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ fontSize: 14, color: "#e8920a", flexShrink: 0 }}>📍</span>
              <span>Cocody Angré Travail, Abidjan<br />Côte d'Ivoire</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
              <span style={{ fontSize: 14, color: "#e8920a", flexShrink: 0 }}>✉️</span>
              <a href="mailto:info@azaliexpress.com" style={{ color: "#9aa0a6", textDecoration: "none" }}>info@azaliexpress.com</a>
            </div>
            {entreprise.whatsapp && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                <span style={{ fontSize: 14, color: "#e8920a", flexShrink: 0 }}>📞</span>
                <a href={`tel:${String(entreprise.whatsapp).replace(/\D/g, "")}`} style={{ color: "#9aa0a6", textDecoration: "none" }}>{entreprise.whatsapp}</a>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ fontSize: 14, color: "#e8920a", flexShrink: 0 }}>⏰</span>
              <span>Lun–Sam : 8h–20h<br />Dim : 9h–17h</span>
            </div>
          </div>

          {reseaux.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "white", fontWeight: 700, marginBottom: 10, letterSpacing: "0.5px" }}>SUIVEZ-NOUS</div>
              <div style={{ display: "flex", gap: 8 }}>
                {reseaux.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #3a3a3a", display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa0a6", fontSize: 15, textDecoration: "none" }}>{r.icone}</a>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #3a3a3a" }}>🛍️ {t("boutique") || "Boutique"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {["Électronique & High-Tech", "Beauté & Soins", "Maison & Électroménager", "Mode & Accessoires", "Auto & Moto", "Sport & Loisirs", "Enfants & Bébés", "🔥 Promotions Flash", "✨ Nouveautés", "Tous les produits"].map((nom) => (
              <span key={nom} onClick={() => onNaviguerVersCollection(null)} style={{ fontSize: 12, cursor: "pointer" }}>{nom}</span>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #3a3a3a" }}>🎧 {t("serviceClient") || "Service Client"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Suivre ma commande</span>
            {entreprise.politiqueLivraison && <span onClick={() => onOuvrirPolitique("livraison")} style={{ fontSize: 12, cursor: "pointer" }}>{t("politiqueLivraison") || "Politique de livraison"}</span>}
            {entreprise.politiqueRetours && <span onClick={() => onOuvrirPolitique("retours")} style={{ fontSize: 12, cursor: "pointer" }}>{t("politiqueRetours") || "Retours & remboursements"}</span>}
            <span style={{ fontSize: 12, cursor: "pointer" }}>FAQ — Questions fréquentes</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Garantie produits</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Faire une réclamation</span>
            {entreprise.whatsapp && (
              <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "inherit", textDecoration: "none" }}>
                {t("supportWhatsapp") || "WhatsApp Support"}
              </a>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #3a3a3a" }}>🏢 À propos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Qui sommes-nous ?</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Notre mission</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Vendez avec nous</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Livraison Afrique de l'Ouest</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Engagement qualité</span>
            <span style={{ fontSize: 12, cursor: "pointer" }}>Nos partenaires</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "white", marginBottom: 10, letterSpacing: "0.3px" }}>💳 Paiements acceptés</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 18 }}>
            {["💸 Wave", "📱 Orange Money", "📱 MTN MoMo", "💳 Visa", "💳 Mastercard", "💵 Cash COD"].map((moyen, i) => (
              <div key={i} style={{ background: "#1e2a1e", border: "1px solid #2a4a2a", borderRadius: 5, padding: "6px 8px", fontSize: 11 }}>{moyen}</div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16, borderTop: "1px solid #3a3a3a" }}>
            {[
              { icone: "🚚", titre: "Livraison 24–72h", texte: "Partout en Côte d'Ivoire" },
              { icone: "🔄", titre: "Retour sous 7 jours", texte: "Sans frais sur Abidjan" },
              { icone: "🛡️", titre: "Achat 100% sécurisé", texte: "Paiement à la livraison" },
              { icone: "⭐", titre: "+5 000 produits", texte: "Qualité vérifiée" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1a7a3c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "white", flexShrink: 0 }}>{s.icone}</div>
                <div style={{ fontSize: 11, lineHeight: 1.4 }}><strong style={{ color: "white", display: "block", fontSize: 12 }}>{s.titre}</strong>{s.texte}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "#0f1519", padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap" }}>
        {["Politique de confidentialité", "Conditions d'utilisation", "Politique de remboursement", "Politique de livraison", "Mentions légales", "FAQ", "Contact"].map((lien, i, arr) => (
          <span key={lien} style={{ fontSize: 11, color: "#9aa0a6", padding: "3px 8px", borderRight: i < arr.length - 1 ? "1px solid #3a3a3a" : "none", whiteSpace: "nowrap", cursor: "pointer" }}>{lien}</span>
        ))}
      </div>

      <div style={{ background: "#0f1519", padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1e2a22", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 11, color: "#9aa0a6", lineHeight: 1.5 }}>
          © {anneeEnCours} <strong style={{ color: "#e8920a" }}>{entreprise.nom.toUpperCase()}</strong> — {t("tousDroitsReserves") || "Tous droits réservés"}.<br />
          Abidjan, Cocody Angré Travail, Côte d'Ivoire · <a href="mailto:info@azaliexpress.com" style={{ color: "#e8920a", textDecoration: "none" }}>info@azaliexpress.com</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#9aa0a6" }}>
          <span style={{ fontSize: 16 }}>🇨🇮</span>
          <span>Fièrement ivoirien · Livraison toute l'Afrique de l'Ouest</span>
        </div>
      </div>
    </div>
    </div>
  );
}

function PiedDePage({ entreprise, onOuvrirPolitique, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, footerConfig, biensLocation = [] }) {
  if (entreprise.slug === "luxury-car") {
    return <PiedPageLuxuryCar entreprise={entreprise} biensLocation={biensLocation} />;
  }
  if (entreprise.slug === "azaliexpress") {
    return (
      <PiedPageAzaliExpress
        entreprise={entreprise}
        onOuvrirPolitique={onOuvrirPolitique}
        collectionsManuelles={collectionsManuelles}
        onNaviguerVersCollection={onNaviguerVersCollection}
      />
    );
  }

  const anneeEnCours = new Date().getFullYear();
  const t = creerTraducteur(entreprise.langue);
  const reseaux = [
    { url: entreprise.facebookUrl, icone: "📘", nom: "Facebook" },
    { url: entreprise.instagramUrl, icone: "📷", nom: "Instagram" },
    { url: entreprise.tiktokUrl, icone: "🎵", nom: "TikTok" },
  ].filter((r) => r.url);
  const bgFooter = footerConfig?.bgColor || "#16231F";
  const texteFooter = footerConfig?.textColor || "rgba(255,255,255,0.75)";
  const colonnesPerso = Array.isArray(footerConfig?.colonnes) ? footerConfig.colonnes.filter((c) => c.titre) : [];

  return (
    <div style={{ background: bgFooter, color: texteFooter, marginTop: 30 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {[
          { icone: "🚚", texte: t("livraisonRapide") },
          { icone: "💵", texte: t("paiementLivraison") },
          { icone: "🔄", texte: t("retourFacile") },
          { icone: "🛡️", texte: t("achatSecurise") },
        ].map((badge, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px" }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{badge.icone}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "white" }}>{badge.texte}</span>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 26 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            {entreprise.logo && (
              <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "contain", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div style={{ fontWeight: 700, fontSize: 16, color: "white" }}>{entreprise.nom}</div>
          </div>
          {entreprise.description && <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>{entreprise.description}</div>}
          {reseaux.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              {reseaux.map((r) => (
                <a
                  key={r.nom}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={r.nom}
                  style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, textDecoration: "none" }}
                >
                  {r.icone}
                </a>
              ))}
            </div>
          )}
        </div>

        {(aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0) && onNaviguerVersCollection && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("boutique")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => onNaviguerVersCollection(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("accueil")}</button>
              {aDesBestSellers && (
                <button onClick={() => onNaviguerVersCollection("bestseller")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("meilleuresVentes")}</button>
              )}
              {aDesNouveautes && (
                <button onClick={() => onNaviguerVersCollection("nouveautes")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("nouveautes")}</button>
              )}
              {collectionsManuelles.map((col) => (
                <button key={col.id} onClick={() => onNaviguerVersCollection(`manuelle-${col.id}`)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{col.nom}</button>
              ))}
            </div>
          </div>
        )}

        {(entreprise.politiqueLivraison || entreprise.politiqueRetours || entreprise.politiqueConfidentialite) && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("informations")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entreprise.politiqueLivraison && (
                <button onClick={() => onOuvrirPolitique("livraison")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("politiqueLivraison")}</button>
              )}
              {entreprise.politiqueRetours && (
                <button onClick={() => onOuvrirPolitique("retours")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("politiqueRetours")}</button>
              )}
              {entreprise.politiqueConfidentialite && (
                <button onClick={() => onOuvrirPolitique("confidentialite")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{t("confidentialite")}</button>
              )}
            </div>
          </div>
        )}
        {colonnesPerso.map((col) => (
          <div key={col.id}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>{col.titre}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(col.liens || []).filter((l) => l.label).map((l, i) => (
                <a
                  key={i}
                  href={l.href || "#"}
                  target={l.href && l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href && l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0, textDecoration: "none" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        ))}
        {entreprise.whatsapp && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {entreprise.logo && (
                <img src={entreprise.logo} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "contain", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <div style={{ fontWeight: 700, fontSize: 13, color: "white", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("contact")}</div>
            </div>
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5, textDecoration: "none" }}
            >
              {t("discuterWhatsapp")}
            </a>
          </div>
        )}
      </div>

      {footerConfig?.newsletterActif && (
        <div style={{ textAlign: "center", padding: "20px 16px", borderTop: "1px solid rgba(255,255,255,0.12)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "white" }}>📩 {t("resteInforme")}</div>
          {footerConfig.newsletterTexte && <div style={{ fontSize: 11.5, opacity: 0.75, margin: "6px 0 12px" }}>{footerConfig.newsletterTexte}</div>}
          {entreprise.whatsapp && (
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(t("texteInscriptionNewsletter"))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "rgba(255,255,255,0.9)", color: "#16231F", borderRadius: 999, padding: "9px 20px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
            >
              {t("sInscrire")}
            </a>
          )}
        </div>
      )}

      {Array.isArray(footerConfig?.paiements) && footerConfig.paiements.filter(Boolean).length > 0 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", padding: "18px 20px 0" }}>
          {footerConfig.paiements.filter(Boolean).map((p, i) => (
            <span key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 600 }}>{p}</span>
          ))}
        </div>
      )}

      {footerConfig?.backToTop !== false && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)", borderRadius: 999, padding: "8px 18px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
          >
            {t("retourEnHaut")}
          </button>
        </div>
      )}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 20px", textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>
        © {anneeEnCours} {entreprise.nom}{!entreprise.marqueBlanche && ` — ${t("proposePar")}`}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" };

function BulleWhatsApp({ whatsapp, messageDefaut, surCtaBar }) {
  if (!whatsapp) return null;
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ position: "fixed", right: 16, bottom: surCtaBar ? 96 : 20, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
      {ouvert && (
        <div style={{ background: "white", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.18)", width: 250, padding: 14, border: "1px solid #ECE8DC" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>💬 Une question ?</div>
            <button onClick={() => setOuvert(false)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#8A9089" }}>×</button>
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 12, lineHeight: 1.5 }}>Écris-nous directement sur WhatsApp, on répond vite.</div>
          <a
            href={`https://wa.me/${String(whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(messageDefaut || "Bonjour, j'ai une question.")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", background: "#168a45", color: "white", borderRadius: 9, padding: "10px 0", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
          >
            Ouvrir la conversation
          </a>
        </div>
      )}
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-label="Contact WhatsApp"
        style={{ width: 54, height: 54, borderRadius: "50%", background: "#168a45", color: "white", border: "none", fontSize: 26, cursor: "pointer", boxShadow: "0 6px 18px rgba(22,138,69,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        💬
      </button>
    </div>
  );
}

function CompteARebours() {
  const [tempsRestant, setTempsRestant] = useState(() => {
    const minuit = new Date();
    minuit.setHours(24, 0, 0, 0);
    return minuit - new Date();
  });

  useEffect(() => {
    const intervalle = setInterval(() => {
      const minuit = new Date();
      minuit.setHours(24, 0, 0, 0);
      setTempsRestant(minuit - new Date());
    }, 1000);
    return () => clearInterval(intervalle);
  }, []);

  const h = Math.floor(tempsRestant / 3600000);
  const m = Math.floor((tempsRestant % 3600000) / 60000);
  const s = Math.floor((tempsRestant % 60000) / 1000);
  const deuxChiffres = (n) => String(n).padStart(2, "0");

  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {[["Hr", h], ["Min", m], ["Sec", s]].map(([label, val]) => (
        <div key={label} style={{ background: "white", borderRadius: 10, padding: "10px 14px", minWidth: 56, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#D64933", fontFamily: "'IBM Plex Mono', monospace" }}>{deuxChiffres(val)}</div>
          <div style={{ fontSize: 9, color: "#8A9089", fontWeight: 700 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function CarteProduitAzali({ p, devise, couleur, ouvrirProduit, onAjouterAuPanier }) {
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, overflow: "hidden" }}>
      <div onClick={() => ouvrirProduit(p)} style={{ position: "relative", cursor: "pointer" }}>
        {p.photo_url ? (
          <img src={p.photo_url} alt="" loading="lazy" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 140, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📦</div>
        )}
        <span style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>♡</span>
      </div>
      <div style={{ padding: "9px 10px" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#8A9089", letterSpacing: "0.3px" }}>AZALIEXPRESS®</div>
        <div onClick={() => ouvrirProduit(p)} style={{ fontSize: 11.5, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>{p.produit_nom}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <span style={{ color: "#e8920a", fontSize: 11, letterSpacing: "-1px" }}>★★★★★</span>
          <span style={{ fontSize: 10, color: "#8A9089" }}>(4.7)</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: couleur, marginTop: 5 }}>{Number(p.prix_vente).toLocaleString("fr-FR")} {devise}</div>
        <div style={{ fontSize: 9.5, color: "#D64933", fontWeight: 700, marginTop: 3 }}>⚡ Stock limité</div>
        {onAjouterAuPanier && (
          <button
            onClick={(e) => { e.stopPropagation(); onAjouterAuPanier(p); }}
            style={{ width: "100%", marginTop: 7, background: couleur, color: "white", border: "none", borderRadius: 7, padding: "7px 0", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
          >
            🛒 Ajout rapide
          </button>
        )}
      </div>
    </div>
  );
}

function CarrouselProduits({ titre, produits, devise, couleur, ouvrirProduit, onAjouterAuPanier, onVoirTout }) {
  if (!produits || produits.length === 0) return null;
  const peuDeProduits = produits.length <= 6;
  return (
    <div style={{ padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#16231F" }}>{titre}</div>
        {onVoirTout && (
          <span onClick={onVoirTout} style={{ fontSize: 12, fontWeight: 700, color: couleur, cursor: "pointer" }}>Voir tout →</span>
        )}
      </div>
      {peuDeProduits ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {produits.map((p, i) => (
            <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
              <CarteProduitAzali p={p} devise={devise} couleur={couleur} ouvrirProduit={ouvrirProduit} onAjouterAuPanier={onAjouterAuPanier} />
            </RevealOnScroll>
          ))}
        </div>
      ) : (
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(150px, 1fr)", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
        {produits.slice(0, 14).map((p, i) => (
          <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
            <CarteProduitAzali p={p} devise={devise} couleur={couleur} ouvrirProduit={ouvrirProduit} onAjouterAuPanier={onAjouterAuPanier} />
          </RevealOnScroll>
        ))}
      </div>
      )}
    </div>
  );
}

function HeroAzaliExpress({ slides, sideCards, onOuvrirCollection, devise }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div style={{ position: "relative", background: "#0c2415", padding: "18px 16px", overflow: "hidden" }}>
      <style>{`
        @keyframes rvAzFloat { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-20px) scale(1.06); } }
        @keyframes rvAzPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes rvAzShine { 0% { left: -60%; } 100% { left: 140%; } }
        @keyframes rvAzBob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-9px) rotate(2deg); } }
        .rv-az-orb1 { position:absolute; top:-100px; right:-100px; width:340px; height:340px; border-radius:50%; background:radial-gradient(circle, rgba(232,146,10,.32), transparent 70%); animation: rvAzFloat 8s ease-in-out infinite; pointer-events:none; }
        .rv-az-orb2 { position:absolute; bottom:-120px; left:5%; width:300px; height:300px; border-radius:50%; background:radial-gradient(circle, rgba(26,122,60,.5), transparent 70%); animation: rvAzFloat 9s ease-in-out infinite reverse; pointer-events:none; }
        .rv-az-cta { position:relative; overflow:hidden; }
        .rv-az-cta::after { content:''; position:absolute; top:0; left:-60%; width:40%; height:100%; background:linear-gradient(120deg,transparent,rgba(255,255,255,.45),transparent); transform:skewX(-20deg); animation: rvAzShine 3.2s infinite; }
        .rv-az-eyebrow::before { content:'⚡'; display:inline-block; animation: rvAzPulse 1.4s infinite; margin-right:4px; }
        .rv-az-sticker { animation: rvAzBob 3.6s ease-in-out infinite; }
        @media(max-width:1000px){ .rv-az-wrap{ grid-template-columns:1fr !important; } .rv-az-side{ flex-direction:row !important; } .rv-az-sticker{ display:none !important; } }
        @media(max-width:600px){ .rv-az-title{ font-size:24px !important; } .rv-az-side{ flex-direction:column !important; } .rv-az-arrow,.rv-az-dots{ display:none !important; } }
      `}</style>
      <div className="rv-az-orb1" />
      <div className="rv-az-orb2" />

      <div className="rv-az-wrap" style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "2.3fr 1fr", gap: 14, maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", minHeight: 340, boxShadow: "0 30px 60px -20px rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.08)", background: "#0c2415" }}>
          {slides.map((s, i) => (
            <div key={i} style={{ position: i === index ? "relative" : "absolute", inset: 0, opacity: i === index ? 1 : 0, transition: "opacity .7s ease", display: i === index ? "flex" : "none", alignItems: "center", minHeight: 340 }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(8,30,16,.92) 0%, rgba(8,30,16,.55) 45%, rgba(8,30,16,.05) 85%)" }} />

              <div style={{ position: "relative", zIndex: 3, padding: "0 36px", maxWidth: 560 }}>
                <span className="rv-az-eyebrow" style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,.08)", border: "1px solid rgba(232,146,10,.5)", color: "#ffb84d", fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", padding: "6px 14px", borderRadius: 30, marginBottom: 14 }}>
                  {s.eyebrow}
                </span>
                <div className="rv-az-title" style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 900, lineHeight: 1.08, marginBottom: 12, color: "white", letterSpacing: "-0.5px" }}>
                  {s.titre} <span style={{ background: "linear-gradient(90deg,#e8920a,#ffd27a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{s.titreAccent}</span>
                </div>
                <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.82)", lineHeight: 1.6, marginBottom: 20, maxWidth: 420 }}>{s.texte}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <button className="rv-az-cta" onClick={() => onOuvrirCollection(s.collectionId)} style={{ background: "linear-gradient(120deg,#e8920a,#ff9f0f)", color: "white", fontWeight: 800, fontSize: 13.5, padding: "13px 26px", borderRadius: 12, border: "none", cursor: "pointer", boxShadow: "0 14px 30px -8px rgba(232,146,10,.65)" }}>
                    Découvrir →
                  </button>
                  <span onClick={() => onOuvrirCollection(null)} style={{ color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.4)", paddingBottom: 2 }}>
                    Voir tous les produits
                  </span>
                </div>
              </div>

              {s.prix != null && (
                <div className="rv-az-sticker" style={{ position: "absolute", zIndex: 4, top: "12%", right: "6%", background: "white", color: "#1a1a1a", borderRadius: 14, padding: "9px 15px", textAlign: "center", boxShadow: "0 14px 30px rgba(0,0,0,.25)" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Dès</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#1a7a3c" }}>{Number(s.prix).toLocaleString("fr-FR")} {devise}</div>
                </div>
              )}
            </div>
          ))}

          {slides.length > 1 && (
            <div className="rv-az-dots" style={{ position: "absolute", bottom: 16, left: 36, zIndex: 5, display: "flex", gap: 7 }}>
              {slides.map((_, i) => (
                <button key={i} onClick={() => setIndex(i)} style={{ width: i === index ? 34 : 22, height: 5, borderRadius: 4, background: i === index ? "#e8920a" : "rgba(255,255,255,.3)", border: "none", cursor: "pointer", padding: 0, transition: "all .2s" }} />
              ))}
            </div>
          )}
        </div>

        {sideCards.length > 0 && (
          <div className="rv-az-side" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sideCards.map((c, i) => (
              <div key={i} onClick={() => onOuvrirCollection(c.collectionId)} style={{ position: "relative", borderRadius: 16, overflow: "hidden", flex: 1, minHeight: 150, cursor: "pointer", boxShadow: "0 18px 36px -14px rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.06)" }}>
                {c.image ? (
                  <img src={c.image} alt={c.titre} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, background: "#16231F" }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(0,0,0,.82) 100%)" }} />
                <div style={{ position: "relative", zIndex: 2, padding: 16, color: "white", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <span style={{ display: "inline-block", background: "#e8920a", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", padding: "3px 9px", borderRadius: 6, marginBottom: 6, alignSelf: "flex-start" }}>Nouveau</span>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25 }}>{c.titre}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ffd27a", marginTop: 6 }}>Découvrir →</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionsAzaliExpress({ collectionsManuelles, produits, devise, couleur, ouvrirProduit, avisBoutique, entreprise, onAjouterAuPanier, setCollectionOuverte }) {
  function produitsDeCollection(col) {
    return produits.filter((p) => col.produitIds.includes(p.produit_id));
  }

  return (
    <div>
      <div style={{ background: "white", padding: "20px 16px", borderBottom: "1px solid #ECE8DC" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[
            { icone: "🚚", titre: "Livraison rapide", texte: "24–72h partout en Côte d'Ivoire" },
            { icone: "💸", titre: "Paiement flexible", texte: "Wave, OM, MoMo & cash à la livraison" },
            { icone: "🔄", titre: "Retours faciles", texte: "7 jours pour changer d'avis" },
            { icone: "🛡️", titre: "Achat sécurisé", texte: "Produits vérifiés & garantis" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>{f.icone}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#16231F" }}>{f.titre}</div>
                <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 1 }}>{f.texte}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(entreprise.azaliConfig?.venteFlashActive !== false) && (
        <div style={{ background: "linear-gradient(135deg,#D64933,#e8920a)", padding: "24px 16px", textAlign: "center" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{entreprise.azaliConfig?.venteFlashTitre || "🔥 Vente Flash — jusqu'à -50%"}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 16 }}>{entreprise.azaliConfig?.venteFlashSousTitre || "Offre valable sur une sélection de produits, stock limité"}</div>
          <CompteARebours />
        </div>
      )}

      {collectionsManuelles.slice(0, 5).map((c) => (
        <CarrouselProduits
          key={c.id}
          titre={c.nom}
          produits={produitsDeCollection(c)}
          devise={devise}
          couleur={couleur}
          ouvrirProduit={ouvrirProduit}
          onAjouterAuPanier={onAjouterAuPanier}
          onVoirTout={() => setCollectionOuverte && setCollectionOuverte(`manuelle-${c.id}`)}
        />
      ))}

      <div style={{ background: "#FAFAF7", padding: "26px 16px", textAlign: "center", borderTop: "1px solid #ECE8DC", borderBottom: "1px solid #ECE8DC" }}>
        <div style={{ fontSize: 11, color: "#8A9089", fontWeight: 700, marginBottom: 16, letterSpacing: "0.4px" }}>NOS CHIFFRES</div>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { valeur: `${produits.length || 90}+`, label: "Produits disponibles" },
            { valeur: `${collectionsManuelles.length || 5}`, label: "Catégories de produits" },
            { valeur: "48h", label: "Délai de livraison moyen" },
            { valeur: "100%", label: "Paiement à la livraison" },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: "clamp(20px,3.5vw,30px)", fontWeight: 900, color: "#1a7a3c" }}>{s.valeur}</div>
              <div style={{ fontSize: 10.5, color: "#6B7168", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {(() => {
        const avisAvecTexte = (avisBoutique || []).filter((a) => a.commentaire && a.commentaire.trim().length > 0);
        if (avisAvecTexte.length === 0) return null;
        return (
          <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 14, color: "#16231F", textAlign: "center" }}>Ce que disent nos clients</div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
              {avisAvecTexte.slice(0, 10).map((a, i) => (
                <div key={i} style={{ flexShrink: 0, width: 220, background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: 14 }}>
                  <div style={{ color: "#e8920a", fontSize: 13, marginBottom: 6 }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</div>
                  <div style={{ fontSize: 12, color: "#16231F", lineHeight: 1.5, marginBottom: 8 }}>{a.commentaire}</div>
                  {a.photo_url && <img src={a.photo_url} alt="Photo du client" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7168" }}>{a.client_nom}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ background: "#16231F", padding: "32px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: 14, letterSpacing: "0.4px" }}>NOS MARQUES PARTENAIRES</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", opacity: 0.6, marginBottom: 30 }}>
          {["🏭", "⚙️", "🏢", "📦"].map((icone, i) => (
            <span key={i} style={{ fontSize: 28 }}>{icone}</span>
          ))}
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "white", marginBottom: 8, maxWidth: 480, margin: "0 auto 8px" }}>Une question ? Notre équipe est là pour vous.</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", maxWidth: 460, margin: "0 auto 20px", lineHeight: 1.6 }}>
          Contactez-nous sur WhatsApp pour un suivi de commande, des conseils produits ou toute autre question. Réponse rapide garantie.
        </div>
        {entreprise?.whatsapp && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "#25d366", color: "white", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
            >
              💬 Écrire sur WhatsApp
            </a>
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "12px 26px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              Nous contacter
            </a>
          </div>
        )}
      </div>

      <div style={{ background: "white", padding: "20px 16px", borderTop: "1px solid #ECE8DC" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { icone: "💸", nom: "Wave" },
            { icone: "📱", nom: "Orange Money" },
            { icone: "📱", nom: "MTN MoMo" },
            { icone: "💳", nom: "Visa / Mastercard" },
            { icone: "💵", nom: "Paiement à la livraison" },
          ].map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 8, padding: "8px 14px", fontSize: 11.5, fontWeight: 600, color: "#16231F" }}>
              <span style={{ fontSize: 14 }}>{m.icone}</span> {m.nom}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageAccueilPersonnalisee({ config, entreprise, couleur, produits, meilleuresVentes, meilleuresVentesToutes, nouveautes, nouveautesToutes, collectionsManuelles, recherche, setRecherche, produitsFiltres, ouvrirProduit, naviguerVersCollection, setCollectionOuverte, setPolitiqueOuverte, politiqueOuverte, NOMBRE_MAX_ACCUEIL, avisBoutique = [], totalArticlesPanier = 0, onOuvrirPanier, onAjouterAuPanier, biensLocation = [], onOuvrirBien }) {
  const devise = entreprise.devise;
  const sectionsNormalisees = (config.sections || []).map((s, i) =>
    typeof s === "string" ? { id: `s${i}`, type: s, visible: true } : { id: s.id || `s${i}`, type: s.type, visible: s.visible !== false }
  );
  const selectedProductIds = config.selectedProductIds || [];
  const selectedCollectionIds = config.selectedCollectionIds || [];
  const selectionnes = selectedProductIds.length ? produits.filter((p) => selectedProductIds.includes(p.produit_id)) : [];
  const fallbackProduits = selectionnes.length ? selectionnes : produits.slice(0, 8);
  const bestsellersAffiches = meilleuresVentes.length ? meilleuresVentes : fallbackProduits.slice(0, 4);

  const derivedCollections = collectionsManuelles.length
    ? collectionsManuelles.filter((c) => !selectedCollectionIds.length || selectedCollectionIds.includes(c.id))
    : [];

  function produitsDeCollection(col) {
    return produits.filter((p) => col.produitIds.includes(p.produit_id));
  }

  const commonPad = { padding: "34px 18px", borderBottom: "1px solid #edf1ee" };
  const aDesLiensNav = meilleuresVentesToutes.length > 0 || nouveautesToutes.length > 0 || collectionsManuelles.length > 0;

  function GrilleProduits({ liste, max }) {
    if (!liste.length) return <div style={{ padding: 16, textAlign: "center", background: "#f6f9f6", borderRadius: 10, color: "#728078", fontSize: 12 }}>Aucun produit pour le moment.</div>;
    const estAzaliIci = entreprise.slug === "azaliexpress";
    return (
      <div className="rv-builder-grid-produits">
        {liste.slice(0, max || 12).map((p, i) => (
          <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
            <CarteProduit p={p} couleur={couleur} devise={devise} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={onAjouterAuPanier} estAzali={estAzaliIci} />
          </RevealOnScroll>
        ))}
      </div>
    );
  }

  function Section({ s }) {
    const type = s.type;
    const couleurSection = (config.sectionColors && config.sectionColors[type]) || couleur;
    const [slideIndex, setSlideIndex] = useState(0);
    useEffect(() => {
      if (type !== "diaporama") return;
      const slides = config.diaporamaSlides || [];
      if (slides.length <= 1) return;
      const t = setInterval(() => setSlideIndex((i) => (i + 1) % slides.length), 5000);
      return () => clearInterval(t);
    }, [type, (config.diaporamaSlides || []).length]);
    if (type === "announcement") return <div style={{ padding: "10px 14px", background: couleurSection, color: couleurTextePourFond(couleurSection), fontSize: 11, fontWeight: 800, textAlign: "center" }}>{config.announcement}</div>;

    if (type === "flash_sale") {
      return (
        <div style={{ padding: "26px 20px", textAlign: "center", background: "linear-gradient(135deg,#D64933,#e8920a)" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{config.flashSaleTitre}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginBottom: 16 }}>{config.flashSaleTexte}</div>
          <CompteARebours />
        </div>
      );
    }

    if (type === "stats") {
      return (
        <div style={{ background: "linear-gradient(160deg, #FFFFFF 0%, #F3F7F1 55%, #ECF3EA 100%)", padding: "30px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#8A9089", fontWeight: 700, marginBottom: 16, letterSpacing: "0.4px" }}>NOS CHIFFRES</div>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 14 }}>
            {(config.statsItems || []).map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.7)", borderRadius: 14, padding: "16px 10px", boxShadow: "0 6px 18px rgba(26,122,60,0.06)" }}>
                <div style={{ fontSize: "clamp(20px,3.5vw,30px)", fontWeight: 900, color: couleurTexteLisible(couleurSection) }}>{s.valeur}</div>
                <div style={{ fontSize: 10.5, color: "#6B7168", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "brands_cta") {
      return (
        <div style={{ background: "linear-gradient(150deg, #1c2b23 0%, #16231F 60%, #0f1a15 100%)", padding: "32px 20px", textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "white", marginBottom: 8, maxWidth: 480, margin: "0 auto 8px" }}>{config.brandsCtaTitre}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", maxWidth: 460, margin: "0 auto 20px", lineHeight: 1.6 }}>{config.brandsCtaTexte}</div>
          {entreprise.whatsapp && (
            <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: "#25d366", color: "white", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
              💬 Écrire sur WhatsApp
            </a>
          )}
        </div>
      );
    }

    if (type === "payment_methods") {
      return (
        <div style={{ background: "white", padding: "20px 16px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {(config.paymentMethodsListe || []).map((m, i) => (
              <div key={i} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 8, padding: "8px 14px", fontSize: 11.5, fontWeight: 600, color: "#16231F" }}>{m}</div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "category_tiles") {
      if (!derivedCollections.length) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 16px", fontSize: 21, color: "#14221b" }}>Faites vos achats par catégorie</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {derivedCollections.slice(0, 8).map((c) => (
              <button key={c.id} onClick={() => setCollectionOuverte(`manuelle-${c.id}`)} style={{ border: 0, padding: "16px 8px", borderRadius: 12, background: "#f5f8f5", textAlign: "center", cursor: "pointer" }}>
                <div style={{ fontSize: 22 }}>🗂️</div>
                <div style={{ fontWeight: 850, fontSize: 11, marginTop: 6 }}>{c.nom}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (type === "featured_product") {
      const p = produits.find((x) => x.produit_id === config.featuredProductId) || produits[0];
      if (!p) return null;
      const inverse = config.featuredProductPosition === "droite";
      const descriptionExtrait = (p.produit_description || "").replace(/<[^>]*>/g, "").slice(0, 160);
      return (
        <div style={{ display: "flex", flexDirection: inverse ? "row-reverse" : "row", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minHeight: 260, background: p.photo_url ? `url(${p.photo_url}) center/cover` : "#eef3ee", display: p.photo_url ? undefined : "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
            {!p.photo_url && "🛍️"}
          </div>
          <div style={{ flex: "1 1 280px", padding: "30px 26px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {config.featuredProductLabel && <div style={{ fontSize: 10.5, fontWeight: 900, color: couleurTexteLisible(couleurSection), letterSpacing: "0.06em", marginBottom: 8 }}>{config.featuredProductLabel.toUpperCase()}</div>}
            <div style={{ fontSize: 23, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{p.produit_nom}</div>
            <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.7, marginBottom: 14 }}>{descriptionExtrait}{descriptionExtrait.length >= 160 ? "…" : ""}</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: couleurTexteLisible(couleurSection), marginBottom: 14 }}>{Number(p.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}</div>
            <button onClick={() => ouvrirProduit(p)} style={{ alignSelf: "flex-start", border: 0, borderRadius: 10, padding: "12px 22px", background: couleurSection, color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>
              {config.buttonText || "Découvrir"}
            </button>
          </div>
        </div>
      );
    }

    if (type === "rich_text") {
      return (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config.richTextTitre}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.75, maxWidth: 640, margin: "0 auto" }}>{config.richTextTexte}</div>
        </div>
      );
    }

    if (type === "video") {
      return (
        <div style={{ padding: "26px 20px" }}>
          {config.videoTitre && <div style={{ fontSize: 19, fontWeight: 900, color: "#132019", marginBottom: 14, textAlign: "center" }}>{config.videoTitre}</div>}
          {config.videoUrl ? (
            <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000", maxWidth: 800, margin: "0 auto" }}>
              <iframe src={urlEmbedVideo(config.videoUrl)} title="Vidéo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
            </div>
          ) : null}
        </div>
      );
    }

    if (type === "trust_logos") {
      if (!config.trustLogos || config.trustLogos.length === 0) return null;
      return (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 28 }}>
            {config.trustLogos.map((u, i) => (
              <img key={i} src={u} alt="" style={{ height: 38, objectFit: "contain", opacity: 0.82 }} />
            ))}
          </div>
        </div>
      );
    }

    if (type === "before_after") {
      return (
        <div style={{ padding: "26px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 700, margin: "0 auto" }}>
            {[["beforeAfterAvant", "beforeAfterLegendeAvant"], ["beforeAfterApres", "beforeAfterLegendeApres"]].map(([imgKey, legKey]) => (
              <div key={imgKey}>
                {config[imgKey] ? (
                  <img src={config[imgKey]} alt="" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 12 }} />
                ) : (
                  <div style={{ height: 220, background: "#eef3ee", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🖼️</div>
                )}
                <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, marginTop: 8, color: "#344239" }}>{config[legKey]}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "cta_banner") {
      return (
        <div style={{ padding: "34px 20px", textAlign: "center", background: config.ctaBannerCouleur || couleurSection }}>
          <div style={{ color: "white", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>{config.ctaBannerTitre}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 18 }}>{config.ctaBannerTexte}</div>
          <button style={{ border: 0, borderRadius: 10, padding: "13px 26px", background: "white", color: config.ctaBannerCouleur || couleurSection, fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
            {config.ctaBannerBouton}
          </button>
        </div>
      );
    }

    if (type === "contact_form") {
      const idBase = `cf-${s.id || Math.random().toString(36).slice(2)}`;
      const envoyer = () => {
        const nom = document.getElementById(`${idBase}-nom`)?.value || "";
        const tel = document.getElementById(`${idBase}-tel`)?.value || "";
        const msg = document.getElementById(`${idBase}-msg`)?.value || "";
        if (!entreprise.whatsapp) return;
        const texte = `Bonjour, je m'appelle ${nom} (${tel}).\n${msg}`;
        window.open(`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(texte)}`, "_blank");
      };
      return (
        <div style={{ padding: "30px 20px" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#132019", marginBottom: 6, textAlign: "center" }}>{config.contactFormTitre}</div>
          <div style={{ fontSize: 12.5, color: "#68756d", marginBottom: 18, textAlign: "center" }}>{config.contactFormTexte}</div>
          <div style={{ display: "grid", gap: 10, maxWidth: 420, margin: "0 auto" }}>
            <input id={`${idBase}-nom`} placeholder="Nom" style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 13 }} />
            <input id={`${idBase}-tel`} placeholder="Téléphone" style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 13 }} />
            <textarea id={`${idBase}-msg`} placeholder="Message" rows={3} style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 13, resize: "vertical" }} />
            <button onClick={envoyer} style={{ border: 0, borderRadius: 10, padding: "12px", background: couleurSection, color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
              Envoyer sur WhatsApp
            </button>
          </div>
        </div>
      );
    }

    if (type === "diaporama") {
      const slides = config.diaporamaSlides || [];
      const slide = slides[slideIndex] || slides[0];
      if (!slide) return null;
      return (
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative", minHeight: 300, background: slide.image ? `url(${slide.image}) center/cover` : `linear-gradient(135deg,${couleurSection},#0b2416)`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "white", padding: 24 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 28, fontWeight: 950, marginBottom: 10 }}>{slide.titre}</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 16, maxWidth: 460, margin: "0 auto 16px" }}>{slide.texte}</div>
              {slide.bouton && <button style={{ border: 0, borderRadius: 10, padding: "12px 24px", background: "white", color: couleurTexteLisible(couleurSection), fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>{slide.bouton}</button>}
            </div>
          </div>
          {slides.length > 1 && (
            <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
              {slides.map((_, i) => (
                <button key={i} onClick={() => setSlideIndex(i)} style={{ width: i === slideIndex ? 20 : 7, height: 6, borderRadius: 4, background: i === slideIndex ? "white" : "rgba(255,255,255,0.5)", border: "none", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
          )}
        </div>
      );
    }

    if (type === "featured_collection") {
      const col = derivedCollections.find((c) => c.id === config.featuredCollectionId) || derivedCollections[0];
      if (!col) return null;
      return (
        <div style={{ position: "relative", minHeight: 260, background: `linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.6)),linear-gradient(135deg,${couleurSection},#0b2416)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "white", padding: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", opacity: 0.85, marginBottom: 8 }}>COLLECTION</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginBottom: 10 }}>{config.featuredCollectionTitre || col.nom}</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 18, maxWidth: 440 }}>{config.featuredCollectionTexte}</div>
          <button onClick={() => setCollectionOuverte(`manuelle-${col.id}`)} style={{ border: 0, borderRadius: 10, padding: "12px 24px", background: "white", color: couleurTexteLisible(couleurSection), fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>
            Voir la collection
          </button>
        </div>
      );
    }

    if (type === "tabs") {
      const items = config.tabsItems || [];
      const actif = items[slideIndex] || items[0];
      if (!actif) return null;
      return (
        <div style={{ padding: "30px 20px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
            {items.map((t, i) => (
              <button key={t.id} onClick={() => setSlideIndex(i)} style={{ padding: "9px 16px", borderRadius: 999, background: i === slideIndex ? couleurSection : "#f0f3f0", color: i === slideIndex ? "white" : "#425048", fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer" }}>
                {t.titre}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 13, color: "#68756d", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>{actif.texte}</div>
        </div>
      );
    }

    if (type === "timeline") {
      const etapes = config.timelineEtapes || [];
      return (
        <div style={{ padding: "30px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 20, maxWidth: 900, margin: "0 auto" }}>
            {etapes.map((e, i) => (
              <div key={e.id} style={{ textAlign: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: couleurSection, color: couleurTextePourFond(couleurSection), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, margin: "0 auto 12px", fontSize: 15 }}>{i + 1}</div>
                <div style={{ fontWeight: 900, fontSize: 13.5, color: "#132019", marginBottom: 6 }}>{e.titre}</div>
                <div style={{ fontSize: 12, color: "#68756d", lineHeight: 1.55 }}>{e.texte}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "reviews_carousel") {
      const avis = avisBoutique && avisBoutique.length ? avisBoutique : [];
      if (avis.length === 0) return null;
      return (
        <div style={{ padding: "26px 20px", maxWidth: 1200, margin: "0 auto" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 21, color: "#14221b", textAlign: "center" }}>Ce que disent nos clients</h3>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
            {avis.slice(0, 10).map((a, i) => (
              <div key={i} style={{ flexShrink: 0, width: 240, background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16 }}>
                <div style={{ color: "#e8920a", fontSize: 14, marginBottom: 8 }}>{"★".repeat(a.note || 5)}{"☆".repeat(5 - (a.note || 5))}</div>
                {a.commentaire && <div style={{ fontSize: 12.5, color: "#16231F", lineHeight: 1.55, marginBottom: 10 }}>{a.commentaire}</div>}
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#6B7168" }}>{a.client_nom}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "image_text_bubble") {
      return (
        <div style={{ padding: "50px 24px", position: "relative" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", maxWidth: 700, margin: "0 auto" }}>
            <div style={{ flex: "1 1 320px", height: 260, borderRadius: 22, background: config.imageTextBubbleImage ? `url(${config.imageTextBubbleImage}) center/cover` : `linear-gradient(135deg,${couleurSection},#0b2416)`, boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }} />
            <div style={{ flex: "1 1 320px", marginLeft: -50, marginTop: 0, background: "white", borderRadius: 20, padding: "28px 24px", boxShadow: "0 18px 40px rgba(0,0,0,0.1)", position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config.imageTextBubbleTitre}</div>
              <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.65 }}>{config.imageTextBubbleTexte}</div>
            </div>
          </div>
        </div>
      );
    }

    if (type === "custom_html") {
      return <div dangerouslySetInnerHTML={{ __html: config.customHtmlCode || "" }} />;
    }

    if (type === "scrolling_alert") {
      return (
        <div style={{ padding: "9px 0", background: couleurSection, overflow: "hidden", whiteSpace: "nowrap" }}>
          <style>{`@keyframes rvScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .rv-scroll-alert { display: inline-block; animation: rvScroll 18s linear infinite; }`}</style>
          <div className="rv-scroll-alert" style={{ color: couleurTextePourFond(couleurSection), fontSize: 12, fontWeight: 800 }}>
            {(config.scrollingAlertTexte || "").repeat(8)}
          </div>
        </div>
      );
    }

    if (type === "two_images_text") {
      return (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config.twoImagesTextTitre}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 20px" }}>{config.twoImagesTextTexte}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 600, margin: "0 auto" }}>
            {[config.twoImagesTextImage1, config.twoImagesTextImage2].map((img, i) => (
              <div key={i} style={{ height: 200, borderRadius: 14, background: img ? `url(${img}) center/cover` : "#eef3ee", display: img ? undefined : "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
                {!img && "🖼️"}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "wavy_banner") {
      return (
        <div style={{ background: couleurSection, padding: "44px 20px 40px", textAlign: "center", position: "relative", clipPath: "ellipse(65% 100% at 50% 0%)" }}>
          <div style={{ color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 24, marginBottom: 18, marginTop: 14 }}>{config.wavyBannerTitre}</div>
          <button style={{ border: 0, borderRadius: 999, padding: "13px 28px", background: "white", color: couleurTexteLisible(couleurSection), fontWeight: 900, fontSize: 13, cursor: "pointer" }}>{config.wavyBannerBouton}</button>
        </div>
      );
    }

    if (type === "hero") {
      if (entreprise.slug === "azaliexpress") {
        const collectionsAvecProduits = derivedCollections.map((c) => ({ collection: c, produits: produitsDeCollection(c) })).filter((x) => x.produits.length > 0);
        if (collectionsAvecProduits.length === 0) return null;
        const slides = collectionsAvecProduits.slice(0, 2).map(({ collection: c, produits: cp }, i) => {
          const moinsCher = cp.reduce((min, p) => (Number(p.prix_vente) < Number(min.prix_vente) ? p : min), cp[0]);
          const image = cp.find((p) => p.photo_url)?.photo_url;
          const mots = c.nom.split(" ");
          return {
            collectionId: `manuelle-${c.id}`,
            image,
            eyebrow: i === 0 ? "Offre limitée" : "Nouveauté",
            titre: mots.slice(0, -1).join(" ") || "Découvrez",
            titreAccent: mots.slice(-1).join(" ") || c.nom,
            texte: `Découvrez notre sélection ${c.nom.toLowerCase()}, qualité garantie et livrée rapidement.`,
            prix: moinsCher ? moinsCher.prix_vente : null,
          };
        });
        const sideCards = collectionsAvecProduits.slice(2, 4).map(({ collection: c, produits: cp }) => ({
          collectionId: `manuelle-${c.id}`,
          image: cp.find((p) => p.photo_url)?.photo_url,
          titre: c.nom,
        }));
        return <HeroAzaliExpress slides={slides} sideCards={sideCards} onOuvrirCollection={setCollectionOuverte} devise={devise} />;
      }
      return (
      <div style={{ textAlign: "center" }}>
        <style>{`.rv-hero-couverture{width:100%;height:220px;object-fit:cover;display:block} @media(max-width:640px){.rv-hero-couverture{height:155px}}`}</style>
        {entreprise.banniere ? (
          <img src={entreprise.banniere} alt="" className="rv-hero-couverture" onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ padding: "50px 20px", background: `linear-gradient(135deg,${couleurSection},#0b2416)`, color: "#fff" }}>
            <div style={{ fontSize: 28, fontWeight: 950 }}>{config.heroTitle}</div>
          </div>
        )}
        <div style={{ padding: "26px 20px 34px" }}>
          <div style={{ fontSize: "clamp(24px,5vw,38px)", fontWeight: 950, color: "#132019", lineHeight: 1.08 }}>{config.heroTitle}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.6, margin: "12px auto 18px", maxWidth: 600 }}>{config.heroSubtitle}</div>
          {config.buttonText && config.buttonText.trim() && (
            <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "13px 22px", background: couleurSection, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
              {config.buttonText}
            </button>
          )}
        </div>
      </div>
      );
    }

    if (type === "image_texte" || type.replace(/_\d+$/, "") === "image_texte") {
      const suf = (/_(\d+)$/.exec(type) || [])[0] || "";
      const img = config[`imageTexteImage${suf}`];
      const titre = config[`imageTexteTitre${suf}`];
      const texte = config[`imageTexteTexte${suf}`];
      const inverse = config[`imageTextePosition${suf}`] === "droite";
      return (
        <div style={{ display: "flex", flexDirection: inverse ? "row-reverse" : "row", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minHeight: 240, background: img ? `url(${img}) center/cover` : `linear-gradient(135deg,${couleurSection},#0b2416)` }} />
          <div style={{ flex: "1 1 280px", padding: "30px 26px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{titre}</div>
            <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.7 }}>{texte}</div>
          </div>
        </div>
      );
    }

    if (type === "collections") {
      if (!derivedCollections.length) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 16px", fontSize: 21, color: "#14221b" }}>Explorer les collections</h3>
          <div className="rv-collections-row">
            {derivedCollections.slice(0, 8).map((c) => {
              const cp = produitsDeCollection(c);
              const cover = cp.find((p) => p.photo_url)?.photo_url;
              return (
                <button key={c.id} className="rv-collections-item" onClick={() => setCollectionOuverte(`manuelle-${c.id}`)} style={{ border: 0, padding: 0, borderRadius: 12, background: "#f5f8f5", textAlign: "center", overflow: "hidden", cursor: "pointer" }}>
                  {cover ? <img src={cover} alt="" loading="lazy" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} /> : <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "#eef3ee" }}>🗂️</div>}
                  <div style={{ padding: "10px 8px" }}><div style={{ fontWeight: 850, fontSize: 12 }}>{c.nom}</div><div style={{ fontSize: 10, color: "#7c877f", marginTop: 3 }}>{cp.length} article(s)</div></div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (type === "bestsellers" || type === "products") {
      const liste = type === "bestsellers" ? bestsellersAffiches : produitsFiltres;
      const max = type === "products" ? NOMBRE_MAX_ACCUEIL : 8;
      const troncature = liste.length > max;
      return (
        <div id={type === "products" ? "rv-shop-produits" : undefined} style={commonPad}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 21, color: "#14221b" }}>{type === "bestsellers" ? "🔥 Meilleures ventes" : "Nos produits"}</h3>
            {troncature && (
              <button onClick={() => setCollectionOuverte(type === "bestsellers" ? "bestseller" : "tous")} style={{ background: "none", border: "none", color: couleurTexteLisible(couleurSection), fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                Voir tout ({liste.length}) →
              </button>
            )}
          </div>
          <GrilleProduits liste={liste} max={max} />
        </div>
      );
    }

    if (type === "bundles") {
      const base = bestsellersAffiches[0]?.prix_vente || produits[0]?.prix_vente || 0;
      const couleurLisible = couleurTexteLisible(couleurSection);
      return (
        <div style={{ ...commonPad, background: "#fffdf7" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 950, color: "#b16b00", letterSpacing: ".08em" }}>🔥 OFFRES QUANTITÉ</div>
            <h3 style={{ margin: "5px 0", fontSize: 22, color: "#14221b" }}>Plus tu prends, plus tu économises</h3>
          </div>
          <div className="rv-builder-grid-bundles">
            {(config.bundles || []).map((b, i) => {
              const total = Number(base) * b.qty * (1 - (Number(b.discount) || 0) / 100);
              return (
                <div key={b.id || i} style={{ border: i === 2 ? "2px solid " + couleurLisible : "1px solid #e4e9e5", borderRadius: 14, padding: 15, background: "#fff" }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#16231c" }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: "#7b857e", marginTop: 4 }}>{b.qty} produit(s) · {b.discount || 0}% de remise</div>
                  <div style={{ fontSize: 21, fontWeight: 950, color: couleurLisible, marginTop: 10 }}>{base ? total.toLocaleString("fr-FR") + " " + devise : "Prix sur demande"}</div>
                  <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ marginTop: 10, width: "100%", border: 0, borderRadius: 9, padding: 10, background: couleurSection, color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 11, cursor: "pointer" }}>
                    Choisir un produit →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (type === "benefits") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>Pourquoi acheter chez nous ?</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          {[["🛡️", "Paiement à la livraison"], ["🚚", "Livraison suivie"], ["💬", "Support rapide"]].map((x) => (
            <div key={x[1]} style={{ padding: 15, borderRadius: 11, background: "#f6f9f6" }}><div style={{ fontSize: 21 }}>{x[0]}</div><div style={{ fontWeight: 850, fontSize: 12, marginTop: 7 }}>{x[1]}</div></div>
          ))}
        </div>
      </div>
    );

    if (type === "promo") return (
      <div style={{ ...commonPad, background: "#f7f2e7", textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: "#b16b00" }}>OFFRE LIMITÉE</div>
        <h3 style={{ fontSize: 25, margin: "8px 0", color: "#162119" }}>{config.promoTitle}</h3>
        <p style={{ fontSize: 12.5, color: "#6f776f" }}>{config.promoText}</p>
        <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 9, padding: "11px 19px", background: "#e8920a", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Profiter de l'offre</button>
      </div>
    );

    if (type === "testimonials") {
      const manuels = (entreprise.temoignagesManuels || []).map((t) => ({ nom: t.nom, note: t.note || 5, texte: t.texte }));
      const reels = (avisBoutique || []).filter((a) => a.commentaire && a.commentaire.trim().length > 0).map((a) => ({ nom: a.client_nom, note: a.note || 5, texte: a.commentaire }));
      const tousTemoignages = [...manuels, ...reels].slice(0, 9);
      if (tousTemoignages.length === 0) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>⭐ Ils nous font confiance</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 11 }}>
            {tousTemoignages.map((t, i) => (
              <div key={i} style={{ padding: 16, border: "1px solid #e6ece7", borderRadius: 12 }}>
                <div style={{ color: "#e8920a" }}>{"★".repeat(t.note)}{"☆".repeat(5 - t.note)}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: "#435047", marginTop: 8 }}>"{t.texte}"</div>
                <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 9 }}>{t.nom}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "gallery") {
      if (!config.gallery?.length) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>Notre univers</h3>
          <div className="rv-builder-grid-galerie">
            {config.gallery.map((u, i) => <img key={i} src={u} alt="" loading="lazy" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} />)}
          </div>
        </div>
      );
    }

    if (type === "faq") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 13px", fontSize: 20, color: "#14221b" }}>Questions fréquentes</h3>
        {["Comment commander ?", "Quels sont les délais ?", "Comment suivre ma commande ?"].map((q) => (
          <div key={q} style={{ padding: "13px 2px", borderBottom: "1px solid #e7ece8", fontSize: 12.5, fontWeight: 800 }}>{q}</div>
        ))}
      </div>
    );

    if (type === "delivery") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 9px", fontSize: 20, color: "#14221b" }}>🚚 Livraison</h3>
        <p style={{ fontSize: 12.5, color: "#68756d", lineHeight: 1.6 }}>{config.livraison}</p>
      </div>
    );

    if (type === "cod_form") return (
      <div style={{ ...commonPad, background: "#f7faf7", textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 950, color: couleurTexteLisible(couleurSection) }}>COMMANDE SIMPLE & RAPIDE</div>
        <h3 style={{ margin: "5px 0 10px", fontSize: 21, color: "#14221b" }}>📝 Choisis un produit pour commander</h3>
        <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "13px 22px", background: couleurSection, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
          Voir les produits
        </button>
      </div>
    );

    if (type === "whatsapp") return (
      <div style={{ ...commonPad, textAlign: "center", background: "#f4faf5" }}>
        <div style={{ fontSize: 27 }}>💬</div>
        <h3 style={{ margin: "8px 0", fontSize: 20, color: "#14221b" }}>Besoin d'aide ?</h3>
        <p style={{ fontSize: 12, color: "#68756d" }}>Écris-nous directement sur WhatsApp.</p>
        {entreprise.whatsapp && (
          <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(config.whatsapp || "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", border: 0, borderRadius: 10, padding: "11px 19px", background: "#168a45", color: "#fff", fontWeight: 900, textDecoration: "none" }}>
            Ouvrir WhatsApp
          </a>
        )}
      </div>
    );

    if (type === "contact") return (
      <div style={{ ...commonPad, textAlign: "center", background: "#0d2417", color: "#fff" }}>
        <h3 style={{ margin: "0 0 9px", fontSize: 25 }}>Prêt à passer à l'action ?</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.68)" }}>Commandez, ou contactez-nous maintenant.</p>
        {config.buttonText && config.buttonText.trim() && (
          <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "12px 21px", background: couleurSection, color: "#fff", fontWeight: 900, cursor: "pointer" }}>{config.buttonText}</button>
        )}
      </div>
    );

    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "sans-serif" }}>
      <style>{`
        .rv-collections-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
        .rv-collections-row::-webkit-scrollbar { height: 5px; }
        .rv-collections-row::-webkit-scrollbar-thumb { background: #DDD8CC; border-radius: 999px; }
        .rv-collections-item { flex: 0 0 140px; width: 140px; }
        @media (min-width: 640px) {
          .rv-collections-row { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); overflow: visible; }
          .rv-collections-item { flex: none; width: auto; }
        }
        .rv-builder-grid-produits { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .rv-builder-grid-bundles { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .rv-builder-grid-galerie { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
        @media (min-width: 640px) {
          .rv-builder-grid-produits { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .rv-builder-grid-bundles { grid-template-columns: repeat(2, 1fr); }
          .rv-builder-grid-galerie { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 960px) {
          .rv-builder-grid-produits { grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .rv-builder-grid-bundles { grid-template-columns: repeat(3, 1fr); }
          .rv-builder-grid-galerie { grid-template-columns: repeat(4, 1fr); }
        }
        @media (min-width: 1280px) {
          .rv-builder-grid-produits { grid-template-columns: repeat(5, 1fr); }
        }
      `}</style>
      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} headerConfig={{ liens: config.headerLinks, bgColor: config.headerBgColor, textColor: config.headerTextColor, barreTop: config.headerBarreTop, showSearch: config.headerShowSearch, showPanier: config.headerShowPanier }} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={onOuvrirPanier} />
      {sectionsNormalisees.filter((s) => s.visible !== false).map((s, i) => {
        const idsCorrespondants = { products: "produits", promo: "promo", contact: "contact", faq: "faq", testimonials: "avis", whatsapp: "whatsapp", delivery: "livraison", bundles: "bundles" };
        return (
          <div key={s.id} id={idsCorrespondants[s.type] || undefined}>
            {i === 0 ? <Section s={s} /> : <RevealOnScroll><Section s={s} /></RevealOnScroll>}
          </div>
        );
      })}
      {entreprise.slug === "azaliexpress" && (
        <SectionsAzaliExpress
          collectionsManuelles={collectionsManuelles}
          produits={produits}
          devise={devise}
          couleur={couleur}
          ouvrirProduit={ouvrirProduit}
          avisBoutique={avisBoutique}
          entreprise={entreprise}
          onAjouterAuPanier={onAjouterAuPanier}
          setCollectionOuverte={setCollectionOuverte}
        />
      )}
      {biensLocation.length > 0 && (
        <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 14, color: "#16231F" }}>🚗 Véhicules & Matériel</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {biensLocation.map((b) => (
              <button
                key={b.id}
                onClick={() => onOuvrirBien(b)}
                style={{ textAlign: "left", background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 0, cursor: "pointer", overflow: "hidden" }}
              >
                {b.photo_url ? (
                  <img src={b.photo_url} alt="" loading="lazy" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: 130, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>🚗</div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 10.5, color: couleur, fontWeight: 700, textTransform: "uppercase" }}>{b.categorie}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nom}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {b.mode_location && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#3B6D11", background: "#EAF3DE", padding: "2px 6px", borderRadius: 999 }}>🔑 Louer</span>}
                    {b.mode_commander && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#1E4B8C", background: "#EAF0FB", padding: "2px 6px", borderRadius: 999 }}>📦 Commander</span>}
                    {b.mode_payer_maintenant && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#8A6412", background: "#FBF3E3", padding: "2px 6px", borderRadius: 999 }}>💵 Direct</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} footerConfig={{ bgColor: config.footerBgColor, textColor: config.footerTextColor, colonnes: config.footerColonnes, newsletterActif: config.footerNewsletterActif, newsletterTexte: config.footerNewsletterTexte, paiements: config.footerPaiements, backToTop: config.footerBackToTop }} />
      {politiqueOuverte && (
        <div onClick={() => setPolitiqueOuverte(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {politiqueOuverte === "livraison" ? "Politique de livraison" : politiqueOuverte === "retours" ? "Politique de retours" : "Politique de confidentialité"}
              </div>
              <button onClick={() => setPolitiqueOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {politiqueOuverte === "livraison" ? entreprise.politiqueLivraison : politiqueOuverte === "retours" ? entreprise.politiqueRetours : entreprise.politiqueConfidentialite}
            </div>
          </div>
        </div>
      )}
      <BulleWhatsApp whatsapp={entreprise.whatsapp} />
    </div>
  );
}
