import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createClient } from "@supabase/supabase-js";
import { EcranAmorce, libererFondAmorce } from "./AmorceBoutique.jsx";
import { AmbianceShop, lireAmbiance } from "./PremiumAmbiance.jsx";
// Product Page Builder (couche additive) : rendu des pages produit personnalisées.
// Aucune page publiée pour un produit => la fiche produit historique ci-dessous est utilisée, inchangée.
import { PageProduitPublique, PageProduitSquelette } from "./PageProduitRenderer.jsx";
import { fusionnerConfigDansProduit, offreParDefaut, composerZoneLivraison, configPubliqueValide, normaliserConfig, blocsActifs, urlImageLegere, couleurCssSure, reparerCouleurs, estClaire, ratioContraste, texteSurFond, libelleDevise, definirMonnaieAffichage, monnaieAffichage, monnaieDuPays, tauxFixe, arrondiLocalBase, montantAffiche, DEVISE_PAR_DEFAUT_PAYS } from "./blocs.js";
import { creerSuiviPage } from "./suivi.js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Le code réel stocké (XOF) doit rester intact pour Facebook Pixel et toute logique interne —
// cette fonction ne change QUE ce qui s'affiche à l'écran/dans les documents, jamais la donnée
// elle-même. C'est pour ça qu'elle est appelée au moment de l'affichage, pas à la source.
function formaterDevise(code) {
  // Client d'un autre pays avec un taux de change saisi par le commerçant : libellé de SA monnaie.
  const m = monnaieAffichage();
  if (m) return m.libelle;
  return code === "XOF" || code === "XAF" ? "F CFA" : code;
}

// jsPDF (~350 Ko) n'est téléchargé que si le client clique sur « Télécharger mon reçu » :
// avant, il alourdissait le premier chargement de TOUTES les visites de la boutique.
async function genererRecuClientPDF(entreprise, form, produitOuvert, quantite, montantTotal, modeLivraison) {
  const { jsPDF } = await import("jspdf");
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
  doc.text(`${montantAffiche(montantTotal)} ${formaterDevise(entreprise.devise)}`, 195, y, { align: "right" });
  y += 10;

  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, 195, y);
  y += 8;
  doc.setFontSize(12);
  doc.text("Total", 15, y);
  doc.text(`${montantAffiche(montantTotal)} ${formaterDevise(entreprise.devise)}`, 195, y, { align: "right" });

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

// Convertit la description riche (HTML) en texte brut lisible à voix haute — insère un point
// après chaque bloc (titre, paragraphe, liste) pour que la synthèse vocale marque une vraie
// pause entre les sections, retire les émojis/symboles que la voix prononcerait littéralement
// (ex: "appareil photo" pour 📸), et nettoie la ponctuation répétée pour une lecture fluide.
function extraireTextePourAudio(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = nettoyerHTML(html);
  div.querySelectorAll("h1, h2, h3, h4, p, li, br").forEach((el) => {
    el.insertAdjacentText("afterend", ". ");
  });
  let texte = div.textContent || "";
  texte = texte.replace(/\p{Extended_Pictographic}/gu, " ");
  texte = texte.replace(/[•●▪️‣►◆★☆♦™®©]/g, " ");
  // Un mot tout en majuscules de 5 lettres ou plus est presque toujours un nom de marque ou
  // de produit, pas un sigle — sans cette conversion, la voix l'épelle lettre par lettre
  // (ex: "DONGYITANG" lu "D-O-N-G-Y-I-T-A-N-G") au lieu de le prononcer comme un mot normal.
  texte = texte.replace(/\b[A-ZÀ-Ý]{5,}\b/g, (mot) => mot.charAt(0) + mot.slice(1).toLowerCase());
  texte = texte.replace(/\s+/g, " ").replace(/(\s*\.\s*){2,}/g, ". ").replace(/\s+\./g, ".").trim();
  return texte;
}

// Bouton "Écouter la description" — lit automatiquement à voix haute le texte déjà écrit
// (aucun enregistrement audio à faire), via la synthèse vocale du navigateur. Se masque
// silencieusement si l'appareil ne supporte pas la synthèse vocale.
function BoutonEcouterDescription({ descriptionHTML, couleur, langue, t }) {
  const [etat, setEtat] = useState("idle"); // idle | lecture | pause
  const supporte = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    // Coupe la lecture si la personne change de produit ou ferme la fiche produit —
    // sinon la voix continue de lire la description d'un produit qu'on ne regarde plus.
    return () => {
      if (supporte) window.speechSynthesis.cancel();
    };
  }, [descriptionHTML]);

  if (!supporte) return null;

  function demarrer() {
    const texte = extraireTextePourAudio(descriptionHTML);
    if (!texte) return;
    window.speechSynthesis.cancel();
    const langueCible = langue === "en" ? "en-US" : "fr-FR";
    const utterance = new SpeechSynthesisUtterance(texte);
    utterance.lang = langueCible;
    utterance.rate = 0.92;
    utterance.pitch = 1;

    // Certains navigateurs proposent plusieurs voix pour une même langue — les voix
    // "réseau" (Google, Microsoft en ligne) sonnent nettement plus naturelles que la
    // voix locale par défaut de l'appareil. On choisit la meilleure disponible sans
    // bloquer si la liste des voix n'est pas encore chargée par le navigateur.
    const choisirMeilleureVoix = () => {
      const voix = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith(langueCible.slice(0, 2)));
      const meilleure = voix.find((v) => !v.localService) || voix[0];
      if (meilleure) utterance.voice = meilleure;
      window.speechSynthesis.speak(utterance);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
      choisirMeilleureVoix();
    } else {
      window.speechSynthesis.onvoiceschanged = choisirMeilleureVoix;
    }

    utterance.onend = () => setEtat("idle");
    utterance.onerror = () => setEtat("idle");
    setEtat("lecture");
  }

  function basculerPause() {
    if (etat === "lecture") {
      window.speechSynthesis.pause();
      setEtat("pause");
    } else if (etat === "pause") {
      window.speechSynthesis.resume();
      setEtat("lecture");
    }
  }

  function arreter() {
    window.speechSynthesis.cancel();
    setEtat("idle");
  }

  if (etat === "idle") {
    return (
      <button
        onClick={demarrer}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: `1.5px solid ${couleur}`, color: couleur, borderRadius: 999, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}
      >
        {t("ecouterDescription")}
      </button>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${couleur}14`, border: `1.5px solid ${couleur}`, borderRadius: 999, padding: "6px 8px 6px 16px", marginBottom: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: couleur }}>
        {etat === "lecture" ? `🔊 ${t("lectureAudioEnCours")}` : `⏸️ ${t("lectureAudioEnPause")}`}
      </span>
      <button
        onClick={basculerPause}
        title={etat === "lecture" ? "Pause" : "Reprendre"}
        style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: couleur, color: "white", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        {etat === "lecture" ? "⏸" : "▶"}
      </button>
      <button
        onClick={arreter}
        title="Arrêter"
        style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${couleur}`, background: "white", color: couleur, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

function lireCookieMeta(nom) {
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + nom + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// Attribution Meta persistante : on conserve fbp/fbc même si le visiteur navigue
// dans la boutique avant de commander. Aucun email n'est nécessaire.
function obtenirAttributionMeta() {
  if (typeof window === "undefined") return { fbp: null, fbc: null };
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  let fbp = lireCookieMeta("_fbp");
  let fbc = lireCookieMeta("_fbc");

  try {
    const sauvegardee = JSON.parse(localStorage.getItem("rv_meta_attribution") || "null");
    if (!fbp && sauvegardee?.fbp) fbp = sauvegardee.fbp;
    if (!fbc && sauvegardee?.fbc) fbc = sauvegardee.fbc;
  } catch (_) {}

  // Si Meta n'a pas encore créé _fbc, on le reconstruit à partir du fbclid.
  if (!fbc && fbclid) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
  }

  try {
    if (fbp || fbc) {
      localStorage.setItem("rv_meta_attribution", JSON.stringify({ fbp: fbp || null, fbc: fbc || null, updated_at: Date.now() }));
    }
  } catch (_) {}

  return { fbp: fbp || null, fbc: fbc || null };
}

function obtenirSourceCampagnePersistante() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source") || params.get("source");
  const campaign = params.get("utm_campaign");
  const fbclid = params.get("fbclid");
  const ttclid = params.get("ttclid");
  let valeur = source || campaign ? [source, campaign].filter(Boolean).join(" — ") : null;
  if (!valeur && fbclid) valeur = "Facebook/Instagram Ads";
  if (!valeur && ttclid) valeur = "TikTok Ads";
  try {
    const ancienne = localStorage.getItem("rv_source_campagne");
    if (valeur) localStorage.setItem("rv_source_campagne", valeur);
    else valeur = ancienne || null;
  } catch (_) {}
  return valeur;
}

// Préchargement lancé par index.html dès l'ouverture de la page (voir window.__RV_PRE) : les
// données de la boutique sont demandées PENDANT le téléchargement du code, pas après. Si le
// préchargement n'existe pas ou a échoué, on retombe sur la requête normale — même résultat.
function utiliserPrechargement(nom, workspaceId, secours) {
  try {
    const pre = typeof window !== "undefined" && window.__RV_PRE;
    if (pre && pre[nom] && pre.wsId === workspaceId) {
      const promesse = pre[nom];
      pre[nom] = null; // usage unique : un rechargement ultérieur redemande des données fraîches
      return Promise.resolve(promesse).then((r) => (r ? { data: r, error: null } : secours()));
    }
  } catch (_) {}
  return secours();
}

// Identifiant partagé navigateur ↔ serveur : Meta l'utilise pour ne compter qu'une fois
// un événement reçu par les deux canaux.
// ============================================================================
//  « Payer maintenant » (OPTIONNEL) — n'apparaît QUE si le commerçant a branché CinetPay ou PayDunya.
//  Le client peut toujours ignorer ce bloc et payer à la livraison : rien ne change pour lui.
// ============================================================================
function BoutonPayerEnLigne({ commandeId, couleur, devise }) {
  const [etat, setEtat] = useState(null); // null = chargement / indisponible
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  useEffect(() => {
    if (!commandeId) return undefined;
    let vivant = true;
    fetch(`/api/facebook-capi?paiement_statut=${encodeURIComponent(commandeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivant && j && j.paiement_possible) setEtat(j); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [commandeId]);
  if (!etat) return null;
  async function payer() {
    setEnCours(true); setErreur("");
    try {
      const r = await fetch("/api/facebook-capi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payer_en_ligne", commandeId }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setErreur(j.error || "Paiement en ligne indisponible pour l'instant. Tu peux payer à la livraison.");
    } catch (_) {
      setErreur("Connexion impossible. Tu peux payer à la livraison.");
    }
    setEnCours(false);
  }
  return (
    <div style={{ background: "white", border: `1.5px solid ${couleur}`, borderRadius: 14, padding: 14, textAlign: "left", marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#16231F" }}>💳 Payer maintenant <span style={{ fontWeight: 500, color: "#6B7168" }}>(facultatif)</span></div>
      <div style={{ fontSize: 12.5, color: "#6B7168", margin: "4px 0 10px", lineHeight: 1.5 }}>
        Réglez tout de suite par Mobile Money ou carte, en toute sécurité : {Number(etat.reste).toLocaleString("fr-FR")} {devise}. Vous pouvez aussi simplement payer à la livraison.
      </div>
      <button onClick={payer} disabled={enCours} style={{ width: "100%", background: couleur, color: couleurTexteLisible(couleur), border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: enCours ? 0.7 : 1 }}>
        {enCours ? "Ouverture du paiement…" : "Payer maintenant"}
      </button>
      {erreur && <div style={{ fontSize: 12, color: "#B23A26", marginTop: 8 }}>{erreur}</div>}
    </div>
  );
}

function genererEventId(prefixe = "ev") {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Marketing de réseau : conserve le code du filleul (?ref=) tout au long du
// parcours client, exactement comme sourceCampagne ci-dessus — un nouveau
// ?ref= valide écrase l'ancien (dernier referral valide = attribution),
// mais on ne stocke QUE si le code a été confirmé valide par le serveur
// (voir validerReferralSiPresent), pour ne jamais faire confiance à une
// valeur d'URL non vérifiée.
function obtenirReferralPersistant() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("rv_referral_code") || null;
  } catch (_) {
    return null;
  }
}

function enregistrerReferralValide(code) {
  try {
    if (code) localStorage.setItem("rv_referral_code", code);
  } catch (_) {}
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
    ecouterDescription: "🔊 Écoute la description et comment l'utiliser, ou tu peux lire",
    lectureAudioEnCours: "Lecture en cours...",
    lectureAudioEnPause: "En pause",
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
    descriptionTitre: "Description",
    ctaEnLigneTitre: "Cliquez ici pour commander",
    ctaEnLigneSous: "paiement à la livraison",
    noteExcellent: "Excellent",
    noteTresBien: "Très bien",
    noteBien: "Bien",
    noteAvisClients: "avis clients",
    economisez: "Économisez",
    photoPrecedente: "Photo précédente",
    photoSuivante: "Photo suivante",
    tesCoordonnees: "Tes coordonnées",
    pourTeContacter: "Pour qu'on puisse te contacter et te livrer.",
    tonNom: "Ton nom",
    tonTelephone: "Ton numéro de téléphone",
    choisirPays: "Choisis ton pays",
    choisirPaysErreur: "⚠️ Choisis ton pays pour que ton numéro soit bien reconnu.",
    numeroAttendu: "Numéro attendu",
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
    voirPlus: "Voir plus",
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
    ecouterDescription: "🔊 Listen to the description and how to use it, or you can read",
    lectureAudioEnCours: "Playing...",
    lectureAudioEnPause: "Paused",
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
    descriptionTitre: "Description",
    ctaEnLigneTitre: "Click here to order",
    ctaEnLigneSous: "pay on delivery",
    noteExcellent: "Excellent",
    noteTresBien: "Very good",
    noteBien: "Good",
    noteAvisClients: "customer reviews",
    economisez: "Save",
    photoPrecedente: "Previous photo",
    photoSuivante: "Next photo",
    tesCoordonnees: "Your details",
    pourTeContacter: "So we can contact you and deliver.",
    tonNom: "Your name",
    tonTelephone: "Your phone number",
    choisirPays: "Select your country",
    choisirPaysErreur: "⚠️ Please select your country so your number is recognised.",
    numeroAttendu: "Expected number",
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
    voirPlus: "See more",
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
  // Guinée et Cameroun : numéros à 9 chiffres sans « 0 » de tête (règle stable) — on ne contrôle que la longueur.
  GN: { longueur: 9, exemple: "622 12 34 56" },
  CM: { longueur: 9, exemple: "6 71 23 45 67" },
};

const INDICATIFS_PAYS_TEL = { CI: "225", BJ: "229", SN: "221", ML: "223", BF: "226", TG: "228", GN: "224", CM: "237", GA: "241", CD: "243", MA: "212", DZ: "213", TN: "216", GH: "233", NG: "234", FR: "33" };

// ===== BOUTIQUE MULTI-PAYS =====
// Une boutique peut vendre dans plusieurs pays (Réglages → Pays de livraison). Dès qu'il y en a
// au moins 2, le client choisit SON pays sur le bon de commande : son numéro est alors contrôlé
// avec les règles de CE pays, et enregistré avec le bon indicatif. Avec un seul pays : rien ne change.
const PAYS_INFOS = {
  CI: { nom: "Côte d'Ivoire", drapeau: "🇨🇮" }, SN: { nom: "Sénégal", drapeau: "🇸🇳" }, ML: { nom: "Mali", drapeau: "🇲🇱" },
  BF: { nom: "Burkina Faso", drapeau: "🇧🇫" }, TG: { nom: "Togo", drapeau: "🇹🇬" }, BJ: { nom: "Bénin", drapeau: "🇧🇯" },
  GN: { nom: "Guinée", drapeau: "🇬🇳" }, CM: { nom: "Cameroun", drapeau: "🇨🇲" }, GA: { nom: "Gabon", drapeau: "🇬🇦" },
  CD: { nom: "RD Congo", drapeau: "🇨🇩" }, MA: { nom: "Maroc", drapeau: "🇲🇦" }, DZ: { nom: "Algérie", drapeau: "🇩🇿" },
  TN: { nom: "Tunisie", drapeau: "🇹🇳" }, GH: { nom: "Ghana", drapeau: "🇬🇭" }, NG: { nom: "Nigeria", drapeau: "🇳🇬" }, FR: { nom: "France", drapeau: "🇫🇷" },
};
// Pays où le « 0 » de tête local disparaît en format international (+233 24…, pas +233 024…).
const PAYS_SANS_ZERO_INTERNATIONAL = new Set(["GH", "NG", "MA", "DZ", "FR", "CD"]);

// Pays proposés au client : ceux cochés par la boutique (ordre conservé), sinon le pays principal.
function paysDeLaBoutique(entreprise) {
  const liste = Array.isArray(entreprise?.countriesLivraison) ? entreprise.countriesLivraison : [];
  const codes = [];
  const listeConfig = Array.isArray(entreprise?.storeConfig?.paysLivraison) ? entreprise.storeConfig.paysLivraison : [];
  [...liste, ...listeConfig, entreprise?.country].forEach((c) => { const code = String(c || "").toUpperCase(); if (PAYS_INFOS[code] && !codes.includes(code)) codes.push(code); });
  return codes;
}

// Si le client tape son numéro avec l'indicatif (+224 6…, 00224 6…), on devine son pays.
function detecterPaysParIndicatif(saisie, codes) {
  const brut = String(saisie || "").trim();
  if (!brut.startsWith("+") && !brut.startsWith("00")) return "";
  const chiffres = brut.replace(/\D/g, "").replace(/^00/, "");
  const tries = [...codes].sort((a, b) => INDICATIFS_PAYS_TEL[b].length - INDICATIFS_PAYS_TEL[a].length);
  return tries.find((c) => chiffres.startsWith(INDICATIFS_PAYS_TEL[c])) || "";
}

// Numéro tel qu'il est ENREGISTRÉ. Pays principal (ou boutique à un seul pays) : format local,
// exactement comme avant. Autre pays : format international « +indicatif… », sans ambiguïté —
// ainsi WhatsApp, Facebook et les relances utilisent le bon indicatif pour chaque client.
function telephoneEnregistre(saisie, codePays, codePrincipal) {
  const local = normaliserTelephoneLocal(saisie, codePays);
  if (!codePays || !codePrincipal || codePays === codePrincipal || !INDICATIFS_PAYS_TEL[codePays]) return local;
  return "+" + INDICATIFS_PAYS_TEL[codePays] + (PAYS_SANS_ZERO_INTERNATIONAL.has(codePays) ? local.replace(/^0/, "") : local);
}

// Pays du client. Un seul pays vendu = ce pays, sans rien demander. Plusieurs = le client choisit
// (choix mémorisé sur son téléphone) ; à défaut, on devine son pays à partir de sa connexion
// (pays seulement, jamais son adresse IP enregistrée) et il peut le changer d'un tap.
// L'état est PARTAGÉ (en-tête, fiche produit, panier voient toujours le même pays et la même monnaie).
const storePaysClient = { choix: undefined, auto: "", geoFait: false, ecouteurs: new Set() };
function memoirePaysClient() { try { return window.localStorage.getItem("rv_pays_client") || ""; } catch (_) { return ""; } }
function emettrePaysClient() { storePaysClient.ecouteurs.forEach((f) => f()); }
function abonnerPaysClient(f) { storePaysClient.ecouteurs.add(f); return () => storePaysClient.ecouteurs.delete(f); }
function instantanePaysClient() {
  if (storePaysClient.choix === undefined) storePaysClient.choix = memoirePaysClient();
  return `${storePaysClient.choix}|${storePaysClient.auto}`;
}

// Taux de change du jour (repli quand le commerçant n'a saisi aucun taux). Mémorisé 12 h dans le navigateur.
const memoireTaux = { base: "", rates: null, encours: false, ecouteurs: new Set() };
function besoinTauxAuto(entreprise, code) {
  const base = String(entreprise?.devise || "").toUpperCase();
  const reglage = entreprise?.storeConfig?.devisesPays?.[code] || {};
  const devise = String(reglage.devise || DEVISE_PAR_DEFAUT_PAYS[code] || "").toUpperCase();
  if (!base || !devise || devise === base) return false;
  if (Number(reglage.taux1000) > 0) return false;
  return !(tauxFixe(devise, base) > 0);
}
function useTauxAuto(base, actif) {
  const b = String(base || "").toUpperCase();
  const [, forcer] = useState(0);
  useEffect(() => {
    if (!actif || !b || typeof fetch !== "function") return;
    const ecoute = () => forcer((n) => n + 1);
    memoireTaux.ecouteurs.add(ecoute);
    if (memoireTaux.base !== b) {
      memoireTaux.base = b; memoireTaux.rates = null; memoireTaux.encours = false;
      try { const c = JSON.parse(window.localStorage.getItem("rv_taux_auto") || "null"); if (c && c.base === b && Date.now() - c.t < 43200000 && c.rates) memoireTaux.rates = c.rates; } catch (_) {}
    }
    if (!memoireTaux.rates && !memoireTaux.encours) {
      memoireTaux.encours = true;
      fetch(`/api/facebook-capi?taux=${encodeURIComponent(b)}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j && j.rates && j.base === b) {
          memoireTaux.rates = j.rates;
          try { window.localStorage.setItem("rv_taux_auto", JSON.stringify({ base: b, t: Date.now(), rates: j.rates })); } catch (_) {}
        }
      }).catch(() => {}).finally(() => { memoireTaux.encours = false; memoireTaux.ecouteurs.forEach((f) => f()); });
    }
    return () => { memoireTaux.ecouteurs.delete(ecoute); };
  }, [actif, b]);
  return actif && memoireTaux.base === b ? memoireTaux.rates : null;
}

function usePaysClient(entreprise) {
  const codes = paysDeLaBoutique(entreprise);
  const multi = codes.length >= 2;
  const instantane = useSyncExternalStore(abonnerPaysClient, instantanePaysClient, () => "|");
  const [choixBrut, autoBrut] = instantane.split("|");
  const choixValide = codes.includes(choixBrut) ? choixBrut : "";
  const autoValide = codes.includes(autoBrut) ? autoBrut : "";
  const choisi = multi ? (choixValide || autoValide) : "";
  const choisir = (code) => { storePaysClient.choix = code || ""; try { if (code) window.localStorage.setItem("rv_pays_client", code); else window.localStorage.removeItem("rv_pays_client"); } catch (_) {} emettrePaysClient(); };
  const detecter = (saisie) => { if (!multi) return; const d = detecterPaysParIndicatif(saisie, codes); if (d && d !== choisi) choisir(d); };
  // Devinette du pays (une seule fois par visite, seulement si le client n'a encore rien choisi).
  const cleCodes = codes.join(",");
  useEffect(() => {
    if (!multi || choixValide || storePaysClient.geoFait || typeof fetch !== "function") return;
    storePaysClient.geoFait = true;
    fetch("/api/facebook-capi?pays=1").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const c = String(j?.pays || "").toUpperCase();
      if (c && storePaysClient.auto !== c) { storePaysClient.auto = c; emettrePaysClient(); }
    }).catch(() => {});
  }, [multi, cleCodes, choixValide]); // eslint-disable-line react-hooks/exhaustive-deps
  const principal = entreprise?.country || codes[0] || "";
  // Taux du jour, demandé seulement si le pays choisi a une autre monnaie SANS taux saisi ni parité fixe.
  const tauxAuto = useTauxAuto(entreprise?.devise, multi && choisi ? besoinTauxAuto(entreprise, choisi) : false);
  const monnaie = multi && choisi ? monnaieDuPays(entreprise?.storeConfig?.devisesPays, entreprise?.devise, choisi, tauxAuto) : null;
  return { codes, multi, principal, choisi, effectif: multi ? choisi : (entreprise?.country || ""), choisir, detecter, monnaie, tauxAuto };
}

// Texte de zone enregistré avec la commande : pays du client (boutique multi-pays) et, s'il paie dans une
// autre monnaie que celle de la boutique, le montant EXACT affiché au client — pour que le livreur sache combien encaisser.
function composerZoneMultiPays(zone, pays, totalBase) {
  let z = String(zone || "");
  if (pays && pays.multi && pays.effectif && PAYS_INFOS[pays.effectif]) z = `${PAYS_INFOS[pays.effectif].nom} — ${z}`;
  const m = pays && pays.monnaie;
  if (m && Number(totalBase) > 0) z += ` — À encaisser : ${montantAffiche(totalBase)} ${m.libelle}`;
  return z;
}

// Petit sélecteur pays / monnaie dans l'en-tête (boutique multi-pays uniquement) : le client voit
// dans quelle monnaie s'affichent les prix et peut changer de pays en un tap.
function SelecteurPaysEntete({ pays, entreprise, couleurTexte = "white", fond = "rgba(255,255,255,0.2)", hauteur = 36 }) {
  if (!pays || !pays.multi) return null;
  const libelleDe = (c) => { const m = monnaieDuPays(entreprise?.storeConfig?.devisesPays, entreprise?.devise, c, pays.tauxAuto); return m ? m.libelle : libelleDevise(entreprise?.devise); };
  const info = pays.choisi ? PAYS_INFOS[pays.choisi] : null;
  return (
    <label className="rv-pays-entete" title="Pays et monnaie" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: fond, color: couleurTexte, height: hauteur, padding: "0 9px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
      <span aria-hidden="true">{info ? `${info.drapeau} ${libelleDe(pays.choisi)}` : "🌍 Pays"}</span>
      <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
      <select
        value={pays.choisi}
        onChange={(e) => pays.choisir(e.target.value)}
        aria-label="Pays et monnaie"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
      >
        <option value="">🌍 Choisis ton pays</option>
        {pays.codes.map((c) => <option key={c} value={c}>{PAYS_INFOS[c].drapeau} {PAYS_INFOS[c].nom} — {libelleDe(c)}</option>)}
      </select>
    </label>
  );
}

// Liste déroulante « Choisis ton pays » (affichée seulement pour une boutique multi-pays).
function SelecteurPays({ pays, langue, style }) {
  if (!pays || !pays.multi) return null;
  const t = creerTraducteur(langue);
  const regle = REGLES_TELEPHONE_PAR_PAYS[pays.choisi];
  return (
    <div className="rv-selecteur-pays">
      <select
        value={pays.choisi}
        onChange={(e) => pays.choisir(e.target.value)}
        aria-label={t("choisirPays")}
        style={{ ...(style || {}), background: "white", color: pays.choisi ? "#16231F" : "#8A9089", appearance: "auto" }}
      >
        <option value="">🌍 {t("choisirPays")}</option>
        {pays.codes.map((c) => <option key={c} value={c}>{PAYS_INFOS[c].drapeau} {PAYS_INFOS[c].nom} (+{INDICATIFS_PAYS_TEL[c]})</option>)}
      </select>
      {pays.choisi && regle && <div style={{ fontSize: 11.5, color: "#6B7168", margin: "-4px 0 10px" }}>{t("numeroAttendu")} : {regle.longueur} · ex. {regle.exemple}</div>}
    </div>
  );
}

// Retire l'indicatif pays si le client l'a tapé lui-même (ex: +225 07 00 00 00 00), pour que
// le numéro enregistré reste toujours au même format local, quel que soit ce que le client a
// tapé. Sans ça, la base de données mélange des formats différents selon les clients.
function normaliserTelephoneLocal(numero, codePays) {
  let chiffres = (numero || "").replace(/\D/g, "");
  const regle = REGLES_TELEPHONE_PAR_PAYS[codePays];
  const indicatif = INDICATIFS_PAYS_TEL[codePays];
  if (indicatif && regle) {
    // "00" est aussi utilisé comme indicatif international (ex: 00225 07 00 00 00 00),
    // en plus du "+" — on le retire d'abord s'il est présent, avant de chercher l'indicatif pays.
    if (chiffres.startsWith("00" + indicatif) && chiffres.length === 2 + indicatif.length + regle.longueur) {
      chiffres = chiffres.slice(2 + indicatif.length);
    } else if (chiffres.startsWith(indicatif) && chiffres.length === indicatif.length + regle.longueur) {
      chiffres = chiffres.slice(indicatif.length);
    }
  } else if (indicatif) {
    // Pays sans règle de longueur vérifiée : on retire l'indicatif seulement s'il a été tapé
    // explicitement avec « + » ou « 00 » (sinon un numéro local pourrait commencer par ces chiffres).
    const brut = String(numero || "").trim();
    if (brut.startsWith("+") || brut.startsWith("00")) {
      const sans00 = brut.startsWith("00") ? chiffres.slice(2) : chiffres;
      if (sans00.startsWith(indicatif)) chiffres = sans00.slice(indicatif.length);
    }
  }
  return chiffres;
}

function validerTelephone(numero, codePays) {
  const chiffres = normaliserTelephoneLocal(numero, codePays);
  const regle = REGLES_TELEPHONE_PAR_PAYS[codePays];

  if (regle) {
    if (chiffres.length !== regle.longueur) {
      return { valide: false, message: `Un numéro ${codePays === "CI" ? "ivoirien" : codePays === "BJ" ? "béninois" : codePays === "SN" ? "sénégalais" : codePays === "GN" ? "guinéen" : codePays === "CM" ? "camerounais" : "valide pour ce pays"} doit comporter ${regle.longueur} chiffres (ex: ${regle.exemple}).` };
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

// Indicatifs des pays couverts par l'app. Important : depuis les réformes de numérotation
// (Côte d'Ivoire 2021, Bénin 2024), le zéro initial fait partie intégrante du numéro à
// 10 chiffres — il ne faut JAMAIS le retirer, juste ajouter l'indicatif pays devant
// (ex: 0509281403 → 2250509281403, pas 225509281403).
const INDICATIFS_PAYS = INDICATIFS_PAYS_TEL;

function formaterTelWhatsapp(numero, codePays) {
  const indicatif = INDICATIFS_PAYS[codePays] || "225";
  const chiffres = String(numero || "").replace(/\D/g, "");
  if (!chiffres) return "";
  if (chiffres.startsWith(indicatif)) return chiffres; // déjà au format international
  return indicatif + chiffres;
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
  const pixelFbRef = useRef(null);
  const [entreprise, setEntreprise] = useState(undefined);
  // Identité "précoce" : nom, logo, couleur mis en cache localement lors d'une
  // précédente visite de CETTE boutique. Sert uniquement à afficher immédiatement
  // le bon logo/onglet/couleur pendant que la vraie donnée réseau arrive — jamais
  // utilisée pour le contenu (produits, prix...), qui attend toujours la vraie requête.
  const cleIdentite = workspaceIdProp || slug || domaine || null;
  const [identitePrecoce] = useState(() => {
    if (!cleIdentite) return null;
    try {
      const brut = localStorage.getItem(`rv_identite_${cleIdentite}`);
      return brut ? JSON.parse(brut) : null;
    } catch (_) { return null; }
  });
  const [produits, setProduits] = useState([]);
  const [biensLocation, setBiensLocation] = useState([]);
  const [filtreCategorieBien, setFiltreCategorieBien] = useState(null);
  const [nbPersonnesEnLigne, setNbPersonnesEnLigne] = useState(1);
  const [bienOuvert, setBienOuvert] = useState(null);
  const [modeChoisi, setModeChoisi] = useState(null);
  const [formBien, setFormBien] = useState({ client: "", tel: "", zone: "", dateDebut: "", dateFin: "", couleur: "" });
  const [envoiBienEnCours, setEnvoiBienEnCours] = useState(false);
  const [erreurEnvoiBien, setErreurEnvoiBien] = useState("");
  const [bienEnvoye, setBienEnvoye] = useState(false);
  const [collectionsManuelles, setCollectionsManuelles] = useState([]);
  const [triCollection, setTriCollection] = useState("defaut");
  const [avisBoutique, setAvisBoutique] = useState([]);
  // fbp / fbc (identifiants Meta) et campagne sont mémorisés dès l'arrivée, pas seulement au
  // moment de la commande : le paramètre fbclid de l'adresse peut disparaître en naviguant.
  const [sourceCampagne] = useState(() => { obtenirAttributionMeta(); return obtenirSourceCampagnePersistante(); });
  const [erreur, setErreur] = useState(null);
  const [panier, setPanier] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rv_panier_${workspaceId}`) || "[]"); } catch (_) { return []; }
  });
  const [panierOuvert, setPanierOuvert] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(`rv_panier_${workspaceId}`, JSON.stringify(panier)); } catch (_) {}
  }, [panier, workspaceId]);


  function ajouterAuPanier(p, quantiteAjoutee = 1) {
    const quantiteAjouteeSure = Math.max(1, Number(quantiteAjoutee) || 1);
    trackEvenement("AddToCart", {
      content_ids: [p.produit_id],
      contents: [{ id: p.produit_id, quantity: quantiteAjouteeSure, item_price: Number(p.prix_vente) || 0 }],
      content_type: "product",
      content_name: p.produit_nom,
      value: (Number(p.prix_vente) || 0) * quantiteAjouteeSure,
      currency: entreprise?.devise || "XOF",
      num_items: quantiteAjouteeSure,
    });
    setPanier((liste) => {
      const existant = liste.find((it) => it.produit_id === p.produit_id);
      if (existant) {
        return liste.map((it) => it.produit_id === p.produit_id ? { ...it, quantite: it.quantite + quantiteAjouteeSure } : it);
      }
      return [...liste, { produit_id: p.produit_id, produit_nom: p.produit_nom, prix_unitaire: Number(p.prix_vente), photo_url: p.photo_url, quantite: quantiteAjouteeSure, livraison_gratuite: !!p.livraison_gratuite, frais_livraison_produit: p.frais_livraison_produit, frais_expedition_produit: p.frais_expedition_produit }];
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
    // S'exécute une seule fois, au tout premier rendu, uniquement si on a un cache
    // et que la vraie donnée n'est pas encore là — évite le "flash" du logo RecuVente
    // dans l'onglet du navigateur sur une boutique déjà visitée une fois.
    if (entreprise !== undefined || !identitePrecoce?.logo) return;
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((lien) => lien.remove());
    const urlAvecCache = `${identitePrecoce.logo}${identitePrecoce.logo.includes("?") ? "&" : "?"}v=${encodeURIComponent(cleIdentite || "shop")}`;
    [
      { rel: "icon", type: "image/png", sizes: "192x192" },
      { rel: "icon", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon" },
    ].forEach((attrs) => {
      const lien = document.createElement("link");
      Object.entries(attrs).forEach(([k, v]) => lien.setAttribute(k, v));
      lien.setAttribute("href", urlAvecCache);
      document.head.appendChild(lien);
    });
    if (identitePrecoce.nom) document.title = identitePrecoce.nom;
  }, []);

  useEffect(() => {
    if (entreprise === undefined || entreprise === null) return;
    libererFondAmorce(entreprise.couleur);

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
  const paysClient = usePaysClient(entreprise); // boutique multi-pays : pays choisi par le client sur le bon de commande
  const totalCommandeRef = useRef(0); // total affiché au client (devise de la boutique), mis à jour à chaque rendu de la fiche produit
  // Monnaie d'affichage du client (null = devise de la boutique) : réglée AVANT le rendu des prix ci-dessous.
  definirMonnaieAffichage(paysClient.monnaie);
  useEffect(() => () => definirMonnaieAffichage(null), []);
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
  const [idCommandeEnvoyee, setIdCommandeEnvoyee] = useState(null);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [engagementCoche, setEngagementCoche] = useState(false);
  const [codePromoInput, setCodePromoInput] = useState("");
  const [codePromoApplique, setCodePromoApplique] = useState(null);
  const [codePromoMessage, setCodePromoMessage] = useState("");
  const [verificationCodePromoEnCours, setVerificationCodePromoEnCours] = useState(false);
  const [lienCopie, setLienCopie] = useState(false);
  const [politiqueOuverte, setPolitiqueOuverte] = useState(null);
  useEffect(() => {
    const h = (e) => { if (e?.detail) setPolitiqueOuverte(e.detail); };
    window.addEventListener("rv-ouvrir-politique", h);
    return () => window.removeEventListener("rv-ouvrir-politique", h);
  }, []);
  const [pagePersoOuverte, setPagePersoOuverte] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [collectionOuverte, setCollectionOuverte] = useState(null);
  const [bundleChoisiId, setBundleChoisiId] = useState(null);
  const [optionsChoisies, setOptionsChoisies] = useState({});
  const [produitBumpId, setProduitBumpId] = useState(null);

  function chargerPixelFacebook(pixelId) {
    if (!pixelId) return;
    pixelFbRef.current = pixelId;
    if (window.fbq) {
      // Déjà démarré par index.html (identité en cache) — PageView déjà envoyé. Si le marchand
      // a changé de Pixel depuis la dernière visite, on ajoute le nouveau sans doubler l'ancien.
      if (window.__RV_FB && window.__RV_FB !== pixelId) {
        window.fbq("init", pixelId);
        window.fbq("trackSingle", pixelId, "PageView");
        window.__RV_FB = pixelId;
      }
      return;
    }
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
    window.__RV_FB = pixelId;
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

  // Copie « serveur » (Conversions API) des événements d'entonnoir. Sur iPhone, dans le
  // navigateur intégré de Facebook/Instagram ou avec un bloqueur de publicités, le Pixel du
  // navigateur est souvent bloqué ou retardé : Facebook ne voit alors ni la vue produit ni
  // l'ajout au panier et optimise mal. Le serveur, lui, ne peut pas être bloqué. Le même
  // eventID est envoyé des deux côtés : Meta ne compte l'événement qu'une fois.
  function envoyerEvenementServeur(nom, params, eventID) {
    if (!workspaceId || !pixelFbRef.current) return;
    try {
      const meta = obtenirAttributionMeta();
      fetch("/api/facebook-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          nom,
          eventId: eventID,
          fbp: meta.fbp,
          fbc: meta.fbc,
          url: window.location.href,
          params: {
            value: params?.value,
            currency: params?.currency,
            content_ids: params?.content_ids,
            content_type: params?.content_type,
            content_name: params?.content_name,
            contents: params?.contents,
            num_items: params?.num_items,
          },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  const EVENEMENTS_DOUBLES = ["ViewContent", "AddToCart", "InitiateCheckout"];

  function trackEvenement(nom, params = {}, options = {}) {
    // eventID est indispensable lorsqu'un même événement est envoyé par le navigateur
    // ET par Conversions API. Pour Purchase, il doit être exactement le même des deux côtés.
    let eventID = options.eventID;
    const doubler = EVENEMENTS_DOUBLES.includes(nom);
    if (doubler && !eventID) eventID = genererEventId(nom.toLowerCase());
    if (window.fbq) {
      if (eventID) {
        window.fbq("track", nom, params, { eventID });
      } else {
        window.fbq("track", nom, params);
      }
    }
    if (doubler) envoyerEvenementServeur(nom, params, eventID);
    if (window.ttq) {
      window.ttq.track(nom, {
        content_id: params?.content_ids?.[0],
        content_type: params?.content_type || "product",
        content_name: params?.content_name,
        value: params?.value,
        currency: params?.currency,
        quantity: params?.num_items,
      });
    }
  }

  async function envoyerEvenementCapi(commandeId) {
    if (!commandeId) return false;
    const cle = `rv_capi_purchase_${commandeId}`;
    try {
      if (sessionStorage.getItem(cle) === "sent") return true;
    } catch (_) {}

    for (let tentative = 0; tentative < 3; tentative++) {
      try {
        const reponse = await fetch("/api/facebook-capi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commandeId }),
          keepalive: true,
        });
        const resultat = await reponse.json().catch(() => ({}));
        if (reponse.ok && (resultat.envoye || resultat.raison === "Déjà envoyé précédemment pour cette commande")) {
          try { sessionStorage.setItem(cle, "sent"); } catch (_) {}
          return true;
        }
      } catch (_) {}
      if (tentative < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (tentative + 1)));
    }
    return false;
  }

  useEffect(() => {
    if (workspaceIdProp || !slug) return;
    const pre = window.__RV_PRE;
    const demande = pre && pre.ws && pre.cle === slug && pre.fn === "slug" ? Promise.resolve(pre.ws).then((r) => (r ? { data: r, error: null } : supabase.rpc("workspace_id_par_slug", { p_slug: slug }))) : supabase.rpc("workspace_id_par_slug", { p_slug: slug });
    demande.then(({ data, error }) => {
      if (error || !data) {
        setErreur("Cette boutique est introuvable.");
        return;
      }
      setWorkspaceId(data);
    });
  }, [slug, workspaceIdProp]);

  useEffect(() => {
    if (workspaceIdProp || slug || !domaine) return;
    const pre = window.__RV_PRE;
    const demande = pre && pre.ws && pre.cle === domaine && pre.fn === "domaine" ? Promise.resolve(pre.ws).then((r) => (r ? { data: r, error: null } : supabase.rpc("workspace_id_par_domaine", { p_domaine: domaine }))) : supabase.rpc("workspace_id_par_domaine", { p_domaine: domaine });
    demande.then(({ data, error }) => {
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

    // Marketing de réseau : un ?ref=CODE dans l'URL est vérifié côté serveur avant
    // d'être conservé. S'il est valide, il écrase le referral précédemment stocké
    // (dernier referral valide du parcours). S'il est absent ou invalide, on ne
    // touche pas au referral déjà en mémoire — la boutique fonctionne normalement
    // sans ?ref=, exactement comme avant ce module.
    const refDetecte = paramsUrl.get("ref");
    if (refDetecte) {
      supabase.rpc("valider_referral_public", { p_workspace_id: workspaceId, p_code: refDetecte }).then(({ data }) => {
        const resultat = data && data[0];
        if (resultat?.valide) enregistrerReferralValide(refDetecte);
      });
    }

    utiliserPrechargement("cat", workspaceId, () => supabase.rpc("catalogue_public", { p_workspace_id: workspaceId })).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce catalogue est introuvable ou vide.");
        return;
      }
      setEntreprise({
        nom: data[0].entreprise_nom,
        devise: data[0].devise,
        logo: data[0].logo_url,
        banniere: data[0].banniere_url,
        couleur: couleurCssSure(data[0].couleur_marque, "#1a7a3c"),
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
        storeConfig: reparerCouleurs(data[0].store_config_published) || null,
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
        // Pages libres importées/créées côté admin (À propos, Contact, CGV, FAQ...), avec leur
        // emplacement ("header" | "footer" | "aucun") déterminé automatiquement à l'import.
        // ⚠️ Nécessite que la fonction Supabase `catalogue_public` renvoie aussi la colonne
        // `pages_personnalisees` de `workspaces` — sinon ce tableau reste vide en silence.
        pagesPersonnalisees: Array.isArray(data[0].pages_personnalisees) ? data[0].pages_personnalisees : [],
      });
      // Identité mise en cache pour la prochaine visite de cette boutique : la fois
      // suivante, le bon logo/couleur/nom s'affichent dès l'ouverture de la page,
      // sans attendre cette requête réseau.
      if (cleIdentite) {
        try {
          localStorage.setItem(`rv_identite_${cleIdentite}`, JSON.stringify({
            nom: data[0].entreprise_nom,
            logo: data[0].logo_url,
            couleur: couleurCssSure(data[0].couleur_marque, "#1a7a3c"),
            // Pixel Facebook : gardé pour que la prochaine visite le démarre dès l'ouverture
            // de la page (index.html), sans attendre le réseau.
            fb: data[0].facebook_pixel_id || null,
          }));
        } catch (_) {}
      }
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
          // Un lien de publicité pointe presque toujours directement sur un produit : sans
          // cet événement, Facebook ne voyait AUCUNE vue produit pour ces visiteurs
          // (ViewContent n'était envoyé qu'au clic sur une carte de la boutique).
          trackEvenement("ViewContent", {
            content_ids: [trouve.produit_id],
            contents: [{ id: trouve.produit_id, quantity: 1, item_price: Number(trouve.prix_vente) || 0 }],
            content_type: "product",
            content_name: trouve.produit_nom,
            value: Number(trouve.prix_vente) || 0,
            currency: data[0].devise || "XOF",
            num_items: 1,
          });
        }
      }

      // Liens de navigation (menu header/footer du Store Builder) pointant vers une
      // collection ou une page libre : ?collection=<id> ouvre l'écran de la collection,
      // ?page=<slug> ouvre la fiche de la page — exactement comme ?produit= ci-dessus.
      const idCollectionDansUrl = new URLSearchParams(window.location.search).get("collection");
      if (idCollectionDansUrl) setCollectionOuverte(`manuelle-${idCollectionDansUrl}`);
      const slugPageDansUrl = new URLSearchParams(window.location.search).get("page");
      if (slugPageDansUrl) {
        const pagesDispo = Array.isArray(data[0].pages_personnalisees) ? data[0].pages_personnalisees : [];
        const pageTrouvee = pagesDispo.find((p) => p.slug === slugPageDansUrl);
        if (pageTrouvee) setPagePersoOuverte(pageTrouvee);
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

    utiliserPrechargement("tem", workspaceId, () => supabase.rpc("temoignages_publics", { p_workspace_id: workspaceId })).then(({ data: dataTemoignages }) => {
      setAvisBoutique(dataTemoignages || []);
    });

    utiliserPrechargement("col", workspaceId, () => supabase.rpc("collections_publiques", { p_workspace_id: workspaceId })).then(({ data: dataCollections }) => {
      if (!dataCollections || dataCollections.length === 0) return;
      const parCollection = {};
      dataCollections.forEach((ligne) => {
        if (!parCollection[ligne.collection_id]) {
          // Le nom affiché est nettoyé (un « handle » Shopify brut comme "toges-avocat" devient
          // "Toges Avocat") ; l'image et la description sont lues si la base les fournit.
          parCollection[ligne.collection_id] = {
            id: ligne.collection_id, nom: joliNomCollection(ligne.collection_nom), ordre: ligne.ordre, produitIds: [],
            image: ligne.collection_image_url || ligne.image_url || ligne.collection_image || "",
            description: ligne.collection_description || ligne.description || "",
          };
        }
        parCollection[ligne.collection_id].produitIds.push(ligne.produit_id);
      });
      setCollectionsManuelles(Object.values(parCollection).sort((a, b) => a.ordre - b.ordre));
      // Bonus discret : si la base autorise la lecture publique de l'image / description des
      // collections, on les récupère (rien ne casse si ce n'est pas autorisé).
      try {
        Promise.resolve(supabase.from("collections").select("id,image_url,description").eq("workspace_id", workspaceId)).then((r) => {
          const lignes = r && r.data;
          if (!Array.isArray(lignes) || !lignes.length) return;
          setCollectionsManuelles((prev) => prev.map((c) => { const l = lignes.find((x) => x.id === c.id); return l ? { ...c, image: c.image || l.image_url || "", description: c.description || l.description || "" } : c; }));
        }).catch(() => {});
      } catch (_) { /* silencieux */ }
    });
  }, [workspaceId]);

  function ouvrirProduit(p) {
    trackEvenement("ViewContent", {
      content_ids: [p.produit_id],
      contents: [{ id: p.produit_id, quantity: 1, item_price: Number(p.prix_vente) || 0 }],
      content_type: "product",
      content_name: p.produit_nom,
      value: Number(p.prix_vente) || 0,
      currency: entreprise?.devise || "XOF",
      num_items: 1,
    });
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
    setIdCommandeEnvoyee(null);
    setErreurEnvoi("");
    setAvisListe([]);
    setAfficherFormAvis(false);
    setFormAvis({ nom: "", note: 5, commentaire: "" });
    setAvisEnvoye(false);
    avisChargesRef.current = p.produit_id;
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
    setPagePersoOuverte(null);
    setPolitiqueOuverte(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
  }

  function naviguerVersCollection(id) {
    setProduitOuvert(null);
    setPagePersoOuverte(null);
    setPolitiqueOuverte(null);
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
    if (paysClient.multi && !paysClient.effectif) {
      setErreurEnvoi(t("choisirPaysErreur"));
      return;
    }
    const verifTel = validerTelephone(form.tel, paysClient.effectif);
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
    const livraisonGratuiteV = !!produitOuvert.livraison_gratuite || (produitOuvert.livraison_gratuite_qte_min && quantite >= Number(produitOuvert.livraison_gratuite_qte_min));
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
    // Marketing de réseau : si un referral filleul valide est actif pour cette visite,
    // on passe par la RPC v2 (qui attribue la vente + calcule la commission) ; sinon,
    // comportement rigoureusement inchangé — on garde la RPC d'origine.
    const referralActifCommande = obtenirReferralPersistant();
    const { data, error } = await supabase.rpc(referralActifCommande ? "creer_commande_multi_publique_v2" : "creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: telephoneEnregistre(form.tel, paysClient.effectif, paysClient.principal),
      p_zone: composerZoneMultiPays(composerZoneLivraison(form), paysClient, totalCommandeRef.current),
      p_items: items,
      p_type_livraison: (() => {
        const livraisonGratuiteP = !!produitOuvert.livraison_gratuite || (produitOuvert.livraison_gratuite_qte_min && quantite >= Number(produitOuvert.livraison_gratuite_qte_min));
        const fraisExpeditionP = livraisonGratuiteP ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
        return !livraisonGratuiteP && fraisExpeditionP > 0 ? typeLivraisonChoisi : "livraison";
      })(),
      p_fbp: obtenirAttributionMeta().fbp,
      p_fbc: obtenirAttributionMeta().fbc,
      p_user_agent: navigator.userAgent,
      p_event_source_url: window.location.href,
      p_source_campagne: sourceCampagne,
      ...(referralActifCommande ? { p_referral_code: referralActifCommande } : {}),
    });
    setEnvoi(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoi(resultat?.message || t("erreurGenerique"));
      return;
    }
    // Signal immédiat à Facebook, dès la commande passée — comme Shopify. Le tableau de bord
    // renverra le même signal à la confirmation si celui-ci échoue pour une raison quelconque
    // (le serveur ignore les doublons automatiquement, jamais compté deux fois).
    const idCommandeCreee = resultat.commande_id || resultat.id;
    const valeurCommande = Number(resultat.montant ?? resultat.total ?? items.reduce((s, it) => s + Number(it.prix_unitaire) * Number(it.quantite), 0));
    const deviseCommande = entreprise?.devise || "XOF";
    const contenusCommande = items.map((it) => ({
      id: it.produit_id,
      quantity: Number(it.quantite) || 1,
      item_price: Number(it.prix_unitaire) || 0,
    }));

    // 1) CAPI côté serveur. 2) Purchase côté navigateur avec exactement le même event_id.
    // Cela permet à Meta de dédupliquer les deux signaux au lieu de compter deux achats.
    if (idCommandeCreee) {
      const eventIdPurchase = `commande-${idCommandeCreee}`;
      trackEvenement("Purchase", {
        content_ids: contenusCommande.map((x) => x.id),
        contents: contenusCommande,
        content_type: "product",
        value: valeurCommande,
        currency: deviseCommande,
        num_items: contenusCommande.reduce((s, x) => s + x.quantity, 0),
      }, { eventID: eventIdPurchase });
      envoyerEvenementCapi(idCommandeCreee);
    }

    trackEvenement("Lead", {
      content_ids: contenusCommande.map((x) => x.id),
      contents: contenusCommande,
      content_type: "product",
      value: valeurCommande,
      currency: deviseCommande,
      num_items: contenusCommande.reduce((s, x) => s + x.quantity, 0),
    }, { eventID: idCommandeCreee ? `lead-${idCommandeCreee}` : undefined });
    if (codePromoApplique) {
      supabase.rpc("incrementer_utilisation_code_promo", { p_workspace_id: workspaceId, p_code: codePromoApplique.code }).then(() => {});
    }
    supabase.rpc("marquer_panier_converti", { p_workspace_id: workspaceId, p_tel: telephoneEnregistre(form.tel, paysClient.effectif, paysClient.principal), p_produit_id: produitOuvert.produit_id }).then(() => {});
    suivrePage("commande_creee", { commande_id: idCommandeCreee, offre_id: bundleChoisiId ?? "base", montant: valeurCommande });
    setIdCommandeEnvoyee(idCommandeCreee || null);
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
        p_tel: telephoneEnregistre(form.tel, paysClient.effectif, paysClient.principal),
        p_produit_id: produitOuvert.produit_id,
        p_produit_nom: produitOuvert.produit_nom,
        p_montant: Number(produitOuvert.prix_vente) || null,
      }).then(() => {});
    }, 5000);
    return () => clearTimeout(delai);
  }, [form.tel, form.client, produitOuvert?.produit_id, workspaceId, envoye, paysClient.effectif]);

  // Advanced Matching (Facebook) : dès que le client a tapé son téléphone (et nom / ville), on le
  // transmet au Pixel. Facebook le hache lui-même avant l'envoi. Les événements suivants (achat,
  // lead) partent alors avec ces informations : Facebook reconnaît mieux l'acheteur, donc
  // optimise mieux les publicités. Rien n'est envoyé tant que le numéro n'est pas complet.
  const dernierMatchFbRef = useRef("");
  useEffect(() => {
    const pixel = pixelFbRef.current;
    const chiffres = (form.tel || "").replace(/\D/g, "");
    if (!pixel || typeof window === "undefined" || typeof window.fbq !== "function" || chiffres.length < 8 || envoye) return undefined;
    const delai = setTimeout(() => {
      try {
        // Numéro au format international (indicatif + numéro national), comme Facebook l'attend :
        // en Côte d'Ivoire et au Bénin le « 0 » de tête fait partie du numéro (+225 07 …).
        const paysMatch = paysClient.effectif || entreprise?.country;
        const national = normaliserTelephoneLocal(form.tel, paysMatch).replace(/\D/g, "");
        const ud = { ph: (INDICATIFS_PAYS_TEL[paysMatch] || "") + national };
        const mots = String(form.client || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (mots[0]) ud.fn = mots[0];
        if (mots.length > 1) ud.ln = mots.slice(1).join(" ");
        const ville = String(form.zone || "").toLowerCase().replace(/[^a-zà-ÿ]/g, "");
        if (ville) ud.ct = ville;
        if (paysMatch) ud.country = String(paysMatch).toLowerCase();
        const cle = JSON.stringify(ud);
        if (cle === dernierMatchFbRef.current) return;
        dernierMatchFbRef.current = cle;
        window.fbq("init", pixel, ud);
      } catch (_) {}
    }, 900);
    return () => clearTimeout(delai);
  }, [form.tel, form.client, form.zone, entreprise?.country, paysClient.effectif, envoye]);

  // ===== PRODUCT PAGE BUILDER (couche additive) =====================================
  // 1) Au chargement de la boutique, on récupère (très léger) la LISTE des produits qui ont une page
  //    personnalisée publiée. 2) Quand un de ces produits est ouvert, on charge sa configuration.
  //    Toute erreur (migration pas encore appliquée, réseau…) = "pas de page perso" : la fiche
  //    produit historique s'affiche comme avant. 3) La configuration est fusionnée dans l'objet
  //    produit (offres => bundles, complément => bump) : le tunnel de commande existant est réutilisé
  //    tel quel, aucune logique de prix / de commande n'est dupliquée.
  const [idsPagesPubliees, setIdsPagesPubliees] = useState(undefined);
  const [pagesProduit, setPagesProduit] = useState({});
  const pagesDemandeesRef = useRef(new Set());
  const suiviPageRef = useRef(null);
  const avisChargesRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return undefined;
    let annule = false;
    supabase.rpc("pages_produit_publiees", { p_workspace_id: workspaceId }).then(
      ({ data, error }) => { if (!annule) setIdsPagesPubliees(!error && Array.isArray(data) ? data : []); },
      () => { if (!annule) setIdsPagesPubliees([]); }
    );
    return () => { annule = true; };
  }, [workspaceId]);

  useEffect(() => {
    const id = produitOuvert?.produit_id;
    if (!id || !workspaceId || !Array.isArray(idsPagesPubliees) || !idsPagesPubliees.includes(id)) return;
    if (pagesDemandeesRef.current.has(id)) return;
    pagesDemandeesRef.current.add(id);
    supabase.rpc("page_produit_publique", { p_workspace_id: workspaceId, p_produit_id: id }).then(
      ({ data, error }) => {
        const valide = !error && data && configPubliqueValide(data.config);
        setPagesProduit((m) => ({ ...m, [id]: valide ? { config: normaliserConfig(data.config), template: data.template } : { absent: true } }));
      },
      () => setPagesProduit((m) => ({ ...m, [id]: { absent: true } }))
    );
  }, [produitOuvert?.produit_id, workspaceId, idsPagesPubliees]);

  const pageConfigActive = produitOuvert ? (pagesProduit[produitOuvert.produit_id]?.config || null) : null;

  useEffect(() => {
    if (!produitOuvert || !pageConfigActive || produitOuvert._pageFusionnee) return;
    const fusion = fusionnerConfigDansProduit(produitOuvert, pageConfigActive);
    setProduitOuvert((po) => (po && po.produit_id === fusion.produit_id && !po._pageFusionnee ? fusion : po));
    const offreDefaut = offreParDefaut(fusion, pageConfigActive);
    if (offreDefaut) { setBundleChoisiId(offreDefaut.id); setQuantite(offreDefaut.qty); }
  }, [produitOuvert, pageConfigActive]);

  useEffect(() => {
    // Suivi de la page (vue, clic, formulaire, offre, commande) : jamais bloquant.
    if (!produitOuvert || !pageConfigActive || !workspaceId) { suiviPageRef.current = null; return; }
    suiviPageRef.current = creerSuiviPage({ supabase, workspaceId, produitId: produitOuvert.produit_id, template: pageConfigActive.template, source: sourceCampagne });
    suiviPageRef.current("vue_page");
    // Ouverture par lien direct (?produit=…, cas des pubs) : les avis n'ont pas encore été chargés.
    if (avisChargesRef.current !== produitOuvert.produit_id) {
      avisChargesRef.current = produitOuvert.produit_id;
      supabase.rpc("avis_produit_public", { p_produit_id: produitOuvert.produit_id }).then(({ data }) => {
        setAvisListe((data || []).filter((a) => a.commentaire && a.commentaire.trim().length > 0));
      });
    }
  }, [produitOuvert?.produit_id, pageConfigActive, workspaceId]);

  const suivrePage = (evenement, infos) => { if (suiviPageRef.current) suiviPageRef.current(evenement, infos); };

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
    // Alerte de vente forte sur le téléphone du commerçant (sans effet si personne n'a activé les alertes).
    try {
      const idNouvelleCommande = resultat.commande_id || resultat.id;
      if (idNouvelleCommande) fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "nouvelle_commande", commandeId: idNouvelleCommande }), keepalive: true }).catch(() => {});
    } catch (_) {}
    setBienEnvoye(true);
  }

  const couleur = entreprise?.couleur || "#1a7a3c";
  // Style des cartes produits choisi par le marchand dans le Store Builder.
  appliquerStyleCarte(entreprise?.storeConfig);
  definirBoutonsPerso(entreprise?.storeConfig);
  const t = creerTraducteur(entreprise?.langue);
  // Ambiance animée choisie dans le Store Builder (aurore, cristal, or, futuriste, étoiles) : elle doit
  // aussi se voir sur la fiche produit, pas seulement sur l'accueil.
  const ambianceProduit = lireAmbiance(entreprise?.storeConfig).ambiance !== "aucune";

  // Enveloppe d'ambiance commune à TOUS les écrans de la boutique (accueil Store Builder,
  // fiche produit, collection…). Avant, seuls 2 écrans étaient enveloppés : l'accueil
  // personnalisé (celui que voient les abonnés) et la fiche produit n'avaient AUCUNE ambiance.
  // Tous les écrans rendent <AmbianceShop> à la même place de l'arbre : React garde donc la
  // même instance d'un écran à l'autre (le décor ne repart pas de zéro quand on navigue).
  const avecAmbiance = (contenu, fond = "#FAFAF7") => (
    <AmbianceShop
      config={entreprise?.storeConfig}
      couleur={couleur}
      identite={identitePrecoce}
      cle={cleIdentite}
      rideau={!!(identitePrecoce && (identitePrecoce.logo || identitePrecoce.nom))}
      fondu={!identitePrecoce}
      style={{ background: fond, minHeight: "100vh", fontFamily: "sans-serif" }}
    >
      {contenu}
    </AmbianceShop>
  );

  if (entreprise === undefined && !erreur) {
    // Boutique déjà visitée : écran aux couleurs de la boutique (même rendu que l'amorce d'index.html).
    if (identitePrecoce && (identitePrecoce.logo || identitePrecoce.nom)) return <EcranAmorce identite={identitePrecoce} />;
    // Si cette boutique a déjà été visitée une fois sur cet appareil, on connaît déjà
    // son logo/nom/couleur (voir identitePrecoce) : autant les afficher tout de suite
    // au lieu d'une barre grise anonyme — la boutique paraît s'ouvrir instantanément.
    return (
      <div style={{ minHeight: "100vh", fontFamily: "sans-serif", background: "#FAFAF7" }}>
        <style>{`@keyframes rvPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } } .rv-skel { animation: rvPulse 1.4s ease-in-out infinite; background: #E5E2D8; border-radius: 8px; }`}</style>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, background: identitePrecoce?.couleur || undefined }}>
          {identitePrecoce?.logo ? (
            <img src={identitePrecoce.logo} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
          ) : (
            <div className="rv-skel" style={{ width: 100, height: 32 }} />
          )}
          {identitePrecoce?.nom ? (
            <span style={{ fontWeight: 700, fontSize: 15, color: identitePrecoce.couleur ? "#fff" : "#16231F" }}>{identitePrecoce.nom}</span>
          ) : (
            <div className="rv-skel" style={{ flex: 1, height: 32, borderRadius: 8 }} />
          )}
          <div className="rv-skel" style={{ width: 60, height: 32, marginLeft: "auto" }} />
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
          <div style={{ marginBottom: 14 }}>
            <BadgePersonnesEnLigne nb={nbPersonnesEnLigne} />
          </div>
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
                  <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 10 }}>{montantAffiche(Number(bienOuvert.prix_jour))} {formaterDevise(entreprise.devise)} / jour{Number(bienOuvert.caution_suggeree) > 0 && ` · Caution : ${montantAffiche(Number(bienOuvert.caution_suggeree))} ${formaterDevise(entreprise.devise)}`}</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Du</div>
                      <input type="date" value={formBien.dateDebut} onChange={(e) => setFormBien({ ...formBien, dateDebut: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Au</div>
                      <input type="date" value={formBien.dateFin} onChange={(e) => setFormBien({ ...formBien, dateFin: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, boxSizing: "border-box" }} />
                    </div>
                  </div>
                  {nbJours > 0 && (
                    <div style={{ background: "#EAF3DE", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: "#3B6D11" }}>
                      {nbJours} jour{nbJours > 1 ? "s" : ""} — Total : {montantAffiche(montantEstime)} {formaterDevise(entreprise.devise)}
                    </div>
                  )}
                </>
              )}
              {modeChoisi === "commander" && (
                <div style={{ background: "#EAF0FB", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: "#1E4B8C", lineHeight: 1.5 }}>
                  📦 Prix : <strong>{montantAffiche(montantEstime)} {formaterDevise(entreprise.devise)}</strong><br />
                  Délai estimé : <strong>{bienOuvert.delai_commande_estime || "à confirmer avec toi"}</strong>
                </div>
              )}
              {modeChoisi === "payer_maintenant" && (
                <div style={{ background: "#FBF3E3", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: "#8A6412" }}>
                  💵 Prix : <strong>{montantAffiche(montantEstime)} {formaterDevise(entreprise.devise)}</strong> — déjà disponible, livraison rapide.
                </div>
              )}

              <input placeholder="Ton nom complet" value={formBien.client} onChange={(e) => setFormBien({ ...formBien, client: e.target.value })} autoComplete="name" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 8, boxSizing: "border-box" }} />
              <input placeholder="Ton numéro de téléphone" value={formBien.tel} onChange={(e) => setFormBien({ ...formBien, tel: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 8, boxSizing: "border-box" }} />
              <input placeholder="Ta ville / commune (optionnel)" value={formBien.zone} onChange={(e) => setFormBien({ ...formBien, zone: e.target.value })} autoComplete="address-level2" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 12, boxSizing: "border-box" }} />

              {erreurEnvoiBien && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 10, fontWeight: 600 }}>{erreurEnvoiBien}</div>}

              <button
                onClick={envoyerCommandeBien}
                disabled={envoiBienEnCours}
                style={{ width: "100%", ...styleBouton(couleur), border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", touchAction: "manipulation" }}
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
    const livraisonGratuite = !!produitOuvert.livraison_gratuite || (produitOuvert.livraison_gratuite_qte_min && quantite >= Number(produitOuvert.livraison_gratuite_qte_min));
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
    // Montants arrondis « propres » (boutique multi-monnaies) puis additionnés : prix + livraison = total affiché, et
    // c'est ce total exact qui est noté « À encaisser ». Sans conversion, ces fonctions ne changent rien.
    const bumpBase = (produitBumpId ? (produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(produits.find((p) => p.produit_id === produitBumpId)?.prix_vente || 0)) : 0);
    const totalAffiche = Math.max(0, arrondiLocalBase(prixUnitaireEffectif) * quantite + arrondiLocalBase(fraisLivraisonActuel) + arrondiLocalBase(bumpBase) - arrondiLocalBase(codePromoApplique?.montant_remise || 0));
    totalCommandeRef.current = totalAffiche;

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
                  <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>{montantAffiche((arrondiLocalBase(prixUnitaireEffectif) * quantite + arrondiLocalBase(fraisLivraisonActuel)))} {formaterDevise(entreprise.devise)}</div>
                  {(fraisLivraisonEffectif > 0 || fraisExpeditionEffectif > 0) && (
                    <div style={{ fontSize: 11, color: "#8A9089" }}>
                      dont {montantAffiche(fraisLivraisonActuel)} {formaterDevise(entreprise.devise)} de {typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "#6B7168", lineHeight: 1.7 }}>
                <div><strong style={{ color: "#16231F" }}>{t("livraisonA")}</strong> {form.zone}</div>
                <div><strong style={{ color: "#16231F" }}>{t("telephone")}</strong> {form.tel}</div>
              </div>
            </div>

            <BoutonPayerEnLigne commandeId={idCommandeEnvoyee} couleur={couleur} devise={formaterDevise(entreprise.devise)} />

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
                href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}?text=${encodeURIComponent(`Bonjour, j'ai une question sur ma commande de "${produitOuvert.produit_nom}".`)}`}
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

    const structureDescription = extraireStructureDescription(produitOuvert.produit_description);
    const lancerCommande = () => {
      trackEvenement("InitiateCheckout", {
        content_ids: [produitOuvert.produit_id],
        contents: [{ id: produitOuvert.produit_id, quantity: quantite, item_price: Number(prixUnitaireEffectif) || 0 }],
        content_type: "product",
        content_name: produitOuvert.produit_nom,
        value: prixUnitaireEffectif * quantite,
        currency: entreprise?.devise || "XOF",
        num_items: quantite,
      });
      setAfficherFormulaire(true);
      momentOuvertureFormulaireRef.current = Date.now();
    };

    // --- Product Page Builder : la fiche est-elle une page personnalisée publiée ? ---
    const pageConfig = pagesProduit[produitOuvert.produit_id]?.config || null;
    const pageActive = !!pageConfig;
    const pageEnChargement = !pageConfig && Array.isArray(idsPagesPubliees) && idsPagesPubliees.includes(produitOuvert.produit_id) && !pagesProduit[produitOuvert.produit_id];

    // Contenu du formulaire de commande : UN SEUL code pour la fenêtre historique (enLigne = false)
    // et pour le bloc « Formulaire COD » d'une page personnalisée (enLigne = true). Mêmes champs,
    // mêmes validations, même envoi (envoyerCommande) : le Builder ne recrée aucun système de commande.
    const pageBlocsActifs = pageConfig ? blocsActifs(pageConfig) : [];
    const pageAOffres = pageBlocsActifs.some((b) => b.type === "offres" || ((b.type === "hero" || b.type === "info_produit") && b.props.afficher_offres !== false));
    const pageAOptions = pageBlocsActifs.some((b) => b.type === "hero" || b.type === "info_produit");
    const rendreFormulaireCommande = (enLigne = false) => (
      <>
              {!enLigne && (<>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{t("tesCoordonnees")}</div>
                <button onClick={() => setAfficherFormulaire(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
                {t("pourTeContacter")}
              </div>
              </>)}

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
                autoFocus={!enLigne}
                autoComplete="name"
                style={inputStyle}
              />
              <SelecteurPays pays={paysClient} langue={entreprise.langue} style={inputStyle} />
              <input
                placeholder={t("tonTelephone")}
                value={form.tel}
                onChange={(e) => { setForm({ ...form, tel: e.target.value }); paysClient.detecter(e.target.value); }}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                style={inputStyle}
              />
              <input
                placeholder={t("taVille")}
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                autoComplete="address-level2"
                style={inputStyle}
              />
              {pageConfig?.formulaire?.commune && (
                <input
                  placeholder="Commune / quartier (optionnel)"
                  value={form.commune || ""}
                  onChange={(e) => setForm({ ...form, commune: e.target.value })}
                  autoComplete="address-level3"
                  style={inputStyle}
                />
              )}
              {pageConfig?.formulaire?.instructions && (
                <textarea
                  placeholder="Instructions de livraison : repère, étage, point de rencontre… (optionnel)"
                  value={form.instructions || ""}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              )}

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

              {produitOuvert.livraison_gratuite_qte_min && !produitOuvert.livraison_gratuite && (
                Number(quantite) >= Number(produitOuvert.livraison_gratuite_qte_min) ? (
                  <div style={{ background: "#EAF3DE", border: "1px solid #C8E0B0", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: "#3B6D11", fontWeight: 700 }}>
                    🎁 Livraison gratuite débloquée pour cette commande !
                  </div>
                ) : (
                  <div style={{ background: "#FBF3E3", border: "1px solid #F0DBA8", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: "#8A6412", fontWeight: 700 }}>
                    🎁 Encore {Number(produitOuvert.livraison_gratuite_qte_min) - Number(quantite)} exemplaire{Number(produitOuvert.livraison_gratuite_qte_min) - Number(quantite) > 1 ? "s" : ""} pour la livraison gratuite !
                  </div>
                )
              )}

              {optionsProduitListe.length > 0 && !(enLigne && pageAOptions) && (
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

              {optionsProduitListe.length === 0 && bundlesProduit.length > 0 && !(enLigne && pageAOffres) && (
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
                          <div style={{ fontSize: 12, fontWeight: 800, color: couleur, marginTop: 2 }}>{montantAffiche(totalBundle)} {formaterDevise(entreprise.devise)}</div>
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
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {montantAffiche(fraisLivraisonEffectif)} {formaterDevise(entreprise.devise)}</div>
                    </button>
                    <button
                      onClick={() => setTypeLivraisonChoisi("expedition")}
                      style={{ flex: 1, textAlign: "left", background: typeLivraisonChoisi === "expedition" ? "#EAF3DE" : "white", border: `1.5px solid ${typeLivraisonChoisi === "expedition" ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>🚛 {entreprise.labelLivraisonExpedition}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {montantAffiche(fraisExpeditionEffectif)} {formaterDevise(entreprise.devise)}</div>
                    </button>
                  </div>
                  {!typeLivraisonChoisi && <div style={{ fontSize: 11, color: "#8A6412", marginTop: 6 }}>{t("choisisMode")}</div>}
                  {typeLivraisonChoisi === "expedition" && entreprise.depotRequis && (
                    <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "9px 12px", marginTop: 8, fontSize: 11.5, color: "#8A6412", lineHeight: 1.5 }}>
                      💰 {entreprise.depotMessage ? entreprise.depotMessage.replace(/\{montant\}/g, `${montantAffiche((arrondiLocalBase(prixUnitaireEffectif) * quantite + arrondiLocalBase(fraisExpeditionEffectif)))} ${formaterDevise(entreprise.devise)}`) : `Un dépôt de ${montantAffiche((arrondiLocalBase(prixUnitaireEffectif) * quantite + arrondiLocalBase(fraisExpeditionEffectif)))} ${formaterDevise(entreprise.devise)} (le montant exact de ta commande) par Mobile Money est exigé avant l'expédition. Notre équipe te contactera pour l'organiser.`}
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
                          <span style={{ textDecoration: "line-through", color: "#8A9089", fontWeight: 500, marginRight: 5 }}>{montantAffiche(Number(bumpProduit.prix_vente))}</span>
                        )}
                        +{montantAffiche(bumpPrix)} {formaterDevise(entreprise.devise)}
                      </span>
                    </button>
                  </div>
                );
              })()}

              <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7168" }}>{quantite} × {produitOuvert.produit_nom}</span>
                  <span>{montantAffiche((prixUnitaireEffectif * quantite))} {formaterDevise(entreprise.devise)}</span>
                </div>
                {produitBumpId && (() => {
                  const bump = produits.find((p) => p.produit_id === produitBumpId);
                  if (!bump) return null;
                  const prixBumpAffiche = produitOuvert.bump_prix_special != null ? Number(produitOuvert.bump_prix_special) : Number(bump.prix_vente);
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#6B7168" }}>+ {bump.produit_nom}</span>
                      <span>{montantAffiche(prixBumpAffiche)} {formaterDevise(entreprise.devise)}</span>
                    </div>
                  );
                })()}
                {fraisLivraisonActuel > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7168" }}>
                    <span>🚚 {aChoixLivraison && typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}</span>
                    <span>+ {montantAffiche(fraisLivraisonActuel)} {formaterDevise(entreprise.devise)}</span>
                  </div>
                )}
                {codePromoApplique && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1F9D6E", fontWeight: 700 }}>
                    <span>🏷️ Code {codePromoApplique.code}</span>
                    <span>− {montantAffiche(codePromoApplique.montant_remise)} {formaterDevise(entreprise.devise)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid #ECE8DC", marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 700, color: couleur }}>{montantAffiche(totalAffiche)} {formaterDevise(entreprise.devise)}</span>
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
                      style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 16, boxSizing: "border-box", textTransform: "uppercase" }}
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
                style={{ width: "100%", ...styleBouton(couleur), border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: envoi ? "default" : "pointer", opacity: (envoi || !engagementCoche || (optionsProduitListe.length > 0 && (!toutesOptionsChoisies || !varianteActive || varianteEnRupture))) ? 0.5 : 1, marginTop: 4, touchAction: "manipulation" }}
              >
                {envoi ? t("envoiEnCours") : `${t("confirmer")} — ${montantAffiche(totalAffiche)} ${formaterDevise(entreprise.devise)}`}
              </button>
      </>
    );

    return avecAmbiance(
      <div style={{ minHeight: "100vh", background: ambianceProduit ? "transparent" : "white", fontFamily: "sans-serif" }}>
        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={fermerProduit} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); fermerProduit(); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} onOuvrirPagePerso={setPagePersoOuverte} />

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

        {pageEnChargement ? (
          <PageProduitSquelette />
        ) : pageActive ? (
          <>
            <div style={{ maxWidth: 1120, margin: "0 auto", padding: "10px 16px 0" }}>
              <button type="button" onClick={fermerProduit} style={{ background: "none", border: "none", color: "#6B7168", fontSize: 13, cursor: "pointer", padding: "6px 0" }}>{t("retourAccueil")}</button>
            </div>
            <PageProduitPublique
              ambiance={ambianceProduit}
              config={pageConfig}
              produit={produitOuvert}
              produits={produits}
              collectionsManuelles={collectionsManuelles}
              entreprise={entreprise}
              couleur={couleur}
              devise={formaterDevise(entreprise.devise)}
              deviseCode={entreprise.devise || "XOF"}
              avis={avisListe}
              pointsForts={structureDescription.points}
              descriptionTexte={String(produitOuvert.produit_description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}
              t={t}
              etat={{
                quantite, bundleChoisiId, optionsChoisies, produitBumpId, varianteActive,
                varianteEnRupture: !!varianteEnRupture, toutesOptionsChoisies,
                prixBase: varianteActive ? (varianteActive.prix != null ? Number(varianteActive.prix) : Number(produitOuvert.prix_vente)) : Number(produitOuvert.prix_vente),
                prixUnitaireEffectif,
              }}
              livraison={{
                gratuite: !!livraisonGratuite, frais: fraisLivraisonEffectif, fraisExpedition: fraisExpeditionEffectif, aChoix: aChoixLivraison,
                labelLocal: entreprise.labelLivraisonLocale, labelExpedition: entreprise.labelLivraisonExpedition,
                qteMinGratuite: produitOuvert.livraison_gratuite_qte_min || null,
              }}
              actions={{
                onChoisirOffre: (o) => { setBundleChoisiId(o ? o.id : null); setQuantite(o ? o.qty : 1); },
                onChoisirOption: (nom, val) => setOptionsChoisies((c) => ({ ...c, [nom]: val })),
                onToggleBump: (id) => setProduitBumpId((cur) => (cur === id ? null : id)),
                onOuvrirProduit: ouvrirProduit,
                onCommander: () => lancerCommande(),
                onAjouterPanier: () => ajouterAuPanier(produitOuvert, quantite),
                onCtaInline: () => {
                  trackEvenement("InitiateCheckout", {
                    content_ids: [produitOuvert.produit_id],
                    contents: [{ id: produitOuvert.produit_id, quantity: quantite, item_price: Number(prixUnitaireEffectif) || 0 }],
                    content_type: "product",
                    content_name: produitOuvert.produit_nom,
                    value: prixUnitaireEffectif * quantite,
                    currency: entreprise?.devise || "XOF",
                    num_items: quantite,
                  });
                  momentOuvertureFormulaireRef.current = Date.now();
                },
              }}
              rendreFormulaire={() => rendreFormulaireCommande(true)}
              onEvenement={suivrePage}
            />
          </>
        ) : (
        <div className="rv-shop-produit-wrap">
          <div className="rv-shop-produit-photo-col" style={{ position: "relative", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <GaleriePhotosProduit
              photos={[produitOuvert.photo_url, ...(produitOuvert.photos_galerie || [])].filter(Boolean)}
              alt={produitOuvert.produit_nom}
              couleur={couleur}
              index={photoActive}
              setIndex={setPhotoActive}
              t={t}
            />
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
            {produitOuvert.note_moyenne > 0 && produitOuvert.nb_avis > 0 && (
              <button
                onClick={() => document.getElementById("rv-shop-avis-section")?.scrollIntoView({ behavior: "smooth" })}
                style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, background: "none", border: "none", padding: 0, marginBottom: 8, cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ color: "#e8920a", fontSize: 15, letterSpacing: 1 }}>{"★".repeat(Math.round(produitOuvert.note_moyenne))}{"☆".repeat(5 - Math.round(produitOuvert.note_moyenne))}</span>
                <span style={{ fontSize: 12.5, color: "#6B7168" }}>
                  {produitOuvert.note_moyenne >= 4.5 ? t("noteExcellent") : produitOuvert.note_moyenne >= 4 ? t("noteTresBien") : t("noteBien")} | {produitOuvert.note_moyenne}/5 ({produitOuvert.nb_avis} {t("noteAvisClients")})
                </span>
              </button>
            )}

            <h1 style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.15, margin: "0 0 4px", color: "#16231F", overflowWrap: "anywhere" }}>{produitOuvert.produit_nom}</h1>

            <PointsFortsListe points={structureDescription.points} couleur={couleur} />

            {(() => {
              const prixVenteNum = Number(produitOuvert.prix_vente);
              const prixBarreNum = Number(produitOuvert.prix_barre);
              const aPrixBarre = Number.isFinite(prixBarreNum) && prixBarreNum > prixVenteNum && prixVenteNum > 0;
              const economie = aPrixBarre ? Math.round((1 - prixVenteNum / prixBarreNum) * 100) : 0;
              return (
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 26, color: couleur }}>
                    {montantAffiche(prixVenteNum)} {formaterDevise(entreprise.devise)}
                  </span>
                  {aPrixBarre && (
                    <span style={{ textDecoration: "line-through", color: "#8A9089", fontSize: 15 }}>
                      {montantAffiche(prixBarreNum)} {formaterDevise(entreprise.devise)}
                    </span>
                  )}
                  {aPrixBarre && economie > 0 && (
                    <span style={{ background: "#EAF3DE", color: "#3B6D11", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, textTransform: "uppercase" }}>
                      {t("economisez")} {economie}%
                    </span>
                  )}
                </div>
              );
            })()}

            <div style={{ marginBottom: 12 }}>
              <BadgePersonnesEnLigne nb={nbPersonnesEnLigne} />
            </div>

            {livraisonGratuite ? (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#1F9D6E", background: "#EAF7F1", padding: "4px 10px", borderRadius: 999, marginBottom: 12 }}>
                {t("livraisonGratuite")}
              </div>
            ) : aChoixLivraison ? (
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                {t("fraisAChoisir")} ({entreprise.labelLivraisonLocale} : {montantAffiche(fraisLivraisonEffectif)} {formaterDevise(entreprise.devise)} — {entreprise.labelLivraisonExpedition} : {montantAffiche(fraisExpeditionEffectif)} {formaterDevise(entreprise.devise)})
              </div>
            ) : (
              fraisLivraisonEffectif > 0 && (
                <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                  🚚 + {montantAffiche(fraisLivraisonEffectif)} {formaterDevise(entreprise.devise)} {t("deFraisLivraison")}
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

            {!envoye && (
              <div style={{ marginBottom: 22 }}>
                <button
                  id="rv-cta-en-ligne"
                  type="button"
                  onClick={lancerCommande}
                  style={{ width: "100%", ...styleBouton(couleur, couleurTextePourFond(couleur)), border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", touchAction: "manipulation", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, boxShadow: "0 6px 18px rgba(0,0,0,0.16)" }}
                >
                  <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{t("ctaEnLigneTitre")}</span>
                  <span style={{ fontWeight: 500, fontSize: 12.5, opacity: 0.92 }}>💵 {t("ctaEnLigneSous")}</span>
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 }}>
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
              </div>
            )}

            {produitOuvert.produit_description ? (
              <>
                <BoutonEcouterDescription
                  descriptionHTML={produitOuvert.produit_description}
                  couleur={couleur}
                  langue={entreprise.langue}
                  t={t}
                />
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
                {descriptionAUnContenu(structureDescription.reste) ? (
                  <AccordeonDescription titre={t("descriptionTitre")}>
                    <div
                      className="rv-description-riche"
                      style={{ fontSize: 14.5, color: "#16231F", lineHeight: 1.65 }}
                      dangerouslySetInnerHTML={{ __html: structureDescription.reste }}
                    />
                  </AccordeonDescription>
                ) : (
                  <div style={{ marginBottom: 12 }} />
                )}
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
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }}
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
              const idsDeCollection = collectionChoisie ? (collectionChoisie.produitIds || []) : [];
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
                            <img src={p.photo_url} alt={p.produit_nom} loading="lazy" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</div>
                          )}
                        </div>
                        <div style={{ padding: "8px 10px 10px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 2 }}>{montantAffiche(Number(p.prix_vente))} {formaterDevise(entreprise.devise)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {!envoye && (
              <BarreCtaCollante>
                <div className="rv-shop-cta-bar-inner">
                  <div style={{ fontSize: 10.5, color: "#8A9089", textAlign: "center", marginBottom: 6 }}>
                    {t("merciCommander")}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => ajouterAuPanier(produitOuvert, quantite)}
                      style={{ flexShrink: 0, background: "white", border: `1.5px solid ${couleur}`, color: couleur, borderRadius: 12, padding: "0 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", touchAction: "manipulation" }}
                    >
                      🛒
                    </button>
                    <button
                      onClick={lancerCommande}
                      style={{ flex: 1, ...styleBouton(couleur), border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", touchAction: "manipulation" }}
                    >
                      {`${t("commander")} — ${montantAffiche((prixUnitaireEffectif * quantite))} ${formaterDevise(entreprise.devise)}`}
                    </button>
                  </div>
                </div>
              </BarreCtaCollante>
            )}
          </div>
        </div>
        )}

        {afficherFormulaire && !envoye && (
          <div
            onClick={() => setAfficherFormulaire(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 24px", maxHeight: "80vh", overflowY: "auto" }}
            >
              {rendreFormulaireCommande(false)}
            </div>
          </div>
        )}
        <BulleWhatsApp whatsapp={entreprise.whatsapp} codePays={entreprise.country} messageDefaut={`Bonjour, j'ai une question sur "${produitOuvert.produit_nom}".`} surCtaBar={!envoye && (!pageActive || pageConfig?.sticky?.mobile !== false)} />
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
            onTrack={trackEvenement}
            onCapi={envoyerEvenementCapi}
          />
        )}
        {pagePersoOuverte && (
          <div onClick={() => setPagePersoOuverte(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{pagePersoOuverte.titre}</div>
                <button onClick={() => setPagePersoOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
              </div>
              <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: pagePersoOuverte.contenu || "" }} />
            </div>
          </div>
        )}
      </div>,
      ambianceProduit ? "#FAFAF7" : "white"
    );
  }

  // ===== ÉCRAN COLLECTION COMPLÈTE =====
  if (collectionOuverte) {
    const collectionManuelleActive = collectionOuverte.startsWith("manuelle-")
      ? collectionsManuelles.find((c) => c.id === collectionOuverte.replace("manuelle-", ""))
      : null;
    const listeCollection = collectionManuelleActive
      ? produits.filter((p) => (collectionManuelleActive.produitIds || []).includes(p.produit_id))
      : collectionOuverte === "bestseller"
        ? [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes)
        : collectionOuverte === "nouveautes"
          ? produits.filter((p) => p.est_nouveau)
          : produits;
    const listeTriee = triCollection === "prix_asc" ? [...listeCollection].sort((a, b) => Number(a.prix_vente) - Number(b.prix_vente))
      : triCollection === "prix_desc" ? [...listeCollection].sort((a, b) => Number(b.prix_vente) - Number(a.prix_vente))
      : triCollection === "nouveautes" ? [...listeCollection].sort((a, b) => (b.est_nouveau ? 1 : 0) - (a.est_nouveau ? 1 : 0))
      : listeCollection;
    const imageBandeau = collectionManuelleActive ? imageCollection(collectionManuelleActive, entreprise.storeConfig) : "";
    const titreCollection = collectionManuelleActive
      ? collectionManuelleActive.nom
      : collectionOuverte === "bestseller" ? t("meilleuresVentes") : collectionOuverte === "nouveautes" ? t("nouveautes") : t("tousLesProduits");

    return (
      <AmbianceShop config={entreprise.storeConfig} couleur={couleur} cle={cleIdentite} style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <style>{`
          .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }

          @media (max-width: 680px) { .rv-shop-header-whatsapp-txt { display: none; } }
          .rv-coll-entete{border-radius:16px;background-size:cover;background-position:center 35%;padding:8px 0 4px;margin-bottom:6px}
          .rv-coll-entete[style*="background-image"]{padding:38px 18px;min-height:110px;display:flex;flex-direction:column;justify-content:flex-end;margin-bottom:12px}
          .rv-coll-titre{margin:0;font-size:clamp(22px,5vw,32px);font-weight:900;letter-spacing:-.02em;color:#14221b;line-height:1.15}
          .rv-coll-desc{margin:6px 0 0;font-size:13.5px;color:#68756d;line-height:1.55;max-width:640px}
          .rv-coll-barre{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 14px;padding-bottom:10px;border-bottom:1px solid #ECE8DC}
          .rv-coll-compte{font-size:13px;color:#68756d;font-weight:600}
          .rv-coll-tri{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#68756d}
          .rv-coll-tri select{min-height:40px;border:1px solid #DDD8CC;border-radius:10px;background:#fff;padding:0 10px;font-size:13px;color:#16231F;font-family:inherit}
          .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          @media (min-width: 640px) { .rv-shop-content { max-width: 720px; padding: 0 24px; } .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
          @media (min-width: 960px) { .rv-shop-content { max-width: 1100px; padding: 0 32px; } .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; } }
          @media (min-width: 1280px) { .rv-shop-content, .rv-shop-header-inner { max-width: 1400px; } .rv-shop-grid { grid-template-columns: repeat(5, 1fr); } }
        `}</style>

        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={() => naviguerVersCollection(null)} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={collectionOuverte} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); naviguerVersCollection(null); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} onOuvrirPagePerso={setPagePersoOuverte} />

        <div className="rv-shop-content" style={{ paddingTop: 20 }}>
          <button
            onClick={() => setCollectionOuverte(null)}
            style={{ background: "none", border: "none", color: "#6B7168", fontSize: 13.5, cursor: "pointer", marginBottom: 6, padding: "10px 0", minHeight: 44 }}
          >
            {t("retourAccueil")}
          </button>
          <div className="rv-coll-entete" style={imageBandeau ? { backgroundImage: `linear-gradient(180deg,rgba(6,14,10,.25),rgba(6,14,10,.75)),url(${imageBandeau})` } : undefined}>
            <h1 className="rv-coll-titre" style={imageBandeau ? { color: "#fff" } : undefined}>{titreCollection}</h1>
            {collectionManuelleActive?.description ? <p className="rv-coll-desc" style={imageBandeau ? { color: "rgba(255,255,255,.9)" } : undefined}>{collectionManuelleActive.description}</p> : null}
          </div>
          <div className="rv-coll-barre">
            <span className="rv-coll-compte">{listeCollection.length} article{listeCollection.length > 1 ? "s" : ""}</span>
            {listeCollection.length > 1 && (
              <label className="rv-coll-tri">
                <span>Trier :</span>
                <select value={triCollection} onChange={(e) => setTriCollection(e.target.value)} aria-label="Trier les produits">
                  <option value="defaut">Recommandés</option>
                  <option value="nouveautes">Nouveautés d'abord</option>
                  <option value="prix_asc">Prix croissant</option>
                  <option value="prix_desc">Prix décroissant</option>
                </select>
              </label>
            )}
          </div>
          {listeCollection.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, padding: "30px 0 50px" }}>Aucun produit dans cette collection pour le moment.</div>}

          <GrilleMobile className="rv-shop-grid" style={{ paddingBottom: 40 }} couleur={couleur} langue={entreprise.langue}>
            {listeTriee.map((p, i) => (
              <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
                <CarteProduit p={p} couleur={couleur} devise={formaterDevise(entreprise.devise)} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={ajouterAuPanier} estAzali={entreprise.slug === "azaliexpress"} />
              </RevealOnScroll>
            ))}
          </GrilleMobile>
        </div>

        <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} onOuvrirPagePerso={setPagePersoOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} footerConfig={creerFooterConfig(entreprise.storeConfig)} />
        <BulleWhatsApp whatsapp={entreprise.whatsapp} codePays={entreprise.country} messageDefaut={`Bonjour, j'ai une question sur "${titreCollection}".`} />
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
            onTrack={trackEvenement}
            onCapi={envoyerEvenementCapi}
          />
        )}
      </AmbianceShop>
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
    return avecAmbiance(
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
          setPagePersoOuverte={setPagePersoOuverte}
          pagePersoOuverte={pagePersoOuverte}
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
            onTrack={trackEvenement}
            onCapi={envoyerEvenementCapi}
          />
        )}
      </>,
      "#fff"
    );
  }

  return (
    <AmbianceShop config={entreprise.storeConfig} couleur={couleur} identite={identitePrecoce} cle={cleIdentite} rideau={!!(identitePrecoce && (identitePrecoce.logo || identitePrecoce.nom))} fondu={!identitePrecoce} style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <style>{`
        .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }

        @media (max-width: 680px) { .rv-shop-header-whatsapp-txt { display: none; } }
        .rv-shop-banner { height: 150px; }
        /* Couverture sur téléphone : la photo est montrée ENTIÈRE (hauteur naturelle, plus de bandes
           rognées à gauche/droite ni de logo qui masque le bas). Le logo et le nom passent juste en
           dessous, sur la couleur de la marque. Une photo très haute est plafonnée pour rester
           raisonnable. Ordinateur/tablette : rendu inchangé. */
        @media (max-width: 639px) {
          .rv-shop-banner { height: auto !important; overflow: visible !important; background: var(--rv-ban-bg, #1a7a3c); }
          .rv-shop-banner picture { display: block; }
          .rv-shop-banner-img { position: static !important; height: auto !important; max-height: 460px; object-fit: cover; object-position: center top; }
          .rv-shop-banner-fond, .rv-shop-banner-voile { display: none !important; }
          .rv-shop-hero-content { position: relative !important; padding: 12px 16px 14px !important; }
          .rv-shop-banner-avec-photo .rv-shop-hero-logo { margin-top: -34px; position: relative; z-index: 1; width: 68px !important; height: 68px !important; }
          .rv-shop-hero-nom { color: var(--rv-ban-txt, #fff) !important; text-shadow: none !important; }
          .rv-shop-hero-desc { color: var(--rv-ban-txt, #fff) !important; opacity: .9; text-shadow: none !important; }
        }
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

      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={() => setPanierOuvert(true)} headerConfig={{ liens: entreprise.storeConfig?.headerLinks, bgColor: entreprise.storeConfig?.headerBgColor, textColor: entreprise.storeConfig?.headerTextColor, barreTop: entreprise.storeConfig?.headerBarreTop, showSearch: entreprise.storeConfig?.headerShowSearch, showPanier: entreprise.storeConfig?.headerShowPanier }} biensLocation={biensLocation} onOuvrirCategorieBien={(cat) => { setFiltreCategorieBien(cat); setTimeout(() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" }), 100); }} onOuvrirPagePerso={setPagePersoOuverte} />

      {entreprise.slug === "luxury-car" ? (
        <HeroLuxuryCar entreprise={entreprise} biensLocation={biensLocation} onOuvrirVehicule={(b) => setBienOuvert(b)} />
      ) : (
      <div className={`rv-shop-banner${entreprise.banniere ? " rv-shop-banner-avec-photo" : ""}`} style={{ width: "100%", position: "relative", overflow: "hidden", "--rv-ban-bg": couleurCssSure(couleur, "#1a7a3c"), "--rv-ban-txt": texteSurFond(couleurCssSure(couleur, "#1a7a3c")) }}>
        {entreprise.banniere ? (
          <picture>
            {!entreprise.storeConfig?.bannerMobile ? null : <source media="(max-width: 639px)" srcSet={entreprise.storeConfig.bannerMobile} />}
            <img className="rv-shop-banner-img" src={entreprise.banniere} alt="" fetchpriority="high" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
          </picture>
        ) : (
          <div className="rv-shop-banner-fond" style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }} />
        )}
        <div className="rv-shop-banner-voile" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.05) 100%)" }} />
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
        <div id="rv-vehicules" style={{ background: "#0a0a0a", padding: "44px 20px", fontFamily: "'Inter', sans-serif" }}>
          <style>{`
            .rv-lux-carte:hover { transform: translateY(-6px); box-shadow: 0 18px 34px rgba(212,175,55,0.14); border-color: rgba(212,175,55,0.5) !important; }
            .rv-lux-carte:hover .rv-lux-carte-img { transform: scale(1.07); }
          `}</style>
          <div style={{ maxWidth: 1300, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
              <div className="rv-lux-titre" style={{ fontSize: 24, fontWeight: 700, color: "white" }}>
                {filtreCategorieBien ? filtreCategorieBien : "Notre catalogue"}
              </div>
              {filtreCategorieBien && (
                <button onClick={() => setFiltreCategorieBien(null)} style={{ background: "none", border: "1px solid rgba(212,175,55,0.4)", color: "#D4AF37", borderRadius: 6, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  ✕ Voir tout
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
              {biensLocation.filter((b) => !filtreCategorieBien || b.categorie === filtreCategorieBien).map((b, i) => (
                <RevealOnScroll key={b.id} delai={(i % 8) * 60}>
                  <CarteVehiculeLuxury b={b} devise={formaterDevise(entreprise.devise)} onOuvrir={(bien) => setBienOuvert(bien)} />
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </div>
      )}

      {entreprise.slug === "luxury-car" && <SectionsLuxuryCar entreprise={entreprise} biensLocation={biensLocation} onOuvrirCategorie={(cat) => setFiltreCategorieBien(cat)} />}

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
            devise={formaterDevise(entreprise.devise)}
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
            devise={formaterDevise(entreprise.devise)}
            langue={entreprise.langue}
            onOpen={ouvrirProduit}
            onAjouterAuPanier={ajouterAuPanier}
            estAzali={entreprise.slug === "azaliexpress"}
            voirTout={nouveautesToutes.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte("nouveautes") : null}
            libelleVoirTout={t("voirTout")}
          />
        )}

        {!recherche.trim() && collectionsManuelles.map((col) => {
          const produitsDeLaCollection = produits.filter((p) => (col.produitIds || []).includes(p.produit_id));
          if (produitsDeLaCollection.length === 0) return null;
          return (
            <SectionCollection
              key={col.id}
              titre={`📁 ${col.nom}`}
              produits={produitsDeLaCollection.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION)}
              couleur={couleur}
              devise={formaterDevise(entreprise.devise)}
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

        <GrilleMobile className="rv-shop-grid" style={{ paddingBottom: 20 }} couleur={couleur} langue={entreprise.langue} toutAfficher={!!recherche.trim()}>
          {(recherche.trim() ? produitsFiltres : produitsFiltres.slice(0, NOMBRE_MAX_ACCUEIL)).map((p, i) => (
            <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
              <CarteProduit p={p} couleur={couleur} devise={formaterDevise(entreprise.devise)} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={ajouterAuPanier} estAzali={entreprise.slug === "azaliexpress"} />
            </RevealOnScroll>
          ))}
        </GrilleMobile>

        {!recherche.trim() && produitsFiltres.length > NOMBRE_MAX_ACCUEIL && (
          <button
            onClick={() => setCollectionOuverte("tous")}
            style={{ display: "block", width: "100%", background: "white", border: `1px solid ${couleur}`, color: couleur, borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 20 }}
          >
            {t("voirTousLesProduits")} ({produitsFiltres.length}) →
          </button>
        )}
      </div>

      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} onOuvrirPagePerso={setPagePersoOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} biensLocation={biensLocation} footerConfig={creerFooterConfig(entreprise.storeConfig)} />

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
      {pagePersoOuverte && (
        <div
          onClick={() => setPagePersoOuverte(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{pagePersoOuverte.titre}</div>
              <button onClick={() => setPagePersoOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: pagePersoOuverte.contenu || "" }} />
          </div>
        </div>
      )}
      <BulleWhatsApp whatsapp={entreprise.whatsapp} codePays={entreprise.country} />
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
          onTrack={trackEvenement}
          onCapi={envoyerEvenementCapi}
        />
      )}
    </AmbianceShop>
  );
}

function PanierDrawer({ panier, entreprise, couleur, workspaceId, onFermer, onModifierQuantite, onRetirer, onViderPanier, onTrack, onCapi }) {
  // Le suivi Facebook (Pixel + serveur) vit dans le composant parent : on le reçoit en propriété.
  // (Avant, il était appelé ici sans être défini → erreur JS juste après l'envoi de la commande du
  // panier : le panier n'était pas vidé et la confirmation « Commande envoyée » ne s'affichait pas.)
  const trackEvenement = (...args) => { try { if (onTrack) onTrack(...args); } catch (_) {} };
  const envoyerEvenementCapi = (...args) => { try { if (onCapi) onCapi(...args); } catch (_) {} };
  const [etape, setEtape] = useState("liste"); // liste | form | envoye
  const [idCommandePayer, setIdCommandePayer] = useState(null);
  const [form, setForm] = useState({ client: "", tel: "", zone: "", champPiege: "" });
  const paysClient = usePaysClient(entreprise);
  const momentOuvertureRef = useRef(Date.now());
  const [typeLivraisonChoisi, setTypeLivraisonChoisi] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const total = panier.reduce((s, it) => s + arrondiLocalBase(Number(it.prix_unitaire)) * it.quantite, 0); // prix arrondis « propres » puis additionnés
  const auMoinsUnPayant = panier.some((it) => !it.livraison_gratuite);
  const fraisLivraisonDefaut = Number(entreprise.fraisLivraison || 0);
  const fraisExpeditionDefaut = Number(entreprise.fraisExpedition || 0);
  const aChoixLivraison = auMoinsUnPayant && fraisExpeditionDefaut > 0;
  const fraisLivraisonActuel = !auMoinsUnPayant ? 0 : (aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionDefaut : fraisLivraisonDefaut) : fraisLivraisonDefaut);
  const totalAvecLivraison = total + (typeLivraisonChoisi || !aChoixLivraison ? arrondiLocalBase(fraisLivraisonActuel) : 0);

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
    if (paysClient.multi && !paysClient.effectif) {
      setErreur(creerTraducteur(entreprise.langue)("choisirPaysErreur"));
      return;
    }
    const verifTelPanier = validerTelephone(form.tel, paysClient.effectif);
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
    const referralActifPanier = obtenirReferralPersistant();
    const { data, error } = await supabase.rpc(referralActifPanier ? "creer_commande_multi_publique_v2" : "creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: telephoneEnregistre(form.tel, paysClient.effectif, paysClient.principal),
      p_zone: composerZoneMultiPays(form.zone, paysClient, totalAvecLivraison),
      p_items: items,
      p_type_livraison: aChoixLivraison ? typeLivraisonChoisi : "livraison",
      p_fbp: obtenirAttributionMeta().fbp,
      p_fbc: obtenirAttributionMeta().fbc,
      p_user_agent: navigator.userAgent,
      p_event_source_url: window.location.href,
      ...(referralActifPanier ? { p_referral_code: referralActifPanier } : {}),
    });
    setEnvoi(false);
    if (error || !data?.[0]?.succes) {
      setErreur(data?.[0]?.message || "Une erreur est survenue, réessaie.");
      return;
    }
    const idCommandePanier = data[0].commande_id || data[0].id;
    if (idCommandePanier) {
      const contenusCommande = items.map((it) => ({
        id: it.produit_id,
        quantity: Number(it.quantite) || 1,
        item_price: Number(it.prix_unitaire) || 0,
      }));
      const valeurCommande = Number(data[0].montant ?? data[0].total ?? totalAvecLivraison);
      trackEvenement("Purchase", {
        content_ids: contenusCommande.map((x) => x.id),
        contents: contenusCommande,
        content_type: "product",
        value: valeurCommande,
        currency: entreprise?.devise || "XOF",
        num_items: contenusCommande.reduce((s, x) => s + x.quantity, 0),
      }, { eventID: `commande-${idCommandePanier}` });
      envoyerEvenementCapi(idCommandePanier);
    }
    onViderPanier();
    setIdCommandePayer(idCommandePanier || null);
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
            <BoutonPayerEnLigne commandeId={idCommandePayer} couleur={couleur} devise={formaterDevise(entreprise.devise)} />
            <button onClick={onFermer} style={{ width: "100%", ...styleBouton(couleur), border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
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
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 2 }}>{montantAffiche(Number(it.prix_unitaire))} {formaterDevise(entreprise.devise)}</div>
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
              <span>Total</span><span style={{ color: couleur }}>{montantAffiche(total)} {formaterDevise(entreprise.devise)}</span>
            </div>
            <button onClick={() => setEtape("form")} style={{ width: "100%", ...styleBouton(couleur), border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
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
            <input placeholder="Ton nom complet" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} autoComplete="name" style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 10, boxSizing: "border-box" }} />
            <SelecteurPays pays={paysClient} langue={entreprise.langue} style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
            <input placeholder="Ton numéro de téléphone" value={form.tel} onChange={(e) => { setForm({ ...form, tel: e.target.value }); paysClient.detecter(e.target.value); }} type="tel" inputMode="tel" autoComplete="tel" style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 10, boxSizing: "border-box" }} />
            <input placeholder="Ville / quartier" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} autoComplete="address-level2" style={{ width: "100%", padding: "11px 13px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 16, marginBottom: 14, boxSizing: "border-box" }} />

            {aChoixLivraison && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Choisis ton mode de livraison</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setTypeLivraisonChoisi("livraison")} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${typeLivraisonChoisi === "livraison" ? couleur : "#DDD8CC"}`, background: typeLivraisonChoisi === "livraison" ? "#EAF3DE" : "white", cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>🏍️ {entreprise.labelLivraisonLocale}</div>
                    <div style={{ fontSize: 11, color: "#6B7168" }}>{montantAffiche(fraisLivraisonDefaut)} {formaterDevise(entreprise.devise)}</div>
                  </button>
                  <button onClick={() => setTypeLivraisonChoisi("expedition")} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${typeLivraisonChoisi === "expedition" ? couleur : "#DDD8CC"}`, background: typeLivraisonChoisi === "expedition" ? "#EAF3DE" : "white", cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>🚛 {entreprise.labelLivraisonExpedition}</div>
                    <div style={{ fontSize: 11, color: "#6B7168" }}>{montantAffiche(fraisExpeditionDefaut)} {formaterDevise(entreprise.devise)}</div>
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Articles</span><span>{montantAffiche(total)} {formaterDevise(entreprise.devise)}</span></div>
              {fraisLivraisonActuel > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7168" }}><span>Livraison</span><span>{montantAffiche(fraisLivraisonActuel)} {formaterDevise(entreprise.devise)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, marginTop: 6, paddingTop: 6, borderTop: "1px solid #ECE8DC" }}><span>Total</span><span style={{ color: couleur }}>{montantAffiche(totalAvecLivraison)} {formaterDevise(entreprise.devise)}</span></div>
            </div>

            {erreur && <div style={{ background: "#FBEAE6", color: "#D64933", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12.5 }}>{erreur}</div>}

            <button onClick={envoyerCommandePanier} disabled={envoi} style={{ width: "100%", ...styleBouton(couleur), border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: envoi ? 0.7 : 1 }}>
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

  // Charge la police premium en arrière-plan, sans jamais bloquer l'affichage de la page —
  // le site s'affiche immédiatement avec une police de secours, puis bascule sur la police
  // premium dès qu'elle est prête (aucune attente visible pour le visiteur).
  useEffect(() => {
    if (document.getElementById("rv-lux-font-premium")) return;
    const lien = document.createElement("link");
    lien.id = "rv-lux-font-premium";
    lien.rel = "stylesheet";
    lien.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(lien);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0a0a" }}>
      <style>{`
        .rv-lux-titre { font-family: 'Playfair Display', 'Georgia', serif; }
      `}</style>
      <div style={{ background: "#D4AF37", color: "#0a0a0a", textAlign: "center", padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
        ✨ VÉHICULES DE LUXE · MATÉRIEL LOURD · IMPORT SUR MESURE DEPUIS LA CHINE
      </div>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div onClick={onLogoClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}>
          {entreprise.logo ? (
            <img src={entreprise.logo} alt={entreprise.nom} style={{ height: 42, objectFit: "contain" }} />
          ) : (
            <span className="rv-lux-titre" style={{ fontWeight: 700, fontSize: 21, color: "#D4AF37", letterSpacing: "0.02em" }}>{entreprise.nom}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 160, display: "flex", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 6, overflow: "hidden" }}>
          <span style={{ padding: "10px 0 10px 14px", fontSize: 13, color: "#D4AF37" }}>🔍</span>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un véhicule, une machine..."
            style={{ flex: 1, border: "none", background: "transparent", padding: "10px 12px", fontSize: 16, outline: "none", color: "white", fontFamily: "'Inter', sans-serif" }}
          />
        </div>

        {entreprise.whatsapp && (
          <a
            href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
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
    <div style={{ position: "relative", background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 60%, #0a0a0a 100%)", padding: "40px 16px", overflow: "hidden", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes rvLuxFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rvLuxGlow { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
        .rv-lux-hero-outer { max-width: 1300px; margin: 0 auto; position: relative; z-index: 2; display: grid; grid-template-columns: 1fr; gap: 28px; align-items: center; }
        .rv-lux-hero-images { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .rv-lux-hero-images .rv-lux-main-img { grid-column: span 2; min-height: 180px !important; }
        .rv-lux-hero-title { font-size: clamp(26px,7vw,54px) !important; }
        .rv-lux-fade-1 { animation: rvLuxFadeUp 0.7s ease both; }
        .rv-lux-fade-2 { animation: rvLuxFadeUp 0.7s ease 0.12s both; }
        .rv-lux-fade-3 { animation: rvLuxFadeUp 0.7s ease 0.24s both; }
        .rv-lux-fade-4 { animation: rvLuxFadeUp 0.7s ease 0.36s both; }
        .rv-lux-img-btn { transition: transform 0.4s ease, box-shadow 0.4s ease; }
        .rv-lux-img-btn:hover { transform: translateY(-4px); box-shadow: 0 16px 32px rgba(212,175,55,0.18); }
        .rv-lux-img-btn img { transition: transform 0.6s ease; }
        .rv-lux-img-btn:hover img { transform: scale(1.06); }
        .rv-lux-cta-btn { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .rv-lux-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(212,175,55,0.35); }
        @media (min-width: 860px) {
          .rv-lux-hero-outer { grid-template-columns: 1.1fr 1fr; gap: 40px; }
          .rv-lux-hero-images { grid-template-columns: ${vedettes.length >= 3 ? "1.3fr 1fr" : "1fr"}; }
          .rv-lux-hero-images .rv-lux-main-img { grid-column: auto; grid-row: ${vedettes.length >= 3 ? "span 2" : "auto"}; min-height: 220px !important; }
        }
      `}</style>
      <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.16), transparent 70%)", animation: "rvLuxGlow 5s ease-in-out infinite" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(212,175,55,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.035) 1px, transparent 1px)", backgroundSize: "44px 44px", pointerEvents: "none" }} />
      <div className="rv-lux-hero-outer">
        <div>
          <div className="rv-lux-fade-1" style={{ display: "inline-block", border: "1px solid #D4AF37", color: "#D4AF37", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", padding: "5px 14px", borderRadius: 30, marginBottom: 18 }}>
            EXCELLENCE & PRESTIGE
          </div>
          <div className="rv-lux-titre rv-lux-hero-title rv-lux-fade-2" style={{ fontWeight: 800, color: "white", lineHeight: 1.15, marginBottom: 16, letterSpacing: "-0.01em" }}>
            {entreprise.nom}<br /><span style={{ color: "#D4AF37" }}>Véhicules, machines & bien plus.</span>
          </div>
          <div className="rv-lux-fade-3" style={{ fontSize: 13.5, color: "rgba(255,255,255,0.68)", lineHeight: 1.7, marginBottom: 24, maxWidth: 480 }}>
            {entreprise.description || "Louez, commandez ou achetez directement — voitures de luxe, engins de chantier, bennes et maisons préfabriquées, importés sur mesure ou disponibles immédiatement."}
          </div>
          <div className="rv-lux-fade-4" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="rv-lux-cta-btn"
              onClick={() => document.getElementById("rv-vehicules")?.scrollIntoView({ behavior: "smooth" })}
              style={{ background: "#D4AF37", color: "#0a0a0a", border: "none", borderRadius: 6, padding: "13px 24px", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: "0.03em" }}
            >
              Explorer le catalogue →
            </button>
            {entreprise.whatsapp && (
              <a href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`} target="_blank" rel="noopener noreferrer" className="rv-lux-cta-btn" style={{ display: "flex", alignItems: "center", background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "13px 20px", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                💬 Parler à un conseiller
              </a>
            )}
          </div>
        </div>

        {vedettes.length > 0 && (
          <div className="rv-lux-hero-images rv-lux-fade-3">
            <button className="rv-lux-main-img rv-lux-img-btn" onClick={() => onOuvrirVehicule(vedettes[0])} style={{ position: "relative", border: "1px solid rgba(212,175,55,0.25)", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
              <img src={vedettes[0].photo_url} alt="" style={{ width: "100%", height: "100%", position: "absolute", inset: 0, objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent 60%)" }} />
              <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, textAlign: "left" }}>
                <div style={{ color: "#D4AF37", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{vedettes[0].categorie}</div>
                <div className="rv-lux-titre" style={{ color: "white", fontWeight: 700, fontSize: 16 }}>{vedettes[0].nom}</div>
              </div>
            </button>
            {vedettes.slice(1, 3).map((v) => (
              <button key={v.id} className="rv-lux-img-btn" onClick={() => onOuvrirVehicule(v)} style={{ position: "relative", border: "1px solid rgba(212,175,55,0.25)", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", minHeight: 100 }}>
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
    <button className="rv-lux-carte" onClick={() => onOuvrir(b)} style={{ textAlign: "left", background: "#141414", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 12, padding: 0, cursor: "pointer", overflow: "hidden", width: "100%", fontFamily: "'Inter', sans-serif", transition: "transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease" }}>
      <div style={{ position: "relative", overflow: "hidden" }}>
        {b.photo_url ? (
          <img className="rv-lux-carte-img" src={b.photo_url} alt="" loading="lazy" style={{ width: "100%", height: 170, objectFit: "cover", display: "block", transition: "transform 0.5s ease" }} />
        ) : (
          <div style={{ width: "100%", height: 170, background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🚗</div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent 45%)" }} />
      </div>
      <div style={{ padding: "15px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{b.categorie}</div>
        <div className="rv-lux-titre" style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nom}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {b.mode_location && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#D4AF37", border: "1px solid rgba(212,175,55,0.4)", padding: "3px 8px", borderRadius: 999 }}>🔑 Louer</span>}
          {b.mode_commander && <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.25)", padding: "3px 8px", borderRadius: 999 }}>📦 Commander</span>}
          {b.mode_payer_maintenant && <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.25)", padding: "3px 8px", borderRadius: 999 }}>💵 Direct</span>}
        </div>
      </div>
    </button>
  );
}

function SectionsLuxuryCar({ entreprise, biensLocation = [], onOuvrirCategorie }) {
  const nbCategories = new Set(biensLocation.map((b) => b.categorie).filter(Boolean)).size;
  const categoriesAvecPhoto = [...new Set(biensLocation.map((b) => b.categorie).filter(Boolean))]
    .map((cat) => ({ nom: cat, photo: biensLocation.find((b) => b.categorie === cat && b.photo_url)?.photo_url, count: biensLocation.filter((b) => b.categorie === cat).length }));

  return (
    <div style={{ background: "#0a0a0a", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .rv-lux-cat-tile { transition: transform 0.4s ease; }
        .rv-lux-cat-tile:hover { transform: translateY(-5px); }
        .rv-lux-cat-tile:hover img { transform: scale(1.08); }
        .rv-lux-cat-tile img { transition: transform 0.5s ease; }
        .rv-lux-mode-card:hover { transform: translateY(-5px); border-color: rgba(212,175,55,0.5) !important; }
        .rv-lux-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(212,175,55,0.35); }
        summary::-webkit-details-marker { display: none; }
        summary::marker { content: ""; }
        summary { position: relative; padding-right: 20px; }
        summary::after { content: "+"; position: absolute; right: 0; top: 0; color: #D4AF37; font-size: 16px; }
        details[open] summary::after { content: "−"; }
      `}</style>

      {/* Tuiles par catégorie */}
      {categoriesAvecPhoto.length > 1 && (
        <div style={{ padding: "50px 20px 10px" }}>
          <div style={{ maxWidth: 1300, margin: "0 auto" }}>
            <RevealOnScroll>
              <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(20px,3vw,28px)", fontWeight: 700, marginBottom: 24, textAlign: "center" }}>Achetez par catégorie</div>
            </RevealOnScroll>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {categoriesAvecPhoto.map((c, i) => (
                <RevealOnScroll key={c.nom} delai={i * 70}>
                  <button
                    className="rv-lux-cat-tile"
                    onClick={() => onOuvrirCategorie && onOuvrirCategorie(c.nom)}
                    style={{ position: "relative", width: "100%", height: 160, border: "1px solid rgba(212,175,55,0.2)", borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0 }}
                  >
                    {c.photo ? (
                      <img src={c.photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#1e1e1e" }} />
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.15) 60%)" }} />
                    <div style={{ position: "absolute", bottom: 14, left: 14, right: 14, textAlign: "left" }}>
                      <div className="rv-lux-titre" style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{c.nom}</div>
                      <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 600, marginTop: 2 }}>{c.count} disponible{c.count > 1 ? "s" : ""}</div>
                    </div>
                  </button>
                </RevealOnScroll>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bandeau de confiance */}
      <RevealOnScroll>
      <div style={{ borderTop: "1px solid rgba(212,175,55,0.15)", borderBottom: "1px solid rgba(212,175,55,0.15)", padding: "26px 20px", marginTop: 30 }}>
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
      </RevealOnScroll>

      {/* Comment ça marche — les 3 modes */}
      <RevealOnScroll>
      <div style={{ padding: "50px 20px", textAlign: "center" }}>
        <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>COMMENT ÇA MARCHE</div>
        <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(22px,3vw,32px)", fontWeight: 700, marginBottom: 36 }}>Trois façons d'obtenir ce dont vous avez besoin</div>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {[
            ["🔑", "LOUER", "Idéal pour un besoin ponctuel — voiture, engin ou matériel loué à la journée, avec caution."],
            ["📦", "COMMANDER", "Le bien n'est pas encore sur place ? On vous le fait venir directement de Chine, délai annoncé à l'avance."],
            ["💵", "PAYER MAINTENANT", "Déjà disponible en Côte d'Ivoire — vous payez et repartez rapidement avec votre bien."],
          ].map(([icone, titre, texte], i) => (
            <div key={i} className="rv-lux-mode-card" style={{ background: "#141414", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 14, padding: "30px 24px", transition: "transform 0.35s ease, border-color 0.35s ease" }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{icone}</div>
              <div style={{ color: "#D4AF37", fontWeight: 700, fontSize: 14, letterSpacing: "0.06em", marginBottom: 10 }}>{titre}</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.65 }}>{texte}</div>
            </div>
          ))}
        </div>
      </div>
      </RevealOnScroll>

      {/* Chiffres */}
      <RevealOnScroll>
      <div style={{ background: "#141414", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
          {[
            [`${biensLocation.length || 0}+`, "Biens disponibles"],
            [`${nbCategories || 0}`, "Catégories"],
            ["100%", "Vérifié avant livraison"],
            ["24/7", "Support client"],
          ].map(([valeur, label], i) => (
            <div key={i}>
              <div className="rv-lux-titre" style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 700, color: "#D4AF37" }}>{valeur}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      </RevealOnScroll>

      {/* Notre processus d'achat */}
      <RevealOnScroll>
      <div style={{ padding: "54px 20px", background: "#0d0d0d" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>DE LA COMMANDE À LA LIVRAISON</div>
            <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(22px,3vw,32px)", fontWeight: 700 }}>Notre processus d'achat</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
            {[
              ["1", "Contact", "Vous nous décrivez votre besoin, par WhatsApp ou via la fiche du bien."],
              ["2", "Devis personnalisé", "On vous propose un prix clair et un délai précis, selon le mode choisi."],
              ["3", "Confirmation", "Vous validez, avec les conditions convenues ensemble."],
              ["4", "Import ou préparation", "Selon le mode : commande depuis la Chine, ou préparation du bien local."],
              ["5", "Réception", "Livraison ou retrait, avec vérification du bien devant vous."],
            ].map(([num, titre, texte], i, arr) => (
              <div key={num} style={{ position: "relative", textAlign: "center" }}>
                <div className="rv-lux-titre" style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(212,175,55,0.12)", border: "1.5px solid #D4AF37", color: "#D4AF37", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 17, margin: "0 auto 14px" }}>{num}</div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{titre}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5, lineHeight: 1.55 }}>{texte}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </RevealOnScroll>

      {/* Garanties & service après-vente */}
      <RevealOnScroll>
      <div style={{ padding: "54px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>APRÈS VOTRE ACHAT</div>
            <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(22px,3vw,30px)", fontWeight: 700, marginBottom: 16 }}>Garanties & service après-vente</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 1.7 }}>
              Un investissement de cette ampleur mérite un vrai accompagnement — pas juste une transaction. Notre équipe reste disponible après la livraison pour répondre à vos questions et vous orienter en cas de besoin.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              ["🔍", "Vérification avant livraison", "Chaque bien est contrôlé avant de vous être remis."],
              ["📞", "Support post-achat", "Une ligne dédiée pour toute question après réception."],
              ["📋", "Documentation complète", "Facture, informations techniques, et suivi de commande fournis."],
            ].map(([icone, titre, texte], i) => (
              <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "#141414", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 10, padding: "16px 18px" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{icone}</span>
                <div>
                  <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{titre}</div>
                  <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>{texte}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </RevealOnScroll>

      {/* Moyens de paiement flexibles */}
      <RevealOnScroll>
      <div style={{ background: "#141414", padding: "50px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ color: "#D4AF37", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10 }}>SANS COMPLICATION</div>
          <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(20px,3vw,28px)", fontWeight: 700, marginBottom: 30 }}>Moyens de paiement flexibles</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            {["💸 Wave", "📱 Orange Money", "📱 MTN MoMo", "🏦 Virement bancaire", "💵 Espèces"].map((m, i) => (
              <div key={i} style={{ background: "#0a0a0a", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, padding: "10px 18px", fontSize: 12.5, fontWeight: 600, color: "white" }}>{m}</div>
            ))}
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12.5, lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
            Pour les montants importants, un paiement échelonné peut être discuté au cas par cas avec votre conseiller.
          </div>
        </div>
      </div>
      </RevealOnScroll>

      {/* À qui s'adresse Luxury Car */}
      <RevealOnScroll>
      <div style={{ padding: "54px 20px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(20px,3vw,28px)", fontWeight: 700, marginBottom: 30, textAlign: "center" }}>À qui s'adresse Luxury Car</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {[
              ["🏗️", "Entreprises BTP", "Engins de chantier, bennes, groupes électrogènes pour vos travaux."],
              ["🏢", "Administrations & ONG", "Véhicules et matériel pour vos missions et opérations."],
              ["👤", "Particuliers", "Véhicules de luxe, à louer ou à acheter, selon votre besoin."],
              ["🏪", "Commerces & PME", "Groupes électrogènes et matériel pour sécuriser votre activité."],
            ].map(([icone, titre, texte], i) => (
              <div key={i} style={{ background: "#141414", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, padding: "22px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{icone}</div>
                <div style={{ color: "#D4AF37", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{titre}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11.5, lineHeight: 1.5 }}>{texte}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </RevealOnScroll>

      {/* FAQ */}
      <RevealOnScroll>
      <div style={{ background: "#141414", padding: "54px 20px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(20px,3vw,28px)", fontWeight: 700, marginBottom: 30, textAlign: "center" }}>Questions fréquentes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Puis-je voir le véhicule ou l'engin avant de payer ?", "Oui, pour tout bien déjà disponible localement, une visite peut être organisée avec votre conseiller avant la finalisation."],
              ["Quel est le délai réel pour une commande depuis la Chine ?", "Le délai est annoncé précisément sur chaque fiche produit avant que vous ne confirmiez — généralement 45 à 60 jours selon le bien."],
              ["Comment se passe le paiement pour un montant important ?", "Par Mobile Money, virement bancaire, ou en espèces. Pour les gros montants, un paiement échelonné peut être discuté directement avec votre conseiller."],
              ["Que se passe-t-il si le véhicule loué a un problème ?", "Contactez immédiatement notre support — chaque location est suivie et un remplacement ou une solution est proposé rapidement."],
            ].map(([q, r], i) => (
              <details key={i} style={{ background: "#0a0a0a", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 10, padding: "16px 18px" }}>
                <summary style={{ color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", listStyle: "none" }}>{q}</summary>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12.5, lineHeight: 1.6, marginTop: 10 }}>{r}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
      </RevealOnScroll>

      {/* CTA final */}
      <RevealOnScroll>
      <div style={{ padding: "54px 20px", textAlign: "center", background: "linear-gradient(180deg, transparent, rgba(212,175,55,0.05))" }}>
        <div className="rv-lux-titre" style={{ color: "white", fontSize: "clamp(22px,3vw,32px)", fontWeight: 700, marginBottom: 12, maxWidth: 560, margin: "0 auto 12px" }}>
          Un projet précis en tête ?
        </div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13.5, marginBottom: 28, maxWidth: 460, margin: "0 auto 28px", lineHeight: 1.6 }}>
          Décrivez-nous ce que vous cherchez — véhicule, engin, matériel — et on vous accompagne, de la commande à la livraison.
        </div>
        {entreprise.whatsapp && (
          <a
            href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rv-lux-cta-btn"
            style={{ display: "inline-block", background: "#D4AF37", color: "#0a0a0a", border: "none", borderRadius: 6, padding: "14px 32px", fontWeight: 700, fontSize: 13.5, textDecoration: "none", letterSpacing: "0.03em", transition: "transform 0.25s ease, box-shadow 0.25s ease" }}
          >
            💬 Discuter avec un conseiller
          </a>
        )}
      </div>
      </RevealOnScroll>
    </div>
  );
}

function PiedPageLuxuryCar({ entreprise, biensLocation = [] }) {
  const anneeEnCours = new Date().getFullYear();
  const categories = [...new Set(biensLocation.map((b) => b.categorie).filter(Boolean))];
  return (
    <div style={{ background: "#0a0a0a", color: "rgba(255,255,255,0.6)", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "40px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 28, borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
        <div>
          {entreprise.logo ? (
            <img src={entreprise.logo} alt="" style={{ height: 38, objectFit: "contain", marginBottom: 12 }} />
          ) : (
            <div className="rv-lux-titre" style={{ color: "#D4AF37", fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{entreprise.nom}</div>
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
            <a href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, textDecoration: "none" }}>
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

function EnteteAzaliExpress({ entreprise, couleur, recherche, setRecherche, onLogoClick, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, nbArticlesPanier = 0, onOuvrirPanier, onOuvrirPagePerso }) {
  const t = creerTraducteur(entreprise.langue);
  const [topbarVisible, setTopbarVisible] = useState(true);
  // Bandeau fermé À LA MAIN avec la croix : il ne revient plus. Masqué seulement par le défilement : il revient en haut de page.
  const topbarFermeeManuellement = useRef(false);
  const [estFixe, setEstFixe] = useState(false);
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const paysEntete = usePaysClient(entreprise);
  const messagesAnnonce = (entreprise.azaliConfig?.messagesAnnonce && entreprise.azaliConfig.messagesAnnonce.length > 0) ? entreprise.azaliConfig.messagesAnnonce : [
    { icone: "🚚", texte: "Livraison gratuite à Abidjan dès 50 000 FCFA" },
    { icone: "💸", texte: "Wave · Orange Money · MTN MoMo acceptés" },
    { icone: "🔄", texte: "Retour facile sous 7 jours" },
    { icone: "📦", texte: "Livraison partout en Côte d'Ivoire" },
  ];
  // Pages libres importées/créées côté admin, positionnées dans le menu principal.
  const pagesHeader = Array.isArray(entreprise.pagesPersonnalisees)
    ? entreprise.pagesPersonnalisees.filter((p) => p.emplacement === "header")
    : [];

  useEffect(() => {
    function onScroll() {
      const doitEtreFixe = window.scrollY > 34;
      setEstFixe(doitEtreFixe);
      // Le bandeau d'annonces disparaît tout seul dès qu'on commence à faire défiler la page,
      // pour laisser toute la place au contenu — plus besoin de le fermer à la main.
      if (doitEtreFixe) setTopbarVisible(false);
      else if (window.scrollY < 8 && !topbarFermeeManuellement.current) setTopbarVisible(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Couleurs personnalisables (Store Builder → En-tête). Vide = look historique d'Azali Express.
  const scAz = entreprise.storeConfig || {};
  const bgPrincipal = (couleurPersoValide(scAz.headerBgColor) && scAz.headerBgColor.toLowerCase() !== "#131921") ? scAz.headerBgColor : couleur; // #131921 = valeur par défaut de l'éditeur
  const persoPrincipal = bgPrincipal !== couleur;
  const txtPrincipal = persoPrincipal ? (couleurPersoValide(scAz.headerTextColor) || couleurTextePourFond(bgPrincipal)) : "white";
  const bgAnnonce = couleurPersoValide(scAz.headerBarreBgColor) || "#145c2e";
  const txtAnnonce = couleurPersoValide(scAz.headerBarreBgColor) ? couleurTextePourFond(bgAnnonce) : "rgba(255,255,255,0.92)";
  const bgMenu = couleurPersoValide(scAz.headerNavBgColor) || "#145c2e";
  const txtMenu = couleurPersoValide(scAz.headerNavBgColor) ? couleurTextePourFond(bgMenu) : "white";
  const bgPanierHeader = couleurPersoValide(scAz.headerCartBgColor) || "#e8920a";
  const txtPanierHeader = couleurPersoValide(scAz.headerCartBgColor) ? couleurTextePourFond(bgPanierHeader) : "white";
  // Épinglé en "sticky" (et non plus "fixed" + cale de 52px) : l'en-tête reste collé en haut pendant
  // tout le défilement, sans saut de contenu ni chevauchement quand il se réduit ou passe sur 2 lignes.
  const styleFixe = estFixe ? { boxShadow: "0 2px 10px rgba(0,0,0,0.15)" } : {};

  return (
    <>
      <style>{`
        .rv-azali-sticky { position: -webkit-sticky !important; position: sticky !important; top: 0 !important; z-index: 40 !important; font-family: sans-serif; transition: box-shadow .2s ease; }
        .rv-azali-nav-scroll { display: flex; }
        .rv-azali-nav-toggle { display: none; }
        @media (max-width: 760px) {
          .rv-azali-nav-scroll { display: none; }
          .rv-azali-nav-toggle { display: flex; }
        }
      `}</style>
      <div className="rv-azali-sticky" style={styleFixe}>
        {topbarVisible && (
          <div style={{ background: bgAnnonce, color: txtAnnonce, padding: "7px 30px", position: "relative" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
              {messagesAnnonce.map((m, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{m.icone} {m.texte}</span>
              ))}
            </div>
            <button onClick={() => { topbarFermeeManuellement.current = true; setTopbarVisible(false); }} aria-label="Fermer" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        )}

        <div style={{ background: bgPrincipal, padding: estFixe ? "6px 16px" : "10px 16px", transition: "padding 0.2s ease" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: estFixe ? 8 : 14, flexWrap: "wrap" }}>
            <button
              className="rv-azali-nav-toggle"
              onClick={() => setMenuMobileOuvert((v) => !v)}
              aria-label="Menu"
              style={{ alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.18)", border: "none", color: "white", width: 36, height: 36, borderRadius: 8, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
            >
              {menuMobileOuvert ? "✕" : "☰"}
            </button>
            <div onClick={onLogoClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
              {entreprise.logo ? (
                <img src={entreprise.logo} alt={entreprise.nom} style={{ height: estFixe ? 28 : 40, objectFit: "contain", transition: "height 0.2s ease" }} />
              ) : (
                <span style={{ fontWeight: 800, fontSize: estFixe ? 14 : 18, color: txtPrincipal }}>{entreprise.nom}</span>
              )}
            </div>

            {!estFixe && entreprise.country === "CI" && (
              <div style={{ fontSize: 10.5, color: persoPrincipal ? txtPrincipal : "rgba(255,255,255,0.8)", flexShrink: 0, lineHeight: 1.3 }}>
                📍 Livrer à<br /><span style={{ fontWeight: 700, color: txtPrincipal }}>Abidjan ▾</span>
              </div>
            )}

            <div style={{ flex: 1, minWidth: estFixe ? 90 : 140, display: "flex", background: "white", borderRadius: 8, overflow: "hidden" }}>
              <span style={{ padding: estFixe ? "6px 0 6px 12px" : "10px 0 10px 14px", fontSize: 13, color: "#8A9089" }}>🔍</span>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("rechercherProduit") || "Rechercher un produit, une marque..."}
                style={{ flex: 1, border: "none", background: "transparent", padding: estFixe ? "6px 8px" : "10px 10px", fontSize: 16, outline: "none" }}
              />
            </div>

            {!estFixe && entreprise.whatsapp && (
              <a
                href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "4px 10px", borderRadius: 6, textDecoration: "none", flexShrink: 0 }}
              >
                <span style={{ fontSize: 9.5, color: persoPrincipal ? txtPrincipal : "rgba(255,255,255,0.75)" }}>Besoin d'aide ?</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: txtPrincipal }}>💬 WhatsApp</span>
              </a>
            )}

            <SelecteurPaysEntete pays={paysEntete} entreprise={entreprise} couleurTexte={persoPrincipal ? txtPrincipal : "white"} fond="rgba(255,255,255,0.18)" hauteur={estFixe ? 32 : 40} />

            <button
              onClick={onOuvrirPanier}
              style={{ position: "relative", background: bgPanierHeader, color: txtPanierHeader, border: "none", borderRadius: 8, padding: estFixe ? "6px 11px" : "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
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
        <div className="rv-azali-nav-scroll" style={{ background: bgMenu, padding: "0 16px", overflowX: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
            <span
              onClick={() => onNaviguerVersCollection(null)}
              style={{ color: txtMenu, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "10px 14px 10px 0", borderRight: "1px solid rgba(255,255,255,0.2)", marginRight: 6 }}
            >
              ☰ {t("toutesCollections") || "Toutes catégories"}
            </span>
            {collectionsManuelles.map((c) => (
              <span key={c.id} onClick={() => onNaviguerVersCollection(c.id)} style={{ color: txtMenu === "white" ? "rgba(255,255,255,0.88)" : txtMenu, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "10px 10px" }}>
                {c.nom}
              </span>
            ))}
            {pagesHeader.map((p) => (
              <span key={p.slug} onClick={() => onOuvrirPagePerso?.(p)} style={{ color: txtMenu === "white" ? "rgba(255,255,255,0.88)" : txtMenu, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "10px 10px" }}>
                {p.titre}
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
                <span style={{ color: txtMenu === "white" ? "rgba(255,255,255,0.75)" : txtMenu, fontSize: 12, fontWeight: 600, padding: "10px 0 10px 10px" }}>📞 {entreprise.whatsapp}</span>
              )}
            </div>
          </div>
        </div>
        )}

        {menuMobileOuvert && (
          <div style={{ background: couleurPersoValide(scAz.headerNavBgColor) || "#0f3d20", maxHeight: "70vh", overflowY: "auto" }}>
            {[
              { key: "accueil", label: `☰ ${t("toutesCollections") || "Toutes catégories"}`, onClick: () => { onNaviguerVersCollection(null); setMenuMobileOuvert(false); } },
              ...collectionsManuelles.map((c) => ({ key: c.id, label: c.nom, onClick: () => { onNaviguerVersCollection(c.id); setMenuMobileOuvert(false); } })),
              ...pagesHeader.map((p) => ({ key: p.slug, label: p.titre, onClick: () => { onOuvrirPagePerso?.(p); setMenuMobileOuvert(false); } })),
              ...(aDesBestSellers ? [{ key: "bestseller", label: "🔥 Promotions Flash", onClick: () => { onNaviguerVersCollection("bestseller"); setMenuMobileOuvert(false); } }] : []),
              ...(aDesNouveautes ? [{ key: "nouveautes", label: "✨ Nouveautés", onClick: () => { onNaviguerVersCollection("nouveautes"); setMenuMobileOuvert(false); } }] : []),
            ].map((item) => (
              <button
                key={item.key}
                onClick={item.onClick}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.08)", color: txtMenu, fontSize: 14, fontWeight: 600, padding: "13px 18px", cursor: "pointer" }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {entreprise.whatsapp && (
        <div style={{ fontFamily: "sans-serif", background: "#25d366", color: "white", textAlign: "center", padding: "8px 12px", fontSize: 12, fontWeight: 600 }}>
          💬 {t("besoinAide") || "Besoin d'aide ? Contactez-nous"} — réponse en moins de 30 min !{" "}
          <a
            href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "white", fontWeight: 700, textDecoration: "none", background: "rgba(255,255,255,0.22)", padding: "3px 10px", borderRadius: 4, marginLeft: 6 }}
          >
            {t("ecrireWhatsapp") || "Écrire sur WhatsApp"}
          </a>
        </div>
      )}
    </>
  );
}

function EnteteBoutique({ entreprise, couleur, recherche, setRecherche, onLogoClick, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, collectionActive, headerConfig, nbArticlesPanier = 0, onOuvrirPanier, biensLocation = [], onOuvrirCategorieBien, onOuvrirPagePerso }) {
  // Déclaré tout en haut, avant les "return" conditionnels ci-dessous, pour respecter les
  // règles des Hooks React (un Hook ne doit jamais dépendre d'un chemin de retour anticipé).
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const paysEntete = usePaysClient(entreprise);
  // L'en-tête reste épinglé en haut (position: sticky) pendant tout le défilement ;
  // "replie" ne fait que le rendre plus compact passé un petit seuil de scroll, pour
  // qu'il libère de la place sans jamais disparaître. Un seul booleen à changer, lu
  // via requestAnimationFrame : aucune boucle continue, donc aucun impact sur la fluidité.
  const [enteteRepliee, setEnteteRepliee] = useState(false);
  // Sur téléphone, en-tête replié : la barre de recherche se range derrière une petite loupe
  // (l'en-tête tient alors sur UNE seule fine ligne) ; un tap sur la loupe la rouvre.
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  useEffect(() => { if (!enteteRepliee) setRechercheOuverte(false); }, [enteteRepliee]);
  useEffect(() => {
    let ticking = false;
    function verifier() {
      // Hystérésis (44px pour replier, 20px pour redéplier) : évite de basculer l'état,
      // donc de redéclencher un recalcul de mise en page, à chaque micro-mouvement
      // du doigt pile autour d'un seuil unique.
      setEnteteRepliee((etaitRepliee) => window.scrollY > (etaitRepliee ? 20 : 44));
      ticking = false;
    }
    function onScroll() {
      if (!ticking) { window.requestAnimationFrame(verifier); ticking = true; }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        onOuvrirPagePerso={onOuvrirPagePerso}
      />
    );
  }

  const aDesLiensPersonnalises = Array.isArray(headerConfig?.liens) && headerConfig.liens.length > 0;
  const pagesHeader = Array.isArray(entreprise.pagesPersonnalisees)
    ? entreprise.pagesPersonnalisees.filter((p) => p.emplacement === "header")
    : [];
  const aDesLiensNav = aDesLiensPersonnalises || aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0 || pagesHeader.length > 0;
  const t = creerTraducteur(entreprise.langue);
  // Couleurs de l'en-tête : saisie sans « # » réparée ; texte automatiquement lisible si fond et texte se confondent.
  const bgHeader = couleurCssSure(headerConfig?.bgColor, "") || couleur;
  let texteHeader = couleurCssSure(headerConfig?.textColor, "") || "white";
  const contrasteHeader = ratioContraste(texteHeader === "white" ? "#ffffff" : texteHeader, bgHeader);
  if (contrasteHeader != null && contrasteHeader < 2.2) texteHeader = texteSurFond(bgHeader);
  const afficherRecherche = headerConfig?.showSearch !== false;
  const navMenu = { entreprise, onNaviguerVersCollection, onOuvrirPagePerso, accueil: onLogoClick };
  const bgNav = couleurPersoValide(entreprise.storeConfig?.headerNavBgColor);
  const texteNav = bgNav ? couleurTextePourFond(bgNav) : texteHeader;
  const afficherPanier = headerConfig?.showPanier !== false;

  return (
    <div className={`rv-shop-header-sticky${enteteRepliee ? " rv-shop-header-replie" : ""}`} style={{ background: bgHeader, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
      <style>{`
        /* Position en CSS (avec le préfixe -webkit-) plutôt qu'en style inline : certains
           anciens navigateurs (Safari iOS < 13, webviews WhatsApp/Instagram intégrées,
           fréquentes chez les clients qui ouvrent un lien boutique reçu par message)
           ignorent silencieusement "position: sticky" sans le préfixe -webkit-, et un
           style inline React ne peut pas déclarer les deux formes à la fois — la classe le peut.
           Le !important protège aussi contre un style global qui l'écraserait par erreur. */
        .rv-shop-header-sticky { position: -webkit-sticky !important; position: sticky !important; top: 0 !important; z-index: 30 !important; }
        .rv-shop-nav-desktop { display: flex; }
        .rv-shop-nav-toggle { display: none; }
        .rv-shop-hdr-row { display: flex; align-items: center; gap: 12px; }
        .rv-shop-header-nom { font-weight: 800; font-size: 16px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .rv-shop-header-logo { width: 38px; height: 38px; border-radius: 10px; object-fit: contain; flex-shrink: 0; background: rgba(255,255,255,0.12); }
        .rv-shop-header-whatsapp-txt { display: inline; }
        /* En-tête "replié" : reste épinglé en haut (sticky), juste plus compact — logo et
           texte réduits en douceur, pour laisser plus de place au contenu qui défile. */
        .rv-shop-hdr-row-compact .rv-shop-header-logo { width: 28px; height: 28px; border-radius: 8px; }
        .rv-shop-hdr-row-compact .rv-shop-header-nom { font-size: 13.5px; }
        .rv-shop-search-btn { display: none; }
        @media (max-width: 680px) {
          .rv-shop-nav-desktop { display: none; }
          .rv-shop-nav-toggle { display: flex; }
          /* Sur téléphone, le bouton WhatsApp ne garde que l'icône : burger + nom + contact + panier tiennent
             sur UNE seule ligne (avant, le panier tombait seul sur une 2e ligne). */
          .rv-shop-header-whatsapp-txt { display: none; }
          .rv-shop-header-whatsapp { padding: 0 !important; width: 38px; height: 38px; justify-content: center; flex-shrink: 0; font-size: 16px !important; }
          /* Le nom de la boutique reste TOUJOURS lisible : la recherche passe
             sur une deuxième ligne pleine largeur au lieu d'écraser le nom. */
          .rv-shop-hdr-row { flex-wrap: wrap; row-gap: 8px; }
          .rv-shop-hdr-marque { flex: 1 1 auto; min-width: 0; }
          .rv-shop-header-search { order: 9; flex: 1 1 100% !important; }
          .rv-shop-header-nom { font-size: 15px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.15; max-width: none !important; }
          .rv-shop-header-logo { width: 34px; height: 34px; }
          /* Repliée sur mobile : on repasse le nom sur une seule ligne compacte
             et la recherche redevient plus fine, au lieu de garder 2 lignes de texte. */
          .rv-shop-hdr-row-compact { row-gap: 4px; }
          .rv-shop-hdr-row-compact .rv-shop-header-nom { font-size: 13px; -webkit-line-clamp: 1; }
          .rv-shop-hdr-row-compact .rv-shop-header-logo { width: 26px; height: 26px; }
          .rv-shop-hdr-row-compact .rv-shop-header-search input { padding-top: 7px; padding-bottom: 7px; }
          /* Replié sur téléphone : une seule ligne fine (menu, logo, nom, loupe, panier). */
          .rv-shop-hdr-row-compact:not(.rv-shop-search-open) .rv-shop-header-search { display: none; }
          .rv-shop-hdr-row-compact .rv-shop-search-btn { display: flex; }
          .rv-shop-hdr-row-compact .rv-shop-header-whatsapp { width: 34px; height: 34px; }
          .rv-shop-hdr-row-compact .rv-shop-nav-toggle, .rv-shop-hdr-row-compact .rv-shop-cart-btn, .rv-shop-hdr-row-compact .rv-shop-search-btn { width: 34px !important; height: 34px !important; }
        }
        .rv-shop-header-sticky { transition: box-shadow .2s ease; }
        .rv-shop-header-sticky.rv-shop-header-replie { box-shadow: 0 2px 10px rgba(0,0,0,0.18); }
      `}</style>
      <div style={{ background: couleurPersoValide(entreprise.storeConfig?.headerBarreBgColor) || "rgba(0,0,0,0.12)", overflow: "hidden", maxHeight: enteteRepliee ? 0 : 40, opacity: enteteRepliee ? 0 : 1, transition: "max-height .22s ease, opacity .18s ease" }}>
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

      <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: enteteRepliee ? "6px 16px" : "10px 16px", transition: "padding .2s ease" }}>
        <div className={`rv-shop-hdr-row${enteteRepliee ? " rv-shop-hdr-row-compact" : ""}${(rechercheOuverte || String(recherche || "").trim()) ? " rv-shop-search-open" : ""}`}>
          {aDesLiensNav && (
            <button
              className="rv-shop-nav-toggle"
              onClick={() => setMenuMobileOuvert((v) => !v)}
              aria-label="Menu"
              style={{ alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.2)", border: "none", color: texteHeader, width: 36, height: 36, borderRadius: 9, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
            >
              {menuMobileOuvert ? "✕" : "☰"}
            </button>
          )}
          <button
            onClick={onLogoClick}
            className="rv-shop-hdr-marque"
            style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: onLogoClick ? "pointer" : "default", padding: 0, minWidth: 0, textAlign: "left" }}
          >
            {entreprise.logo ? (
              <img src={entreprise.logo} alt={entreprise.nom} className="rv-shop-header-logo" onError={(e) => { e.target.style.display = "none"; }} />
            ) : null}
            <span className="rv-shop-header-nom" style={{ color: texteHeader }}>{entreprise.nom}</span>
          </button>

          {afficherRecherche && (
            <div className="rv-shop-header-search" style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#8A9089", pointerEvents: "none" }}>🔍</span>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t("rechercher")}
                style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.4)", fontSize: 16, boxSizing: "border-box" }}
              />
            </div>
          )}

          {afficherRecherche && (
            <button
              type="button"
              className="rv-shop-search-btn"
              aria-label="Rechercher"
              onClick={() => { setRechercheOuverte((v) => !v); setTimeout(() => document.querySelector(".rv-shop-header-search input")?.focus(), 60); }}
              style={{ alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.2)", border: "none", color: texteHeader, width: 36, height: 36, borderRadius: 9, fontSize: 15, cursor: "pointer", flexShrink: 0 }}
            >
              🔍
            </button>
          )}

          <SelecteurPaysEntete pays={paysEntete} entreprise={entreprise} couleurTexte={texteHeader} />

          {entreprise.whatsapp && (
            <a
              href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
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
              className="rv-shop-cart-btn"
              style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: couleurPersoValide(entreprise.storeConfig?.headerCartBgColor) || "rgba(255,255,255,0.2)", border: "none", color: couleurPersoValide(entreprise.storeConfig?.headerCartBgColor) ? couleurTextePourFond(entreprise.storeConfig.headerCartBgColor) : texteHeader, width: 38, height: 38, borderRadius: 10, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
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
        <div className="rv-shop-nav-desktop" style={{ borderTop: "1px solid rgba(0,0,0,0.08)", overflowX: "auto", ...(bgNav ? { background: bgNav } : {}) }}>
          <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", gap: 4 }}>
            {aDesLiensPersonnalises ? (
              headerConfig.liens.map((lien) => (
                <a
                  key={lien.id}
                  href={lien.href || "#"}
                  onClick={(e) => gererLienBoutique(e, lien.href, navMenu)}
                  target={lien.href && lien.href.startsWith("http") ? "_blank" : undefined}
                  rel={lien.href && lien.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ background: "none", border: "none", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: 600, color: texteNav, opacity: 0.85, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" }}
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
                    style={{ background: "none", border: "none", borderBottom: actif ? `2px solid ${texteNav}` : "2px solid transparent", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: actif ? 700 : 600, color: texteNav, opacity: actif ? 1 : 0.85, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {lien.label}
                  </button>
                );
              })
            )}
            {pagesHeader.map((p) => (
              <button
                key={p.slug}
                onClick={() => onOuvrirPagePerso?.(p)}
                style={{ background: "none", border: "none", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: 600, color: texteNav, opacity: 0.85, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {p.titre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Panneau mobile déroulant : les mêmes liens que la barre desktop ci-dessus, mais en
          liste verticale — plus besoin de faire défiler horizontalement pour tout voir. */}
      {aDesLiensNav && menuMobileOuvert && (
        <div className="rv-shop-nav-toggle" style={{ flexDirection: "column", borderTop: "1px solid rgba(0,0,0,0.08)", maxHeight: "70vh", overflowY: "auto" }}>
          {(aDesLiensPersonnalises
            ? headerConfig.liens.map((lien) => ({ key: lien.id, label: lien.label, href: lien.href, onClick: undefined }))
            : [
                { key: "accueil", label: t("accueil"), onClick: () => onNaviguerVersCollection?.(null) },
                ...(aDesBestSellers ? [{ key: "bestseller", label: t("meilleuresVentes"), onClick: () => onNaviguerVersCollection?.("bestseller") }] : []),
                ...(aDesNouveautes ? [{ key: "nouveautes", label: t("nouveautes"), onClick: () => onNaviguerVersCollection?.("nouveautes") }] : []),
                ...collectionsManuelles.map((col) => ({ key: `manuelle-${col.id}`, label: col.nom, onClick: () => onNaviguerVersCollection?.(`manuelle-${col.id}`) })),
              ]
          ).concat(pagesHeader.map((p) => ({ key: p.slug, label: p.titre, onClick: () => onOuvrirPagePerso?.(p) }))).map((item) => (
            item.href ? (
              <a
                key={item.key}
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                onClick={(e) => { gererLienBoutique(e, item.href, navMenu); setMenuMobileOuvert(false); }}
                style={{ display: "block", padding: "13px 16px", fontSize: 14, fontWeight: 600, color: texteHeader, textDecoration: "none", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                onClick={() => { item.onClick?.(); setMenuMobileOuvert(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "13px 16px", fontSize: 14, fontWeight: 600, color: texteHeader, cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                {item.label}
              </button>
            )
          ))}
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
      data-rv-natif=""
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

// ===== GRILLES SUR TÉLÉPHONE : 4 produits bien alignés + « Voir plus » =====
// Sur mobile, les grilles sont en 2 colonnes. Avec 5 (ou 7, 9…) éléments, le dernier restait
// seul, décalé sur la gauche avec un trou à côté. Ici : on affiche d'abord 4 éléments (2 lignes
// complètes), puis « Voir plus » en révèle 8 de plus à chaque clic — RIEN n'est jamais caché
// définitivement : 9 produits = 9 affichables. Si le total révélé est impair, le dernier est
// centré (jamais collé à gauche avec un vide). Sur ordinateur/tablette : aucun changement.
// Le nombre d'éléments déjà révélés est gardé HORS du composant (Map) : certaines grilles sont
// recréées quand la page se met à jour (ex. ajout au panier) et repartiraient sinon à 4.
const memoireGrillesMobile = new Map();
function useEcranMobile() {
  const lire = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 639px)").matches : false);
  const [mobile, setMobile] = useState(lire);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(max-width: 639px)");
    const maj = () => setMobile(mq.matches);
    maj();
    if (mq.addEventListener) mq.addEventListener("change", maj); else if (mq.addListener) mq.addListener(maj);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", maj); else if (mq.removeListener) mq.removeListener(maj); };
  }, []);
  return mobile;
}
function GrilleMobile({ className, style, colonnes = 2, ecart = 12, toutAfficher = false, couleur = "#1a7a3c", langue, children }) {
  const mobile = useEcranMobile();
  const t = creerTraducteur(langue);
  const elements = React.Children.toArray(children);
  const depart = colonnes === 3 ? 6 : 4;
  const pas = colonnes === 3 ? 12 : 8;
  const cle = `${elements.length ? String(elements[0].key) : ""}|${colonnes}`;
  const [nb, setNbBrut] = useState(() => memoireGrillesMobile.get(cle) || depart);
  const setNb = (v) => { memoireGrillesMobile.set(cle, v); setNbBrut(v); };
  const pagine = mobile && !toutAfficher && elements.length > depart;
  const affiches = pagine ? elements.slice(0, nb) : elements;
  const reste = elements.length - affiches.length;
  const orphelin = mobile && colonnes === 2 && affiches.length % 2 === 1;
  return (
    <>
      <style>{`.rv-gm-orphelin > :last-child{grid-column:1 / -1;justify-self:center;width:calc((100% - var(--rv-gm-ecart,12px)) / 2) !important;box-sizing:border-box}`}</style>
      <div className={`${className || ""}${orphelin ? " rv-gm-orphelin" : ""}`} style={{ ...(style || {}), "--rv-gm-ecart": `${ecart}px` }}>
        {affiches}
      </div>
      {reste > 0 && (
        <button
          type="button"
          className="rv-gm-plus"
          onClick={() => setNb(nb + pas)}
          style={{ display: "block", width: "100%", background: "white", border: `1.5px solid ${couleur}`, color: couleur, borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", margin: "4px 0 26px", touchAction: "manipulation" }}
        >
          {t("voirPlus")} ({reste})
        </button>
      )}
    </>
  );
}

// ===== STYLE DES CARTES PRODUITS (piloté depuis le Store Builder) =====
// L'abonné choisit son ambiance dans Réglages → "Cartes produits" : aucun code à toucher.
// Réglages du pied de page issus du Store Builder (couleurs, colonnes, newsletter…), utilisés sur
// TOUS les écrans (accueil, collection, fiche produit) pour que le pied de page soit partout identique.
function creerFooterConfig(config) {
  if (!config || typeof config !== "object") return undefined;
  return { bgColor: config.footerBgColor, textColor: config.footerTextColor, colonnes: config.footerColonnes, newsletterActif: config.footerNewsletterActif, newsletterTexte: config.footerNewsletterTexte, paiements: config.footerPaiements, backToTop: config.footerBackToTop, boutiqueVisible: config.footerBoutiqueVisible, ambiance: config.footerAmbiance, colonnesMobile: config.footerColonnesMobile, accent: couleurPersoValide(config.footerAccentColor) || config.couleur };
}

// Clic sur un lien du menu / du pied de page (liens choisis dans le Store Builder) :
// - « Accueil » (#) ramène VRAIMENT à l'accueil, même depuis une fiche produit ou une collection ;
// - ?page= / ?collection= / ?politique= s'ouvrent sur place, sans perdre ?boutique= dans l'adresse ;
// - #ancre défile vers la section (en revenant d'abord à l'accueil si elle n'est pas sur l'écran) ;
// - liens externes (https://…) : comportement normal du navigateur.
function gererLienBoutique(e, href, nav = {}) {
  const h = String(href || "#").trim();
  if (/^(https?:)?\/\//i.test(h) || /^(mailto|tel|https?):/i.test(h)) return;
  e.preventDefault();
  const versAccueil = () => { if (nav.onNaviguerVersCollection) nav.onNaviguerVersCollection(null); else if (nav.accueil) nav.accueil(); window.scrollTo(0, 0); };
  if (h === "" || h === "#") { versAccueil(); return; }
  if (h.startsWith("?")) {
    const p = new URLSearchParams(h);
    const page = p.get("page"), col = p.get("collection"), pol = p.get("politique");
    if (page) {
      const pg = (nav.entreprise?.pagesPersonnalisees || []).find((x) => x.slug === page);
      if (pg && nav.onOuvrirPagePerso) { nav.onOuvrirPagePerso(pg); return; }
    }
    if (col && nav.onNaviguerVersCollection) { nav.onNaviguerVersCollection(`manuelle-${col}`); return; }
    if (pol) {
      if (nav.onNaviguerVersCollection) nav.onNaviguerVersCollection(null);
      setTimeout(() => window.dispatchEvent(new CustomEvent("rv-ouvrir-politique", { detail: pol })), 60);
      return;
    }
    // Produit précis (ou autre) : navigation complète, en gardant le reste de l'adresse (?boutique=…).
    const u = new URL(window.location.href);
    ["produit", "collection", "page", "politique", "bien"].forEach((k) => u.searchParams.delete(k));
    p.forEach((v, k) => u.searchParams.set(k, v));
    window.location.assign(u.toString());
    return;
  }
  if (h.startsWith("#")) {
    const id = h.slice(1);
    const trouver = () => document.getElementById(id) || document.getElementById("rv-shop-" + id) || document.getElementById("rv-" + id);
    const cible = trouver();
    if (cible) { cible.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    versAccueil();
    setTimeout(() => { const c = trouver(); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
    return;
  }
  window.location.assign(h);
}

// Couleurs des boutons « Ajouter au panier / Commander » choisies par le marchand dans le Store
// Builder (storeConfig.boutonBgColor / boutonTextColor). Vide = couleur de la marque (comportement
// historique). Variable de module, réglée à chaque rendu comme STYLE_CARTE.
let BOUTONS_PERSO = { bg: "", txt: "" };
const HEX6 = /^#[0-9a-f]{6}$/i;
function definirBoutonsPerso(sc) {
  BOUTONS_PERSO = {
    bg: HEX6.test(String(sc?.boutonBgColor || "").trim()) ? String(sc.boutonBgColor).trim() : "",
    txt: HEX6.test(String(sc?.boutonTextColor || "").trim()) ? String(sc.boutonTextColor).trim() : "",
  };
}
function styleBouton(couleur, texteDefaut = "white") {
  const bg = BOUTONS_PERSO.bg || couleur;
  const txt = BOUTONS_PERSO.txt || (BOUTONS_PERSO.bg ? couleurTextePourFond(BOUTONS_PERSO.bg) : texteDefaut);
  return { background: bg, color: txt };
}
function couleurPersoValide(v) { return HEX6.test(String(v || "").trim()) ? String(v).trim() : ""; }

let STYLE_CARTE = { style: "verre", anim: "lift", radius: "moyen", decor: true, ratio: "carre", fit: "auto" };
function appliquerStyleCarte(sc) {
  STYLE_CARTE = {
    style: sc?.cardStyle || "verre",
    anim: sc?.cardAnim || "lift",
    radius: sc?.cardRadius || "moyen",
    decor: sc?.cardDecor !== false,
    ratio: sc?.cardImageRatio === "portrait" ? "portrait" : "carre",
    fit: sc?.cardImageFit === "cover" || sc?.cardImageFit === "contain" ? sc.cardImageFit : "auto",
  };
}
function cssCartesProduits(cfg, couleur) {
  const c = couleur || "#1F9D6E";
  const rad = cfg.radius === "petit" ? 10 : cfg.radius === "grand" ? 22 : 16;
  const decorOpacite = cfg.decor ? 0.5 : 0;
  return `
  .rv-card{position:relative;display:block;width:100%;max-width:100%;box-sizing:border-box;border-radius:${rad}px;overflow:hidden;cursor:pointer;text-align:left;background:#fff;border:1px solid #ECE8DC;box-shadow:0 2px 8px rgba(22,35,31,.05);transition:transform .35s cubic-bezier(.2,.8,.3,1),box-shadow .35s,border-color .35s;transform-style:preserve-3d}
  .rv-card-media{position:relative;width:100%;padding-top:${cfg.ratio === "portrait" ? 125 : 100}%;overflow:hidden;background:linear-gradient(160deg,#F7F9F6,#EDF1EC)}
  .rv-card-media>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;display:block;z-index:0;transition:transform .6s cubic-bezier(.2,.8,.3,1)}
  .rv-card-media>img.rv-fit-cover{object-fit:cover}
  .rv-card{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  .rv-card:focus-visible{outline:2px solid ${c};outline-offset:2px}
  .rv-card-prix-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px}
  .rv-card-barre{font-size:.82em;font-weight:500;color:#9AA29C;text-decoration:line-through;letter-spacing:0}
  .rv-card-pct{font-size:10.5px;font-weight:800;color:#fff;background:#D64933;border-radius:999px;padding:2px 7px;letter-spacing:0;align-self:center}
  .rv-card-neon .rv-card-barre{color:#7f8f86}
  .rv-card-vide{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;z-index:0}
  .rv-card-halo{position:absolute;left:50%;top:54%;width:82%;height:82%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,${c}2e 0%,transparent 62%);z-index:0;pointer-events:none;transition:opacity .4s,transform .6s}
  .rv-card-shine{position:absolute;top:-10%;bottom:-10%;width:40%;left:-65%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-18deg);z-index:2;pointer-events:none;transition:left .8s ease}
  .rv-card-coins,.rv-card-coins i{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2;display:block}
  .rv-card-coins::before,.rv-card-coins::after,.rv-card-coins i::before,.rv-card-coins i::after{content:"";position:absolute;width:15px;height:15px;border:1.6px solid ${c};opacity:${decorOpacite};transition:opacity .3s,transform .3s}
  .rv-card-coins::before{top:9px;left:9px;border-right:0;border-bottom:0;border-radius:5px 0 0 0}
  .rv-card-coins::after{top:9px;right:9px;border-left:0;border-bottom:0;border-radius:0 5px 0 0}
  .rv-card-coins i::before{bottom:9px;left:9px;border-right:0;border-top:0;border-radius:0 0 0 5px}
  .rv-card-coins i::after{bottom:9px;right:9px;border-left:0;border-top:0;border-radius:0 0 5px 0}
  .rv-card-corps{padding:11px 12px 14px}
  .rv-card-nom{font-weight:650;font-size:13.5px;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.32;min-height:2.64em;color:#16231F}
  .rv-card-prix{font-weight:800;font-size:15px;color:${c};letter-spacing:-.01em}
  .rv-card-badge{z-index:4}

  /* --- Ambiances --- */
  .rv-card-verre{background:linear-gradient(170deg,#ffffff 0%,#f6faf8 100%);border:1px solid rgba(22,35,31,.07);box-shadow:0 10px 28px rgba(16,31,26,.07),inset 0 1px 0 rgba(255,255,255,.9)}
  .rv-card-neon{background:linear-gradient(170deg,#101a15,#0a110d);border:1px solid ${c}55;box-shadow:0 0 0 1px rgba(255,255,255,.03),0 14px 34px rgba(0,0,0,.45)}
  .rv-card-neon .rv-card-media{background:linear-gradient(160deg,#16211b,#0d1611)}
  .rv-card-neon .rv-card-nom{color:#eaf3ee}
  .rv-card-neon .rv-card-prix{color:#fff}
  .rv-card-minimal{background:transparent;border:0;box-shadow:none}
  .rv-card-minimal .rv-card-corps{padding:10px 2px 6px}
  .rv-card-classique{background:#fff;border:1px solid #ECE8DC;box-shadow:0 2px 8px rgba(22,35,31,.04)}

  @media (hover:hover){
    .rv-card:hover .rv-card-shine{left:135%}
    .rv-card:hover .rv-card-coins::before,.rv-card:hover .rv-card-coins::after,.rv-card:hover .rv-card-coins i::before,.rv-card:hover .rv-card-coins i::after{opacity:${cfg.decor ? 1 : 0}}
    .rv-card:hover .rv-card-coins::before{transform:translate(-3px,-3px)}
    .rv-card:hover .rv-card-coins::after{transform:translate(3px,-3px)}
    .rv-card:hover .rv-card-coins i::before{transform:translate(-3px,3px)}
    .rv-card:hover .rv-card-coins i::after{transform:translate(3px,3px)}
    .rv-card:hover .rv-card-halo{transform:translate(-50%,-50%) scale(1.15)}
    .rv-anim-lift:hover{transform:translateY(-8px);box-shadow:0 22px 46px rgba(16,31,26,.17)}
    .rv-anim-lift:hover .rv-card-media>img{transform:scale(1.06)}
    .rv-anim-zoom:hover .rv-card-media>img{transform:scale(1.1)}
    .rv-anim-tilt:hover{transform:perspective(900px) rotateX(4deg) rotateY(-5deg) translateY(-6px);box-shadow:0 26px 50px rgba(16,31,26,.2)}
    .rv-anim-tilt:hover .rv-card-media>img{transform:scale(1.05)}
    .rv-card-neon.rv-anim-lift:hover,.rv-card-neon.rv-anim-tilt:hover{box-shadow:0 0 0 1px ${c}88,0 18px 44px ${c}40}
  }
  @media (max-width:640px){
    .rv-card-corps{padding:9px 10px 12px}
    .rv-card-nom{font-size:12.5px;margin-bottom:4px}
    .rv-card-prix{font-size:13.5px}
    .rv-card-pct{font-size:9.5px;padding:2px 6px}
    .rv-card-coins::before,.rv-card-coins::after,.rv-card-coins i::before,.rv-card-coins i::after{width:11px;height:11px;top:auto;bottom:auto}
    .rv-card-coins::before{top:7px;left:7px}
    .rv-card-coins::after{top:7px;right:7px}
    .rv-card-coins i::before{bottom:7px;left:7px}
    .rv-card-coins i::after{bottom:7px;right:7px}
  }
  @media (prefers-reduced-motion: reduce){ .rv-card,.rv-card *{transition:none !important} }
  `;
}
function injecterCssCartes(couleur) {
  if (typeof document === "undefined") return;
  const css = cssCartesProduits(STYLE_CARTE, couleur);
  let el = document.getElementById("rv-css-cartes");
  if (!el) { el = document.createElement("style"); el.id = "rv-css-cartes"; document.head.appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

function CarteProduit({ p, couleur, devise, onOpen, langue, onAjouterAuPanier, estAzali }) {
  const t = creerTraducteur(langue);
  const aDesVraisAvis = p.note_moyenne != null && Number(p.nb_avis) > 0;
  useEffect(() => { injecterCssCartes(couleur); }, [couleur]);
  const classes = `rv-shop-card rv-card rv-card-${STYLE_CARTE.style} rv-anim-${STYLE_CARTE.anim}`;
  // Cadrage intelligent de la photo : une photo proche du format de la carte remplit la carte
  // (« cover », pas de bandes vides) ; une photo très allongée reste entière (« contain »)
  // pour ne jamais couper le produit. Réglable dans le Store Builder (Cartes produits).
  const [ajuste, setAjuste] = useState(STYLE_CARTE.fit === "cover");
  const imgRef = useRef(null);
  const evaluerPhoto = (el) => {
    if (STYLE_CARTE.fit !== "auto" || !el || !el.naturalWidth || !el.naturalHeight) return;
    const r = el.naturalWidth / el.naturalHeight;
    const cible = STYLE_CARTE.ratio === "portrait" ? 0.8 : 1;
    setAjuste(r >= cible * 0.72 && r <= cible * 1.4);
  };
  useEffect(() => { const el = imgRef.current; if (el && el.complete) evaluerPhoto(el); }, [p.photo_url]);
  // Vrai prix barré (jamais inventé) : affiché seulement si le marchand a renseigné un prix barré
  // supérieur au prix de vente.
  const prixVenteNum = Number(p.prix_vente), prixBarreNum = Number(p.prix_barre);
  const remisePct = prixBarreNum > prixVenteNum && prixVenteNum > 0 ? Math.round((1 - prixVenteNum / prixBarreNum) * 100) : 0;
  return (
    <div onClick={() => onOpen(p)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen(p); } }} className={classes} role="button" tabIndex={0} aria-label={p.produit_nom}>
      <div className="rv-card-media">
        <div className="rv-card-halo" />
        {p.photo_url ? (
          <img
            ref={imgRef}
            src={urlImageLegere(p.photo_url, 520)}
            alt={p.produit_nom}
            loading="lazy"
            decoding="async"
            className={ajuste ? "rv-fit-cover" : undefined}
            onLoad={(e) => evaluerPhoto(e.currentTarget)}
            onError={(e) => {
              // La version allégée a échoué : on retente une fois avec la photo d'origine.
              if (e.target.dataset.rvOrig !== "1" && e.target.src !== p.photo_url) { e.target.dataset.rvOrig = "1"; e.target.src = p.photo_url; }
              else e.target.style.display = "none";
            }}
          />
        ) : (
          <div className="rv-card-vide">📦</div>
        )}
        <span className="rv-card-shine" />
        <span className="rv-card-coins"><i /></span>
        {estAzali && (
          <span className="rv-card-badge" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>♡</span>
        )}
        {p.nb_ventes > 0 && (
          <div className="rv-card-badge" style={{ position: "absolute", top: 7, left: 7, background: "rgba(138,100,18,0.95)", color: "white", fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999 }}>
            🔥 {t("bestSeller")}
          </div>
        )}
        {p.est_nouveau && (
          <div className="rv-card-badge" style={{ position: "absolute", top: 7, right: estAzali ? 36 : 7, background: "rgba(26,122,60,0.95)", color: "white", fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999 }}>
            {t("nouveauBadge")}
          </div>
        )}
        {p.stock_initial != null && Number(p.stock_initial) > 0 && Number(p.stock_initial) <= 5 && (
          <div className="rv-card-badge" style={{ position: "absolute", bottom: 7, left: 7, background: "rgba(214,73,51,0.94)", color: "white", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999 }}>
            ⚡ {p.stock_initial} {t("restants")}
          </div>
        )}
        {p.livraison_gratuite && !(p.stock_initial != null && Number(p.stock_initial) > 0 && Number(p.stock_initial) <= 5) && (
          <div className="rv-card-badge" style={{ position: "absolute", bottom: 7, left: 7, background: "rgba(31,157,110,0.94)", color: "white", fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999 }}>
            🎁 {t("livraisonGratuiteCourt")}
          </div>
        )}
        {onAjouterAuPanier && (
          <button
            onClick={(e) => { e.stopPropagation(); onAjouterAuPanier(p); }}
            aria-label={t("ajouterPanier")}
            className="rv-card-badge"
            style={{ position: "absolute", bottom: 7, right: 7, width: 38, height: 38, borderRadius: "50%", ...styleBouton(couleur), border: "2px solid rgba(255,255,255,0.9)", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.28)" }}
          >
            🛒
          </button>
        )}
      </div>
      <div className="rv-card-corps">
        {estAzali && <div style={{ fontSize: 8.5, fontWeight: 700, color: "#8A9089", letterSpacing: "0.3px", marginBottom: 2 }}>AZALIEXPRESS®</div>}
        <div className="rv-card-nom">{p.produit_nom}</div>
        {(aDesVraisAvis || estAzali) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ color: "#e8920a", fontSize: 11.5 }}>{aDesVraisAvis ? "★".repeat(Math.round(p.note_moyenne)) + "☆".repeat(5 - Math.round(p.note_moyenne)) : "★★★★★"}</span>
            <span style={{ fontSize: 10.5, color: "#8A9089" }}>({aDesVraisAvis ? p.nb_avis : "4.7"})</span>
          </div>
        )}
        <div className="rv-card-prix rv-card-prix-ligne">
          <span>{montantAffiche(Number(p.prix_vente))} {devise}</span>
          {remisePct >= 1 && <s className="rv-card-barre">{montantAffiche(prixBarreNum)}</s>}
          {remisePct >= 1 && <span className="rv-card-pct">-{remisePct}%</span>}
        </div>
        {estAzali && <div style={{ fontSize: 9.5, color: "#D64933", fontWeight: 700, marginTop: 3 }}>⚡ Stock limité</div>}
      </div>
    </div>
  );
}

function PiedPageAzaliExpress({ entreprise, onOuvrirPolitique, onOuvrirPagePerso, collectionsManuelles = [], onNaviguerVersCollection }) {
  const anneeEnCours = new Date().getFullYear();
  const t = creerTraducteur(entreprise.langue);
  const reseaux = [
    { url: entreprise.facebookUrl, icone: "📘" },
    { url: entreprise.instagramUrl, icone: "📷" },
    { url: entreprise.tiktokUrl, icone: "🎵" },
  ].filter((r) => r.url);
  // Pages libres importées/créées côté admin, positionnées en pied de page. Tant qu'aucune
  // n'a été importée, on garde l'ancienne liste statique (texte indicatif, non cliquable)
  // pour ne rien casser visuellement.
  const pagesFooter = Array.isArray(entreprise.pagesPersonnalisees)
    ? entreprise.pagesPersonnalisees.filter((p) => (p.emplacement || "footer") === "footer")
    : [];

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
              style={{ padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 16, minWidth: 220 }}
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
                <a href={`tel:${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`} style={{ color: "#9aa0a6", textDecoration: "none" }}>{entreprise.whatsapp}</a>
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
              <a href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "inherit", textDecoration: "none" }}>
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
        {(pagesFooter.length > 0
          ? pagesFooter.map((p) => ({ label: p.titre, onClick: () => onOuvrirPagePerso?.(p) }))
          : ["Politique de confidentialité", "Conditions d'utilisation", "Politique de remboursement", "Politique de livraison", "Mentions légales", "FAQ", "Contact"].map((lien) => ({ label: lien, onClick: undefined }))
        ).map((lien, i, arr) => (
          <span key={lien.label} onClick={lien.onClick} style={{ fontSize: 11, color: "#9aa0a6", padding: "3px 8px", borderRight: i < arr.length - 1 ? "1px solid #3a3a3a" : "none", whiteSpace: "nowrap", cursor: lien.onClick ? "pointer" : "default" }}>{lien.label}</span>
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

function PiedDePage({ entreprise, onOuvrirPolitique, onOuvrirPagePerso, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, footerConfig, biensLocation = [] }) {
  if (entreprise.slug === "luxury-car") {
    return <PiedPageLuxuryCar entreprise={entreprise} biensLocation={biensLocation} />;
  }
  if (entreprise.slug === "azaliexpress") {
    return (
      <PiedPageAzaliExpress
        entreprise={entreprise}
        onOuvrirPolitique={onOuvrirPolitique}
        onOuvrirPagePerso={onOuvrirPagePerso}
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
  // Couleurs du pied de page : une couleur saisie sans « # » est réparée ; sur un fond CLAIR, le texte
  // devient sombre (avant : texte blanc sur fond clair = pied de page invisible).
  const bgFooter = couleurCssSure(footerConfig?.bgColor, "#16231F");
  const fondClair = estClaire(bgFooter);
  let texteFooter = couleurCssSure(footerConfig?.textColor, "") || (fondClair ? "#16231F" : "rgba(255,255,255,0.75)");
  const contrasteFooter = ratioContraste(texteFooter, bgFooter);
  if (contrasteFooter != null && contrasteFooter < 2.2) texteFooter = texteSurFond(bgFooter);
  const accent = footerConfig?.accent || "#1F9D6E";
  const ambiance = footerConfig?.ambiance || "degrade"; // sobre | degrade | neon
  const colMobile = Number(footerConfig?.colonnesMobile) === 1 ? 1 : 2;
  const colonnesPerso = Array.isArray(footerConfig?.colonnes) ? footerConfig.colonnes.filter((c) => c.titre) : [];
  // Pages libres importées/créées côté admin (À propos, Mentions légales, CGV, FAQ...),
  // positionnées automatiquement en pied de page (sauf celles marquées "aucun").
  const pagesFooter = Array.isArray(entreprise.pagesPersonnalisees)
    ? entreprise.pagesPersonnalisees.filter((p) => (p.emplacement || "footer") === "footer")
    : [];

  const fondFooter = ambiance === "sobre"
    ? bgFooter
    : `radial-gradient(1200px 400px at 15% -10%, ${accent}26, transparent 60%), linear-gradient(180deg, ${bgFooter} 0%, rgba(0,0,0,${fondClair ? "0.05" : "0.55"}) 100%), ${bgFooter}`;

  return (
    <div className={`rv-ft rv-ft-${ambiance}`} style={{ background: fondFooter, color: texteFooter, marginTop: 30, position: "relative", overflow: "hidden", "--ft-fg": fondClair ? "#16231F" : "#fff", "--ft-ov": fondClair ? "0,0,0" : "255,255,255", "--ft-cta-bg": fondClair ? "#16231F" : "#fff", "--ft-cta-fg": fondClair ? "#fff" : "#0f1a15" }}>
      <style>{`
        @keyframes rvFtLine{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        .rv-ft{position:relative}
        .rv-ft-top{height:2px;background:linear-gradient(90deg,transparent,${accent},#7c5cff,${accent},transparent);background-size:200% 100%;animation:rvFtLine 5s linear infinite}
        .rv-ft-sobre .rv-ft-top{display:none}
        .rv-ft-neon::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.10;background-image:linear-gradient(rgba(var(--ft-ov),.4) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--ft-ov),.4) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 0%,#000 5%,transparent 70%);mask-image:radial-gradient(ellipse at 50% 0%,#000 5%,transparent 70%)}
        .rv-ft-in{max-width:1100px;margin:0 auto;position:relative;z-index:2}
        .rv-ft-badges{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:24px 18px}
        .rv-ft-badge{display:flex;align-items:center;gap:11px;background:rgba(var(--ft-ov),.055);border:1px solid rgba(var(--ft-ov),.08);border-radius:14px;padding:12px 13px;transition:background .3s,transform .3s,border-color .3s}
        .rv-ft-badge b{font-size:12.5px;font-weight:700;color:var(--ft-fg);line-height:1.25}
        .rv-ft-badge span.ic{font-size:21px;flex-shrink:0;line-height:1}
        .rv-ft-cols{display:flex;flex-wrap:wrap;gap:30px 48px;padding:30px 18px;align-items:flex-start}
        .rv-ft-cols>*{flex:1 1 170px;min-width:150px}
        .rv-ft-cols>.rv-ft-marque{flex:1.7 1 300px}
        .rv-ft-titre{display:flex;flex-direction:column;gap:7px;font-weight:800;font-size:11.5px;color:var(--ft-fg);text-transform:uppercase;letter-spacing:.09em;margin-bottom:12px}
        .rv-ft-titre em{display:block;width:26px;height:2px;border-radius:2px;background:${accent};font-style:normal}
        .rv-ft-liens{display:flex;flex-direction:column}
        .rv-ft-lien{background:none;border:none;color:inherit;opacity:.78;font-size:13px;text-align:left;cursor:pointer;padding:7px 0;text-decoration:none;display:block;line-height:1.35;transition:opacity .2s,transform .2s,color .2s}
        .rv-ft-marque-nom{font-weight:800;font-size:17px;color:var(--ft-fg);letter-spacing:-.01em}
        .rv-ft-desc{font-size:13px;line-height:1.6;opacity:.8;margin-bottom:15px;max-width:340px}
        .rv-ft-soc{display:flex;gap:9px;flex-wrap:wrap}
        .rv-ft-soc a{width:38px;height:38px;border-radius:12px;background:rgba(var(--ft-ov),.08);border:1px solid rgba(var(--ft-ov),.1);display:flex;align-items:center;justify-content:center;font-size:16px;text-decoration:none;transition:transform .25s,background .25s}
        .rv-ft-news{padding:24px 18px;border-top:1px solid rgba(var(--ft-ov),.1);border-bottom:1px solid rgba(var(--ft-ov),.1);text-align:center}
        .rv-ft-cta{display:inline-flex;align-items:center;gap:8px;background:var(--ft-cta-bg);color:var(--ft-cta-fg);border-radius:999px;padding:12px 26px;font-size:13px;font-weight:800;text-decoration:none;box-shadow:0 12px 30px rgba(0,0,0,.3);transition:transform .25s,box-shadow .25s}
        .rv-ft-pay{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:18px 18px 0}
        .rv-ft-pay span{background:rgba(var(--ft-ov),.08);border:1px solid rgba(var(--ft-ov),.08);border-radius:8px;padding:7px 12px;font-size:11.5px;font-weight:600}
        .rv-ft-bas{border-top:1px solid rgba(var(--ft-ov),.1);padding:18px;text-align:center;font-size:11.5px;opacity:.5;line-height:1.5}
        @media (hover:hover){
          .rv-ft-badge:hover{background:rgba(var(--ft-ov),.1);border-color:${accent}66;transform:translateY(-2px)}
          .rv-ft-lien:hover{opacity:1;color:var(--ft-fg);transform:translateX(3px)}
          .rv-ft-soc a:hover{background:${accent};transform:translateY(-3px)}
          .rv-ft-cta:hover{transform:translateY(-2px);box-shadow:0 18px 40px rgba(0,0,0,.4)}
        }
        /* ---- Mobile : deux colonnes compactes au lieu d'une longue liste ---- */
        @media (max-width:760px){
          .rv-ft-badges{grid-template-columns:1fr 1fr;gap:8px;padding:18px 14px}
          .rv-ft-badge{padding:10px 11px;gap:9px;border-radius:12px}
          .rv-ft-badge b{font-size:11.5px}
          .rv-ft-badge span.ic{font-size:18px}
          .rv-ft-cols{display:grid;grid-template-columns:repeat(${colMobile},minmax(0,1fr));gap:20px 14px;padding:22px 14px}
          .rv-ft-cols>*{min-width:0}
          .rv-ft-marque{grid-column:1/-1}
          .rv-ft-desc{font-size:12.5px;margin-bottom:13px;max-width:none}
          .rv-ft-titre{font-size:10.5px;margin-bottom:9px}
          .rv-ft-lien{font-size:12.5px;padding:6px 0}
          .rv-ft-news{padding:20px 14px}
          .rv-ft-cta{width:100%;justify-content:center;max-width:320px}
        }
        @media (max-width:360px){ .rv-ft-badges{grid-template-columns:1fr} }
        @media (prefers-reduced-motion: reduce){ .rv-ft-top{animation:none} }
      `}</style>

      <div className="rv-ft-top" />

      <div className="rv-ft-in rv-ft-badges">
        {[
          { icone: "🚚", texte: t("livraisonRapide") },
          { icone: "💵", texte: t("paiementLivraison") },
          { icone: "🔄", texte: t("retourFacile") },
          { icone: "🛡️", texte: t("achatSecurise") },
        ].map((badge, i) => (
          <div key={i} className="rv-ft-badge">
            <span className="ic">{badge.icone}</span>
            <b>{badge.texte}</b>
          </div>
        ))}
      </div>

      <div className="rv-ft-in rv-ft-cols">
        <div className="rv-ft-marque">
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
            {entreprise.logo && (
              <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,0.07)" }} onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div className="rv-ft-marque-nom">{entreprise.nom}</div>
          </div>
          {entreprise.description && <div className="rv-ft-desc">{entreprise.description}</div>}
          {reseaux.length > 0 && (
            <div className="rv-ft-soc">
              {reseaux.map((r) => (
                <a key={r.nom} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={r.nom}>{r.icone}</a>
              ))}
            </div>
          )}
        </div>

        {footerConfig?.boutiqueVisible !== false && (aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0) && onNaviguerVersCollection && (
          <div>
            <div className="rv-ft-titre">{t("boutique")}<em /></div>
            <div className="rv-ft-liens">
              <button className="rv-ft-lien" onClick={() => onNaviguerVersCollection(null)}>{t("accueil")}</button>
              {aDesBestSellers && <button className="rv-ft-lien" onClick={() => onNaviguerVersCollection("bestseller")}>{t("meilleuresVentes")}</button>}
              {aDesNouveautes && <button className="rv-ft-lien" onClick={() => onNaviguerVersCollection("nouveautes")}>{t("nouveautes")}</button>}
              {collectionsManuelles.map((col) => (
                <button key={col.id} className="rv-ft-lien" onClick={() => onNaviguerVersCollection(`manuelle-${col.id}`)}>{col.nom}</button>
              ))}
            </div>
          </div>
        )}

        {(entreprise.politiqueLivraison || entreprise.politiqueRetours || entreprise.politiqueConfidentialite || pagesFooter.length > 0) && (
          <div>
            <div className="rv-ft-titre">{t("informations")}<em /></div>
            <div className="rv-ft-liens">
              {entreprise.politiqueLivraison && <button className="rv-ft-lien" onClick={() => onOuvrirPolitique("livraison")}>{t("politiqueLivraison")}</button>}
              {entreprise.politiqueRetours && <button className="rv-ft-lien" onClick={() => onOuvrirPolitique("retours")}>{t("politiqueRetours")}</button>}
              {entreprise.politiqueConfidentialite && <button className="rv-ft-lien" onClick={() => onOuvrirPolitique("confidentialite")}>{t("confidentialite")}</button>}
              {pagesFooter.map((p) => (
                <button key={p.slug} className="rv-ft-lien" onClick={() => onOuvrirPagePerso?.(p)}>{p.titre}</button>
              ))}
            </div>
          </div>
        )}

        {colonnesPerso.map((col) => (
          <div key={col.id}>
            <div className="rv-ft-titre">{col.titre}<em /></div>
            <div className="rv-ft-liens">
              {(col.liens || []).filter((l) => l.label).map((l, i) => (
                <a
                  key={i}
                  className="rv-ft-lien"
                  href={l.href || "#"}
                  onClick={(e) => gererLienBoutique(e, l.href, { entreprise, onNaviguerVersCollection, onOuvrirPagePerso })}
                  target={l.href && l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href && l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        ))}

        {entreprise.whatsapp && (
          <div>
            <div className="rv-ft-titre">{t("contact")}<em /></div>
            <div className="rv-ft-liens">
              <a
                className="rv-ft-lien"
                href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 {t("discuterWhatsapp")}
              </a>
            </div>
          </div>
        )}
      </div>

      {footerConfig?.newsletterActif && (
        <div className="rv-ft-news">
          <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--ft-fg)" }}>📩 {t("resteInforme")}</div>
          {footerConfig.newsletterTexte && <div style={{ fontSize: 12.5, opacity: 0.75, margin: "7px auto 14px", maxWidth: 420, lineHeight: 1.5 }}>{footerConfig.newsletterTexte}</div>}
          {entreprise.whatsapp && (
            <a
              className="rv-ft-cta"
              href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}?text=${encodeURIComponent(t("texteInscriptionNewsletter"))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("sInscrire")}
            </a>
          )}
        </div>
      )}

      {Array.isArray(footerConfig?.paiements) && footerConfig.paiements.filter(Boolean).length > 0 && (
        <div className="rv-ft-pay">
          {footerConfig.paiements.filter(Boolean).map((p, i) => <span key={i}>{p}</span>)}
        </div>
      )}

      {footerConfig?.backToTop !== false && (
        <div style={{ textAlign: "center", padding: "18px 0 4px" }}>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ background: "rgba(var(--ft-ov),0.08)", border: "1px solid rgba(var(--ft-ov),0.15)", color: "inherit", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            {t("retourEnHaut")}
          </button>
        </div>
      )}

      <div className="rv-ft-bas">
        © {anneeEnCours} {entreprise.nom}{!entreprise.marqueBlanche && ` — ${t("proposePar")}`}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" };

// ---------------------------------------------------------------------------
// PAGE PRODUIT « style Copyfy » — briques réutilisables
// ---------------------------------------------------------------------------

// Sépare la description riche en deux : la liste de « points forts » (affichée en cases
// à cocher sous le titre) et le reste (affiché dans l'accordéon « Description »).
// 1) Si le marchand a inséré un bloc « ⭐ Points forts » dans l'éditeur, c'est celui-là.
// 2) Sinon, on prend la première liste à puces du texte (2 à 8 lignes courtes).
// Rien n'est supprimé : la liste est seulement déplacée vers le haut de la page.
function extraireStructureDescription(html) {
  const propre = nettoyerHTML(html);
  if (!propre) return { points: [], reste: "" };
  const conteneur = document.createElement("div");
  conteneur.innerHTML = propre;
  const texteLi = (li) => (li.textContent || "").replace(/\s+/g, " ").trim();
  const itemsDe = (l) => Array.from(l.children).filter((c) => c.tagName === "LI");
  const listes = Array.from(conteneur.querySelectorAll("ul, ol"));
  let choisie = listes.find((l) => l.getAttribute("data-rv") === "points-forts");
  if (!choisie) {
    choisie = listes.find((l) => {
      if (l.parentElement !== conteneur) return false;
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
  choisie.remove();
  return { points, reste: conteneur.innerHTML };
}

function descriptionAUnContenu(html) {
  if (!html) return false;
  return /<(img|video)\b/i.test(html) || html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

function PointsFortsListe({ points, couleur }) {
  if (!points || points.length === 0) return null;
  const teinte = couleurTexteLisible(couleur);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 16px" }}>
      {points.map((tx, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#F1F2EF", borderRadius: 8, padding: "9px 12px", fontSize: 13.5, lineHeight: 1.45, color: "#16231F" }}>
          <span aria-hidden="true" style={{ flexShrink: 0, width: 18, height: 18, marginTop: 1, borderRadius: 4, border: `1.5px solid ${teinte}`, color: teinte, background: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, lineHeight: 1 }}>✓</span>
          <span>{tx}</span>
        </div>
      ))}
    </div>
  );
}

// Galerie : grande photo avec flèches + balayage au doigt, et miniatures cliquables dessous.
function GaleriePhotosProduit({ photos, alt, couleur, index, setIndex, t }) {
  const departX = useRef(null);
  const nb = photos.length;
  const i = nb > 0 ? Math.min(Math.max(index, 0), nb - 1) : 0;
  const aller = (n) => { if (nb > 1) setIndex((n + nb) % nb); };
  const photo = photos[i];
  const boutonFleche = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.88)", color: "#16231F", fontSize: 18, lineHeight: 1, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, touchAction: "manipulation" };
  return (
    <>
      <div
        className="rv-shop-produit-photo"
        style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden", touchAction: "pan-y" }}
        onTouchStart={(e) => { departX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (departX.current == null) return;
          const dx = e.changedTouches[0].clientX - departX.current;
          departX.current = null;
          if (Math.abs(dx) > 45) aller(i + (dx < 0 ? 1 : -1));
        }}
      >
        {photo ? (
          <img
            src={urlImageLegere(photo, 1000)}
            alt={alt}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>📦</div>
        )}
        {nb > 1 && (
          <>
            <button type="button" aria-label={t("photoPrecedente")} onClick={() => aller(i - 1)} style={{ ...boutonFleche, left: 10 }}>‹</button>
            <button type="button" aria-label={t("photoSuivante")} onClick={() => aller(i + 1)} style={{ ...boutonFleche, right: 10 }}>›</button>
          </>
        )}
      </div>
      {nb > 1 && (
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto", justifyContent: nb <= 5 ? "center" : "flex-start", WebkitOverflowScrolling: "touch" }}>
          {photos.map((url, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setIndex(k)}
              style={{ flexShrink: 0, width: 62, height: 62, borderRadius: 8, overflow: "hidden", padding: 0, border: k === i ? `2px solid ${couleur}` : "1px solid #ECE8DC", opacity: k === i ? 1 : 0.8, cursor: "pointer", background: "none" }}
            >
              <img src={urlImageLegere(url, 160)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Accordéon « Description » (ouvert par défaut, comme sur les pages Copyfy).
function AccordeonDescription({ titre, children }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <div style={{ borderTop: "1px solid #ECE8DC", borderBottom: "1px solid #ECE8DC", marginBottom: 26 }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "16px 2px", fontSize: 16, fontWeight: 700, color: "#16231F", cursor: "pointer", textAlign: "left" }}
      >
        <span>{titre}</span>
        <span aria-hidden="true" style={{ fontSize: 20, fontWeight: 400, color: "#6B7168", lineHeight: 1 }}>{ouvert ? "−" : "+"}</span>
      </button>
      {ouvert && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

// Barre « Commander » collée en bas de l'écran. Elle se range d'elle-même tant que le gros
// bouton de la page (id="rv-cta-en-ligne") est visible, pour ne pas avoir deux boutons à l'écran.
function BarreCtaCollante({ children }) {
  const [boutonPageVisible, setBoutonPageVisible] = useState(false);
  useEffect(() => {
    const cible = document.getElementById("rv-cta-en-ligne");
    if (!cible || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(([e]) => setBoutonPageVisible(e.isIntersecting), { threshold: 0.6 });
    obs.observe(cible);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      className="rv-shop-cta-bar"
      style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "14px 18px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)", zIndex: 20, transform: boutonPageVisible ? "translateY(115%)" : "translateY(0)", transition: "transform .25s ease" }}
    >
      {children}
    </div>
  );
}

function BadgePersonnesEnLigne({ nb, style }) {
  if (nb < 2) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "#8A6412", ...style }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F9D6E", flexShrink: 0 }} />
      {nb} personne{nb > 1 ? "s" : ""} en train de regarder cette boutique
    </div>
  );
}

function BulleWhatsApp({ whatsapp, codePays, messageDefaut, surCtaBar }) {
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
            href={`https://wa.me/${formaterTelWhatsapp(whatsapp, codePays)}?text=${encodeURIComponent(messageDefaut || "Bonjour, j'ai une question.")}`}
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
        <div style={{ fontSize: 13, fontWeight: 800, color: couleur, marginTop: 5 }}>{montantAffiche(Number(p.prix_vente))} {devise}</div>
        <div style={{ fontSize: 9.5, color: "#D64933", fontWeight: 700, marginTop: 3 }}>⚡ Stock limité</div>
        {onAjouterAuPanier && (
          <button
            onClick={(e) => { e.stopPropagation(); onAjouterAuPanier(p); }}
            style={{ width: "100%", marginTop: 7, ...styleBouton(couleur), border: "none", borderRadius: 7, padding: "7px 0", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}
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
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#1a7a3c" }}>{montantAffiche(Number(s.prix))} {devise}</div>
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
    return produits.filter((p) => (col.produitIds || []).includes(p.produit_id));
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
              href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "#25d366", color: "white", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}
            >
              💬 Écrire sur WhatsApp
            </a>
            <a
              href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`}
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

// ===== TUILES DE COLLECTIONS =====
// Une tuile = une grande image nette (format 4:5, jamais un bandeau écrasé), le nom de la collection
// lisible par-dessus (dégradé sombre en bas) et le nombre d'articles. Ordre de choix de l'image :
//   1. l'image choisie par le marchand pour cette collection (Store Builder → Réglages → Collections),
//   2. l'image enregistrée sur la collection elle-même,
//   3. la photo d'un produit de la collection (mode « Photo »), ou une mosaïque de 4 photos (mode « Mosaïque »),
//   4. à défaut (ou si l'image ne charge pas) : un dégradé aux couleurs de la boutique avec l'initiale.
function imageCollection(c, config) {
  const perso = config && config.collectionsImages && config.collectionsImages[c.id];
  const v = String(perso || c.image || "").trim();
  return v && /^(https?:)?\/\/|^data:image\//i.test(v) ? v : "";
}
function CollectionTuile({ c, produitsCol, config, couleur, onOpen, mode, classe = "", style }) {
  const [casse, setCasse] = useState(false);
  const photos = (produitsCol || []).map((p) => p.photo_url).filter(Boolean);
  const dediee = imageCollection(c, config);
  const modeMosaique = mode === "mosaique" && !dediee && photos.length >= 2;
  const une = dediee || photos[0] || "";
  const nb = (produitsCol || []).length;
  const nom = joliNomCollection(c.nom);
  const fond = `linear-gradient(145deg, ${couleur}, ${couleur}aa 55%, #0b1a12)`;
  const image = modeMosaique && !casse ? (
    <span className="rv-coll-mosaique">
      {photos.slice(0, 4).map((u, i) => <img key={i} src={urlImageLegere(u, 320)} alt="" loading="lazy" decoding="async" onError={() => setCasse(true)} />)}
    </span>
  ) : une && !casse ? (
    <img className="rv-coll-img" src={urlImageLegere(une, 700)} alt="" loading="lazy" decoding="async" onError={() => setCasse(true)} />
  ) : (
    <span className="rv-coll-initiale" aria-hidden="true">{(nom || "?").trim().charAt(0).toUpperCase()}</span>
  );
  if (mode === "ronds") {
    return (
      <button type="button" className="rv-coll-rond" onClick={onOpen} aria-label={`${nom} — ${nb} article${nb > 1 ? "s" : ""}`}>
        <span className="rv-coll-rond-img" style={{ background: fond, boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${couleur}` }}>{image}</span>
        <span className="rv-coll-rond-nom">{nom}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`rv-coll-tuile ${classe}`} style={style} onClick={onOpen} aria-label={`${nom} — ${nb} article${nb > 1 ? "s" : ""}`}>
      <span className="rv-coll-fond" style={{ background: fond }} />
      {image}
      <span className="rv-coll-voile" />
      <span className="rv-coll-texte">
        <span className="rv-coll-nom">{nom}</span>
        <span className="rv-coll-nb">{nb} article{nb > 1 ? "s" : ""}</span>
      </span>
      <span className="rv-coll-fleche" aria-hidden="true">→</span>
    </button>
  );
}
// Mise en page « vitrine de marque » : une grande tuile mise en avant + des tuiles plus petites qui
// remplissent la grille sans trou (comme sur les sites de mode et de beauté). Trois autres styles au
// choix dans le Store Builder : cercles (catégories), cartes photo, mosaïque.
// En-tête « éditorial » d'une collection mise en avant : titre net, courte accroche et lien
// « Voir tout », puis directement les produits. Remplace la grande bannière vide (titre + un
// chiffre) : une vraie boutique de marque montre ses produits, pas un grand aplat de couleur.
// Utilisé à l'identique par la boutique publique et par l'aperçu du Store Builder.
const TEXTE_COLLECTION_DEFAUT = "Découvre notre sélection complète dans cette collection.";
export function EnteteCollectionVedette({ titre, texte, label, nb, couleur, bouton, onOpen }) {
  const lab = String(label || "").trim();
  const labelUtile = lab && lab.toUpperCase() !== "COLLECTION" ? lab : "";
  const txt = String(texte || "").trim();
  const texteUtile = txt && txt !== TEXTE_COLLECTION_DEFAUT ? txt : "";
  const accent = couleurTexteLisible(couleur);
  return (
    <div className="rv-fcx">
      <style>{`
        .rv-fcx{container-type:inline-size;padding:2px 0 clamp(14px,2.4vw,22px)}
        .rv-fcx-in{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 20px;flex-wrap:wrap}
        .rv-fcx-txt{min-width:0;flex:1 1 320px}
        .rv-fcx-label{display:block;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:8px}
        .rv-fcx-titre{margin:0;font-size:clamp(22px,4.4vw,34px);line-height:1.1;font-weight:850;letter-spacing:-.02em;color:#16231F;overflow-wrap:anywhere}
        .rv-fcx-desc{margin:8px 0 0;font-size:clamp(13px,1.9vw,15px);line-height:1.55;color:#5c6a62;max-width:560px}
        .rv-fcx-lien{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0;background:none;border:0;border-bottom:2px solid currentColor;font-size:13.5px;font-weight:800;cursor:pointer;touch-action:manipulation;font-family:inherit;line-height:1}
        .rv-fcx-lien span{transition:transform .2s}
        .rv-fcx-lien:hover span{transform:translateX(4px)}
        .rv-fcx-lien:focus-visible{outline:3px solid currentColor;outline-offset:4px}
        .rv-fcx-trait{display:block;width:44px;height:3px;border-radius:3px;margin-top:14px}
        @media (prefers-reduced-motion:reduce){.rv-fcx-lien span{transition:none}}
      `}</style>
      <div className="rv-fcx-in">
        <div className="rv-fcx-txt">
          {labelUtile ? <span className="rv-fcx-label" style={{ color: accent }}>{labelUtile}</span> : null}
          <h3 className="rv-fcx-titre">{titre}</h3>
          {texteUtile ? <p className="rv-fcx-desc">{texteUtile}</p> : null}
          <span className="rv-fcx-trait" style={{ background: accent }} />
        </div>
        <button type="button" className="rv-fcx-lien" style={{ color: accent }} onClick={onOpen}>
          {bouton || "Voir tout"}{nb > 0 ? ` (${nb})` : ""} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

export function GrilleCollections({ collections, produitsDe, config, couleur, onOpen, max = 8 }) {
  const mode = ["editorial", "ronds", "photo", "mosaique"].includes(config?.collectionTilesStyle) ? config.collectionTilesStyle : "editorial";
  const liste = (collections || []).slice(0, max);
  const n = liste.length;
  // Emplacement de chaque tuile en mode « vitrine » : [colonnes, lignes] sur grand écran, et si elle
  // prend toute la largeur sur téléphone (2 colonnes).
  const place = liste.map((_, i) => {
    let c = 1, r = 1;
    if (n === 1) { c = 4; r = 2; }
    else if (n === 2) { c = 2; r = 2; }
    else if (i === 0) { c = 2; r = 2; }
    else {
      const m = n - 1, k = i - 1;
      if (m === 1) { c = 2; r = 2; }
      else if (m === 2) { c = 2; r = 1; }
      else if (m === 3) { c = k === 2 ? 2 : 1; }
      else if (k >= 4) { const extra = m - 4, rangee = k - 4, reste = extra % 4; if (reste > 0 && rangee === extra - 1) c = 5 - reste; }
    }
    const large = i === 0 || ((n - 1) % 2 === 1 && i === n - 1);
    return { c, r, large };
  });
  return (
    <>
      <style>{`
        .rv-coll{container-type:inline-size;width:100%}
        .rv-coll button{font-family:inherit}
        .rv-coll-grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        @container (min-width:640px){.rv-coll-grille{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}}
        @container (min-width:960px){.rv-coll-grille{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
        .rv-coll-grille .rv-coll-tuile{aspect-ratio:4/5}
        .rv-coll-ed{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .rv-coll-ed .rv-coll-tuile{aspect-ratio:4/5}
        .rv-coll-ed .rv-coll-tuile.rv-large{grid-column:span 2;aspect-ratio:16/10}
        @container (min-width:700px){
          .rv-coll-ed{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:clamp(150px,19cqw,250px);gap:14px}
          .rv-coll-ed .rv-coll-tuile,.rv-coll-ed .rv-coll-tuile.rv-large{aspect-ratio:auto;grid-column:span var(--c,1);grid-row:span var(--r,1)}
          .rv-coll-ed .rv-coll-tuile.rv-first .rv-coll-nom{font-size:clamp(20px,3cqw,30px)}
        }
        .rv-coll-tuile{position:relative;display:block;width:100%;border:0;padding:0;border-radius:16px;overflow:hidden;cursor:pointer;background:#e9efe9;text-align:left;isolation:isolate;-webkit-tap-highlight-color:transparent;touch-action:manipulation;box-shadow:0 6px 18px rgba(16,31,26,.10);transition:transform .35s cubic-bezier(.2,.8,.3,1),box-shadow .35s}
        .rv-coll-tuile:focus-visible,.rv-coll-rond:focus-visible{outline:2px solid ${couleur};outline-offset:3px}
        .rv-coll-fond{position:absolute;inset:0}
        .rv-coll-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 35%;transition:transform .6s cubic-bezier(.2,.8,.3,1)}
        .rv-coll-mosaique{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px;background:#fff}
        .rv-coll-mosaique img{width:100%;height:100%;object-fit:cover;display:block;min-height:0;min-width:0}
        .rv-coll-initiale{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:900;color:rgba(255,255,255,.35);padding-bottom:26%}
        .rv-coll-voile{position:absolute;left:0;right:0;bottom:0;height:62%;background:linear-gradient(180deg,rgba(6,14,10,0) 0%,rgba(6,14,10,.5) 55%,rgba(6,14,10,.82) 100%);pointer-events:none}
        .rv-coll-texte{position:absolute;left:0;right:52px;bottom:0;padding:12px 13px 14px;color:#fff;display:flex;flex-direction:column;gap:3px}
        .rv-coll-nom{font-weight:800;font-size:15px;line-height:1.2;letter-spacing:-.01em;text-shadow:0 1px 10px rgba(0,0,0,.4);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .rv-coll-nb{font-size:11.5px;opacity:.85;font-weight:600}
        .rv-coll-fleche{position:absolute;right:11px;bottom:12px;width:32px;height:32px;border-radius:50%;background:#fff;color:#14221b;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.25);transition:transform .3s}
        .rv-coll-ronds{display:flex;gap:16px;overflow-x:auto;padding:6px 4px 12px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
        .rv-coll-ronds::-webkit-scrollbar{height:0}
        .rv-coll-rond{flex:0 0 auto;width:88px;border:0;background:none;padding:0;cursor:pointer;text-align:center;scroll-snap-align:start;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .rv-coll-rond-img{position:relative;display:block;width:78px;height:78px;margin:2px auto 0;border-radius:50%;overflow:hidden;isolation:isolate}
        .rv-coll-rond-img .rv-coll-initiale{font-size:34px;padding-bottom:0}
        .rv-coll-rond-nom{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:11px;font-size:12.5px;font-weight:700;color:#14221b;line-height:1.25}
        @container (min-width:700px){.rv-coll-ronds{flex-wrap:wrap;justify-content:center;gap:26px 30px;overflow:visible}.rv-coll-rond{width:120px}.rv-coll-rond-img{width:108px;height:108px}.rv-coll-rond-nom{font-size:13.5px}}
        @media(max-width:480px){.rv-coll-nom{font-size:13.5px}.rv-coll-texte{padding:10px 11px 12px}.rv-coll-tuile{border-radius:14px}.rv-coll-fleche{width:28px;height:28px;right:9px;bottom:10px}}
        @media(hover:hover){.rv-coll-tuile:hover{transform:translateY(-4px);box-shadow:0 16px 34px rgba(16,31,26,.2)}.rv-coll-tuile:hover .rv-coll-img{transform:scale(1.06)}.rv-coll-tuile:hover .rv-coll-fleche{transform:translateX(3px)}.rv-coll-rond:hover .rv-coll-rond-img{transform:scale(1.05)}.rv-coll-rond-img{transition:transform .3s}}
        @media(prefers-reduced-motion:reduce){.rv-coll-tuile,.rv-coll-img,.rv-coll-fleche,.rv-coll-rond-img{transition:none !important}}
      `}</style>
      <div className="rv-coll">
        {mode === "ronds" ? (
          <div className="rv-coll-ronds">
            {liste.map((c) => <CollectionTuile key={c.id} c={c} produitsCol={produitsDe(c)} config={config} couleur={couleur} onOpen={() => onOpen(c)} mode="ronds" />)}
          </div>
        ) : mode === "editorial" ? (
          <div className="rv-coll-ed">
            {liste.map((c, i) => (
              <CollectionTuile key={c.id} c={c} produitsCol={produitsDe(c)} config={config} couleur={couleur} onOpen={() => onOpen(c)} mode="editorial"
                classe={`${i === 0 ? "rv-first " : ""}${place[i].large ? "rv-large" : ""}`} style={{ "--c": place[i].c, "--r": place[i].r }} />
            ))}
          </div>
        ) : (
          <div className="rv-coll-grille">
            {liste.map((c) => <CollectionTuile key={c.id} c={c} produitsCol={produitsDe(c)} config={config} couleur={couleur} onOpen={() => onOpen(c)} mode={mode} />)}
          </div>
        )}
      </div>
    </>
  );
}

// Certaines collections importées héritent du "handle" Shopify brut ("toges-avocat") au lieu
// du vrai titre. On le rend lisible à l'affichage : tirets → espaces, une majuscule par mot —
// sans jamais toucher à la donnée réelle stockée (juste l'affichage).
function joliNomCollection(nom) {
  if (!nom) return nom;
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nom)) {
    return nom.split("-").map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1)).join(" ");
  }
  return nom;
}

function PageAccueilPersonnalisee({ config, entreprise, couleur, produits, meilleuresVentes, meilleuresVentesToutes, nouveautes, nouveautesToutes, collectionsManuelles, recherche, setRecherche, produitsFiltres, ouvrirProduit, naviguerVersCollection, setCollectionOuverte, setPolitiqueOuverte, politiqueOuverte, setPagePersoOuverte, pagePersoOuverte, NOMBRE_MAX_ACCUEIL, avisBoutique = [], totalArticlesPanier = 0, onOuvrirPanier, onAjouterAuPanier, biensLocation = [], onOuvrirBien }) {
  const devise = formaterDevise(entreprise.devise);
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
    return produits.filter((p) => (col.produitIds || []).includes(p.produit_id));
  }

  const commonPad = { padding: "34px 18px", borderBottom: "1px solid #edf1ee" };
  const aDesLiensNav = meilleuresVentesToutes.length > 0 || nouveautesToutes.length > 0 || collectionsManuelles.length > 0;

  function GrilleProduits({ liste, max }) {
    if (!liste.length) return <div style={{ padding: 16, textAlign: "center", background: "#f6f9f6", borderRadius: 10, color: "#728078", fontSize: 12 }}>Aucun produit pour le moment.</div>;
    const estAzaliIci = entreprise.slug === "azaliexpress";
    return (
      <GrilleMobile className="rv-builder-grid-produits" couleur={couleur} langue={entreprise.langue}>
        {liste.slice(0, max || 12).map((p, i) => (
          <RevealOnScroll key={p.produit_id} delai={(i % 6) * 50}>
            <CarteProduit p={p} couleur={couleur} devise={devise} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={onAjouterAuPanier} estAzali={estAzaliIci} />
          </RevealOnScroll>
        ))}
      </GrilleMobile>
    );
  }

  function baseSectionType(t) { return String(t).replace(/_\d+$/, ""); }
  function suffixeSection(t) { const m = /_(\d+)$/.exec(String(t)); return m ? "_" + m[1] : ""; }

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
            <a href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", background: "#25d366", color: "white", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
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
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: couleurTexteLisible(couleurSection), marginBottom: 6 }}>Catégories</div>
          <h3 style={{ margin: "0 0 18px", fontSize: 24, letterSpacing: "-.01em", color: "#14221b" }}>Faites vos achats par catégorie</h3>
          <GrilleCollections collections={derivedCollections} produitsDe={produitsDeCollection} config={config} couleur={couleur} onOpen={(c) => setCollectionOuverte(`manuelle-${c.id}`)} />
        </div>
      );
    }

    if (type === "featured_product" || baseSectionType(type) === "featured_product") {
      const suf = suffixeSection(type);
      const kId = `featuredProductId${suf}`, kLabel = `featuredProductLabel${suf}`, kPos = `featuredProductPosition${suf}`;
      const p = produits.find((x) => x.produit_id === config[kId]) || null;
      if (!p) return null;
      const inverse = config[kPos] === "droite";
      const descriptionExtrait = (p.produit_description || "").replace(/<[^>]*>/g, "").slice(0, 160);
      return (
        <div style={{ display: "flex", flexDirection: inverse ? "row-reverse" : "row", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minHeight: 260, background: p.photo_url ? `url(${p.photo_url}) center/cover` : "#eef3ee", display: p.photo_url ? undefined : "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
            {!p.photo_url && "🛍️"}
          </div>
          <div style={{ flex: "1 1 280px", padding: "30px 26px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {config[kLabel] && <div style={{ fontSize: 10.5, fontWeight: 900, color: couleurTexteLisible(couleurSection), letterSpacing: "0.06em", marginBottom: 8 }}>{config[kLabel].toUpperCase()}</div>}
            <div style={{ fontSize: 23, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{p.produit_nom}</div>
            <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.7, marginBottom: 14 }}>{descriptionExtrait}{descriptionExtrait.length >= 160 ? "…" : ""}</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: couleurTexteLisible(couleurSection), marginBottom: 14 }}>{montantAffiche(Number(p.prix_vente))} {formaterDevise(entreprise.devise)}</div>
            <button onClick={() => ouvrirProduit(p)} style={{ alignSelf: "flex-start", border: 0, borderRadius: 10, padding: "12px 22px", background: couleurSection, color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 12.5, cursor: "pointer" }}>
              {config.buttonText || "Découvrir"}
            </button>
          </div>
        </div>
      );
    }

    if (type === "rich_text" || baseSectionType(type) === "rich_text") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config[`richTextTitre${suf}`]}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.75, maxWidth: 640, margin: "0 auto" }}>{config[`richTextTexte${suf}`]}</div>
        </div>
      );
    }

    if (type === "video" || baseSectionType(type) === "video") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "26px 20px" }}>
          {config[`videoTitre${suf}`] && <div style={{ fontSize: 19, fontWeight: 900, color: "#132019", marginBottom: 14, textAlign: "center" }}>{config[`videoTitre${suf}`]}</div>}
          {config[`videoUrl${suf}`] ? (
            <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000", maxWidth: 800, margin: "0 auto" }}>
              <iframe src={urlEmbedVideo(config[`videoUrl${suf}`])} title="Vidéo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
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

    if (type === "before_after" || baseSectionType(type) === "before_after") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "26px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 700, margin: "0 auto" }}>
            {[[`beforeAfterAvant${suf}`, `beforeAfterLegendeAvant${suf}`], [`beforeAfterApres${suf}`, `beforeAfterLegendeApres${suf}`]].map(([imgKey, legKey]) => (
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

    if (type === "cta_banner" || baseSectionType(type) === "cta_banner") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "34px 20px", textAlign: "center", background: config[`ctaBannerCouleur${suf}`] || couleurSection }}>
          <div style={{ color: "white", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>{config[`ctaBannerTitre${suf}`]}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginBottom: 18 }}>{config[`ctaBannerTexte${suf}`]}</div>
          <button style={{ border: 0, borderRadius: 10, padding: "13px 26px", background: "white", color: config[`ctaBannerCouleur${suf}`] || couleurSection, fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
            {config[`ctaBannerBouton${suf}`]}
          </button>
        </div>
      );
    }

    if (type === "contact_form" || baseSectionType(type) === "contact_form") {
      const suf = suffixeSection(type);
      const idBase = `cf-${s.id || Math.random().toString(36).slice(2)}`;
      const envoyer = () => {
        const nom = document.getElementById(`${idBase}-nom`)?.value || "";
        const tel = document.getElementById(`${idBase}-tel`)?.value || "";
        const msg = document.getElementById(`${idBase}-msg`)?.value || "";
        if (!entreprise.whatsapp) return;
        const texte = `Bonjour, je m'appelle ${nom} (${tel}).\n${msg}`;
        window.open(`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}?text=${encodeURIComponent(texte)}`, "_blank");
      };
      return (
        <div style={{ padding: "30px 20px" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#132019", marginBottom: 6, textAlign: "center" }}>{config[`contactFormTitre${suf}`]}</div>
          <div style={{ fontSize: 12.5, color: "#68756d", marginBottom: 18, textAlign: "center" }}>{config[`contactFormTexte${suf}`]}</div>
          <div style={{ display: "grid", gap: 10, maxWidth: 420, margin: "0 auto" }}>
            <input id={`${idBase}-nom`} placeholder="Nom" style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 16 }} />
            <input id={`${idBase}-tel`} placeholder="Téléphone" style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 16 }} />
            <textarea id={`${idBase}-msg`} placeholder="Message" rows={3} style={{ padding: "11px 13px", borderRadius: 9, border: "1px solid #dfe6df", fontSize: 16, resize: "vertical" }} />
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

    if (type === "featured_collection" || baseSectionType(type) === "featured_collection") {
      const suf = suffixeSection(type);
      const kId = `featuredCollectionId${suf}`, kTitre = `featuredCollectionTitre${suf}`, kTexte = `featuredCollectionTexte${suf}`, kImg = `featuredCollectionImage${suf}`;
      const kColMobile = `featuredCollectionColMobile${suf}`, kColDesktop = `featuredCollectionColDesktop${suf}`, kNombre = `featuredCollectionNombre${suf}`;
      // Tout est personnalisable : le petit label au-dessus du titre (vide = masqué),
      // le titre, le texte, le libellé du bouton, et le style d'animation de la bannière.
      const kLabel = `featuredCollectionLabel${suf}`, kBouton = `featuredCollectionBouton${suf}`, kAnim = `featuredCollectionAnim${suf}`, kHauteur = `featuredCollectionHauteur${suf}`;
      const col = derivedCollections.find((c) => c.id === config[kId]) || null;
      if (!col) return null;
      const produitsCol = col.produitIds ? produitsDeCollection(col) : [];
      const colMobile = config[kColMobile] || 2;
      const colDesktop = config[kColDesktop] || 4;
      const nbAAfficher = config[kNombre] || 8;
      const classeGrille = `rv-fc-grid${suf}`;
      const uid = `rvfc${suf.replace(/_/g, "") || "0"}`;
      // Fond de la bannière : la photo choisie manuellement dans le Store Builder en priorité,
      // sinon une vraie photo tirée de la collection (le premier produit avec image) plutôt
      // qu'un dégradé plat générique — bien plus premium, sans rien configurer.
      // (Avant : la photo d'un produit au hasard, agrandie et recadrée — donnait une image « bizarre »
      // et différente de l'aperçu du builder. Maintenant : la photo choisie, sinon l'image de la
      // collection, sinon un beau dégradé, exactement comme dans l'aperçu.)
      const photoFond = config[kImg] || imageCollection(col, config) || "";
      const labelBanniere = config[kLabel] !== undefined ? String(config[kLabel]).trim() : "COLLECTION";
      const titreBanniere = config[kTitre] || joliNomCollection(col.nom);
      const texteBouton = config[kBouton] || "Voir la collection";
      const styleFc = config[`featuredCollectionStyle${suf}`] === "banniere" ? "banniere" : "editorial"; // editorial (défaut) | banniere
      const anim = config[kAnim] || "aurora"; // aurora | neon | zoom | sobre
      const animee = anim !== "sobre";
      const hauteur = config[kHauteur] || "moyenne"; // compacte | moyenne | plein
      const minH = hauteur === "compacte" ? "clamp(220px,42vw,300px)" : hauteur === "plein" ? "clamp(420px,72vh,620px)" : "clamp(300px,52vw,440px)";
      return (
        <div>
          <style>{`
            .${classeGrille}{display:grid;grid-template-columns:repeat(${colMobile},1fr);gap:10px}
            @media(min-width:641px){.${classeGrille}{grid-template-columns:repeat(${colDesktop},1fr);gap:20px}}

            @keyframes ${uid}Zoom{0%{transform:scale(1.04)}100%{transform:scale(1.18)}}
            @keyframes ${uid}Aurora1{0%{transform:translate3d(-12%,-8%,0) scale(1)}50%{transform:translate3d(10%,8%,0) scale(1.3)}100%{transform:translate3d(-12%,-8%,0) scale(1)}}
            @keyframes ${uid}Aurora2{0%{transform:translate3d(14%,10%,0) scale(1.2)}50%{transform:translate3d(-10%,-6%,0) scale(1)}100%{transform:translate3d(14%,10%,0) scale(1.2)}}
            @keyframes ${uid}Shine{0%{background-position:-220% 0}100%{background-position:220% 0}}
            @keyframes ${uid}Dot{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}
            @keyframes ${uid}Up{0%{opacity:0;transform:translateY(26px)}100%{opacity:1;transform:none}}
            @keyframes ${uid}Sweep{0%{left:-70%}60%,100%{left:140%}}
            @keyframes ${uid}Line{0%{background-position:0% 50%}100%{background-position:200% 50%}}
            @keyframes ${uid}Grid{0%{transform:translateY(0)}100%{transform:translateY(46px)}}

            .${uid}-wrap{position:relative;overflow:hidden;isolation:isolate;min-height:${minH};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;padding:clamp(28px,6vw,64px) 20px;background:#08120d}
            .${uid}-photo{position:absolute;inset:-4%;background:${photoFond ? `url(${photoFond}) center/cover` : `linear-gradient(135deg,${couleurSection},#08120d)`};${animee ? `animation:${uid}Zoom 22s ease-in-out infinite alternate;` : ""}will-change:transform}
            .${uid}-voile{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,10,8,.35) 0%,rgba(4,10,8,.55) 45%,rgba(4,10,8,.88) 100%)}
            .${uid}-blob{position:absolute;border-radius:50%;opacity:.6;mix-blend-mode:screen;pointer-events:none;will-change:transform;transform:translateZ(0)}
            .${uid}-b1{width:64%;aspect-ratio:1;left:-14%;top:-24%;background:radial-gradient(circle,${couleurSection} 0%,${couleurSection}80 32%,transparent 66%);${animee ? `animation:${uid}Aurora1 16s ease-in-out infinite;` : ""}}
            .${uid}-b2{width:58%;aspect-ratio:1;right:-16%;bottom:-28%;background:radial-gradient(circle,#7c5cff 0%,#7c5cff80 32%,transparent 66%);${animee ? `animation:${uid}Aurora2 20s ease-in-out infinite;` : ""}}
            .${uid}-grille{position:absolute;inset:-46px 0;pointer-events:none;opacity:${anim === "neon" ? ".28" : ".14"};background-image:linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000 10%,transparent 72%);will-change:transform;mask-image:radial-gradient(ellipse at 50% 40%,#000 10%,transparent 72%);will-change:transform;${animee ? `animation:${uid}Grid 7s linear infinite;` : ""}}
            .${uid}-inner{position:relative;z-index:3;max-width:720px;width:100%}
            .${uid}-label{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.16);font-size:10.5px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin-bottom:16px;${animee ? `animation:${uid}Up .7s .05s both;` : ""}}
            .${uid}-label i{width:6px;height:6px;border-radius:50%;background:${anim === "neon" ? "#39ffc6" : "#fff"};display:block;${animee ? `animation:${uid}Dot 1.8s ease-in-out infinite;` : ""}}
            .${uid}-titre{font-size:clamp(26px,6.4vw,54px);line-height:1.04;font-weight:950;letter-spacing:-.02em;margin:0 0 14px;background:linear-gradient(100deg,#fff 20%,rgba(255,255,255,.55) 42%,#fff 62%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;${animee ? `animation:${uid}Up .7s .12s both,${uid}Shine 5.5s linear 1s infinite;` : "color:#fff;"}text-shadow:0 2px 24px rgba(0,0,0,.35)}
            .${uid}-texte{font-size:clamp(13px,2.4vw,16px);line-height:1.6;opacity:.92;max-width:520px;margin:0 auto 26px;${animee ? `animation:${uid}Up .7s .2s both;` : ""}}
            .${uid}-cta{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:14px 28px;background:rgba(255,255,255,.96);color:#0d1a13;font-weight:900;font-size:13.5px;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.35),0 0 0 0 rgba(255,255,255,.25);transition:transform .25s cubic-bezier(.2,.8,.3,1),box-shadow .25s;${animee ? `animation:${uid}Up .7s .28s both;` : ""}}
            .${uid}-cta:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 20px 50px rgba(0,0,0,.45),0 0 0 6px rgba(255,255,255,.14)}
            .${uid}-cta span.s{position:absolute;top:0;bottom:0;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent);transform:skewX(-18deg);${animee ? `animation:${uid}Sweep 3.4s ease-in-out infinite;` : "display:none"}}
            .${uid}-pill{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:${couleurSection};color:#fff;font-size:11px;font-weight:900}
            .${uid}-fil{height:2px;background:linear-gradient(90deg,transparent,${couleurSection},#7c5cff,${couleurSection},transparent);background-size:200% 100%;${animee ? `animation:${uid}Line 3.5s linear infinite;` : ""}}
            .${uid}-card{${animee ? `animation:${uid}Up .55s both;` : ""}transition:transform .3s cubic-bezier(.2,.8,.3,1)}
            .${uid}-card:hover{transform:translateY(-6px)}
            .${uid}-more{position:relative;overflow:hidden;border:1.5px solid ${couleurSection};background:none;color:${couleurSection};border-radius:999px;padding:13px 28px;font-weight:800;font-size:13px;cursor:pointer;transition:background .25s,color .25s,transform .25s}
            .${uid}-more:hover{background:${couleurSection};color:#fff;transform:translateY(-2px)}
            /* Sur mobile, on allege la banniere : halos plus discrets et grille figee.
               Le geste de defilement (swipe) reste fluide, l'ambiance visuelle reste la. */
            @media (max-width:640px){
              .${uid}-b1,.${uid}-b2{opacity:.4}
              .${uid}-grille{animation:none;opacity:.08}
            }
            @media (prefers-reduced-motion: reduce){.${uid}-wrap *,.${uid}-photo{animation:none !important}}
          `}</style>

          {styleFc === "editorial" && (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(24px,4vw,48px) 16px 0" }}>
              <EnteteCollectionVedette titre={titreBanniere} texte={config[kTexte]} label={config[kLabel] !== undefined ? config[kLabel] : "COLLECTION"} nb={produitsCol.length} couleur={couleurSection} bouton={config[kBouton]} onOpen={() => setCollectionOuverte(`manuelle-${col.id}`)} />
            </div>
          )}
          {styleFc === "banniere" && <>
          <div className={`${uid}-wrap`}>
            <div className={`${uid}-photo`} />
            <div className={`${uid}-voile`} />
            {anim !== "sobre" && anim !== "zoom" && <><div className={`${uid}-blob ${uid}-b1`} /><div className={`${uid}-blob ${uid}-b2`} /></>}
            {anim !== "sobre" && <div className={`${uid}-grille`} />}
            <div className={`${uid}-inner`}>
              {labelBanniere ? <div className={`${uid}-label`}><i />{labelBanniere}</div> : null}
              <h2 className={`${uid}-titre`}>{titreBanniere}</h2>
              {config[kTexte] ? <p className={`${uid}-texte`}>{config[kTexte]}</p> : null}
              <button className={`${uid}-cta`} onClick={() => setCollectionOuverte(`manuelle-${col.id}`)}>
                <span className="s" />
                {texteBouton}
                {produitsCol.length > 0 && <span className={`${uid}-pill`}>{produitsCol.length}</span>}
              </button>
            </div>
          </div>
          <div className={`${uid}-fil`} />
          </>}

          {produitsCol.length > 0 && (
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: styleFc === "editorial" ? "0 16px clamp(24px,4vw,44px)" : "clamp(22px,4vw,40px) 16px" }}>
              <GrilleMobile className={classeGrille} colonnes={Number(colMobile) === 3 ? 3 : Number(colMobile) === 1 ? 1 : 2} ecart={10} couleur={couleur} langue={entreprise.langue}>
                {produitsCol.slice(0, nbAAfficher).map((p, i) => (
                  <div key={p.produit_id} className={`${uid}-card`} style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}>
                    <CarteProduit p={p} couleur={couleur} devise={entreprise.devise} onOpen={ouvrirProduit} langue={entreprise.langue} onAjouterAuPanier={onAjouterAuPanier} />
                  </div>
                ))}
              </GrilleMobile>
              {produitsCol.length > nbAAfficher && (
                <div style={{ textAlign: "center", marginTop: 26 }}>
                  <button className={`${uid}-more`} onClick={() => setCollectionOuverte(`manuelle-${col.id}`)}>
                    Voir les {produitsCol.length} produits →
                  </button>
                </div>
              )}
            </div>
          )}
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

    if (type === "image_text_bubble" || baseSectionType(type) === "image_text_bubble") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "50px 24px", position: "relative" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", maxWidth: 700, margin: "0 auto" }}>
            <div style={{ flex: "1 1 320px", height: 260, borderRadius: 22, background: config[`imageTextBubbleImage${suf}`] ? `url(${config[`imageTextBubbleImage${suf}`]}) center/cover` : `linear-gradient(135deg,${couleurSection},#0b2416)`, boxShadow: "0 24px 48px rgba(0,0,0,0.15)" }} />
            <div style={{ flex: "1 1 320px", marginLeft: -50, marginTop: 0, background: "white", borderRadius: 20, padding: "28px 24px", boxShadow: "0 18px 40px rgba(0,0,0,0.1)", position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config[`imageTextBubbleTitre${suf}`]}</div>
              <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.65 }}>{config[`imageTextBubbleTexte${suf}`]}</div>
            </div>
          </div>
        </div>
      );
    }

    if (type === "custom_html" || baseSectionType(type) === "custom_html") {
      const suf = suffixeSection(type);
      return <div dangerouslySetInnerHTML={{ __html: config[`customHtmlCode${suf}`] || "" }} />;
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

    if (type === "two_images_text" || baseSectionType(type) === "two_images_text") {
      const suf = suffixeSection(type);
      return (
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#132019", marginBottom: 10 }}>{config[`twoImagesTextTitre${suf}`]}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 20px" }}>{config[`twoImagesTextTexte${suf}`]}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 600, margin: "0 auto" }}>
            {[config[`twoImagesTextImage1${suf}`], config[`twoImagesTextImage2${suf}`]].map((img, i) => (
              <div key={i} style={{ height: 200, borderRadius: 14, background: img ? `url(${img}) center/cover` : "#eef3ee", display: img ? undefined : "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
                {!img && "🖼️"}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === "wavy_banner" || baseSectionType(type) === "wavy_banner") {
      const suf = suffixeSection(type);
      return (
        <div style={{ background: couleurSection, padding: "44px 20px 40px", textAlign: "center", position: "relative", clipPath: "ellipse(65% 100% at 50% 0%)" }}>
          <div style={{ color: couleurTextePourFond(couleurSection), fontWeight: 900, fontSize: 24, marginBottom: 18, marginTop: 14 }}>{config[`wavyBannerTitre${suf}`]}</div>
          <button style={{ border: 0, borderRadius: 999, padding: "13px 28px", background: "white", color: couleurTexteLisible(couleurSection), fontWeight: 900, fontSize: 13, cursor: "pointer" }}>{config[`wavyBannerBouton${suf}`]}</button>
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
        <style>{`.rv-hero-couverture{width:100%;height:clamp(380px,48vw,800px);object-fit:cover;display:block} .rv-hero-picture{display:block} @media(max-width:640px){.rv-hero-couverture{height:auto;max-height:520px;object-fit:cover;object-position:center top}}`}</style>
        {entreprise.banniere ? (
          <picture className="rv-hero-picture">
            {config.bannerMobile ? <source media="(max-width: 640px)" srcSet={config.bannerMobile} /> : null}
            <img src={entreprise.banniere} alt="" className="rv-hero-couverture" fetchpriority="high" decoding="async" onError={(e) => { e.target.style.display = "none"; }} />
          </picture>
        ) : (
          <div style={{ padding: "50px 20px", background: `linear-gradient(135deg,${couleurSection},#0b2416)`, color: "#fff" }}>
            <div style={{ fontSize: 28, fontWeight: 950 }}>{config.heroTitle}</div>
          </div>
        )}
        {(config.heroTitle?.trim() || config.heroSubtitle?.trim() || (config.buttonText && config.buttonText.trim())) && (
          <div style={{ padding: "26px 20px 34px" }}>
            {config.heroTitle?.trim() && <div style={{ fontSize: "clamp(24px,5vw,38px)", fontWeight: 950, color: "#132019", lineHeight: 1.08 }}>{config.heroTitle}</div>}
            {config.heroSubtitle?.trim() && <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.6, margin: "12px auto 18px", maxWidth: 600 }}>{config.heroSubtitle}</div>}
            {config.buttonText && config.buttonText.trim() && (
              <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "13px 22px", background: couleurSection, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                {config.buttonText}
              </button>
            )}
          </div>
        )}
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
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: couleurTexteLisible(couleurSection), marginBottom: 6 }}>Nos collections</div>
          <h3 style={{ margin: "0 0 18px", fontSize: 24, letterSpacing: "-.01em", color: "#14221b" }}>Explorer les collections</h3>
          <GrilleCollections collections={derivedCollections} produitsDe={produitsDeCollection} config={config} couleur={couleur} onOpen={(c) => setCollectionOuverte(`manuelle-${c.id}`)} />
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
                  <div style={{ fontSize: 21, fontWeight: 950, color: couleurLisible, marginTop: 10 }}>{base ? montantAffiche(total) + " " + devise : "Prix sur demande"}</div>
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

    if (type === "promo" || baseSectionType(type) === "promo") {
      const suf = suffixeSection(type);
      return (
        <div style={{ ...commonPad, background: "#f7f2e7", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#b16b00" }}>OFFRE LIMITÉE</div>
          <h3 style={{ fontSize: 25, margin: "8px 0", color: "#162119" }}>{config[`promoTitle${suf}`]}</h3>
          <p style={{ fontSize: 12.5, color: "#6f776f" }}>{config[`promoText${suf}`]}</p>
          <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 9, padding: "11px 19px", background: couleurSection, color: couleurTextePourFond(couleurSection), fontWeight: 900, cursor: "pointer" }}>Profiter de l'offre</button>
        </div>
      );
    }

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
          <GrilleMobile className="rv-builder-grid-galerie" ecart={9} couleur={couleur} langue={entreprise.langue}>
            {config.gallery.map((u, i) => <img key={i} src={u} alt="" loading="lazy" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} />)}
          </GrilleMobile>
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
          <a href={`https://wa.me/${formaterTelWhatsapp(entreprise.whatsapp, entreprise.country)}?text=${encodeURIComponent(config.whatsapp || "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", border: 0, borderRadius: 10, padding: "11px 19px", background: "#168a45", color: "#fff", fontWeight: 900, textDecoration: "none" }}>
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
    <div style={{ minHeight: "100vh", background: "transparent", fontFamily: "sans-serif" }}>
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
      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} headerConfig={{ liens: config.headerLinks, bgColor: config.headerBgColor, textColor: config.headerTextColor, barreTop: config.headerBarreTop, showSearch: config.headerShowSearch, showPanier: config.headerShowPanier }} nbArticlesPanier={totalArticlesPanier} onOuvrirPanier={onOuvrirPanier} onOuvrirPagePerso={setPagePersoOuverte} />
      {sectionsNormalisees.filter((s) => s.visible !== false).map((s, i) => {
        const idsCorrespondants = { products: "produits", promo: "promo", contact: "contact", faq: "faq", testimonials: "avis", whatsapp: "whatsapp", delivery: "livraison", bundles: "bundles" };
        const st = config.sectionStyles?.[s.type] || {};
        const wrapStyle = {};
        if (st.fond) wrapStyle.background = st.fond;
        if (st.bordure) {
          wrapStyle.border = `${st.bordureEpaisseur ?? 2}px solid ${st.bordureCouleur || "#dddddd"}`;
          wrapStyle.borderRadius = st.arrondi ?? 12;
          wrapStyle.padding = st.espacement ?? 16;
          wrapStyle.margin = "10px auto";
          wrapStyle.maxWidth = 1100;
          wrapStyle.overflow = "hidden";
        }
        return (
          <div key={s.id} id={idsCorrespondants[s.type] || undefined} style={wrapStyle}>
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
      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} onOuvrirPagePerso={setPagePersoOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} footerConfig={{ bgColor: config.footerBgColor, textColor: config.footerTextColor, colonnes: config.footerColonnes, newsletterActif: config.footerNewsletterActif, newsletterTexte: config.footerNewsletterTexte, paiements: config.footerPaiements, backToTop: config.footerBackToTop, boutiqueVisible: config.footerBoutiqueVisible, ambiance: config.footerAmbiance, colonnesMobile: config.footerColonnesMobile, accent: couleurPersoValide(config.footerAccentColor) || config.couleur }} />
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
      {pagePersoOuverte && (
        <div onClick={() => setPagePersoOuverte(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{pagePersoOuverte.titre}</div>
              <button onClick={() => setPagePersoOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: pagePersoOuverte.contenu || "" }} />
          </div>
        </div>
      )}
      <BulleWhatsApp whatsapp={entreprise.whatsapp} codePays={entreprise.country} />
    </div>
  );
}
