// ============================================================================
// PRODUCT PAGE BUILDER — rendu de la page produit (public ET aperçu de l'éditeur)
// ----------------------------------------------------------------------------
// Ce composant ne parle PAS à la base et ne crée AUCUNE commande. Il reçoit de
// CataloguePublic.jsx l'état et les actions du tunnel de commande existant
// (quantité, bundle choisi, options, complément, formulaire COD…) et se contente
// de les afficher / déclencher. Le formulaire COD est fourni par le parent
// (rendreFormulaire) : c'est le même formulaire que la fiche historique.
//
// Responsive : mobile d'abord. Les mises en page s'adaptent à la LARGEUR DU CONTENEUR
// (CSS container queries) — l'aperçu "Mobile" de l'éditeur est donc fidèle.
// Performance : images en lazy loading, vidéos chargées au clic, aucune dépendance
// externe, blocs vides non rendus.
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  normaliserConfig, REGISTRE_BLOCS, blocEstVide, calculerOffresAffichees, analyserVideo,
  couleurTextePourFond, couleurValide, formaterMontant, arrondiLocalBase, monnaieAffichage, produitsCrossSell, textePlat, CTA_TEXTE_DEFAUT,
  structureDescriptionProduit, urlImageLegere, extraireTextePourAudio, construireResumeVocal,
} from "./blocs.js";

// ---------------------------------------------------------------------------
// Utilitaires visuels
// ---------------------------------------------------------------------------

function hexVersRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return `rgba(26,122,60,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function Etoiles({ note, taille = 15 }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(note) || 0)));
  return (
    <span aria-label={`${n} sur 5`} style={{ color: "#E8920A", fontSize: taille, letterSpacing: 1, whiteSpace: "nowrap" }}>
      {"★".repeat(n)}{"☆".repeat(5 - n)}
    </span>
  );
}

function useEstMobile(modeForce) {
  const lire = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 859px)").matches : true);
  const [m, setM] = useState(lire);
  useEffect(() => {
    if (modeForce || typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(max-width: 859px)");
    const h = () => setM(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", h); else mq.addListener(h);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", h); else mq.removeListener(h); };
  }, [modeForce]);
  return modeForce ? modeForce === "mobile" : m;
}

// ---------------------------------------------------------------------------
// Feuille de style (préfixe rvpp-). Mobile d'abord, container queries pour le desktop.
// ---------------------------------------------------------------------------

const CSS_PAGE = `
.rvpp-root{color:var(--pp-ink);background:var(--pp-bg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
.rvpp-root *,.rvpp-root *::before,.rvpp-root *::after{box-sizing:border-box}
.rvpp-root img{max-width:100%}
.rvpp-root button{font-family:inherit}
.rvpp-wrap{container-type:inline-size;container-name:rvpp}
.rvpp-root.rvpp-has-sticky{padding-bottom:88px}
.rvpp-sec{padding:var(--pp-sec-y) 16px;position:relative}
.rvpp-sec.rvpp-alt{background:var(--pp-alt)}
.rvpp-root.rvpp-ambiance{background:transparent}
.rvpp-ambiance .rvpp-sec.rvpp-alt{background:rgba(247,246,241,.62);background:color-mix(in srgb,var(--pp-alt) 60%,transparent);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}
.rvpp-in{max-width:1120px;margin:0 auto}
.rvpp-center{text-align:center}
.rvpp-h1{font-family:var(--pp-font-title);font-size:clamp(24px,6.4vw,34px);line-height:1.15;font-weight:800;margin:0 0 6px;letter-spacing:-.015em;overflow-wrap:anywhere}
.rvpp-h2{font-family:var(--pp-font-title);font-size:clamp(22px,5.4vw,30px);line-height:1.2;font-weight:800;margin:0 0 8px;letter-spacing:-.01em;overflow-wrap:anywhere}
.rvpp-sub{color:var(--pp-muted);font-size:15px;line-height:1.55;margin:0 0 22px}
.rvpp-desc{max-width:760px;margin:0 auto;font-size:15px;color:var(--pp-ink);line-height:1.65;overflow-wrap:anywhere}
.rvpp-desc img{max-width:100%!important;width:100%!important;height:auto!important;float:none!important;display:block!important;margin:14px auto!important;border-radius:8px!important;object-fit:contain!important}
.rvpp-desc video{max-width:100%!important;height:auto!important;display:block;margin:14px auto;border-radius:8px}
.rvpp-desc *{max-width:100%!important;box-sizing:border-box!important}
.rvpp-desc table{display:block!important;overflow-x:auto!important}
.rvpp-desc h1,.rvpp-desc h2,.rvpp-desc h3,.rvpp-desc h4{font-size:17px!important;font-weight:700!important;color:var(--pp-ink)!important;margin:22px 0 10px!important;line-height:1.4!important}
.rvpp-desc>:first-child{margin-top:0!important}
.rvpp-desc p{margin:0 0 12px!important;line-height:1.65!important}
.rvpp-desc strong,.rvpp-desc b{font-weight:700!important}
.rvpp-desc ul,.rvpp-desc ol{margin:0 0 14px!important;padding-left:20px!important}
.rvpp-desc li{margin-bottom:7px!important;line-height:1.55!important}
.rvpp-desc a{color:var(--pp-accent-ink)!important}
.rvpp-lead{color:var(--pp-muted);font-size:16px;line-height:1.55;margin:0 0 14px}
.rvpp-pill{display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:var(--pp-accent-soft);color:var(--pp-accent-ink)}
.rvpp-cta{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:100%;min-height:56px;padding:13px 18px;border:none;border-radius:var(--pp-radius);background:var(--pp-cta,var(--pp-accent));color:var(--pp-cta-txt,var(--pp-accent-txt));cursor:pointer;touch-action:manipulation;box-shadow:0 6px 18px var(--pp-cta-shadow,var(--pp-accent-shadow));transition:transform .12s ease,box-shadow .12s ease,opacity .12s}
.rvpp-cta:hover{transform:translateY(-1px)}
.rvpp-cta:active{transform:translateY(0)}
.rvpp-cta:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.rvpp-cta-t{font-weight:800;font-size:16px;line-height:1.25;text-align:center}
.rvpp-cta-s{font-weight:500;font-size:12.5px;opacity:.92}
.rvpp-cta-alt{background:#fff;color:var(--pp-accent-ink);border:2px solid var(--pp-accent);box-shadow:none}
.rvpp-card{background:#fff;border:1px solid var(--pp-line);border-radius:var(--pp-radius)}
.rvpp-hero-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.rvpp-gal-col,.rvpp-info-col{min-width:0}
.rvpp-price-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:10px 0 6px}
.rvpp-price{font-size:28px;font-weight:800;color:var(--pp-accent-ink)}
.rvpp-price-old{font-size:16px;color:#8A9089;text-decoration:line-through}
.rvpp-save{font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:6px;background:#EAF3DE;color:#3B6D11;text-transform:uppercase}
.rvpp-check{display:flex;flex-direction:column;gap:8px;margin:14px 0 16px}
.rvpp-check-i{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45;background:var(--pp-alt);border-radius:10px;padding:9px 12px}
.rvpp-check-i b{flex:0 0 auto;width:18px;height:18px;margin-top:1px;border-radius:5px;background:var(--pp-accent);color:var(--pp-accent-txt);display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.rvpp-listen{display:inline-flex;align-items:center;gap:7px;background:none;border:1.5px solid var(--pp-accent);color:var(--pp-accent-ink);border-radius:999px;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;margin:2px 0 12px;touch-action:manipulation}
.rvpp-listen-active{display:inline-flex;align-items:center;gap:8px;background:var(--pp-accent-soft);border:1.5px solid var(--pp-accent);border-radius:999px;padding:6px 8px 6px 16px;margin:2px 0 12px}
.rvpp-listen-active span{font-size:12px;font-weight:700;color:var(--pp-accent-ink)}
.rvpp-listen-btn{width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rvpp-listen-btn.play{background:var(--pp-accent);color:var(--pp-accent-txt)}
.rvpp-listen-btn.stop{background:#fff;border:1px solid var(--pp-accent);color:var(--pp-accent-ink)}
.rvpp-opt-t{font-size:13px;font-weight:700;margin:12px 0 7px}
.rvpp-chips{display:flex;flex-wrap:wrap;gap:8px}
.rvpp-chip{min-height:42px;padding:8px 16px;border-radius:999px;border:1.5px solid var(--pp-line);background:#fff;color:var(--pp-ink);font-size:13.5px;font-weight:700;cursor:pointer;touch-action:manipulation}
.rvpp-chip[aria-pressed="true"]{border-color:var(--pp-accent);background:var(--pp-accent-soft)}
.rvpp-trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}
.rvpp-trio>div{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:11.5px;font-weight:600;color:var(--pp-muted);line-height:1.3}
.rvpp-trio i{font-style:normal;width:40px;height:40px;border-radius:50%;background:var(--pp-accent-soft);display:flex;align-items:center;justify-content:center;font-size:18px}
.rvpp-offers{display:flex;flex-direction:column;gap:10px;margin:16px 0}
.rvpp-offer{position:relative;display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px;border-radius:var(--pp-radius);border:2px solid var(--pp-line);background:#fff;cursor:pointer;touch-action:manipulation;min-height:64px}
.rvpp-offer[aria-checked="true"]{border-color:var(--pp-accent);background:var(--pp-accent-soft)}
.rvpp-radio{flex:0 0 22px;width:22px;height:22px;border-radius:50%;border:2px solid #C9C5B8;display:flex;align-items:center;justify-content:center}
.rvpp-offer[aria-checked="true"] .rvpp-radio{border-color:var(--pp-accent);background:var(--pp-accent)}
.rvpp-offer[aria-checked="true"] .rvpp-radio::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--pp-accent-txt)}
.rvpp-offer-b{flex:1;min-width:0}
.rvpp-offer-l{font-weight:800;font-size:15.5px}
.rvpp-offer-eco{font-size:12.5px;font-weight:700;color:#2F7A1D}
.rvpp-offer-gift{font-size:12.5px;font-weight:700;color:#8A6412}
.rvpp-offer-txt{font-size:12.5px;color:var(--pp-muted)}
.rvpp-offer-p{text-align:right;flex:0 0 auto}
.rvpp-offer-p b{display:block;font-size:17px;font-weight:800;color:var(--pp-accent-ink)}
.rvpp-offer-p s{font-size:12.5px;color:#8A9089}
.rvpp-packs{display:grid;gap:12px;margin:20px 0 16px;container-type:inline-size;grid-template-columns:repeat(var(--n,2),minmax(0,1fr))}
.rvpp-packs.rvpp-n4{--n:2}
.rvpp-pack{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:22px 10px 14px;border-radius:var(--pp-radius);border:2px solid var(--pp-line);background:#fff;cursor:pointer;touch-action:manipulation;min-width:0;font:inherit;color:inherit;transition:border-color .15s,box-shadow .15s,transform .15s}
.rvpp-pack:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.08)}
.rvpp-pack:focus-visible{outline:3px solid var(--pp-accent);outline-offset:2px}
.rvpp-pack[aria-checked="true"]{border-color:var(--pp-accent);background:var(--pp-accent-soft);box-shadow:0 8px 24px var(--pp-accent-shadow)}
.rvpp-pack-tick{position:absolute;top:14px;left:9px;width:20px;height:20px;border-radius:50%;border:2px solid var(--pp-line);background:#fff;display:grid;place-items:center;font-size:11px;font-weight:900;color:transparent;line-height:1}
.rvpp-pack[aria-checked="true"] .rvpp-pack-tick{background:var(--pp-accent);border-color:var(--pp-accent);color:var(--pp-accent-txt)}
.rvpp-pack-ribbon{position:absolute;top:-13px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 4px);white-space:normal;text-align:center;line-height:1.15;background:var(--pp-accent);color:var(--pp-accent-txt);font-size:10px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;padding:4px 9px;border-radius:12px;box-shadow:0 4px 12px var(--pp-accent-shadow)}
.rvpp-pack-photos{display:flex;justify-content:center;align-items:center;height:56px;margin:4px 0 2px}
.rvpp-pack-photos i{display:block;width:44px;height:44px;border-radius:10px;border:2px solid #fff;background:var(--pp-alt) center/cover no-repeat;box-shadow:0 2px 8px rgba(0,0,0,.16);margin-left:-14px}
.rvpp-pack-photos i:first-child{margin-left:0}
.rvpp-pack-photos em{font-style:normal;font-weight:800;font-size:12px;margin-left:6px;color:var(--pp-muted)}
.rvpp-pack-l{font-weight:800;font-size:15px;line-height:1.2;overflow-wrap:anywhere}
.rvpp-pack-eco{display:inline-block;font-size:11.5px;font-weight:800;line-height:1.3;color:#2F7A1D;background:#E7F3DF;padding:3px 9px;border-radius:10px}
.rvpp-pack-gift{font-size:11.5px;font-weight:700;color:#8A6412}
.rvpp-pack-txt{font-size:11.5px;color:var(--pp-muted);line-height:1.35}
.rvpp-pack-p{display:flex;flex-direction:column;align-items:center;gap:1px;margin-top:auto;padding-top:4px}
.rvpp-pack-p b{font-size:18px;font-weight:900;color:var(--pp-accent-ink);line-height:1.15}
.rvpp-pack-p s{font-size:12px;color:#8A9089}
.rvpp-pack-p small{font-size:11.5px;color:var(--pp-muted)}
@container (max-width:340px){.rvpp-pack-tick{display:none}.rvpp-pack{padding:20px 6px 12px}.rvpp-pack-l{font-size:13.5px}.rvpp-pack-p b{font-size:15.5px}.rvpp-pack-photos i{width:36px;height:36px;margin-left:-12px}.rvpp-pack-photos{height:46px}}
.rvpp-offer-badge{position:absolute;top:-11px;right:12px;background:var(--pp-accent);color:var(--pp-accent-txt);font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
.rvpp-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.rvpp-ben{padding:18px;text-align:left}
.rvpp-ben-i{font-size:26px;line-height:1;margin-bottom:10px}
.rvpp-ben h3,.rvpp-step h3{font-size:16px;font-weight:800;margin:0 0 4px}
.rvpp-ben p,.rvpp-step p{font-size:14px;color:var(--pp-muted);margin:0;line-height:1.55}
.rvpp-steps{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);counter-reset:s}
.rvpp-step{display:flex;gap:14px;align-items:flex-start;padding:16px}
.rvpp-step-n{flex:0 0 36px;width:36px;height:36px;border-radius:50%;background:var(--pp-accent);color:var(--pp-accent-txt);font-weight:800;display:flex;align-items:center;justify-content:center}
.rvpp-video{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--pp-radius);overflow:hidden;background:#101512}
.rvpp-video iframe,.rvpp-video video,.rvpp-video img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover}
.rvpp-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:transparent;border:none;cursor:pointer}
.rvpp-play span{width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.94);color:#16231F;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.35);padding-left:5px}
.rvpp-rev{padding:16px;text-align:left}
.rvpp-rev-h{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:6px}
.rvpp-rev-h b{font-size:14px}
.rvpp-rev p{margin:0;font-size:14px;line-height:1.55}
.rvpp-rev img{width:72px;height:72px;object-fit:cover;border-radius:10px;margin-top:10px;border:1px solid var(--pp-line)}
.rvpp-ugc{overflow:hidden;text-align:left}
.rvpp-ugc-m{position:relative;aspect-ratio:4/5;background:var(--pp-alt)}
.rvpp-ugc-m img,.rvpp-ugc-m iframe,.rvpp-ugc-m video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0}
.rvpp-ugc-t{padding:12px 14px;font-size:13.5px;line-height:1.5}
.rvpp-faq{display:flex;flex-direction:column;gap:10px;max-width:820px;margin:0 auto}
.rvpp-faq details{border:1px solid var(--pp-line);border-radius:var(--pp-radius);background:#fff;padding:0 16px}
.rvpp-faq summary{list-style:none;cursor:pointer;padding:15px 0;font-weight:700;font-size:15.5px;display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:52px}
.rvpp-faq summary::-webkit-details-marker{display:none}
.rvpp-faq summary::after{content:"+";font-size:22px;font-weight:400;color:var(--pp-muted);flex:0 0 auto}
.rvpp-faq details[open] summary::after{content:"−"}
.rvpp-faq details p{margin:0 0 16px;color:var(--pp-muted);font-size:14.5px;line-height:1.6;white-space:pre-line}
.rvpp-cmp{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--pp-line);border-radius:var(--pp-radius);background:#fff;font-size:14px}
.rvpp-cmp th,.rvpp-cmp td{padding:12px 10px;text-align:center;border-bottom:1px solid var(--pp-line)}
.rvpp-cmp th:first-child,.rvpp-cmp td:first-child{text-align:left}
.rvpp-cmp tr:last-child td{border-bottom:none}
.rvpp-cmp th{background:var(--pp-alt);font-size:13px}
.rvpp-cmp .oui{color:#2F7A1D;font-weight:800}
.rvpp-cmp .non{color:#B33A2A;font-weight:800}
.rvpp-reas{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.rvpp-reas>div{display:flex;gap:12px;align-items:flex-start;padding:14px 16px}
.rvpp-reas i{font-style:normal;font-size:24px;line-height:1}
.rvpp-reas b{display:block;font-size:14.5px}
.rvpp-reas span{font-size:13.5px;color:var(--pp-muted)}
.rvpp-rail{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.rvpp-rail>button{scroll-snap-align:start;flex:0 0 154px;width:154px;background:#fff;border:1px solid var(--pp-line);border-radius:var(--pp-radius);padding:0;overflow:hidden;text-align:left;cursor:pointer}
.rvpp-rail .ph{aspect-ratio:1/1;background:var(--pp-alt);position:relative}
.rvpp-rail .ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.rvpp-rail .nm{font-size:13px;font-weight:700;padding:9px 11px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rvpp-rail .pr{font-size:13px;font-weight:800;color:var(--pp-accent-ink);padding:2px 11px 11px}
.rvpp-add{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px;border-radius:var(--pp-radius);border:2px solid var(--pp-line);background:#fff;cursor:pointer;min-height:64px;touch-action:manipulation}
.rvpp-add[aria-pressed="true"]{border-color:var(--pp-accent);background:var(--pp-accent-soft)}
.rvpp-add .bx{flex:0 0 24px;width:24px;height:24px;border-radius:7px;border:2px solid #C9C5B8;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--pp-accent-txt)}
.rvpp-add[aria-pressed="true"] .bx{background:var(--pp-accent);border-color:var(--pp-accent)}
.rvpp-add img{width:52px;height:52px;object-fit:cover;border-radius:10px;flex:0 0 auto;background:var(--pp-alt)}
.rvpp-imgtxt{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:center}
.rvpp-imgtxt img{width:100%;border-radius:var(--pp-radius);display:block;background:var(--pp-alt)}
.rvpp-band{background:var(--pp-accent);color:var(--pp-accent-txt);border-radius:calc(var(--pp-radius) + 4px);padding:28px 20px;text-align:center}
.rvpp-band .rvpp-h2{color:inherit}
.rvpp-band p{margin:0 0 16px;opacity:.94;font-size:15.5px}
.rvpp-band .rvpp-cta{background:#fff;color:#16231F;max-width:420px;margin:0 auto;box-shadow:none}
.rvpp-urgence{background:#FBEAE6;border:1.5px solid #F0C4B8;border-radius:var(--pp-radius);padding:18px 20px;text-align:center;max-width:520px;margin:0 auto}
.rvpp-urgence-titre{font-size:13px;font-weight:800;color:#B33A2A;margin-bottom:12px;text-transform:uppercase;letter-spacing:.02em}
.rvpp-urgence-timer{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.rvpp-urgence-u{background:#fff;border:1px solid #F0C4B8;border-radius:10px;padding:8px 13px;min-width:52px}
.rvpp-urgence-u b{display:block;font-size:22px;font-weight:800;color:#B33A2A;line-height:1.1;font-variant-numeric:tabular-nums}
.rvpp-urgence-u span{display:block;font-size:10px;color:#8A6412;text-transform:uppercase;margin-top:2px}
.rvpp-urgence-stock{margin-top:12px;font-size:12.5px;font-weight:700;color:#B33A2A}
.rvpp-formcard{padding:18px 16px;max-width:560px;margin:0 auto;box-shadow:0 10px 30px rgba(22,35,31,.08)}
.rvpp-info-list{display:grid;gap:10px;font-size:14.5px}
.rvpp-info-list div{display:flex;gap:10px;align-items:flex-start}
.rvpp-sticky{position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff;border-top:1px solid var(--pp-line);box-shadow:0 -6px 20px rgba(0,0,0,.09);padding:10px 14px calc(10px + env(safe-area-inset-bottom));transition:transform .2s ease}
.rvpp-sticky.rvpp-off{transform:translateY(110%)}
.rvpp-sticky-in{max-width:560px;margin:0 auto;display:flex;gap:8px;align-items:stretch}
.rvpp-sticky-in .rvpp-cta:not(.rvpp-cta-cart){flex:1;min-width:0}
.rvpp-sticky .rvpp-cta-cart{flex:0 0 56px;width:56px;padding:0;font-size:22px;background:#fff;color:var(--pp-cta,var(--pp-accent));border:2px solid var(--pp-cta,var(--pp-accent));box-shadow:none}
.rvpp-sticky .rvpp-cta{min-height:52px;padding:9px 16px}
.rvpp-preview .rvpp-sticky{position:sticky}
.rvpp-sel{cursor:pointer}
.rvpp-sel:hover{outline:2px dashed rgba(26,122,60,.45);outline-offset:-2px}
.rvpp-sel-on{outline:3px solid #1a7a3c!important;outline-offset:-3px}
.rvpp-empty{border:2px dashed #C9C5B8;border-radius:12px;padding:18px;text-align:center;color:#7a8077;font-size:13px;background:rgba(255,255,255,.7)}
.rvpp-zoom{overflow:hidden}
@media (hover:hover){.rvpp-zoomable{cursor:zoom-in}}
@container rvpp (min-width:560px){
  .rvpp-grid.c2,.rvpp-grid.c3,.rvpp-grid.c4{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rvpp-reas{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rvpp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}
  /* Tablette (portrait) : colonne unique, mais galerie plafonnée pour garder prix et bouton près du haut */
  .rvpp-gal-col{width:100%;max-width:600px;margin:0 auto}
  .rvpp-info-col{width:100%;max-width:600px;margin:0 auto}
}
@container rvpp (min-width:860px){
  .rvpp-gal-col,.rvpp-info-col{max-width:none;margin:0}
  .rvpp-sec{padding:calc(var(--pp-sec-y)*1.6) 32px}
  .rvpp-hero-grid{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:56px;align-items:start}
  .rvpp-gal-col{position:sticky;top:20px}
  .rvpp-grid.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rvpp-grid.c4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .rvpp-steps{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rvpp-reas{grid-template-columns:repeat(3,minmax(0,1fr))}
  .rvpp-imgtxt{grid-template-columns:repeat(2,minmax(0,1fr));gap:56px}
  .rvpp-imgtxt.rvpp-rev-order>:first-child{order:2}
  .rvpp-price{font-size:32px}
  .rvpp-rail>button{flex-basis:200px;width:200px}
  .rvpp-hide-d{display:none!important}
}
@container rvpp (max-width:859.98px){
  .rvpp-hide-m{display:none!important}
}
`;

// ---------------------------------------------------------------------------
// Galerie (image principale, miniatures, flèches, balayage tactile, zoom, plein écran, vidéo)
// ---------------------------------------------------------------------------

function ContenuVideo({ video, titre, autoplay = true }) {
  if (!video) return null;
  if (video.type === "fichier") {
    return <video src={video.src} controls playsInline autoPlay={autoplay} preload="metadata" title={titre || ""} />;
  }
  const sep = video.src.includes("?") ? "&" : "?";
  return (
    <iframe
      src={`${video.src}${autoplay ? `${sep}autoplay=1` : ""}`}
      title={titre || "Vidéo"}
      loading="lazy"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}

// Vidéo "façade" : rien n'est chargé (ni iframe, ni script tiers) avant le clic.
function VideoFacade({ url, titre, ratioClasse = "" }) {
  const video = useMemo(() => analyserVideo(url), [url]);
  const [lecture, setLecture] = useState(false);
  if (!video) return null;
  return (
    <div className={`rvpp-video ${ratioClasse}`}>
      {lecture ? (
        <ContenuVideo video={video} titre={titre} />
      ) : (
        <>
          {video.poster && <img src={video.poster} alt="" loading="lazy" decoding="async" />}
          <button type="button" className="rvpp-play" onClick={() => setLecture(true)} aria-label={`Lire la vidéo${titre ? ` : ${titre}` : ""}`}>
            <span>▶</span>
          </button>
        </>
      )}
    </div>
  );
}

function Galerie({ photos, video, alt, ratio = "carre", miniatures = true, zoom = true, accent }) {
  const items = useMemo(() => {
    const liste = (photos || []).filter(Boolean).map((url) => ({ type: "img", url }));
    const v = analyserVideo(video);
    if (v) liste.push({ type: "video", video: v, url: v.poster || null });
    return liste;
  }, [photos, video]);
  const nb = items.length;
  const [i, setI] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [plein, setPlein] = useState(false);
  const [loupe, setLoupe] = useState(null);
  const departX = useRef(null);
  const idx = nb > 0 ? Math.min(Math.max(i, 0), nb - 1) : 0;
  const courant = items[idx];
  const aller = (n) => { if (nb > 1) { setI((n + nb) % nb); setLecture(false); setLoupe(null); } };
  const ratioCss = ratio === "portrait" ? "4 / 5" : "1 / 1";
  const peutZoomer = zoom && courant?.type === "img";

  useEffect(() => {
    if (!plein) return undefined;
    const surTouche = (e) => {
      if (e.key === "Escape") setPlein(false);
      if (e.key === "ArrowRight") aller(idx + 1);
      if (e.key === "ArrowLeft") aller(idx - 1);
    };
    document.addEventListener("keydown", surTouche);
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", surTouche); document.body.style.overflow = ancien; };
  }, [plein, idx, nb]); // eslint-disable-line react-hooks/exhaustive-deps

  const fleche = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.92)", color: "#16231F", fontSize: 22, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 };

  const surMouvement = (e) => {
    if (!peutZoomer || (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(hover:hover)").matches)) return;
    const r = e.currentTarget.getBoundingClientRect();
    setLoupe({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div>
      <div
        className={`rvpp-zoom ${peutZoomer ? "rvpp-zoomable" : ""}`}
        style={{ position: "relative", width: "100%", aspectRatio: ratioCss, background: "var(--pp-alt)", borderRadius: "var(--pp-radius)", touchAction: "pan-y" }}
        onTouchStart={(e) => { departX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (departX.current == null) return;
          const dx = e.changedTouches[0].clientX - departX.current;
          departX.current = null;
          if (Math.abs(dx) > 45) aller(idx + (dx < 0 ? 1 : -1));
        }}
        onMouseMove={surMouvement}
        onMouseLeave={() => setLoupe(null)}
        onClick={() => { if (peutZoomer) setPlein(true); }}
      >
        {!courant && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>📦</div>}
        {courant?.type === "img" && (
          <img
            src={urlImageLegere(courant.url, 1000)}
            alt={alt}
            loading={idx === 0 ? "eager" : "lazy"}
            fetchPriority={idx === 0 ? "high" : "auto"}
            decoding="async"
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", transition: loupe ? "none" : "transform .2s", transform: loupe ? "scale(1.9)" : "none", transformOrigin: loupe ? `${loupe.x}% ${loupe.y}%` : "center" }}
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          />
        )}
        {courant?.type === "video" && (
          <div style={{ position: "absolute", inset: 0, background: "#101512" }} className="rvpp-video-in" onClick={(e) => e.stopPropagation()}>
            {lecture ? (
              <div style={{ position: "absolute", inset: 0 }} className="rvpp-video"><ContenuVideo video={courant.video} titre={alt} /></div>
            ) : (
              <>
                {courant.url && <img src={courant.url} alt="" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                <button type="button" className="rvpp-play" onClick={() => setLecture(true)} aria-label="Lire la vidéo"><span>▶</span></button>
              </>
            )}
          </div>
        )}
        {nb > 1 && (
          <>
            <button type="button" aria-label="Photo précédente" onClick={(e) => { e.stopPropagation(); aller(idx - 1); }} style={{ ...fleche, left: 10 }}>‹</button>
            <button type="button" aria-label="Photo suivante" onClick={(e) => { e.stopPropagation(); aller(idx + 1); }} style={{ ...fleche, right: 10 }}>›</button>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center", gap: 6, zIndex: 2, pointerEvents: "none" }}>
              {items.map((_, k) => <span key={k} style={{ width: k === idx ? 18 : 7, height: 7, borderRadius: 999, background: k === idx ? accent : "rgba(22,35,31,.28)", transition: "width .15s" }} />)}
            </div>
          </>
        )}
        {peutZoomer && (
          <button type="button" aria-label="Agrandir l'image" onClick={(e) => { e.stopPropagation(); setPlein(true); }} style={{ position: "absolute", top: 10, right: 10, width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.92)", cursor: "pointer", fontSize: 16, zIndex: 2, boxShadow: "0 2px 10px rgba(0,0,0,.2)" }}>⤢</button>
        )}
      </div>

      {miniatures && nb > 1 && (
        <div style={{ display: "flex", gap: 8, padding: "10px 2px 2px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {items.map((it, k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setI(k); setLecture(false); }}
              aria-label={it.type === "video" ? "Voir la vidéo" : `Voir la photo ${k + 1}`}
              style={{ position: "relative", flex: "0 0 auto", width: 64, height: 64, borderRadius: 10, overflow: "hidden", padding: 0, background: "var(--pp-alt)", cursor: "pointer", border: k === idx ? `2px solid ${accent}` : "1px solid var(--pp-line)", opacity: k === idx ? 1 : 0.82 }}
            >
              {it.url ? <img src={urlImageLegere(it.url, 200)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { if (e.target.dataset.rvOrig !== "1" && e.target.src !== it.url) { e.target.dataset.rvOrig = "1"; e.target.src = it.url; } }} /> : <span style={{ fontSize: 22 }}>🎬</span>}
              {it.type === "video" && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.28)", color: "#fff", fontSize: 18 }}>▶</span>}
            </button>
          ))}
        </div>
      )}

      {plein && courant?.type === "img" && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image en plein écran"
          onClick={() => setPlein(false)}
          onTouchStart={(e) => { departX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (departX.current == null) return;
            const dx = e.changedTouches[0].clientX - departX.current;
            departX.current = null;
            if (Math.abs(dx) > 60) aller(idx + (dx < 0 ? 1 : -1));
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,12,10,.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <img src={courant.url} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} onClick={(e) => e.stopPropagation()} />
          <button type="button" aria-label="Fermer" onClick={() => setPlein(false)} style={{ position: "absolute", top: 14, right: 14, width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.95)", fontSize: 22, cursor: "pointer" }}>×</button>
          {nb > 1 && (
            <>
              <button type="button" aria-label="Précédente" onClick={(e) => { e.stopPropagation(); aller(idx - 1); }} style={{ ...fleche, left: 14, width: 46, height: 46 }}>‹</button>
              <button type="button" aria-label="Suivante" onClick={(e) => { e.stopPropagation(); aller(idx + 1); }} style={{ ...fleche, right: 14, width: 46, height: 46 }}>›</button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offres & packs (cartes sélectionnables)
// ---------------------------------------------------------------------------

// Boutique multi-monnaies : économie = différence des prix arrondis affichés (sinon 14 € − 10 € pourrait s'afficher « 3,50 € »).
function economieAffichee(ancien, total, brut) {
  return monnaieAffichage() && Number(ancien) > 0 ? arrondiLocalBase(ancien) - arrondiLocalBase(total) : brut;
}

function OffresListe({ ctx, blocOffres, afficherEconomie = true }) {
  const { produit, devise, etat, actions } = ctx;
  const { source, liste } = useMemo(() => calculerOffresAffichees(produit, blocOffres), [produit, blocOffres]);
  if (liste.length === 0) return null;
  const prixBase = Math.round(Number(produit.prix_vente) || 0);
  // Source "produit" : les bundles existants n'incluent pas l'offre "1 produit" → on l'ajoute
  // (sélection = aucun bundle, quantité 1 : exactement le comportement historique).
  const cartes = source === "produit"
    ? [{ id: null, label: "1 produit", qty: 1, total: prixBase, ancienTotal: null, economie: 0, pctEco: 0, parUnite: null, cadeau: "", badge: "", texte: "" }, ...liste]
    : liste;
  const choisi = etat.bundleChoisiId == null ? null : String(etat.bundleChoisiId);
  const choisir = (o) => actions.onChoisirOffre(o.id == null ? null : { id: o.id, qty: o.qty, label: o.label, total: o.total });
  // Présentation : cartes avec photos (2 à 4 packs), sinon liste. Les cartes sont la valeur par défaut.
  const modeDemande = (blocOffres && blocOffres.props && blocOffres.props.affichage) || "cartes";
  const enCartes = modeDemande === "cartes" && cartes.length >= 2 && cartes.length <= 4;

  if (enCartes) {
    // Affichée en CSS background-image (empilement de miniatures) : impossible d'y détecter un
    // échec de chargement et de retomber sur l'originale, donc on demande volontairement une
    // largeur au-dessus du seuil de vignette (voir urlImageLegere dans blocs.js) — jamais de
    // photo cassée ici, même pour un produit envoyé avant l'existence de la vignette.
    const photo = urlImageLegere(produit.photo_url, 900);
    return (
      <div className={`rvpp-packs${cartes.length === 4 ? " rvpp-n4" : ""}`} style={{ "--n": cartes.length === 4 ? 2 : cartes.length }} role="radiogroup" aria-label="Choisissez votre offre">
        {cartes.map((o) => {
          const actif = (o.id == null ? null : String(o.id)) === choisi;
          const nbPhotos = Math.min(3, Math.max(1, o.qty || 1));
          return (
            <button key={o.id ?? "base"} type="button" role="radio" aria-checked={actif} className="rvpp-pack" onClick={() => choisir(o)}>
              {o.badge && <span className="rvpp-pack-ribbon">{o.badge}</span>}
              <span className="rvpp-pack-tick" aria-hidden="true">✓</span>
              <span className="rvpp-pack-photos" aria-hidden="true">
                {Array.from({ length: nbPhotos }).map((_, k) => (
                  <i key={k} style={photo ? { backgroundImage: `url(${photo})` } : undefined} />
                ))}
                {(o.qty || 1) > 3 && <em>×{o.qty}</em>}
              </span>
              <span className="rvpp-pack-l">{o.label}</span>
              {afficherEconomie && o.economie > 0 && <span className="rvpp-pack-eco">{o.pctEco > 0 ? `−${o.pctEco}% · ` : ""}Économisez {formaterMontant(economieAffichee(o.ancienTotal, o.total, o.economie), devise)}</span>}
              {o.cadeau && <span className="rvpp-pack-gift">🎁 {o.cadeau}</span>}
              {o.texte && <span className="rvpp-pack-txt">{o.texte}</span>}
              <span className="rvpp-pack-p">
                <b>{formaterMontant(o.total, devise)}</b>
                {o.ancienTotal && <s>{formaterMontant(o.ancienTotal, devise)}</s>}
                {o.parUnite ? <small>soit {formaterMontant(o.parUnite, devise)} / unité</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rvpp-offers" role="radiogroup" aria-label="Choisissez votre offre">
      {cartes.map((o) => {
        const actif = (o.id == null ? null : String(o.id)) === choisi;
        return (
          <button
            key={o.id ?? "base"}
            type="button"
            role="radio"
            aria-checked={actif}
            className="rvpp-offer"
            onClick={() => choisir(o)}
            style={o.couleurFond && !actif ? { background: o.couleurFond } : undefined}
          >
            {o.badge && <span className="rvpp-offer-badge">{o.badge}</span>}
            <span className="rvpp-radio" aria-hidden="true" />
            <span className="rvpp-offer-b">
              <span className="rvpp-offer-l">{o.label}</span>
              {afficherEconomie && o.economie > 0 && <span className="rvpp-offer-eco" style={{ display: "block" }}>Économisez {formaterMontant(economieAffichee(o.ancienTotal, o.total, o.economie), devise)}</span>}
              {o.cadeau && <span className="rvpp-offer-gift" style={{ display: "block" }}>🎁 {o.cadeau}</span>}
              {o.texte && <span className="rvpp-offer-txt" style={{ display: "block" }}>{o.texte}</span>}
            </span>
            <span className="rvpp-offer-p">
              <b>{formaterMontant(o.total, devise)}</b>
              {o.ancienTotal && <s>{formaterMontant(o.ancienTotal, devise)}</s>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bouton "Écouter" — même principe que la fiche produit historique (synthèse vocale native du
// navigateur, gratuite), mais absent jusqu'ici des pages tunnel : c'est pourtant là que va le
// plus de trafic publicitaire payant. Lit d'abord un résumé (nom, prix, livraison, points forts),
// puis la description complète du produit si elle existe. Se masque silencieusement si l'appareil
// ne supporte pas la synthèse vocale, ou s'il n'y a rien à lire.
// ---------------------------------------------------------------------------

function BoutonEcouterPage({ texteAudio, langue, lib }) {
  const [etat, setEtat] = useState("idle"); // idle | lecture | pause
  const supporte = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    // Coupe la lecture si la personne change de produit ou quitte la page —
    // sinon la voix continue de lire un produit qu'on ne regarde plus.
    return () => {
      if (supporte) window.speechSynthesis.cancel();
    };
  }, [texteAudio]);

  if (!supporte || !texteAudio) return null;

  function demarrer() {
    window.speechSynthesis.cancel();
    const langueCible = langue === "en" ? "en-US" : "fr-FR";
    const utterance = new SpeechSynthesisUtterance(texteAudio);
    utterance.lang = langueCible;
    utterance.rate = 0.92;
    utterance.pitch = 1;

    // Même choix de voix que la fiche produit historique : privilégier une voix "réseau"
    // (Google, Microsoft en ligne), nettement plus naturelle que la voix locale par défaut.
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
      <button type="button" className="rvpp-listen" onClick={demarrer}>
        🔊 {lib("ecouterDescription", "Écouter la fiche produit")}
      </button>
    );
  }

  return (
    <div className="rvpp-listen-active">
      <span>{etat === "lecture" ? `🔊 ${lib("lectureAudioEnCours", "Lecture en cours…")}` : `⏸️ ${lib("lectureAudioEnPause", "En pause")}`}</span>
      <button type="button" className="rvpp-listen-btn play" onClick={basculerPause} title={etat === "lecture" ? "Pause" : "Reprendre"}>
        {etat === "lecture" ? "⏸" : "▶"}
      </button>
      <button type="button" className="rvpp-listen-btn stop" onClick={arreter} title="Arrêter">✕</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Informations produit (utilisé par Hero et par le bloc "Infos produit")
// ---------------------------------------------------------------------------

function InfoProduit({ p, ctx, blocOffres }) {
  const { produit, devise, etat, actions, liv, t, entreprise } = ctx;
  const titre = (p.titre || "").trim() || produit.produit_nom;
  const nbAvis = Number(produit.nb_avis) || 0;
  const note = Number(produit.note_moyenne) || 0;
  const prixVente = etat.prixBase;
  const prixBarre = Number(produit.prix_barre);
  const aBarre = p.afficher_ancien_prix !== false && Number.isFinite(prixBarre) && prixBarre > prixVente && prixVente > 0;
  const pct = aBarre ? Math.round((1 - prixVente / prixBarre) * 100) : 0;
  const options = Array.isArray(produit.options) ? produit.options : [];
  const aOptions = options.length > 0;
  const benefices = (p.benefices || []).map((b) => (b?.texte || "").trim()).filter(Boolean);
  const points = benefices.length > 0 ? benefices : (p.utiliser_points_forts !== false ? ctx.pointsForts : []);
  const libCta = (p.cta_texte || "").trim() || ctx.libelleCta;
  const stock = Number(produit.stock_initial);
  const lib = (k, secours) => { const v = t ? t(k) : secours; return v && v !== k ? v : secours; };
  const langue = entreprise?.langue;
  // Résumé (nom, prix, livraison, points forts) + description complète du produit, mis bout à
  // bout pour la lecture vocale — voir BoutonEcouterPage ci-dessus. Recalculé seulement quand
  // ces infos changent (pas à chaque frappe dans le formulaire de commande, par exemple).
  const texteAudio = useMemo(() => {
    const resume = construireResumeVocal({
      nom: titre, prix: prixVente, devise, livraisonGratuite: liv.gratuite, fraisLivraison: liv.frais, points, langue,
    });
    const description = extraireTextePourAudio(ctx.descriptionReste);
    return [resume, description].filter(Boolean).join(". ").replace(/\.\.+/g, ".").trim();
  }, [titre, prixVente, devise, liv.gratuite, liv.frais, points, langue, ctx.descriptionReste]);
  return (
    <div>
      {(p.badge || "").trim() && <div style={{ marginBottom: 8 }}><span className="rvpp-pill">{p.badge}</span></div>}
      {p.afficher_avis !== false && nbAvis > 0 && note > 0 && (
        <button type="button" onClick={() => ctx.allerVers("rvpp-avis")} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, background: "none", border: "none", padding: 0, marginBottom: 8, cursor: "pointer", textAlign: "left", color: "inherit" }}>
          <Etoiles note={note} />
          <span style={{ fontSize: 13, color: "var(--pp-muted)" }}>{note}/5 — {nbAvis} avis</span>
        </button>
      )}
      <h1 className="rvpp-h1">{titre}</h1>
      {(p.sous_titre || "").trim() && <p className="rvpp-lead" style={{ marginBottom: 4 }}>{p.sous_titre}</p>}

      {p.afficher_prix !== false && (
        <div className="rvpp-price-row">
          <span className="rvpp-price">{formaterMontant(prixVente, devise)}</span>
          {aBarre && <span className="rvpp-price-old">{formaterMontant(prixBarre, devise)}</span>}
          {aBarre && p.afficher_economie !== false && pct > 0 && <span className="rvpp-save">-{pct}% · {lib("economisez", "Économisez")} {formaterMontant(economieAffichee(prixBarre, prixVente, prixBarre - prixVente), devise)}</span>}
        </div>
      )}

      {liv.gratuite ? (
        <div style={{ display: "inline-block", fontSize: 12.5, fontWeight: 700, color: "#1F9D6E", background: "#EAF7F1", padding: "4px 10px", borderRadius: 999, margin: "2px 0 8px" }}>{lib("livraisonGratuite", "🎁 Livraison gratuite")}</div>
      ) : liv.frais > 0 && !liv.aChoix ? (
        <div style={{ fontSize: 13, color: "var(--pp-muted)", margin: "2px 0 8px" }}>🚚 + {formaterMontant(liv.frais, devise)} {lib("deFraisLivraison", "de frais de livraison")}</div>
      ) : null}

      {p.afficher_stock && stock > 0 && stock <= 5 && (
        <div style={{ display: "inline-block", fontSize: 12.5, fontWeight: 700, color: "#B33A2A", background: "#FBEAE6", padding: "4px 10px", borderRadius: 999, margin: "2px 0 8px" }}>⚡ {lib("plusQue", "Plus que")} {stock} {lib("enStock", "en stock")}</div>
      )}

      {points.length > 0 && (
        <div className="rvpp-check">
          {points.map((b, k) => (<div className="rvpp-check-i" key={k}><b aria-hidden="true">✓</b><span>{b}</span></div>))}
        </div>
      )}

      <BoutonEcouterPage texteAudio={texteAudio} langue={langue} lib={lib} />

      {aOptions && (
        <div id="rvpp-options" style={{ marginBottom: 6, scrollMarginTop: 80 }}>
          {options.map((o) => (
            <div key={o.nom}>
              <div className="rvpp-opt-t">{o.nom} <span style={{ color: "#D64933" }}>*</span></div>
              <div className="rvpp-chips">
                {(o.valeurs || []).map((val) => (
                  <button key={val} type="button" className="rvpp-chip" aria-pressed={etat.optionsChoisies[o.nom] === val} onClick={() => actions.onChoisirOption(o.nom, val)}>{val}</button>
                ))}
              </div>
            </div>
          ))}
          {ctx.optionsManquantes && !etat.toutesOptionsChoisies && <div role="alert" style={{ fontSize: 12.5, color: "#D64933", marginTop: 6, fontWeight: 700 }}>⚠️ Merci de choisir {options.map((o) => o.nom.toLowerCase()).join(", ")} avant de commander.</div>}
          {etat.toutesOptionsChoisies && !etat.varianteActive && <div style={{ fontSize: 12.5, color: "#D64933", marginTop: 6 }}>⚠️ Cette combinaison n'est pas disponible.</div>}
          {etat.varianteEnRupture && <div style={{ fontSize: 12.5, color: "#D64933", marginTop: 6, fontWeight: 700 }}>🔴 Cette variante est en rupture de stock.</div>}
        </div>
      )}

      {p.afficher_offres !== false && !aOptions && <OffresListe ctx={ctx} blocOffres={blocOffres} />}

      <div style={{ margin: "16px 0 0" }}>
        <button id="rvpp-cta-principal" type="button" className="rvpp-cta" disabled={etat.varianteEnRupture} onClick={() => ctx.cliquerCta("hero")}>
          <span className="rvpp-cta-t">{libCta}</span>
          {p.afficher_cod !== false && <span className="rvpp-cta-s">💵 {lib("badgePaiement2", "Paiement à la livraison")}</span>}
        </button>
        {p.afficher_reassurance !== false && (
          <div className="rvpp-trio">
            <div><i>💵</i>{lib("badgePaiement2", "Paiement à la livraison")}</div>
            <div><i>🚚</i>{lib("badgeLivraison2", "Livraison rapide")}</div>
            <div><i>✅</i>{lib("badgeVerifie", "Vérifiez avant de payer")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocs
// ---------------------------------------------------------------------------

function TitreSection({ titre, sous, centre = true }) {
  if (!(titre || "").trim() && !(sous || "").trim()) return null;
  return (
    <div className={centre ? "rvpp-center" : ""} style={{ marginBottom: 6 }}>
      {(titre || "").trim() && <h2 className="rvpp-h2">{titre}</h2>}
      {(sous || "").trim() && <p className="rvpp-sub" style={{ maxWidth: 640, margin: centre ? "0 auto 22px" : "0 0 22px" }}>{sous}</p>}
    </div>
  );
}

function BlocHero({ bloc, ctx }) {
  const p = bloc.props;
  return (
    <div className="rvpp-hero-grid">
      <div className="rvpp-gal-col">
        <Galerie photos={ctx.photos} video={p.video_url} alt={ctx.produit.produit_nom} ratio={p.ratio_galerie} accent={ctx.accent} />
      </div>
      <div className="rvpp-info-col"><InfoProduit p={p} ctx={ctx} blocOffres={ctx.blocOffres} /></div>
    </div>
  );
}

function BlocGalerie({ bloc, ctx }) {
  const p = bloc.props;
  return <div style={{ maxWidth: 640, margin: "0 auto" }}><Galerie photos={ctx.photos} video={p.video_url} alt={ctx.produit.produit_nom} ratio={p.ratio_galerie} miniatures={p.afficher_miniatures !== false} zoom={p.zoom !== false} accent={ctx.accent} /></div>;
}

function BlocInfo({ bloc, ctx }) {
  return <div style={{ maxWidth: 640, margin: "0 auto" }}><InfoProduit p={bloc.props} ctx={ctx} blocOffres={ctx.blocOffres} /></div>;
}

function BlocBenefices({ bloc, ctx }) {
  const p = bloc.props;
  let items = (p.items || []).filter((i) => (i.titre || "").trim() || (i.texte || "").trim());
  if (items.length === 0 && p.utiliser_points_forts) items = ctx.pointsForts.map((t) => ({ icone: "✔️", titre: t, texte: "" }));
  const col = ["2", "3", "4"].includes(String(p.colonnes)) ? `c${p.colonnes}` : "c3";
  return (
    <>
      <TitreSection titre={p.titre} sous={p.sous_titre} />
      <div className={`rvpp-grid ${col}`}>
        {items.map((i, k) => (
          <div className="rvpp-card rvpp-ben" key={k}>
            {(i.icone || "").trim() && <div className="rvpp-ben-i" aria-hidden="true">{i.icone}</div>}
            {(i.titre || "").trim() && <h3>{i.titre}</h3>}
            {(i.texte || "").trim() && <p>{i.texte}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

function BlocVideo({ bloc }) {
  const p = bloc.props;
  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <TitreSection titre={p.titre} sous={p.sous_titre} />
      <VideoFacade url={p.url} titre={p.titre} />
      {(p.legende || "").trim() && <p className="rvpp-sub rvpp-center" style={{ marginTop: 10, marginBottom: 0, fontSize: 13.5 }}>{p.legende}</p>}
    </div>
  );
}

function BlocEtapes({ bloc }) {
  const p = bloc.props;
  const etapes = (p.etapes || []).filter((e) => (e.titre || "").trim() || (e.texte || "").trim());
  return (
    <>
      <TitreSection titre={p.titre} sous={p.sous_titre} />
      <div className="rvpp-steps">
        {etapes.map((e, k) => (
          <div className="rvpp-card rvpp-step" key={k}>
            <div className="rvpp-step-n">{k + 1}</div>
            <div><h3>{e.titre}</h3>{(e.texte || "").trim() && <p>{e.texte}</p>}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function BlocOffres({ bloc, ctx }) {
  const p = bloc.props;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <TitreSection titre={p.titre} sous={p.sous_titre} />
      <OffresListe ctx={ctx} blocOffres={bloc} afficherEconomie={p.afficher_economie !== false} />
      <button type="button" className="rvpp-cta" onClick={() => ctx.cliquerCta("offres")}>
        <span className="rvpp-cta-t">{ctx.libelleCta}</span>
      </button>
    </div>
  );
}

function BlocAvis({ bloc, ctx }) {
  const p = bloc.props;
  const max = Math.max(1, Math.min(24, Number(p.max) || 6));
  const liste = ctx.avis.slice(0, max);
  const nb = Number(ctx.produit.nb_avis) || ctx.avis.length;
  const note = Number(ctx.produit.note_moyenne) || (ctx.avis.length ? ctx.avis.reduce((s, a) => s + Number(a.note || 0), 0) / ctx.avis.length : 0);
  return (
    <>
      <TitreSection titre={p.titre} />
      {p.afficher_note !== false && note > 0 && (
        <div className="rvpp-center" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{Number(note).toFixed(1)}<span style={{ fontSize: 16, color: "var(--pp-muted)", fontWeight: 600 }}>/5</span></div>
          <Etoiles note={note} taille={18} />
          <div style={{ fontSize: 13, color: "var(--pp-muted)", marginTop: 2 }}>{nb} avis</div>
        </div>
      )}
      <div className="rvpp-grid c2">
        {liste.map((a, k) => (
          <div className="rvpp-card rvpp-rev" key={k}>
            <div className="rvpp-rev-h"><b>{a.client_nom}</b><Etoiles note={a.note} taille={13} /></div>
            {(a.commentaire || "").trim() && <p>{a.commentaire}</p>}
            {p.afficher_photos !== false && a.photo_url && <img src={a.photo_url} alt="Photo du client" loading="lazy" decoding="async" />}
          </div>
        ))}
      </div>
    </>
  );
}

function BlocUGC({ bloc }) {
  const p = bloc.props;
  const items = (p.items || []).filter((i) => (i.image || "").trim() || (i.texte || "").trim() || analyserVideo(i.video_url));
  const col = ["2", "3", "4"].includes(String(p.colonnes)) ? `c${p.colonnes}` : "c3";
  return (
    <>
      <TitreSection titre={p.titre} />
      <div className={`rvpp-grid ${col}`}>
        {items.map((i, k) => (
          <div className="rvpp-card rvpp-ugc" key={k}>
            {(i.image || "").trim() || analyserVideo(i.video_url) ? (
              <div className="rvpp-ugc-m">
                {analyserVideo(i.video_url) ? <VideoFacadeCarre url={i.video_url} poster={i.image} /> : <img src={i.image} alt={i.nom ? `Photo de ${i.nom}` : "Photo client"} loading="lazy" decoding="async" />}
              </div>
            ) : null}
            {((i.nom || "").trim() || (i.texte || "").trim()) && (
              <div className="rvpp-ugc-t">{(i.texte || "").trim() && <div>« {i.texte} »</div>}{(i.nom || "").trim() && <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{i.nom}</div>}</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function VideoFacadeCarre({ url, poster }) {
  const video = useMemo(() => analyserVideo(url), [url]);
  const [lecture, setLecture] = useState(false);
  if (!video) return null;
  if (lecture) return <ContenuVideo video={video} />;
  const affiche = poster || video.poster;
  return (
    <>
      {affiche && <img src={affiche} alt="" loading="lazy" decoding="async" />}
      <button type="button" className="rvpp-play" onClick={() => setLecture(true)} aria-label="Lire la vidéo"><span>▶</span></button>
    </>
  );
}

function BlocReassurance({ bloc }) {
  const p = bloc.props;
  const items = (p.items || []).filter((i) => (i.titre || "").trim() || (i.texte || "").trim());
  return (
    <>
      <TitreSection titre={p.titre} />
      <div className="rvpp-reas">
        {items.map((i, k) => (
          <div className="rvpp-card" key={k}>
            <i aria-hidden="true">{i.icone || "✅"}</i>
            <div>{(i.titre || "").trim() && <b>{i.titre}</b>}{(i.texte || "").trim() && <span>{i.texte}</span>}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function BlocComparaison({ bloc, ctx }) {
  const p = bloc.props;
  const lignes = (p.lignes || []).filter((l) => (l.critere || "").trim());
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <TitreSection titre={p.titre} />
      <table className="rvpp-cmp">
        <thead><tr><th />
          <th style={{ color: "var(--pp-accent-ink)" }}>{(p.colonne_nous || "").trim() || ctx.produit.produit_nom}</th>
          <th>{(p.colonne_autres || "").trim() || "Autres"}</th></tr></thead>
        <tbody>
          {lignes.map((l, k) => (
            <tr key={k}>
              <td>{l.critere}</td>
              <td className={l.nous ? "oui" : "non"}>{l.nous ? "✓" : "✕"}</td>
              <td className={l.autres ? "oui" : "non"}>{l.autres ? "✓" : "✕"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlocFAQ({ bloc }) {
  const p = bloc.props;
  const items = (p.items || []).filter((i) => (i.question || "").trim() && (i.reponse || "").trim());
  return (
    <>
      <TitreSection titre={p.titre} />
      <div className="rvpp-faq">
        {items.map((i, k) => (<details key={k}><summary>{i.question}</summary><p>{i.reponse}</p></details>))}
      </div>
    </>
  );
}

function CarteComplement({ prod, prixSpecial, devise, actif, onClick, texte }) {
  const prix = Number(prod.prix_vente) || 0;
  const special = prixSpecial === "" || prixSpecial == null || !Number.isFinite(Number(prixSpecial)) ? null : Number(prixSpecial);
  const prixFinal = special != null ? special : prix;
  return (
    <button type="button" className="rvpp-add" aria-pressed={actif} onClick={onClick}>
      <span className="bx" aria-hidden="true">{actif ? "✓" : ""}</span>
      {prod.photo_url ? <img src={urlImageLegere(prod.photo_url, 200)} alt="" loading="lazy" decoding="async" onError={(e) => { if (e.target.dataset.rvOrig !== "1" && e.target.src !== prod.photo_url) { e.target.dataset.rvOrig = "1"; e.target.src = prod.photo_url; } }} /> : <span style={{ width: 52, height: 52, borderRadius: 10, background: "var(--pp-alt)", flex: "0 0 auto" }} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prod.produit_nom}</span>
        {(texte || "").trim() && <span style={{ display: "block", fontSize: 12.5, color: "var(--pp-muted)" }}>{texte}</span>}
      </span>
      <span style={{ textAlign: "right", flex: "0 0 auto" }}>
        <b style={{ display: "block", color: "var(--pp-accent-ink)" }}>+{formaterMontant(prixFinal, devise)}</b>
        {special != null && special < prix && <s style={{ fontSize: 12, color: "#8A9089" }}>{formaterMontant(prix, devise)}</s>}
      </span>
    </button>
  );
}

function BlocUpsell({ bloc, ctx }) {
  const p = bloc.props;
  const prod = ctx.produits.find((x) => x.produit_id === p.produit_id);
  if (!prod) return null;
  const actif = ctx.etat.produitBumpId === prod.produit_id;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <TitreSection titre={p.titre} />
      <CarteComplement prod={prod} prixSpecial={p.prix_special} devise={ctx.devise} actif={actif} texte={p.texte} onClick={() => ctx.actions.onToggleBump(prod.produit_id)} />
    </div>
  );
}

function BlocGroupee({ bloc, ctx }) {
  const p = bloc.props;
  const prod = ctx.produits.find((x) => x.produit_id === p.produit_id);
  if (!prod) return null;
  const actif = ctx.etat.produitBumpId === prod.produit_id;
  const special = p.prix_special === "" || p.prix_special == null || !Number.isFinite(Number(p.prix_special)) ? null : Number(p.prix_special);
  const compPrix = special != null ? special : Number(prod.prix_vente) || 0;
  const total = arrondiLocalBase(ctx.etat.prixBase) + arrondiLocalBase(compPrix);
  const normal = arrondiLocalBase(ctx.etat.prixBase) + arrondiLocalBase(Number(prod.prix_vente) || 0);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <TitreSection titre={p.titre} sous={p.texte} />
      <div className="rvpp-card" style={{ padding: 16, borderColor: actif ? "var(--pp-accent)" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {[ctx.produit, prod].map((x, k) => (
            <React.Fragment key={x.produit_id || k}>
              {k === 1 && <span style={{ fontSize: 22, fontWeight: 800 }}>+</span>}
              <div style={{ textAlign: "center", width: 96 }}>
                <div style={{ aspectRatio: "1/1", background: "var(--pp-alt)", borderRadius: 12, overflow: "hidden" }}>{x.photo_url && <img src={urlImageLegere(x.photo_url, 400)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { if (e.target.dataset.rvOrig !== "1" && e.target.src !== x.photo_url) { e.target.dataset.rvOrig = "1"; e.target.src = x.photo_url; } }} />}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.produit_nom}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="rvpp-center" style={{ margin: "14px 0" }}>
          {(p.badge || "").trim() && <div style={{ marginBottom: 6 }}><span className="rvpp-pill">{p.badge}</span></div>}
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--pp-accent-ink)" }}>{formaterMontant(total, ctx.devise)}</span>
          {normal > total && <s style={{ marginLeft: 8, color: "#8A9089" }}>{formaterMontant(normal, ctx.devise)}</s>}
        </div>
        <button type="button" className={`rvpp-cta ${actif ? "rvpp-cta-alt" : ""}`} onClick={() => ctx.actions.onToggleBump(prod.produit_id)}>
          <span className="rvpp-cta-t">{actif ? "✓ Complément ajouté (retirer)" : `Ajouter « ${prod.produit_nom} » à ma commande`}</span>
        </button>
      </div>
    </div>
  );
}

function BlocCrossSell({ bloc, ctx }) {
  const p = bloc.props;
  return (
    <>
      <TitreSection titre={p.titre} centre={false} />
      <div className="rvpp-rail">
        {ctx.produitsCrossSell.map((x) => {
          const barre = Number(x.prix_barre);
          return (
            <button key={x.produit_id} type="button" onClick={() => ctx.actions.onOuvrirProduit(x)}>
              <span className="ph" style={{ display: "block" }}>{x.photo_url ? <img src={urlImageLegere(x.photo_url, 400)} alt={x.produit_nom} loading="lazy" decoding="async" onError={(e) => { if (e.target.dataset.rvOrig !== "1" && e.target.src !== x.photo_url) { e.target.dataset.rvOrig = "1"; e.target.src = x.photo_url; } }} /> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📦</span>}</span>
              <span className="nm" style={{ display: "block" }}>{x.produit_nom}</span>
              <span className="pr" style={{ display: "block" }}>{formaterMontant(x.prix_vente, ctx.devise)}{Number.isFinite(barre) && barre > Number(x.prix_vente) && <s style={{ marginLeft: 6, color: "#8A9089", fontWeight: 500 }}>{formaterMontant(barre, ctx.devise)}</s>}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BlocFormulaire({ bloc, ctx }) {
  const p = bloc.props;
  const ref = useRef(null);
  useEffect(() => {
    if (ctx.preview || !ref.current || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { ctx.evenement("formulaire_ouvert"); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} id="rvpp-commande" className="rvpp-card rvpp-formcard" onFocusCapture={() => ctx.evenement("formulaire_commence")}>
      {(p.titre || "").trim() && <h2 className="rvpp-h2 rvpp-center" style={{ fontSize: "clamp(20px,5vw,26px)" }}>{p.titre}</h2>}
      {(p.sous_titre || "").trim() && <p className="rvpp-sub rvpp-center" style={{ marginBottom: 16 }}>{p.sous_titre}</p>}
      {ctx.rendreFormulaire ? ctx.rendreFormulaire() : null}
    </div>
  );
}

function BlocLivraison({ bloc, ctx }) {
  const p = bloc.props;
  const { liv, devise, entreprise } = ctx;
  const lignes = [];
  if (p.afficher_frais !== false) {
    if (liv.gratuite) lignes.push(["🎁", "Livraison gratuite pour ce produit"]);
    else {
      if (liv.frais > 0) lignes.push(["🚚", `${liv.labelLocal || "Livraison locale"} : ${formaterMontant(liv.frais, devise)}`]);
      if (liv.fraisExpedition > 0) lignes.push(["🚛", `${liv.labelExpedition || "Autre ville"} : ${formaterMontant(liv.fraisExpedition, devise)}`]);
    }
    if (liv.qteMinGratuite && !liv.gratuite) lignes.push(["📦", `Livraison gratuite à partir de ${liv.qteMinGratuite} exemplaires`]);
  }
  if ((p.zones || "").trim()) lignes.push(["📍", `Zones livrées : ${p.zones}`]);
  if ((p.delai || "").trim()) lignes.push(["⏱️", p.delai]);
  const politique = p.afficher_politique !== false ? textePlat(entreprise?.politiqueLivraison).slice(0, 600) : "";
  if (lignes.length === 0 && !politique && !(p.texte || "").trim()) return null;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <TitreSection titre={p.titre} />
      <div className="rvpp-card" style={{ padding: 18 }}>
        <div className="rvpp-info-list">
          {lignes.map(([ic, tx], k) => (<div key={k}><span aria-hidden="true">{ic}</span><span>{tx}</span></div>))}
        </div>
        {(p.texte || "").trim() && <p style={{ margin: "12px 0 0", fontSize: 14.5, whiteSpace: "pre-line" }}>{p.texte}</p>}
        {politique && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--pp-muted)" }}>{politique}</p>}
      </div>
    </div>
  );
}

function BlocDescription({ bloc, ctx }) {
  const p = bloc.props;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {(p.titre || "").trim() && <h2 className="rvpp-h2" style={{ marginBottom: 14 }}>{p.titre}</h2>}
      <div className="rvpp-desc" dangerouslySetInnerHTML={{ __html: ctx.descriptionReste }} />
    </div>
  );
}

function BlocTexte({ bloc }) {
  const p = bloc.props;
  const centre = p.alignement === "centre";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", textAlign: centre ? "center" : "left" }}>
      {(p.titre || "").trim() && <h2 className="rvpp-h2">{p.titre}</h2>}
      {(p.texte || "").trim() && <p className="rvpp-lead" style={{ whiteSpace: "pre-line" }}>{p.texte}</p>}
    </div>
  );
}

function BlocImageTexte({ bloc, ctx }) {
  const p = bloc.props;
  const aImage = (p.image || "").trim();
  return (
    <div className={`rvpp-imgtxt ${p.position === "droite" ? "rvpp-rev-order" : ""}`}>
      {aImage ? <img src={p.image} alt={p.titre || ""} loading="lazy" decoding="async" /> : <div />}
      <div>
        {(p.titre || "").trim() && <h2 className="rvpp-h2">{p.titre}</h2>}
        {(p.texte || "").trim() && <p className="rvpp-lead" style={{ whiteSpace: "pre-line" }}>{p.texte}</p>}
        {(p.bouton_texte || "").trim() && <button type="button" className="rvpp-cta" style={{ maxWidth: 360 }} onClick={() => ctx.cliquerCta("image_texte")}><span className="rvpp-cta-t">{p.bouton_texte}</span></button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compte à rebours / urgence — TOUJOURS un vrai décompte vers une date ou une heure fixée par
// le commerçant, jamais un faux minuteur qui recommence à chaque visite (voir la règle d'or de
// l'AI Page Architect dans blocs.js : « ne crée jamais... de compte à rebours »). Deux modes :
//  • "date_fixe" : une fin d'offre ponctuelle réelle — le bloc disparaît tout seul une fois passée.
//  • "quotidien" : une heure limite chaque jour (ex. « commandez avant 18h pour une expédition le
//    jour même ») — redémarre automatiquement le lendemain, ce n'est jamais présenté comme une
//    "offre" qui se termine, seulement comme une heure limite opérationnelle.
// ---------------------------------------------------------------------------

function prochaineEcheanceQuotidienne(heureFin) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(heureFin || "").trim());
  if (!m) return null;
  const cible = new Date();
  cible.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (cible.getTime() <= Date.now()) cible.setDate(cible.getDate() + 1);
  return cible;
}

function useCompteARebours(echeance) {
  const cle = echeance ? echeance.getTime() : null;
  const [restant, setRestant] = useState(() => (cle ? Math.max(0, cle - Date.now()) : 0));
  useEffect(() => {
    if (!cle) { setRestant(0); return undefined; }
    setRestant(Math.max(0, cle - Date.now()));
    const id = setInterval(() => setRestant(Math.max(0, cle - Date.now())), 1000);
    return () => clearInterval(id);
  }, [cle]);
  return restant;
}

function BlocUrgence({ bloc, ctx }) {
  const p = bloc.props;
  const quotidien = p.mode === "quotidien";
  const echeance = useMemo(() => {
    if (quotidien) return prochaineEcheanceQuotidienne(p.heure_fin);
    if (!p.date_fin) return null;
    const d = new Date(p.date_fin);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [quotidien, p.heure_fin, p.date_fin]);

  const restantMs = useCompteARebours(echeance);
  const expire = !quotidien && !!echeance && restantMs <= 0;
  const stock = Number(ctx.produit?.stock_initial);
  const afficherStock = !!p.afficher_stock_reel && stock > 0 && stock <= 5;

  if (!echeance || expire) return null;

  const totalSec = Math.floor(restantMs / 1000);
  const jours = Math.floor(totalSec / 86400);
  const heures = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secondes = totalSec % 60;
  const deux = (n) => String(n).padStart(2, "0");

  return (
    <div className="rvpp-urgence">
      {(p.titre || "").trim() && <div className="rvpp-urgence-titre">⏳ {p.titre}</div>}
      <div className="rvpp-urgence-timer">
        {jours > 0 && (
          <div className="rvpp-urgence-u"><b>{jours}</b><span>{jours > 1 ? "jours" : "jour"}</span></div>
        )}
        <div className="rvpp-urgence-u"><b>{deux(heures)}</b><span>h</span></div>
        <div className="rvpp-urgence-u"><b>{deux(minutes)}</b><span>min</span></div>
        <div className="rvpp-urgence-u"><b>{deux(secondes)}</b><span>s</span></div>
      </div>
      {afficherStock && <div className="rvpp-urgence-stock">⚡ Plus que {stock} en stock</div>}
    </div>
  );
}

function BlocCta({ bloc, ctx }) {
  const p = bloc.props;
  return (
    <div className="rvpp-band">
      {(p.titre || "").trim() && <h2 className="rvpp-h2">{p.titre}</h2>}
      {(p.texte || "").trim() && <p>{p.texte}</p>}
      <button type="button" className="rvpp-cta" onClick={() => ctx.cliquerCta("cta")}><span className="rvpp-cta-t">{(p.bouton_texte || "").trim() || ctx.libelleCta}</span></button>
    </div>
  );
}

const COMPOSANTS = {
  hero: BlocHero, galerie: BlocGalerie, info_produit: BlocInfo, benefices: BlocBenefices, video: BlocVideo,
  comment_ca_marche: BlocEtapes, offres: BlocOffres, bundles: BlocGroupee, avis: BlocAvis, ugc: BlocUGC,
  reassurance: BlocReassurance, comparaison: BlocComparaison, faq: BlocFAQ, upsell: BlocUpsell,
  cross_sell: BlocCrossSell, formulaire_cod: BlocFormulaire, livraison: BlocLivraison, texte: BlocTexte, description: BlocDescription,
  image_texte: BlocImageTexte, cta: BlocCta, urgence: BlocUrgence,
};

// ---------------------------------------------------------------------------
// Barre CTA collante (mobile par défaut). Se range quand le bouton principal ou le
// formulaire sont déjà visibles à l'écran (jamais deux boutons identiques en même temps).
// ---------------------------------------------------------------------------

function CtaCollant({ ctx, libelle, total, devise }) {
  const [masque, setMasque] = useState(false);
  useEffect(() => {
    if (ctx.preview || typeof IntersectionObserver === "undefined") return undefined;
    // Le bouton collant se cache dès qu'un AUTRE bouton de commande de la page (hero, offres,
    // appel à l'action…) ou le formulaire intégré est visible : jamais deux boutons en même temps.
    const els = [...document.querySelectorAll(".rvpp-root .rvpp-cta, #rvpp-commande")].filter((el) => !el.closest(".rvpp-sticky"));
    if (els.length === 0) return undefined;
    const visibles = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) visibles.add(e.target); else visibles.delete(e.target); });
      setMasque(visibles.size > 0);
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ctx.preview, ctx.cleRendu]);
  return (
    <div className={`rvpp-sticky ${masque ? "rvpp-off" : ""}`} role="region" aria-label="Commander">
      <div className="rvpp-sticky-in">
        {ctx.peutAjouterPanier && (
          <button type="button" className="rvpp-cta rvpp-cta-cart" aria-label="Ajouter au panier" title="Ajouter au panier" disabled={ctx.etat.varianteEnRupture} onClick={ctx.ajouterPanierCta}>🛒</button>
        )}
        <button type="button" className="rvpp-cta" disabled={ctx.etat.varianteEnRupture} onClick={() => ctx.cliquerCta("sticky")}>
          <span className="rvpp-cta-t">{libelle}{total > 0 ? ` · ${formaterMontant(total, devise)}` : ""}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Données structurées (SEO) — uniquement à partir de données réelles
// ---------------------------------------------------------------------------

function useDonneesStructurees({ actif, produit, avis, faqItems, deviseCode, description }) {
  useEffect(() => {
    if (!actif || typeof document === "undefined" || !produit) return undefined;
    const photos = [produit.photo_url, ...(produit.photos_galerie || [])].filter(Boolean);
    const nbAvis = Number(produit.nb_avis) || 0;
    const note = Number(produit.note_moyenne) || 0;
    const blocs = [];
    const prod = { "@context": "https://schema.org", "@type": "Product", name: produit.produit_nom };
    if (photos.length) prod.image = photos;
    if (description) prod.description = description;
    if (Number(produit.prix_vente) > 0 && deviseCode) {
      prod.offers = { "@type": "Offer", price: String(Number(produit.prix_vente)), priceCurrency: deviseCode, url: typeof window !== "undefined" ? window.location.href : undefined };
    }
    if (nbAvis > 0 && note > 0) prod.aggregateRating = { "@type": "AggregateRating", ratingValue: String(note), reviewCount: String(nbAvis) };
    const reels = (avis || []).filter((a) => a.client_nom && a.note >= 1 && a.commentaire).slice(0, 10);
    if (reels.length) {
      prod.review = reels.map((a) => ({ "@type": "Review", author: { "@type": "Person", name: a.client_nom }, reviewRating: { "@type": "Rating", ratingValue: String(a.note), bestRating: "5" }, reviewBody: a.commentaire }));
    }
    blocs.push(prod);
    if (faqItems.length) {
      blocs.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqItems.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.reponse } })) });
    }
    const balise = document.createElement("script");
    balise.type = "application/ld+json";
    balise.setAttribute("data-rvpp", "1");
    balise.textContent = JSON.stringify(blocs);
    document.head.appendChild(balise);
    return () => { balise.remove(); };
  }, [actif, produit?.produit_id, produit?.prix_vente, produit?.nb_avis, produit?.note_moyenne, avis, faqItems.length, deviseCode, description]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function PageProduitPublique({
  config,
  ambiance = false,   // true : l'ambiance animée de la boutique (aurore, cristal…) doit rester visible derrière la page
  produit,
  produits = [],
  collectionsManuelles = [],
  entreprise = {},
  couleur,
  devise,            // libellé affiché (ex : "F CFA")
  deviseCode,        // code (ex : "XOF") pour les données structurées
  avis = [],
  pointsForts = [],
  descriptionTexte = "",
  etat = {},
  livraison = {},
  actions = {},
  rendreFormulaire = null,
  t = null,
  preview = false,
  mode = null,       // "desktop" | "mobile" (aperçu de l'éditeur uniquement)
  blocSelectionne = null,
  onSelectBloc = null,
  onEvenement = null,
}) {
  const cfg = useMemo(() => normaliserConfig(config), [config]);
  const estMobile = useEstMobile(preview ? mode : null);
  const accent = couleurValide(cfg.theme.couleur, couleurValide(couleur));
  const accentTxt = couleurTextePourFond(accent);
  // Couleur du bouton : celle de la page si elle en a une, sinon celle choisie pour toute la boutique
  // (Store Builder → boutons), sinon la couleur de la marque / du thème.
  const couleurBouton = (cfg.cta && cfg.cta.couleur) ? couleurValide(cfg.cta.couleur, "") : couleurValide(entreprise?.storeConfig?.boutonBgColor, "");
  const accentInk = couleurTextePourFond(accent) === "#ffffff" ? accent : "#16231F";
  const libelleCta = (cfg.cta.texte || "").trim() || CTA_TEXTE_DEFAUT;

  const etatComplet = {
    quantite: 1, bundleChoisiId: null, optionsChoisies: {}, produitBumpId: null, varianteActive: null,
    varianteEnRupture: false, toutesOptionsChoisies: false, prixBase: Number(produit?.prix_vente) || 0, prixUnitaireEffectif: Number(produit?.prix_vente) || 0,
    ...etat,
  };
  const actionsCompletes = { onChoisirOffre() {}, onChoisirOption() {}, onToggleBump() {}, onCommander() {}, onCtaInline() {}, onOuvrirProduit() {}, ...actions };
  const liv = { gratuite: false, frais: 0, fraisExpedition: 0, aChoix: false, labelLocal: "", labelExpedition: "", qteMinGratuite: null, ...livraison };

  const blocOffres = cfg.blocs.find((b) => b.type === "offres" && b.visible !== false) || null;
  const aOptions = Array.isArray(produit?.options) && produit.options.length > 0;

  // Même extraction que l'éditeur : points forts + reste de la description (texte, images, vidéo).
  const structureDesc = useMemo(() => structureDescriptionProduit(produit?.produit_description), [produit?.produit_description]);
  const pointsAffiches = structureDesc.points.length > 0 ? structureDesc.points : pointsForts;
  const ctxBase = {
    produit, produits, entreprise, avis, pointsForts: pointsAffiches, descriptionReste: structureDesc.reste, hasOptions: aOptions, blocOffres,
    produitsCrossSell: [],
  };
  const blocsAffiches = cfg.blocs
    .filter((b) => b.visible !== false && REGISTRE_BLOCS[b.type])
    .map((b) => {
      const cs = b.type === "cross_sell" ? produitsCrossSell(produit, produits, collectionsManuelles, b.props) : [];
      const vide = blocEstVide(b, { ...ctxBase, produitsCrossSell: cs });
      return { bloc: b, vide, cs };
    });

  const formulaireInline = blocsAffiches.some(({ bloc, vide }) => bloc.type === "formulaire_cod" && !vide);
  const stickyActif = preview
    ? (estMobile ? cfg.sticky.mobile !== false : !!cfg.sticky.desktop)
    : (estMobile ? cfg.sticky.mobile !== false : !!cfg.sticky.desktop);

  const evenement = (nom, infos) => { if (onEvenement) onEvenement(nom, infos); };

  const allerVers = (id) => { if (typeof document !== "undefined") document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const [optionsManquantes, setOptionsManquantes] = useState(false);
  const aDesOptions = Array.isArray(produit?.options) && produit.options.length > 0;
  useEffect(() => { if (etatComplet.toutesOptionsChoisies) setOptionsManquantes(false); }, [etatComplet.toutesOptionsChoisies]);

  const cliquerCta = (source) => {
    evenement("clic_cta", { source, offre_id: etatComplet.bundleChoisiId });
    if (preview) return;
    // Variantes : même règle que la fiche historique — on ne passe pas à la commande tant que
    // toutes les options ne sont pas choisies ; on ramène le visiteur sur le sélecteur.
    if (aDesOptions && !etatComplet.toutesOptionsChoisies) {
      setOptionsManquantes(true);
      allerVers("rvpp-options");
      return;
    }
    if (formulaireInline && cfg.cta.action !== "popup") {
      actionsCompletes.onCtaInline(source);
      allerVers("rvpp-commande");
      setTimeout(() => {
        const champ = document.querySelector("#rvpp-commande input:not([type=hidden]):not([tabindex='-1']):not([type=checkbox])");
        if (champ && champ.focus) champ.focus({ preventScroll: true });
      }, 450);
    } else {
      actionsCompletes.onCommander(source);
    }
  };

  // « Ajouter au panier » (barre collante) : mêmes garde-fous que la commande — variante choisie.
  const ajouterPanierCta = () => {
    evenement("clic_cta", { source: "sticky_panier", offre_id: etatComplet.bundleChoisiId });
    if (preview || typeof actions.onAjouterPanier !== "function") return;
    if (aDesOptions && !etatComplet.toutesOptionsChoisies) { setOptionsManquantes(true); allerVers("rvpp-options"); return; }
    actions.onAjouterPanier();
  };

  const ctx = {
    ...ctxBase, accent, accentTxt, devise, deviseCode, etat: etatComplet, liv, t, preview, libelleCta, optionsManquantes,
    photos: [produit?.photo_url, ...((produit && produit.photos_galerie) || [])].filter(Boolean),
    actions: {
      ...actionsCompletes,
      onChoisirOffre: (o) => { actionsCompletes.onChoisirOffre(o); evenement("offre_selectionnee", { offre_id: o ? o.id : "base" }); },
      onToggleBump: (id) => { actionsCompletes.onToggleBump(id); if (etatComplet.produitBumpId !== id) evenement("upsell_accepte", { produit_complement: id }); },
    },
    rendreFormulaire, evenement, allerVers, cliquerCta, ajouterPanierCta,
    peutAjouterPanier: typeof actions.onAjouterPanier === "function",
    cleRendu: blocsAffiches.length + (formulaireInline ? 1 : 0),
  };

  const faqItems = useMemo(() => {
    const b = cfg.blocs.find((x) => x.type === "faq" && x.visible !== false);
    return b ? (b.props.items || []).filter((i) => (i.question || "").trim() && (i.reponse || "").trim()) : [];
  }, [cfg]);
  useDonneesStructurees({ actif: !preview, produit, avis, faqItems, deviseCode, description: (cfg.seo.description || "").trim() || descriptionTexte });

  const rayon = { net: "4px", doux: "14px", rond: "22px" }[cfg.theme.rayon] || "14px";
  const espace = { compact: "28px", normal: "40px", aere: "56px" }[cfg.theme.espacement] || "40px";
  const police = cfg.theme.police_titres === "serif" ? 'Georgia,"Times New Roman",Times,serif' : "inherit";
  const creme = cfg.theme.fond === "creme";
  const style = {
    "--pp-accent": accent, "--pp-accent-txt": accentTxt, "--pp-accent-ink": accentInk,
    "--pp-accent-soft": hexVersRgba(accent, 0.09), "--pp-accent-shadow": hexVersRgba(accent, 0.32),
    ...(couleurBouton ? { "--pp-cta": couleurBouton, "--pp-cta-txt": couleurTextePourFond(couleurBouton), "--pp-cta-shadow": hexVersRgba(couleurBouton, 0.32) } : {}),
    "--pp-ink": "#16231F", "--pp-muted": "#5F675E", "--pp-line": creme ? "#E4DDCB" : "#E7E3D8",
    "--pp-bg": creme ? "#FBF8F1" : "#FFFFFF", "--pp-alt": creme ? "#F2EDE0" : "#F7F6F1",
    "--pp-radius": rayon, "--pp-sec-y": espace, "--pp-font-title": police,
  };

  let indexAffiche = 0;
  return (
    <div className={`rvpp-root ${preview ? "rvpp-preview" : ""} ${stickyActif ? "rvpp-has-sticky" : ""} ${ambiance ? "rvpp-ambiance" : ""}`} style={style} data-rvpp-template={cfg.template}>
      <style>{CSS_PAGE}</style>
      <div className="rvpp-wrap">
        {blocsAffiches.map(({ bloc, vide, cs }) => {
          const Comp = COMPOSANTS[bloc.type];
          if (!Comp) return null;
          const selectionne = preview && blocSelectionne === bloc.id;
          const classes = ["rvpp-sec"];
          const estHero = bloc.type === "hero" || bloc.type === "info_produit" || bloc.type === "galerie";
          if (!estHero && bloc.type !== "formulaire_cod") { if (indexAffiche % 2 === 1) classes.push("rvpp-alt"); indexAffiche += 1; }
          if (bloc.montrer?.mobile === false) classes.push("rvpp-hide-m");
          if (bloc.montrer?.desktop === false) classes.push("rvpp-hide-d");
          if (preview) classes.push("rvpp-sel"); if (selectionne) classes.push("rvpp-sel-on");
          if (vide && !preview) return null;
          const idSection = bloc.type === "avis" ? "rvpp-avis" : `rvpp-b-${bloc.id}`;
          return (
            <section
              key={bloc.id}
              id={idSection}
              className={classes.join(" ")}
              data-rvpp-bloc={bloc.id}
              onClickCapture={preview && onSelectBloc ? (e) => { e.preventDefault(); e.stopPropagation(); onSelectBloc(bloc.id); } : undefined}
            >
              <div className="rvpp-in">
                {vide ? (
                  <div className="rvpp-empty">{REGISTRE_BLOCS[bloc.type].icone} <b>{REGISTRE_BLOCS[bloc.type].label}</b> — bloc vide : il n'apparaît pas sur la page publique tant qu'il n'a pas de contenu réel.</div>
                ) : (
                  <Comp bloc={bloc} ctx={{ ...ctx, produitsCrossSell: cs }} />
                )}
              </div>
            </section>
          );
        })}
      </div>
      {stickyActif && (
        <CtaCollant
          ctx={ctx}
          libelle={libelleCta}
          total={monnaieAffichage() ? arrondiLocalBase(etatComplet.prixUnitaireEffectif) * (Number(etatComplet.quantite) || 1) : Math.round(etatComplet.prixUnitaireEffectif * (Number(etatComplet.quantite) || 1))}
          devise={devise}
        />
      )}
    </div>
  );
}

export function PageProduitSquelette() {
  return (
    <div style={{ padding: "16px 16px 90px", maxWidth: 1000, margin: "0 auto" }}>
      <style>{`@keyframes rvppPulse{0%,100%{opacity:.55}50%{opacity:1}} .rvpp-sk{background:#E9E6DB;border-radius:12px;animation:rvppPulse 1.4s ease-in-out infinite}`}</style>
      <div className="rvpp-sk" style={{ width: "100%", aspectRatio: "1 / 1", maxHeight: 460 }} />
      <div className="rvpp-sk" style={{ width: "70%", height: 28, marginTop: 18 }} />
      <div className="rvpp-sk" style={{ width: "40%", height: 24, marginTop: 12 }} />
      <div className="rvpp-sk" style={{ width: "100%", height: 56, marginTop: 20 }} />
    </div>
  );
}

export default PageProduitPublique;
