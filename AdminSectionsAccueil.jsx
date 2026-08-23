import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ============================================================
// Gestionnaire admin des sections de la page d'accueil.
// À intégrer dans App.jsx, dans l'onglet "Ma Boutique" :
//
//   import AdminSectionsAccueil from "./AdminSectionsAccueil";
//   ...
//   <AdminSectionsAccueil workspaceId={workspace.id} />
//
// ⚠️ Suppose que la RLS de "sections_accueil" autorise déjà
// l'utilisateur connecté à lire/écrire les lignes de son workspace
// (voir 01_sections_accueil.sql — adapte la policy à ton modèle
// d'appartenance réel si besoin).
// ============================================================

const TYPES_SECTION = [
  { type: "hero_carousel", label: "🖼️ Bannière hero (carrousel)" },
  { type: "categories", label: "🗂️ Catégories" },
  { type: "flash_sale", label: "⚡ Vente flash" },
  { type: "avis", label: "⭐ Avis clients" },
  { type: "marques", label: "🏷️ Marques partenaires" },
];

function configVideParType(type) {
  switch (type) {
    case "hero_carousel": return { slides: [] };
    case "categories": return { items: [] };
    case "flash_sale": return { description: "", date_fin: "", lien_collection: "" };
    case "avis": return { avis: [] };
    case "marques": return { logos: [] };
    default: return {};
  }
}

export default function AdminSectionsAccueil({ workspaceId }) {
  const [sections, setSections] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [sectionEnEdition, setSectionEnEdition] = useState(null);
  const [afficherChoixType, setAfficherChoixType] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    chargerSections();
  }, [workspaceId]);

  async function chargerSections() {
    setChargement(true);
    const { data } = await supabase
      .from("sections_accueil")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("ordre", { ascending: true });
    setSections(data || []);
    setChargement(false);
  }

  async function basculerActif(section) {
    await supabase.from("sections_accueil").update({ actif: !section.actif }).eq("id", section.id);
    chargerSections();
  }

  async function supprimerSection(section) {
    if (!window.confirm(`Supprimer la section "${section.titre || section.type}" ?`)) return;
    await supabase.from("sections_accueil").delete().eq("id", section.id);
    chargerSections();
  }

  async function deplacerSection(index, direction) {
    const nouvelleListe = [...sections];
    const cible = index + direction;
    if (cible < 0 || cible >= nouvelleListe.length) return;
    [nouvelleListe[index], nouvelleListe[cible]] = [nouvelleListe[cible], nouvelleListe[index]];
    setSections(nouvelleListe);
    await Promise.all(
      nouvelleListe.map((s, i) => supabase.from("sections_accueil").update({ ordre: i }).eq("id", s.id))
    );
  }

  function creerNouvelleSection(type) {
    setAfficherChoixType(false);
    setSectionEnEdition({
      id: null,
      workspace_id: workspaceId,
      type,
      titre: "",
      actif: true,
      ordre: sections.length,
      config: configVideParType(type),
    });
  }

  async function enregistrerSection(section) {
    setEnregistrement(true);
    if (section.id) {
      await supabase
        .from("sections_accueil")
        .update({ titre: section.titre, config: section.config, actif: section.actif })
        .eq("id", section.id);
    } else {
      await supabase.from("sections_accueil").insert({
        workspace_id: section.workspace_id,
        type: section.type,
        titre: section.titre,
        actif: section.actif,
        ordre: section.ordre,
        config: section.config,
      });
    }
    setEnregistrement(false);
    setSectionEnEdition(null);
    chargerSections();
  }

  if (chargement) {
    return <div style={{ padding: 20, color: "#8A9089", fontSize: 13.5 }}>Chargement des sections…</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Sections de la page d'accueil</div>
          <div style={{ fontSize: 12, color: "#8A9089" }}>Active, réordonne et personnalise les blocs de ta boutique.</div>
        </div>
        <button
          onClick={() => setAfficherChoixType(true)}
          style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          + Ajouter une section
        </button>
      </div>

      {sections.length === 0 && (
        <div style={{ background: "#FAFAF7", border: "1px dashed #DDD8CC", borderRadius: 12, padding: 24, textAlign: "center", color: "#8A9089", fontSize: 13 }}>
          Aucune section pour l'instant. Ajoute ta première section pour personnaliser ta page d'accueil.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sections.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => deplacerSection(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, fontSize: 12, padding: 0, lineHeight: 1 }}>▲</button>
              <button onClick={() => deplacerSection(i, 1)} disabled={i === sections.length - 1} style={{ background: "none", border: "none", cursor: i === sections.length - 1 ? "default" : "pointer", opacity: i === sections.length - 1 ? 0.3 : 1, fontSize: 12, padding: 0, lineHeight: 1 }}>▼</button>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {TYPES_SECTION.find((t) => t.type === s.type)?.label || s.type} {s.titre ? `— ${s.titre}` : ""}
              </div>
              <div style={{ fontSize: 11, color: s.actif ? "#3B6D11" : "#8A9089" }}>{s.actif ? "Actif" : "Désactivé"}</div>
            </div>

            <button onClick={() => basculerActif(s)} style={{ background: s.actif ? "#EAF3DE" : "#F0F0EC", color: s.actif ? "#3B6D11" : "#6B7168", border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {s.actif ? "Désactiver" : "Activer"}
            </button>
            <button onClick={() => setSectionEnEdition(s)} style={{ background: "none", border: "1px solid #DDD8CC", borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              Modifier
            </button>
            <button onClick={() => supprimerSection(s)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>
              ×
            </button>
          </div>
        ))}
      </div>

      {afficherChoixType && (
        <div onClick={() => setAfficherChoixType(false)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Quel type de section ?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TYPES_SECTION.map((t) => (
                <button
                  key={t.type}
                  onClick={() => creerNouvelleSection(t.type)}
                  style={{ textAlign: "left", background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "11px 14px", fontSize: 13, cursor: "pointer" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sectionEnEdition && (
        <FormulaireSection
          section={sectionEnEdition}
          setSection={setSectionEnEdition}
          onFermer={() => setSectionEnEdition(null)}
          onEnregistrer={enregistrerSection}
          enregistrement={enregistrement}
        />
      )}
    </div>
  );
}

function FormulaireSection({ section, setSection, onFermer, onEnregistrer, enregistrement }) {
  const majConfig = (nouvelleConfig) => setSection({ ...section, config: { ...section.config, ...nouvelleConfig } });

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 560, borderRadius: "18px 18px 0 0", padding: "20px 20px 26px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{TYPES_SECTION.find((t) => t.type === section.type)?.label}</div>
          <button onClick={onFermer} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
        </div>

        <label style={labelStyle}>Titre de la section (optionnel)</label>
        <input value={section.titre || ""} onChange={(e) => setSection({ ...section, titre: e.target.value })} style={inputStyle} placeholder="Ex: Vente Flash de la semaine" />

        {section.type === "hero_carousel" && <FormHero config={section.config} majConfig={majConfig} />}
        {section.type === "categories" && <FormCategories config={section.config} majConfig={majConfig} />}
        {section.type === "flash_sale" && <FormFlashSale config={section.config} majConfig={majConfig} />}
        {section.type === "avis" && <FormAvis config={section.config} majConfig={majConfig} />}
        {section.type === "marques" && <FormMarques config={section.config} majConfig={majConfig} />}

        <button
          onClick={() => onEnregistrer(section)}
          disabled={enregistrement}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 18, opacity: enregistrement ? 0.6 : 1 }}
        >
          {enregistrement ? "Enregistrement..." : "Enregistrer la section"}
        </button>
      </div>
    </div>
  );
}

// ----- Sous-formulaires par type -----

function FormHero({ config, majConfig }) {
  const slides = config.slides || [];
  function majSlide(i, champ, valeur) {
    const nouvelles = [...slides];
    nouvelles[i] = { ...nouvelles[i], [champ]: valeur };
    majConfig({ slides: nouvelles });
  }
  function ajouterSlide() {
    majConfig({ slides: [...slides, { titre: "", sous_titre: "", image_url: "", texte_cta: "", lien_cta: "", prix_affiche: "" }] });
  }
  function supprimerSlide(i) {
    majConfig({ slides: slides.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {slides.map((slide, i) => (
        <div key={i} style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7168" }}>Slide {i + 1}</span>
            <button onClick={() => supprimerSlide(i)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 12 }}>Supprimer</button>
          </div>
          <input value={slide.titre} onChange={(e) => majSlide(i, "titre", e.target.value)} placeholder="Titre" style={inputStyle} />
          <input value={slide.sous_titre} onChange={(e) => majSlide(i, "sous_titre", e.target.value)} placeholder="Sous-titre" style={inputStyle} />
          <input value={slide.image_url} onChange={(e) => majSlide(i, "image_url", e.target.value)} placeholder="URL de l'image de fond" style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={slide.texte_cta} onChange={(e) => majSlide(i, "texte_cta", e.target.value)} placeholder="Texte du bouton" style={{ ...inputStyle, flex: 1 }} />
            <input value={slide.prix_affiche} onChange={(e) => majSlide(i, "prix_affiche", e.target.value)} placeholder="Prix (ex: 9 900)" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <input value={slide.lien_cta} onChange={(e) => majSlide(i, "lien_cta", e.target.value)} placeholder="Nom exact d'une collection, ou lien https://..." style={inputStyle} />
        </div>
      ))}
      <button onClick={ajouterSlide} style={boutonAjouterStyle}>+ Ajouter un slide</button>
    </div>
  );
}

function FormCategories({ config, majConfig }) {
  const items = config.items || [];
  function majItem(i, champ, valeur) {
    const nouvelles = [...items];
    nouvelles[i] = { ...nouvelles[i], [champ]: valeur };
    majConfig({ items: nouvelles });
  }
  function ajouterItem() {
    majConfig({ items: [...items, { emoji: "🛍️", nom: "", lien: "", image_url: "" }] });
  }
  function supprimerItem(i) {
    majConfig({ items: items.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input value={item.emoji} onChange={(e) => majItem(i, "emoji", e.target.value)} placeholder="🛍️" style={{ ...inputStyle, width: 50, textAlign: "center", marginBottom: 0 }} />
          <input value={item.nom} onChange={(e) => majItem(i, "nom", e.target.value)} placeholder="Nom de la catégorie" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <input value={item.lien} onChange={(e) => majItem(i, "lien", e.target.value)} placeholder="Nom d'une collection" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <button onClick={() => supprimerItem(i)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
      ))}
      <button onClick={ajouterItem} style={boutonAjouterStyle}>+ Ajouter une catégorie</button>
    </div>
  );
}

function FormFlashSale({ config, majConfig }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={labelStyle}>Description</label>
      <input value={config.description || ""} onChange={(e) => majConfig({ description: e.target.value })} placeholder="Ex: Offre valable sur une sélection, stock limité" style={inputStyle} />
      <label style={labelStyle}>Date et heure de fin</label>
      <input
        type="datetime-local"
        value={config.date_fin ? config.date_fin.slice(0, 16) : ""}
        onChange={(e) => majConfig({ date_fin: e.target.value ? new Date(e.target.value).toISOString() : "" })}
        style={inputStyle}
      />
      <label style={labelStyle}>Nom exact de la collection à mettre en avant</label>
      <input value={config.lien_collection || ""} onChange={(e) => majConfig({ lien_collection: e.target.value })} placeholder="Doit correspondre au nom d'une collection" style={inputStyle} />
    </div>
  );
}

function FormAvis({ config, majConfig }) {
  const avis = config.avis || [];
  function majAvis(i, champ, valeur) {
    const nouvelles = [...avis];
    nouvelles[i] = { ...nouvelles[i], [champ]: valeur };
    majConfig({ avis: nouvelles });
  }
  function ajouterAvis() {
    majConfig({ avis: [...avis, { nom: "", ville: "", note: 5, commentaire: "" }] });
  }
  function supprimerAvis(i) {
    majConfig({ avis: avis.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {avis.map((a, i) => (
        <div key={i} style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7168" }}>Avis {i + 1}</span>
            <button onClick={() => supprimerAvis(i)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 12 }}>Supprimer</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={a.nom} onChange={(e) => majAvis(i, "nom", e.target.value)} placeholder="Nom du client" style={{ ...inputStyle, flex: 1 }} />
            <input value={a.ville} onChange={(e) => majAvis(i, "ville", e.target.value)} placeholder="Ville" style={{ ...inputStyle, flex: 1 }} />
            <select value={a.note} onChange={(e) => majAvis(i, "note", Number(e.target.value))} style={{ ...inputStyle, width: 70 }}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </div>
          <textarea value={a.commentaire} onChange={(e) => majAvis(i, "commentaire", e.target.value)} placeholder="Commentaire" rows={2} style={{ ...inputStyle, fontFamily: "inherit" }} />
        </div>
      ))}
      <button onClick={ajouterAvis} style={boutonAjouterStyle}>+ Ajouter un avis</button>
    </div>
  );
}

function FormMarques({ config, majConfig }) {
  const logos = config.logos || [];
  function majLogo(i, champ, valeur) {
    const nouvelles = [...logos];
    nouvelles[i] = { ...nouvelles[i], [champ]: valeur };
    majConfig({ logos: nouvelles });
  }
  function ajouterLogo() {
    majConfig({ logos: [...logos, { nom: "", image_url: "", lien: "" }] });
  }
  function supprimerLogo(i) {
    majConfig({ logos: logos.filter((_, idx) => idx !== i) });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {logos.map((logo, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input value={logo.nom} onChange={(e) => majLogo(i, "nom", e.target.value)} placeholder="Nom de la marque" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <input value={logo.image_url} onChange={(e) => majLogo(i, "image_url", e.target.value)} placeholder="URL du logo" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <button onClick={() => supprimerLogo(i)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
      ))}
      <button onClick={ajouterLogo} style={boutonAjouterStyle}>+ Ajouter une marque</button>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 600, color: "#6B7168", marginBottom: 5, marginTop: 4 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" };
const boutonAjouterStyle = { background: "none", border: "1px dashed #DDD8CC", borderRadius: 8, padding: "9px 0", width: "100%", fontSize: 12.5, fontWeight: 600, color: "#1a7a3c", cursor: "pointer" };
