import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Espace personnel d'un filleul — miroir volontaire de LivreurPortalSaas /
// CloserPortalSaas : le filleul ne voit QUE ses propres données (garanti
// aussi côté RLS, ceci n'est qu'un affichage restreint côté écran).
export default function FilleulPortalSaas({ filleul, workspace, currency }) {
  const [lien, setLien] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [ventes, setVentes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [lienCopie, setLienCopie] = useState(false);

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
  const ventesAttribuees = ventes.filter((v) => v.filleul_id).length;

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
