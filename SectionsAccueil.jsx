import React, { useState, useEffect } from "react";

// ============================================================
// Rendu dynamique des sections de la page d'accueil.
// À importer dans CataloguePublic.jsx :
//
//   import SectionsAccueil from "./SectionsAccueil";
//
// Puis, dans l'useEffect existant, juste après avoir chargé
// `collections_publiques`, ajoute :
//
//   supabase.rpc("sections_accueil_publiques", { p_workspace_id: workspaceId })
//     .then(({ data }) => setSectionsAccueil(data || []));
//
// et déclare l'état : const [sectionsAccueil, setSectionsAccueil] = useState([]);
//
// Enfin, dans l'écran "ÉCRAN CATALOGUE (accueil)", insère
// <SectionsAccueil sections={sectionsAccueil} couleur={couleur} devise={entreprise.devise}
//   collectionsManuelles={collectionsManuelles} onOuvrirCollection={setCollectionOuverte} />
// juste après la bannière et avant le bloc "Meilleures ventes".
// ============================================================

export default function SectionsAccueil({ sections, couleur, devise, collectionsManuelles, onOuvrirCollection }) {
  if (!sections || sections.length === 0) return null;

  return (
    <div>
      {sections.map((s) => {
        switch (s.type) {
          case "hero_carousel":
            return <SectionHeroCarousel key={s.id} config={s.config} couleur={couleur} devise={devise} collectionsManuelles={collectionsManuelles} onOuvrirCollection={onOuvrirCollection} />;
          case "categories":
            return <SectionCategories key={s.id} titre={s.titre} config={s.config} couleur={couleur} collectionsManuelles={collectionsManuelles} onOuvrirCollection={onOuvrirCollection} />;
          case "flash_sale":
            return <SectionFlashSale key={s.id} titre={s.titre} config={s.config} couleur={couleur} collectionsManuelles={collectionsManuelles} onOuvrirCollection={onOuvrirCollection} />;
          case "avis":
            return <SectionAvis key={s.id} titre={s.titre} config={s.config} />;
          case "marques":
            return <SectionMarques key={s.id} titre={s.titre} config={s.config} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

// Cherche une collection manuelle par nom (insensible à la casse) pour le clic
function trouverCollectionParNom(nom, collectionsManuelles) {
  if (!nom || !collectionsManuelles) return null;
  return collectionsManuelles.find((c) => c.nom.trim().toLowerCase() === nom.trim().toLowerCase());
}

function gererClicLien(lien, collectionsManuelles, onOuvrirCollection) {
  if (!lien) return;
  const collectionTrouvee = trouverCollectionParNom(lien, collectionsManuelles);
  if (collectionTrouvee) {
    onOuvrirCollection(`manuelle-${collectionTrouvee.id}`);
  } else if (/^https?:\/\//.test(lien)) {
    window.open(lien, "_blank", "noopener,noreferrer");
  }
}

// ===== HERO CAROUSEL =====
function SectionHeroCarousel({ config, couleur, devise, collectionsManuelles, onOuvrirCollection }) {
  const slides = config?.slides || [];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) return null;
  const slide = slides[index];

  return (
    <div style={{ maxWidth: 1100, margin: "18px auto 0", padding: "0 16px" }}>
      <div
        style={{
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          minHeight: 180,
          background: slide.image_url ? `#EEF0EA` : `linear-gradient(135deg, ${couleur}, ${couleur}dd)`,
          display: "flex",
          alignItems: "center",
          padding: "26px 28px",
        }}
      >
        {slide.image_url && (
          <img src={slide.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.1))" }} />
        <div style={{ position: "relative", color: "white", maxWidth: 420 }}>
          {slide.titre && <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 6, lineHeight: 1.25 }}>{slide.titre}</div>}
          {slide.sous_titre && <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 14, lineHeight: 1.5 }}>{slide.sous_titre}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {slide.texte_cta && (
              <button
                onClick={() => gererClicLien(slide.lien_cta, collectionsManuelles, onOuvrirCollection)}
                style={{ background: "white", color: "#16231F", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                {slide.texte_cta} →
              </button>
            )}
            {slide.prix_affiche && (
              <div style={{ fontSize: 11.5 }}>
                Dès <strong style={{ fontSize: 15 }}>{slide.prix_affiche} {devise}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
      {slides.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 999, border: "none", background: i === index ? couleur : "#DDD8CC", cursor: "pointer", padding: 0, transition: "width 0.2s" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== CATEGORIES =====
function SectionCategories({ titre, config, couleur, collectionsManuelles, onOuvrirCollection }) {
  const items = config?.items || [];
  if (items.length === 0) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "26px auto 0", padding: "0 16px" }}>
      {titre && <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{titre}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 12 }}>
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => gererClicLien(item.lien, collectionsManuelles, onOuvrirCollection)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: item.lien ? "pointer" : "default", padding: 0 }}
          >
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, overflow: "hidden" }}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
              ) : (
                item.emoji || "🛍️"
              )}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#16231F", textAlign: "center", lineHeight: 1.3 }}>{item.nom}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== FLASH SALE (avec compte à rebours) =====
function SectionFlashSale({ titre, config, couleur, collectionsManuelles, onOuvrirCollection }) {
  const [tempsRestant, setTempsRestant] = useState(null);
  const dateFin = config?.date_fin ? new Date(config.date_fin) : null;

  useEffect(() => {
    if (!dateFin) return;
    function calculer() {
      const diff = dateFin.getTime() - Date.now();
      if (diff <= 0) {
        setTempsRestant({ terminee: true });
        return;
      }
      const j = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setTempsRestant({ j, h, m, s, terminee: false });
    }
    calculer();
    const t = setInterval(calculer, 1000);
    return () => clearInterval(t);
  }, [dateFin]);

  if (tempsRestant?.terminee) return null;

  const deux = (n) => String(n).padStart(2, "0");

  return (
    <div style={{ maxWidth: 1100, margin: "26px auto 0", padding: "0 16px" }}>
      <div style={{ background: "#16231F", borderRadius: 16, padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ color: "#FBC94B", fontWeight: 800, fontSize: 17, marginBottom: 4 }}>⚡ {titre || "Vente Flash"}</div>
          {config?.description && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5 }}>{config.description}</div>}
        </div>

        {tempsRestant && !tempsRestant.terminee && (
          <div style={{ display: "flex", gap: 8 }}>
            {[["j", tempsRestant.j], ["h", tempsRestant.h], ["m", tempsRestant.m], ["s", tempsRestant.s]].map(([label, val]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", textAlign: "center", minWidth: 44 }}>
                <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>{deux(val)}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9.5, textTransform: "uppercase" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {config?.lien_collection && (
          <button
            onClick={() => gererClicLien(config.lien_collection, collectionsManuelles, onOuvrirCollection)}
            style={{ background: "#FBC94B", color: "#16231F", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Voir les offres →
          </button>
        )}
      </div>
    </div>
  );
}

// ===== AVIS CLIENTS (témoignages) =====
function SectionAvis({ titre, config }) {
  const avis = config?.avis || [];
  if (avis.length === 0) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "30px auto 0", padding: "0 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{titre || "Ce que disent nos clients"}</div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
        {avis.map((a, i) => (
          <div key={i} style={{ flex: "0 0 240px", background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16 }}>
            <div style={{ color: "#e8920a", fontSize: 13, marginBottom: 8 }}>{"★".repeat(a.note || 5)}{"☆".repeat(5 - (a.note || 5))}</div>
            {a.commentaire && <div style={{ fontSize: 12.5, color: "#16231F", lineHeight: 1.55, marginBottom: 10 }}>« {a.commentaire} »</div>}
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#6B7168" }}>{a.nom}{a.ville ? ` — ${a.ville}` : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== MARQUES PARTENAIRES =====
function SectionMarques({ titre, config }) {
  const logos = config?.logos || [];
  if (logos.length === 0) return null;
  return (
    <div style={{ maxWidth: 1100, margin: "30px auto 0", padding: "0 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, textAlign: "center" }}>{titre || "Nos marques partenaires"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 28 }}>
        {logos.map((logo, i) => {
          const image = (
            <img
              src={logo.image_url}
              alt={logo.nom || ""}
              style={{ height: 40, objectFit: "contain", filter: "grayscale(100%)", opacity: 0.7 }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          );
          return logo.lien ? (
            <a key={i} href={logo.lien} target="_blank" rel="noopener noreferrer">{image}</a>
          ) : (
            <div key={i}>{image}</div>
          );
        })}
      </div>
    </div>
  );
}
