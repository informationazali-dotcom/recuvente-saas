import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  Ventes à crédit : le client verse un acompte (moitié, 2/3…) puis paie le
//  reste par mensualités à des dates convenues. RecuVente garde l'échéancier,
//  signale les clients à relancer (J-3 et en retard) et prépare le message
//  WhatsApp. Une notification push récapitulative part aussi chaque matin
//  (voir lib/credits.js, appelé par api/cron-daily.js).
//  Fichier autonome, comme LocationMaison.jsx ou ProspectsFiches.jsx.
// ============================================================================

const C = {
  vert: "#1a7a3c", vertFonce: "#16231F", fond: "#FAFAF7", carte: "#FFFFFF",
  bordure: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", gris: "#6B7168", grisClair: "#8A9089",
  bleu: "#2452e8", whatsapp: "#25D366",
};
const JOURS_ALERTE = 3;

function nb(x) { return Math.round(Number(x || 0)).toLocaleString("fr-FR").replace(/[  ]/g, " "); }
function devise(code) { return code === "XOF" || code === "XAF" || !code ? "F CFA" : code; }
function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel || "").replace(/\D/g, "");
  if (String(tel || "").trim().startsWith("+") && digits.length >= 9) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}
// Dates toujours en calendrier LOCAL (jamais toISOString sur une date locale : décalage de fuseau).
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function aujourdhui() { return isoLocal(new Date()); }
function versDate(iso) { const [a, m, j] = String(iso).split("-").map(Number); return new Date(a, m - 1, j); }
function joursEntre(isoA, isoB) { return Math.round((versDate(isoB) - versDate(isoA)) / 86400000); }
function ajouterMois(iso, n) {
  const d = versDate(iso);
  const jour = d.getDate();
  const cible = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dernier = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  cible.setDate(Math.min(jour, dernier));
  return isoLocal(cible);
}
function dateLongue(iso) {
  if (!iso) return "";
  return versDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function dateCourte(iso) {
  if (!iso) return "";
  return versDate(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Découpe le reste en N mensualités arrondies à 1 000 (la dernière absorbe la différence).
function construireEcheancier(reste, nbMois, premiereDate) {
  const n = Math.max(1, Math.floor(Number(nbMois) || 1));
  const base = Math.floor(reste / n / 1000) * 1000 || Math.floor(reste / n);
  const lignes = [];
  let cumul = 0;
  for (let i = 0; i < n; i++) {
    const montant = i === n - 1 ? reste - cumul : base;
    cumul += montant;
    lignes.push({ numero: i + 1, date_echeance: ajouterMois(premiereDate, i), montant_du: montant });
  }
  return lignes;
}

const S = {
  carte: { background: C.carte, border: `1px solid ${C.bordure}`, borderRadius: 14, padding: 14, marginBottom: 12 },
  champ: { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box", background: "white", marginBottom: 10, fontFamily: "inherit" },
  label: { fontSize: 12, fontWeight: 700, color: C.gris, marginBottom: 4, display: "block" },
  bouton: { background: C.vert, color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: C.vertFonce, border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  boutonWa: { background: C.whatsapp, color: "white", border: "none", borderRadius: 9, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  onglet: (actif) => ({ flex: "0 0 auto", padding: "10px 13px", fontSize: 12.5, fontWeight: 700, borderRadius: 9, cursor: "pointer", background: actif ? C.vert : "transparent", color: actif ? "white" : "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }),
  pastille: (couleur) => ({ display: "inline-block", fontSize: 11, fontWeight: 800, color: "white", background: couleur, borderRadius: 999, padding: "2px 8px" }),
};

// ---------------------------------------------------------------------------
//  Données
// ---------------------------------------------------------------------------
function useCredits(workspace) {
  const [credits, setCredits] = useState([]);
  const [echeances, setEcheances] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState("");

  const recharger = useCallback(async () => {
    if (!workspace?.id) return;
    const [c, e, p] = await Promise.all([
      supabase.from("ventes_credit").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
      supabase.from("echeances_credit").select("*").eq("workspace_id", workspace.id).order("date_echeance", { ascending: true }),
      supabase.from("paiements_credit").select("*").eq("workspace_id", workspace.id).order("date_paiement", { ascending: false }),
    ]);
    if (c.error) setErreur(c.error.message);
    setCredits(c.data || []);
    setEcheances(e.data || []);
    setPaiements(p.data || []);
    setCharge(true);
  }, [workspace?.id]);

  useEffect(() => { recharger(); }, [recharger]);

  // Vue calculée de chaque crédit : reste, prochaine échéance, situation.
  const fiches = useMemo(() => {
    const auj = aujourdhui();
    return credits.map((cr) => {
      const ech = echeances.filter((e) => e.credit_id === cr.id).sort((a, b) => a.numero - b.numero);
      const verse = paiements.filter((p) => p.credit_id === cr.id).reduce((s, p) => s + Number(p.montant), 0);
      const reste = Math.max(0, ech.reduce((s, e) => s + Math.max(0, Number(e.montant_du) - Number(e.montant_paye)), 0));
      const impayees = ech.filter((e) => Number(e.montant_paye) < Number(e.montant_du));
      const enRetard = impayees.filter((e) => e.date_echeance < auj);
      const montantEnRetard = enRetard.reduce((s, e) => s + Number(e.montant_du) - Number(e.montant_paye), 0);
      const prochaine = impayees[0] || null;
      const joursAvant = prochaine ? joursEntre(auj, prochaine.date_echeance) : null;
      let situation = "a_jour";
      if (cr.statut === "annule") situation = "annule";
      else if (reste <= 0) situation = "solde";
      else if (enRetard.length > 0) situation = "retard";
      else if (joursAvant !== null && joursAvant <= JOURS_ALERTE) situation = "bientot";
      const relanceAujourdhui = prochaine?.dernier_rappel_le === auj;
      return { ...cr, ech, verse, reste, prochaine, joursAvant, enRetard, montantEnRetard, situation, relanceAujourdhui };
    });
  }, [credits, echeances, paiements]);

  return { fiches, paiements, charge, erreur, recharger };
}

// ---------------------------------------------------------------------------
//  Messages WhatsApp (naturels, sans signature : le client est déjà sur ton WhatsApp)
// ---------------------------------------------------------------------------
function prenomPoli(nom) { return String(nom || "").trim() || "cher client"; }

function messageRappel(f, cur) {
  const nom = prenomPoli(f.client_nom);
  if (f.situation === "retard") {
    const e = f.enRetard[0];
    const plusieurs = f.enRetard.length > 1;
    return `Bonjour ${nom}, j'espère que vous allez bien. Sauf erreur de notre part, ${plusieurs ? `${f.enRetard.length} mensualités` : "la mensualité"} pour votre ${f.article}${plusieurs ? "" : ` prévue le ${dateLongue(e.date_echeance)}`} ${plusieurs ? "ne sont" : "n'est"} pas encore ${plusieurs ? "réglées" : "réglée"}, soit ${nb(f.montantEnRetard)} ${cur}. Pouvez-vous me dire quand vous pourrez passer la régler ? Merci beaucoup.`;
  }
  const e = f.prochaine;
  const reste = Number(e.montant_du) - Number(e.montant_paye);
  const quand = f.joursAvant === 0 ? "aujourd'hui" : f.joursAvant === 1 ? "demain" : `le ${dateLongue(e.date_echeance)}`;
  return `Bonjour ${nom}, j'espère que vous allez bien. Petit rappel : la mensualité de ${nb(reste)} ${cur} pour votre ${f.article} est prévue ${quand}. Merci de prévoir le règlement. Bonne journée à vous.`;
}

function messageRecu(f, montant, cur) {
  const nom = prenomPoli(f.client_nom);
  const resteApres = Math.max(0, f.reste - montant);
  if (resteApres <= 0) {
    return `Bonjour ${nom}, nous avons bien reçu votre paiement de ${nb(montant)} ${cur}. Votre ${f.article} est maintenant entièrement réglé. Merci pour votre confiance et votre sérieux.`;
  }
  return `Bonjour ${nom}, nous avons bien reçu votre paiement de ${nb(montant)} ${cur}. Merci. Il vous reste ${nb(resteApres)} ${cur} à régler pour votre ${f.article}.`;
}

function messageEcheancier(f, cur) {
  const lignes = f.ech.map((e) => `• ${dateCourte(e.date_echeance)} : ${nb(e.montant_du)} ${cur}`).join("\n");
  return `Bonjour ${prenomPoli(f.client_nom)}, voici le récapitulatif de votre achat à crédit.\n\nArticle : ${f.article}\nPrix total : ${nb(f.prix_total)} ${cur}\nAcompte versé : ${nb(f.acompte)} ${cur}\n\nVos mensualités :\n${lignes}\n\nMerci pour votre confiance.`;
}

function ouvrirWhatsApp(tel, texte) {
  const num = cleanPhoneForWhatsApp(tel);
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(texte)}`, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
//  Composants
// ---------------------------------------------------------------------------
function BadgeSituation({ f }) {
  if (f.situation === "retard") return <span style={S.pastille(C.rouge)}>En retard</span>;
  if (f.situation === "bientot") return <span style={S.pastille(C.ambre)}>{f.joursAvant === 0 ? "Aujourd'hui" : f.joursAvant === 1 ? "Demain" : `Dans ${f.joursAvant} j`}</span>;
  if (f.situation === "solde") return <span style={S.pastille(C.vert)}>Soldé</span>;
  if (f.situation === "annule") return <span style={S.pastille(C.grisClair)}>Annulé</span>;
  return <span style={S.pastille("#5E8C6A")}>À jour</span>;
}

function FenetreMessage({ titre, texteInitial, tel, onEnvoye, onFermer }) {
  const [texte, setTexte] = useState(texteInitial);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 560, borderRadius: "16px 16px 0 0", padding: 16, boxSizing: "border-box" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: C.vertFonce }}>{titre}</div>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={8} style={{ ...S.champ, resize: "vertical", lineHeight: 1.5 }} />
        {!tel && <div style={{ color: C.rouge, fontSize: 12.5, marginBottom: 8 }}>Aucun numéro enregistré pour ce client.</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.boutonClair, flex: 1 }} onClick={() => { navigator.clipboard?.writeText(texte); }}>Copier</button>
          <button style={{ ...S.boutonWa, flex: 2, opacity: tel ? 1 : 0.5 }} disabled={!tel} onClick={() => { ouvrirWhatsApp(tel, texte); onEnvoye?.(); onFermer(); }}>Envoyer sur WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

function CarteCredit({ f, cur, onOuvrir, onRelancer }) {
  const progression = f.prix_total > 0 ? Math.min(100, Math.round(((f.prix_total - f.reste) / f.prix_total) * 100)) : 0;
  return (
    <div style={{ ...S.carte, cursor: "pointer" }} onClick={onOuvrir}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.vertFonce }}>{f.client_nom}</div>
          <div style={{ fontSize: 12.5, color: C.gris, marginTop: 2 }}>{f.article}{f.client_tel ? ` • ${f.client_tel}` : ""}</div>
        </div>
        <BadgeSituation f={f} />
      </div>
      <div style={{ height: 6, background: "#EEEAE0", borderRadius: 99, margin: "12px 0 8px", overflow: "hidden" }}>
        <div style={{ width: `${progression}%`, height: "100%", background: C.vert }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.gris }}>
        <span>Payé {nb(f.prix_total - f.reste)} / {nb(f.prix_total)} {cur}</span>
        <span style={{ fontWeight: 800, color: f.reste > 0 ? C.vertFonce : C.vert }}>Reste {nb(f.reste)}</span>
      </div>
      {f.situation === "retard" && (
        <div style={{ marginTop: 8, fontSize: 13, color: C.rouge, fontWeight: 700 }}>
          {nb(f.montantEnRetard)} {cur} en retard depuis le {dateCourte(f.enRetard[0].date_echeance)}
        </div>
      )}
      {f.prochaine && f.situation !== "retard" && f.situation !== "annule" && (
        <div style={{ marginTop: 8, fontSize: 13, color: C.vertFonce }}>
          Prochaine : <b>{nb(Number(f.prochaine.montant_du) - Number(f.prochaine.montant_paye))} {cur}</b> le {dateCourte(f.prochaine.date_echeance)}
        </div>
      )}
      {onRelancer && (f.situation === "retard" || f.situation === "bientot") && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <button style={S.boutonWa} onClick={() => onRelancer(f)}>💬 Relancer sur WhatsApp</button>
          {f.relanceAujourdhui && <span style={{ fontSize: 12, color: C.vert, fontWeight: 700 }}>✓ Relancé aujourd'hui</span>}
        </div>
      )}
    </div>
  );
}

function OngletARelancer({ fiches, cur, onOuvrir, onRelancer }) {
  const retard = fiches.filter((f) => f.situation === "retard").sort((a, b) => a.enRetard[0].date_echeance.localeCompare(b.enRetard[0].date_echeance));
  const bientot = fiches.filter((f) => f.situation === "bientot").sort((a, b) => a.joursAvant - b.joursAvant);
  if (retard.length === 0 && bientot.length === 0) {
    return (
      <div style={{ ...S.carte, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 34 }}>✅</div>
        <div style={{ fontWeight: 800, marginTop: 8, color: C.vertFonce }}>Personne à relancer pour le moment</div>
        <div style={{ fontSize: 13, color: C.gris, marginTop: 4 }}>Les clients apparaissent ici {JOURS_ALERTE} jours avant leur date de paiement, et dès qu'un paiement est en retard.</div>
      </div>
    );
  }
  return (
    <>
      {retard.length > 0 && <div style={{ fontWeight: 800, color: C.rouge, margin: "4px 0 8px" }}>🔴 En retard ({retard.length})</div>}
      {retard.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} onRelancer={onRelancer} />)}
      {bientot.length > 0 && <div style={{ fontWeight: 800, color: C.ambre, margin: "12px 0 8px" }}>🟠 Paiement dans {JOURS_ALERTE} jours ou moins ({bientot.length})</div>}
      {bientot.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} onRelancer={onRelancer} />)}
    </>
  );
}

function OngletTous({ fiches, cur, onOuvrir }) {
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("en_cours");
  const liste = fiches.filter((f) => {
    if (filtre === "en_cours" && (f.situation === "solde" || f.situation === "annule")) return false;
    if (filtre === "soldes" && f.situation !== "solde") return false;
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return [f.client_nom, f.client_tel, f.article].some((x) => String(x || "").toLowerCase().includes(q));
  });
  return (
    <>
      <input style={S.champ} placeholder="Rechercher un client, un numéro, un article…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["en_cours", "En cours"], ["soldes", "Soldés"], ["tous", "Tous"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)} style={{ ...S.boutonClair, background: filtre === k ? C.vertFonce : "#F4F1E8", color: filtre === k ? "white" : C.vertFonce }}>{l}</button>
        ))}
      </div>
      {liste.length === 0 && <div style={{ textAlign: "center", color: C.grisClair, padding: 30 }}>Aucun crédit.</div>}
      {liste.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} />)}
    </>
  );
}

function FormulaireNouveau({ workspace, cur, onCree }) {
  const [client, setClient] = useState({ nom: "", tel: "", adresse: "" });
  const [article, setArticle] = useState("");
  const [prix, setPrix] = useState("");
  const [acompte, setAcompte] = useState("");
  const [modeAcompte, setModeAcompte] = useState("Espèces");
  const [nbMois, setNbMois] = useState("3");
  const [premiere, setPremiere] = useState(ajouterMois(aujourdhui(), 1));
  const [lignes, setLignes] = useState([]);
  const [lignesModifiees, setLignesModifiees] = useState(false);
  const [notes, setNotes] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const prixN = Number(String(prix).replace(/\s/g, "")) || 0;
  const acompteN = Number(String(acompte).replace(/\s/g, "")) || 0;
  const reste = Math.max(0, prixN - acompteN);

  useEffect(() => {
    if (!lignesModifiees) setLignes(reste > 0 ? construireEcheancier(reste, nbMois, premiere) : []);
  }, [reste, nbMois, premiere, lignesModifiees]);

  const totalLignes = lignes.reduce((s, l) => s + Number(l.montant_du || 0), 0);
  const ecart = reste - totalLignes;

  function modifierLigne(i, champ, valeur) {
    setLignesModifiees(true);
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: champ === "montant_du" ? Number(String(valeur).replace(/\s/g, "")) || 0 : valeur } : l)));
  }

  async function enregistrer() {
    setErreur("");
    if (!client.nom.trim()) return setErreur("Indique le nom du client.");
    if (!article.trim()) return setErreur("Indique l'article vendu.");
    if (prixN <= 0) return setErreur("Indique le prix total.");
    if (acompteN > prixN) return setErreur("L'acompte dépasse le prix total.");
    if (reste > 0 && Math.abs(ecart) > 0) return setErreur(`Le total des mensualités doit faire ${nb(reste)} ${cur} (écart de ${nb(ecart)}).`);
    setEnCours(true);
    try {
      const { data: cr, error } = await supabase.from("ventes_credit").insert([{
        workspace_id: workspace.id, client_nom: client.nom.trim(), client_tel: client.tel.trim() || null,
        client_adresse: client.adresse.trim() || null, article: article.trim(), prix_total: prixN,
        acompte: acompteN, notes: notes.trim() || null, statut: reste > 0 ? "en_cours" : "solde",
      }]).select().single();
      if (error) throw error;
      if (lignes.length > 0) {
        const { error: e2 } = await supabase.from("echeances_credit").insert(lignes.map((l, i) => ({
          workspace_id: workspace.id, credit_id: cr.id, numero: i + 1, date_echeance: l.date_echeance, montant_du: l.montant_du,
        })));
        if (e2) throw e2;
      }
      if (acompteN > 0) {
        await supabase.from("paiements_credit").insert([{ workspace_id: workspace.id, credit_id: cr.id, montant: acompteN, mode: modeAcompte, type: "acompte" }]);
      }
      onCree(cr.id);
    } catch (e) {
      setErreur(e.message || "Erreur d'enregistrement.");
    } finally {
      setEnCours(false);
    }
  }

  const fraction = (f) => () => { if (prixN > 0) setAcompte(String(Math.round((prixN * f) / 1000) * 1000)); };

  return (
    <div>
      <div style={S.carte}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>👤 Client</div>
        <label style={S.label}>Nom du client</label>
        <input style={S.champ} value={client.nom} onChange={(e) => setClient({ ...client, nom: e.target.value })} placeholder="Ex. M. Kouassi" />
        <label style={S.label}>Numéro WhatsApp</label>
        <input style={S.champ} inputMode="tel" value={client.tel} onChange={(e) => setClient({ ...client, tel: e.target.value })} placeholder="Ex. 07 00 00 00 00" />
        <label style={S.label}>Ville / adresse (facultatif)</label>
        <input style={{ ...S.champ, marginBottom: 0 }} value={client.adresse} onChange={(e) => setClient({ ...client, adresse: e.target.value })} />
      </div>

      <div style={S.carte}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>📦 Vente</div>
        <label style={S.label}>Article vendu</label>
        <input style={S.champ} value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Ex. Groupe électrogène Perkins 30 kVA" />
        <label style={S.label}>Prix total ({cur})</label>
        <input style={S.champ} inputMode="numeric" value={prix} onChange={(e) => { setPrix(e.target.value); setLignesModifiees(false); }} placeholder="Ex. 6 500 000" />
        <label style={S.label}>Acompte versé ({cur})</label>
        <input style={S.champ} inputMode="numeric" value={acompte} onChange={(e) => { setAcompte(e.target.value); setLignesModifiees(false); }} placeholder="Ex. 3 250 000" />
        <div style={{ display: "flex", gap: 6, marginTop: -4, marginBottom: 10, flexWrap: "wrap" }}>
          <button style={S.boutonClair} onClick={fraction(1 / 2)}>La moitié</button>
          <button style={S.boutonClair} onClick={fraction(2 / 3)}>Les 2/3</button>
          <button style={S.boutonClair} onClick={fraction(1 / 3)}>Le 1/3</button>
        </div>
        <label style={S.label}>Acompte payé par</label>
        <select style={S.champ} value={modeAcompte} onChange={(e) => setModeAcompte(e.target.value)}>
          {["Espèces", "Mobile Money", "Virement", "Chèque"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <div style={{ background: "#F4F1E8", borderRadius: 10, padding: 12, fontSize: 14, color: C.vertFonce }}>
          Reste à payer : <b>{nb(reste)} {cur}</b>
        </div>
      </div>

      {reste > 0 && (
        <div style={S.carte}>
          <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>📅 Mensualités</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Nombre de mois</label>
              <input style={S.champ} inputMode="numeric" value={nbMois} onChange={(e) => { setNbMois(e.target.value.replace(/\D/g, "").slice(0, 2)); setLignesModifiees(false); }} />
            </div>
            <div style={{ flex: 1.4 }}>
              <label style={S.label}>1er paiement le</label>
              <input style={S.champ} type="date" value={premiere} onChange={(e) => { setPremiere(e.target.value); setLignesModifiees(false); }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.gris, marginBottom: 8 }}>Tu peux changer chaque date ou chaque montant selon ce que vous avez convenu.</div>
          {lignes.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <div style={{ width: 22, fontSize: 12, color: C.grisClair, fontWeight: 700 }}>{i + 1}.</div>
              <input type="date" style={{ ...S.champ, marginBottom: 0, flex: 1.3 }} value={l.date_echeance} onChange={(e) => modifierLigne(i, "date_echeance", e.target.value)} />
              <input inputMode="numeric" style={{ ...S.champ, marginBottom: 0, flex: 1 }} value={l.montant_du} onChange={(e) => modifierLigne(i, "montant_du", e.target.value)} />
            </div>
          ))}
          {ecart !== 0 && <div style={{ color: C.rouge, fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>Total des mensualités : {nb(totalLignes)} — il faut {nb(reste)} {cur}.</div>}
          {lignesModifiees && <button style={{ ...S.boutonClair, marginTop: 8 }} onClick={() => setLignesModifiees(false)}>Recalculer automatiquement</button>}
        </div>
      )}

      <div style={S.carte}>
        <label style={S.label}>Note (facultatif)</label>
        <textarea style={{ ...S.champ, marginBottom: 0 }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. garant, conditions particulières…" />
      </div>

      {erreur && <div style={{ color: C.rouge, fontWeight: 700, marginBottom: 10 }}>{erreur}</div>}
      <button style={{ ...S.bouton, width: "100%", opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={enregistrer}>
        {enCours ? "Enregistrement…" : "Enregistrer la vente à crédit"}
      </button>
    </div>
  );
}

function DetailCredit({ f, paiements, workspace, cur, onRetour, onChange, ouvrirMessage }) {
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("Espèces");
  const [datePaiement, setDatePaiement] = useState(aujourdhui());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const histo = paiements.filter((p) => p.credit_id === f.id);
  const auj = aujourdhui();

  useEffect(() => {
    if (f.situation === "retard") setMontant(String(f.montantEnRetard));
    else if (f.prochaine) setMontant(String(Number(f.prochaine.montant_du) - Number(f.prochaine.montant_paye)));
  }, [f.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function encaisser() {
    setErreur("");
    const m = Number(String(montant).replace(/\s/g, "")) || 0;
    if (m <= 0) return setErreur("Indique le montant reçu.");
    if (m > f.reste) return setErreur(`Le client ne doit plus que ${nb(f.reste)} ${cur}.`);
    setEnCours(true);
    try {
      const { error } = await supabase.from("paiements_credit").insert([{ workspace_id: workspace.id, credit_id: f.id, montant: m, mode, date_paiement: datePaiement, type: "mensualite" }]);
      if (error) throw error;
      // Le paiement couvre d'abord les échéances les plus anciennes.
      let aRepartir = m;
      for (const e of f.ech) {
        if (aRepartir <= 0) break;
        const du = Number(e.montant_du) - Number(e.montant_paye);
        if (du <= 0) continue;
        const part = Math.min(du, aRepartir);
        aRepartir -= part;
        await supabase.from("echeances_credit").update({ montant_paye: Number(e.montant_paye) + part }).eq("id", e.id);
      }
      if (m >= f.reste) await supabase.from("ventes_credit").update({ statut: "solde", updated_at: new Date().toISOString() }).eq("id", f.id);
      const texte = messageRecu(f, m, cur);
      setMontant("");
      await onChange();
      if (f.client_tel) ouvrirMessage({ titre: "Confirmer le paiement au client", texte, tel: f.client_tel });
    } catch (e) {
      setErreur(e.message || "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  async function annuler() {
    if (!window.confirm("Annuler ce crédit ? Il ne sera plus suivi ni relancé.")) return;
    await supabase.from("ventes_credit").update({ statut: "annule", updated_at: new Date().toISOString() }).eq("id", f.id);
    onChange();
  }
  async function reactiver() {
    await supabase.from("ventes_credit").update({ statut: f.reste > 0 ? "en_cours" : "solde", updated_at: new Date().toISOString() }).eq("id", f.id);
    onChange();
  }
  async function supprimer() {
    if (!window.confirm("Supprimer définitivement ce crédit et tout son historique ?")) return;
    await supabase.from("ventes_credit").delete().eq("id", f.id);
    await onChange();
    onRetour();
  }
  async function changerDate(e, nouvelle) {
    if (!nouvelle) return;
    await supabase.from("echeances_credit").update({ date_echeance: nouvelle }).eq("id", e.id);
    onChange();
  }

  return (
    <div>
      <button style={{ ...S.boutonClair, marginBottom: 12 }} onClick={onRetour}>← Retour</button>
      <div style={S.carte}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.vertFonce }}>{f.client_nom}</div>
            <div style={{ fontSize: 13, color: C.gris, marginTop: 2 }}>{f.client_tel || "Pas de numéro"}{f.client_adresse ? ` • ${f.client_adresse}` : ""}</div>
          </div>
          <BadgeSituation f={f} />
        </div>
        <div style={{ marginTop: 12, fontSize: 14, color: C.vertFonce }}>{f.article}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
          {[["Prix total", f.prix_total], ["Déjà payé", f.prix_total - f.reste], ["Reste", f.reste]].map(([l, v]) => (
            <div key={l} style={{ background: "#F4F1E8", borderRadius: 10, padding: "9px 10px" }}>
              <div style={{ fontSize: 11, color: C.gris, fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: l === "Reste" && v > 0 ? C.rouge : C.vertFonce }}>{nb(v)}</div>
            </div>
          ))}
        </div>
        {f.notes && <div style={{ marginTop: 10, fontSize: 13, color: C.gris }}>📝 {f.notes}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {f.reste > 0 && f.situation !== "annule" && f.prochaine && (
            <button style={S.boutonWa} onClick={() => ouvrirMessage({ titre: "Rappel de paiement", texte: messageRappel(f, cur), tel: f.client_tel, echeanceId: f.prochaine.id })}>💬 Rappel</button>
          )}
          <button style={S.boutonClair} onClick={() => ouvrirMessage({ titre: "Envoyer l'échéancier", texte: messageEcheancier(f, cur), tel: f.client_tel })}>📅 Envoyer l'échéancier</button>
        </div>
      </div>

      {f.reste > 0 && f.situation !== "annule" && (
        <div style={S.carte}>
          <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>💰 Enregistrer un paiement</div>
          <label style={S.label}>Montant reçu ({cur})</label>
          <input style={S.champ} inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Payé par</label>
              <select style={S.champ} value={mode} onChange={(e) => setMode(e.target.value)}>
                {["Espèces", "Mobile Money", "Virement", "Chèque"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Le</label>
              <input type="date" style={S.champ} value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
            </div>
          </div>
          {erreur && <div style={{ color: C.rouge, fontWeight: 700, marginBottom: 8 }}>{erreur}</div>}
          <button style={{ ...S.bouton, width: "100%", opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={encaisser}>{enCours ? "Enregistrement…" : "Valider le paiement"}</button>
        </div>
      )}

      <div style={S.carte}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>📅 Échéancier</div>
        {f.ech.length === 0 && <div style={{ fontSize: 13, color: C.gris }}>Payé en une fois.</div>}
        {f.ech.map((e) => {
          const du = Number(e.montant_du) - Number(e.montant_paye);
          const etat = du <= 0 ? ["Payé", C.vert] : e.date_echeance < auj ? ["En retard", C.rouge] : Number(e.montant_paye) > 0 ? ["Partiel", C.ambre] : ["À venir", C.grisClair];
          return (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderTop: `1px solid ${C.bordure}` }}>
              <div style={{ width: 20, fontSize: 12, color: C.grisClair, fontWeight: 700 }}>{e.numero}</div>
              <div style={{ flex: 1 }}>
                {du > 0 && f.situation !== "annule" ? (
                  <input type="date" defaultValue={e.date_echeance} onBlur={(ev) => ev.target.value !== e.date_echeance && changerDate(e, ev.target.value)} style={{ border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: C.vertFonce, padding: 0, fontFamily: "inherit" }} />
                ) : (
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.vertFonce }}>{dateCourte(e.date_echeance)}</div>
                )}
                {Number(e.montant_paye) > 0 && du > 0 && <div style={{ fontSize: 11.5, color: C.gris }}>Payé {nb(e.montant_paye)}, reste {nb(du)}</div>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: C.vertFonce }}>{nb(e.montant_du)}</div>
              <span style={S.pastille(etat[1])}>{etat[0]}</span>
            </div>
          );
        })}
      </div>

      <div style={S.carte}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: C.vertFonce }}>🧾 Paiements reçus</div>
        {histo.length === 0 && <div style={{ fontSize: 13, color: C.gris }}>Aucun paiement enregistré.</div>}
        {histo.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${C.bordure}`, fontSize: 13.5 }}>
            <span>{dateCourte(p.date_paiement)} • {p.type === "acompte" ? "Acompte" : "Mensualité"}{p.mode ? ` • ${p.mode}` : ""}</span>
            <b>{nb(p.montant)} {cur}</b>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
        {f.situation === "annule"
          ? <button style={S.boutonClair} onClick={reactiver}>Réactiver le suivi</button>
          : f.reste > 0 && <button style={S.boutonClair} onClick={annuler}>Annuler le crédit</button>}
        <button style={{ ...S.boutonClair, color: C.rouge }} onClick={supprimer}>Supprimer</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Panneau principal
// ---------------------------------------------------------------------------
export default function VentesCredit({ workspace, onClose }) {
  const { fiches, paiements, charge, erreur, recharger } = useCredits(workspace);
  const [onglet, setOnglet] = useState("relancer");
  const [ouvertId, setOuvertId] = useState(null);
  const [message, setMessage] = useState(null);
  const cur = devise(workspace?.currency);

  const actifs = fiches.filter((f) => f.situation !== "solde" && f.situation !== "annule");
  const aRelancer = fiches.filter((f) => f.situation === "retard" || f.situation === "bientot");
  const totalReste = actifs.reduce((s, f) => s + f.reste, 0);
  const totalRetard = fiches.filter((f) => f.situation === "retard").reduce((s, f) => s + f.montantEnRetard, 0);
  const ouvert = fiches.find((f) => f.id === ouvertId) || null;

  async function marquerRelance(echeanceId) {
    if (!echeanceId) return;
    await supabase.from("echeances_credit").update({ dernier_rappel_le: aujourdhui() }).eq("id", echeanceId);
    recharger();
  }
  function relancer(f) {
    const echeanceId = (f.situation === "retard" ? f.enRetard[0] : f.prochaine)?.id;
    setMessage({ titre: "Rappel de paiement", texte: messageRappel(f, cur), tel: f.client_tel, echeanceId });
  }

  const ONGLETS = [
    { cle: "relancer", label: "🔔 À relancer", n: aRelancer.length },
    { cle: "tous", label: "📒 Tous les crédits", n: actifs.length },
    { cle: "nouveau", label: "➕ Nouvelle vente" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.fond, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.vertFonce, color: "white", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>💳 Ventes à crédit</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 34, height: 34, borderRadius: 8, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
          {ONGLETS.map((o) => (
            <div key={o.cle} onClick={() => { setOnglet(o.cle); setOuvertId(null); }} style={S.onglet(onglet === o.cle && !ouvertId)}>
              {o.label}{typeof o.n === "number" && o.n > 0 && <span style={{ marginLeft: 5, background: o.cle === "relancer" ? C.rouge : C.ambre, color: "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 800 }}>{o.n}</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 90px", maxWidth: 720, margin: "0 auto" }}>
        {!charge && <div style={{ textAlign: "center", color: C.grisClair, padding: 50 }}>Chargement…</div>}
        {charge && erreur && <div style={{ ...S.carte, color: C.rouge }}>Impossible de charger les crédits : {erreur}</div>}

        {charge && !ouvert && onglet !== "nouveau" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={{ ...S.carte, marginBottom: 0 }}>
              <div style={{ fontSize: 11.5, color: C.gris, fontWeight: 700 }}>Reste à encaisser</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.vertFonce }}>{nb(totalReste)} <span style={{ fontSize: 11 }}>{cur}</span></div>
              <div style={{ fontSize: 11.5, color: C.grisClair }}>{actifs.length} crédit{actifs.length > 1 ? "s" : ""} en cours</div>
            </div>
            <div style={{ ...S.carte, marginBottom: 0 }}>
              <div style={{ fontSize: 11.5, color: C.gris, fontWeight: 700 }}>En retard</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: totalRetard > 0 ? C.rouge : C.vert }}>{nb(totalRetard)} <span style={{ fontSize: 11 }}>{cur}</span></div>
              <div style={{ fontSize: 11.5, color: C.grisClair }}>{fiches.filter((f) => f.situation === "retard").length} client(s)</div>
            </div>
          </div>
        )}

        {charge && ouvert && (
          <DetailCredit f={ouvert} paiements={paiements} workspace={workspace} cur={cur} onRetour={() => setOuvertId(null)} onChange={recharger} ouvrirMessage={setMessage} />
        )}
        {charge && !ouvert && onglet === "relancer" && <OngletARelancer fiches={fiches} cur={cur} onOuvrir={setOuvertId} onRelancer={relancer} />}
        {charge && !ouvert && onglet === "tous" && <OngletTous fiches={fiches} cur={cur} onOuvrir={setOuvertId} />}
        {charge && !ouvert && onglet === "nouveau" && (
          <FormulaireNouveau workspace={workspace} cur={cur} onCree={async (id) => { await recharger(); setOnglet("tous"); setOuvertId(id); }} />
        )}
      </div>

      {message && (
        <FenetreMessage
          titre={message.titre}
          texteInitial={message.texte}
          tel={message.tel}
          onEnvoye={() => marquerRelance(message.echeanceId)}
          onFermer={() => setMessage(null)}
        />
      )}
    </div>
  );
}
