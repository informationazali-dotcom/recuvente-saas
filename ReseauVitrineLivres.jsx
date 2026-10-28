// =====================================================================
// RecuVente — Réseau national : VITRINE « MANUELS » (accueil de la boutique
// quand elle vend les guides Miss & Mister Excellence)
// Page d'accueil nationale : les guides, la commande pour les établissements,
// la livraison dans tout le pays, les questions fréquentes.
// =====================================================================
import React, { useEffect, useRef, useState } from "react";
import { fmt, rpc, erreurTexte, lienWhatsApp, Bouton, Champ, Message, Icone, useInstallation, BoutonInstaller } from "./ReseauCommun.jsx";

// Contenu éditorial propre à chaque guide (repéré par sa référence)
const FICHES = {
  "GUIDE-REUSSITE-2026": {
    public: "Pour les élèves du primaire et du secondaire, leurs parents et leurs enseignants",
    resume: "Un manuel pratique pour réussir à l'école et dans la vie.",
    chapitres: [
      ["Apprendre", "Mieux comprendre, mieux apprendre, mieux réussir ses examens."],
      ["Développer", "Ses talents, son intelligence et son leadership."],
      ["Agir", "Adopter les bonnes habitudes et faire les bons choix."],
      ["Servir", "Devenir un citoyen responsable et engagé."],
    ],
  },
  "GUIDE-CANDIDATS-2027": {
    public: "Pour les candidates et candidats au Concours Miss & Mister Excellence",
    resume: "Les conditions de participation, les étapes du concours et la préparation, de l'inscription à la finale.",
    chapitres: [
      ["Le concours", "Les étapes, le calendrier et les critères de sélection."],
      ["La préparation", "Prise de parole, culture générale, présence sur scène."],
      ["Le savoir-être", "Attitude, valeurs et image publique."],
      ["L'engagement", "Porter un projet utile pour sa communauté."],
    ],
  },
};

// Guides annoncés mais pas encore en vente (prix à venir) : affichés sans possibilité de commande
const A_PARAITRE = [
  { id: "a-paraitre-candidats", reference: "GUIDE-CANDIDATS-2027", titre: "Guide officiel des candidats — Miss & Mister Excellence", marque: "Édition 2027", photos: ["/guides/guide-candidats.jpg?v=2"] },
];

const VILLES = [
  ["Abidjan", -4.01, 5.36], ["Yamoussoukro", -5.28, 6.82], ["Bouaké", -5.03, 7.69], ["Korhogo", -5.63, 9.46],
  ["San-Pédro", -6.64, 4.75], ["Daloa", -6.45, 6.88], ["Man", -7.55, 7.41], ["Gagnoa", -5.95, 6.13],
  ["Abengourou", -3.5, 6.73], ["Odienné", -7.56, 9.51], ["Bondoukou", -2.8, 8.04], ["Divo", -5.36, 5.84],
];
const CONTOUR = [[-7.55,4.4],[-6.9,4.6],[-6.1,4.95],[-5.0,5.15],[-4.0,5.25],[-3.3,5.12],[-2.75,5.1],[-2.95,5.7],[-3.2,6.2],[-3.0,7.0],[-2.75,7.9],[-2.5,8.2],[-2.7,9.0],[-2.75,9.4],[-3.0,9.85],[-3.6,9.9],[-4.3,9.6],[-4.7,9.75],[-5.1,10.3],[-5.5,10.4],[-6.0,10.2],[-6.2,10.6],[-6.6,10.5],[-7.0,10.2],[-7.5,10.4],[-7.9,10.3],[-8.2,10.1],[-8.0,9.4],[-8.2,9.0],[-7.8,8.5],[-8.2,8.2],[-8.5,7.7],[-8.3,7.2],[-7.9,6.6],[-7.6,5.9],[-7.5,5.3]];
const proj = (lng, lat) => [((lng + 8.7) / 6.4) * 360 + 20, ((10.8 - lat) / 6.6) * 380 + 20];

function usePolices() {
  useEffect(() => {
    if (!document.getElementById("rnl-css")) {
      const st = document.createElement("style");
      st.id = "rnl-css";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (document.getElementById("rnl-polices")) return;
    const l = document.createElement("link");
    l.id = "rnl-polices";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,800&family=Public+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }, []);
}

// Pictogrammes (traits fins, couleur héritée)
const P = {
  camion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>,
  main: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l3.5-3a2 2 0 012.6 0L12 11.5h4a1.8 1.8 0 010 3.6h-3.5"/><path d="M3 18l3-2.5h7l5.6-3.3a1.6 1.6 0 011.9 2.5L15 19H3"/></svg>,
  mobile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>,
  recu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>,
  parent: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="6.5" r="2.5"/><circle cx="16.5" cy="9.5" r="2"/><path d="M4.5 20v-3.5A4.5 4.5 0 019 12a4.5 4.5 0 014.5 4.5V20M13.5 20v-2.5a3 3 0 016 0V20"/></svg>,
  ecole: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-5 9 5-9 5z"/><path d="M7 11.5V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.5M21 9v6"/></svg>,
  couronne: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/><path d="M5 21h14"/></svg>,
  fleche: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  jouer: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l10.6-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z"/></svg>,
  coche: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>,
};

// Apparition douce des sections au défilement
function useApparition() {
  useEffect(() => {
    const els = document.querySelectorAll(".rnl [data-apparait]");
    if (!("IntersectionObserver" in window) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((e) => e.classList.add("rnl-vu"));
      return;
    }
    const io = new IntersectionObserver((ent) => ent.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("rnl-vu"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}

const allerA = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function AccueilLivres({ supabase, slug, boutique, articles, ouvrir, ajouter, voirCatalogue }) {
  usePolices();
  useApparition();
  const p = boutique.parametres || {};
  const t = p.textes || {};
  const nom = p.nom_plateforme || boutique.nom;
  const guides = articles.slice(0, 4);
  const aParaitre = A_PARAITRE.filter((x) => !articles.some((a) => a.reference === x.reference));
  const phare = guides.find((a) => a.reference === "GUIDE-REUSSITE-2026") || guides[0] || null;
  // la collection affichée en vitrine : les guides en vente, puis ceux annoncés
  const collection = [...guides, ...aParaitre].slice(0, 2);
  const enVente = guides.filter((a) => a.disponible);
  const editions = [...new Set(collection.map((a) => (a.marque || "").match(/\d{4}/)?.[0]).filter(Boolean))].sort();
  const edition = editions.length ? editions.join(" – ") : String(new Date().getFullYear());
  const [ongletContenu, setOngletContenu] = useState(0);
  const [quantites, setQuantites] = useState({});
  const q = (id) => quantites[id] || 1;

  // barre d'achat fixe (téléphone) dès que l'ouverture n'est plus visible
  const [barre, setBarre] = useState(false);
  useEffect(() => {
    const f = () => setBarre(window.scrollY > 560);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  const titre = t.titre_accueil || "Deux guides officiels pour révéler l'excellence ivoirienne";
  const candidat = guides.find((a) => a.reference === "GUIDE-CANDIDATS-2027") || aParaitre[0] || null;
  const court = (a) => (a.reference === "GUIDE-CANDIDATS-2027" ? "Guide officiel des candidats" : a.reference === "GUIDE-REUSSITE-2026" ? "Guide de la Réussite et de l'Excellence" : a.titre);
  const pourQui = (a) => (a.reference === "GUIDE-CANDIDATS-2027" ? "Pour les candidat(e)s au concours" : a.reference === "GUIDE-REUSSITE-2026" ? "Pour les élèves et leurs parents" : a.categorie);

  return (
    <div className={"rnl rnl-accueil" + (enVente.length ? " rnl-avec-barre" : "")}>

      {/* ------------------------------------------------ ouverture */}
      <section className="rnl-ouverture">
        <svg className="rnl-guilloche" viewBox="0 0 800 800" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 26 }, (_, i) => (
            <ellipse key={i} cx="560" cy="330" rx={60 + i * 22} ry={40 + i * 15} transform={`rotate(${i * 7} 560 330)`} />
          ))}
        </svg>
        <div className="rnl-cadre rnl-ouverture-grille">
          <div className="rnl-ouverture-texte">
            <p className="rnl-surtitre"><span className="rnl-pulse" aria-hidden="true" />Collection officielle · Éditions {edition}</p>
            <h1>{titre}</h1>
            <p className="rnl-chapeau">
              {t.sous_titre_accueil || "Le Guide de la Réussite et de l'Excellence accompagne chaque élève à l'école et dans la vie. Le Guide officiel des candidats prépare au Concours Miss & Mister Excellence. Tous deux livrés partout en Côte d'Ivoire."}
            </p>
            {collection.length ? (
              <div className="rnl-offres">
                {collection.map((a) => {
                  const vente = guides.includes(a) && a.disponible;
                  return (
                    <button key={a.id} className="rnl-offre2" onClick={() => (vente ? ajouter(a, 1) : allerA("rnl-guides"))}>
                      {a.photos?.[0] ? <img src={a.photos[0]} alt="" /> : null}
                      <span className="rnl-offre2-txt"><small>{pourQui(a)}</small><b>{court(a)}</b></span>
                      <span className="rnl-offre2-prix">{vente ? fmt(a.prix) : "Bientôt"}<em>{vente ? "Commander" : "Être prévenu"} {P.fleche}</em></span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="rnl-actions">
              <button className="rnl-btn rnl-btn-or rnl-btn-grand" onClick={() => allerA("rnl-guides")}>Découvrir les deux guides {P.fleche}</button>
              <button className="rnl-btn rnl-btn-ligne" onClick={() => allerA("rnl-etablissements")}>Équiper une classe</button>
            </div>
            <p className="rnl-offre-note">Livré près de chez vous · vous payez à la réception · Wave, Orange Money, MTN</p>
            <button className="rnl-vu-tv" onClick={() => allerA("rnl-presse")}>
              <span className="rnl-vu-tv-jeu" aria-hidden="true">{P.jouer}</span>
              <span><small>Vu à la télévision</small>Les deux guides présentés au 13h de RTI 1</span>
            </button>
          </div>

          <div className="rnl-scene">
            <span className="rnl-halo" aria-hidden="true" />
            <div className="rnl-duo">
              {collection.map((a, i) => (
                <button key={a.id} className={"rnl-livre3d rnl-livre3d-" + i} onClick={() => (guides.includes(a) ? ouvrir(a.id) : allerA("rnl-guides"))} aria-label={`Voir le détail : ${a.titre}`}>
                  <span className="rnl-livre3d-in">
                    {a.photos?.[0] ? <img src={a.photos[0]} alt={`Couverture : ${a.titre}`} fetchpriority={i === 0 ? "high" : undefined} /> : null}
                    <span className="rnl-reflet" />
                  </span>
                  <span className="rnl-tranche" />
                  {i === 0 ? <span className="rnl-signet" /> : null}
                  {!guides.includes(a) ? <em className="rnl-ruban">Bientôt</em> : null}
                </button>
              ))}
            </div>
            <div className="rnl-medaille" aria-hidden="true">
              <svg viewBox="0 0 120 120">
                <defs><path id="rnl-cercle" d="M60 60m-46 0a46 46 0 1 1 92 0a46 46 0 1 1-92 0" /></defs>
                <circle cx="60" cy="60" r="58" className="rnl-medaille-fond" />
                <circle cx="60" cy="60" r="54" className="rnl-medaille-trait" />
                <text><textPath href="#rnl-cercle">COLLECTION OFFICIELLE · CÔTE D'IVOIRE ·</textPath></text>
              </svg>
              {boutique.logo_url ? <img src={boutique.logo_url} alt="" /> : null}
            </div>
            <div className="rnl-flottant">
              <span className="rnl-flottant-ic">{P.camion}</span>
              <span><b>Livraison nationale</b>Remis en main propre par le représentant de votre région</span>
            </div>
          </div>
        </div>

        <ul className="rnl-confiance rnl-cadre">
          <li><span>{P.main}</span><b>Paiement à la réception</b><small>Vous payez quand vous tenez le guide</small></li>
          <li><span>{P.mobile}</span><b>Wave · Orange Money · MTN</b><small>Ou en espèces au représentant</small></li>
          <li><span>{P.camion}</span><b>Partout en Côte d'Ivoire</b><small>Un réseau de représentants régionaux</small></li>
          <li><span>{P.recu}</span><b>Reçu officiel</b><small>Téléchargeable après la commande</small></li>
        </ul>
      </section>

      {/* ------------------------------------------------ vu à la télévision */}
      <Presse />

      {/* ------------------------------------------------ pour qui */}
      <section className="rnl-section rnl-cadre" data-apparait>
        <p className="rnl-surtitre-sombre">Pour qui ?</p>
        <h2 className="rnl-titre">Deux guides, trois façons d'avancer</h2>
        <div className="rnl-publics">
          <button className="rnl-public" onClick={() => (phare ? ouvrir(phare.id) : allerA("rnl-guides"))}>
            <span className="rnl-public-ic">{P.parent}</span>
            <b>Je suis parent ou élève</b>
            <span>Le Guide de la Réussite et de l'Excellence : une méthode pour réussir à l'école et dans la vie, à garder toute l'année.</span>
            <em>Voir le guide {P.fleche}</em>
          </button>
          <button className="rnl-public" onClick={() => allerA("rnl-etablissements")}>
            <span className="rnl-public-ic">{P.ecole}</span>
            <b>Je représente un établissement</b>
            <span>Écoles, collèges, lycées : équipez vos classes au tarif établissement, livré sur place.</span>
            <em>Demander un devis {P.fleche}</em>
          </button>
          <button className="rnl-public" onClick={() => (candidat && guides.includes(candidat) ? ouvrir(candidat.id) : allerA("rnl-guides"))}>
            <span className="rnl-public-ic">{P.couronne}</span>
            <b>Je suis candidat(e) au concours</b>
            <span>Le Guide officiel des candidats : les étapes, la préparation et le savoir-être pour aller jusqu'à la finale.</span>
            <em>{candidat && guides.includes(candidat) ? "Voir le guide" : "Être prévenu(e)"} {P.fleche}</em>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ ce que contient chaque guide */}
      {collection.length ? (() => {
        const g = collection[Math.min(ongletContenu, collection.length - 1)];
        const f = FICHES[g.reference] || { public: g.categorie, resume: g.description, chapitres: [] };
        const DETAILS = {
          "GUIDE-REUSSITE-2026": ["Mieux comprendre ses leçons, mieux apprendre et aborder ses examens avec confiance.", "Révéler ses talents, exercer son intelligence et prendre l'assurance d'un leader.", "Adopter les bonnes habitudes au quotidien et faire les bons choix.", "Devenir un citoyen responsable, respectueux et engagé pour sa communauté."],
        };
        const lignes = f.chapitres.map(([k, v], i) => [k, DETAILS[g.reference]?.[i] || v]);
        return (
          <section className="rnl-piliers4" data-apparait>
            <div className="rnl-cadre rnl-piliers4-grille">
              <div className="rnl-piliers4-tete">
                <p className="rnl-surtitre-sombre">À l'intérieur des guides</p>
                <h2 className="rnl-titre">Ce que contient chaque guide</h2>
                {collection.length > 1 ? (
                  <div className="rnl-bascule" role="tablist" aria-label="Choisir un guide">
                    {collection.map((c, i) => (
                      <button key={c.id} role="tab" aria-selected={g.id === c.id} onClick={() => setOngletContenu(i)}>{c.reference === "GUIDE-CANDIDATS-2027" ? "Guide des candidats" : "Guide de la Réussite"}</button>
                    ))}
                  </div>
                ) : null}
                <p>{f.public}. {f.resume}</p>
                {g.photos?.[0] ? <img key={g.id} className="rnl-piliers4-livre" src={g.photos[0]} alt="" loading="lazy" /> : null}
              </div>
              <ol className="rnl-piliers4-liste" key={g.id}>
                {lignes.map(([k, v], i) => (
                  <li key={k}><span className="rnl-num">0{i + 1}</span><div><b>{k}</b><p>{v}</p></div></li>
                ))}
              </ol>
            </div>
          </section>
        );
      })() : null}

      {/* ------------------------------------------------ les guides */}
      <section id="rnl-guides" className="rnl-section rnl-cadre" data-apparait>
        <p className="rnl-surtitre-sombre">La collection officielle</p>
        <h2 className="rnl-titre">Choisissez votre guide</h2>
        <div className="rnl-guides">
          {guides.map((a) => {
            const f = FICHES[a.reference] || { public: a.categorie, resume: a.description, chapitres: [] };
            return (
              <article key={a.id} className="rnl-guide">
                <button className="rnl-guide-couverture" onClick={() => ouvrir(a.id)} aria-label={`Voir le détail : ${a.titre}`}>
                  {a.photos?.[0] ? <img src={a.photos[0]} alt={`Couverture : ${a.titre}`} loading="lazy" /> : null}
                </button>
                <div className="rnl-guide-corps">
                  <p className="rnl-guide-etiquettes"><span className="rnl-dispo">Disponible</span>{a.marque ? <span>{a.marque}</span> : null}</p>
                  <h3>{a.titre}</h3>
                  <p className="rnl-guide-public">{f.public}</p>
                  <p className="rnl-guide-resume">{f.resume}</p>
                  {f.chapitres.length ? (
                    <dl className="rnl-chapitres">
                      {f.chapitres.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                    </dl>
                  ) : null}
                  <div className="rnl-guide-achat">
                    <span className="rnl-prix">{fmt(a.prix)}</span>
                    <span className="rnl-qte" role="group" aria-label="Quantité">
                      <button onClick={() => setQuantites({ ...quantites, [a.id]: Math.max(1, q(a.id) - 1) })} aria-label="Un de moins">−</button>
                      <span>{q(a.id)}</span>
                      <button onClick={() => setQuantites({ ...quantites, [a.id]: Math.min(a.disponible || 1, q(a.id) + 1) })} aria-label="Un de plus">+</button>
                    </span>
                    <button className="rnl-btn rnl-btn-violet" disabled={!a.disponible} onClick={() => ajouter(a, q(a.id))}>
                      {a.disponible ? (q(a.id) > 1 ? `Commander · ${fmt(a.prix * q(a.id))}` : "Commander") : "Bientôt disponible"}
                    </button>
                  </div>
                  <p className="rnl-guide-rassure">{P.coche} Exemplaire neuf · paiement à la réception</p>
                  <button className="rnl-guide-rti" onClick={() => allerA("rnl-presse")}>{P.jouer} Présenté au journal de 13h de RTI 1</button>
                </div>
              </article>
            );
          })}
          {aParaitre.map((a) => {
            const f = FICHES[a.reference] || { public: "", resume: "", chapitres: [] };
            return (
              <article key={a.id} className="rnl-guide rnl-guide-bientot">
                <div className="rnl-guide-couverture">{a.photos?.[0] ? <img src={a.photos[0]} alt={`Couverture : ${a.titre}`} loading="lazy" /> : null}</div>
                <div className="rnl-guide-corps">
                  <p className="rnl-guide-etiquettes"><span className="rnl-avenir">Bientôt disponible</span>{a.marque ? <span>{a.marque}</span> : null}</p>
                  <h3>{a.titre}</h3>
                  <p className="rnl-guide-public">{f.public}</p>
                  <p className="rnl-guide-resume">{f.resume}</p>
                  {f.chapitres.length ? <dl className="rnl-chapitres">{f.chapitres.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
                  <div className="rnl-guide-achat">
                    <span className="rnl-bientot">Prix annoncé prochainement</span>
                    {boutique.whatsapp ? (
                      <a className="rnl-btn rnl-btn-violet" href={lienWhatsApp(boutique.whatsapp, "Bonjour, je souhaite être prévenu(e) de la sortie du Guide officiel des candidats Miss & Mister Excellence.")} target="_blank" rel="noreferrer">Être prévenu(e) sur WhatsApp</a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {articles.length > 4 ? <button className="rnl-btn rnl-btn-ligne-sombre" onClick={voirCatalogue}>Voir toutes les publications</button> : null}
      </section>

      {/* ------------------------------------------------ valeurs */}
      <section className="rnl-valeurs" data-apparait>
        <div className="rnl-cadre">
          <p className="rnl-surtitre-sombre">L'Excellence, un modèle de réussite</p>
          <blockquote>« La beauté qui inspire, l'intelligence qui transforme. »</blockquote>
          <div className="rnl-piliers rnl-piliers-4">
            <div><b>Beauté intellectuelle</b><span>Mettre en lumière l'intelligence, la culture et l'élégance de l'esprit.</span></div>
            <div><b>Leadership</b><span>Oser prendre la parole, décider et entraîner les autres.</span></div>
            <div><b>Responsabilité</b><span>Assumer ses choix et donner l'exemple, à l'école comme en ligne.</span></div>
            <div><b>Engagement</b><span>Porter des projets utiles à sa communauté et à son pays.</span></div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ établissements */}
      <Etablissements supabase={supabase} slug={slug} boutique={boutique} guides={guides} />

      {/* ------------------------------------------------ couverture nationale */}
      <section className="rnl-section rnl-cadre rnl-national" data-apparait>
        <div>
          <p className="rnl-surtitre-sombre">Livraison</p>
          <h2 className="rnl-titre">Livré partout en Côte d'Ivoire</h2>
          <p>Les guides sont stockés chez nos représentants régionaux. Votre commande est confiée automatiquement au représentant le plus proche de chez vous, qui vous la remet en main propre contre votre code de remise.</p>
          <p>Si aucun représentant n'est encore installé dans votre ville, le colis voyage par un transporteur partenaire. Les frais et le délai exacts s'affichent avant que vous confirmiez.</p>
          <p className="rnl-tournee"><b>Après le lancement officiel à Abidjan,</b> le comité d'organisation se rend dans les régions pour présenter les guides aux élèves, aux parents et aux établissements.</p>
          <button className="rnl-btn rnl-btn-violet" onClick={() => allerA("rnl-guides")}>Choisir mon guide</button>
        </div>
        <svg viewBox="0 0 460 420" className="rnl-carte" role="img" aria-label="Carte de la Côte d'Ivoire avec les principales villes desservies">
          <path d={"M" + CONTOUR.map(([x, y]) => proj(x, y).map((v) => v.toFixed(1)).join(" ")).join(" L") + " Z"} className="rnl-carte-pays" />
          {VILLES.map(([n, x, y]) => {
            const [cx, cy] = proj(x, y);
            return (
              <g key={n}>
                {n === "Abidjan" ? <circle cx={cx} cy={cy} r="16" className="rnl-carte-onde" /> : null}
                <circle cx={cx} cy={cy} r={n === "Abidjan" ? 7 : 5} className="rnl-carte-point" />
                <text x={cx + 9} y={cy + 4} className="rnl-carte-ville">{n}</text>
              </g>
            );
          })}
        </svg>
      </section>

      {/* ------------------------------------------------ comment commander (vraie séquence) */}
      <section className="rnl-section rnl-cadre" data-apparait>
        <p className="rnl-surtitre-sombre">Simple et sûr</p>
        <h2 className="rnl-titre">Commander en trois étapes</h2>
        <ol className="rnl-etapes">
          <li><b>Choisissez vos guides et la quantité</b><span>Le Guide de la Réussite, le Guide des candidats, ou les deux, pour vous, votre enfant ou un groupe.</span></li>
          <li><b>Indiquez votre ville et votre téléphone</b><span>Payez à la livraison, ou par Wave, Orange Money ou MTN. Le guide vous est réservé.</span></li>
          <li><b>Recevez-le près de chez vous</b><span>Le représentant vous appelle, puis vous remet le guide contre votre code à 6 chiffres.</span></li>
        </ol>
      </section>

      {/* ------------------------------------------------ application */}
      <Application nom={nom} logo={boutique.logo_url} guides={collection.filter((a) => guides.includes(a))} />

      {/* ------------------------------------------------ questions */}
      <section className="rnl-section rnl-cadre rnl-faq" data-apparait>
        <h2 className="rnl-titre">Questions fréquentes</h2>
        {[
          ["Combien de temps prend la livraison ?", "En général 24 à 48 heures dans les villes où un représentant est installé, 2 à 4 jours pour les autres localités. Le délai exact s'affiche avant la confirmation."],
          ["Puis-je payer à la réception ?", "Oui. Vous pouvez aussi payer par Wave, Orange Money ou MTN Mobile Money ; votre commande part dès que le paiement est vérifié."],
          ["Comment suivre ma commande ?", "Après la commande, une page de suivi s'ouvre et reste accessible depuis « Suivre ma commande », avec votre téléphone et votre numéro de commande."],
          ["Notre école veut équiper une classe entière. Comment faire ?", "Remplissez le formulaire « Équipez toute une classe » : nous vous rappelons avec un devis et organisons la livraison à l'établissement."],
          ["À quoi sert chacun des deux guides ?", "Comme l'a présenté le journal de 13h de RTI 1 : le Guide de la Réussite et de l'Excellence propose des outils pour progresser sur les plans scolaire et professionnel ; le Guide officiel des candidats précise les conditions de participation au Concours Miss & Mister Excellence et accompagne la préparation."],
          ["Qu'est-ce que le Concours Miss & Mister Excellence ?", "Une initiative qui promeut l'excellence scolaire, le leadership et le bon comportement chez les jeunes, et qui met en lumière les élèves méritants autrement que par leurs seules notes. Le thème de l'édition 2027 : « Les réseaux sociaux : levier d'excellence ou facteur de dérive chez les jeunes ? »."],
          ["Comment installer l'application sur mon téléphone ?", "Sur Android, touchez « Installer l'application » sur cette page. Sur iPhone, ouvrez la page dans Safari, touchez Partager puis « Sur l'écran d'accueil »."],
          ["Le guide reçu est abîmé. Que faire ?", "Signalez-le depuis votre page de suivi dans les 48 heures ; nous organisons l'échange."],
        ].map(([qq, r]) => (
          <details key={qq}><summary>{qq}</summary><p>{r}</p></details>
        ))}
      </section>

      {/* ------------------------------------------------ barre d'achat (téléphone) */}
      {enVente.length ? (
        <div className={"rnl-barre" + (barre ? " rnl-barre-on" : "")} aria-hidden={!barre}>
          {enVente.map((a) => (
            <button key={a.id} className="rnl-barre-choix" tabIndex={barre ? 0 : -1} onClick={() => ajouter(a, 1)} aria-label={`Commander : ${court(a)}, ${fmt(a.prix)}`}>
              {a.photos?.[0] ? <img src={a.photos[0]} alt="" /> : null}
              <span><small>{a.reference === "GUIDE-CANDIDATS-2027" ? "Guide des candidats" : a.reference === "GUIDE-REUSSITE-2026" ? "Guide de la Réussite" : a.titre}</small><b>{fmt(a.prix)}</b></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ section « vu à la télévision » (RTI 1)
const PRESSE = "/excellence/presse/";
// Propos tenus dans le reportage (journal de 13h de RTI 1)
const PERSONNALITES = [
  ["gboko-adjoumani.jpg", "Gboko Adjoumani", "Représentant du ministre de l'Éducation nationale, de l'Alphabétisation et de l'Enseignement technique",
    "Notre ambition est de faire de l'école un espace où chaque élève peut découvrir ses potentialités, développer ses compétences et apprendre à mettre ses talents au service de la collectivité."],
  ["angele-elodie-kouame.jpg", "Angèle Élodie Kouamé", "Présidente du comité d'organisation",
    "Les guides, c'est l'accompagnement que nous avons mis en place pour les élèves qui vont décider de suivre notre vision."],
  ["emmanuel-atta.jpg", "Emmanuel Atta", "Sous-directeur Partenariat et Mobilisation",
    "L'objectif, c'est de présenter les élèves méritants d'une autre manière."],
];
function Presse() {
  const ref = useRef(null);
  const [lecture, setLecture] = useState(false);
  const lancer = () => { setLecture(true); setTimeout(() => ref.current?.play?.().catch(() => {}), 30); };
  return (
    <section id="rnl-presse" className="rnl-presse">
      <div className="rnl-cadre">
        <div className="rnl-presse-grille" data-apparait>
          <div className="rnl-video">
            <div className="rnl-video-cadre">
              <video ref={ref} src={PRESSE + "rti-13h-lancement.mp4"} poster={PRESSE + "rti-affiche.jpg"} preload="none" playsInline controls={lecture}
                onPlay={() => setLecture(true)} aria-label="Reportage du journal de 13h de RTI 1 sur le lancement officiel du Concours Miss & Mister Excellence 2027" />
              {!lecture ? (
                <button className="rnl-video-jouer" onClick={lancer} aria-label="Lire le reportage (2 min)">
                  <span className="rnl-video-rond">{P.jouer}</span>
                  <span className="rnl-video-titre"><small>Le 13H · RTI 1 · Éducation · 2 min</small>Regarder le reportage</span>
                </button>
              ) : null}
            </div>
            <p className="rnl-video-legende">Journal de 13h de RTI 1, rubrique Éducation. Reportage : Grâce Guéladé, Didier N'Guessan, Djama Sow · Montage : Joseph Assiedou.</p>
          </div>
          <div className="rnl-presse-texte">
            <p className="rnl-surtitre">Vu à la télévision nationale</p>
            <h2>Les deux guides présentés au journal de 13h de RTI 1</h2>
            <figure className="rnl-citation-rti">
              <blockquote>« Pour accompagner les candidats, deux guides sont présentés. Le premier, consacré à la réussite et à l'excellence, propose des outils pour progresser sur les plans scolaire et professionnel. Le second précise les conditions de participation. »</blockquote>
              <figcaption>RTI 1 · Le 13H · Rubrique Éducation</figcaption>
            </figure>
            <p>Le reportage revient sur le lancement officiel du Concours Miss & Mister Excellence 2027 à Abidjan, une initiative qui veut promouvoir l'excellence scolaire, le leadership et le bon comportement chez les jeunes. Selon la RTI, la Direction de la vie scolaire salue l'initiative, qu'elle considère comme un cadre de valorisation des talents et de développement de la confiance en soi.</p>
          </div>
        </div>
        <ul className="rnl-personnalites" aria-label="Ils ont pris la parole dans le reportage" data-apparait>
          {PERSONNALITES.map(([img, n, r, c]) => (
            <li key={n}>
              <blockquote>« {c} »</blockquote>
              <div className="rnl-personnalite"><img src={PRESSE + img} alt={n} loading="lazy" /><span><b>{n}</b>{r}</span></div>
            </li>
          ))}
        </ul>
        <div className="rnl-theme" data-apparait>
          <span className="rnl-theme-tag">Thème officiel 2027</span>
          <p>« Les réseaux sociaux : levier d'excellence ou facteur de dérive chez les jeunes ? »</p>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ section « application »
function Application({ nom, logo, guides }) {
  const app = useInstallation();
  return (
    <section className="rnl-appli" data-apparait>
      <div className="rnl-cadre rnl-appli-grille">
        <div>
          <p className="rnl-surtitre">Application officielle</p>
          <h2>La boutique officielle, directement sur votre téléphone</h2>
          <p>Installez l'application Miss & Mister Excellence : elle s'ouvre en plein écran depuis votre écran d'accueil, sans passer par un magasin d'applications.</p>
          <ul>
            <li>{P.coche} Commander vos guides en quelques gestes</li>
            <li>{P.coche} Suivre la livraison étape par étape</li>
            <li>{P.coche} Retrouver et télécharger vos reçus officiels</li>
          </ul>
          <div className="rnl-actions">
            {app.installe ? (
              <span className="rnl-appli-ok">{P.coche} Application installée sur cet appareil</span>
            ) : app.proposable ? (
              <BoutonInstaller className="rnl-btn rnl-btn-or rnl-btn-grand">Installer l'application {P.fleche}</BoutonInstaller>
            ) : (
              <span className="rnl-appli-aide">Sur téléphone, ouvrez cette page puis choisissez <b>« Ajouter à l'écran d'accueil »</b> dans le menu du navigateur.</span>
            )}
          </div>
        </div>
        <div className="rnl-telephone" aria-hidden="true">
          <div className="rnl-telephone-ecran">
            <div className="rnl-tel-tete">{logo ? <img src={logo} alt="" /> : null}<span>Miss & Mister Excellence</span></div>
            <div className="rnl-tel-corps">
              <b>Les guides officiels</b>
              <span className="rnl-tel-livres">
                {guides.map((g) => (
                  <span key={g.id}>{g.photos?.[0] ? <img src={g.photos[0]} alt="" /> : null}<i>{fmt(g.prix)}</i></span>
                ))}
              </span>
              <span className="rnl-tel-btn">Commander</span>
              <span className="rnl-tel-suivi"><i />Commande confirmée<i />Représentant en route<i className="rnl-tel-gris" />Remis en main propre</span>
            </div>
          </div>
          <span className="rnl-telephone-nom">{nom}</span>
        </div>
      </div>
    </section>
  );
}

function Etablissements({ supabase, slug, boutique, guides }) {
  const [f, setF] = useState({ etablissement: "", ville: "", nom: "", tel: "", guide: "", quantite: "" });
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const envoyer = async (e) => {
    e.preventDefault();
    setCharge(true); setMsg({});
    try {
      const guide = guides.find((g) => g.id === f.guide)?.titre || "Les deux guides";
      await rpc(supabase, "rn_contacter", {
        p_slug: slug, p_nom: f.nom, p_tel: f.tel,
        p_message: `COMMANDE ÉTABLISSEMENT\nÉtablissement : ${f.etablissement}\nVille : ${f.ville}\nGuide : ${guide}\nQuantité souhaitée : ${f.quantite}`,
      });
      setMsg({ ton: "ok", texte: "Demande envoyée. Nous vous rappelons avec un devis pour votre établissement." });
      setF({ ...f, quantite: "" });
    } catch (e2) { setMsg({ ton: "danger", texte: erreurTexte(e2) }); } finally { setCharge(false); }
  };
  return (
    <section id="rnl-etablissements" className="rnl-etab">
      <div className="rnl-cadre rnl-etab-grille">
        <div>
          <h2>Équipez toute une classe</h2>
          <p>Écoles, collèges, lycées, associations et mairies : commandez les guides en nombre. Nous vous envoyons un devis et livrons directement à l'établissement.</p>
          <ul>
            <li>Prix dégressif à partir de 20 exemplaires</li>
            <li>Facture au nom de l'établissement</li>
            <li>Livraison groupée dans toute la Côte d'Ivoire</li>
          </ul>
        </div>
        <form className="rnl-etab-form" onSubmit={envoyer}>
          <Champ label="Établissement"><input value={f.etablissement} onChange={maj("etablissement")} placeholder="Ex. Lycée moderne de Yopougon" required /></Champ>
          <div className="rnl-deux">
            <Champ label="Ville"><input value={f.ville} onChange={maj("ville")} required /></Champ>
            <Champ label="Nombre d'exemplaires"><input inputMode="numeric" value={f.quantite} onChange={(e) => setF({ ...f, quantite: e.target.value.replace(/\D/g, "") })} required /></Champ>
          </div>
          <Champ label="Guide souhaité">
            <select value={f.guide} onChange={maj("guide")}>
              <option value="">Les deux guides</option>
              {guides.map((g) => <option key={g.id} value={g.id}>{g.titre}</option>)}
            </select>
          </Champ>
          <div className="rnl-deux">
            <Champ label="Votre nom"><input value={f.nom} onChange={maj("nom")} required /></Champ>
            <Champ label="Téléphone"><input type="tel" inputMode="tel" value={f.tel} onChange={maj("tel")} required /></Champ>
          </div>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton type="submit" variante="or" chargement={charge}>Demander un devis</Bouton>
        </form>
      </div>
    </section>
  );
}

const CSS = `
.rnl{--v:var(--rn-prune,#3D0C52);--v2:color-mix(in srgb,var(--v) 78%,#000);--or:var(--rn-or,#B8913F);--papier:#FFFFFF;--lavande:#F6F2F9;--encre:#1F1424;--gris:#5E5466;--trait:#E6DDEC;
  --f-titre:"Fraunces",Georgia,"Times New Roman",serif;--f-texte:"Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  font-family:var(--f-texte);color:var(--encre);background:var(--papier)}
.rnl *{box-sizing:border-box}
.rnl section[id]{scroll-margin-top:84px}
@media (max-width:959px){.rnl-avec-barre{padding-bottom:84px}}
.rnl-cadre{max-width:1180px;margin:0 auto;padding-left:20px;padding-right:20px}
.rnl h1,.rnl h2,.rnl h3{font-family:var(--f-titre);font-weight:700;letter-spacing:-.01em;margin:0}
.rnl .rnl-titre{font-size:clamp(28px,4vw,42px);line-height:1.1;color:var(--v);margin-bottom:30px;text-wrap:balance}
.rnl-section{padding-top:72px;padding-bottom:16px}

.rnl .rnl-btn{font:inherit;font-weight:600;font-size:15px;border-radius:999px;padding:13px 22px;cursor:pointer;border:1.5px solid transparent;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px}
.rnl .rnl-btn:focus-visible{outline:3px solid var(--or);outline-offset:3px}
.rnl .rnl-btn:disabled{opacity:.5;cursor:not-allowed}
.rnl .rnl-btn-or{background:var(--or);color:#21130C}
.rnl .rnl-btn-or:hover{filter:brightness(1.06)}
.rnl .rnl-btn-ligne{background:transparent;color:#fff;border-color:rgba(255,255,255,.55)}
.rnl .rnl-btn-ligne:hover{border-color:#fff}
.rnl .rnl-btn-violet{background:var(--v);color:#fff}
.rnl .rnl-btn-violet:hover{background:var(--v2)}
.rnl .rnl-btn-ligne-sombre{background:transparent;color:var(--v);border-color:var(--v);margin-top:24px}

/* ouverture */
.rnl-ouverture{position:relative;background:radial-gradient(120% 90% at 85% 10%,color-mix(in srgb,var(--v) 70%,#7a2a8f),transparent 60%),linear-gradient(160deg,var(--v) 0%,color-mix(in srgb,var(--v) 70%,#000) 100%);color:#fff;overflow:hidden;isolation:isolate}
.rnl-ouverture::after{content:"";position:absolute;inset:auto 0 0;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--or) 70%,transparent),transparent)}
.rnl-guilloche{position:absolute;inset:0;width:100%;height:100%;z-index:-1;opacity:.16;pointer-events:none}
.rnl-guilloche ellipse{fill:none;stroke:var(--or);stroke-width:.7}
.rnl-ouverture-grille{position:relative;display:grid;gap:12px;padding-top:36px;padding-bottom:20px;align-items:center}
@media (min-width:960px){.rnl-ouverture-grille{grid-template-columns:1.08fr .92fr;padding-top:72px;padding-bottom:48px;gap:48px}}
.rnl-ouverture-texte{display:grid;gap:20px;justify-items:start}
.rnl-surtitre{display:inline-flex;align-items:center;gap:10px;margin:0;font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--or)}
.rnl-surtitre-sombre{margin:0 0 10px;font-size:12.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:color-mix(in srgb,var(--or) 80%,#000)}
.rnl-pulse{width:8px;height:8px;border-radius:50%;background:#3ddc84;box-shadow:0 0 0 0 rgba(61,220,132,.6);animation:rnl-pulse 2s infinite}
@keyframes rnl-pulse{70%{box-shadow:0 0 0 9px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}
.rnl-ouverture h1{font-size:clamp(38px,5.8vw,68px);line-height:1;font-weight:800;max-width:14ch;letter-spacing:-.025em;text-wrap:balance}
.rnl-chapeau{margin:0;font-size:clamp(16px,1.6vw,18.5px);line-height:1.6;color:rgba(255,255,255,.86);max-width:50ch}
.rnl-offres{display:grid;gap:10px;width:100%;max-width:560px}
.rnl .rnl-offre2{font:inherit;color:#fff;text-align:left;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:10px 14px 10px 10px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);cursor:pointer;transition:background .2s,border-color .2s,transform .2s}
.rnl .rnl-offre2:hover{background:rgba(255,255,255,.12);border-color:color-mix(in srgb,var(--or) 70%,transparent);transform:translateX(3px)}
.rnl-offre2 img{width:44px;border-radius:2px 4px 4px 2px;box-shadow:0 8px 16px -6px rgba(0,0,0,.6)}
.rnl-offre2-txt small{display:block;font-size:12px;color:var(--or);font-weight:600}
.rnl-offre2-txt b{display:block;font-family:var(--f-titre);font-size:17px;line-height:1.2}
.rnl-offre2-prix{text-align:right;font-family:var(--f-titre);font-weight:800;font-size:20px;white-space:nowrap}
.rnl-offre2-prix em{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-style:normal;font-family:var(--f-texte);font-size:12px;font-weight:600;color:rgba(255,255,255,.75)}
.rnl-offre2-prix em svg{width:14px;height:14px}
@media (max-width:420px){.rnl-offre2-txt b{font-size:15px}.rnl-offre2-prix{font-size:17px}}
.rnl-ouverture-texte > .rnl-offre-note{margin:-4px 0 0;font-size:13px;color:rgba(255,255,255,.7)}
.rnl-offre{display:flex;align-items:center;gap:16px;padding:12px 18px 12px 14px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px)}
.rnl-offre-prix{white-space:nowrap;font-family:var(--f-titre);font-size:clamp(26px,7vw,34px);font-weight:800;color:#fff;line-height:1;padding-right:16px;border-right:1px solid rgba(255,255,255,.22)}
.rnl-offre-note{font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.82)}
.rnl-actions{display:flex;flex-wrap:wrap;gap:12px}
.rnl .rnl-btn svg{width:18px;height:18px;transition:transform .2s}
.rnl .rnl-btn:hover svg{transform:translateX(3px)}
.rnl .rnl-btn-grand{font-size:16px;padding:16px 26px;min-height:54px;box-shadow:0 14px 30px -10px color-mix(in srgb,var(--or) 70%,transparent)}
.rnl .rnl-btn-or{background:linear-gradient(180deg,color-mix(in srgb,var(--or) 82%,#fff),var(--or));color:#21130C}

/* scène du livre */
.rnl-scene{position:relative;min-height:420px;display:grid;place-items:center;perspective:1400px}
@media (max-width:959px){.rnl-scene{min-height:400px;margin-top:8px}}
.rnl-halo{position:absolute;width:78%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--or) 55%,transparent) 0%,transparent 65%);filter:blur(10px);opacity:.75}
.rnl-duo{position:relative;z-index:3;display:flex;justify-content:center;align-items:flex-end;gap:0;width:100%}
.rnl .rnl-livre3d-0{transform:rotateY(-22deg) rotateX(3deg) translateZ(0);z-index:2;margin-right:-6%}
.rnl .rnl-livre3d-1{transform:rotateY(-22deg) rotateX(3deg) translateY(-34px);z-index:1}
.rnl .rnl-livre3d-0:hover,.rnl .rnl-livre3d-1:hover{transform:rotateY(-10deg) translateY(-8px);z-index:4}
.rnl-ruban{position:absolute;top:12px;left:-8px;font-style:normal;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:var(--or);color:#21130C;padding:5px 10px;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.3);z-index:2}
.rnl .rnl-livre3d{position:relative;z-index:3;width:min(46%,250px);border:0;padding:0;background:none;cursor:pointer;transform-style:preserve-3d;transform:rotateY(-24deg) rotateX(4deg) rotateZ(-1deg);transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.rnl .rnl-livre3d:hover{transform:rotateY(-12deg) rotateX(2deg)}
.rnl-livre3d-in{position:relative;display:block;border-radius:2px 6px 6px 2px;overflow:hidden;box-shadow:-2px 0 0 rgba(255,255,255,.35) inset,0 40px 60px -18px rgba(0,0,0,.65),0 18px 22px -12px rgba(0,0,0,.45)}
.rnl-livre3d img{display:block;width:100%;aspect-ratio:3/4.2;object-fit:cover}
.rnl-reflet{position:absolute;inset:0;background:linear-gradient(105deg,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 22%,rgba(255,255,255,0) 70%,rgba(0,0,0,.18) 100%);pointer-events:none}
.rnl-tranche{position:absolute;top:1.5%;right:-14px;width:14px;height:97%;background:repeating-linear-gradient(180deg,#f7f3ea 0 2px,#e4dccb 2px 3px);transform:rotateY(90deg);transform-origin:left;border-radius:0 2px 2px 0}
.rnl-livre3d .rnl-signet{right:10%}
.rnl .rnl-livre-second{position:absolute;z-index:2;right:2%;bottom:6%;width:min(30%,150px);border:0;padding:0;background:none;cursor:pointer;transform:rotate(7deg);opacity:.92;filter:saturate(.9)}
.rnl-livre-second img{display:block;width:100%;aspect-ratio:3/4.2;object-fit:cover;border-radius:2px 5px 5px 2px;box-shadow:0 24px 40px -14px rgba(0,0,0,.6)}
.rnl-livre-second em{position:absolute;top:10px;left:-8px;font-style:normal;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:var(--or);color:#21130C;padding:5px 10px;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.3)}
.rnl-medaille{position:absolute;z-index:4;top:2%;left:0;width:112px;height:112px;display:grid;place-items:center}
.rnl-medaille svg{position:absolute;inset:0;width:100%;height:100%;animation:rnl-tourne 28s linear infinite}
.rnl-medaille-fond{fill:color-mix(in srgb,var(--v) 85%,#000)}
.rnl-medaille-trait{fill:none;stroke:var(--or);stroke-width:1}
.rnl-medaille text{font-family:var(--f-texte);font-size:9.6px;font-weight:700;letter-spacing:.18em;fill:var(--or)}
.rnl-medaille img{position:relative;width:54px;height:54px;border-radius:50%;background:#fff}
@keyframes rnl-tourne{to{transform:rotate(360deg)}}
.rnl-flottant{position:absolute;z-index:5;left:0;bottom:4%;display:flex;gap:12px;align-items:center;max-width:270px;padding:12px 14px;border-radius:16px;background:#fff;color:var(--encre);box-shadow:0 22px 40px -16px rgba(0,0,0,.55)}
.rnl-flottant b{display:block;font-size:14px;color:var(--v)}
.rnl-flottant span:last-child{font-size:12.5px;line-height:1.4;color:var(--gris)}
.rnl-flottant-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--lavande);color:var(--v)}
.rnl-flottant-ic svg{width:22px;height:22px}
@media (max-width:520px){.rnl-medaille{width:84px;height:84px;top:0;left:0}.rnl-medaille img{width:40px;height:40px}.rnl-flottant{max-width:230px;padding:10px 12px}.rnl .rnl-livre3d{width:47%}}
@media (prefers-reduced-motion:no-preference){
  .rnl-livre3d{animation:rnl-entree 1.1s cubic-bezier(.2,.8,.2,1) both}
  .rnl-livre3d-1{animation-delay:.15s}
  .rnl-livre-second{animation:rnl-entree2 1.1s .15s cubic-bezier(.2,.8,.2,1) both}
  .rnl-flottant{animation:rnl-monte .8s .5s cubic-bezier(.2,.8,.2,1) both}
  @keyframes rnl-entree{from{opacity:0;transform:rotateY(-50deg) translateY(40px)}}
  @keyframes rnl-entree2{from{opacity:0;transform:rotate(14deg) translateY(40px)}}
  @keyframes rnl-monte{from{opacity:0;transform:translateY(16px)}}
}
@media (prefers-reduced-motion:reduce){.rnl-medaille svg,.rnl-pulse{animation:none}}

/* bandeau de confiance */
.rnl-confiance{list-style:none;margin:0 auto;padding-top:26px;padding-bottom:30px;display:grid;grid-template-columns:1fr 1fr;gap:18px 20px;position:relative;border-top:1px solid rgba(255,255,255,.1)}
@media (min-width:900px){.rnl-confiance{grid-template-columns:repeat(4,1fr)}}
.rnl-confiance li{display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:center}
.rnl-confiance li span{grid-row:span 2;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.08);color:var(--or)}
.rnl-confiance svg{width:22px;height:22px}
.rnl-confiance b{font-size:14.5px}
.rnl-confiance small{font-size:12.5px;opacity:.72;line-height:1.35}
@media (max-width:599px){.rnl-confiance li{display:flex;flex-direction:column;align-items:flex-start;gap:4px}.rnl-confiance li span{margin-bottom:6px}.rnl-confiance b{font-size:14px;line-height:1.3}}

/* pour qui */
.rnl-publics{display:grid;gap:16px}
@media (min-width:860px){.rnl-publics{grid-template-columns:repeat(3,1fr);gap:20px}}
.rnl .rnl-public{font:inherit;text-align:left;display:grid;gap:8px;align-content:start;padding:24px;border-radius:20px;border:1px solid var(--trait);background:linear-gradient(180deg,#fff,var(--lavande));color:var(--encre);cursor:pointer;transition:transform .25s,box-shadow .25s,border-color .25s}
.rnl .rnl-public:hover{transform:translateY(-4px);box-shadow:0 22px 40px -22px rgba(61,12,82,.45);border-color:color-mix(in srgb,var(--or) 60%,#fff)}
.rnl-public-ic{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--v);color:var(--or);margin-bottom:6px}
.rnl-public-ic svg{width:26px;height:26px}
.rnl-public b{font-family:var(--f-titre);font-size:21px;color:var(--v);line-height:1.15}
.rnl-public > span:not(.rnl-public-ic){color:var(--gris);line-height:1.55;font-size:15px}
.rnl-public em{font-style:normal;font-weight:700;font-size:14px;color:var(--v);display:inline-flex;align-items:center;gap:6px;margin-top:6px}
.rnl-public em svg{width:16px;height:16px}

/* quatre piliers */
.rnl-piliers4{margin-top:80px;background:var(--v);color:#fff;padding:72px 0;position:relative;overflow:hidden}
.rnl-piliers4::before{content:"";position:absolute;right:-12%;top:-30%;width:60%;aspect-ratio:1;border-radius:50%;border:1px solid color-mix(in srgb,var(--or) 40%,transparent);box-shadow:0 0 0 40px color-mix(in srgb,var(--or) 5%,transparent),0 0 0 80px color-mix(in srgb,var(--or) 4%,transparent)}
.rnl-piliers4-grille{display:grid;gap:40px;position:relative}
@media (min-width:960px){.rnl-piliers4-grille{grid-template-columns:.9fr 1.1fr;gap:72px;align-items:center}}
.rnl-piliers4 .rnl-titre{color:#fff}
.rnl-piliers4 .rnl-surtitre-sombre{color:var(--or)}
.rnl-piliers4-tete > p:not(.rnl-surtitre-sombre){color:rgba(255,255,255,.8);line-height:1.6;max-width:44ch;margin:0}
.rnl-piliers4-livre{display:none}
@media (min-width:960px){.rnl-piliers4-livre{display:block;width:180px;margin-top:30px;border-radius:2px 6px 6px 2px;transform:rotate(-4deg);box-shadow:0 30px 50px -18px rgba(0,0,0,.6)}}
.rnl-bascule{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);margin:0 0 18px}
.rnl .rnl-bascule button{font:inherit;font-size:14px;font-weight:600;color:rgba(255,255,255,.8);background:none;border:0;border-radius:999px;padding:9px 16px;cursor:pointer}
.rnl .rnl-bascule button[aria-selected=true]{background:var(--or);color:#21130C}
@media (prefers-reduced-motion:no-preference){.rnl-piliers4-liste li{animation:rnl-monte .5s cubic-bezier(.2,.8,.2,1) both}.rnl-piliers4-liste li:nth-child(2){animation-delay:.06s}.rnl-piliers4-liste li:nth-child(3){animation-delay:.12s}.rnl-piliers4-liste li:nth-child(4){animation-delay:.18s}}
.rnl-piliers4-liste{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.rnl-piliers4-liste li{display:grid;grid-template-columns:72px 1fr;gap:16px;padding:22px 0;border-top:1px solid rgba(255,255,255,.14)}
.rnl-piliers4-liste li:last-child{border-bottom:1px solid rgba(255,255,255,.14)}
.rnl-num{font-family:var(--f-titre);font-size:44px;font-weight:800;line-height:.9;color:transparent;-webkit-text-stroke:1.2px var(--or)}
.rnl-piliers4-liste b{font-family:var(--f-titre);font-size:24px;display:block;margin-bottom:6px}
.rnl-piliers4-liste p{margin:0;color:rgba(255,255,255,.8);line-height:1.55}

/* application */
.rnl-appli{margin-top:88px;background:linear-gradient(150deg,color-mix(in srgb,var(--v) 85%,#000),var(--v));color:#fff;overflow:hidden}
.rnl-appli-grille{display:grid;gap:36px;padding-top:64px;padding-bottom:0;align-items:end}
@media (min-width:900px){.rnl-appli-grille{grid-template-columns:1.1fr .9fr;gap:60px;padding-top:72px}}
.rnl-appli-grille > div:first-child{display:grid;gap:18px;justify-items:start;padding-bottom:64px}
.rnl-appli h2{font-size:clamp(28px,4vw,42px);line-height:1.08;max-width:18ch}
.rnl-appli p{margin:0;color:rgba(255,255,255,.82);line-height:1.6;max-width:48ch}
.rnl-appli ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.rnl-appli li{display:flex;gap:10px;align-items:center}
.rnl-appli li svg{width:20px;height:20px;color:var(--or);flex:none}
.rnl-appli-ok{display:inline-flex;gap:8px;align-items:center;font-weight:700;color:#3ddc84}
.rnl-appli-ok svg{width:20px;height:20px}
.rnl-appli-aide{font-size:14px;color:rgba(255,255,255,.8);max-width:44ch;line-height:1.5}
.rnl-telephone{justify-self:center;position:relative;width:min(290px,78vw)}
.rnl-telephone-ecran{border:10px solid #120716;border-bottom:0;border-radius:38px 38px 0 0;background:#fff;overflow:hidden;height:420px;box-shadow:0 -10px 60px -10px color-mix(in srgb,var(--or) 45%,transparent)}
.rnl-tel-tete{display:flex;align-items:center;gap:8px;padding:22px 14px 12px;background:var(--v);color:#fff;font-family:var(--f-titre);font-size:14px;font-weight:700;border-bottom:3px solid var(--or)}
.rnl-tel-tete img{width:28px;height:28px;border-radius:50%;background:#fff}
.rnl-tel-corps{display:grid;justify-items:center;gap:8px;padding:18px 16px;color:var(--encre);text-align:center}
.rnl-tel-livres{display:flex;gap:12px;justify-content:center;width:100%}
.rnl-tel-livres > span{display:grid;gap:6px;justify-items:center;width:42%}
.rnl-tel-livres img{width:100%;border-radius:2px 5px 5px 2px;box-shadow:0 14px 24px -10px rgba(40,10,60,.5)}
.rnl-tel-livres i{font-style:normal;font-family:var(--f-titre);font-weight:800;color:var(--v);font-size:14px}
.rnl-tel-corps b{font-family:var(--f-titre);color:var(--v);font-size:15px;line-height:1.2}
.rnl-tel-prix{font-family:var(--f-titre);font-weight:800;font-size:20px;color:var(--v)}
.rnl-tel-btn{width:100%;background:var(--v);color:#fff;border-radius:999px;padding:10px;font-weight:700;font-size:13px}
.rnl-tel-suivi{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;justify-items:start;font-size:11.5px;color:var(--gris);width:100%;margin-top:4px}
.rnl-tel-suivi i{width:10px;height:10px;border-radius:50%;background:#1f8a4c}
.rnl-tel-suivi i.rnl-tel-gris{background:var(--trait)}
.rnl-telephone-nom{display:none}

/* barre d'achat fixe (téléphone) */
.rnl-barre{position:fixed;z-index:60;left:10px;right:10px;bottom:10px;display:flex;align-items:center;gap:8px;padding:8px;border-radius:18px;background:rgba(255,255,255,.97);backdrop-filter:blur(8px);box-shadow:0 18px 40px -12px rgba(30,5,40,.45),0 0 0 1px var(--trait);transform:translateY(130%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.rnl-barre-on{transform:none}
.rnl .rnl-barre-choix{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font:inherit;text-align:left;border:0;border-radius:12px;padding:6px 10px 6px 6px;cursor:pointer;background:var(--v);color:#fff}
.rnl .rnl-barre-choix + .rnl-barre-choix{background:linear-gradient(180deg,color-mix(in srgb,var(--or) 82%,#fff),var(--or));color:#21130C}
.rnl-barre-choix img{width:30px;flex:none;border-radius:2px 4px 4px 2px;box-shadow:0 4px 10px -3px rgba(0,0,0,.45)}
.rnl .rnl-barre .rnl-barre-choix span{display:grid;min-width:0;flex:1;color:inherit;font-size:inherit}
.rnl .rnl-barre .rnl-barre-choix b{color:inherit;font-size:16px}
.rnl-barre-choix small{font-size:11px;font-weight:600;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rnl .rnl-barre-choix b{font-family:var(--f-titre);font-size:16px;color:inherit;white-space:nowrap}
.rnl-barre span{flex:1;min-width:0;font-size:12.5px;color:var(--gris);line-height:1.3}
.rnl-barre b{display:block;font-family:var(--f-titre);font-size:15px;color:var(--v);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rnl .rnl-barre .rnl-btn{min-height:44px;padding:10px 18px}
@media (min-width:960px){.rnl-barre{left:auto;right:24px;bottom:24px;width:420px}}

/* apparition */
@media (prefers-reduced-motion:no-preference){
  .rnl [data-apparait]{opacity:0;transform:translateY(24px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
  .rnl [data-apparait].rnl-vu{opacity:1;transform:none}
}

/* carte : onde autour d'Abidjan */
.rnl-carte-onde{fill:none;stroke:var(--or);stroke-width:1.5;opacity:.6;transform-box:fill-box;transform-origin:center;animation:rnl-onde 2.4s ease-out infinite}
@keyframes rnl-onde{from{transform:scale(.5);opacity:.8}to{transform:scale(1.8);opacity:0}}

/* guides */
.rnl-guides{display:grid;gap:28px}
@media (min-width:980px){.rnl-guides{grid-template-columns:1fr 1fr}}
.rnl-guide{display:grid;grid-template-columns:minmax(110px,38%) 1fr;gap:22px;align-items:start;padding:22px;border:1px solid var(--trait);border-radius:20px;background:var(--papier)}
@media (max-width:520px){.rnl-guide{grid-template-columns:1fr;padding:18px}.rnl-guide-couverture{max-width:220px;justify-self:center}}
.rnl-guide-couverture{border:0;padding:0;background:none;cursor:pointer;border-radius:3px 8px 8px 3px;box-shadow:inset 4px 0 0 rgba(0,0,0,.2),0 14px 26px -8px rgba(40,10,60,.45)}
.rnl-guide-couverture img{display:block;width:100%;aspect-ratio:3/4.2;object-fit:cover;border-radius:3px 8px 8px 3px}
.rnl-guide-couverture:focus-visible{outline:3px solid var(--or);outline-offset:4px}
.rnl-guide-corps{display:grid;gap:10px}
.rnl-guide-public{margin:0;font-size:13px;font-weight:600;color:color-mix(in srgb,var(--or) 75%,#000)}
.rnl-guide h3{font-size:24px;line-height:1.15;color:var(--v)}
.rnl-guide-resume{margin:0;color:var(--gris);line-height:1.55}
.rnl-guide-etiquettes{display:flex;flex-wrap:wrap;gap:8px;margin:0}
.rnl-guide-etiquettes span{font-size:12px;font-weight:700;letter-spacing:.04em;padding:5px 10px;border-radius:999px;background:var(--lavande);color:var(--v)}
.rnl-guide-etiquettes .rnl-dispo{background:#E8F6EE;color:#14663A}
.rnl-guide-etiquettes .rnl-dispo::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#1f8a4c;margin-right:6px;vertical-align:1px}
.rnl-guide-etiquettes .rnl-avenir{background:color-mix(in srgb,var(--or) 18%,#fff);color:color-mix(in srgb,var(--or) 60%,#000)}
.rnl-guide-rassure{margin:0;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--gris)}
.rnl-guide-rassure svg{width:16px;height:16px;color:#1f8a4c}
.rnl-guide{transition:box-shadow .3s,transform .3s}
.rnl-guide:not(.rnl-guide-bientot):hover{box-shadow:0 30px 60px -30px rgba(61,12,82,.4)}
.rnl-chapitres{margin:6px 0 0;display:grid;gap:10px}
.rnl-chapitres div{display:grid;grid-template-columns:96px 1fr;gap:10px;padding-top:10px;border-top:1px solid var(--trait)}
.rnl-chapitres dt{font-family:var(--f-titre);font-weight:700;color:var(--v)}
.rnl-chapitres dd{margin:0;font-size:14px;color:var(--gris);line-height:1.5}
.rnl-guide-achat{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:10px;padding-top:14px;border-top:1px solid var(--trait)}
.rnl-prix{font-family:var(--f-titre);font-size:26px;font-weight:800;color:var(--v);margin-right:auto}
.rnl-qte{display:inline-flex;align-items:center;border:1.5px solid var(--trait);border-radius:999px;overflow:hidden}
.rnl .rnl-qte button{font:inherit;width:38px;height:42px;border:0;background:var(--lavande);color:var(--v);font-size:18px;cursor:pointer}
.rnl-qte span{min-width:36px;text-align:center;font-weight:600}

/* valeurs */
.rnl-valeurs{margin-top:80px;background:var(--lavande);padding:56px 0}
.rnl-valeurs blockquote{margin:0 0 30px;font-family:var(--f-titre);font-size:clamp(24px,3.6vw,38px);line-height:1.2;color:var(--v);max-width:30ch;text-wrap:balance}
.rnl-piliers{display:grid;gap:20px}
@media (min-width:760px){.rnl-piliers{grid-template-columns:repeat(3,1fr)}}
.rnl-piliers div{display:grid;gap:6px}
.rnl-piliers b{font-family:var(--f-titre);font-size:22px;color:var(--v)}
.rnl-piliers span{color:var(--gris);line-height:1.55}

/* établissements */
.rnl-etab{background:var(--v2);color:#fff;padding:64px 0;margin-top:0}
.rnl-etab-grille{display:grid;gap:32px;align-items:start}
@media (min-width:900px){.rnl-etab-grille{grid-template-columns:1fr 1fr;gap:56px}}
.rnl-etab h2{font-size:clamp(28px,4vw,40px);line-height:1.1;margin-bottom:14px}
.rnl-etab p{opacity:.88;line-height:1.6;max-width:46ch}
.rnl-etab ul{margin:18px 0 0;padding-left:20px;display:grid;gap:8px;opacity:.95}
.rnl-etab ul li::marker{color:var(--or)}
.rnl-etab-form{background:#fff;color:var(--encre);border-radius:20px;padding:22px;display:grid;gap:14px}
.rnl-deux{display:grid;gap:14px}
@media (min-width:520px){.rnl-deux{grid-template-columns:1fr 1fr}}

/* national */
.rnl-national{display:grid;gap:28px;align-items:center}
@media (min-width:900px){.rnl-national{grid-template-columns:1fr 1fr}}
.rnl-national p{color:var(--gris);line-height:1.65;max-width:52ch}
.rnl-carte{width:100%;max-width:440px;justify-self:center}
.rnl-carte-pays{fill:var(--lavande);stroke:color-mix(in srgb,var(--v) 45%,#fff);stroke-width:2;stroke-linejoin:round}
.rnl-carte-point{fill:var(--or);stroke:#fff;stroke-width:2}
.rnl-carte-ville{font-family:var(--f-texte);font-size:12px;fill:var(--encre)}

/* étapes */
.rnl-etapes{list-style:none;padding:0;margin:0;display:grid;gap:18px;counter-reset:e}
@media (min-width:860px){.rnl-etapes{grid-template-columns:repeat(3,1fr)}}
.rnl-etapes li{counter-increment:e;display:grid;gap:6px;padding-top:16px;border-top:2px solid var(--v)}
.rnl-etapes li::before{content:counter(e);font-family:var(--f-titre);font-size:34px;font-weight:800;color:var(--or);line-height:1}
.rnl-etapes b{font-size:17px}.rnl-etapes span{color:var(--gris);line-height:1.55}

/* faq */
.rnl-faq details{border-top:1px solid var(--trait);padding:16px 0}
.rnl-faq details:last-of-type{border-bottom:1px solid var(--trait)}
.rnl-faq summary{cursor:pointer;font-weight:600;font-size:17px;list-style:none;display:flex;justify-content:space-between;gap:16px}
.rnl-faq summary::-webkit-details-marker{display:none}
.rnl-faq summary::after{content:"+";font-family:var(--f-titre);font-size:24px;color:var(--v);line-height:1}
.rnl-faq details[open] summary::after{content:"−"}
.rnl-faq p{margin:10px 0 0;color:var(--gris);line-height:1.6;max-width:70ch}

/* initiative */
.rnl-initiative{margin-top:72px;border-top:1px solid var(--trait);padding:32px 0}
.rnl-initiative .rnl-cadre{display:flex;flex-wrap:wrap;align-items:center;gap:18px}
.rnl-initiative img{width:56px;height:56px;border-radius:50%}
.rnl-initiative p{margin:0;flex:1;min-width:220px;color:var(--gris)}
.rnl .rnl-initiative .rnl-btn-ligne{color:var(--v);border-color:var(--v)}
/* en-tête */
.rnl-entete{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.96);backdrop-filter:saturate(1.2) blur(8px);border-bottom:1px solid var(--trait)}
.rnl-entete-bande{height:4px;background:linear-gradient(90deg,#F77F00 0 33.3%,#fff 33.3% 66.6%,#009E60 66.6%)}
.rnl-entete-in{display:flex;align-items:center;gap:20px;min-height:68px}
.rnl .rnl-marque{display:flex;align-items:center;gap:12px;border:0;background:none;padding:0;cursor:pointer;text-align:left;color:var(--encre);font:inherit;min-width:0}
.rnl-marque img{width:46px;height:46px;border-radius:50%;flex:none}
.rnl-marque b{display:block;font-family:var(--f-titre);font-size:18px;color:var(--v);line-height:1.1}
.rnl-marque small{display:block;font-size:12px;color:var(--gris)}
.rnl-menu{display:none;gap:4px;margin-left:auto}
@media (min-width:980px){.rnl-menu{display:flex}}
.rnl .rnl-menu button{font:inherit;font-size:14px;font-weight:600;color:var(--encre);background:none;border:0;padding:10px 12px;border-radius:999px;cursor:pointer}
.rnl .rnl-menu button:hover,.rnl .rnl-menu button[aria-current=page]{background:var(--lavande);color:var(--v)}
.rnl-entete-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
@media (min-width:980px){.rnl-entete-actions{margin-left:8px}.rnl-seul-mobile{display:none!important}}
.rnl .rnl-icone{width:42px;height:42px;border-radius:50%;border:1px solid var(--trait);background:#fff;color:var(--v);display:grid;place-items:center;cursor:pointer}
.rnl .rnl-panier{position:relative;display:inline-flex;align-items:center;gap:8px;font:inherit;font-weight:600;font-size:14px;background:var(--v);color:#fff;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;min-height:42px}
.rnl-panier svg,.rnl-icone svg{width:20px;height:20px}
.rnl-panier em{font-style:normal;background:var(--or);color:#21130C;border-radius:999px;min-width:22px;height:22px;display:grid;place-items:center;font-size:12px;font-weight:700;padding:0 6px}
@media (max-width:520px){.rnl-cache-mobile{display:none}.rnl-marque small{display:none}.rnl-marque b{font-size:16px}}
.rnl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}

/* pied */
.rnl-pied{background:var(--v2);color:#fff;margin-top:0}
.rn .rnl-pied button{width:auto;min-height:0;box-shadow:none}
.rnl-pied-grille{display:grid;gap:30px;padding-top:48px;padding-bottom:32px}
@media (min-width:860px){.rnl-pied-grille{grid-template-columns:1.4fr 1fr 1fr 1fr}}
.rnl-pied-marque{display:grid;gap:14px;align-content:start}
.rnl-pied-marque img{width:68px;height:68px;border-radius:50%;background:#fff;padding:2px}
.rnl-pied-marque p{margin:0;opacity:.85;line-height:1.6;max-width:36ch}
.rnl-pied-marque b{font-family:var(--f-titre);font-size:18px}
.rnl-pied h4{margin:0 0 10px;font-family:var(--f-titre);font-size:16px;color:var(--or)}
.rnl-pied-grille > div:not(.rnl-pied-marque){display:grid;gap:8px;align-content:start}
.rn .rnl-pied button,.rnl-pied a,.rnl-pied span{font:inherit;font-size:14px;color:rgba(255,255,255,.85);background:none;border:0;padding:0;text-align:left;cursor:pointer;text-decoration:none}
.rn .rnl-pied button:hover,.rnl-pied a:hover{color:#fff;text-decoration:underline}
.rnl-pied-bas{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;padding-top:16px;padding-bottom:22px;border-top:1px solid rgba(255,255,255,.15);font-size:12px}
.rnl-pied-bas span{font-size:12px;opacity:.7;cursor:default}

/* fiche */
.rnl-fiche{padding-top:22px;padding-bottom:72px}
.rnl .rnl-retour{font:inherit;font-weight:600;font-size:14px;color:var(--v);background:none;border:0;padding:6px 0;cursor:pointer}
.rnl .rnl-retour::before{content:"‹ "}
.rnl-fiche-grille{display:grid;gap:36px;margin-top:14px;align-items:start}
@media (min-width:900px){.rnl-fiche-grille{grid-template-columns:.9fr 1.1fr;gap:64px}}
.rnl-fiche-visuel{background:radial-gradient(70% 70% at 50% 40%,color-mix(in srgb,var(--or) 25%,transparent),transparent 70%),var(--lavande);border-radius:24px;padding:48px 24px 56px;display:grid;place-items:center}
.rnl .rnl-livre-seul{width:min(320px,80%);cursor:default;transform:rotate(-2deg)}
.rnl-fiche-texte{display:grid;gap:14px;align-content:start}
.rnl-fiche-texte h1{font-size:clamp(30px,4vw,44px);line-height:1.08;color:var(--v)}
.rnl-fiche-edition{margin:0;font-weight:600;color:var(--gris)}
.rnl-fiche-resume{margin:0;font-size:17px;line-height:1.65;color:var(--encre);max-width:58ch}
.rnl-fiche-achat{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:18px 0;border-top:1px solid var(--trait);border-bottom:1px solid var(--trait);margin-top:6px}
.rnl-fiche-garanties{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.rnl-fiche-garanties li{padding-left:26px;position:relative;color:var(--gris)}
.rnl-fiche-garanties li::before{content:"";position:absolute;left:0;top:6px;width:14px;height:8px;border-left:2.5px solid var(--or);border-bottom:2.5px solid var(--or);transform:rotate(-45deg)}
.rnl-fiche-texte h2{font-size:22px;color:var(--v);margin-top:14px}
.rnl-fiche-autres{margin-top:56px}
.rnl-fiche-autres h2{font-size:26px;color:var(--v);margin-bottom:16px}
.rnl-autres{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.rnl .rnl-autres button{display:flex;gap:14px;align-items:center;text-align:left;font:inherit;background:#fff;border:1px solid var(--trait);border-radius:16px;padding:12px;cursor:pointer;color:var(--encre)}
.rnl-autres img{width:64px;border-radius:3px 6px 6px 3px;box-shadow:0 8px 16px -6px rgba(40,10,60,.4)}
.rnl-autres b{display:block;font-family:var(--f-titre);color:var(--v);margin-bottom:4px}

.rnl-bientot{display:inline-block;margin-right:auto;font-weight:600;color:var(--v);background:var(--lavande);border:1px dashed color-mix(in srgb,var(--v) 40%,#fff);padding:8px 14px;border-radius:999px;font-size:14px}
.rnl-guide-bientot .rnl-guide-couverture{cursor:default}
/* badge « vu à la télévision » dans l'ouverture */
.rnl .rnl-vu-tv{font:inherit;display:inline-flex;align-items:center;gap:12px;background:none;border:0;padding:4px 0;color:#fff;cursor:pointer;text-align:left}
.rnl-vu-tv-jeu{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff;color:var(--v);box-shadow:0 0 0 6px rgba(255,255,255,.12)}
.rnl-vu-tv-jeu svg{width:16px;height:16px;margin-left:2px}
.rnl-vu-tv span:last-child{font-weight:700;font-size:14.5px;line-height:1.25}
.rnl-vu-tv small{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--or)}
.rnl .rnl-vu-tv:hover .rnl-vu-tv-jeu{transform:scale(1.06)}

/* presse */
.rnl-presse{background:#140818;color:#fff;padding:76px 0 64px;position:relative;overflow:hidden}
.rnl-presse::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 70% at 15% 20%,color-mix(in srgb,var(--v) 75%,transparent),transparent 70%),radial-gradient(50% 60% at 90% 90%,color-mix(in srgb,var(--or) 18%,transparent),transparent 70%);pointer-events:none}
.rnl-presse .rnl-cadre{position:relative}
.rnl-presse-grille{display:grid;gap:36px;align-items:center}
@media (min-width:980px){.rnl-presse-grille{grid-template-columns:1.25fr 1fr;gap:56px}}
.rnl-video-cadre{position:relative;border-radius:20px;overflow:hidden;background:#000;aspect-ratio:16/9;box-shadow:0 40px 80px -30px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.08)}
.rnl-video video{display:block;width:100%;height:100%;object-fit:cover;background:#000}
.rnl .rnl-video-jouer{position:absolute;inset:0;border:0;padding:0 0 22px 22px;cursor:pointer;display:flex;align-items:flex-end;gap:16px;color:#fff;font:inherit;text-align:left;background:linear-gradient(180deg,rgba(20,8,24,0) 30%,rgba(20,8,24,.92) 100%)}
.rnl-video-rond{width:70px;height:70px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--or);color:#21130C;box-shadow:0 0 0 10px color-mix(in srgb,var(--or) 25%,transparent);transition:transform .25s}
.rnl-video-rond svg{width:26px;height:26px;margin-left:4px}
.rnl .rnl-video-jouer:hover .rnl-video-rond{transform:scale(1.08)}
@media (prefers-reduced-motion:no-preference){.rnl-video-rond{animation:rnl-halo 2.4s infinite}@keyframes rnl-halo{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--or) 45%,transparent)}100%{box-shadow:0 0 0 22px transparent}}}
.rnl-video-titre{display:grid;font-family:var(--f-titre);font-size:clamp(18px,2.2vw,24px);font-weight:700;line-height:1.15;padding-bottom:6px}
.rnl-video-titre small{font-family:var(--f-texte);font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--or);margin-bottom:4px}
.rnl-video-titre em{font-style:normal;font-family:var(--f-texte);font-size:13px;font-weight:600;opacity:.75;margin-left:6px}
.rnl-video-legende{margin:12px 2px 0;font-size:12.5px;color:rgba(255,255,255,.55);line-height:1.5}
.rnl-presse-texte{display:grid;gap:16px;align-content:start}
.rnl-presse-texte h2{font-size:clamp(28px,3.4vw,40px);line-height:1.08;text-wrap:balance}
.rnl-presse-texte > p:not(.rnl-surtitre){margin:0;color:rgba(255,255,255,.78);line-height:1.65}
.rnl-citation-rti{margin:4px 0 0;padding:20px 22px;border-left:3px solid var(--or);border-radius:0 16px 16px 0;background:rgba(255,255,255,.06)}
.rnl-citation-rti blockquote{margin:0;font-family:var(--f-titre);font-size:clamp(17px,1.7vw,20px);line-height:1.45;color:#fff}
.rnl-citation-rti figcaption{margin-top:10px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--or)}
.rnl-personnalites{list-style:none;margin:44px 0 0;padding:0;display:grid;gap:16px}
@media (min-width:900px){.rnl-personnalites{grid-template-columns:repeat(3,1fr)}}
.rnl-personnalites li{display:flex;flex-direction:column;justify-content:space-between;gap:18px;padding:22px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
.rnl-personnalites blockquote{margin:0;font-family:var(--f-titre);font-size:17px;line-height:1.5;color:rgba(255,255,255,.92)}
.rnl-personnalite{display:flex;gap:12px;align-items:center;padding-top:16px;border-top:1px solid rgba(255,255,255,.1)}
.rnl-personnalites img{width:48px;height:58px;flex:none;object-fit:cover;border-radius:10px}
.rnl-personnalite span{font-size:12.5px;line-height:1.45;color:rgba(255,255,255,.65)}
.rnl-personnalite b{display:block;font-size:15px;color:#fff;font-family:var(--f-titre)}
.rnl .rnl-guide-rti{font:inherit;display:inline-flex;align-items:center;gap:8px;justify-self:start;background:none;border:0;padding:0;cursor:pointer;font-size:13px;font-weight:600;color:var(--v);text-decoration:underline;text-underline-offset:3px}
.rnl-guide-rti svg{width:14px;height:14px;color:var(--or)}
.rnl-theme{margin-top:44px;display:grid;gap:12px;justify-items:center;text-align:center;padding:30px 24px;border-radius:22px;border:1px solid color-mix(in srgb,var(--or) 45%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--or) 10%,transparent),transparent)}
.rnl-theme-tag{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#21130C;background:var(--or);padding:6px 14px;border-radius:999px}
.rnl-theme p{margin:0;font-family:var(--f-titre);font-size:clamp(20px,2.8vw,30px);line-height:1.25;max-width:30ch;text-wrap:balance}

/* valeurs à quatre piliers */
@media (min-width:860px){.rnl-piliers-4{grid-template-columns:repeat(4,1fr)!important}}
.rnl-piliers-4 b{font-size:20px!important}

.rnl-tournee{padding:14px 16px;border-radius:14px;background:var(--lavande);border-left:3px solid var(--or);color:var(--encre)!important}
.rnl-tournee b{color:var(--v)}
`;

// ------------------------------------------------------------------ en-tête de la boutique des guides
export function EnteteLivres({ boutique, nbPanier, aller, vue }) {
  usePolices();
  const p = boutique.parametres || {};
  const nom = p.nom_plateforme || boutique.nom;
  const versAccueil = (ancre) => {
    aller({});
    if (ancre) setTimeout(() => document.getElementById(ancre)?.scrollIntoView({ behavior: "smooth" }), 80);
  };
  return (
    <header className="rnl rnl-entete">
      <div className="rnl-entete-bande" />
      <div className="rnl-cadre rnl-entete-in">
        <button className="rnl-marque" onClick={() => versAccueil()} aria-label="Accueil">
          {boutique.logo_url ? <img src={boutique.logo_url} alt="" /> : null}
          <span><b>Miss & Mister Excellence</b><small>Côte d'Ivoire · Boutique officielle</small></span>
        </button>
        <nav className="rnl-menu" aria-label="Navigation principale">
          <button onClick={() => versAccueil("rnl-guides")}>Les guides</button>
          <button onClick={() => versAccueil("rnl-presse")}>Vu à la RTI</button>
          <button onClick={() => versAccueil("rnl-etablissements")}>Établissements</button>
          <button onClick={() => aller({ vue: "mes-commandes" })} aria-current={vue === "mes-commandes" ? "page" : undefined}>Suivre ma commande</button>
          <button onClick={() => aller({ vue: "page", page: "contact" })}>Contact</button>
        </nav>
        <div className="rnl-entete-actions">
          <button className="rnl-icone rnl-seul-mobile" onClick={() => aller({ vue: "mes-commandes" })} aria-label="Suivre ma commande">{Icone.colis}</button>
          <button className="rnl-panier" onClick={() => aller({ vue: "panier" })} aria-label={`Panier, ${nbPanier} article${nbPanier > 1 ? "s" : ""}`}>
            {Icone.panier}<span className="rnl-cache-mobile">Panier</span>{nbPanier ? <em>{nbPanier}</em> : null}
          </button>
        </div>
      </div>
      <span className="rnl-sr">{nom}</span>
    </header>
  );
}

// ------------------------------------------------------------------ pied de page institutionnel
export function PiedLivres({ boutique, aller, slug }) {
  usePolices();
  const p = boutique.parametres || {};
  const tels = String(p.contact_telephone || "").split(/[\/,;]/).map((x) => x.trim()).filter(Boolean);
  return (
    <footer className="rnl rnl-pied">
      <div className="rnl-entete-bande" />
      <div className="rnl-cadre rnl-pied-grille">
        <div className="rnl-pied-marque">
          {boutique.logo_url ? <img src={boutique.logo_url} alt="" /> : null}
          <p><b>Miss & Mister Excellence Côte d'Ivoire</b><br />Beauté, leadership, excellence. Les publications officielles du concours, livrées dans tout le pays.</p>
        </div>
        <div>
          <h4>Commander</h4>
          <button onClick={() => aller({})}>Les guides</button>
          <button onClick={() => aller({ vue: "mes-commandes" })}>Suivre ma commande</button>
          <button onClick={() => aller({ vue: "page", page: "livraison" })}>Livraison</button>
          <button onClick={() => aller({ vue: "page", page: "retours" })}>Retours et réclamations</button>
        </div>
        <div>
          <h4>Informations</h4>
          <button onClick={() => aller({ vue: "page", page: "conditions" })}>Conditions générales de vente</button>
          <button onClick={() => aller({ vue: "page", page: "confidentialite" })}>Données personnelles</button>
          <button onClick={() => aller({ vue: "page", page: "contact" })}>Nous contacter</button>
          <a href={`?reseau=${encodeURIComponent(slug)}&espace=representant`}>Espace représentants</a>
        </div>
        <div>
          <h4>Nous joindre</h4>
          {tels.map((t) => <a key={t} href={"tel:" + t.replace(/[^0-9+]/g, "")}>{t}</a>)}
          {boutique.whatsapp ? <a href={lienWhatsApp(boutique.whatsapp, "Bonjour, j'ai une question sur les guides Miss & Mister Excellence.")} target="_blank" rel="noreferrer">WhatsApp</a> : null}
          {p.contact_email ? <a href={"mailto:" + p.contact_email}>{p.contact_email}</a> : null}
          <span>Siège : Yopougon, Abidjan</span>
        </div>
      </div>
      <div className="rnl-cadre rnl-pied-bas">
        <span>© {new Date().getFullYear()} Miss & Mister Excellence Côte d'Ivoire{p.textes?.mentions_legales ? ` · ${p.textes.mentions_legales}` : ""}</span>
        <span>Paiement à la livraison · Wave · Orange Money · MTN MoMo</span>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------ fiche détaillée d'un guide
export function FicheLivre({ article: a, autres, ajouter, ouvrir, retour }) {
  usePolices();
  const [q, setQ] = useState(1);
  if (!a) return null;
  const f = FICHES[a.reference] || { public: a.categorie, resume: a.description, chapitres: [] };
  return (
    <div className="rnl rnl-fiche">
      <div className="rnl-cadre">
        <button className="rnl-retour" onClick={retour}>Retour aux guides</button>
        <div className="rnl-fiche-grille">
          <div className="rnl-fiche-visuel">
            <div className="rnl-livre rnl-livre-seul">{a.photos?.[0] ? <img src={a.photos[0]} alt={`Couverture : ${a.titre}`} /> : null}<span className="rnl-signet" /></div>
          </div>
          <div className="rnl-fiche-texte">
            <p className="rnl-guide-public">{f.public}</p>
            <h1>{a.titre}</h1>
            {a.marque ? <p className="rnl-fiche-edition">{a.marque}</p> : null}
            <p className="rnl-fiche-resume">{a.description || f.resume}</p>
            <div className="rnl-fiche-achat">
              <span className="rnl-prix">{fmt(a.prix)}</span>
              <span className="rnl-qte" role="group" aria-label="Quantité">
                <button onClick={() => setQ(Math.max(1, q - 1))} aria-label="Un de moins">−</button>
                <span>{q}</span>
                <button onClick={() => setQ(Math.min(a.disponible || 1, q + 1))} aria-label="Un de plus">+</button>
              </span>
              <button className="rnl-btn rnl-btn-violet" disabled={!a.disponible} onClick={() => ajouter(a, q)}>{a.disponible ? `Ajouter au panier · ${fmt(a.prix * q)}` : "Bientôt disponible"}</button>
            </div>
            <ul className="rnl-fiche-garanties">
              <li>Livré par le représentant de votre région</li>
              <li>Paiement à la livraison, Wave, Orange Money ou MTN</li>
              <li>Exemplaire neuf, édition officielle</li>
            </ul>
            {f.chapitres.length ? (
              <>
                <h2>Au sommaire</h2>
                <dl className="rnl-chapitres">{f.chapitres.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              </>
            ) : null}
          </div>
        </div>
        {autres?.length ? (
          <div className="rnl-fiche-autres">
            <h2>Voir aussi</h2>
            <div className="rnl-autres">
              {autres.map((o) => (
                <button key={o.id} onClick={() => ouvrir(o.id)}>
                  {o.photos?.[0] ? <img src={o.photos[0]} alt="" /> : null}
                  <span><b>{o.titre}</b>{fmt(o.prix)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
