import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// "Mon Réseau" côté propriétaire (§14-16 de la mission). Charge ses propres
// données (commissions, attributions) plutôt que de dépendre de ce que
// App-complet.jsx a déjà en mémoire — évite de charger inutilement ces
// tables pour les boutiques qui n'utilisent pas ce module (§46 perf).
export default function NetworkDashboard({ workspace, filleuls, produits, currency, onFilleulsChange }) {
  const [commissions, setCommissions] = useState([]);
  const [attributions, setAttributions] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [showAjout, setShowAjout] = useState(false);
  const [filleulSelectionne, setFilleulSelectionne] = useState(null);

  async function charger() {
    setChargement(true);
    const [{ data: comm }, { data: attrib }] = await Promise.all([
      supabase.from("filleuls_commissions").select("*").eq("workspace_id", workspace.id),
      supabase.from("filleuls_attributions").select("*").eq("workspace_id", workspace.id),
    ]);
    setCommissions(comm || []);
    setAttributions(attrib || []);
    setChargement(false);
  }

  useEffect(() => { charger(); }, [workspace.id]);

  const filleulsActifs = filleuls.filter((f) => f.statut === "actif").length;
  const caReseau = commissions.reduce((s, c) => s + Number(c.montant_base || 0), 0);
  const commADisponibles = commissions.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission), 0);
  const commPayees = commissions.filter((c) => c.statut === "paid").reduce((s, c) => s + Number(c.montant_commission), 0);
  const nonAttribuees = attributions.filter((a) => !a.filleul_id).length;

  function statsPourFilleul(filleulId) {
    const mesCommissions = commissions.filter((c) => c.filleul_id === filleulId);
    const mesVentes = attributions.filter((a) => a.filleul_id === filleulId).length;
    const ca = mesCommissions.reduce((s, c) => s + Number(c.montant_base || 0), 0);
    const commission = mesCommissions.reduce((s, c) => s + Number(c.montant_commission || 0), 0);
    const disponible = mesCommissions.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission), 0);
    const payee = mesCommissions.filter((c) => c.statut === "paid").reduce((s, c) => s + Number(c.montant_commission), 0);
    return { ventes: mesVentes, ca, commission, disponible, payee };
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18 };
  const label = { fontSize: 11, color: "#8A9089", marginBottom: 4 };
  const valeur = { fontSize: 20, fontWeight: 800, color: "#16231F" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F" }}>🟣 Mon Réseau</div>
        <button onClick={() => setShowAjout(true)} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          + Ajouter un filleul
        </button>
      </div>

      {/* Vue générale */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
        <div style={carte}><div style={label}>Filleuls actifs</div><div style={valeur}>{filleulsActifs} / {filleuls.length}</div></div>
        <div style={carte}><div style={label}>CA réseau</div><div style={valeur}>{caReseau.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Commissions disponibles</div><div style={{ ...valeur, color: "#1a7a3c" }}>{commADisponibles.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Commissions payées</div><div style={valeur}>{commPayees.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Ventes non attribuées</div><div style={valeur}>{nonAttribuees}</div></div>
      </div>

      {/* Liste des filleuls */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>Filleuls</div>
      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && filleuls.length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>
          Aucun filleul pour l'instant. Clique sur « + Ajouter un filleul » pour créer le premier lien.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filleuls.map((f) => {
          const s = statsPourFilleul(f.id);
          return (
            <div key={f.id} onClick={() => setFilleulSelectionne(f)} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "14px 18px" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#16231F" }}>{f.nom} <span style={{ color: "#8A9089", fontWeight: 500 }}>· {f.code}</span></div>
                <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>{f.telephone || "—"} · {f.statut === "actif" ? "✅ Actif" : "⏸️ Suspendu"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F" }}>{s.ventes} vente{s.ventes > 1 ? "s" : ""}</div>
                <div style={{ fontSize: 11, color: "#1a7a3c", fontWeight: 700 }}>{s.disponible.toLocaleString("fr-FR")} {currency} dispo.</div>
              </div>
            </div>
          );
        })}
      </div>

      {showAjout && (
        <AjoutFilleulModal
          workspace={workspace}
          onClose={() => setShowAjout(false)}
          onCree={async () => { setShowAjout(false); await onFilleulsChange?.(); await charger(); }}
        />
      )}

      {filleulSelectionne && (
        <FicheFilleulModal
          filleul={filleulSelectionne}
          stats={statsPourFilleul(filleulSelectionne.id)}
          currency={currency}
          workspace={workspace}
          onClose={() => setFilleulSelectionne(null)}
          onChange={async () => { await onFilleulsChange?.(); await charger(); }}
        />
      )}
    </div>
  );
}

function AjoutFilleulModal({ workspace, onClose, onCree }) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function creer() {
    if (!nom.trim()) { setErreur("Le nom est obligatoire."); return; }
    setEnCours(true);
    setErreur("");
    const { data: code, error: erreurCode } = await supabase.rpc("generer_code_filleul", { p_workspace_id: workspace.id, p_nom: nom.trim() });
    if (erreurCode || !code) { setErreur("Impossible de générer le code. Réessaie."); setEnCours(false); return; }

    const { data: filleulCree, error: erreurFilleul } = await supabase
      .from("filleuls")
      .insert([{ workspace_id: workspace.id, code, nom: nom.trim(), telephone: telephone.trim() || null, statut: "actif" }])
      .select()
      .single();
    if (erreurFilleul || !filleulCree) { setErreur("Impossible de créer le filleul. Réessaie."); setEnCours(false); return; }

    await supabase.from("filleuls_liens").insert([{ workspace_id: workspace.id, filleul_id: filleulCree.id, code, actif: true }]);

    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#16231F" }}>Nouveau filleul</div>
        <input placeholder="Nom complet" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} autoFocus />
        <input placeholder="Téléphone (optionnel)" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        {erreur && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 10 }}>{erreur}</div>}
        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "Création..." : "Créer le filleul et son lien"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

function FicheFilleulModal({ filleul, stats, currency, workspace, onClose, onChange }) {
  const [enCours, setEnCours] = useState(false);

  async function basculerStatut() {
    setEnCours(true);
    await supabase.from("filleuls").update({ statut: filleul.statut === "actif" ? "suspendu" : "actif", updated_at: new Date().toISOString() }).eq("id", filleul.id);
    setEnCours(false);
    onChange();
    onClose();
  }

  const domaine = workspace.domaine_personnalise || `${workspace.slug || ""}.recuvente.com`;
  const lien = `https://${domaine}?ref=${filleul.code}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#16231F" }}>{filleul.nom}</div>
        <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 16 }}>{filleul.code} · {filleul.telephone || "sans téléphone"}</div>

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Lien de vente</div>
        <div style={{ fontSize: 12, fontWeight: 700, wordBreak: "break-all", marginBottom: 16, background: "#F7FAF7", padding: "8px 10px", borderRadius: 8 }}>{lien}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Ventes</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.ventes}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>CA généré</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.ca.toLocaleString("fr-FR")} {currency}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Commission dispo.</div><div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a3c" }}>{stats.disponible.toLocaleString("fr-FR")} {currency}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Déjà payé</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.payee.toLocaleString("fr-FR")} {currency}</div></div>
        </div>

        <button onClick={basculerStatut} disabled={enCours} style={{ width: "100%", background: filleul.statut === "actif" ? "#FBEAEA" : "#EAF3DE", color: filleul.statut === "actif" ? "#D64933" : "#1a7a3c", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          {filleul.statut === "actif" ? "⏸️ Suspendre ce filleul" : "✅ Réactiver ce filleul"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}
