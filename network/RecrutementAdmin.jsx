import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Écran admin "📋 Recrutement" — pipeline candidature → pack → paiement
// externe → confirmation manuelle → partenaire externe → activation.
// Règle absolue (mission §56) : aucun paiement n'est jamais confirmé
// automatiquement, uniquement via une action explicite owner/admin ici,
// qui passe par les RPC dédiées (jamais un update direct de la table).
export default function RecrutementAdmin({ workspace, currency, onFilleulsChange }) {
  const [commandes, setCommandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("toutes");
  const [commandeOuverte, setCommandeOuverte] = useState(null);
  const [pipeline, setPipeline] = useState(null);

  async function chargerPipeline() {
    // Uniquement des comptages (count: exact, head: true) — jamais de select * massif
    // pour un widget de pilotage (§33 performance).
    const [visites, candidatureDebutee, candidatureTerminee, paiementConfirme, actifs] = await Promise.all([
      supabase.from("recrutement_visites_tunnel").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
      supabase.from("filleuls_prospects").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).not("parcours_statut", "is", null),
      supabase.from("filleuls_prospects").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).not("candidature_le_at", "is", null),
      supabase.from("recrutement_commandes_pack").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("statut_paiement", "confirme"),
      supabase.from("recrutement_commandes_pack").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("statut_activation", "active"),
    ]);
    setPipeline({
      visites: visites.count || 0,
      candidatureDebutee: candidatureDebutee.count || 0,
      candidatureTerminee: candidatureTerminee.count || 0,
      paiementConfirme: paiementConfirme.count || 0,
      actifs: actifs.count || 0,
    });
  }

  async function charger() {
    setChargement(true);
    const { data } = await supabase
      .from("recrutement_commandes_pack")
      .select("*, recrutement_candidatures(nom, telephone, email, motivation), filleuls_prospects(recruteur_filleul_id)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setCommandes(data || []);
    setChargement(false);
    chargerPipeline();
  }

  useEffect(() => { charger(); }, [workspace.id]);

  const filtres = [
    { key: "toutes", label: "Toutes" },
    { key: "paiement_en_attente", label: "⏳ Paiement à confirmer" },
    { key: "partenaire_a_creer", label: "🏢 Partenaire externe à créer" },
    { key: "pret_a_activer", label: "✅ Prêt à activer" },
    { key: "actives", label: "🎉 Activées" },
    { key: "refusees", label: "❌ Refusées" },
  ];

  function correspondFiltre(c) {
    if (filtre === "toutes") return true;
    if (filtre === "paiement_en_attente") return c.statut_paiement !== "confirme" && c.statut_paiement !== "refuse";
    if (filtre === "partenaire_a_creer") return c.statut_paiement === "confirme" && c.statut_partenaire !== "cree";
    if (filtre === "pret_a_activer") return c.statut_partenaire === "cree" && c.statut_activation !== "active";
    if (filtre === "actives") return c.statut_activation === "active";
    if (filtre === "refusees") return c.statut_paiement === "refuse";
    return true;
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F", marginBottom: 16 }}>📋 Recrutement — candidatures &amp; activation</div>

      {pipeline && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 20, overflowX: "auto" }}>
          {[
            { icone: "👀", label: "Visiteurs", valeur: pipeline.visites },
            { icone: "📝", label: "Candidatures commencées", valeur: pipeline.candidatureDebutee },
            { icone: "✅", label: "Candidatures envoyées", valeur: pipeline.candidatureTerminee },
            { icone: "💳", label: "Paiements confirmés", valeur: pipeline.paiementConfirme },
            { icone: "🟢", label: "Partenaires activés", valeur: pipeline.actifs },
          ].map((etape, i, arr) => (
            <React.Fragment key={etape.label}>
              <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "10px 14px", minWidth: 110, textAlign: "center" }}>
                <div style={{ fontSize: 18 }}>{etape.icone}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#16231F" }}>{etape.valeur}</div>
                <div style={{ fontSize: 9, color: "#8A9089" }}>{etape.label}</div>
              </div>
              {i < arr.length - 1 && <div style={{ color: "#DDD8CC", fontSize: 16 }}>→</div>}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filtres.map((f) => (
          <button key={f.key} onClick={() => setFiltre(f.key)} style={{
            border: `1px solid ${filtre === f.key ? "#6b3fd4" : "#ECE8DC"}`,
            background: filtre === f.key ? "#f0ecfb" : "white",
            color: filtre === f.key ? "#5b3ba8" : "#6B7168",
            borderRadius: 20, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && commandes.filter(correspondFiltre).length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>Rien dans ce filtre.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commandes.filter(correspondFiltre).map((c) => (
          <LigneCommande key={c.id} commande={c} currency={currency} onOuvrir={() => setCommandeOuverte(c)} />
        ))}
      </div>

      {commandeOuverte && (
        <FicheCommandeModal
          commande={commandeOuverte}
          workspace={workspace}
          currency={currency}
          onClose={() => setCommandeOuverte(null)}
          onChange={async () => { await charger(); await onFilleulsChange?.(); }}
        />
      )}
    </div>
  );
}

function libelleEtape(c) {
  if (c.statut_activation === "active") return { texte: "🎉 Activé", couleur: "#1a7a3c" };
  if (c.statut_paiement === "refuse") return { texte: "❌ Paiement refusé", couleur: "#D64933" };
  if (c.statut_partenaire === "cree") return { texte: "✅ Prêt à activer", couleur: "#5b3ba8" };
  if (c.statut_paiement === "confirme") return { texte: "🏢 Créer le partenaire externe", couleur: "#b16b00" };
  return { texte: "⏳ Paiement à confirmer", couleur: "#8A6412" };
}

function LigneCommande({ commande, currency, onOuvrir }) {
  const candidat = commande.recrutement_candidatures;
  const etape = libelleEtape(commande);
  return (
    <div onClick={onOuvrir} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#16231F" }}>{candidat?.nom || "—"}</div>
        <div style={{ fontSize: 11, color: "#8A9089" }}>{candidat?.telephone || "—"} · {commande.pack_nom_snapshot} · {Number(commande.pack_prix_snapshot || 0).toLocaleString("fr-FR")} {commande.pack_devise_snapshot || currency}</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: etape.couleur }}>{etape.texte}</div>
    </div>
  );
}

function FicheCommandeModal({ commande: commandeInitiale, workspace, currency, onClose, onChange }) {
  const [commande, setCommande] = useState(commandeInitiale);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [reference, setReference] = useState("");
  const [moyen, setMoyen] = useState("mobile_money");
  const [note, setNote] = useState("");
  const [systemeNom, setSystemeNom] = useState("");
  const [externeId, setExterneId] = useState("");
  const [externeCode, setExterneCode] = useState("");

  const candidat = commande.recrutement_candidatures;
  const etape = libelleEtape(commande);

  async function rafraichirCommande() {
    const { data } = await supabase.from("recrutement_commandes_pack").select("*, recrutement_candidatures(nom, telephone, email, motivation)").eq("id", commande.id).maybeSingle();
    if (data) setCommande((c) => ({ ...data, recrutement_candidatures: data.recrutement_candidatures || c.recrutement_candidatures }));
  }

  async function confirmerPaiement() {
    setEnCours(true); setErreur("");
    const { error } = await supabase.rpc("confirmer_paiement_pack_recrutement", {
      p_commande_id: commande.id, p_reference: reference.trim() || null, p_moyen: moyen, p_note: note.trim() || null,
    });
    setEnCours(false);
    if (error) { setErreur(error.message || "Échec de la confirmation."); return; }
    await rafraichirCommande(); await onChange();
  }

  async function refuserPaiement() {
    setEnCours(true); setErreur("");
    const { error } = await supabase.rpc("refuser_paiement_pack_recrutement", { p_commande_id: commande.id, p_note: note.trim() || null });
    setEnCours(false);
    if (error) { setErreur(error.message || "Échec du refus."); return; }
    await rafraichirCommande(); await onChange();
  }

  async function enregistrerPartenaireExterne() {
    if (!systemeNom.trim()) { setErreur("Indique au moins le nom du système externe."); return; }
    setEnCours(true); setErreur("");
    const { error } = await supabase.rpc("enregistrer_partenaire_externe_recrutement", {
      p_commande_id: commande.id, p_systeme_nom: systemeNom.trim(), p_externe_id: externeId.trim() || null, p_externe_code: externeCode.trim() || null,
    });
    setEnCours(false);
    if (error) { setErreur(error.message || "Échec de l'enregistrement."); return; }
    await rafraichirCommande(); await onChange();
  }

  async function activer() {
    setEnCours(true); setErreur("");
    const { error } = await supabase.rpc("activer_partenaire_recrutement", { p_commande_id: commande.id });
    setEnCours(false);
    if (error) { setErreur(error.message || "Échec de l'activation."); return; }
    await rafraichirCommande(); await onChange();
  }

  const champ = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#16231F" }}>{candidat?.nom}</div>
        <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 4 }}>{candidat?.telephone} {candidat?.email ? `· ${candidat.email}` : ""}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: etape.couleur, marginBottom: 14 }}>{etape.texte}</div>

        {candidat?.motivation && (
          <div style={{ fontSize: 11.5, color: "#6B7168", background: "#F7FAF7", borderRadius: 9, padding: "9px 11px", marginBottom: 14, lineHeight: 1.5 }}>
            "{candidat.motivation}"
          </div>
        )}

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Pack choisi</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{commande.pack_nom_snapshot} — {Number(commande.pack_prix_snapshot || 0).toLocaleString("fr-FR")} {commande.pack_devise_snapshot}</div>

        {erreur && <div style={{ fontSize: 11.5, color: "#D64933", marginBottom: 10 }}>⚠️ {erreur}</div>}

        {/* Étape 1 : paiement */}
        {commande.statut_paiement !== "confirme" && commande.statut_paiement !== "refuse" && (
          <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 8 }}>💳 Paiement (déclaré hors plateforme)</div>
            <input placeholder="Référence de paiement" value={reference} onChange={(e) => setReference(e.target.value)} style={champ} />
            <select value={moyen} onChange={(e) => setMoyen(e.target.value)} style={champ}>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement</option>
              <option value="bureau">Paiement au bureau</option>
              <option value="autre">Autre</option>
            </select>
            <textarea placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...champ, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={confirmerPaiement} disabled={enCours} style={{ flex: 1, background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                ✅ Confirmer le paiement
              </button>
              <button onClick={refuserPaiement} disabled={enCours} style={{ flex: 1, background: "#FBEAEA", color: "#D64933", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                ❌ Refuser
              </button>
            </div>
          </div>
        )}

        {commande.statut_paiement === "refuse" && (
          <div style={{ fontSize: 11.5, color: "#D64933", marginBottom: 14 }}>Paiement refusé{commande.paiement_note_admin ? ` — ${commande.paiement_note_admin}` : ""}.</div>
        )}

        {/* Étape 2 : partenaire externe */}
        {commande.statut_paiement === "confirme" && commande.statut_partenaire !== "cree" && (
          <div style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#16231F", marginBottom: 4 }}>🏢 Partenaire créé dans le système externe</div>
            <div style={{ fontSize: 10.5, color: "#8A9089", marginBottom: 8, lineHeight: 1.5 }}>Crée d'abord le partenaire toi-même dans ton système réseau externe, puis saisis les informations ici.</div>
            <input placeholder="Nom du système externe (ex: LongRich, autre...)" value={systemeNom} onChange={(e) => setSystemeNom(e.target.value)} style={champ} />
            <input placeholder="ID partenaire (optionnel)" value={externeId} onChange={(e) => setExterneId(e.target.value)} style={champ} />
            <input placeholder="Code partenaire (optionnel)" value={externeCode} onChange={(e) => setExterneCode(e.target.value)} style={champ} />
            <button onClick={enregistrerPartenaireExterne} disabled={enCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
              Enregistrer
            </button>
          </div>
        )}

        {/* Étape 3 : activation */}
        {commande.statut_partenaire === "cree" && commande.statut_activation !== "active" && (
          <button onClick={activer} disabled={enCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
            {enCours ? "..." : "🎉 Activer ce partenaire"}
          </button>
        )}

        {commande.statut_activation === "active" && (
          <div style={{ fontSize: 12, color: "#1a7a3c", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
            ✅ Partenaire actif — sa fiche filleul a été créée dans "🟣 Réseau".
          </div>
        )}

        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Fermer</button>
      </div>
    </div>
  );
}
