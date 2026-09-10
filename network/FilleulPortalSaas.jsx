import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Espace personnel d'un filleul — miroir volontaire de LivreurPortalSaas /
// CloserPortalSaas : le filleul ne voit QUE ses propres données (garanti
// aussi côté RLS, ceci n'est qu'un affichage restreint côté écran).
export default function FilleulPortalSaas({ filleul, workspace, currency, produits }) {
  const [lien, setLien] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [lienCopie, setLienCopie] = useState(false);
  const [stock, setStock] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [monEquipe, setMonEquipe] = useState([]);

  async function chargerStock() {
    const { data } = await supabase.from("filleuls_stock").select("*, produits(nom)").eq("filleul_id", filleul.id).gt("quantite_restante", 0);
    setStock(data || []);
  }

  async function chargerProspects() {
    const { data } = await supabase.from("filleuls_prospects").select("*").eq("prospecte_par_filleul_id", filleul.id).order("created_at", { ascending: false });
    setProspects(data || []);
  }

  useEffect(() => {
    async function charger() {
      setChargement(true);
      // Fixe définitivement filleuls.user_id à la première connexion (voir le
      // correctif RLS) — sans effet si déjà lié, donc sûr à rappeler à chaque fois.
      await supabase.rpc("lier_mon_profil_filleul", { p_workspace_id: workspace.id }).catch(() => {});
      const [{ data: liens }, { data: comm }, { data: attrib }] = await Promise.all([
        supabase.from("filleuls_liens").select("*").eq("filleul_id", filleul.id).eq("actif", true).limit(1),
        supabase.from("filleuls_commissions").select("*").eq("filleul_id", filleul.id).order("created_at", { ascending: false }),
        supabase.from("filleuls_attributions").select("*").eq("filleul_id", filleul.id).order("created_at", { ascending: false }),
      ]);
      setLien((liens && liens[0]) || null);
      setCommissions(comm || []);
      setVentes(attrib || []);
      if (filleul.mode_vente === "revendeur") await chargerStock();
      await chargerProspects();
      const { data: equipeData } = await supabase.from("filleuls").select("id, nom, statut").eq("parrain_id", filleul.id);
      setMonEquipe(equipeData || []);
      const { data: coachData } = await supabase.from("filleuls_coachings").select("*").eq("filleul_id", filleul.id).order("created_at", { ascending: false });
      setCoachings(coachData || []);
      setChargement(false);
    }
    charger();
  }, [filleul.id]);

  const codeAffiche = lien?.code || filleul.code;
  const domaine = workspace.domaine_personnalise || `${workspace.slug || ""}.recuvente.com`;
  const lienComplet = codeAffiche ? `https://${domaine}?ref=${codeAffiche}` : null;

  function copierLien() {
    if (!lienComplet) return;
    navigator.clipboard.writeText(lienComplet);
    setLienCopie(true);
    setTimeout(() => setLienCopie(false), 2000);
  }

  const totalPending = commissions.filter((c) => c.statut === "pending").reduce((s, c) => s + Number(c.montant_commission), 0);
  const totalValidated = commissions.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission), 0);
  const totalPaid = commissions.filter((c) => c.statut === "paid").reduce((s, c) => s + Number(c.montant_commission), 0);
  // Une vente peut venir du lien (filleuls_attributions) ou du stock personnel en mode
  // revendeur (filleuls_commissions.source = 'vente_stock', sans ligne d'attribution).
  const ventesAttribuees = ventes.filter((v) => v.filleul_id).length + commissions.filter((c) => c.source === "vente_stock").length;

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18 };
  const label = { fontSize: 11, color: "#8A9089", marginBottom: 4 };
  const valeur = { fontSize: 22, fontWeight: 800, color: "#16231F" };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", padding: "20px 16px 60px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, color: "#8A9089" }}>{workspace.name}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, color: "#16231F" }}>Bonjour {filleul.nom} 👋</div>
      </div>

      {/* Mon lien */}
      <div style={{ ...carte, background: "linear-gradient(135deg,#0d2417,#1a4a2e)", color: "white", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>🔗 Mon lien de vente</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, wordBreak: "break-all", marginBottom: 14 }}>
          {lienComplet || "Génération en cours..."}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={copierLien} disabled={!lienComplet} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {lienCopie ? "✅ Copié !" : "📋 Copier le lien"}
          </button>
          {lienComplet && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent("Découvre notre boutique : " + lienComplet)}`}
              target="_blank" rel="noreferrer"
              style={{ background: "#25D366", color: "white", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
            >
              💬 Partager sur WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Mes commissions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <div style={carte}><div style={label}>En attente</div><div style={valeur}>{totalPending.toLocaleString("fr-FR")}</div><div style={{ fontSize: 10.5, color: "#8A9089" }}>{currency}</div></div>
        <div style={carte}><div style={label}>Disponible</div><div style={{ ...valeur, color: "#1a7a3c" }}>{totalValidated.toLocaleString("fr-FR")}</div><div style={{ fontSize: 10.5, color: "#8A9089" }}>{currency}</div></div>
        <div style={carte}><div style={label}>Déjà payé</div><div style={valeur}>{totalPaid.toLocaleString("fr-FR")}</div><div style={{ fontSize: 10.5, color: "#8A9089" }}>{currency}</div></div>
      </div>

      <div style={{ ...carte, marginBottom: 16 }}>
        <div style={label}>Mes ventes attribuées</div>
        <div style={valeur}>{ventesAttribuees}</div>
      </div>

      {filleul.mode_vente === "revendeur" && (
        <MonStock filleul={filleul} workspace={workspace} produits={produits} currency={currency} stock={stock} onChange={chargerStock} />
      )}

      {monEquipe.length > 0 && (
        <div style={{ ...carte, marginBottom: 16 }}>
          <div style={label}>👥 Mon équipe ({monEquipe.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
            {monEquipe.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>{m.nom}</span>
                <span style={{ color: m.statut === "actif" ? "#1a7a3c" : "#8A9089" }}>{m.statut === "actif" ? "✅ Actif" : "⏸️ Suspendu"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MesProspects filleul={filleul} workspace={workspace} prospects={prospects} onChange={chargerProspects} />

      {coachings.length > 0 && (
        <div style={{ ...carte, marginBottom: 16 }}>
          <div style={label}>🎓 Notes de mon coach</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {coachings.map((c) => (
              <div key={c.id} style={{ fontSize: 12, background: "#F7FAF7", borderRadius: 8, padding: "8px 10px" }}>
                {c.note}
                <div style={{ fontSize: 10, color: "#8A9089", marginTop: 3 }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique commissions */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>Mes commissions récentes</div>
      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && commissions.length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>
          Aucune vente pour l'instant — partage ton lien pour commencer 🚀
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commissions.slice(0, 30).map((c) => {
          const statutLabel = { pending: "⏳ En attente", validated: "✅ Validée", available: "💰 Disponible", paid: "✔️ Payée", cancelled: "❌ Annulée", reversed: "↩️ Reversée" }[c.statut] || c.statut;
          return (
            <div key={c.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>{Number(c.montant_commission).toLocaleString("fr-FR")} {currency}</div>
                <div style={{ fontSize: 10.5, color: "#8A9089" }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{statutLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mode revendeur (§6-7 de la mission) : le filleul achète du stock à la base puis le
// revend avec sa propre marge. Deux actions possibles, toutes deux passent par la RPC
// sécurisée côté serveur — jamais un calcul de stock fait en confiance depuis le client.
function MonStock({ filleul, workspace, produits, currency, stock, onChange }) {
  const [ongletAction, setOngletAction] = useState(null); // 'achat' | 'vente' | null
  const [produitId, setProduitId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [prix, setPrix] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 16 };

  async function valider() {
    if (!produitId || !quantite || Number(quantite) <= 0) { setErreur("Choisis un produit et une quantité."); return; }
    setErreur("");
    setEnCours(true);
    if (ongletAction === "achat") {
      const produitChoisi = (produits || []).find((p) => p.id === produitId);
      const { error } = await supabase.rpc("enregistrer_mouvement_stock_filleul", {
        p_workspace_id: workspace.id, p_filleul_id: filleul.id, p_produit_id: produitId,
        p_type: "achat", p_quantite: Number(quantite),
        p_prix_unitaire: prix ? Number(prix) : Number(produitChoisi?.cout_achat || 0),
        p_commande_id: null, p_note: "Achat enregistré par le filleul",
      });
      if (error) setErreur("Échec — réessaie ou contacte le propriétaire.");
    } else {
      const { error } = await supabase.rpc("enregistrer_vente_stock_filleul", {
        p_workspace_id: workspace.id, p_filleul_id: filleul.id, p_produit_id: produitId,
        p_quantite: Number(quantite), p_prix_vente_unitaire: Number(prix) || 0,
        p_note: "Vente enregistrée par le filleul",
      });
      if (error) setErreur(error.message?.includes("Stock insuffisant") ? "Stock insuffisant pour cette quantité." : "Échec — réessaie.");
    }
    setEnCours(false);
    if (!erreur) { setOngletAction(null); setProduitId(""); setQuantite(""); setPrix(""); await onChange(); }
  }

  return (
    <div style={carte}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>📦 Mon stock</div>
      {stock.length === 0 && <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 10 }}>Aucun stock pour l'instant.</div>}
      {stock.map((s) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0" }}>
          <span>{s.produits?.nom || "Produit"}</span>
          <span style={{ fontWeight: 700 }}>{s.quantite_restante} restant{s.quantite_restante > 1 ? "s" : ""}</span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => setOngletAction(ongletAction === "achat" ? null : "achat")} style={{ flex: 1, background: ongletAction === "achat" ? "#1a7a3c" : "#EAF3DE", color: ongletAction === "achat" ? "white" : "#1a7a3c", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
          + Acheter du stock
        </button>
        <button onClick={() => setOngletAction(ongletAction === "vente" ? null : "vente")} style={{ flex: 1, background: ongletAction === "vente" ? "#6b3fd4" : "#f0ecfb", color: ongletAction === "vente" ? "white" : "#5b3ba8", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
          Enregistrer une vente
        </button>
      </div>

      {ongletAction && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #ECE8DC" }}>
          <select value={produitId} onChange={(e) => setProduitId(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 8 }}>
            <option value="">
              {ongletAction === "achat" ? "Produit à acheter..." : "Produit à vendre..."}
            </option>
            {ongletAction === "achat"
              ? (produits || []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)
              : stock.map((s) => <option key={s.produit_id} value={s.produit_id}>{s.produits?.nom} ({s.quantite_restante} dispo.)</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input type="number" placeholder="Quantité" value={quantite} onChange={(e) => setQuantite(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }} />
            <input type="number" placeholder={ongletAction === "achat" ? "Prix payé (optionnel)" : "Prix de vente"} value={prix} onChange={(e) => setPrix(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }} />
          </div>
          {erreur && <div style={{ fontSize: 11, color: "#D64933", marginBottom: 8 }}>{erreur}</div>}
          <button onClick={valider} disabled={enCours} style={{ width: "100%", background: "#16231F", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {enCours ? "..." : "Confirmer"}
          </button>
        </div>
      )}
    </div>
  );
}

// "Mes prospects" (§12 de la mission) : le filleul prospecte pour développer son
// propre réseau. Il ne voit/gère que SES prospects (garanti par RLS).
function MesProspects({ filleul, workspace, prospects, onChange }) {
  const [showAjout, setShowAjout] = useState(false);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [enCours, setEnCours] = useState(false);
  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 16 };
  const statutLabel = { nouveau: "🆕", contacte: "📞", presente: "🗣️", suivi: "🔄", inscrit: "✅", perdu: "❌" };

  async function creer() {
    if (!nom.trim()) return;
    setEnCours(true);
    await supabase.from("filleuls_prospects").insert([{ workspace_id: workspace.id, prospecte_par_filleul_id: filleul.id, nom: nom.trim(), telephone: telephone.trim() || null }]);
    setNom(""); setTelephone(""); setShowAjout(false);
    setEnCours(false);
    await onChange();
  }

  return (
    <div style={carte}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F" }}>🎯 Mes prospects</div>
        <button onClick={() => setShowAjout(!showAjout)} style={{ background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          + Ajouter
        </button>
      </div>

      {showAjout && (
        <div style={{ marginBottom: 12 }}>
          <input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 6 }} />
          <input placeholder="Téléphone (optionnel)" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 6 }} />
          <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            {enCours ? "..." : "Créer"}
          </button>
        </div>
      )}

      {prospects.length === 0 && <div style={{ fontSize: 12, color: "#8A9089" }}>Aucun prospect pour l'instant — commence à en ajouter pour développer ton équipe.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {prospects.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0" }}>
            <span>{p.nom}</span>
            <span>{statutLabel[p.statut] || ""} {p.statut}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
