import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import NotificationsBell from "./NotificationsBell.jsx";
import CentreAFaire from "./CentreAFaire.jsx";
import OnboardingReseau from "./OnboardingReseau.jsx";
import ObjectifDuMois from "./ObjectifDuMois.jsx";
import RechercheGlobale from "./RechercheGlobale.jsx";

// "Mon Réseau" côté propriétaire (§14-16 de la mission). Charge ses propres
// données (commissions, attributions) plutôt que de dépendre de ce que
// App-complet.jsx a déjà en mémoire — évite de charger inutilement ces
// tables pour les boutiques qui n'utilisent pas ce module (§46 perf).
export default function NetworkDashboard({ workspace, filleuls, produits, currency, onFilleulsChange, onNaviguer }) {
  const [commissions, setCommissions] = useState([]);
  const [attributions, setAttributions] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [showAjout, setShowAjout] = useState(false);
  const [filleulSelectionne, setFilleulSelectionne] = useState(null);
  const [onglet, setOnglet] = useState("filleuls"); // filleuls | commissions
  const [filtreStatut, setFiltreStatut] = useState("toutes");
  const [rechercheFilleul, setRechercheFilleul] = useState("");
  const [filleulAPayer, setFilleulAPayer] = useState(null);
  const [maxFilleuls, setMaxFilleuls] = useState(null);
  const [maxCommandesMois, setMaxCommandesMois] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [prospectsCharges, setProspectsCharges] = useState(false);
  const [prospectSelectionne, setProspectSelectionne] = useState(null);
  const [showAjoutProspect, setShowAjoutProspect] = useState(false);
  const [filtreStatutProspect, setFiltreStatutProspect] = useState("toutes");

  async function chargerProspects() {
    const { data } = await supabase.from("filleuls_prospects").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
    setProspects(data || []);
    setProspectsCharges(true);
  }

  const [valeurStockReseau, setValeurStockReseau] = useState(0);
  const [prospectsActifsCount, setProspectsActifsCount] = useState(0);

  async function charger() {
    setChargement(true);
    const [{ data: comm }, { data: attrib }, { data: pay }, { data: sub }, { data: stockReseau }, { count: nbProspectsActifs }] = await Promise.all([
      supabase.from("filleuls_commissions").select("*").eq("workspace_id", workspace.id),
      supabase.from("filleuls_attributions").select("*").eq("workspace_id", workspace.id),
      supabase.from("filleuls_paiements_commissions").select("*").eq("workspace_id", workspace.id).order("paye_le", { ascending: false }),
      supabase.from("subscriptions").select("*, subscription_plans(max_filleuls, max_commandes_reseau_mois)").eq("workspace_id", workspace.id).maybeSingle(),
      supabase.from("filleuls_stock").select("quantite_restante, prix_acquisition_moyen").eq("workspace_id", workspace.id),
      supabase.from("filleuls_prospects").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).not("statut", "in", "(inscrit,perdu)"),
    ]);
    setCommissions(comm || []);
    setAttributions(attrib || []);
    setPaiements(pay || []);
    setMaxFilleuls(sub?.subscription_plans?.max_filleuls ?? null);
    setMaxCommandesMois(sub?.subscription_plans?.max_commandes_reseau_mois ?? null);
    setValeurStockReseau((stockReseau || []).reduce((s, r) => s + Number(r.quantite_restante || 0) * Number(r.prix_acquisition_moyen || 0), 0));
    setProspectsActifsCount(nbProspectsActifs || 0);
    setChargement(false);
  }

  useEffect(() => { charger(); }, [workspace.id]);

  const debutMoisCourant = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const commandesAttribueesCeMois = attributions.filter((a) => a.filleul_id && new Date(a.created_at) >= debutMoisCourant).length;

  const filleulsActifs = filleuls.filter((f) => f.statut === "actif").length;
  const caReseau = commissions.reduce((s, c) => s + Number(c.montant_base || 0), 0);
  const commADisponibles = commissions.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission), 0);
  const commPayees = commissions.filter((c) => c.statut === "paid").reduce((s, c) => s + Number(c.montant_commission), 0);
  const nonAttribuees = attributions.filter((a) => !a.filleul_id).length;

  function statsPourFilleul(filleulId) {
    const mesCommissions = commissions.filter((c) => c.filleul_id === filleulId);
    const ventesEnLigne = attributions.filter((a) => a.filleul_id === filleulId).length;
    const ventesStock = mesCommissions.filter((c) => c.source === "vente_stock").length;
    const mesVentes = ventesEnLigne + ventesStock;
    const ca = mesCommissions.reduce((s, c) => s + Number(c.montant_base || 0), 0);
    const commission = mesCommissions.reduce((s, c) => s + Number(c.montant_commission || 0), 0);
    const disponible = mesCommissions.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission), 0);
    const payee = mesCommissions.filter((c) => c.statut === "paid").reduce((s, c) => s + Number(c.montant_commission), 0);
    // Gains en tant que LEADER (parrain) : les commissions se trouvent sur les lignes de
    // vente de SES FILLEULS (leader_id = ce filleul), pas sur ses propres ventes.
    const commissionsCommeLeader = commissions.filter((c) => c.leader_id === filleulId);
    const gainsLeader = commissionsCommeLeader.reduce((s, c) => s + Number(c.montant_commission_leader || 0), 0);
    const gainsLeaderDisponibles = commissionsCommeLeader.filter((c) => c.statut === "validated" || c.statut === "available").reduce((s, c) => s + Number(c.montant_commission_leader || 0), 0);
    return { ventes: mesVentes, ca, commission, disponible, payee, gainsLeader, gainsLeaderDisponibles };
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18 };
  const label = { fontSize: 11, color: "#8A9089", marginBottom: 4 };
  const valeur = { fontSize: 20, fontWeight: 800, color: "#16231F" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F" }}>🟣 Mon Réseau</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationsBell workspace={workspace} />
          <button onClick={() => setShowAjout(true)} disabled={maxFilleuls != null && filleuls.length >= maxFilleuls} style={{ background: (maxFilleuls != null && filleuls.length >= maxFilleuls) ? "#DDD8CC" : "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: (maxFilleuls != null && filleuls.length >= maxFilleuls) ? "not-allowed" : "pointer" }}>
            + Ajouter un filleul
          </button>
        </div>
      </div>

      <RechercheGlobale workspace={workspace} onNaviguer={onNaviguer} />
      <ObjectifDuMois workspace={workspace} peutGerer={workspace.role === "owner" || workspace.role === "admin"} />
      <OnboardingReseau workspace={workspace} produits={produits} filleuls={filleuls} onNaviguer={onNaviguer} />
      <CentreAFaire workspace={workspace} onNaviguer={onNaviguer} />

      {maxFilleuls != null && filleuls.length >= maxFilleuls && (
        <div style={{ fontSize: 12, color: "#8A6412", background: "#FFF8E7", border: "1px solid #f5e2a9", borderRadius: 10, padding: "10px 14px", marginBottom: 12, lineHeight: 1.5 }}>
          ⚠️ Ton réseau atteint la limite de ton abonnement ({maxFilleuls} filleuls). Tes filleuls et tes données restent intacts, mais passe à un forfait supérieur pour continuer à en recruter de nouveaux.
        </div>
      )}

      {maxCommandesMois != null && commandesAttribueesCeMois >= maxCommandesMois && (
        <div style={{ fontSize: 12, color: "#8A6412", background: "#FFF8E7", border: "1px solid #f5e2a9", borderRadius: 10, padding: "10px 14px", marginBottom: 16, lineHeight: 1.5 }}>
          ⚠️ Ton réseau a atteint {commandesAttribueesCeMois} commandes attribuées ce mois-ci, la limite de ton abonnement ({maxCommandesMois}/mois). Les ventes continuent d'être enregistrées normalement, mais passe à un forfait supérieur pour lever cette limite.
        </div>
      )}

      {/* Vue générale */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
        <div style={carte}><div style={label}>Filleuls actifs</div><div style={valeur}>{filleulsActifs} / {filleuls.length}</div></div>
        <div style={carte}><div style={label}>CA réseau</div><div style={valeur}>{caReseau.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Commissions disponibles</div><div style={{ ...valeur, color: "#1a7a3c" }}>{commADisponibles.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Commissions payées</div><div style={valeur}>{commPayees.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Ventes non attribuées</div><div style={valeur}>{nonAttribuees}</div></div>
        <div style={carte}><div style={label}>Commandes réseau ce mois</div><div style={valeur}>{commandesAttribueesCeMois}{maxCommandesMois != null ? ` / ${maxCommandesMois}` : ""}</div></div>
        <div style={carte}><div style={label}>Valeur stock réseau</div><div style={valeur}>{valeurStockReseau.toLocaleString("fr-FR")} {currency}</div></div>
        <div style={carte}><div style={label}>Prospects actifs</div><div style={valeur}>{prospectsActifsCount}</div></div>
      </div>

      {/* Onglets */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ECE8DC" }}>
        {[{ key: "filleuls", label: "Filleuls" }, { key: "commissions", label: "💰 Commissions" }, { key: "produits", label: "🏷️ Commissions produits" }, { key: "prospects", label: "🎯 Prospects" }].map((o) => (
          <button key={o.key} onClick={() => { setOnglet(o.key); if (o.key === "prospects" && !prospectsCharges) chargerProspects(); }} style={{
            background: "none", border: "none", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            color: onglet === o.key ? "#1a7a3c" : "#8A9089",
            borderBottom: onglet === o.key ? "2px solid #1a7a3c" : "2px solid transparent", marginBottom: -1,
          }}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "filleuls" && (
        <>
          {filleuls.length > 1 && (
            <TopClassements filleuls={filleuls} commissions={commissions} produits={produits} currency={currency} statsPourFilleul={statsPourFilleul} workspace={workspace} />
          )}
          {filleuls.length > 3 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                placeholder="🔍 Rechercher un nom, un code, un téléphone..."
                value={rechercheFilleul}
                onChange={(e) => setRechercheFilleul(e.target.value)}
                style={{ flex: 1, boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 12.5 }}
              />
              <button onClick={() => exporterFilleulsCSV(filleuls, statsPourFilleul, currency)} style={{ background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                ⬇️ CSV
              </button>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {!chargement && filleuls.length === 0 && (
              <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>
                Aucun filleul pour l'instant. Clique sur « + Ajouter un filleul » pour créer le premier lien.
              </div>
            )}
            {filleuls
              .filter((f) => {
                if (!rechercheFilleul.trim()) return true;
                const q = rechercheFilleul.trim().toLowerCase();
                return (f.nom || "").toLowerCase().includes(q) || (f.code || "").toLowerCase().includes(q) || (f.telephone || "").toLowerCase().includes(q);
              })
              .map((f) => {
              const s = statsPourFilleul(f.id);
              return (
                <div key={f.id} onClick={() => setFilleulSelectionne(f)} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "14px 18px" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#16231F" }}>{f.est_pro && "⭐ "}{f.nom} <span style={{ color: "#8A9089", fontWeight: 500 }}>· {f.code}</span></div>
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
        </>
      )}

      {onglet === "commissions" && (
        <CommissionsPanel
          workspace={workspace}
          filleuls={filleuls}
          commissions={commissions}
          paiements={paiements}
          currency={currency}
          filtreStatut={filtreStatut}
          setFiltreStatut={setFiltreStatut}
          statsPourFilleul={statsPourFilleul}
          onPayer={(f) => setFilleulAPayer(f)}
        />
      )}

      {onglet === "produits" && (
        <ProduitsCommissionsPanel workspace={workspace} produits={produits} currency={currency} />
      )}

      {onglet === "prospects" && (
        <ProspectsPanel
          workspace={workspace}
          filleuls={filleuls}
          prospects={prospects}
          filtreStatut={filtreStatutProspect}
          setFiltreStatut={setFiltreStatutProspect}
          onAjouter={() => setShowAjoutProspect(true)}
          onSelectionner={(p) => setProspectSelectionne(p)}
        />
      )}

      {showAjoutProspect && (
        <AjoutProspectModal workspace={workspace} onClose={() => setShowAjoutProspect(false)} onCree={async () => { setShowAjoutProspect(false); await chargerProspects(); }} />
      )}

      {prospectSelectionne && (
        <FicheProspectModal
          prospect={prospectSelectionne}
          onClose={() => setProspectSelectionne(null)}
          onChange={async () => { await chargerProspects(); await onFilleulsChange?.(); }}
        />
      )}

      {showAjout && (
        <AjoutFilleulModal
          workspace={workspace}
          onClose={() => setShowAjout(false)}
          onCree={async () => { setShowAjout(false); await onFilleulsChange?.(); await charger(); }}
        />
      )}

      {filleulAPayer && (
        <EnregistrerPaiementModal
          filleul={filleulAPayer}
          workspace={workspace}
          montantDisponible={statsPourFilleul(filleulAPayer.id).disponible}
          currency={currency}
          onClose={() => setFilleulAPayer(null)}
          onPaye={async () => { setFilleulAPayer(null); await charger(); }}
        />
      )}

      {filleulSelectionne && (
        <FicheFilleulModal
          filleul={filleulSelectionne}
          filleuls={filleuls}
          produits={produits}
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
  const [email, setEmail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function creer() {
    if (!nom.trim()) { setErreur("Le nom est obligatoire."); return; }
    setEnCours(true);
    setErreur("");
    const { data: code, error: erreurCode } = await supabase.rpc("generer_code_filleul", { p_workspace_id: workspace.id, p_nom: nom.trim() });
    if (erreurCode || !code) { setErreur(erreurCode?.message || "Impossible de générer le code. Réessaie."); setEnCours(false); return; }

    const { data: filleulCree, error: erreurFilleul } = await supabase
      .from("filleuls")
      .insert([{ workspace_id: workspace.id, code, nom: nom.trim(), telephone: telephone.trim() || null, email: email.trim().toLowerCase() || null, statut: "actif" }])
      .select()
      .single();
    if (erreurFilleul || !filleulCree) { setErreur(erreurFilleul?.message || "Impossible de créer le filleul. Réessaie."); setEnCours(false); return; }

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
        <input placeholder="Email (pour lui donner accès à son espace plus tard)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        {erreur && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 10 }}>{erreur}</div>}
        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "Création..." : "Créer le filleul et son lien"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

function FicheFilleulModal({ filleul, filleuls, produits, stats, currency, workspace, onClose, onChange }) {
  const [enCours, setEnCours] = useState(false);
  const [parrainId, setParrainId] = useState(filleul.parrain_id || "");
  const [modeVente, setModeVente] = useState(filleul.mode_vente || "affilie");
  const [estPro, setEstPro] = useState(filleul.est_pro || false);
  const [stock, setStock] = useState([]);
  const [chargeStock, setChargeStock] = useState(true);
  const [produitAchatId, setProduitAchatId] = useState("");
  const [quantiteAchat, setQuantiteAchat] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [erreurStock, setErreurStock] = useState("");
  const [produitVenteId, setProduitVenteId] = useState("");
  const [quantiteVente, setQuantiteVente] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [erreurVente, setErreurVente] = useState("");
  const [enCoursVente, setEnCoursVente] = useState(false);
  const [venteFaite, setVenteFaite] = useState(false);
  const [ecole, setEcole] = useState(null);

  useEffect(() => {
    async function chargerEcole() {
      const [{ count: totalCours }, { data: progression }] = await Promise.all([
        supabase.from("ecole_cours").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("actif", true),
        supabase.from("ecole_progression").select("statut").eq("filleul_id", filleul.id),
      ]);
      const termines = (progression || []).filter((p) => p.statut === "completed").length;
      setEcole({ total: totalCours || 0, termines });
    }
    chargerEcole();
  }, [filleul.id, workspace.id]);

  const [origineRecrutement, setOrigineRecrutement] = useState(undefined);
  const [analyticsRecruteur, setAnalyticsRecruteur] = useState(null);

  useEffect(() => {
    async function chargerRecrutement() {
      // Origine (§33 — profil 360°) : ce filleul est-il lui-même arrivé via le
      // tunnel de recrutement ? Recherche via le prospect devenu ce filleul.
      const { data: prospect } = await supabase.from("filleuls_prospects").select("id, created_at").eq("devenu_filleul_id", filleul.id).maybeSingle();
      if (prospect) {
        const { data: commande } = await supabase.from("recrutement_commandes_pack").select("pack_nom_snapshot, statut_activation, activation_at").eq("prospect_id", prospect.id).maybeSingle();
        setOrigineRecrutement({ candidature_at: prospect.created_at, pack: commande?.pack_nom_snapshot, activation_at: commande?.activation_at });
      } else {
        setOrigineRecrutement(null);
      }

      // Ce que CE filleul a généré comme recruteur (§20 — analytics par recruteur)
      const [{ count: visites }, { count: candidatures }] = await Promise.all([
        supabase.from("recrutement_visites_tunnel").select("id", { count: "exact", head: true }).eq("recruteur_filleul_id", filleul.id),
        supabase.from("filleuls_prospects").select("id", { count: "exact", head: true }).eq("recruteur_filleul_id", filleul.id),
      ]);
      if ((visites || 0) > 0 || (candidatures || 0) > 0) {
        setAnalyticsRecruteur({ visites: visites || 0, candidatures: candidatures || 0 });
      }
    }
    chargerRecrutement();
  }, [filleul.id, workspace.id]);

  async function enregistrerVente() {
    if (!produitVenteId || !quantiteVente || Number(quantiteVente) <= 0 || !prixVente) {
      setErreurVente("Choisis un produit, une quantité et un prix de vente.");
      return;
    }
    setErreurVente("");
    setEnCoursVente(true);
    const { error } = await supabase.rpc("enregistrer_vente_stock_filleul", {
      p_workspace_id: workspace.id,
      p_filleul_id: filleul.id,
      p_produit_id: produitVenteId,
      p_quantite: Number(quantiteVente),
      p_prix_vente_unitaire: Number(prixVente),
      p_note: "Vente enregistrée par le propriétaire",
    });
    setEnCoursVente(false);
    if (error) { setErreurVente(error.message || "Échec de l'enregistrement de la vente."); return; }
    setProduitVenteId(""); setQuantiteVente(""); setPrixVente("");
    setVenteFaite(true);
    setTimeout(() => setVenteFaite(false), 2500);
    await chargerStock();
    await onChange();
  }
  const [coachings, setCoachings] = useState([]);
  const [suggestionIA, setSuggestionIA] = useState(null);
  const [chargementSuggestion, setChargementSuggestion] = useState(false);
  const [erreurSuggestion, setErreurSuggestion] = useState("");
  const [noteCoaching, setNoteCoaching] = useState("");
  const [enCoursCoaching, setEnCoursCoaching] = useState(false);
  const [showPaiementLeader, setShowPaiementLeader] = useState(false);

  async function chargerCoachings() {
    const { data } = await supabase.from("filleuls_coachings").select("*").eq("filleul_id", filleul.id).order("created_at", { ascending: false });
    setCoachings(data || []);
  }
  useEffect(() => { chargerCoachings(); }, [filleul.id]);

  async function ajouterCoaching() {
    if (!noteCoaching.trim()) return;
    setEnCoursCoaching(true);
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("filleuls_coachings").insert([{ workspace_id: workspace.id, filleul_id: filleul.id, note: noteCoaching.trim(), cree_par: sessionData?.session?.user?.id || null }]);
    setNoteCoaching("");
    await chargerCoachings();
    setEnCoursCoaching(false);
  }

  async function demanderSuggestionIA() {
    setChargementSuggestion(true);
    setErreurSuggestion("");
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const reponse = await fetch("/api/admin-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "suggerer_coaching_filleul", filleul_id: filleul.id, workspace_id: workspace.id }),
      });
      const json = await reponse.json();
      if (!reponse.ok) { setErreurSuggestion(json?.error || "Échec de la suggestion."); setChargementSuggestion(false); return; }
      setSuggestionIA(json);
    } catch (e) {
      setErreurSuggestion("Erreur réseau, réessaie.");
    }
    setChargementSuggestion(false);
  }

  async function chargerStock() {
    setChargeStock(true);
    const { data } = await supabase.from("filleuls_stock").select("*, produits(nom)").eq("filleul_id", filleul.id).gt("quantite_restante", 0);
    setStock(data || []);
    setChargeStock(false);
  }

  useEffect(() => {
    if (modeVente === "revendeur") chargerStock();
  }, [filleul.id, modeVente]);

  const [cleAchat, setCleAchat] = useState(() => crypto.randomUUID());

  async function enregistrerAchat() {
    if (!produitAchatId || !quantiteAchat || Number(quantiteAchat) <= 0) { setErreurStock("Choisis un produit et une quantité."); return; }
    setErreurStock("");
    setEnCours(true);
    const produitChoisi = (produits || []).find((p) => p.id === produitAchatId);
    const { error } = await supabase.rpc("enregistrer_mouvement_stock_filleul", {
      p_workspace_id: workspace.id,
      p_filleul_id: filleul.id,
      p_produit_id: produitAchatId,
      p_type: "achat",
      p_quantite: Number(quantiteAchat),
      p_prix_unitaire: prixAchat ? Number(prixAchat) : Number(produitChoisi?.cout_achat || 0),
      p_commande_id: null,
      p_note: "Achat enregistré depuis la fiche filleul",
      p_idempotency_key: cleAchat,
    });
    setEnCours(false);
    // Même en cas d'erreur réseau, on garde la MÊME clé pour le prochain essai — c'est
    // justement ce qui rend le retry sûr (voir §48). Elle n'est renouvelée qu'après un succès.
    if (error) { setErreurStock(error.message || "Échec de l'enregistrement."); return; }
    setProduitAchatId(""); setQuantiteAchat(""); setPrixAchat(""); setCleAchat(crypto.randomUUID());
    await chargerStock();
  }

  async function basculerStatut() {
    setEnCours(true);
    await supabase.from("filleuls").update({ statut: filleul.statut === "actif" ? "suspendu" : "actif", updated_at: new Date().toISOString() }).eq("id", filleul.id);
    setEnCours(false);
    onChange();
    onClose();
  }

  async function enregistrerParrainEtMode() {
    setEnCours(true);
    await supabase.from("filleuls").update({
      parrain_id: parrainId || null,
      mode_vente: modeVente,
      est_pro: estPro,
      updated_at: new Date().toISOString(),
    }).eq("id", filleul.id);
    setEnCours(false);
    onChange();
  }

  const autresFilleuls = (filleuls || []).filter((f) => f.id !== filleul.id);
  const parrainActuel = (filleuls || []).find((f) => f.id === filleul.parrain_id);

  const domaine = workspace.domaine_personnalise || `${workspace.slug || ""}.recuvente.com`;
  const lien = `https://${domaine}?ref=${filleul.code}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#16231F" }}>{filleul.nom}</div>
        <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 4 }}>{filleul.code} · {filleul.telephone || "sans téléphone"}</div>
        {parrainActuel && <div style={{ fontSize: 11, color: "#6b3fd4", marginBottom: 16 }}>👤 Parrainé par {parrainActuel.nom}</div>}
        {!parrainActuel && <div style={{ marginBottom: 16 }} />}

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Lien de vente</div>
        <div style={{ fontSize: 12, fontWeight: 700, wordBreak: "break-all", marginBottom: 16, background: "#F7FAF7", padding: "8px 10px", borderRadius: 8 }}>{lien}</div>

        {!filleul.user_id && (
          <div style={{ fontSize: 11.5, color: "#8A6412", background: "#FFF8E7", border: "1px solid #f5e2a9", borderRadius: 9, padding: "9px 11px", marginBottom: 16, lineHeight: 1.5 }}>
            ⚠️ {filleul.nom} n'a pas encore accès à son espace personnel. Va dans <b>Équipe → Inviter quelqu'un</b>, avec l'email <b>{filleul.email || "(ajoute d'abord son email)"}</b> et le rôle <b>Filleul</b> — il pourra alors se connecter et voir ses ventes/commissions.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Ventes</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.ventes}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>CA généré</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.ca.toLocaleString("fr-FR")} {currency}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Commission dispo.</div><div style={{ fontSize: 16, fontWeight: 800, color: "#1a7a3c" }}>{stats.disponible.toLocaleString("fr-FR")} {currency}</div></div>
          <div><div style={{ fontSize: 10.5, color: "#8A9089" }}>Déjà payé</div><div style={{ fontSize: 16, fontWeight: 800 }}>{stats.payee.toLocaleString("fr-FR")} {currency}</div></div>
        </div>

        {ecole && ecole.total > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F7FAF7", borderRadius: 10, padding: "9px 14px", marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, color: "#16231F", fontWeight: 700 }}>🎓 Formation</div>
            <div style={{ fontSize: 12, color: ecole.termines === ecole.total ? "#1a7a3c" : "#8A9089", fontWeight: 700 }}>{ecole.termines}/{ecole.total} cours terminés</div>
          </div>
        )}

        {origineRecrutement && (
          <div style={{ fontSize: 11, color: "#5b3ba8", background: "#f0ecfb", borderRadius: 10, padding: "9px 14px", marginBottom: 18, lineHeight: 1.6 }}>
            📋 Arrivé via le tunnel de recrutement le {new Date(origineRecrutement.candidature_at).toLocaleDateString("fr-FR")}
            {origineRecrutement.pack ? ` · Pack "${origineRecrutement.pack}"` : ""}
            {origineRecrutement.activation_at ? ` · Activé le ${new Date(origineRecrutement.activation_at).toLocaleDateString("fr-FR")}` : ""}
          </div>
        )}

        {analyticsRecruteur && (
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, background: "#F7FAF7", borderRadius: 10, padding: "9px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#16231F" }}>{analyticsRecruteur.visites}</div>
              <div style={{ fontSize: 10, color: "#8A9089" }}>👀 visites générées</div>
            </div>
            <div style={{ flex: 1, background: "#F7FAF7", borderRadius: 10, padding: "9px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#16231F" }}>{analyticsRecruteur.candidatures}</div>
              <div style={{ fontSize: 10, color: "#8A9089" }}>📝 candidatures apportées</div>
            </div>
          </div>
        )}

        {stats.gainsLeader > 0 && (
          <div style={{ background: "#f0ecfb", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stats.gainsLeaderDisponibles > 0 ? 8 : 0 }}>
              <div style={{ fontSize: 11.5, color: "#5b3ba8", fontWeight: 700 }}>👑 Gains comme parrain</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#5b3ba8" }}>{stats.gainsLeaderDisponibles.toLocaleString("fr-FR")} {currency} dispo.</div>
            </div>
            {stats.gainsLeaderDisponibles > 0 && (
              <button onClick={() => setShowPaiementLeader(true)} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                Enregistrer un paiement (parrain)
              </button>
            )}
          </div>
        )}

        {showPaiementLeader && (
          <EnregistrerPaiementModal
            filleul={filleul}
            workspace={workspace}
            montantDisponible={stats.gainsLeaderDisponibles}
            currency={currency}
            cible="leader"
            onClose={() => setShowPaiementLeader(false)}
            onPaye={async () => { setShowPaiementLeader(false); await onChange(); }}
          />
        )}

        <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>Parrainage & mode de vente</div>
          <label style={{ fontSize: 10.5, color: "#8A9089" }}>Parrain (qui l'a recruté)</label>
          <select value={parrainId} onChange={(e) => setParrainId(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginTop: 3, marginBottom: 10 }}>
            <option value="">Aucun (recruté directement par le propriétaire)</option>
            {autresFilleuls.map((f) => <option key={f.id} value={f.id}>{f.nom} · {f.code}</option>)}
          </select>
          <label style={{ fontSize: 10.5, color: "#8A9089" }}>Mode de vente</label>
          <select value={modeVente} onChange={(e) => setModeVente(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginTop: 3, marginBottom: 10 }}>
            <option value="affilie">Affilié — vend via son lien, reçoit une commission</option>
            <option value="revendeur">Revendeur — achète du stock, revend avec sa propre marge</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#16231F", marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={estPro} onChange={(e) => setEstPro(e.target.checked)} />
            ⭐ Filleul PRO
          </label>
          <button onClick={enregistrerParrainEtMode} disabled={enCours} style={{ width: "100%", background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            Enregistrer
          </button>
        </div>

        {(() => {
          // Lignée complète (§21 — architecture multi-niveaux, visibilité uniquement,
          // aucun calcul de commission en cascade activé). Remonte la chaîne parrain_id
          // jusqu'en haut, avec une garde anti-boucle infinie au cas où.
          const lignee = [];
          let courant = filleul;
          let securite = 0;
          while (courant?.parrain_id && securite < 20) {
            const parent = filleuls.find((f) => f.id === courant.parrain_id);
            if (!parent || lignee.some((l) => l.id === parent.id)) break;
            lignee.push(parent);
            courant = parent;
            securite++;
          }
          if (lignee.length === 0) return null;
          return (
            <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>🔗 Lignée</div>
              <div style={{ fontSize: 11.5, color: "#6B7168", lineHeight: 1.8 }}>
                {[...lignee].reverse().map((l) => l.nom).join(" → ")} → <strong>{filleul.nom}</strong>
              </div>
            </div>
          );
        })()}

        {(() => {
          const recrues = (filleuls || []).filter((f) => f.parrain_id === filleul.id);
          if (recrues.length === 0) return null;
          return (
            <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>👥 A recruté ({recrues.length})</div>
              {recrues.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0" }}>
                  <span>{r.nom}</span>
                  <span style={{ color: r.statut === "actif" ? "#1a7a3c" : "#8A9089" }}>{r.statut === "actif" ? "✅" : "⏸️"}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {modeVente === "revendeur" && (
          <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>📦 Stock personnel</div>
            {chargeStock && <div style={{ fontSize: 11, color: "#8A9089" }}>Chargement...</div>}
            {!chargeStock && stock.length === 0 && <div style={{ fontSize: 11, color: "#8A9089" }}>Aucun stock pour l'instant.</div>}
            {stock.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "4px 0" }}>
                <span>{s.produits?.nom || "Produit"}</span>
                <span style={{ fontWeight: 700 }}>{s.quantite_restante} restant{s.quantite_restante > 1 ? "s" : ""}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid #ECE8DC", marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 10.5, color: "#8A9089", marginBottom: 6 }}>+ Enregistrer un achat à la base</div>
              <select value={produitAchatId} onChange={(e) => setProduitAchatId(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5, marginBottom: 6 }}>
                <option value="">Produit...</option>
                {(produits || []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input type="number" placeholder="Quantité" value={quantiteAchat} onChange={(e) => setQuantiteAchat(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                <input type="number" placeholder="Prix unit. (optionnel)" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
              </div>
              {erreurStock && <div style={{ fontSize: 10.5, color: "#D64933", marginBottom: 6 }}>{erreurStock}</div>}
              <button onClick={enregistrerAchat} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Enregistrer l'achat
              </button>
            </div>

            {stock.length > 0 && (
              <div style={{ borderTop: "1px solid #ECE8DC", marginTop: 12, paddingTop: 8 }}>
                <div style={{ fontSize: 10.5, color: "#6b3fd4", marginBottom: 6 }}>+ Enregistrer une vente (depuis son stock)</div>
                <select value={produitVenteId} onChange={(e) => setProduitVenteId(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5, marginBottom: 6 }}>
                  <option value="">Produit vendu...</option>
                  {stock.map((s) => <option key={s.produit_id} value={s.produit_id}>{s.produits?.nom} ({s.quantite_restante} dispo.)</option>)}
                </select>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input type="number" placeholder="Quantité" value={quantiteVente} onChange={(e) => setQuantiteVente(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                  <input type="number" placeholder="Prix de vente unit." value={prixVente} onChange={(e) => setPrixVente(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                </div>
                {erreurVente && <div style={{ fontSize: 10.5, color: "#D64933", marginBottom: 6 }}>{erreurVente}</div>}
                <button onClick={enregistrerVente} disabled={enCoursVente} style={{ width: "100%", background: venteFaite ? "#EAF3DE" : "#6b3fd4", color: venteFaite ? "#1a7a3c" : "white", border: "none", borderRadius: 7, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {enCoursVente ? "..." : venteFaite ? "✅ Vente enregistrée" : "Enregistrer la vente"}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>🎓 Coaching</div>

          <button onClick={demanderSuggestionIA} disabled={chargementSuggestion} style={{ width: "100%", background: "#f0ecfb", color: "#5b3ba8", border: "1px dashed #d9c9f7", borderRadius: 8, padding: "8px 0", fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
            {chargementSuggestion ? "Analyse en cours..." : "🤖 Suggérer un sujet de coaching (IA, sur données réelles)"}
          </button>
          {erreurSuggestion && <div style={{ fontSize: 10.5, color: "#D64933", marginBottom: 8 }}>{erreurSuggestion}</div>}
          {suggestionIA && (
            <div style={{ background: "#faf7ff", border: "1px solid #e8ddfb", borderRadius: 8, padding: "9px 11px", marginBottom: 8, fontSize: 11 }}>
              <div style={{ color: "#5b3ba8", marginBottom: 6 }}>{suggestionIA.diagnostic}</div>
              {(suggestionIA.sujets_coaching || []).map((s, i) => (
                <div key={i} onClick={() => setNoteCoaching(s)} style={{ cursor: "pointer", color: "#16231F", padding: "3px 0" }}>• {s}</div>
              ))}
              <div style={{ fontSize: 9.5, color: "#8A9089", marginTop: 4 }}>Clique un sujet pour le reprendre dans ta note ci-dessous.</div>
            </div>
          )}

          <textarea placeholder="Note de coaching (visible par le filleul)..." value={noteCoaching} onChange={(e) => setNoteCoaching(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 8, resize: "vertical" }} />
          <button onClick={ajouterCoaching} disabled={enCoursCoaching} style={{ width: "100%", background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
            Ajouter la note
          </button>
          {coachings.map((c) => (
            <div key={c.id} style={{ fontSize: 11, background: "#F7FAF7", borderRadius: 7, padding: "6px 9px", marginBottom: 5 }}>
              {c.note}
              <div style={{ fontSize: 9.5, color: "#8A9089", marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
            </div>
          ))}
        </div>

        <button onClick={basculerStatut} disabled={enCours} style={{ width: "100%", background: filleul.statut === "actif" ? "#FBEAEA" : "#EAF3DE", color: filleul.statut === "actif" ? "#D64933" : "#1a7a3c", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          {filleul.statut === "actif" ? "⏸️ Suspendre ce filleul" : "✅ Réactiver ce filleul"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

// Centre de commissions (§30 de la mission) : filtre par statut, et un
// récapitulatif par filleul avec bouton "Enregistrer un paiement" quand
// une commission est disponible.
function CommissionsPanel({ workspace, filleuls, commissions, paiements, currency, filtreStatut, setFiltreStatut, statsPourFilleul, onPayer }) {
  const filtres = [
    { key: "toutes", label: "Toutes" },
    { key: "pending", label: "⏳ En attente" },
    { key: "validated", label: "✅ Validées" },
    { key: "paid", label: "✔️ Payées" },
    { key: "cancelled", label: "❌ Annulées" },
  ];
  const commissionsFiltrees = filtreStatut === "toutes" ? commissions : commissions.filter((c) => c.statut === filtreStatut);
  const statutLabel = { pending: "⏳ En attente", validated: "✅ Validée", available: "💰 Disponible", paid: "✔️ Payée", cancelled: "❌ Annulée", reversed: "↩️ Reversée" };
  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18 };

  const filleulsAvecDisponible = filleuls
    .map((f) => ({ filleul: f, disponible: statsPourFilleul(f.id).disponible }))
    .filter((x) => x.disponible > 0);

  return (
    <div>
      {filleulsAvecDisponible.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>À payer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filleulsAvecDisponible.map(({ filleul, disponible }) => (
              <div key={filleul.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{filleul.nom}</div>
                  <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700 }}>{disponible.toLocaleString("fr-FR")} {currency} disponible</div>
                </div>
                <button onClick={() => onPayer(filleul)} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Enregistrer un paiement
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {filtres.map((f) => (
          <button key={f.key} onClick={() => setFiltreStatut(f.key)} style={{
            border: `1px solid ${filtreStatut === f.key ? "#1a7a3c" : "#ECE8DC"}`,
            background: filtreStatut === f.key ? "#EAF3DE" : "white",
            color: filtreStatut === f.key ? "#1a7a3c" : "#6B7168",
            borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {commissionsFiltrees.length === 0 && (
          <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucune commission dans ce filtre.</div>
        )}
        {commissionsFiltrees.slice(0, 100).map((c) => {
          const filleul = filleuls.find((f) => f.id === c.filleul_id);
          return (
            <div key={c.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>{filleul?.nom || "Filleul supprimé"}</div>
                <div style={{ fontSize: 10.5, color: "#8A9089" }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#16231F" }}>{Number(c.montant_commission).toLocaleString("fr-FR")} {currency}</div>
                <div style={{ fontSize: 10.5 }}>{statutLabel[c.statut] || c.statut}</div>
              </div>
            </div>
          );
        })}
      </div>

      {paiements.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>Historique des paiements</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paiements.slice(0, 30).map((p) => {
              const filleul = filleuls.find((f) => f.id === p.filleul_id);
              return (
                <div key={p.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{filleul?.nom || "—"}</div>
                    <div style={{ fontSize: 10.5, color: "#8A9089" }}>{new Date(p.paye_le).toLocaleDateString("fr-FR")} · {p.methode || "—"}{p.reference ? ` · ${p.reference}` : ""}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{Number(p.montant).toLocaleString("fr-FR")} {currency}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EnregistrerPaiementModal({ filleul, workspace, montantDisponible, currency, onClose, onPaye, cible = "filleul" }) {
  const estLeader = cible === "leader";
  const [montant, setMontant] = useState(String(montantDisponible));
  const [methode, setMethode] = useState("mobile_money");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function enregistrer() {
    const montantNombre = Number(montant);
    if (!montantNombre || montantNombre <= 0) { setErreur("Montant invalide."); return; }
    setEnCours(true);
    setErreur("");

    const { data: sessionData } = await supabase.auth.getSession();

    const { error: erreurPaiement } = await supabase.from("filleuls_paiements_commissions").insert([{
      workspace_id: workspace.id,
      filleul_id: filleul.id,
      montant: montantNombre,
      methode,
      reference: reference.trim() || null,
      note: note.trim() || null,
      cree_par: sessionData?.session?.user?.id || null,
      type_paiement: cible,
    }]);
    if (erreurPaiement) { setErreur(erreurPaiement.message || "Impossible d'enregistrer le paiement."); setEnCours(false); return; }

    // Marque les commissions disponibles comme payées, de la plus ancienne à la plus
    // récente, jusqu'à couverture du montant versé. Pour la part leader, on filtre sur
    // leader_id + statut_leader (des lignes appartenant à d'AUTRES filleuls, ceux que
    // ce leader a parrainés) plutôt que filleul_id + statut.
    const requete = estLeader
      ? supabase.from("filleuls_commissions").select("id, montant_commission_leader").eq("leader_id", filleul.id).in("statut_leader", ["validated", "available"]).order("created_at", { ascending: true })
      : supabase.from("filleuls_commissions").select("id, montant_commission").eq("filleul_id", filleul.id).in("statut", ["validated", "available"]).order("created_at", { ascending: true });
    const { data: commissionsDisponibles } = await requete;

    let reste = montantNombre;
    const idsAPayer = [];
    for (const c of commissionsDisponibles || []) {
      if (reste <= 0) break;
      idsAPayer.push(c.id);
      reste -= Number(estLeader ? c.montant_commission_leader : c.montant_commission);
    }
    if (idsAPayer.length > 0) {
      const maj = estLeader
        ? { statut_leader: "paid", updated_at: new Date().toISOString() }
        : { statut: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      await supabase.from("filleuls_commissions").update(maj).in("id", idsAPayer);
    }

    setEnCours(false);
    onPaye();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#16231F" }}>Paiement — {filleul.nom} {estLeader ? "(gains parrain)" : ""}</div>
        <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 14 }}>{montantDisponible.toLocaleString("fr-FR")} {currency} disponible</div>

        <input type="number" placeholder="Montant" value={montant} onChange={(e) => setMontant(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        <select value={methode} onChange={(e) => setMethode(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }}>
          <option value="mobile_money">Mobile Money</option>
          <option value="especes">Espèces</option>
          <option value="virement">Virement</option>
          <option value="autre">Autre</option>
        </select>
        <input placeholder="Référence (optionnel)" value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        <textarea placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />
        {erreur && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 10 }}>{erreur}</div>}

        <button onClick={enregistrer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "Enregistrement..." : "✅ Confirmer le paiement"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

// Configuration de la commission par produit (§11 de la mission). Volontairement
// séparé du gros formulaire produit existant dans App-complet.jsx — pour ne pas
// toucher à un composant déjà massif — mais entièrement intégré dans "🟣 Réseau",
// pas un écran à part : c'est un onglet de plus, comme Filleuls/Commissions.
function ProduitsCommissionsPanel({ workspace, produits, currency }) {
  const [lignes, setLignes] = useState(() =>
    Object.fromEntries((produits || []).map((p) => [p.id, {
      commission_type: p.commission_type || "pourcentage",
      commission_valeur: p.commission_valeur != null ? String(p.commission_valeur) : "",
      commission_leader_type: p.commission_leader_type || "pourcentage",
      commission_leader_valeur: p.commission_leader_valeur != null ? String(p.commission_leader_valeur) : "",
    }]))
  );
  const [enregistrement, setEnregistrement] = useState({});
  const [confirmes, setConfirmes] = useState({});
  const [erreurs, setErreurs] = useState({});

  function majLigne(produitId, champ, valeur) {
    setLignes((l) => ({ ...l, [produitId]: { ...l[produitId], [champ]: valeur } }));
    setConfirmes((c) => ({ ...c, [produitId]: false }));
    setErreurs((e) => ({ ...e, [produitId]: "" }));
  }

  async function enregistrer(produitId) {
    const ligne = lignes[produitId];
    const valeurNombre = Number(ligne.commission_valeur);
    if (!ligne.commission_valeur || isNaN(valeurNombre) || valeurNombre < 0) return;
    setEnregistrement((e) => ({ ...e, [produitId]: true }));
    setErreurs((e) => ({ ...e, [produitId]: "" }));
    const majLeader = ligne.commission_leader_valeur && !isNaN(Number(ligne.commission_leader_valeur))
      ? { commission_leader_type: ligne.commission_leader_type, commission_leader_valeur: Number(ligne.commission_leader_valeur) }
      : { commission_leader_type: null, commission_leader_valeur: null };
    const { error } = await supabase
      .from("produits")
      .update({ commission_type: ligne.commission_type, commission_valeur: valeurNombre, ...majLeader })
      .eq("id", produitId)
      .eq("workspace_id", workspace.id);
    setEnregistrement((e) => ({ ...e, [produitId]: false }));
    if (error) {
      setErreurs((e) => ({ ...e, [produitId]: error.message || "Échec de l'enregistrement." }));
      return;
    }
    setConfirmes((c) => ({ ...c, [produitId]: true }));
    setTimeout(() => setConfirmes((c) => ({ ...c, [produitId]: false })), 1800);
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  if (!produits || produits.length === 0) {
    return (
      <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>
        Aucun produit dans cette boutique pour l'instant. Ajoute des produits dans « 📦 Produits », puis reviens ici définir leur commission.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 12, lineHeight: 1.5 }}>
        Définis la commission que touche un filleul sur chaque produit vendu via son lien. Un produit sans commission configurée ne génère aucune commission (mais la vente reste normalement attribuée).
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {produits.map((p) => {
          const ligne = lignes[p.id] || { commission_type: "pourcentage", commission_valeur: "" };
          const exemple = ligne.commission_valeur
            ? ligne.commission_type === "pourcentage"
              ? `≈ ${Math.round((Number(p.prix_vente || p.prix || 0) * Number(ligne.commission_valeur)) / 100).toLocaleString("fr-FR")} ${currency} / vente`
              : `${Number(ligne.commission_valeur).toLocaleString("fr-FR")} ${currency} / unité`
            : null;
          return (
            <div key={p.id} style={{ ...carte, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 140, flex: "1 1 160px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{p.nom}</div>
                  <div style={{ fontSize: 11, color: "#8A9089" }}>{Number(p.prix_vente || p.prix || 0).toLocaleString("fr-FR")} {currency}</div>
                </div>
                <span style={{ fontSize: 10.5, color: "#8A9089", width: 60 }}>Filleul</span>
                <select
                  value={ligne.commission_type}
                  onChange={(e) => majLigne(p.id, "commission_type", e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }}
                >
                  <option value="pourcentage">%</option>
                  <option value="montant_fixe">Montant fixe</option>
                </select>
                <input
                  type="number"
                  placeholder={ligne.commission_type === "pourcentage" ? "10" : "2000"}
                  value={ligne.commission_valeur}
                  onChange={(e) => majLigne(p.id, "commission_valeur", e.target.value)}
                  style={{ width: 90, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }}
                />
                {exemple && <div style={{ fontSize: 10.5, color: "#8A9089" }}>{exemple}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingLeft: 150 }}>
                <span style={{ fontSize: 10.5, color: "#6b3fd4", width: 60 }}>👑 Leader</span>
                <select
                  value={ligne.commission_leader_type}
                  onChange={(e) => majLigne(p.id, "commission_leader_type", e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }}
                >
                  <option value="pourcentage">%</option>
                  <option value="montant_fixe">Montant fixe</option>
                </select>
                <input
                  type="number"
                  placeholder="optionnel"
                  value={ligne.commission_leader_valeur}
                  onChange={(e) => majLigne(p.id, "commission_leader_valeur", e.target.value)}
                  style={{ width: 90, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12 }}
                />
                <button
                  onClick={() => enregistrer(p.id)}
                  disabled={enregistrement[p.id]}
                  style={{
                    background: confirmes[p.id] ? "#EAF3DE" : "#1a7a3c", color: confirmes[p.id] ? "#1a7a3c" : "white",
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {enregistrement[p.id] ? "..." : confirmes[p.id] ? "✅ Enregistré" : "Enregistrer"}
                </button>
              </div>
              {erreurs[p.id] && <div style={{ fontSize: 10.5, color: "#D64933", paddingLeft: 150 }}>⚠️ {erreurs[p.id]}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Classements (§27-29 de la mission) : top vendeurs et top produits, calculés
// à partir des commissions déjà chargées — pas de requête supplémentaire.
// V1 volontairement simple : toutes périodes confondues, sans filtre de date.
function TopClassements({ filleuls, commissions, produits, currency, statsPourFilleul, workspace }) {
  const [candidaturesParRecruteur, setCandidaturesParRecruteur] = useState(null);

  useEffect(() => {
    if (!workspace?.id) return;
    supabase.from("filleuls_prospects").select("recruteur_filleul_id").eq("workspace_id", workspace.id).not("recruteur_filleul_id", "is", null)
      .then(({ data }) => {
        const compte = {};
        (data || []).forEach((p) => { compte[p.recruteur_filleul_id] = (compte[p.recruteur_filleul_id] || 0) + 1; });
        setCandidaturesParRecruteur(compte);
      });
  }, [workspace?.id]);

  const topFilleuls = [...filleuls]
    .map((f) => ({ filleul: f, ventes: statsPourFilleul(f.id).ventes }))
    .filter((x) => x.ventes > 0)
    .sort((a, b) => b.ventes - a.ventes)
    .slice(0, 5);

  const topRecruteurs = candidaturesParRecruteur
    ? Object.entries(candidaturesParRecruteur)
        .map(([filleulId, n]) => ({ filleul: filleuls.find((f) => f.id === filleulId), n }))
        .filter((x) => x.filleul)
        .sort((a, b) => b.n - a.n)
        .slice(0, 5)
    : [];

  const parProduit = {};
  for (const c of commissions) {
    if (!c.produit_id) continue;
    if (!parProduit[c.produit_id]) parProduit[c.produit_id] = { ventes: 0, ca: 0 };
    parProduit[c.produit_id].ventes += 1;
    parProduit[c.produit_id].ca += Number(c.montant_base || 0);
  }
  const topProduits = Object.entries(parProduit)
    .map(([produitId, stats]) => ({ produit: produits?.find((p) => p.id === produitId), ...stats }))
    .filter((x) => x.produit)
    .sort((a, b) => b.ventes - a.ventes)
    .slice(0, 5);

  if (topFilleuls.length === 0 && topProduits.length === 0 && topRecruteurs.length === 0) return null;

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginBottom: 16 }}>
      {topFilleuls.length > 0 && (
        <div style={carte}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>🏆 Top vendeurs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topFilleuls.map((x, i) => (
              <div key={x.filleul.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{i + 1}. {x.filleul.nom}</span>
                <span style={{ fontWeight: 700 }}>{x.ventes} vente{x.ventes > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {topRecruteurs.length > 0 && (
        <div style={carte}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>👑 Top recruteurs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topRecruteurs.map((x, i) => (
              <div key={x.filleul.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{i + 1}. {x.filleul.nom}</span>
                <span style={{ fontWeight: 700 }}>{x.n} candidature{x.n > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {topProduits.length > 0 && (
        <div style={carte}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#16231F", marginBottom: 10 }}>🔥 Top produits (réseau)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topProduits.map((x, i) => (
              <div key={x.produit.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{i + 1}. {x.produit.nom}</span>
                <span style={{ fontWeight: 700 }}>{x.ventes} vente{x.ventes > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Onglet Prospects (§12-13 de la mission) : la partie amont du parcours filleul,
// avant même l'inscription — prospection, relances, conversion.
function ProspectsPanel({ workspace, filleuls, prospects, filtreStatut, setFiltreStatut, onAjouter, onSelectionner }) {
  const statuts = [
    { key: "toutes", label: "Tous" }, { key: "nouveau", label: "Nouveau" }, { key: "contacte", label: "Contacté" },
    { key: "presente", label: "Présenté" }, { key: "suivi", label: "En suivi" }, { key: "inscrit", label: "Inscrit" }, { key: "perdu", label: "Perdu" },
  ];
  const statutLabel = { nouveau: "🆕 Nouveau", contacte: "📞 Contacté", presente: "🗣️ Présenté", suivi: "🔄 En suivi", inscrit: "✅ Inscrit", perdu: "❌ Perdu" };
  const prospectsFiltres = filtreStatut === "toutes" ? prospects : prospects.filter((p) => p.statut === filtreStatut);
  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {statuts.map((s) => (
            <button key={s.key} onClick={() => setFiltreStatut(s.key)} style={{
              border: `1px solid ${filtreStatut === s.key ? "#6b3fd4" : "#ECE8DC"}`,
              background: filtreStatut === s.key ? "#f0ecfb" : "white",
              color: filtreStatut === s.key ? "#5b3ba8" : "#6B7168",
              borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
            }}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={onAjouter} style={{ background: "#6b3fd4", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          + Prospect
        </button>
      </div>

      {prospectsFiltres.length === 0 && <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Aucun prospect dans ce filtre.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {prospectsFiltres.map((p) => {
          const prospecteur = filleuls.find((f) => f.id === p.prospecte_par_filleul_id);
          return (
            <div key={p.id} onClick={() => onSelectionner(p)} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: "12px 16px" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{p.nom}</div>
                <div style={{ fontSize: 11, color: "#8A9089" }}>{p.telephone || "—"} {prospecteur ? `· prospecté par ${prospecteur.nom}` : ""}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{statutLabel[p.statut] || p.statut}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AjoutProspectModal({ workspace, onClose, onCree }) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [source, setSource] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function creer() {
    if (!nom.trim()) return;
    setEnCours(true);
    await supabase.from("filleuls_prospects").insert([{ workspace_id: workspace.id, nom: nom.trim(), telephone: telephone.trim() || null, source: source.trim() || null }]);
    setEnCours(false);
    onCree();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, color: "#16231F" }}>Nouveau prospect</div>
        <input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} autoFocus />
        <input placeholder="Téléphone (optionnel)" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        <input placeholder="Source (ex: Facebook, bouche à oreille...)" value={source} onChange={(e) => setSource(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} />
        <button onClick={creer} disabled={enCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : "Créer le prospect"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}

function FicheProspectModal({ prospect, onClose, onChange }) {
  const [relances, setRelances] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [note, setNote] = useState("");
  const [statut, setStatut] = useState(prospect.statut);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [dejaClient, setDejaClient] = useState(null);
  const [nbVisites, setNbVisites] = useState(null);

  useEffect(() => {
    supabase.from("filleuls_prospects_relances").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false })
      .then(({ data }) => { setRelances(data || []); setChargement(false); });
    if (prospect.visiteur_id) {
      supabase.from("recrutement_visites_tunnel").select("id", { count: "exact", head: true }).eq("visiteur_id", prospect.visiteur_id)
        .then(({ count }) => setNbVisites(count || 0));
    }
    // Identité unifiée (visiteur → prospect → partenaire → client) : il n'existe pas de
    // table "clients" séparée dans ce projet — un client est simplement une commande avec
    // ce numéro de téléphone. On le vérifie plutôt que d'inventer une liaison qui n'existe pas.
    if (prospect.telephone) {
      const telNettoye = prospect.telephone.replace(/\D/g, "");
      supabase.from("commandes").select("id, montant, created_at", { count: "exact" }).eq("workspace_id", prospect.workspace_id).ilike("tel", `%${telNettoye.slice(-8)}%`).limit(1)
        .then(({ data, count }) => setDejaClient(count > 0 ? { nb: count, derniere: data?.[0] } : { nb: 0 }));
    }
  }, [prospect.id]);

  async function ajouterRelance() {
    if (!note.trim()) return;
    setEnCours(true);
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("filleuls_prospects_relances").insert([{ workspace_id: prospect.workspace_id, prospect_id: prospect.id, note: note.trim(), cree_par: sessionData?.session?.user?.id || null, auteur_type: "owner" }]);
    setNote("");
    const { data } = await supabase.from("filleuls_prospects_relances").select("*").eq("prospect_id", prospect.id).order("created_at", { ascending: false });
    setRelances(data || []);
    setEnCours(false);
  }

  async function majStatut(nouveauStatut) {
    setStatut(nouveauStatut);
    await supabase.from("filleuls_prospects").update({ statut: nouveauStatut, updated_at: new Date().toISOString() }).eq("id", prospect.id);
    onChange();
  }

  async function convertir() {
    setEnCours(true);
    setErreur("");
    const { error } = await supabase.rpc("convertir_prospect_en_filleul", { p_prospect_id: prospect.id });
    setEnCours(false);
    if (error) { setErreur(error.message || "Échec de la conversion."); return; }
    await onChange();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#16231F" }}>{prospect.nom}</div>
        <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 14 }}>{prospect.telephone || "—"} {prospect.source ? `· ${prospect.source}` : ""}</div>
        {dejaClient?.nb > 0 && (
          <div style={{ fontSize: 11, color: "#1a7a3c", background: "#EAF3DE", borderRadius: 9, padding: "7px 11px", marginBottom: 12, fontWeight: 700 }}>
            🛍️ Déjà client — {dejaClient.nb} commande{dejaClient.nb > 1 ? "s" : ""} avec ce numéro
          </div>
        )}
        {nbVisites != null && (
          <div style={{ fontSize: 11, color: "#5b3ba8", marginBottom: 12 }}>
            👀 {nbVisites} visite{nbVisites > 1 ? "s" : ""} du tunnel {nbVisites > 1 ? "— revenu plusieurs fois" : ""}
          </div>
        )}

        <select value={statut} onChange={(e) => majStatut(e.target.value)} disabled={prospect.statut === "inscrit"} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 12 }}>
          <option value="nouveau">🆕 Nouveau</option>
          <option value="contacte">📞 Contacté</option>
          <option value="presente">🗣️ Présenté</option>
          <option value="suivi">🔄 En suivi</option>
          <option value="perdu">❌ Perdu</option>
          <option value="inscrit" disabled>✅ Inscrit</option>
        </select>

        {prospect.statut !== "inscrit" && (
          <button onClick={convertir} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "10px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
            {enCours ? "..." : "✅ Convertir en filleul (créer son lien)"}
          </button>
        )}
        {erreur && <div style={{ fontSize: 11, color: "#D64933", marginBottom: 10 }}>{erreur}</div>}

        <div style={{ fontSize: 12, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>Relances</div>
        <textarea placeholder="Note sur ce contact..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8, resize: "vertical" }} />
        <button onClick={ajouterRelance} disabled={enCours} style={{ width: "100%", background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
          Ajouter la note
        </button>

        {chargement && <div style={{ fontSize: 11.5, color: "#8A9089" }}>Chargement...</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {relances.map((r) => (
            <div key={r.id} style={{ fontSize: 11.5, background: "#F7FAF7", borderRadius: 8, padding: "8px 10px" }}>
              <div>{r.note}</div>
              <div style={{ fontSize: 10, color: "#8A9089", marginTop: 3 }}>{new Date(r.created_at).toLocaleString("fr-FR")} · {r.auteur_type === "filleul" ? `👤 ${r.auteur_nom || "Filleul"}` : "Toi"}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}

// Export CSV des filleuls (§26) — utile pour un suivi hors-ligne ou une migration.
function exporterFilleulsCSV(filleuls, statsPourFilleul, currency) {
  const entetes = ["Nom", "Code", "Téléphone", "Statut", "Ventes", `CA (${currency})`, `Commission dispo. (${currency})`, `Déjà payé (${currency})`];
  const lignes = filleuls.map((f) => {
    const s = statsPourFilleul(f.id);
    return [f.nom, f.code, f.telephone || "", f.statut, s.ventes, s.ca, s.disponible, s.payee];
  });
  const csv = [entetes, ...lignes].map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `filleuls-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
