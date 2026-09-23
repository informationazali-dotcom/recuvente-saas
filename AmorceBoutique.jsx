import React from "react";

// ============================================================================
//  AMORCE BOUTIQUE — tout ce qui s'affiche AVANT que la boutique soit prête.
//  Règle d'or : aucune marque RecuVente ici. Soit l'identité de la boutique
//  (logo / nom / couleur gardés en cache lors d'une visite précédente), soit
//  un écran neutre avec un simple filet de progression.
//  Ce fichier est volontairement minuscule : il est chargé dans le bundle
//  d'entrée (main.jsx) pour que l'écran d'amorce apparaisse immédiatement.
// ============================================================================

const DOMAINES_INTERNES = ["recuvente-saas.vercel.app", "localhost", "127.0.0.1"];

// Même logique que main.jsx : quelle boutique est demandée par l'URL ?
// (null = vue admin, suivi de commande, marketing → pas une boutique)
export function cleBoutiqueDepuisUrl() {
  const p = new URLSearchParams(window.location.search);
  if (p.get("marketing") || p.get("suivi")) return null;
  const h = window.location.hostname;
  const perso = !DOMAINES_INTERNES.includes(h) && !h.endsWith(".vercel.app");
  if (perso) return h;
  const classique = p.get("commander") || p.get("catalogue") || p.get("boutique");
  if (classique) return classique;
  // Lien court façon Shopify (/nom-boutique[/nom-produit]) : la clé de cache identité reste
  // le slug de la boutique, comme pour ?boutique=.
  const court = chemincourtDepuisUrl();
  return court ? court.boutique : null;
}

// ---------- Lien court façon Shopify : /nom-boutique ou /nom-boutique/nom-produit ----------
// Remplace les longs liens ?boutique=...&produit=<uuid-complet> par un chemin court et lisible,
// SANS jamais retirer l'ancien format (les liens déjà partagés/indexés continuent de marcher —
// voir main.jsx et App.jsx, qui vérifient toujours ?boutique=/?catalogue= EN PREMIER).
// Chemins déjà utilisés ailleurs dans l'app : jamais interprétés comme un slug de boutique, pour
// ne jamais capter une route existante par erreur (à tenir synchronisé avec App.jsx).
const CHEMINS_RESERVES = new Set([
  "tunnel", "activer-compte", "marketing-reseau", "boutique", "business",
  "api", "assets", "favicon", "robots", "manifest", "sitemap",
]);
// Lettres/chiffres/tirets uniquement (jamais de point : exclut favicon.ico, robots.txt, etc.),
// pas de tiret en début/fin, au moins 3 caractères.
const SLUG_CHEMIN_VALIDE = /^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/;

function segmentsCheminValides() {
  if (typeof window === "undefined") return null;
  const chemin = window.location.pathname.replace(/\/+$/, "");
  if (!chemin || chemin === "/") return null;
  const segments = chemin.slice(1).split("/").filter(Boolean);
  if (segments.length < 1 || segments.length > 2) return null;
  if (!segments.every((s) => SLUG_CHEMIN_VALIDE.test(s))) return null;
  if (CHEMINS_RESERVES.has(segments[0])) return null;
  return segments;
}

// Renvoie { boutique, produit } si l'URL courante ressemble à un lien court de boutique/produit,
// sinon null (URL d'admin, de suivi, route réservée, fichier statique, etc.). Pour le domaine
// partagé recuvente-saas.vercel.app uniquement — un domaine personnalisé n'a pas de segment
// "boutique" dans son chemin (le domaine EST la boutique), voir produitDepuisCheminDomainePerso.
export function chemincourtDepuisUrl() {
  const segments = segmentsCheminValides();
  if (!segments) return null;
  return { boutique: segments[0], produit: segments[1] || null };
}

// Sur un domaine personnalisé (monsite.com/nom-produit), le seul segment du chemin désigne
// directement le produit — il n'y a pas de boutique à nommer, le domaine en tient déjà lieu.
export function produitDepuisCheminDomainePerso() {
  const segments = segmentsCheminValides();
  if (!segments || segments.length !== 1) return null;
  return segments[0];
}

// Clé identique à celle utilisée par CataloguePublic : `rv_identite_<cle>`
export function lireIdentiteCachee(cle) {
  if (!cle) return null;
  try {
    const brut = localStorage.getItem(`rv_identite_${cle}`);
    return brut ? JSON.parse(brut) : null;
  } catch (_) {
    return null;
  }
}

function hexVersRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [26, 122, 60];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// Texte blanc ou sombre selon la clarté du fond (contraste lisible)
export function couleurTexteSur(hex) {
  const [r, g, b] = hexVersRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#16231F" : "#FFFFFF";
}

// Le fond du <html> et la couleur de la barre du navigateur ont été posés par
// index.html pendant l'amorce : on les rend dès que la boutique est affichée.
export function libererFondAmorce(couleur) {
  try {
    document.documentElement.style.background = "";
    const m = document.querySelector('meta[name="theme-color"]');
    if (m && couleur) m.setAttribute("content", couleur);
  } catch (_) {}
}

export const CSS_AMORCE = `
.rvb{position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:var(--rvb-bg,#FAFAF7);color:var(--rvb-fg,#16231F);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.rvb-med{position:relative;width:92px;height:92px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 14px 44px rgba(0,0,0,.20);transition:opacity .5s ease,transform .7s cubic-bezier(.76,0,.18,1)}
.rvb-med img{width:64%;height:64%;object-fit:contain;display:block}
.rvb-ini{font-weight:800;font-size:34px;color:var(--rvb-bg,#16231F)}
.rvb-ring{position:absolute;inset:-8px;border-radius:50%;background:conic-gradient(from 0deg,var(--rvb-fg,#fff),transparent 72%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));animation:rvbSpin 1.3s linear infinite;opacity:.9}
.rvb-nom{font-weight:650;font-size:15px;letter-spacing:.02em;opacity:.92;max-width:80vw;text-align:center;transition:opacity .5s ease,transform .7s cubic-bezier(.76,0,.18,1)}
.rvb-fil{position:absolute;left:0;top:0;height:2px;width:100%;transform-origin:left;background:var(--rvb-fg,#16231F);opacity:.5;animation:rvbFil 1.6s cubic-bezier(.4,0,.2,1) infinite}
.rvb-neutre .rvb-fil{opacity:.28}
.rvb-rideau{transition:transform .95s cubic-bezier(.76,0,.18,1),border-radius .95s cubic-bezier(.76,0,.18,1);will-change:transform;z-index:9999}
.rvb-leve{transform:translateY(-102%);border-radius:0 0 50% 50% / 0 0 9vh 9vh;pointer-events:none}
.rvb-leve .rvb-med,.rvb-leve .rvb-nom{opacity:0;transform:translateY(-18px) scale(.94)}
@keyframes rvbSpin{to{transform:rotate(360deg)}}
@keyframes rvbFil{0%{transform:scaleX(0);opacity:.5}60%{transform:scaleX(1);opacity:.5}100%{transform:scaleX(1);opacity:0}}
@media (prefers-reduced-motion:reduce){.rvb-ring,.rvb-fil{animation:none}.rvb-rideau{transition:none}}
`;

export function injecterCssAmorce() {
  if (typeof document === "undefined" || document.getElementById("rvb-css")) return;
  const el = document.createElement("style");
  el.id = "rvb-css";
  el.textContent = CSS_AMORCE;
  document.head.appendChild(el);
}

// Médaillon + nom de la boutique (partagé avec le rideau d'ouverture)
export function MedaillonBoutique({ identite }) {
  const initiale = (identite?.nom || "").trim().charAt(0).toUpperCase();
  return (
    <>
      <div className="rvb-med">
        <i className="rvb-ring" />
        {identite?.logo ? (
          <img src={identite.logo} alt="" decoding="async" />
        ) : (
          <span className="rvb-ini">{initiale}</span>
        )}
      </div>
      {identite?.nom && <div className="rvb-nom">{identite.nom}</div>}
    </>
  );
}

// Écran d'amorce. `identite` = { nom, logo, couleur } du cache, ou null → neutre.
export function EcranAmorce({ identite }) {
  injecterCssAmorce();
  const brande = !!(identite && (identite.logo || identite.nom));
  const bg = brande ? identite.couleur || "#1a7a3c" : "#FAFAF7";
  const fg = brande ? couleurTexteSur(bg) : "#16231F";
  return (
    <div className={`rvb ${brande ? "" : "rvb-neutre"}`} style={{ "--rvb-bg": bg, "--rvb-fg": fg }}>
      <div className="rvb-fil" />
      {brande && <MedaillonBoutique identite={identite} />}
    </div>
  );
}
