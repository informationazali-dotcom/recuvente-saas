// ============================================================================
// PRODUCT PAGE BUILDER — éditeur visuel (espace marchand)
// ----------------------------------------------------------------------------
// Ouvert depuis la fiche d'un produit (Catalogue → produit → « Page produit »).
//   • STRUCTURE : liste des blocs (glisser-déposer, ↑↓, masquer, dupliquer, supprimer) ;
//   • APERÇU    : rendu réel de la page (même composant que la boutique publique),
//                 en Desktop ou Mobile ;
//   • PROPRIÉTÉS: champs du bloc sélectionné, réglages de la page, performance ;
//   • IA        : « Créer ma page avec l'IA » (structure uniquement, rien d'inventé).
//
// Sauvegarde : table `pages_produit` (brouillon / publié). Tant qu'aucune page n'est publiée,
// la fiche produit historique de la boutique reste utilisée, exactement comme avant.
// Ce fichier est chargé À LA DEMANDE (React.lazy) : il n'alourdit ni la boutique ni le tableau
// de bord tant que l'éditeur n'est pas ouvert.
// ============================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import { PageProduitPublique } from "./PageProduitRenderer.jsx";
import {
  REGISTRE_BLOCS, CATEGORIES_BLOCS, TEMPLATES, IDS_TEMPLATES, creerConfig, creerBloc, dupliquerBloc, deplacerElement,
  appliquerTemplate, normaliserConfig, proposerStructure, appliquerProposition, CATEGORIES_PRODUIT, OBJECTIFS_PAGE,
  MODES_VENTE, calculerOffresAffichees, idAleatoire, libelleDevise, formaterMontant, packsRapides, offreParDefaut,
  extrairePointsDescription, textePlat, CTA_TEXTE_DEFAUT,
} from "./blocs.js";

const VERT = "#1a7a3c";
const BORD = "#ECE8DC";
const INK = "#16231F";
const MUTED = "#6B7168";

// ---------------------------------------------------------------------------
// Petits utilitaires
// ---------------------------------------------------------------------------

// IDENTIQUE à slugifierProduit() dans CataloguePublic.jsx (à garder synchronisé) : sert au
// lien court « façon Shopify » construit ci-dessous (lienPublic).
function slugifierProduitPage(nom) {
  return String(nom || "produit")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Meme regle de validite que dans CataloguePublic.jsx (SLUG_PRODUIT_VALIDE) : un nom de produit
// trop court une fois slugifie ne peut pas servir de segment d'URL court, sinon le lien public
// de la page serait invalide et retomberait sur le tableau de bord admin au clic.
const SLUG_PRODUIT_PAGE_VALIDE = /^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/;

function useLargeur() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function lireImage(file) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = reject;
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => resolve(img);
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(file);
  });
}

// Réduit l'image (largeur max 1280 px, JPEG 82 %) avant l'envoi : pages publiques plus rapides.
async function reduireImage(file, largeurMax = 1280, qualite = 0.82) {
  try {
    const img = await lireImage(file);
    let { width, height } = img;
    if (width > largeurMax) { height = Math.round((height * largeurMax) / width); width = largeurMax; }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualite));
    return blob && blob.size < file.size ? blob : file;
  } catch (_) {
    return file;
  }
}

function pct(a, b) {
  return b > 0 ? `${Math.round((a / b) * 100)} %` : "—";
}

const btn = (extra = {}) => ({ border: `1px solid ${BORD}`, background: "#fff", color: INK, borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", ...extra });
const btnPlein = (extra = {}) => btn({ background: VERT, borderColor: VERT, color: "#fff", ...extra });
const champ = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box", background: "#fff", color: INK, fontFamily: "inherit" };

// ---------------------------------------------------------------------------
// Champs du panneau de propriétés
// ---------------------------------------------------------------------------

function Etiquette({ label, aide, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>{label}</div>}
      {children}
      {aide && <div style={{ fontSize: 11, color: "#8A9089", marginTop: 4, lineHeight: 1.4 }}>{aide}</div>}
    </div>
  );
}

function ChampImage({ valeur, onChange, televerser }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const ref = useRef(null);
  async function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErreur("");
    setEnvoi(true);
    try { onChange(await televerser(f)); } catch (err) { setErreur(err?.message || "Envoi impossible."); }
    setEnvoi(false);
  }
  return (
    <div>
      {valeur ? <img src={valeur} alt="" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, border: `1px solid ${BORD}`, marginBottom: 6, display: "block" }} /> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...champ, flex: 1, minWidth: 0 }} placeholder="https://… ou envoyer une image" value={valeur || ""} onChange={(e) => onChange(e.target.value)} />
        <button type="button" style={btn({ flex: "0 0 auto", padding: "8px 10px" })} onClick={() => ref.current?.click()} disabled={envoi}>{envoi ? "…" : "📤"}</button>
        {valeur ? <button type="button" style={btn({ flex: "0 0 auto", padding: "8px 10px", color: "#B33A2A" })} onClick={() => onChange("")} aria-label="Retirer l'image">✕</button> : null}
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={choisir} />
      {erreur && <div style={{ fontSize: 11.5, color: "#B33A2A", marginTop: 4 }}>{erreur}</div>}
    </div>
  );
}

function ChampVideo({ valeur, onChange, televerser }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const ref = useRef(null);
  const envoyerFichier = televerser && televerser.video;
  const estFichierEnvoye = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(valeur || ""));
  async function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !envoyerFichier) return;
    setErreur("");
    setEnvoi(true);
    try { onChange(await envoyerFichier(f)); } catch (err) { setErreur(err?.message || "Envoi impossible."); }
    setEnvoi(false);
  }
  return (
    <div>
      {estFichierEnvoye ? <video src={valeur} controls preload="metadata" playsInline style={{ width: "100%", maxHeight: 170, background: "#000", borderRadius: 8, border: `1px solid ${BORD}`, marginBottom: 6, display: "block" }} /> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...champ, flex: 1, minWidth: 0 }} placeholder="Lien YouTube / Vimeo / .mp4" value={valeur || ""} onChange={(e) => onChange(e.target.value)} disabled={envoi} />
        {valeur ? <button type="button" style={btn({ flex: "0 0 auto", padding: "8px 10px", color: "#B33A2A" })} onClick={() => onChange("")} aria-label="Retirer la vidéo" disabled={envoi}>✕</button> : null}
      </div>
      {envoyerFichier && (
        <button type="button" style={btn({ width: "100%", marginTop: 6, borderStyle: "dashed" })} onClick={() => ref.current?.click()} disabled={envoi}>
          {envoi ? "⏳ Envoi de la vidéo en cours… ne fermez pas la page" : "📤 Envoyer une vidéo depuis mon ordinateur"}
        </button>
      )}
      <input ref={ref} type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogg" style={{ display: "none" }} onChange={choisir} />
      {erreur && <div role="alert" style={{ fontSize: 11.5, color: "#B33A2A", marginTop: 4 }}>{erreur}</div>}
    </div>
  );
}

function ChampListe({ def, valeur, onChange, televerser, produits }) {
  const liste = Array.isArray(valeur) ? valeur : [];
  const max = def.max || 20;
  const [ouvert, setOuvert] = useState(0);
  const maj = (i, cle, v) => onChange(liste.map((x, k) => (k === i ? { ...x, [cle]: v } : x)));
  return (
    <div>
      {liste.map((item, i) => (
        <div key={i} style={{ border: `1px solid ${BORD}`, borderRadius: 10, marginBottom: 8, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
            <button type="button" onClick={() => setOuvert(ouvert === i ? -1 : i)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ouvert === i ? "▾" : "▸"} {def.sous.map((s) => item[s.cle]).find((v) => typeof v === "string" && v.trim()) || `Élément ${i + 1}`}
            </button>
            <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => onChange(deplacerElement(liste, i, i - 1))} style={btn({ padding: "3px 7px", opacity: i === 0 ? 0.35 : 1 })}>↑</button>
            <button type="button" aria-label="Descendre" disabled={i === liste.length - 1} onClick={() => onChange(deplacerElement(liste, i, i + 1))} style={btn({ padding: "3px 7px", opacity: i === liste.length - 1 ? 0.35 : 1 })}>↓</button>
            <button type="button" aria-label="Supprimer" onClick={() => onChange(liste.filter((_, k) => k !== i))} style={btn({ padding: "3px 7px", color: "#B33A2A" })}>✕</button>
          </div>
          {ouvert === i && (
            <div style={{ padding: "2px 10px 4px" }}>
              {def.sous.map((s) => (
                <Champ key={s.cle} def={s} valeur={item[s.cle]} onChange={(v) => maj(i, s.cle, v)} televerser={televerser} produits={produits} />
              ))}
            </div>
          )}
        </div>
      ))}
      {liste.length < max && (
        <button type="button" style={btn({ width: "100%", borderStyle: "dashed" })} onClick={() => { onChange([...liste, def.nouvelElement()]); setOuvert(liste.length); }}>+ Ajouter</button>
      )}
    </div>
  );
}

function Champ({ def, valeur, onChange, televerser, produits, produitCourantId, valeurs }) {
  if (def.visibleSi && valeurs) {
    const ok = Object.entries(def.visibleSi).every(([k, v]) => valeurs[k] === v);
    if (!ok) return null;
  }
  const corps = (() => {
    switch (def.type) {
      case "texte": return <input style={champ} value={valeur ?? ""} placeholder={def.placeholder || ""} onChange={(e) => onChange(e.target.value)} />;
      case "zone": return <textarea style={{ ...champ, minHeight: 74, resize: "vertical" }} value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />;
      case "nombre": return <input style={champ} type="number" min="0" value={valeur ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
      case "datetime": return <input style={champ} type="datetime-local" value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />;
      case "heure": return <input style={champ} type="time" value={valeur ?? ""} onChange={(e) => onChange(e.target.value)} />;
      case "oui_non":
        return (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", minHeight: 30 }}>
            <input type="checkbox" checked={!!valeur} onChange={(e) => onChange(e.target.checked)} style={{ width: 17, height: 17 }} />
            <span>{valeur ? "Oui" : "Non"}</span>
          </label>
        );
      case "choix":
        return (
          <select style={champ} value={valeur ?? ""} onChange={(e) => onChange(e.target.value)}>
            {def.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        );
      case "video": return <ChampVideo valeur={valeur} onChange={onChange} televerser={televerser} />;
      case "image": return <ChampImage valeur={valeur} onChange={onChange} televerser={televerser} />;
      case "produit":
        return (
          <select style={champ} value={valeur || ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Choisir un produit du catalogue —</option>
            {produits.filter((p) => p.id !== produitCourantId).map((p) => <option key={p.id} value={p.id}>{p.nom} — {Number(p.prix_vente || 0).toLocaleString("fr-FR")}</option>)}
          </select>
        );
      case "produits": {
        const sel = Array.isArray(valeur) ? valeur : [];
        return (
          <div style={{ maxHeight: 190, overflowY: "auto", border: `1px solid ${BORD}`, borderRadius: 8, padding: 6 }}>
            {produits.filter((p) => p.id !== produitCourantId).map((p) => (
              <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "5px 4px", cursor: "pointer" }}>
                <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
              </label>
            ))}
          </div>
        );
      }
      case "liste": return <ChampListe def={def} valeur={valeur} onChange={onChange} televerser={televerser} produits={produits} />;
      default: return null;
    }
  })();
  if (def.type === "oui_non") {
    return <Etiquette label={def.label} aide={def.aide}>{corps}</Etiquette>;
  }
  return <Etiquette label={def.label} aide={def.aide}>{corps}</Etiquette>;
}

// ---------------------------------------------------------------------------
// Éditeur d'offres & packs (bloc "Offres")
// ---------------------------------------------------------------------------

function EditeurOffres({ props, onChange, produit, devise, aOptions }) {
  const offres = Array.isArray(props.offres) ? props.offres : [];
  const bundlesProduit = Array.isArray(produit.bundles) ? produit.bundles : [];
  const prixBase = Number(produit.prix_vente) || 0;
  const { liste } = useMemo(() => calculerOffresAffichees({ ...produit, prix_vente: prixBase }, { props }), [produit, props, prixBase]);
  const majOffre = (i, cle, v) => onChange({ ...props, offres: offres.map((o, k) => (k === i ? { ...o, [cle]: v } : o)) });

  function ajouter() {
    const qty = Math.max(1, offres.length + 1);
    const nouvelle = { id: idAleatoire("o"), label: qty === 1 ? "1 produit" : `${qty} produits`, qty, prix_total: prixBase * qty, ancien_prix_total: "", reduction_pct: "", cadeau: "", badge: "", texte: "" };
    onChange({ ...props, offres: [...offres, nouvelle], offre_defaut_id: props.offre_defaut_id || nouvelle.id });
  }

  // Trois packs prêts en un clic (1 / 2 / 3 produits) : le commerçant ajuste ensuite remises,
  // badges et textes. Le pack « populaire » est présélectionné à l'ouverture de la page.
  function creerPacks() {
    const packs = packsRapides([0, 10, 15]);
    onChange({ ...props, offres: packs, offre_defaut_id: packs[1].id, affichage: props.affichage || "cartes" });
  }

  function importerBundles() {
    const base = { id: idAleatoire("o"), label: "1 produit", qty: 1, prix_total: prixBase, ancien_prix_total: "", reduction_pct: "", cadeau: "", badge: "", texte: "" };
    const importes = bundlesProduit.map((b) => {
      const { liste: l } = calculerOffresAffichees(produit, { props: { offres: [] } });
      const calc = l.find((x) => x.id === String(b.id));
      return { id: idAleatoire("o"), label: b.label || `${b.qty} produits`, qty: Number(b.qty) || 1, prix_total: calc ? calc.total : "", ancien_prix_total: "", reduction_pct: "", cadeau: "", badge: b.badge && !/^Prix normal$/i.test(b.badge) ? b.badge : "", texte: "" };
    });
    const toutes = [base, ...importes];
    onChange({ ...props, offres: toutes, offre_defaut_id: toutes[0].id });
  }

  return (
    <div>
      {aOptions && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", color: "#8A6412", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
          Ce produit a des variantes : les offres quantité ne sont pas proposées sur la page (règle existante de RecuVente, le prix dépend de la variante).
        </div>
      )}
      {offres.length === 0 && !aOptions && (
        <button type="button" onClick={creerPacks} style={{ width: "100%", background: "#1a7a3c", color: "#fff", border: "none", borderRadius: 10, padding: "12px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", marginBottom: 10, minHeight: 44 }}>
          ✨ Créer mes packs : 1 / 2 / 3 produits
        </button>
      )}
      {offres.length === 0 && (
        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
          {bundlesProduit.length > 0
            ? `Aucune offre saisie ici : les ${bundlesProduit.length} bundle(s) déjà configurés sur ce produit sont affichés (${liste.map((o) => o.label).join(", ")}).`
            : "Aucune offre : la page propose le produit à l'unité. Ajoutez vos packs (1 / 2 / 3 produits…)."}
        </div>
      )}
      {offres.map((o, i) => {
        const calc = liste.find((x) => x.id === String(o.id));
        return (
          <div key={o.id} style={{ border: `1px solid ${props.offre_defaut_id === o.id ? VERT : BORD}`, borderRadius: 10, padding: 10, marginBottom: 10, background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, flex: 1, cursor: "pointer" }}>
                <input type="radio" name="offre_defaut" checked={props.offre_defaut_id === o.id} onChange={() => onChange({ ...props, offre_defaut_id: o.id })} /> Sélectionnée par défaut
              </label>
              <button type="button" aria-label="Monter" disabled={i === 0} style={btn({ padding: "3px 7px", opacity: i === 0 ? 0.35 : 1 })} onClick={() => onChange({ ...props, offres: deplacerElement(offres, i, i - 1) })}>↑</button>
              <button type="button" aria-label="Descendre" disabled={i === offres.length - 1} style={btn({ padding: "3px 7px", opacity: i === offres.length - 1 ? 0.35 : 1 })} onClick={() => onChange({ ...props, offres: deplacerElement(offres, i, i + 1) })}>↓</button>
              <button type="button" aria-label="Supprimer" style={btn({ padding: "3px 7px", color: "#B33A2A" })} onClick={() => { const rest = offres.filter((_, k) => k !== i); onChange({ ...props, offres: rest, offre_defaut_id: props.offre_defaut_id === o.id ? (rest[0]?.id || "") : props.offre_defaut_id }); }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8 }}>
              <Etiquette label="Nom"><input style={champ} value={o.label || ""} onChange={(e) => majOffre(i, "label", e.target.value)} /></Etiquette>
              <Etiquette label="Quantité"><input style={champ} type="number" min="1" value={o.qty ?? ""} onChange={(e) => majOffre(i, "qty", e.target.value === "" ? "" : Math.max(1, Math.floor(Number(e.target.value))))} /></Etiquette>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Etiquette label={`Prix total (${devise})`}><input style={champ} type="number" min="0" value={o.prix_total ?? ""} onChange={(e) => majOffre(i, "prix_total", e.target.value === "" ? "" : Number(e.target.value))} /></Etiquette>
              <Etiquette label={`Ancien prix total (${devise})`}><input style={champ} type="number" min="0" placeholder="auto" value={o.ancien_prix_total ?? ""} onChange={(e) => majOffre(i, "ancien_prix_total", e.target.value === "" ? "" : Number(e.target.value))} /></Etiquette>
            </div>
            <Etiquette label="Réduction % (si prix total vide)"><input style={champ} type="number" min="0" max="90" value={o.reduction_pct ?? ""} onChange={(e) => majOffre(i, "reduction_pct", e.target.value === "" ? "" : Number(e.target.value))} /></Etiquette>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Etiquette label="Badge"><input style={champ} placeholder="Ex : Plus populaire" value={o.badge || ""} onChange={(e) => majOffre(i, "badge", e.target.value)} /></Etiquette>
              <Etiquette label="Cadeau"><input style={champ} placeholder="Ex : Pochette offerte" value={o.cadeau || ""} onChange={(e) => majOffre(i, "cadeau", e.target.value)} /></Etiquette>
            </div>
            <Etiquette label="Texte"><input style={champ} value={o.texte || ""} onChange={(e) => majOffre(i, "texte", e.target.value)} /></Etiquette>
            {calc && (
              <div style={{ fontSize: 11.5, color: MUTED, background: "#FAFAF7", borderRadius: 7, padding: "6px 8px" }}>
                Affiché : <b>{formaterMontant(calc.total, devise)}</b>{calc.ancienTotal ? <> au lieu de <s>{formaterMontant(calc.ancienTotal, devise)}</s> (économie réelle : {formaterMontant(calc.economie, devise)})</> : ""} · prix envoyé au formulaire : {formaterMontant(Math.round(calc.total / (o.qty || 1)), devise)} / unité
              </div>
            )}
            {o.cadeau && <div style={{ fontSize: 11, color: "#8A6412", marginTop: 6 }}>Le cadeau est affiché sur la page. Pensez à le mentionner à votre équipe : il n'est pas transmis automatiquement à la commande.</div>}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn({ flex: 1, borderStyle: "dashed" })} onClick={ajouter}>+ Ajouter une offre</button>
        {bundlesProduit.length > 0 && offres.length === 0 && <button type="button" style={btn({ flex: 1 })} onClick={importerBundles}>Importer les bundles du produit</button>}
        {offres.length > 0 && <button type="button" style={btn({ flex: 1, color: "#B33A2A" })} onClick={() => onChange({ ...props, offres: [], offre_defaut_id: "" })}>Utiliser les bundles du produit</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Éditeur des bénéfices (✓) affichés juste avant le bouton d'achat — bouton IA
// qui choisit 3 à 5 bénéfices courts à partir de la description déjà écrite par le
// marchand (jamais d'invention : voir gererGenererBeneficesIA côté serveur). Le
// marchand garde la main : il peut modifier, réordonner ou supprimer ensuite,
// exactement comme s'il les avait tapés lui-même.
// ---------------------------------------------------------------------------

function ChampBenefices({ def, valeur, onChange, televerser, produits, produitNom, produitDescription, workspaceId }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const liste = Array.isArray(valeur) ? valeur : [];

  async function genererIA() {
    setEnCours(true); setErreur("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reponse = await fetch("/api/admin-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "generer_benefices_ia", workspace_id: workspaceId, nom_produit: produitNom, description: produitDescription }),
      });
      const resultat = await reponse.json();
      if (!reponse.ok || !Array.isArray(resultat?.benefices) || resultat.benefices.length === 0) {
        setErreur(resultat?.error || "Erreur, réessaie.");
        return;
      }
      onChange(resultat.benefices.slice(0, def.max || 6).map((texte) => ({ texte })));
    } catch (e) {
      setErreur("Connexion impossible, réessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={genererIA} disabled={enCours} style={btn({ width: "100%", borderStyle: "dashed", opacity: enCours ? 0.6 : 1, marginBottom: 8 })}>
        {enCours ? "✨ L'IA choisit les bénéfices…" : liste.length > 0 ? "✨ Régénérer avec l'IA" : "✨ Générer avec l'IA (à partir de la description)"}
      </button>
      {erreur && <div style={{ fontSize: 11.5, color: "#B33A2A", marginBottom: 8, lineHeight: 1.4 }}>{erreur}</div>}
      <ChampListe def={def} valeur={valeur} onChange={onChange} televerser={televerser} produits={produits} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau : propriétés du bloc sélectionné
// ---------------------------------------------------------------------------

function PanneauBloc({ bloc, onProps, onMontrer, onVisible, onDupliquer, onSupprimer, televerser, produits, produitPublic, produitId, devise, workspaceId }) {
  if (!bloc) return <div style={{ padding: 18, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>Sélectionnez un bloc dans la structure ou cliquez dessus dans l'aperçu pour modifier ses propriétés.</div>;
  const def = REGISTRE_BLOCS[bloc.type];
  const setProp = (cle, v) => onProps({ ...bloc.props, [cle]: v });
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{def.icone}</span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{def.label}</div></div>
      </div>
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginBottom: 12 }}>{def.description}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" style={btn()} onClick={onVisible}>{bloc.visible === false ? "👁️ Afficher" : "🙈 Masquer"}</button>
        {!def.unique && <button type="button" style={btn()} onClick={onDupliquer}>⧉ Dupliquer</button>}
        <button type="button" style={btn({ color: "#B33A2A" })} onClick={onSupprimer}>🗑️ Supprimer</button>
      </div>
      <div style={{ background: "#FAFAF7", border: `1px solid ${BORD}`, borderRadius: 9, padding: "8px 10px", marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>Afficher sur</div>
        <div style={{ display: "flex", gap: 14 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={bloc.montrer?.desktop !== false} onChange={(e) => onMontrer({ ...bloc.montrer, desktop: e.target.checked })} /> 🖥️ Desktop</label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={bloc.montrer?.mobile !== false} onChange={(e) => onMontrer({ ...bloc.montrer, mobile: e.target.checked })} /> 📱 Mobile</label>
        </div>
      </div>
      {def.champs.map((c) => (
        c.type === "offres"
          ? <Etiquette key={c.cle} label={c.label}><EditeurOffres props={bloc.props} onChange={onProps} produit={produitPublic} devise={devise} aOptions={Array.isArray(produitPublic.options) && produitPublic.options.length > 0} /></Etiquette>
          : c.cle === "benefices"
          ? <Etiquette key={c.cle} label={c.label} aide={c.aide}><ChampBenefices def={c} valeur={bloc.props[c.cle]} onChange={(v) => setProp(c.cle, v)} televerser={televerser} produits={produits} produitNom={produitPublic.produit_nom} produitDescription={produitPublic.produit_description} workspaceId={workspaceId} /></Etiquette>
          : <Champ key={c.cle} def={c} valeur={bloc.props[c.cle]} valeurs={bloc.props} onChange={(v) => setProp(c.cle, v)} televerser={televerser} produits={produits} produitCourantId={produitId} />
      ))}
      {(bloc.type === "upsell" || bloc.type === "bundles") && (
        <div style={{ fontSize: 11.5, color: "#8A6412", background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
          Le tunnel de commande RecuVente accepte <b>un seul</b> produit complémentaire par commande : si « Upsell » et « Offre groupée » sont tous deux configurés, le premier de la liste est utilisé.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau : réglages de la page
// ---------------------------------------------------------------------------

function PanneauPage({ config, onChange, couleurBoutique }) {
  const th = config.theme;
  const setTheme = (k, v) => onChange({ ...config, theme: { ...th, [k]: v } });
  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Réglages de la page</div>
      <Etiquette label="Couleur principale" aide="Vide = couleur de la boutique.">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(th.couleur || "") ? th.couleur : (couleurBoutique || VERT)} onChange={(e) => setTheme("couleur", e.target.value)} style={{ width: 44, height: 36, border: `1px solid ${BORD}`, borderRadius: 8, padding: 2, background: "#fff" }} />
          <span style={{ fontSize: 12.5, color: MUTED, flex: 1 }}>{th.couleur || `Boutique (${couleurBoutique || VERT})`}</span>
          {th.couleur && <button type="button" style={btn({ padding: "5px 9px" })} onClick={() => setTheme("couleur", "")}>Réinitialiser</button>}
        </div>
      </Etiquette>
      <Etiquette label="Fond"><select style={champ} value={th.fond} onChange={(e) => setTheme("fond", e.target.value)}><option value="blanc">Blanc</option><option value="creme">Crème</option></select></Etiquette>
      <Etiquette label="Police des titres"><select style={champ} value={th.police_titres} onChange={(e) => setTheme("police_titres", e.target.value)}><option value="sans">Moderne (sans empattement)</option><option value="serif">Élégante (serif)</option></select></Etiquette>
      <Etiquette label="Arrondi"><select style={champ} value={th.rayon} onChange={(e) => setTheme("rayon", e.target.value)}><option value="net">Net</option><option value="doux">Doux</option><option value="rond">Très arrondi</option></select></Etiquette>
      <Etiquette label="Espacement"><select style={champ} value={th.espacement} onChange={(e) => setTheme("espacement", e.target.value)}><option value="compact">Compact</option><option value="normal">Normal</option><option value="aere">Aéré</option></select></Etiquette>

      <div style={{ height: 1, background: BORD, margin: "16px 0" }} />
      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Bouton de commande (CTA)</div>
      <Etiquette label="Texte du bouton"><input style={champ} value={config.cta.texte} placeholder={CTA_TEXTE_DEFAUT} onChange={(e) => onChange({ ...config, cta: { ...config.cta, texte: e.target.value } })} /></Etiquette>
      <Etiquette label="Couleur du bouton" aide="Vide = couleur principale de la page. Le texte du bouton passe automatiquement en blanc ou en noir selon la couleur choisie.">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(config.cta.couleur || "") ? config.cta.couleur : (/^#[0-9a-f]{6}$/i.test(th.couleur || "") ? th.couleur : (couleurBoutique || VERT))} onChange={(e) => onChange({ ...config, cta: { ...config.cta, couleur: e.target.value } })} style={{ width: 44, height: 36, border: `1px solid ${BORD}`, borderRadius: 8, padding: 2, background: "#fff" }} />
          {config.cta.couleur ? <button type="button" onClick={() => onChange({ ...config, cta: { ...config.cta, couleur: "" } })} style={btn({ padding: "7px 10px", fontSize: 12 })}>Revenir à la couleur de la page</button> : <span style={{ fontSize: 12, color: MUTED }}>Couleur de la page</span>}
        </div>
      </Etiquette>
      <Etiquette label="Quand on clique sur COMMANDER" aide="Recommandé : la page de commande RecuVente s'ouvre (nom, téléphone, ville, quantité, code promo, confirmation), puis la page de remerciement avec le reçu. « Formulaire intégré » ne sert que si vous ajoutez le bloc Formulaire COD.">
        <select style={champ} value={config.cta.action === "auto" ? "auto" : "popup"} onChange={(e) => onChange({ ...config, cta: { ...config.cta, action: e.target.value } })}>
          <option value="popup">Ouvrir la page de commande (recommandé)</option>
          <option value="auto">Défiler vers le formulaire intégré (bloc Formulaire COD)</option>
        </select>
      </Etiquette>
      <Etiquette label="Bouton collant en bas de l'écran">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 6, cursor: "pointer" }}><input type="checkbox" checked={config.sticky.mobile !== false} onChange={(e) => onChange({ ...config, sticky: { ...config.sticky, mobile: e.target.checked } })} /> Sur mobile</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!config.sticky.desktop} onChange={(e) => onChange({ ...config, sticky: { ...config.sticky, desktop: e.target.checked } })} /> Sur desktop</label>
      </Etiquette>

      <div style={{ height: 1, background: BORD, margin: "16px 0" }} />
      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Formulaire COD</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>Nom, téléphone et ville sont toujours demandés (règles COD existantes de RecuVente : validation du numéro, engagement, mode de livraison, dépôt…). Champs facultatifs :</div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 6, cursor: "pointer" }}><input type="checkbox" checked={!!config.formulaire.commune} onChange={(e) => onChange({ ...config, formulaire: { ...config.formulaire, commune: e.target.checked } })} /> Commune / quartier</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!config.formulaire.instructions} onChange={(e) => onChange({ ...config, formulaire: { ...config.formulaire, instructions: e.target.checked } })} /> Instructions de livraison</label>
      <div style={{ fontSize: 11, color: "#8A9089", marginTop: 6, lineHeight: 1.4 }}>Ces informations sont ajoutées à la zone de livraison de la commande (aucune colonne supplémentaire n'est nécessaire) : le closer et le livreur les voient.</div>

      <div style={{ height: 1, background: BORD, margin: "16px 0" }} />
      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Référencement</div>
      <Etiquette label="Description (données structurées Google)" aide="Vide = début de la description du produit. Les données Product / Offer / Review / FAQ ne sont générées qu'à partir d'informations réelles.">
        <textarea style={{ ...champ, minHeight: 64 }} value={config.seo.description || ""} onChange={(e) => onChange({ ...config, seo: { ...config.seo, description: e.target.value.slice(0, 300) } })} />
      </Etiquette>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau : performance (analytics)
// ---------------------------------------------------------------------------

const LIBELLES_EVENEMENTS = [
  ["vue_page", "Vues de la page"], ["clic_cta", "Clics sur le bouton"], ["formulaire_ouvert", "Formulaire vu"],
  ["formulaire_commence", "Formulaire commencé"], ["offre_selectionnee", "Offre sélectionnée"],
  ["upsell_accepte", "Complément accepté"], ["commande_creee", "Commandes créées"],
];

// ---------------------------------------------------------------------------
// Radar de fiabilité de commande — deuxième détection du Problem Engine (Blueprint,
// addendum après la partie 19). Lit les VRAIES commandes de CE produit (zone, statut,
// heure de création, motif de retour réellement saisi) et ne montre une recommandation
// que si un écart réel et mesurable apparaît. Silence total si le volume est trop faible
// pour être fiable — c'est le comportement correct, pas un manque. Rien n'est inventé :
// si les motifs de retour ne sont pas assez renseignés, le résumé le dit au lieu d'en
// fabriquer un. Purement client (RLS déjà en place sur commandes/commande_items) : aucune
// nouvelle route API, aucune nouvelle fonction serverless, aucun appel IA.
// ---------------------------------------------------------------------------

const SEUIL_RADAR_ORDRES = 12; // en dessous, aucune zone/heure n'est comparée (pas assez de recul)
const SEUIL_RADAR_ECART_PTS = 15; // écart minimum (points de %) avec la moyenne du produit pour signaler

function tauxEchecRadar(cmds) {
  const resolues = cmds.filter((c) => c.statut === "confirmee" || c.statut === "echouee" || c.statut === "retournee");
  if (resolues.length === 0) return null;
  const echecs = resolues.filter((c) => c.statut === "echouee" || c.statut === "retournee").length;
  return { total: resolues.length, echecs, taux: echecs / resolues.length };
}

function trancheHeureRadar(iso) {
  const h = new Date(iso).getHours();
  if (h >= 19 || h < 6) return "soir/nuit (19h–6h)";
  if (h >= 12) return "après-midi (12h–19h)";
  return "matin (6h–12h)";
}

function RadarFiabilite({ workspaceId, produitId }) {
  const [etat, setEtat] = useState({ chargement: true, erreur: "", cmds: null });
  useEffect(() => {
    let annule = false;
    setEtat({ chargement: true, erreur: "", cmds: null });
    (async () => {
      try {
        const { data: items, error: e1 } = await supabase
          .from("commande_items")
          .select("commande_id")
          .eq("workspace_id", workspaceId)
          .eq("produit_id", produitId)
          .limit(2000);
        if (e1) throw e1;
        const ids = [...new Set((items || []).map((i) => i.commande_id))].slice(0, 1000);
        if (ids.length === 0) { if (!annule) setEtat({ chargement: false, erreur: "", cmds: [] }); return; }
        const { data: cmds, error: e2 } = await supabase
          .from("commandes")
          .select("id, zone, statut, created_at, motif_retour")
          .in("id", ids);
        if (e2) throw e2;
        if (!annule) setEtat({ chargement: false, erreur: "", cmds: cmds || [] });
      } catch (e) {
        if (!annule) setEtat({ chargement: false, erreur: e.message || "Erreur de lecture", cmds: null });
      }
    })();
    return () => { annule = true; };
  }, [workspaceId, produitId]);

  const analyse = useMemo(() => {
    const cmds = etat.cmds;
    if (!cmds) return null;
    const global = tauxEchecRadar(cmds);
    if (!global || global.total < SEUIL_RADAR_ORDRES) return { insuffisant: true, total: global?.total || 0 };

    const parZone = {};
    cmds.forEach((c) => { const z = (c.zone || "").trim() || "(zone non renseignée)"; (parZone[z] ||= []).push(c); });
    let meilleurSignalZone = null;
    Object.entries(parZone).forEach(([zone, liste]) => {
      const t = tauxEchecRadar(liste);
      if (!t || t.total < SEUIL_RADAR_ORDRES) return;
      const ecartPts = (t.taux - global.taux) * 100;
      if (ecartPts >= SEUIL_RADAR_ECART_PTS && (!meilleurSignalZone || ecartPts > meilleurSignalZone.ecartPts)) {
        meilleurSignalZone = { zone, ...t, ecartPts };
      }
    });

    const parHeure = {};
    cmds.forEach((c) => { const h = trancheHeureRadar(c.created_at); (parHeure[h] ||= []).push(c); });
    let meilleurSignalHeure = null;
    Object.entries(parHeure).forEach(([tranche, liste]) => {
      const t = tauxEchecRadar(liste);
      if (!t || t.total < SEUIL_RADAR_ORDRES) return;
      const ecartPts = (t.taux - global.taux) * 100;
      if (ecartPts >= SEUIL_RADAR_ECART_PTS && (!meilleurSignalHeure || ecartPts > meilleurSignalHeure.ecartPts)) {
        meilleurSignalHeure = { tranche, ...t, ecartPts };
      }
    });

    const echecs = cmds.filter((c) => c.statut === "echouee" || c.statut === "retournee");
    const motifsRenseignes = echecs.filter((c) => (c.motif_retour || "").trim().length > 2);
    const motifsComptes = {};
    motifsRenseignes.forEach((c) => { const m = c.motif_retour.trim(); motifsComptes[m] = (motifsComptes[m] || 0) + 1; });
    const topMotifs = Object.entries(motifsComptes).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return { global, meilleurSignalZone, meilleurSignalHeure, echecsTotal: echecs.length, motifsRenseignes: motifsRenseignes.length, topMotifs };
  }, [etat.cmds]);

  if (etat.chargement || etat.erreur || !analyse) return null;

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${BORD}`, paddingTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🔎 Radar de fiabilité de commande</div>
      {analyse.insuffisant ? (
        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
          Pas encore assez de commandes pour ce produit ({analyse.total}/{SEUIL_RADAR_ORDRES} nécessaires) pour comparer les zones ou les horaires de façon fiable. C'est normal pour un produit récent ou peu vendu — rien à faire pour l'instant.
        </div>
      ) : (
        <>
          {!analyse.meilleurSignalZone && !analyse.meilleurSignalHeure && (
            <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
              Aucun écart marquant détecté entre zones ou horaires sur {analyse.global.total} commande{analyse.global.total > 1 ? "s" : ""} analysée{analyse.global.total > 1 ? "s" : ""} (taux d'échec/retour global : {Math.round(analyse.global.taux * 100)}%). C'est bon signe — pas de zone ni d'horaire visiblement problématique.
            </div>
          )}
          {analyse.meilleurSignalZone && (
            <div style={{ fontSize: 12.5, background: "#FBF3E3", border: "1px solid #E8D9B0", borderRadius: 9, padding: "9px 11px", marginBottom: 8, lineHeight: 1.5 }}>
              ⚠️ <b>{Math.round(analyse.meilleurSignalZone.taux * 100)}%</b> des commandes de ce produit sont échouées/retournées en zone <b>{analyse.meilleurSignalZone.zone}</b> ({analyse.meilleurSignalZone.echecs} sur {analyse.meilleurSignalZone.total}), contre {Math.round(analyse.global.taux * 100)}% en moyenne sur ce produit. Envisage une confirmation téléphonique obligatoire pour cette zone avant d'envoyer un livreur.
            </div>
          )}
          {analyse.meilleurSignalHeure && (
            <div style={{ fontSize: 12.5, background: "#FBF3E3", border: "1px solid #E8D9B0", borderRadius: 9, padding: "9px 11px", marginBottom: 8, lineHeight: 1.5 }}>
              ⚠️ <b>{Math.round(analyse.meilleurSignalHeure.taux * 100)}%</b> des commandes passées {analyse.meilleurSignalHeure.tranche} sont échouées/retournées ({analyse.meilleurSignalHeure.echecs} sur {analyse.meilleurSignalHeure.total}), contre {Math.round(analyse.global.taux * 100)}% en moyenne.
            </div>
          )}
          {analyse.motifsRenseignes >= 5 && analyse.motifsRenseignes / Math.max(1, analyse.echecsTotal) >= 0.4 ? (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Motifs de retour les plus fréquents réellement saisis ({analyse.motifsRenseignes} sur {analyse.echecsTotal} échec{analyse.echecsTotal > 1 ? "s" : ""}/retour{analyse.echecsTotal > 1 ? "s" : ""}) : {analyse.topMotifs.map(([m, n]) => `« ${m} » (${n})`).join(", ")}.
            </div>
          ) : analyse.echecsTotal > 0 ? (
            <div style={{ fontSize: 12, color: "#8A9089", marginTop: 6 }}>
              Motif de retour pas assez renseigné ({analyse.motifsRenseignes}/{analyse.echecsTotal}) pour un résumé fiable — pense à le noter au moment du retour, ça permettra un jour d'avoir ce résumé automatiquement.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PanneauPerformance({ workspaceId, produitId, devise }) {
  const [jours, setJours] = useState(30);
  const [etat, setEtat] = useState({ chargement: true, erreur: "", data: null });
  useEffect(() => {
    let annule = false;
    setEtat({ chargement: true, erreur: "", data: null });
    supabase.rpc("stats_page_produit", { p_workspace_id: workspaceId, p_produit_id: produitId, p_jours: jours }).then(({ data, error }) => {
      if (annule) return;
      if (error) setEtat({ chargement: false, erreur: /does not exist|could not find|42883|PGRST202/i.test(`${error.code} ${error.message}`) ? "La migration SQL n'est pas encore appliquée (fonction stats_page_produit absente)." : error.message, data: null });
      else setEtat({ chargement: false, erreur: "", data });
    });
    return () => { annule = true; };
  }, [workspaceId, produitId, jours]);
  const d = etat.data;
  const f = d?.funnel || {};
  const c = d?.commandes || {};
  const max = Math.max(1, ...LIBELLES_EVENEMENTS.map(([k]) => Number(f[k]) || 0));
  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Performance de la page</div>
        <select style={{ ...champ, width: "auto" }} value={jours} onChange={(e) => setJours(Number(e.target.value))}><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option></select>
      </div>
      {etat.chargement && <div style={{ fontSize: 13, color: MUTED }}>Chargement…</div>}
      {etat.erreur && <div style={{ fontSize: 12.5, color: "#B33A2A", background: "#FBEAE6", borderRadius: 8, padding: 10 }}>{etat.erreur}</div>}
      {d && (
        <>
          <div style={{ marginBottom: 14 }}>
            {LIBELLES_EVENEMENTS.map(([k, l]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{l}</span><b>{Number(f[k]) || 0}</b></div>
                <div style={{ height: 6, background: "#EEF0EA", borderRadius: 4 }}><div style={{ height: 6, borderRadius: 4, background: VERT, width: `${Math.round(((Number(f[k]) || 0) / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Taux de commande : <b>{pct(Number(f.commande_creee) || 0, Number(f.vue_page) || 0)}</b> des vues · clic → commande : <b>{pct(Number(f.commande_creee) || 0, Number(f.clic_cta) || 0)}</b></div>
          <div style={{ fontWeight: 800, fontSize: 13, margin: "14px 0 8px" }}>Ce que deviennent les commandes de cette page</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["Créées", c.creees], ["En cours", c.en_cours], ["Confirmées / livrées", c.confirmees], ["Échouées / refusées", c.echouees]].map(([l, v]) => (
              <div key={l} style={{ background: "#FAFAF7", border: `1px solid ${BORD}`, borderRadius: 9, padding: "8px 10px" }}><div style={{ fontSize: 11, color: MUTED }}>{l}</div><div style={{ fontWeight: 800, fontSize: 18 }}>{Number(v) || 0}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 10 }}>CA confirmé : <b>{formaterMontant(Number(c.ca_confirme) || 0, devise)}</b> · confirmation : <b>{pct(Number(c.confirmees) || 0, Number(c.creees) || 0)}</b></div>
          {Array.isArray(d.offres) && d.offres.length > 0 && (
            <>
              <div style={{ fontWeight: 800, fontSize: 13, margin: "14px 0 8px" }}>Par offre</div>
              {d.offres.map((o) => (
                <div key={o.offre_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, borderBottom: `1px solid ${BORD}`, padding: "6px 0" }}>
                  <span>{o.offre_id === "base" ? "1 unité" : o.offre_id}</span>
                  <span>{o.selections} sél. · {o.commandes} cmd · {o.confirmees} conf.</span>
                </div>
              ))}
            </>
          )}
          <div style={{ fontSize: 11, color: "#8A9089", marginTop: 14, lineHeight: 1.5 }}>« Confirmées » et « échouées » sont lues directement dans vos commandes (statut mis à jour par le closer / le livreur) : aucune donnée n'est estimée.</div>
        </>
      )}
      <RadarFiabilite workspaceId={workspaceId} produitId={produitId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modales : templates, ajout de bloc, IA
// ---------------------------------------------------------------------------

function Modale({ titre, onClose, children, large = false }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titre} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: large ? 760 : 560, maxHeight: "92vh", overflowY: "auto", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{titre}</div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8A9089" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Premier écran vu à la création d'une page produit : le choix entre générer automatiquement
// (l'IA propose une structure à partir de quelques infos ou de la description déjà écrite) et
// créer soi-même (choisir un template puis remplir chaque bloc à la main) doit être VU tout de
// suite -- pas juste un bouton perdu plus bas dans la liste des blocs.
function ModaleChoixDepart({ onGenererIA, onCreerMoiMeme, onClose }) {
  return (
    <Modale titre="Comment veux-tu créer cette page ?" onClose={onClose} large>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <button type="button" onClick={onGenererIA} style={{ textAlign: "left", border: `2px solid ${VERT}`, background: "#EAF3DE", borderRadius: 14, padding: 18, cursor: "pointer" }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>✨</div>
          <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 6 }}>Générer automatiquement avec l'IA</div>
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>Réponds à quelques questions (ou laisse l'IA se baser sur la description déjà écrite dans ta fiche produit) : elle propose la structure la plus efficace. Tu gardes la main pour tout modifier ensuite.</div>
        </button>
        <button type="button" onClick={onCreerMoiMeme} style={{ textAlign: "left", border: `1px solid ${BORD}`, background: "#fff", borderRadius: 14, padding: 18, cursor: "pointer" }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>✍️</div>
          <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 6 }}>Créer moi-même</div>
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>Choisis un template de départ, puis remplis chaque bloc à ton rythme.</div>
        </button>
      </div>
    </Modale>
  );
}

function ModaleTemplates({ actuel, onChoisir, onClose, premiereFois }) {
  return (
    <Modale titre={premiereFois ? "Choisissez un point de départ" : "Changer de template"} onClose={onClose} large>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>Tous les templates utilisent les mêmes blocs, juste dans un ordre différent. {premiereFois ? "Vous pourrez tout modifier ensuite." : "Les contenus déjà saisis dans vos blocs sont conservés."}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {IDS_TEMPLATES.map((id) => {
          const t = TEMPLATES[id];
          return (
            <button key={id} type="button" onClick={() => onChoisir(id)} style={{ textAlign: "left", border: `2px solid ${actuel === id ? VERT : BORD}`, background: actuel === id ? "#EAF3DE" : "#fff", borderRadius: 12, padding: 14, cursor: "pointer" }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{t.nom}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: VERT, margin: "2px 0 8px" }}>{t.pour}</div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}>{t.description}</div>
              <div style={{ fontSize: 11, color: "#8A9089", marginTop: 8 }}>{t.blocs.length} blocs</div>
            </button>
          );
        })}
      </div>
    </Modale>
  );
}

function ModaleAjoutBloc({ config, onAjouter, onClose }) {
  const presents = new Set(config.blocs.map((b) => b.type));
  return (
    <Modale titre="Ajouter un bloc" onClose={onClose} large>
      {CATEGORIES_BLOCS.map((cat) => {
        const types = Object.keys(REGISTRE_BLOCS).filter((t) => REGISTRE_BLOCS[t].categorie === cat.id);
        if (types.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{cat.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
              {types.map((t) => {
                const def = REGISTRE_BLOCS[t];
                const deja = def.unique && presents.has(t);
                return (
                  <button key={t} type="button" disabled={deja} onClick={() => onAjouter(t)} style={{ textAlign: "left", border: `1px solid ${BORD}`, background: deja ? "#F4F3EE" : "#fff", opacity: deja ? 0.55 : 1, borderRadius: 10, padding: "10px 12px", cursor: deja ? "default" : "pointer" }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{def.icone} {def.label}{deja ? " — déjà ajouté" : ""}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{def.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Modale>
  );
}

function ModaleIA({ produit, produits, nbAvis, onAppliquer, onClose, workspaceId, produitDescription }) {
  const [brief, setBrief] = useState({
    produit: produit.nom, prix: produit.prix_vente, categorie: "autre", cible: "", mode: "cod", objectif: "commandes_confirmees",
    aVideo: false, aUGC: false, aOffres: Array.isArray(produit.bundles) && produit.bundles.length > 0, aComplementaires: produits.length > 1,
  });
  const [proposition, setProposition] = useState(null);
  const [deductionEnCours, setDeductionEnCours] = useState(false);
  const [deductionErreur, setDeductionErreur] = useState("");
  const [deductionFaite, setDeductionFaite] = useState(false);
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  function proposer() {
    setProposition(proposerStructure({ ...brief, nbAvisReels: nbAvis, nbProduitsCatalogue: produits.length }));
  }
  async function deduireDepuisDescription() {
    setDeductionEnCours(true);
    setDeductionErreur("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reponse = await fetch("/api/admin-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "deduire_brief_page_ia", workspace_id: workspaceId, nom_produit: produit.nom, description: produitDescription }),
      });
      const resultat = await reponse.json();
      if (!reponse.ok) { setDeductionErreur(resultat?.error || "Erreur, réessaie."); return; }
      setBrief((b) => ({ ...b, categorie: resultat.categorie || b.categorie, cible: resultat.cible || b.cible, objectif: resultat.objectif || b.objectif }));
      setDeductionFaite(true);
    } catch (e) {
      setDeductionErreur("Connexion impossible, réessaie.");
    } finally {
      setDeductionEnCours(false);
    }
  }
  return (
    <Modale titre="✨ Créer ma page avec l'IA" onClose={onClose} large>
      {!proposition ? (
        <>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>Répondez en quelques champs : l'assistant propose la <b>structure</b> de la page (quels blocs, dans quel ordre). Il n'invente <b>jamais</b> d'avis, de témoignage, de résultat, de chiffre, de stock, de compte à rebours ni de prix.</div>
          <button type="button" onClick={deduireDepuisDescription} disabled={deductionEnCours} style={btn({ width: "100%", borderStyle: "dashed", opacity: deductionEnCours ? 0.6 : 1, marginBottom: 6 })}>
            {deductionEnCours ? "✨ Lecture de la description…" : deductionFaite ? "✨ Relire ma description" : "✨ Se baser sur la description déjà écrite dans ma fiche produit"}
          </button>
          {deductionErreur && <div style={{ fontSize: 11.5, color: "#B33A2A", marginBottom: 8, lineHeight: 1.4 }}>{deductionErreur}</div>}
          {deductionFaite && !deductionErreur && <div style={{ fontSize: 11.5, color: "#3B6D11", marginBottom: 8, lineHeight: 1.4 }}>✅ Catégorie, client visé et objectif préremplis à partir de ta description — vérifie et ajuste si besoin ci-dessous.</div>}
          <div style={{ fontSize: 11.5, color: MUTED, margin: "0 0 10px" }}>— ou remplis toi-même les champs ci-dessous —</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 14px" }}>
            <Etiquette label="Produit"><input style={champ} value={brief.produit} onChange={(e) => set("produit", e.target.value)} /></Etiquette>
            <Etiquette label="Prix" aide="Lu depuis votre catalogue."><input style={{ ...champ, background: "#F4F3EE" }} value={Number(brief.prix || 0).toLocaleString("fr-FR")} readOnly /></Etiquette>
            <Etiquette label="Catégorie"><select style={champ} value={brief.categorie} onChange={(e) => set("categorie", e.target.value)}>{CATEGORIES_PRODUIT.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Etiquette>
            <Etiquette label="Client cible"><input style={champ} placeholder="Ex : femmes 25-45 ans, Abidjan" value={brief.cible} onChange={(e) => set("cible", e.target.value)} /></Etiquette>
            <Etiquette label="Mode de vente"><select style={champ} value={brief.mode} onChange={(e) => set("mode", e.target.value)}>{MODES_VENTE.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Etiquette>
            <Etiquette label="Objectif"><select style={champ} value={brief.objectif} onChange={(e) => set("objectif", e.target.value)}>{OBJECTIFS_PAGE.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select></Etiquette>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, margin: "4px 0 8px" }}>Ce que vous avez déjà</div>
          {[["aVideo", "Une vidéo de démonstration"], ["aUGC", "Des photos / vidéos de vrais clients"], ["aOffres", "Des packs / offres quantité"], ["aComplementaires", "D'autres produits à proposer en complément"]].map(([k, l]) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginBottom: 6, cursor: "pointer" }}><input type="checkbox" checked={!!brief[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
          ))}
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Avis clients réels déjà approuvés : <b>{nbAvis}</b> (affichés automatiquement, jamais inventés).</div>
          <div style={{ marginTop: 16, textAlign: "right" }}><button type="button" style={btnPlein({ padding: "11px 20px", fontSize: 14 })} onClick={proposer}>Proposer une structure</button></div>
        </>
      ) : (
        <>
          <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#2E5F12", marginBottom: 12, fontWeight: 700 }}>{proposition.resume}</div>
          <div style={{ marginBottom: 12 }}>
            {proposition.blocs.map((b, i) => (
              <div key={b.type} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${BORD}` }}>
                <span style={{ color: VERT, fontWeight: 800 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{i + 1}. {REGISTRE_BLOCS[b.type].icone} {b.label}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{b.raison}</div>
                  {b.aFournir && <div style={{ fontSize: 11.5, color: "#8A6412", marginTop: 2 }}>À fournir : {b.aFournir}</div>}
                </div>
              </div>
            ))}
          </div>
          {proposition.avertissements.map((a, i) => (<div key={i} style={{ fontSize: 12, color: "#8A6412", background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 10px", marginBottom: 6, lineHeight: 1.45 }}>⚠️ {a}</div>))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" style={btn()} onClick={() => setProposition(null)}>← Modifier mes réponses</button>
            <button type="button" style={btnPlein({ padding: "11px 20px", fontSize: 14 })} onClick={() => onAppliquer(proposition, brief)}>APPLIQUER LA STRUCTURE</button>
          </div>
          <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 8, textAlign: "right" }}>Vos contenus déjà saisis sont conservés. Vous pourrez modifier chaque bloc ensuite.</div>
        </>
      )}
    </Modale>
  );
}

// ---------------------------------------------------------------------------
// Aperçu du formulaire COD (l'éditeur ne crée aucune commande)
// ---------------------------------------------------------------------------

function ApercuFormulaire({ produit, devise }) {
  const f = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box", background: "#FAFAF7" };
  return (
    <div>
      <input style={f} placeholder="Ton nom" disabled />
      <input style={f} placeholder="Ton numéro de téléphone" disabled />
      <input style={f} placeholder="Ta ville et ton quartier" disabled />
      <div style={{ fontSize: 12, color: "#8A9089", background: "#F4F3EE", borderRadius: 8, padding: "9px 12px", lineHeight: 1.5 }}>
        Aperçu : sur la page publique, ce bloc affiche le vrai formulaire de commande RecuVente (quantité, variantes, mode de livraison, code promo, engagement) et crée la commande dans votre workflow existant.
      </div>
      <button type="button" disabled style={{ width: "100%", marginTop: 12, background: VERT, color: "#fff", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, opacity: 0.85 }}>Confirmer — {formaterMontant(produit.prix_vente, devise)}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function PageProduitBuilder({ workspace, produit, produits = [], onClose }) {
  const largeur = useLargeur();
  // Page dédiée : on fige le défilement de la page derrière tant que l'éditeur est ouvert.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, []);
  const large = largeur >= 1100;
  const devise = libelleDevise(workspace?.currency || "XOF");
  const couleurBoutique = workspace?.couleur_marque || VERT;

  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");
  const [ligne, setLigne] = useState(null); // ligne pages_produit existante
  const [config, setConfig] = useState(() => creerConfig("cod_conversion"));
  const [enregistre, setEnregistre] = useState(null); // JSON du dernier état sauvegardé
  const [historique, setHistorique] = useState([]);
  const dernierChangement = useRef({ cle: null, t: 0 });
  const [selection, setSelection] = useState(null);
  const [onglet, setOnglet] = useState("bloc"); // bloc | page | perf
  const [mode, setMode] = useState(() => (typeof window !== "undefined" && window.innerWidth < 700 ? "mobile" : "desktop"));
  const [panneau, setPanneau] = useState("apercu"); // (petits écrans) structure | apercu | proprietes
  const [modale, setModale] = useState(null); // templates | ajout | ia | null
  const [premiereFois, setPremiereFois] = useState(false);
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [avis, setAvis] = useState([]);
  const [glisse, setGlisse] = useState(null);
  const [survol, setSurvol] = useState(null);

  // Aperçu : état local (l'éditeur ne commande rien)
  const [bundleChoisiId, setBundleChoisiId] = useState(null);
  const [quantite, setQuantite] = useState(1);
  const [optionsChoisies, setOptionsChoisies] = useState({});
  const [produitBumpId, setProduitBumpId] = useState(null);

  // Forme "boutique publique" du produit et du catalogue (mêmes noms de champs que catalogue_public)
  const produitPublic = useMemo(() => {
    const noteMoy = avis.length ? avis.reduce((s, a) => s + Number(a.note || 0), 0) / avis.length : 0;
    return {
      produit_id: produit.id, produit_nom: produit.nom, prix_vente: Number(produit.prix_vente) || 0,
      prix_barre: produit.prix_barre != null ? Number(produit.prix_barre) : null, photo_url: produit.photo_url,
      photos_galerie: produit.photos_galerie || [], produit_description: produit.description || "",
      note_moyenne: avis.length ? Math.round(noteMoy * 10) / 10 : 0, nb_avis: avis.length, nb_ventes: 0,
      avis_note_defaut: produit.avis_note_defaut != null ? Number(produit.avis_note_defaut) : null,
      avis_nombre_defaut: produit.avis_nombre_defaut != null ? Number(produit.avis_nombre_defaut) : null,
      stock_initial: produit.stock_initial, bundles: Array.isArray(produit.bundles) ? produit.bundles : [],
      options: Array.isArray(produit.options) ? produit.options : [], variantes: Array.isArray(produit.variantes) ? produit.variantes : [],
      livraison_gratuite: !!produit.livraison_gratuite, livraison_gratuite_qte_min: produit.livraison_gratuite_qte_min,
      frais_livraison_produit: produit.frais_livraison_produit, frais_expedition_produit: produit.frais_expedition_produit,
      produits_similaires_ids: produit.produits_similaires_ids || [], produits_similaires_collection_id: produit.produits_similaires_collection_id || null,
      masquer_produits_similaires: !!produit.masquer_produits_similaires,
    };
  }, [produit, avis]);

  // L'aperçu reflète l'offre présélectionnée à l'ouverture de la page publique (même règle).
  const offreDefautApercu = useMemo(() => { try { return offreParDefaut(produitPublic, config); } catch (_) { return null; } }, [produitPublic, config]);
  const offreDefautId = offreDefautApercu ? offreDefautApercu.id : null;
  useEffect(() => {
    setBundleChoisiId(offreDefautApercu ? offreDefautApercu.id : null);
    setQuantite(offreDefautApercu ? offreDefautApercu.qty : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offreDefautId]);
  const produitsPublics = useMemo(() => produits.map((p) => ({
    produit_id: p.id, produit_nom: p.nom, prix_vente: Number(p.prix_vente) || 0, prix_barre: p.prix_barre != null ? Number(p.prix_barre) : null,
    photo_url: p.photo_url, nb_ventes: 0,
  })), [produits]);
  const pointsForts = useMemo(() => extrairePointsDescription(produit.description), [produit.description]);

  // -- Chargement de la page existante + vrais avis
  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase.from("pages_produit").select("*").eq("workspace_id", workspace.id).eq("produit_id", produit.id).maybeSingle();
      if (annule) return;
      if (error) {
        const manque = /pages_produit|42P01|relation .* does not exist|schema cache/i.test(`${error.code} ${error.message}`);
        setErreurChargement(manque ? "La table « pages_produit » n'existe pas encore : appliquez d'abord la migration SQL du Product Page Builder (voir le fichier fourni). Vous pouvez explorer l'éditeur, mais l'enregistrement est désactivé." : error.message);
        setPremiereFois(true);
        setChargement(false);
        return;
      }
      if (data) {
        setLigne(data);
        const c = normaliserConfig(data.config_brouillon && Object.keys(data.config_brouillon).length ? data.config_brouillon : (data.config_publiee || {}));
        setConfig(c);
        setEnregistre(JSON.stringify(c));
        const h = c.blocs.find((b) => b.type === "hero") || c.blocs[0];
        setSelection(h ? h.id : null);
      } else {
        setPremiereFois(true);
        setModale("choix");
      }
      setChargement(false);
    })();
    supabase.rpc("avis_produit_public", { p_produit_id: produit.id }).then(({ data }) => {
      if (!annule) setAvis((data || []).filter((a) => (a.commentaire && String(a.commentaire).trim().length > 0) || a.photo_url || a.video_url));
    });
    return () => { annule = true; };
  }, [workspace.id, produit.id]);

  const modifie = enregistre !== JSON.stringify(config);
  const publie = ligne?.statut === "publie";
  const modifsNonPubliees = publie && JSON.stringify(normaliserConfig(ligne.config_publiee || {})) !== JSON.stringify(normaliserConfig(config));
  const blocSelectionne = config.blocs.find((b) => b.id === selection) || null;

  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(null), 4200);
    return () => clearTimeout(t);
  }, [message]);

  // Mise à jour avec historique (annuler). Les frappes successives dans un même champ sont regroupées.
  const modifier = useCallback((fn, cle = null) => {
    setConfig((prev) => {
      const suivant = fn(prev);
      if (suivant === prev) return prev;
      const maintenant = Date.now();
      const groupe = cle && dernierChangement.current.cle === cle && maintenant - dernierChangement.current.t < 900;
      dernierChangement.current = { cle, t: maintenant };
      if (!groupe) setHistorique((h) => [...h.slice(-39), prev]);
      return suivant;
    });
  }, []);

  function annuler() {
    setHistorique((h) => {
      if (h.length === 0) return h;
      const dernier = h[h.length - 1];
      setConfig(dernier);
      return h.slice(0, -1);
    });
  }

  const majBloc = (id, patch, cle) => modifier((c) => ({ ...c, blocs: c.blocs.map((b) => (b.id === id ? { ...b, ...patch } : b)) }), cle ? `${id}:${cle}` : null);

  function ajouterBloc(type) {
    const bloc = creerBloc(type);
    if (!bloc) return;
    modifier((c) => {
      const idxForm = c.blocs.findIndex((b) => b.type === "formulaire_cod");
      const blocs = c.blocs.slice();
      if (idxForm >= 0 && type !== "formulaire_cod") blocs.splice(idxForm, 0, bloc); else blocs.push(bloc);
      return { ...c, blocs };
    });
    setSelection(bloc.id);
    setOnglet("bloc");
    setModale(null);
    if (!large) setPanneau("proprietes");
  }

  function supprimerBloc(id) {
    const b = config.blocs.find((x) => x.id === id);
    if (!b) return;
    if (!window.confirm(`Supprimer le bloc « ${REGISTRE_BLOCS[b.type].label} » ? (vous pourrez annuler)`)) return;
    modifier((c) => ({ ...c, blocs: c.blocs.filter((x) => x.id !== id) }));
    if (selection === id) setSelection(null);
  }

  function dupliquer(id) {
    const b = config.blocs.find((x) => x.id === id);
    const copie = b && dupliquerBloc(b);
    if (!copie) return;
    modifier((c) => { const i = c.blocs.findIndex((x) => x.id === id); const blocs = c.blocs.slice(); blocs.splice(i + 1, 0, copie); return { ...c, blocs }; });
    setSelection(copie.id);
  }

  function deplacer(de, vers) {
    modifier((c) => ({ ...c, blocs: deplacerElement(c.blocs, de, vers) }));
  }

  function choisirTemplate(id) {
    modifier((c) => (premiereFois && !ligne ? appliquerTemplate(creerConfig(id), id) : appliquerTemplate(c, id)));
    setPremiereFois(false);
    setModale(null);
    setSelection(null);
    setMessage({ ok: true, texte: `Template « ${TEMPLATES[id].nom} » appliqué.` });
  }

  function appliquerIA(proposition, brief) {
    modifier((c) => ({ ...appliquerProposition(proposition, c, { bundles: produitPublic.bundles }), brief: { categorie: brief.categorie, cible: brief.cible, mode: brief.mode, objectif: brief.objectif } }));
    setPremiereFois(false);
    setModale(null);
    setSelection(null);
    setMessage({ ok: true, texte: "Structure appliquée. Complétez maintenant chaque bloc." });
  }

  async function televerserImage(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) throw new Error("Choisissez une image.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Image trop lourde (max 8 Mo).");
    const reduite = await reduireImage(file);
    const chemin = `${workspace.id}-page-${String(produit.id).slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
    const { error } = await supabase.storage.from("produits").upload(chemin, reduite, { upsert: true, contentType: "image/jpeg" });
    if (error) throw new Error(error.message);
    return supabase.storage.from("produits").getPublicUrl(chemin).data.publicUrl;
  }

  async function televerserVideo(file) {
    const ext = ((file?.name || "").split(".").pop() || "").toLowerCase();
    if (!file || !(String(file.type || "").startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogg"].includes(ext))) throw new Error("Choisissez un fichier vidéo (.mp4, .webm ou .mov).");
    if (file.size > 30 * 1024 * 1024) throw new Error("Vidéo trop lourde (max 30 Mo). Pour une vidéo plus longue, mettez-la sur YouTube et collez le lien.");
    const extSure = ["mp4", "webm", "mov", "m4v", "ogg"].includes(ext) ? ext : "mp4";
    const chemin = `${workspace.id}-page-${String(produit.id).slice(0, 8)}-video-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${extSure}`;
    const { error } = await supabase.storage.from("produits").upload(chemin, file, { upsert: true, contentType: file.type || (extSure === "mov" ? "video/quicktime" : `video/${extSure}`) });
    if (error) throw new Error("Envoi impossible : " + error.message);
    return supabase.storage.from("produits").getPublicUrl(chemin).data.publicUrl;
  }

  async function sauvegarder(publier) {
    setOccupe(true);
    const maintenant = new Date().toISOString();
    const ligneEcrire = {
      workspace_id: workspace.id, produit_id: produit.id, template: config.template,
      config_brouillon: config, statut: publier ? "publie" : (ligne?.statut || "brouillon"),
      ...(publier ? { config_publiee: config, publie_at: maintenant } : {}),
    };
    const { data, error } = await supabase.from("pages_produit").upsert(ligneEcrire, { onConflict: "workspace_id,produit_id" }).select().maybeSingle();
    setOccupe(false);
    if (error || !data) { setMessage({ ok: false, texte: `Enregistrement impossible : ${error?.message || "réponse vide"}` }); return; }
    setLigne(data);
    setEnregistre(JSON.stringify(config));
    setMessage({ ok: true, texte: publier ? "Page publiée : elle remplace la fiche produit sur votre boutique." : "Brouillon enregistré." });
  }

  async function depublier() {
    if (!ligne) return;
    if (!window.confirm("Dépublier ? La boutique reprendra la fiche produit habituelle (votre page reste en brouillon).")) return;
    setOccupe(true);
    const { data, error } = await supabase.from("pages_produit").update({ statut: "brouillon" }).eq("id", ligne.id).select().maybeSingle();
    setOccupe(false);
    if (error) { setMessage({ ok: false, texte: `Impossible de dépublier : ${error.message}` }); return; }
    setLigne(data || { ...ligne, statut: "brouillon" });
    setMessage({ ok: true, texte: "Page dépubliée : la fiche produit habituelle est de nouveau utilisée." });
  }

  function fermer() {
    if (modifie && !window.confirm("Des modifications ne sont pas enregistrées. Fermer quand même ?")) return;
    onClose();
  }

  const lienPublic = (() => {
    if (typeof window === "undefined") return "";
    // Lien court façon Shopify (/nom-boutique/nom-produit, ou /nom-produit sur un domaine
    // personnalisé) — voir CataloguePublic.jsx (lienProduitPropre) pour la même logique.
    const slugP = slugifierProduitPage(produit.nom);
    const slugOk = SLUG_PRODUIT_PAGE_VALIDE.test(slugP);
    if (slugOk && workspace?.domaine_personnalise) return `https://${workspace.domaine_personnalise}/${slugP}`;
    if (slugOk && workspace?.slug) return `${window.location.origin}/${workspace.slug}/${slugP}`;
    return `${window.location.origin}/?catalogue=${workspace.id}&produit=${slugP}-${String(produit.id).slice(0, 8)}`;
  })();

  // -- Aperçu : état et actions locaux
  const options = produitPublic.options;
  const toutesOptionsChoisies = options.length > 0 && options.every((o) => optionsChoisies[o.nom]);
  const varianteActive = toutesOptionsChoisies ? produitPublic.variantes.find((v) => options.every((o) => v.combinaison && v.combinaison[o.nom] === optionsChoisies[o.nom])) : null;
  const prixBase = varianteActive && varianteActive.prix != null ? Number(varianteActive.prix) : produitPublic.prix_vente;
  const apercuEtat = { quantite, bundleChoisiId, optionsChoisies, produitBumpId, varianteActive, varianteEnRupture: !!varianteActive && Number(varianteActive.stock ?? 0) <= 0, toutesOptionsChoisies, prixBase, prixUnitaireEffectif: prixBase };
  const apercuActions = {
    onChoisirOffre: (o) => { setBundleChoisiId(o ? o.id : null); setQuantite(o ? o.qty : 1); },
    onChoisirOption: (nom, val) => setOptionsChoisies((c) => ({ ...c, [nom]: val })),
    onToggleBump: (id) => setProduitBumpId((cur) => (cur === id ? null : id)),
    onOuvrirProduit: () => {},
  };
  const livraisonApercu = {
    gratuite: !!produit.livraison_gratuite, frais: Number(produit.frais_livraison_produit ?? workspace?.frais_livraison ?? 0) || 0,
    fraisExpedition: Number(produit.frais_expedition_produit ?? workspace?.frais_expedition ?? 0) || 0,
    aChoix: false, labelLocal: workspace?.label_livraison_locale || "Livraison locale", labelExpedition: workspace?.label_livraison_expedition || "Autre ville",
    qteMinGratuite: produit.livraison_gratuite_qte_min || null,
  };
  const entreprisePreview = { nom: workspace?.name, politiqueLivraison: workspace?.politique_livraison, whatsapp: workspace?.whatsapp_number, couleur: couleurBoutique };

  // -- Mise à l'échelle de l'aperçu
  const zoneRef = useRef(null);
  const [zone, setZone] = useState({ w: 700, h: 600 });
  useEffect(() => {
    if (!zoneRef.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setZone({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(zoneRef.current);
    return () => ro.disconnect();
  }, [chargement, panneau, large]);
  const largeurVirtuelle = mode === "mobile" ? 390 : 1200;
  const echelle = Math.min(1, Math.max(0.3, (zone.w - 24) / largeurVirtuelle));
  const hauteurApercu = Math.max(320, zone.h - 24);

  // -- Rendu -------------------------------------------------------------
  // Le choix « générer avec l'IA » vs « créer moi-même » doit être vu tout de suite, sans avoir à
  // descendre dans la liste des blocs (sinon un marchand qui ne fait pas défiler ne le voit jamais) :
  // ces deux boutons sont donc tout en haut du panneau, avant même le template.
  const listeStructure = (
    <div style={{ padding: 12 }}>
      <button type="button" onClick={() => setModale("ia")} style={btnPlein({ width: "100%", padding: "12px 12px", marginBottom: 8, fontSize: 13.5 })}>✨ Générer automatiquement ma page avec l'IA</button>
      <button type="button" onClick={() => { setPremiereFois(false); setModale("templates"); }} style={{ width: "100%", textAlign: "left", border: `1px solid ${BORD}`, background: "#fff", borderRadius: 10, padding: "9px 12px", marginBottom: 12, cursor: "pointer" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em" }}>Template</div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{TEMPLATES[config.template]?.nom || config.template} <span style={{ fontSize: 12, color: VERT, fontWeight: 700 }}>· changer</span></div>
      </button>
      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 2px 8px" }}>Structure</div>
      {config.blocs.map((b, i) => {
        const def = REGISTRE_BLOCS[b.type];
        const actif = selection === b.id;
        return (
          <div
            key={b.id}
            draggable
            onDragStart={(e) => { setGlisse(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch (_) {} }}
            onDragOver={(e) => { if (glisse != null) { e.preventDefault(); setSurvol(i); } }}
            onDrop={(e) => { e.preventDefault(); if (glisse != null && glisse !== i) deplacer(glisse, i); setGlisse(null); setSurvol(null); }}
            onDragEnd={() => { setGlisse(null); setSurvol(null); }}
            style={{ display: "flex", alignItems: "center", gap: 4, border: `1.5px solid ${actif ? VERT : (survol === i && glisse != null ? "#8FBF9F" : BORD)}`, background: actif ? "#EAF3DE" : "#fff", borderRadius: 10, padding: "6px 6px 6px 8px", marginBottom: 6, opacity: glisse === i ? 0.5 : (b.visible === false ? 0.55 : 1) }}
          >
            <span title="Glisser pour déplacer" aria-hidden="true" style={{ cursor: "grab", color: "#9AA097", fontSize: 16, padding: "0 2px", userSelect: "none" }}>☷</span>
            <button type="button" onClick={() => { setSelection(b.id); setOnglet("bloc"); if (!large) setPanneau("proprietes"); }} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: INK, padding: "6px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {def.icone} {def.label}{b.visible === false ? " (masqué)" : ""}
            </button>
            <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, i - 1)} style={btn({ padding: "3px 6px", opacity: i === 0 ? 0.3 : 1 })}>↑</button>
            <button type="button" aria-label="Descendre" disabled={i === config.blocs.length - 1} onClick={() => deplacer(i, i + 1)} style={btn({ padding: "3px 6px", opacity: i === config.blocs.length - 1 ? 0.3 : 1 })}>↓</button>
            <button type="button" aria-label={b.visible === false ? "Afficher" : "Masquer"} onClick={() => majBloc(b.id, { visible: b.visible === false })} style={btn({ padding: "3px 6px" })}>{b.visible === false ? "🙈" : "👁️"}</button>
          </div>
        );
      })}
      <button type="button" onClick={() => setModale("ajout")} style={btnPlein({ width: "100%", padding: "11px 12px", marginTop: 6 })}>+ AJOUTER UN BLOC</button>
      {/* Raccourci « packs / bundles » : plus besoin de chercher le bloc dans la liste. */}
      {(() => {
        const blocPacks = config.blocs.find((b) => b.type === "offres");
        return (
          <button
            type="button"
            onClick={() => { if (blocPacks) { setSelection(blocPacks.id); setOnglet("bloc"); if (!large) setPanneau("proprietes"); } else ajouterBloc("offres"); }}
            style={{ width: "100%", marginTop: 8, minHeight: 44, borderRadius: 10, border: "1.5px dashed #1a7a3c", background: "#F3FAF1", color: "#14532d", fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "10px 12px" }}
          >
            {blocPacks ? "🎁 Modifier mes packs / bundles" : "🎁 Ajouter mes packs / bundles (1 / 2 / 3 produits)"}
          </button>
        );
      })()}
    </div>
  );

  const panneauProprietes = (
    <div>
      <div style={{ display: "flex", borderBottom: `1px solid ${BORD}`, position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
        {[["bloc", "Bloc"], ["page", "Page"], ["perf", "Performance"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} style={{ flex: 1, padding: "12px 6px", background: "none", border: "none", borderBottom: `3px solid ${onglet === k ? VERT : "transparent"}`, fontWeight: 800, fontSize: 13, color: onglet === k ? VERT : MUTED, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      {onglet === "bloc" && (
        <PanneauBloc
          bloc={blocSelectionne}
          onProps={(props) => blocSelectionne && majBloc(blocSelectionne.id, { props }, "props")}
          onMontrer={(montrer) => blocSelectionne && majBloc(blocSelectionne.id, { montrer })}
          onVisible={() => blocSelectionne && majBloc(blocSelectionne.id, { visible: blocSelectionne.visible === false })}
          onDupliquer={() => blocSelectionne && dupliquer(blocSelectionne.id)}
          onSupprimer={() => blocSelectionne && supprimerBloc(blocSelectionne.id)}
          televerser={Object.assign(televerserImage, { video: televerserVideo })}
          produits={produits}
          produitPublic={produitPublic}
          produitId={produit.id}
          devise={devise}
          workspaceId={workspace.id}
        />
      )}
      {onglet === "page" && <PanneauPage config={config} onChange={(c) => modifier(() => c, "page")} couleurBoutique={couleurBoutique} />}
      {onglet === "perf" && <PanneauPerformance workspaceId={workspace.id} produitId={produit.id} devise={devise} />}
    </div>
  );

  const apercu = (
    <div ref={zoneRef} style={{ height: "100%", padding: 12, boxSizing: "border-box", overflow: "hidden", background: "#E9E7DF", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
      <div style={{ width: largeurVirtuelle * echelle, height: hauteurApercu, borderRadius: mode === "mobile" ? 26 : 10, overflow: "hidden", boxShadow: "0 8px 30px rgba(0,0,0,.18)", background: "#fff", border: mode === "mobile" ? "6px solid #16231F" : `1px solid ${BORD}`, boxSizing: "content-box" }}>
        <div style={{ width: largeurVirtuelle, height: hauteurApercu / echelle, overflowY: "auto", overflowX: "hidden", transform: `scale(${echelle})`, transformOrigin: "top left", background: "#fff" }}>
          <PageProduitPublique
            config={config}
            produit={produitPublic}
            produits={produitsPublics}
            entreprise={entreprisePreview}
            couleur={couleurBoutique}
            devise={devise}
            deviseCode={workspace?.currency || "XOF"}
            avis={avis}
            pointsForts={pointsForts}
            descriptionTexte={textePlat(produit.description).slice(0, 300)}
            etat={apercuEtat}
            livraison={livraisonApercu}
            actions={apercuActions}
            rendreFormulaire={() => <ApercuFormulaire produit={produitPublic} devise={devise} />}
            preview
            mode={mode}
            blocSelectionne={selection}
            onSelectBloc={(id) => { setSelection(id); setOnglet("bloc"); if (!large) setPanneau("proprietes"); }}
          />
        </div>
      </div>
    </div>
  );

  if (chargement) {
    return createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F4F3EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: MUTED }}>Chargement du Page Builder…</div>, document.body);
  }

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#F4F3EE", display: "flex", flexDirection: "column", fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: INK }}>
      {/* En-tête */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${BORD}`, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={fermer} style={btn({ padding: "8px 11px" })} aria-label="Fermer le Page Builder">← Fermer</button>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>PRODUCT PAGE BUILDER — {produit.nom}</div>
          <div style={{ fontSize: 11.5, color: MUTED }}>
            {publie ? <span style={{ color: VERT, fontWeight: 700 }}>● Publié</span> : <span style={{ color: "#8A6412", fontWeight: 700 }}>● Brouillon (la fiche habituelle est affichée)</span>}
            {modifie ? " · modifications non enregistrées" : modifsNonPubliees ? "" : ""}
            {!modifie && modifsNonPubliees ? " · brouillon différent de la version publiée" : ""}
          </div>
        </div>
        <div style={{ display: "flex", border: `1px solid ${BORD}`, borderRadius: 9, overflow: "hidden" }}>
          {[["desktop", "🖥️ Desktop"], ["mobile", "📱 Mobile"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} style={{ padding: "8px 11px", border: "none", background: mode === k ? VERT : "#fff", color: mode === k ? "#fff" : INK, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={annuler} disabled={historique.length === 0} style={btn({ opacity: historique.length === 0 ? 0.4 : 1 })}>↶ Annuler</button>
        {publie && lienPublic && <a href={lienPublic} target="_blank" rel="noopener noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>Voir la page ↗</a>}
        {publie && <button type="button" onClick={depublier} disabled={occupe} style={btn({ color: "#B33A2A" })}>Dépublier</button>}
        <button type="button" onClick={() => sauvegarder(false)} disabled={occupe || !!erreurChargement || !modifie} style={btn({ opacity: occupe || !!erreurChargement || !modifie ? 0.5 : 1 })}>Enregistrer</button>
        <button type="button" onClick={() => sauvegarder(true)} disabled={occupe || !!erreurChargement || (publie && !modifie && !modifsNonPubliees)} style={btnPlein({ opacity: occupe || !!erreurChargement || (publie && !modifie && !modifsNonPubliees) ? 0.5 : 1 })}>{publie ? "Mettre à jour la page publiée" : "Publier"}</button>
      </div>

      {erreurChargement && <div style={{ background: "#FBEAE6", color: "#8B2E1F", fontSize: 12.5, padding: "8px 14px", lineHeight: 1.45 }}>⚠️ {erreurChargement}</div>}
      {/* Bannière bien visible (pas juste le petit texte du statut ci-dessus) : la confusion la plus fréquente sur
          le Page Builder est de configurer une page (bundles, bénéfices…) sans jamais la publier, ou d'oublier
          de republier après une modification — la boutique continue alors d'afficher l'ancienne version, et le
          marchand croit à tort que ce qu'il a réglé ici « ne marche pas ». */}
      {!publie && (
        <div style={{ background: "#FBF3E3", color: "#8A6412", fontSize: 12.5, fontWeight: 600, padding: "8px 14px", lineHeight: 1.45 }}>
          ⚠️ Cette page n'est pas encore publiée : vos clients voient toujours la fiche produit habituelle (avec ses propres réglages, y compris ses Bundles). Cliquez sur « Publier » en haut à droite pour mettre CETTE page en ligne.
        </div>
      )}
      {publie && modifsNonPubliees && (
        <div style={{ background: "#FBF3E3", color: "#8A6412", fontSize: 12.5, fontWeight: 600, padding: "8px 14px", lineHeight: 1.45 }}>
          ⚠️ Vous avez des changements non publiés sur cette page : vos clients voient encore l'ancienne version. Cliquez sur « Mettre à jour la page publiée » en haut à droite pour les mettre en ligne.
        </div>
      )}
      {message && <div role="status" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: message.ok ? "#16231F" : "#B33A2A", color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.3)", maxWidth: "92vw" }}>{message.texte}</div>}

      {/* Onglets (petits écrans) */}
      {!large && (
        <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${BORD}` }}>
          {[["structure", "☷ Structure"], ["apercu", "👁️ Aperçu"], ["proprietes", "⚙️ Propriétés"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPanneau(k)} style={{ flex: 1, padding: "11px 4px", background: "none", border: "none", borderBottom: `3px solid ${panneau === k ? VERT : "transparent"}`, fontWeight: 800, fontSize: 13, color: panneau === k ? VERT : MUTED, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      )}

      {/* Corps */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: large ? "290px minmax(0,1fr) 350px" : "minmax(0,1fr)" }}>
        {(large || panneau === "structure") && <div style={{ overflowY: "auto", background: "#FAFAF7", borderRight: large ? `1px solid ${BORD}` : "none" }}>{listeStructure}</div>}
        {(large || panneau === "apercu") && <div style={{ minHeight: 0, minWidth: 0 }}>{apercu}</div>}
        {(large || panneau === "proprietes") && <div style={{ overflowY: "auto", background: "#fff", borderLeft: large ? `1px solid ${BORD}` : "none" }}>{panneauProprietes}</div>}
      </div>

      {modale === "choix" && <ModaleChoixDepart onGenererIA={() => setModale("ia")} onCreerMoiMeme={() => setModale("templates")} onClose={() => { setModale(null); setPremiereFois(false); }} />}
      {modale === "templates" && <ModaleTemplates actuel={config.template} premiereFois={premiereFois && !ligne} onChoisir={choisirTemplate} onClose={() => { setModale(null); setPremiereFois(false); }} />}
      {modale === "ajout" && <ModaleAjoutBloc config={config} onAjouter={ajouterBloc} onClose={() => setModale(null)} />}
      {modale === "ia" && <ModaleIA produit={produit} produits={produits} nbAvis={avis.length} onAppliquer={appliquerIA} onClose={() => setModale(null)} workspaceId={workspace.id} produitDescription={produit.description} />}
    </div>,
    document.body
  );
}
