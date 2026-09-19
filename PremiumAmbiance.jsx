import React, { useEffect, useRef, useState } from "react";
import { MedaillonBoutique, couleurTexteSur, injecterCssAmorce } from "./AmorceBoutique.jsx";

// ============================================================================
//  PREMIUM AMBIANCE — moteur d'ambiances de boutique
//
//  Tout est piloté par le storeConfig publié de la boutique (Store Builder) :
//    ambiance            aucune | aurore | cristal | or | neon | etoiles
//    ambianceIntensite   douce | normale | intense
//    ambianceEntree      rideau | fondu | aucune
//    ambianceReveal      true/false  (produits qui apparaissent au défilement)
//    ambianceCurseur     true/false  (halo lumineux qui suit la souris, PC)
//    ambianceProgression true/false  (fine barre de progression du défilement)
//    ambianceDefilement  doux | natif   (défilement à la molette lissé, PC)
//
//  Principes : aucune dépendance, animations sur transform/opacity uniquement
//  (GPU), pause quand l'onglet est caché, respect de prefers-reduced-motion,
//  aucune animation sur écran tactile qui suit le doigt, contenu jamais masqué
//  si le JS échoue (les éléments ne sont cachés qu'une fois observés).
// ============================================================================

export const AMBIANCES = [
  { id: "aucune", nom: "Classique", desc: "Boutique sobre, sans effet d'arrière-plan." },
  { id: "aurore", nom: "Aurore", desc: "Halos de couleur qui dérivent lentement derrière la boutique." },
  { id: "cristal", nom: "Cristal", desc: "Lumière douce, faisceaux de verre dépoli et grain fin." },
  { id: "or", nom: "Or & ivoire", desc: "Ivoire chaud et reflet doré qui balaie la page." },
  { id: "neon", nom: "Futuriste", desc: "Grille lumineuse en perspective et ligne de balayage." },
  { id: "etoiles", nom: "Poussière d'étoiles", desc: "Particules légères qui réagissent au curseur." },
];

export const AMBIANCE_DEFAUTS = {
  ambiance: "aucune",
  ambianceIntensite: "normale",
  ambianceEntree: "rideau",
  ambianceReveal: true,
  ambianceCurseur: true,
  ambianceProgression: true,
  ambianceDefilement: "doux",
};

export function lireAmbiance(sc) {
  const a = { ...AMBIANCE_DEFAUTS };
  if (sc && typeof sc === "object") {
    Object.keys(AMBIANCE_DEFAUTS).forEach((k) => {
      if (sc[k] !== undefined && sc[k] !== null) a[k] = sc[k];
    });
  }
  if (!AMBIANCES.some((x) => x.id === a.ambiance)) a.ambiance = "aucune";
  return a;
}

// ---------- Couleurs ----------
function hexVersRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [26, 122, 60];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbVersHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslVersRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}
// Couleur d'accompagnement calculée automatiquement à partir de la couleur de marque
export function couleurSecondaire(hex) {
  const [h, s, l] = rgbVersHsl(hexVersRgb(hex));
  return hslVersRgb((h + 45) % 360, Math.max(s, 0.55), Math.min(Math.max(l, 0.45), 0.6));
}

const mouvementReduit = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pointeurFin = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches;

// ---------- Apparition au défilement ----------
// Les cartes produits (.rv-card) et tout élément marqué data-rv-reveal glissent
// doucement en place quand ils entrent à l'écran, avec un léger décalage entre
// voisins. Utilise `translate` (pas `transform`) pour ne jamais entrer en conflit
// avec les effets de survol existants des cartes.
const SELECTEUR_REVEAL = ".rv-card, [data-rv-reveal]";

function useApparition(ref, actif) {
  useEffect(() => {
    if (!actif || !("IntersectionObserver" in window)) return undefined;
    const racine = ref.current;
    if (!racine) return undefined;
    const vus = new WeakSet();

    const io = new IntersectionObserver(
      (entrees) => {
        const visibles = entrees
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        visibles.forEach((e, i) => {
          const el = e.target;
          el.style.setProperty("--rvd", `${Math.min(i, 8) * 70}ms`);
          el.classList.add("rvA-in");
          io.unobserve(el);
          const fin = (ev) => {
            if (ev.target !== el) return;
            el.classList.remove("rvA-pre", "rvA-in");
            el.removeEventListener("animationend", fin);
          };
          el.addEventListener("animationend", fin);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );

    function scanner() {
      racine.querySelectorAll(SELECTEUR_REVEAL).forEach((el) => {
        if (vus.has(el)) return;
        vus.add(el);
        // Déjà animé par <RevealOnScroll> (CataloguePublic) : on ne double pas l'effet
        if (el.closest && el.closest("[data-rv-rev]")) return;
        const r = el.getBoundingClientRect();
        // Déjà à l'écran au chargement : on ne le cache jamais (pas de clignotement)
        if (r.height > 0 && r.top < window.innerHeight * 0.94 && r.bottom > 0) return;
        if (r.height === 0) return;
        el.classList.add("rvA-pre");
        io.observe(el);
      });
    }

    scanner();
    let minuterie = 0;
    const mo = new MutationObserver(() => {
      clearTimeout(minuterie);
      minuterie = setTimeout(scanner, 120);
    });
    mo.observe(racine, { childList: true, subtree: true });

    return () => {
      clearTimeout(minuterie);
      mo.disconnect();
      io.disconnect();
      racine.querySelectorAll(".rvA-pre").forEach((el) => el.classList.remove("rvA-pre", "rvA-in"));
    };
  }, [actif]);
}

// ---------- Halo qui suit le curseur (PC uniquement) ----------
function useCurseur(ref, actif) {
  useEffect(() => {
    const el = ref.current;
    if (!actif || !el || !pointeurFin()) return undefined;
    // Le halo est une couche à part déplacée en transform (compositeur GPU) : changer des
    // variables CSS sur la racine de la boutique forçait un recalcul de style de TOUTE
    // la page à chaque mouvement de souris, ce qui saccadait le défilement.
    const spot = el.querySelector(".rvA-spot");
    let raf = 0;
    let x = 0, y = 0, carte = null;
    const bouger = (e) => {
      x = e.clientX;
      y = e.clientY;
      carte = e.target && e.target.closest ? e.target.closest(".rv-card") : null;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (spot) {
          spot.style.transform = `translate3d(${x}px,${y}px,0)`;
          spot.style.opacity = "1";
        }
        if (carte) {
          const r = carte.getBoundingClientRect();
          carte.style.setProperty("--cx", `${x - r.left}px`);
          carte.style.setProperty("--cy", `${y - r.top}px`);
        }
      });
    };
    window.addEventListener("pointermove", bouger, { passive: true });
    return () => {
      window.removeEventListener("pointermove", bouger);
      cancelAnimationFrame(raf);
    };
  }, [actif]);
}

// ---------- Défilement doux (molette de souris, PC) ----------
// La molette d'une souris avance par crans de ~100px : c'est ce qui donne la sensation
// « bloc par bloc ». Ici chaque cran devient une cible vers laquelle la page glisse avec
// une décélération naturelle (~0,4 s). Ne touche JAMAIS :
//   - au tactile (le défilement natif du téléphone est déjà à inertie),
//   - aux pavés tactiles (ils sont déjà fluides),
//   - aux zones qui défilent seules (panier, fenêtres, carrousels),
//   - au clavier, à la barre de défilement, aux ancres (on se resynchronise).
function ancetreDefilable(depart, dy) {
  let el = depart && depart.nodeType === 1 ? depart : depart && depart.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      const peutDescendre = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const peutMonter = el.scrollTop > 0;
      if (dy > 0 ? peutDescendre : peutMonter) return true;
    }
    el = el.parentElement;
  }
  return false;
}

function useDefilementDoux(actif) {
  useEffect(() => {
    if (!actif || !pointeurFin()) return undefined;
    const doc = document.documentElement;
    let cible = window.scrollY, courant = cible, pose = cible;
    let raf = 0, dernier = 0, trackpadJusque = 0;
    const max = () => Math.max(0, doc.scrollHeight - window.innerHeight);
    const borne = (v) => Math.min(Math.max(v, 0), max());
    // Si la feuille de style demande un scroll-behavior:smooth, il se battrait avec le nôtre
    const comportementAvant = doc.style.scrollBehavior;
    doc.style.scrollBehavior = "auto";

    function image(t) {
      const dt = Math.min(50, dernier ? t - dernier : 16.7);
      dernier = t;
      // Amortissement indépendant de la fréquence d'écran (60 / 120 / 144 Hz)
      courant += (cible - courant) * (1 - Math.pow(1 - 0.12, dt / 16.7));
      if (Math.abs(cible - courant) < 0.5) courant = cible;
      window.scrollTo(0, courant);
      pose = window.scrollY;
      if (courant === cible) { raf = 0; dernier = 0; return; }
      raf = requestAnimationFrame(image);
    }

    const roue = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return; // zoom, etc.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // geste horizontal
      const maintenant = performance.now();
      // Petits deltas = pavé tactile : déjà lisse, on laisse le navigateur faire
      if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) trackpadJusque = maintenant + 700;
      if (maintenant < trackpadJusque) return;
      if (document.body.style.overflow === "hidden") return; // fenêtre modale qui bloque la page
      if (ancetreDefilable(e.target, e.deltaY)) return;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 40; // Firefox : lignes
      else if (e.deltaMode === 2) dy *= window.innerHeight;
      e.preventDefault();
      if (!raf) { cible = courant = pose = window.scrollY; }
      cible = borne(cible + dy);
      if (!raf) raf = requestAnimationFrame(image);
    };

    // Défilement venu d'ailleurs (clavier, barre de défilement, ancre) : on se resynchronise
    const surScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - pose) > 3) {
        cible = courant = pose = y;
        if (raf) { cancelAnimationFrame(raf); raf = 0; dernier = 0; }
      }
    };

    window.addEventListener("wheel", roue, { passive: false });
    window.addEventListener("scroll", surScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", roue);
      window.removeEventListener("scroll", surScroll);
      cancelAnimationFrame(raf);
      doc.style.scrollBehavior = comportementAvant;
    };
  }, [actif]);
}

// ---------- Calque « poussière d'étoiles » (canvas) ----------
function CalqueEtoiles({ rgbA, rgbB, intensite }) {
  const cv = useRef(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) return undefined;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const modeste = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 700;
    const base = intensite === "douce" ? 26 : intensite === "intense" ? 76 : 48;
    const N = Math.round(base * (modeste ? 0.6 : 1));
    const alphaMax = intensite === "douce" ? 0.45 : intensite === "intense" ? 0.85 : 0.65;
    const pointeur = { x: -9999, y: -9999 };
    let w = 0, h = 0, raf = 0, pts = [];

    function init() {
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: N }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -0.04 - Math.random() * 0.2,
        r: 0.7 + Math.random() * 1.9,
        t: Math.random() * 6.28,
        c: Math.random() < 0.6 ? 0 : 1,
      }));
    }

    function image() {
      ctx.clearRect(0, 0, w, h);
      const proches = [];
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        p.t += 0.02;
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w; }
        if (p.x < -6) p.x = w + 6;
        if (p.x > w + 6) p.x = -6;
        const dx = p.x - pointeur.x, dy = p.y - pointeur.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 16000) {
          const f = (1 - d2 / 16000) * 0.9;
          p.x += (dx / (Math.sqrt(d2) || 1)) * f;
          p.y += (dy / (Math.sqrt(d2) || 1)) * f;
          if (d2 < 22500) proches.push(p);
        }
        const tw = 0.55 + 0.45 * Math.sin(p.t);
        const [r, g, b] = p.c ? rgbB : rgbA;
        ctx.fillStyle = `rgba(${r},${g},${b},${(alphaMax * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      // Fils entre les particules proches du curseur
      ctx.lineWidth = 0.7;
      for (let i = 0; i < proches.length; i++) {
        for (let j = i + 1; j < proches.length; j++) {
          const a = proches[i], b = proches[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 90) {
            ctx.strokeStyle = `rgba(${rgbA[0]},${rgbA[1]},${rgbA[2]},${((1 - d / 90) * 0.35).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(image);
    }

    const bouger = (e) => { pointeur.x = e.clientX; pointeur.y = e.clientY; };
    const quitter = () => { pointeur.x = -9999; pointeur.y = -9999; };
    const visibilite = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(image);
    };

    init();
    raf = requestAnimationFrame(image);
    window.addEventListener("resize", init);
    window.addEventListener("pointermove", bouger, { passive: true });
    document.documentElement.addEventListener("mouseleave", quitter);
    document.addEventListener("visibilitychange", visibilite);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", init);
      window.removeEventListener("pointermove", bouger);
      document.documentElement.removeEventListener("mouseleave", quitter);
      document.removeEventListener("visibilitychange", visibilite);
    };
  }, [intensite]);
  return <canvas ref={cv} style={{ position: "absolute", inset: 0 }} aria-hidden="true" />;
}

function CalqueAmbiance({ id, rgbA, rgbB, intensite, curseur }) {
  return (
    <div className="rvA-calque" aria-hidden="true">
      {id === "aurore" && (<><i /><i /><i /></>)}
      {id === "cristal" && (<><i /><i /><i /><b className="rvA-grain" /></>)}
      {id === "or" && (<><i /><b className="rvA-grain" /></>)}
      {id === "neon" && (<><u className="lueur" /><u className="grille" /><u className="scan" /></>)}
      {id === "etoiles" && <CalqueEtoiles rgbA={rgbA} rgbB={rgbB} intensite={intensite} />}
      {curseur && <span className="rvA-spot" />}
    </div>
  );
}

function BarreProgression() {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let max = 0;
    // La hauteur de page est mesurée seulement quand elle change (redimensionnement,
    // nouveau contenu) — la relire à chaque image de défilement force un recalcul de mise en page.
    const mesurer = () => { max = document.documentElement.scrollHeight - window.innerHeight; };
    const maj = () => {
      raf = 0;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const sur = () => { if (!raf) raf = requestAnimationFrame(maj); };
    const remesurer = () => { mesurer(); sur(); };
    mesurer();
    maj();
    window.addEventListener("scroll", sur, { passive: true });
    window.addEventListener("resize", remesurer);
    let ro = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(remesurer);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("scroll", sur);
      window.removeEventListener("resize", remesurer);
      if (ro) ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="rvA-prog" aria-hidden="true">
      <i ref={ref} />
    </div>
  );
}

// ---------- Rideau d'ouverture ----------
// Reprend EXACTEMENT l'écran d'amorce (couleur + logo de la boutique) : le
// visiteur ne voit donc aucune rupture entre le chargement et l'ouverture.
function Rideau({ identite }) {
  const [phase, setPhase] = useState("tient");
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("leve"), 320);
    const t2 = setTimeout(() => setPhase("fini"), 320 + 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === "fini") return null;
  const bg = identite.couleur || "#1a7a3c";
  return (
    <div
      className={`rvb rvb-rideau ${phase === "leve" ? "rvb-leve" : ""}`}
      style={{ "--rvb-bg": bg, "--rvb-fg": couleurTexteSur(bg) }}
      aria-hidden="true"
    >
      <MedaillonBoutique identite={identite} />
    </div>
  );
}

function rideauDejaJoue(cle) {
  try { return sessionStorage.getItem(`rv_rideau_${cle || "shop"}`) === "1"; } catch (_) { return false; }
}
function marquerRideauJoue(cle) {
  try { sessionStorage.setItem(`rv_rideau_${cle || "shop"}`, "1"); } catch (_) {}
}

// ---------- Enveloppe de la boutique ----------
export function AmbianceShop({ config, couleur, identite, cle, rideau = false, fondu = false, style, children }) {
  injecterCssAmorce();
  const a = lireAmbiance(config);
  const racine = useRef(null);
  const reduit = mouvementReduit();
  const actif = a.ambiance !== "aucune";

  const [montrerRideau] = useState(
    () => rideau && a.ambianceEntree === "rideau" && !reduit && !!identite && !rideauDejaJoue(cle)
  );
  useEffect(() => { if (montrerRideau) marquerRideauJoue(cle); }, [montrerRideau]);

  useApparition(racine, a.ambianceReveal !== false && !reduit);
  useCurseur(racine, actif && a.ambianceCurseur !== false && !reduit);
  useDefilementDoux(a.ambianceDefilement !== "natif" && !reduit);

  const rgbA = hexVersRgb(couleur);
  const rgbB = couleurSecondaire(couleur);
  const vars = {
    "--a": couleur,
    "--a-rgb": rgbA.join(","),
    "--b-rgb": rgbB.join(","),
  };
  const classes = [
    "rvA",
    `rvA-${a.ambiance}`,
    `rvA-i-${a.ambianceIntensite}`,
    !montrerRideau && fondu && a.ambianceEntree !== "aucune" && !reduit ? "rvA-fondu" : "",
  ].join(" ");

  return (
    <div ref={racine} className={classes} style={{ ...style, position: "relative", isolation: "isolate", ...vars }}>
      <style>{CSS_AMBIANCE}</style>
      {actif && !reduit && (
        <CalqueAmbiance
          id={a.ambiance}
          rgbA={rgbA}
          rgbB={rgbB}
          intensite={a.ambianceIntensite}
          curseur={a.ambianceCurseur !== false && pointeurFin()}
        />
      )}
      {actif && a.ambianceProgression !== false && <BarreProgression />}
      {montrerRideau && <Rideau identite={identite} />}
      {children}
    </div>
  );
}

const CSS_AMBIANCE = `
.rvA{--k:1}
.rvA-i-douce{--k:.6}
.rvA-i-normale{--k:1}
.rvA-i-intense{--k:1.55}

/* Calque fixe, derrière tout le contenu, jamais cliquable */
.rvA-calque{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict}
.rvA-calque i,.rvA-calque u{position:absolute;display:block;text-decoration:none}
.rvA-calque canvas{pointer-events:none}
.rvA-grain{position:absolute;inset:0;opacity:.045;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>")}

/* Halo qui suit le curseur (PC) */
.rvA-spot{position:absolute;left:0;top:0;width:800px;height:800px;margin:-400px 0 0 -400px;border-radius:50%;opacity:0;transition:opacity .4s ease;will-change:transform;background:radial-gradient(circle closest-side,rgba(var(--a-rgb),calc(.13*var(--k))),transparent 65%)}
.rvA:not(.rvA-aucune) .rv-card::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .25s ease;background:radial-gradient(230px circle at var(--cx,50%) var(--cy,50%),rgba(var(--a-rgb),.17),transparent 65%)}
@media (hover:hover){.rvA:not(.rvA-aucune) .rv-card:hover::after{opacity:1}}

/* AURORE */
.rvA-aurore .rvA-calque i{border-radius:50%;will-change:transform}
.rvA-aurore .rvA-calque i:nth-child(1){width:72vmax;height:72vmax;left:-26vmax;top:-32vmax;background:radial-gradient(circle,rgba(var(--a-rgb),calc(.26*var(--k))) 0,transparent 62%);animation:rvADer1 28s ease-in-out infinite alternate}
.rvA-aurore .rvA-calque i:nth-child(2){width:64vmax;height:64vmax;right:-24vmax;bottom:-30vmax;background:radial-gradient(circle,rgba(var(--b-rgb),calc(.24*var(--k))) 0,transparent 62%);animation:rvADer2 32s ease-in-out infinite alternate}
.rvA-aurore .rvA-calque i:nth-child(3){width:48vmax;height:48vmax;left:32%;top:38%;background:radial-gradient(circle,rgba(var(--a-rgb),calc(.14*var(--k))) 0,transparent 60%);animation:rvADer3 36s ease-in-out infinite alternate}
@keyframes rvADer1{to{transform:translate3d(22vmax,14vmax,0) scale(1.16)}}
@keyframes rvADer2{to{transform:translate3d(-20vmax,-16vmax,0) scale(1.12)}}
@keyframes rvADer3{to{transform:translate3d(-16vmax,10vmax,0) scale(.86)}}

/* CRISTAL */
.rvA-cristal .rvA-calque{background:radial-gradient(120% 60% at 50% -10%,rgba(255,255,255,.95),transparent 60%),linear-gradient(180deg,rgba(var(--a-rgb),calc(.05*var(--k))),transparent 42%)}
.rvA-cristal .rvA-calque i{top:-20%;bottom:-20%;width:24vw;background:linear-gradient(90deg,transparent,rgba(255,255,255,calc(.6*var(--k))),transparent);will-change:transform;animation:rvAFaisceau 15s ease-in-out infinite alternate}
.rvA-cristal .rvA-calque i:nth-child(1){left:6%}
.rvA-cristal .rvA-calque i:nth-child(2){left:44%;width:13vw;animation-delay:-6s}
.rvA-cristal .rvA-calque i:nth-child(3){left:76%;animation-delay:-10s}
@keyframes rvAFaisceau{from{transform:translateX(-7vw) rotate(18deg)}to{transform:translateX(9vw) rotate(18deg)}}

/* OR & IVOIRE */
.rvA-or .rvA-calque{background:linear-gradient(180deg,rgba(255,238,200,calc(.55*var(--k))),rgba(255,250,238,calc(.25*var(--k))) 46%,transparent 82%)}
.rvA-or .rvA-calque i{top:-10%;bottom:-10%;left:-45%;width:38%;background:linear-gradient(105deg,transparent,rgba(201,162,75,calc(.18*var(--k))),rgba(255,236,170,calc(.30*var(--k))),rgba(201,162,75,calc(.18*var(--k))),transparent);transform:translateX(0) skewX(-14deg);will-change:transform;animation:rvAReflet 12s cubic-bezier(.5,0,.2,1) infinite}
@keyframes rvAReflet{0%,52%{transform:translateX(0) skewX(-14deg)}100%{transform:translateX(466%) skewX(-14deg)}}
.rvA-or .rv-card{border-color:rgba(201,162,75,.38)}

/* FUTURISTE */
.rvA-neon .rvA-calque .lueur{left:50%;top:-30%;width:92vmax;height:60vmax;transform:translateX(-50%);background:radial-gradient(closest-side,rgba(var(--b-rgb),calc(.16*var(--k))),transparent)}
.rvA-neon .rvA-calque .grille{left:-50%;right:-50%;bottom:-8%;height:72%;background-image:linear-gradient(rgba(var(--a-rgb),calc(.24*var(--k))) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--a-rgb),calc(.24*var(--k))) 1px,transparent 1px);background-size:58px 58px;transform:perspective(520px) rotateX(64deg);transform-origin:50% 100%;-webkit-mask-image:linear-gradient(to top,#000 0,transparent 88%);mask-image:linear-gradient(to top,#000 0,transparent 88%);animation:rvAGrille 6s linear infinite}
.rvA-neon .rvA-calque .scan{left:0;right:0;height:160px;top:-160px;background:linear-gradient(to bottom,transparent,rgba(var(--a-rgb),calc(.10*var(--k))),transparent);animation:rvAScan 10s linear infinite}
@keyframes rvAGrille{to{background-position:0 58px}}
@keyframes rvAScan{to{transform:translateY(calc(100vh + 320px))}}

/* Barre de progression du défilement */
.rvA-prog{position:fixed;top:0;left:0;right:0;height:2px;z-index:70;pointer-events:none}
.rvA-prog i{display:block;height:100%;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,rgba(var(--a-rgb),1),rgba(var(--b-rgb),1))}

/* Apparition des produits au défilement */
.rvA-pre{opacity:0;translate:0 26px}
.rvA-pre.rvA-in{animation:rvAEntree .75s cubic-bezier(.2,.8,.2,1) var(--rvd,0ms) both}
@keyframes rvAEntree{from{opacity:0;translate:0 26px}to{opacity:1;translate:0 0}}

/* Fondu d'ouverture (première visite, sans rideau) */
.rvA-fondu{animation:rvAFondu .6s ease both}
@keyframes rvAFondu{from{opacity:0}to{opacity:1}}

@media (prefers-reduced-motion:reduce){
  .rvA-calque *,.rvA-prog i,.rvA-fondu{animation:none !important}
  .rvA-pre{opacity:1;translate:none}
}
`;

// ============================================================================
//  PANNEAU BUILDER — à afficher dans Réglages du Store Builder (App.jsx)
// ============================================================================
export function PanneauAmbiance({ config, update, labelStyle, fieldStyle }) {
  const a = lireAmbiance(config);
  const rgbA = hexVersRgb(config?.couleur || "#1a7a3c").join(",");
  const rgbB = couleurSecondaire(config?.couleur || "#1a7a3c").join(",");

  const vignettes = {
    aucune: "#FAFAF7",
    aurore: `radial-gradient(circle at 18% 22%,rgba(${rgbA},.55),transparent 55%),radial-gradient(circle at 82% 80%,rgba(${rgbB},.5),transparent 55%),#fbfbf8`,
    cristal: "linear-gradient(115deg,#ffffff 0,#e9f0f5 38%,#ffffff 54%,#e3ebf1)",
    or: "linear-gradient(105deg,#fff6df,#f6e4ac 45%,#fff6df 60%,#f0d998)",
    neon: `repeating-linear-gradient(0deg,rgba(${rgbA},.45) 0 1px,transparent 1px 11px),repeating-linear-gradient(90deg,rgba(${rgbA},.45) 0 1px,transparent 1px 11px),#0e1622`,
    etoiles: "radial-gradient(circle at 20% 30%,#fff 0 1px,transparent 2px),radial-gradient(circle at 70% 60%,#cfe 0 1.5px,transparent 2.5px),radial-gradient(circle at 45% 80%,#fff 0 1px,transparent 2px),#0d1424",
  };
  const case_ = { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", margin: "2px 0 10px" };

  return (
    <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #e7ede8" }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: "#17241d", marginBottom: 4 }}>✨ Ambiance de la boutique</div>
      <div style={{ fontSize: 10, color: "#8a958e", lineHeight: 1.5, marginBottom: 10 }}>
        Choisis l'atmosphère que tes clients ressentent. Les couleurs s'adaptent automatiquement à la couleur de ta boutique. Publie, puis ouvre ta boutique pour la voir en direct.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {AMBIANCES.map((m) => {
          const sel = a.ambiance === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => update("ambiance", m.id)}
              style={{
                textAlign: "left", cursor: "pointer", padding: 7, borderRadius: 12,
                border: sel ? "2px solid #1a7a3c" : "1px solid #dfe6df",
                background: sel ? "#f2faf4" : "#fff",
              }}
            >
              <div style={{ height: 46, borderRadius: 8, background: vignettes[m.id], border: "1px solid rgba(0,0,0,.06)", marginBottom: 6 }} />
              <div style={{ fontSize: 11, fontWeight: 900, color: "#17241d" }}>{m.nom}</div>
              <div style={{ fontSize: 9.5, color: "#7b877f", lineHeight: 1.35, marginTop: 2 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {a.ambiance !== "aucune" && (
        <label style={labelStyle}>
          Intensité
          <select style={fieldStyle} value={a.ambianceIntensite} onChange={(e) => update("ambianceIntensite", e.target.value)}>
            <option value="douce">Douce (discrète)</option>
            <option value="normale">Normale</option>
            <option value="intense">Intense (spectaculaire)</option>
          </select>
        </label>
      )}

      <label style={labelStyle}>
        Ouverture de la boutique
        <select style={fieldStyle} value={a.ambianceEntree} onChange={(e) => update("ambianceEntree", e.target.value)}>
          <option value="rideau">Rideau avec ton logo (recommandé)</option>
          <option value="fondu">Fondu doux</option>
          <option value="aucune">Aucune animation</option>
        </select>
      </label>

      <label style={labelStyle}>
        Défilement de la page (souris)
        <select style={fieldStyle} value={a.ambianceDefilement} onChange={(e) => update("ambianceDefilement", e.target.value)}>
          <option value="doux">Doux et fluide (recommandé)</option>
          <option value="natif">Standard du navigateur</option>
        </select>
      </label>

      <label style={case_}>
        <input type="checkbox" checked={a.ambianceReveal !== false} onChange={(e) => update("ambianceReveal", e.target.checked)} />
        Les produits apparaissent en douceur au défilement
      </label>
      {a.ambiance !== "aucune" && (
        <>
          <label style={case_}>
            <input type="checkbox" checked={a.ambianceCurseur !== false} onChange={(e) => update("ambianceCurseur", e.target.checked)} />
            Halo lumineux qui suit la souris (ordinateur)
          </label>
          <label style={case_}>
            <input type="checkbox" checked={a.ambianceProgression !== false} onChange={(e) => update("ambianceProgression", e.target.checked)} />
            Fine barre de progression en haut de page
          </label>
        </>
      )}
    </div>
  );
}
