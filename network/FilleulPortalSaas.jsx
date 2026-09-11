import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import NotificationsBell from "./NotificationsBell.jsx";
import SchoolPartenaire from "./SchoolPartenaire.jsx";
import ProchaineActionPartenaire from "./ProchaineActionPartenaire.jsx";
import ObjectifDuMois from "./ObjectifDuMois.jsx";

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
      <div style={{ marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "#8A9089" }}>{workspace.name}</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, color: "#16231F" }}>Bonjour {filleul.nom} 👋 {filleul.est_pro && <span style={{ fontSize: 12, background: "#f0ecfb", color: "#5b3ba8", padding: "3px 8px", borderRadius: 20, verticalAlign: "middle" }}>⭐ PRO</span>}</div>
        </div>
        <NotificationsBell workspace={workspace} />
      </div>

      <ProchaineActionPartenaire filleul={filleul} workspace={workspace} />

      <ObjectifDuMois workspace={workspace} peutGerer={false} />

      {/* Mon lien */}
      <div style={{ ...carte, background: "linear-gradient(135deg,#0d2417,#1a4a2e)", color: "white", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>🟢 Mon lien boutique</div>
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

      {/* Lien de recrutement — volontairement distinct du lien boutique (§13, §28) :
          l'un sert à vendre, l'autre à recruter, jamais confondus. */}
      <LienRecrutement filleul={filleul} />

      {/* Mes commissions */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button onClick={() => exporterMesCommissionsCSV(commissions, currency)} disabled={commissions.length === 0} style={{ background: "none", border: "none", color: commissions.length ? "#5b3ba8" : "#C7C2B5", fontSize: 11, fontWeight: 700, cursor: commissions.length ? "pointer" : "not-allowed" }}>
          ⬇️ Exporter mes commissions (CSV)
        </button>
      </div>
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

      <div style={{ ...carte, marginBottom: 16 }}>
        <SchoolPartenaire filleul={filleul} workspace={workspace} />
      </div>

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
  const [cleAchat, setCleAchat] = useState(() => crypto.randomUUID());
  const [cleVente, setCleVente] = useState(() => crypto.randomUUID());

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 16 };

  async function valider() {
    if (!produitId || !quantite || Number(quantite) <= 0) { setErreur("Choisis un produit et une quantité."); return; }
    setErreur("");
    setEnCours(true);
    let succes = false;
    if (ongletAction === "achat") {
      const produitChoisi = (produits || []).find((p) => p.id === produitId);
      const { error } = await supabase.rpc("enregistrer_mouvement_stock_filleul", {
        p_workspace_id: workspace.id, p_filleul_id: filleul.id, p_produit_id: produitId,
        p_type: "achat", p_quantite: Number(quantite),
        p_prix_unitaire: prix ? Number(prix) : Number(produitChoisi?.cout_achat || 0),
        p_commande_id: null, p_note: "Achat enregistré par le filleul",
        p_idempotency_key: cleAchat,
      });
      if (error) setErreur(error.message || "Échec — réessaie ou contacte le propriétaire.");
      else { succes = true; setCleAchat(crypto.randomUUID()); }
    } else {
      const { error } = await supabase.rpc("enregistrer_vente_stock_filleul", {
        p_workspace_id: workspace.id, p_filleul_id: filleul.id, p_produit_id: produitId,
        p_quantite: Number(quantite), p_prix_vente_unitaire: Number(prix) || 0,
        p_note: "Vente enregistrée par le filleul",
        p_idempotency_key: cleVente,
      });
      if (error) setErreur(error.message?.includes("Stock insuffisant") ? "Stock insuffisant pour cette quantité." : "Échec — réessaie.");
      else { succes = true; setCleVente(crypto.randomUUID()); }
    }
    setEnCours(false);
    // Même clé conservée en cas d'échec (retry sûr) ; renouvelée seulement après succès.
    if (succes) { setOngletAction(null); setProduitId(""); setQuantite(""); setPrix(""); await onChange(); }
  }

  return (
    <div style={carte}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>📦 Mon stock</div>
      {stock.length === 0 && <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 10, lineHeight: 1.5 }}>Vous n'avez pas encore de stock personnel. Achetez des produits à la base ci-dessous pour commencer à revendre.</div>}
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
  const [prospectOuvert, setProspectOuvert] = useState(null);
  const [recherche, setRecherche] = useState("");
  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 16 };
  const statutLabel = { nouveau: "🆕", contacte: "📞", presente: "🗣️", suivi: "🔄", inscrit: "✅", perdu: "❌" };

  // Priorité de relance : les statuts "chauds" (nouveau/en suivi) remontent en
  // premier, les issues finales (inscrit/perdu) descendent en bas.
  const ordrePriorite = { nouveau: 0, contacte: 1, presente: 1, suivi: 0, inscrit: 2, perdu: 3 };
  const prospectsTries = [...prospects]
    .filter((p) => !recherche.trim() || p.nom.toLowerCase().includes(recherche.trim().toLowerCase()) || (p.telephone || "").includes(recherche.trim()))
    .sort((a, b) => (ordrePriorite[a.statut] ?? 1) - (ordrePriorite[b.statut] ?? 1));

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

      {prospects.length > 4 && (
        <input
          placeholder="🔍 Rechercher..."
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 8 }}
        />
      )}

      {prospects.length === 0 && <div style={{ fontSize: 12, color: "#8A9089" }}>Aucun prospect pour l'instant — commence à en ajouter pour développer ton équipe.</div>}
      {prospects.length > 0 && prospectsTries.length === 0 && <div style={{ fontSize: 12, color: "#8A9089" }}>Aucun résultat pour cette recherche.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {prospectsTries.map((p) => (
          <div key={p.id} onClick={() => setProspectOuvert(p)} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 4px", cursor: "pointer", borderRadius: 6 }}>
            <span>{p.nom}</span>
            <span>{statutLabel[p.statut] || ""} {p.statut}</span>
          </div>
        ))}
      </div>

      {prospectOuvert && (
        <FicheProspectFilleulModal
          prospect={prospectOuvert}
          filleul={filleul}
          onClose={() => setProspectOuvert(null)}
          onChange={async () => { await onChange(); setProspectOuvert(null); }}
        />
      )}
    </div>
  );
}

// Fiche prospect côté filleul — changer le statut et ajouter une note de
// relance. Version simplifiée de celle du propriétaire : un filleul ne suit
// que ses propres prospects, pas besoin du même niveau de détail.
function FicheProspectFilleulModal({ prospect, filleul, onClose, onChange }) {
  const [statut, setStatut] = useState(prospect.statut);
  const [note, setNote] = useState("");
  const [relances, setRelances] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    supabase.from("filleuls_prospects_relances").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false })
      .then(({ data }) => { setRelances(data || []); setChargement(false); });
  }, [prospect.id]);

  async function enregistrer() {
    setEnCours(true);
    if (statut !== prospect.statut) {
      await supabase.from("filleuls_prospects").update({ statut, updated_at: new Date().toISOString() }).eq("id", prospect.id);
    }
    if (note.trim()) {
      await supabase.from("filleuls_prospects_relances").insert([{ prospect_id: prospect.id, note: note.trim(), auteur_type: "filleul", auteur_nom: filleul.nom }]);
    }
    setEnCours(false);
    await onChange();
  }

  const carteStyle = { position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 };
  const champ = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8 };

  return (
    <div style={carteStyle} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{prospect.nom}</div>
        <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 14 }}>{prospect.telephone || "—"}</div>

        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Statut</label>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} style={{ ...champ, marginTop: 4 }}>
          <option value="nouveau">🆕 Nouveau</option>
          <option value="contacte">📞 Contacté</option>
          <option value="presente">🗣️ Présentation faite</option>
          <option value="suivi">🔄 En suivi</option>
          <option value="inscrit">✅ Inscrit</option>
          <option value="perdu">❌ Perdu</option>
        </select>

        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Note de relance (optionnel)</label>
        <textarea placeholder="Ce que tu as fait / prévois de faire..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...champ, marginTop: 4, resize: "vertical" }} />

        <button onClick={enregistrer} disabled={enCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 9, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
          {enCours ? "..." : "Enregistrer"}
        </button>

        {!chargement && relances.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10.5, color: "#8A9089", fontWeight: 700, marginBottom: 6 }}>Historique</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {relances.map((r) => (
                <div key={r.id} style={{ background: "#F7FAF7", borderRadius: 8, padding: "7px 9px", fontSize: 11 }}>
                  <div style={{ color: "#8A9089", fontSize: 9.5, marginBottom: 2 }}>{new Date(r.created_at).toLocaleDateString("fr-FR")} · {r.auteur_type === "owner" ? "👤 Responsable" : r.auteur_nom || "Toi"}</div>
                  {r.note}
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12, padding: "8px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

// Lien de recrutement du filleul (§13, §28) — /tunnel/CODE, distinct du lien
// boutique (?ref=CODE). Affiche aussi ce qu'il a lui-même généré comme
// recruteur (§20 — analytics par recruteur), pas juste un lien à copier.
function LienRecrutement({ filleul }) {
  const [copie, setCopie] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function charger() {
      const [{ count: visites }, { count: candidatures }] = await Promise.all([
        supabase.from("recrutement_visites_tunnel").select("id", { count: "exact", head: true }).eq("recruteur_filleul_id", filleul.id),
        supabase.from("filleuls_prospects").select("id", { count: "exact", head: true }).eq("recruteur_filleul_id", filleul.id),
      ]);
      setStats({ visites: visites || 0, candidatures: candidatures || 0 });
    }
    charger();
  }, [filleul.id]);

  const lien = typeof window !== "undefined" ? `${window.location.origin}/tunnel/${filleul.code}` : "";

  function copier() {
    try { navigator.clipboard.writeText(lien); } catch (_) {}
    setCopie(true);
    setTimeout(() => setCopie(false), 1800);
  }

  return (
    <div style={{ background: "linear-gradient(135deg,#2d1a4a,#4a1a6e)", color: "white", borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>🔵 Mon lien de recrutement</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, wordBreak: "break-all", marginBottom: 14 }}>{lien}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: stats && (stats.visites > 0 || stats.candidatures > 0) ? 14 : 0 }}>
        <button onClick={copier} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          {copie ? "✅ Copié !" : "📋 Copier le lien"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent("Rejoins notre équipe : " + lien)}`}
          target="_blank" rel="noreferrer"
          style={{ background: "#25D366", color: "white", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}
        >
          💬 Partager sur WhatsApp
        </a>
      </div>
      {stats && (stats.visites > 0 || stats.candidatures > 0) && (
        <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "rgba(255,255,255,0.8)" }}>
          <div>👀 {stats.visites} visite{stats.visites > 1 ? "s" : ""}</div>
          <div>📝 {stats.candidatures} candidature{stats.candidatures > 1 ? "s" : ""}</div>
        </div>
      )}
    </div>
  );
}

// Export CSV des commissions du filleul (§26 — parité avec l'export déjà
// disponible côté propriétaire).
function exporterMesCommissionsCSV(commissions, currency) {
  const libelleStatut = { pending: "En attente", validated: "Disponible", available: "Disponible", paid: "Payée", cancelled: "Annulée", reversed: "Annulée" };
  const entetes = ["Date", `Montant (${currency})`, "Statut"];
  const lignes = commissions.map((c) => [new Date(c.created_at).toLocaleDateString("fr-FR"), c.montant_commission, libelleStatut[c.statut] || c.statut]);
  const csv = [entetes, ...lignes].map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `mes-commissions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
