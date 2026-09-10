import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import NotificationsBell from "./NotificationsBell.jsx";

// Écran admin "📋 Recrutement" — pipeline candidature → pack → paiement
// externe → confirmation manuelle → partenaire externe → activation.
// Règle absolue (mission §56) : aucun paiement n'est jamais confirmé
// automatiquement, uniquement via une action explicite owner/admin ici,
// qui passe par les RPC dédiées (jamais un update direct de la table).
export default function RecrutementAdmin({ workspace, currency, onFilleulsChange }) {
  const [onglet, setOnglet] = useState("candidatures"); // candidatures | packs
  const [commandes, setCommandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("toutes");
  const [recherche, setRecherche] = useState("");
  const [commandeOuverte, setCommandeOuverte] = useState(null);

  async function charger() {
    setChargement(true);
    const { data } = await supabase
      .from("recrutement_commandes_pack")
      .select("*, recrutement_candidatures(nom, telephone, email, motivation), filleuls_prospects(recruteur_filleul_id)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setCommandes(data || []);
    setChargement(false);
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
    let ok = filtre === "toutes";
    if (filtre === "paiement_en_attente") ok = c.statut_paiement !== "confirme" && c.statut_paiement !== "refuse";
    else if (filtre === "partenaire_a_creer") ok = c.statut_paiement === "confirme" && c.statut_partenaire !== "cree";
    else if (filtre === "pret_a_activer") ok = c.statut_partenaire === "cree" && c.statut_activation !== "active";
    else if (filtre === "actives") ok = c.statut_activation === "active";
    else if (filtre === "refusees") ok = c.statut_paiement === "refuse";
    if (!ok) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const nom = (c.recrutement_candidatures?.nom || "").toLowerCase();
      const tel = (c.recrutement_candidatures?.telephone || "").toLowerCase();
      if (!nom.includes(q) && !tel.includes(q)) return false;
    }
    return true;
  }
  const commandesFiltrees = commandes.filter(correspondFiltre);

  function exporterCSV() {
    const entetes = ["Nom", "Téléphone", "Email", "Pack", "Prix", "Statut paiement", "Statut partenaire", "Statut activation", "Date"];
    const lignes = commandesFiltrees.map((c) => [
      c.recrutement_candidatures?.nom || "", c.recrutement_candidatures?.telephone || "", c.recrutement_candidatures?.email || "",
      c.pack_nom_snapshot || "", c.pack_prix_snapshot || "", c.statut_paiement || "", c.statut_partenaire || "", c.statut_activation || "",
      new Date(c.created_at).toLocaleDateString("fr-FR"),
    ]);
    const csv = [entetes, ...lignes].map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `candidatures-recrutement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F" }}>📋 Recrutement — candidatures &amp; activation</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationsBell workspace={workspace} />
          <button onClick={exporterCSV} disabled={commandesFiltrees.length === 0} style={{ background: "#F3F1EA", color: "#6B7168", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 11.5, fontWeight: 700, cursor: commandesFiltrees.length ? "pointer" : "not-allowed" }}>
            ⬇️ Exporter CSV
          </button>
        </div>
      </div>

      <input
        placeholder="🔍 Rechercher un nom ou un téléphone..."
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 12 }}
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ECE8DC" }}>
        {[{ key: "candidatures", label: "Candidatures" }, { key: "packs", label: "🏷️ Packs" }].map((o) => (
          <button key={o.key} onClick={() => setOnglet(o.key)} style={{
            background: "none", border: "none", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            color: onglet === o.key ? "#6b3fd4" : "#8A9089",
            borderBottom: onglet === o.key ? "2px solid #6b3fd4" : "2px solid transparent", marginBottom: -1,
          }}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "packs" && <PacksAdmin workspace={workspace} currency={currency} />}

      {onglet === "candidatures" && (
      <>
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
      {!chargement && commandesFiltrees.length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5, lineHeight: 1.6 }}>
          {commandes.length === 0 ? "Aucune candidature pour l'instant. Elles apparaîtront ici dès qu'un prospect enverra sa candidature via votre tunnel de recrutement." : "Rien ne correspond à ce filtre ou cette recherche."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commandesFiltrees.map((c) => (
          <LigneCommande key={c.id} commande={c} currency={currency} onOuvrir={() => setCommandeOuverte(c)} />
        ))}
      </div>
      </>
      )}

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

// Gestion des packs (§9 de la mission) — créer, modifier, activer/désactiver,
// réordonner. Jamais de prix codé en dur côté React : tout vient de
// recrutement_packs. Le snapshot du prix au moment d'une commande (déjà
// géré par soumettre_candidature_reseau_public) garantit qu'un changement
// de prix ici n'affecte jamais une commande déjà passée.
function PacksAdmin({ workspace, currency }) {
  const [packs, setPacks] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [showAjout, setShowAjout] = useState(false);
  const [packEnEdition, setPackEnEdition] = useState(null);

  async function charger() {
    setChargement(true);
    const { data } = await supabase.from("recrutement_packs").select("*").eq("workspace_id", workspace.id).order("ordre");
    setPacks(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [workspace.id]);

  async function basculerActif(pack) {
    await supabase.from("recrutement_packs").update({ actif: !pack.actif, updated_at: new Date().toISOString() }).eq("id", pack.id);
    await charger();
  }

  async function deplacer(pack, direction) {
    const idx = packs.findIndex((p) => p.id === pack.id);
    const cible = packs[idx + direction];
    if (!cible) return;
    await Promise.all([
      supabase.from("recrutement_packs").update({ ordre: cible.ordre }).eq("id", pack.id),
      supabase.from("recrutement_packs").update({ ordre: pack.ordre }).eq("id", cible.id),
    ]);
    await charger();
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => setShowAjout(true)} style={{ background: "#6b3fd4", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          + Nouveau pack
        </button>
      </div>

      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && packs.length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5, lineHeight: 1.6 }}>
          Aucun pack pour l'instant. Créez-en un pour qu'il apparaisse dans le tunnel de recrutement de vos filleuls.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {packs.map((p, i) => (
          <div key={p.id} style={{ ...carte, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{p.nom} {!p.actif && <span style={{ color: "#8A9089", fontWeight: 500 }}>(inactif)</span>}</div>
              <div style={{ fontSize: 11, color: "#8A9089" }}>{Number(p.prix || 0).toLocaleString("fr-FR")} {p.devise || currency}{p.description ? ` · ${p.description}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => deplacer(p, -1)} disabled={i === 0} style={{ background: "#F3F1EA", border: "none", borderRadius: 7, width: 28, height: 28, cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.4 : 1 }}>↑</button>
              <button onClick={() => deplacer(p, 1)} disabled={i === packs.length - 1} style={{ background: "#F3F1EA", border: "none", borderRadius: 7, width: 28, height: 28, cursor: i === packs.length - 1 ? "not-allowed" : "pointer", opacity: i === packs.length - 1 ? 0.4 : 1 }}>↓</button>
              <button onClick={() => setPackEnEdition(p)} style={{ background: "#f0ecfb", color: "#5b3ba8", border: "none", borderRadius: 7, padding: "0 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Modifier</button>
              <button onClick={() => basculerActif(p)} style={{ background: p.actif ? "#FBEAEA" : "#EAF3DE", color: p.actif ? "#D64933" : "#1a7a3c", border: "none", borderRadius: 7, padding: "0 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{p.actif ? "Désactiver" : "Activer"}</button>
            </div>
          </div>
        ))}
      </div>

      {showAjout && <FormulairePackModal workspace={workspace} onClose={() => setShowAjout(false)} onEnregistre={async () => { setShowAjout(false); await charger(); }} />}
      {packEnEdition && <FormulairePackModal workspace={workspace} pack={packEnEdition} onClose={() => setPackEnEdition(null)} onEnregistre={async () => { setPackEnEdition(null); await charger(); }} />}
    </div>
  );
}

function FormulairePackModal({ workspace, pack, onClose, onEnregistre }) {
  const [nom, setNom] = useState(pack?.nom || "");
  const [prix, setPrix] = useState(pack?.prix != null ? String(pack.prix) : "");
  const [devise, setDevise] = useState(pack?.devise || "XOF");
  const [description, setDescription] = useState(pack?.description || "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function enregistrer() {
    if (!nom.trim() || !prix || isNaN(Number(prix))) { setErreur("Nom et prix valides requis."); return; }
    setEnCours(true);
    setErreur("");
    if (pack) {
      const { error } = await supabase.from("recrutement_packs").update({
        nom: nom.trim(), prix: Number(prix), devise, description: description.trim() || null, updated_at: new Date().toISOString(),
      }).eq("id", pack.id);
      if (error) { setErreur(error.message); setEnCours(false); return; }
    } else {
      const { count } = await supabase.from("recrutement_packs").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
      const { error } = await supabase.from("recrutement_packs").insert([{
        workspace_id: workspace.id, nom: nom.trim(), prix: Number(prix), devise, description: description.trim() || null, actif: true, ordre: count || 0,
      }]);
      if (error) { setErreur(error.message); setEnCours(false); return; }
    }
    setEnCours(false);
    onEnregistre();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{pack ? "Modifier le pack" : "Nouveau pack"}</div>
        <input placeholder="Nom (ex: Pack Essentiel)" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13 }} autoFocus />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input type="number" placeholder="Prix" value={prix} onChange={(e) => setPrix(e.target.value)} style={{ flex: 1, boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13 }} />
          <select value={devise} onChange={(e) => setDevise(e.target.value)} style={{ boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13 }}>
            <option value="XOF">XOF</option>
            <option value="XAF">XAF</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <textarea placeholder="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: "1px solid #DDD8CC", marginBottom: 10, fontSize: 13, resize: "vertical" }} />
        {erreur && <div style={{ fontSize: 11.5, color: "#D64933", marginBottom: 10 }}>{erreur}</div>}
        <button onClick={enregistrer} disabled={enCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
          {enCours ? "..." : pack ? "Enregistrer les modifications" : "Créer le pack"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}
