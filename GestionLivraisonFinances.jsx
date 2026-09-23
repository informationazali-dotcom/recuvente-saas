import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  « Réglages livraison & finances » : tarifs de livraison (par défaut / zone /
//  livreur), dépenses générales (pour un vrai bénéfice net) et mouvements de
//  stock (entrées, pertes, inventaire, ajustements, retours).
//  Chargé à la demande (React.lazy) depuis App.jsx. Accès direct à Supabase,
//  protégé par les policies RLS posées dans sql/lot1-livraison-depenses-stock.sql.
// ============================================================================

const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");

const S = {
  carte: { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 14 },
  titre: { fontWeight: 700, fontSize: 15, color: "#16231F", marginBottom: 4 },
  aide: { fontSize: 12.5, color: "#6B7168", lineHeight: 1.55, marginBottom: 12 },
  label: { fontSize: 11.5, color: "#8A9089", margin: "10px 0 4px", display: "block" },
  champ: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box", background: "white" },
  bouton: { background: "#1a7a3c", color: "white", border: "none", padding: "11px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: "#16231F", border: "1px solid #DDD8CC", padding: "10px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13.5, cursor: "pointer" },
  boutonDanger: { background: "none", border: "none", color: "#D64933", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 6px" },
  ligne: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F1EFE8", gap: 10 },
};

function Message({ m }) {
  if (!m) return null;
  return <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, fontSize: 13, background: m.ok ? "#EAF3DE" : "#FBEAE6", color: m.ok ? "#3B6D11" : "#B23A26", border: `1px solid ${m.ok ? "#C7DDA3" : "#F0B8AC"}` }}>{m.texte}</div>;
}

// ---------------------------------------------------------------- Tarifs de livraison
function OngletTarifs({ workspace, currency }) {
  const [chargement, setChargement] = useState(true);
  const [tarifDefaut, setTarifDefaut] = useState("1500");
  const [zones, setZones] = useState([]);
  const [livreursTarifs, setLivreursTarifs] = useState([]);
  const [livreursListe, setLivreursListe] = useState([]);
  const [nouvZone, setNouvZone] = useState({ zone: "", montant: "" });
  const [nouvLivreur, setNouvLivreur] = useState({ livreur_nom: "", montant: "" });
  const [msg, setMsg] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setChargement(true);
    const [{ data: reg }, { data: z }, { data: l }, { data: livr }] = await Promise.all([
      supabase.from("reglages_livraison").select("tarif_defaut").eq("workspace_id", workspace.id).maybeSingle(),
      supabase.from("tarifs_zone_livraison").select("id, zone, montant").eq("workspace_id", workspace.id).order("zone"),
      supabase.from("tarifs_livreur_livraison").select("id, livreur_nom, montant").eq("workspace_id", workspace.id).order("livreur_nom"),
      supabase.from("livreurs").select("id, nom").eq("workspace_id", workspace.id).order("nom"),
    ]);
    setTarifDefaut(reg && reg.tarif_defaut != null ? String(reg.tarif_defaut) : "1500");
    setZones(z || []);
    setLivreursTarifs(l || []);
    setLivreursListe(livr || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [workspace.id]);

  async function sauverTarifDefaut() {
    const montant = Number(tarifDefaut);
    if (!(montant >= 0)) { setMsg({ ok: false, texte: "Montant invalide." }); return; }
    setEnCours(true);
    const { error } = await supabase.from("reglages_livraison").upsert({ workspace_id: workspace.id, tarif_defaut: montant, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
    setEnCours(false);
    setMsg(error ? { ok: false, texte: error.message } : { ok: true, texte: "Tarif par défaut enregistré." });
  }

  async function ajouterZone() {
    if (!nouvZone.zone.trim() || !(Number(nouvZone.montant) >= 0)) return;
    setEnCours(true);
    const { error } = await supabase.from("tarifs_zone_livraison").upsert(
      { workspace_id: workspace.id, zone: nouvZone.zone.trim(), montant: Number(nouvZone.montant) },
      { onConflict: "workspace_id,zone" }
    );
    setEnCours(false);
    if (error) { setMsg({ ok: false, texte: error.message }); return; }
    setNouvZone({ zone: "", montant: "" });
    charger();
  }
  async function supprimerZone(id) {
    await supabase.from("tarifs_zone_livraison").delete().eq("id", id);
    charger();
  }

  async function ajouterLivreurTarif() {
    if (!nouvLivreur.livreur_nom.trim() || !(Number(nouvLivreur.montant) >= 0)) return;
    setEnCours(true);
    const { error } = await supabase.from("tarifs_livreur_livraison").upsert(
      { workspace_id: workspace.id, livreur_nom: nouvLivreur.livreur_nom.trim(), montant: Number(nouvLivreur.montant) },
      { onConflict: "workspace_id,livreur_nom" }
    );
    setEnCours(false);
    if (error) { setMsg({ ok: false, texte: error.message }); return; }
    setNouvLivreur({ livreur_nom: "", montant: "" });
    charger();
  }
  async function supprimerLivreurTarif(id) {
    await supabase.from("tarifs_livreur_livraison").delete().eq("id", id);
    charger();
  }

  if (chargement) return <div style={{ padding: 20, textAlign: "center", color: "#8A9089", fontSize: 13 }}>Chargement…</div>;

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>💰 Tarif de livraison par défaut</div>
        <div style={S.aide}>Appliqué à chaque livraison confirmée, sauf si un tarif de zone ou de livreur plus précis existe ci-dessous.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" min="0" value={tarifDefaut} onChange={(e) => setTarifDefaut(e.target.value)} style={{ ...S.champ, flex: 1 }} />
          <span style={{ fontSize: 13, color: "#6B7168" }}>{currency}</span>
          <button onClick={sauverTarifDefaut} disabled={enCours} style={S.bouton}>Enregistrer</button>
        </div>
      </div>

      <div style={S.carte}>
        <div style={S.titre}>📍 Tarifs par zone</div>
        <div style={S.aide}>Ex. « Cocody » plus loin que « Plateau » : donne un tarif différent selon la zone du client.</div>
        {zones.map((z) => (
          <div key={z.id} style={S.ligne}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{z.zone}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5 }}>{nombre(z.montant)} {currency}</span>
              <button onClick={() => supprimerZone(z.id)} style={S.boutonDanger}>Supprimer</button>
            </span>
          </div>
        ))}
        {zones.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089", padding: "6px 0" }}>Aucun tarif de zone — le tarif par défaut s'applique partout.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input placeholder="Zone (ex. Cocody)" value={nouvZone.zone} onChange={(e) => setNouvZone((f) => ({ ...f, zone: e.target.value }))} style={{ ...S.champ, flex: 2 }} />
          <input type="number" min="0" placeholder="Montant" value={nouvZone.montant} onChange={(e) => setNouvZone((f) => ({ ...f, montant: e.target.value }))} style={{ ...S.champ, flex: 1 }} />
          <button onClick={ajouterZone} disabled={enCours} style={S.boutonClair}>+ Ajouter</button>
        </div>
      </div>

      <div style={S.carte}>
        <div style={S.titre}>🛵 Tarifs par livreur</div>
        <div style={S.aide}>Prioritaire sur le tarif de zone : un livreur donné peut être payé différemment (moto, véhicule, distance habituelle).</div>
        {livreursTarifs.map((l) => (
          <div key={l.id} style={S.ligne}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{l.livreur_nom}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5 }}>{nombre(l.montant)} {currency}</span>
              <button onClick={() => supprimerLivreurTarif(l.id)} style={S.boutonDanger}>Supprimer</button>
            </span>
          </div>
        ))}
        {livreursTarifs.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089", padding: "6px 0" }}>Aucun tarif par livreur.</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <select value={nouvLivreur.livreur_nom} onChange={(e) => setNouvLivreur((f) => ({ ...f, livreur_nom: e.target.value }))} style={{ ...S.champ, flex: 2 }}>
            <option value="">— Choisir un livreur —</option>
            {livreursListe.map((l) => <option key={l.id} value={l.nom}>{l.nom}</option>)}
          </select>
          <input type="number" min="0" placeholder="Montant" value={nouvLivreur.montant} onChange={(e) => setNouvLivreur((f) => ({ ...f, montant: e.target.value }))} style={{ ...S.champ, flex: 1 }} />
          <button onClick={ajouterLivreurTarif} disabled={enCours} style={S.boutonClair}>+ Ajouter</button>
        </div>
      </div>
      <Message m={msg} />
    </div>
  );
}

// ---------------------------------------------------------------- Dépenses générales
const CATEGORIES_DEPENSE = [
  { key: "loyer", label: "🏠 Loyer / local" },
  { key: "publicite", label: "📣 Publicité" },
  { key: "salaire", label: "👥 Salaires" },
  { key: "transport", label: "🚗 Transport" },
  { key: "stock", label: "📦 Achat de stock" },
  { key: "autre", label: "🧾 Autre" },
];

function OngletDepenses({ workspace, currency }) {
  const [chargement, setChargement] = useState(true);
  const [depenses, setDepenses] = useState([]);
  const [form, setForm] = useState({ categorie: "autre", libelle: "", montant: "", date_depense: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setChargement(true);
    const debut = new Date();
    debut.setDate(debut.getDate() - 60);
    const { data } = await supabase
      .from("depenses_generales")
      .select("id, categorie, libelle, montant, date_depense, note")
      .eq("workspace_id", workspace.id)
      .gte("date_depense", debut.toISOString().slice(0, 10))
      .order("date_depense", { ascending: false });
    setDepenses(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [workspace.id]);

  const total = useMemo(() => depenses.reduce((s, d) => s + Number(d.montant), 0), [depenses]);

  async function ajouter() {
    if (!form.libelle.trim() || !(Number(form.montant) > 0)) { setMsg({ ok: false, texte: "Renseigne un libellé et un montant." }); return; }
    setEnCours(true);
    const { error } = await supabase.from("depenses_generales").insert([{
      workspace_id: workspace.id,
      categorie: form.categorie,
      libelle: form.libelle.trim(),
      montant: Number(form.montant),
      date_depense: form.date_depense,
    }]);
    setEnCours(false);
    if (error) { setMsg({ ok: false, texte: error.message }); return; }
    setForm({ categorie: "autre", libelle: "", montant: "", date_depense: new Date().toISOString().slice(0, 10) });
    setMsg({ ok: true, texte: "Dépense ajoutée." });
    charger();
  }
  async function supprimer(id) {
    await supabase.from("depenses_generales").delete().eq("id", id);
    charger();
  }

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>🧾 Nouvelle dépense</div>
        <div style={S.aide}>Loyer, publicité, salaires… tout ce qui sort de la caisse mais n'est pas un coût de produit ou de livraison. Ces dépenses réduisent le bénéfice net affiché sur le tableau de bord.</div>
        <select value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))} style={{ ...S.champ, marginBottom: 8 }}>
          {CATEGORIES_DEPENSE.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input placeholder="Libellé (ex. Loyer du mois de septembre)" value={form.libelle} onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))} style={{ ...S.champ, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" min="0" placeholder="Montant" value={form.montant} onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))} style={{ ...S.champ, flex: 1 }} />
          <input type="date" value={form.date_depense} onChange={(e) => setForm((f) => ({ ...f, date_depense: e.target.value }))} style={{ ...S.champ, flex: 1 }} />
        </div>
        <button onClick={ajouter} disabled={enCours} style={{ ...S.bouton, width: "100%", marginTop: 10 }}>+ Ajouter la dépense</button>
        <Message m={msg} />
      </div>

      <div style={S.carte}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={S.titre}>Dépenses des 60 derniers jours</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: "#D64933" }}>− {nombre(total)} {currency}</div>
        </div>
        {chargement && <div style={{ padding: 14, textAlign: "center", color: "#8A9089", fontSize: 13 }}>Chargement…</div>}
        {!chargement && depenses.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089", padding: "6px 0" }}>Aucune dépense enregistrée pour l'instant.</div>}
        {depenses.map((d) => (
          <div key={d.id} style={S.ligne}>
            <span>
              <span style={{ fontSize: 14, fontWeight: 600, display: "block" }}>{d.libelle}</span>
              <span style={{ fontSize: 11.5, color: "#8A9089" }}>{CATEGORIES_DEPENSE.find((c) => c.key === d.categorie)?.label || d.categorie} · {new Date(d.date_depense).toLocaleDateString("fr-FR")}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5 }}>{nombre(d.montant)} {currency}</span>
              <button onClick={() => supprimer(d.id)} style={S.boutonDanger}>Supprimer</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Mouvements de stock
const TYPES_MOUVEMENT = [
  { key: "entree", label: "📥 Entrée (réapprovisionnement)", signe: 1 },
  { key: "retour", label: "↩️ Retour client", signe: 1 },
  { key: "perte", label: "🗑️ Perte / casse", signe: -1 },
  { key: "ajustement", label: "⚖️ Ajustement (correction)", signe: 0 },
  { key: "inventaire", label: "📋 Inventaire (correction)", signe: 0 },
];

function OngletStock({ workspace, produits }) {
  const [produitId, setProduitId] = useState(produits[0]?.id || "");
  const [mouvements, setMouvements] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [type, setType] = useState("entree");
  const [quantite, setQuantite] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger(pid) {
    if (!pid) { setMouvements([]); return; }
    setChargement(true);
    const { data } = await supabase
      .from("mouvements_stock")
      .select("id, type, quantite, note, created_at")
      .eq("workspace_id", workspace.id)
      .eq("produit_id", pid)
      .order("created_at", { ascending: false })
      .limit(50);
    setMouvements(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(produitId); }, [produitId, workspace.id]);

  const produit = produits.find((p) => p.id === produitId);
  const netMouvements = useMemo(() => mouvements.reduce((s, m) => s + Number(m.quantite), 0), [mouvements]);

  async function ajouter() {
    if (!produitId || !(Number(quantite) !== 0)) { setMsg({ ok: false, texte: "Choisis un produit et une quantité." }); return; }
    const def = TYPES_MOUVEMENT.find((t) => t.key === type);
    // Pour 'ajustement'/'inventaire', la quantité saisie porte déjà son signe (peut être négative).
    const q = def.signe === 0 ? Number(quantite) : Math.abs(Number(quantite)) * def.signe;
    setEnCours(true);
    const { error } = await supabase.from("mouvements_stock").insert([{ workspace_id: workspace.id, produit_id: produitId, type, quantite: q, note: note.trim() || null }]);
    setEnCours(false);
    if (error) { setMsg({ ok: false, texte: error.message }); return; }
    setQuantite(""); setNote("");
    setMsg({ ok: true, texte: "Mouvement enregistré." });
    charger(produitId);
  }

  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>📦 Choisir un produit</div>
        <select value={produitId} onChange={(e) => setProduitId(e.target.value)} style={S.champ}>
          {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        {produit && (
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12.5, color: "#6B7168" }}>
            <span>Stock initial : <strong style={{ color: "#16231F" }}>{nombre(produit.stock_initial || 0)}</strong></span>
            <span>Mouvements (50 derniers) : <strong style={{ color: netMouvements >= 0 ? "#3B6D11" : "#D64933" }}>{netMouvements >= 0 ? "+" : ""}{nombre(netMouvements)}</strong></span>
          </div>
        )}
      </div>

      <div style={S.carte}>
        <div style={S.titre}>Nouveau mouvement</div>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...S.champ, marginBottom: 8 }}>
          {TYPES_MOUVEMENT.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" placeholder={type === "ajustement" || type === "inventaire" ? "Quantité (+ ou −)" : "Quantité"} value={quantite} onChange={(e) => setQuantite(e.target.value)} style={{ ...S.champ, flex: 1 }} />
        </div>
        <input placeholder="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...S.champ, marginTop: 8 }} />
        <button onClick={ajouter} disabled={enCours || !produitId} style={{ ...S.bouton, width: "100%", marginTop: 10 }}>+ Enregistrer le mouvement</button>
        <Message m={msg} />
      </div>

      <div style={S.carte}>
        <div style={S.titre}>Historique (50 derniers mouvements)</div>
        {chargement && <div style={{ padding: 14, textAlign: "center", color: "#8A9089", fontSize: 13 }}>Chargement…</div>}
        {!chargement && mouvements.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089", padding: "6px 0" }}>Aucun mouvement pour ce produit.</div>}
        {mouvements.map((m) => (
          <div key={m.id} style={S.ligne}>
            <span>
              <span style={{ fontSize: 14, fontWeight: 600, display: "block" }}>{TYPES_MOUVEMENT.find((t) => t.key === m.type)?.label || m.type}</span>
              <span style={{ fontSize: 11.5, color: "#8A9089" }}>{new Date(m.created_at).toLocaleDateString("fr-FR")} {m.note ? `· ${m.note}` : ""}</span>
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, fontWeight: 700, color: Number(m.quantite) >= 0 ? "#3B6D11" : "#D64933" }}>
              {Number(m.quantite) >= 0 ? "+" : ""}{nombre(m.quantite)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Coquille (modal à onglets)
export default function GestionLivraisonFinancesModal({ workspace, produits = [], onClose, ongletInitial }) {
  const [onglet, setOnglet] = useState(ongletInitial || "tarifs");
  const currency = workspace.currency === "XOF" || workspace.currency === "XAF" ? "F CFA" : workspace.currency;
  const onglets = [
    { id: "tarifs", label: "🚚 Tarifs de livraison" },
    { id: "depenses", label: "🧾 Dépenses générales" },
    ...(produits.length > 0 ? [{ id: "stock", label: "📦 Mouvements de stock" }] : []),
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FAFAF7", width: "100%", maxWidth: 640, maxHeight: "94vh", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ padding: "16px 18px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>⚙️ Livraison & dépenses</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7168" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", overflowX: "auto" }}>
          {onglets.map((o) => (
            <button key={o.id} onClick={() => setOnglet(o.id)} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: onglet === o.id ? "1px solid #1a7a3c" : "1px solid #DDD8CC", background: onglet === o.id ? "#1a7a3c" : "white", color: onglet === o.id ? "white" : "#16231F" }}>{o.label}</button>
          ))}
        </div>
        <div style={{ padding: "4px 18px 26px", overflowY: "auto" }}>
          {onglet === "tarifs" && <OngletTarifs workspace={workspace} currency={currency} />}
          {onglet === "depenses" && <OngletDepenses workspace={workspace} currency={currency} />}
          {onglet === "stock" && produits.length > 0 && <OngletStock workspace={workspace} produits={produits} />}
        </div>
      </div>
    </div>
  );
}
