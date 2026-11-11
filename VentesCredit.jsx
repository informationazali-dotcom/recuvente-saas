import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  Ventes à crédit — version premium.
//  Le client verse un acompte, puis paie le reste par mensualités (montant fixe
//  par mois OU nombre de mois), au même jour du mois que l'acompte par défaut.
//  RecuVente garde l'échéancier, signale les clients à relancer (J-3 et retard),
//  prépare les messages WhatsApp et génère un échéancier PDF.
//  Rappel quotidien au marchand : lib/credits.js (cron api/cron-daily.js).
// ============================================================================

const T = {
  encre: "#0E1714", encre2: "#1C2B25", fond: "#F4F2EC", carte: "#FFFFFF", ligne: "#ECE7DB",
  or: "#C9A24A", orClair: "#F3E6C4", vert: "#17834A", vertClair: "#E3F4EA",
  rouge: "#D0442F", rougeClair: "#FCE9E5", ambre: "#D98A0B", ambreClair: "#FDF0D9",
  gris: "#6B7168", grisClair: "#9AA096", wa: "#25D366",
};
const OMBRE = "0 1px 2px rgba(14,23,20,0.04), 0 8px 24px rgba(14,23,20,0.06)";
const JOURS_ALERTE = 3;
const MODES = ["Espèces", "Mobile Money", "Virement", "Chèque"];

// ---------------------------------------------------------------------------
//  Outils
// ---------------------------------------------------------------------------
function nb(x) { return Math.round(Number(x || 0)).toLocaleString("fr-FR").replace(/[  ]/g, " "); }
function lireNombre(v) { return Number(String(v ?? "").replace(/[^\d]/g, "")) || 0; }
function devise(code) { return code === "XOF" || code === "XAF" || !code ? "F CFA" : code; }
function cleanPhoneForWhatsApp(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (String(tel || "").trim().startsWith("+") && d.length >= 9) return d;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("225")) return d;
  return "225" + d;
}
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function aujourdhui() { return isoLocal(new Date()); }
function versDate(iso) { const [a, m, j] = String(iso).split("-").map(Number); return new Date(a, m - 1, j); }
function joursEntre(a, b) { return Math.round((versDate(b) - versDate(a)) / 86400000); }
function ajouterMois(iso, n) {
  const d = versDate(iso);
  const jour = d.getDate();
  const c = new Date(d.getFullYear(), d.getMonth() + n, 1);
  c.setDate(Math.min(jour, new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()));
  return isoLocal(c);
}
function dLong(iso) { return iso ? versDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : ""; }
function dCourt(iso) { return iso ? versDate(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""; }
function nomMois(iso) { return iso ? versDate(iso).toLocaleDateString("fr-FR", { month: "long" }) : ""; }
function initiales(nom) { return String(nom || "?").trim().split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase() || "").join("") || "?"; }

// Plan « montant fixe par mois » : autant de mois que nécessaire, la dernière mensualité prend le reste.
function planParMontant(reste, mensualite, premiere) {
  const m = Math.max(1, Math.floor(mensualite));
  const lignes = [];
  let restant = reste;
  for (let i = 0; restant > 0 && i < 120; i++) {
    const montant = Math.min(m, restant);
    lignes.push({ date_echeance: ajouterMois(premiere, i), montant_du: montant });
    restant -= montant;
  }
  return lignes;
}
// Plan « nombre de mois » : parts égales arrondies au millier, la dernière ajuste.
function planParMois(reste, nbMois, premiere) {
  const n = Math.max(1, Math.min(120, Math.floor(nbMois) || 1));
  const base = Math.floor(reste / n / 1000) * 1000 || Math.floor(reste / n);
  const lignes = [];
  let cumul = 0;
  for (let i = 0; i < n; i++) {
    const montant = i === n - 1 ? reste - cumul : base;
    cumul += montant;
    lignes.push({ date_echeance: ajouterMois(premiere, i), montant_du: montant });
  }
  return lignes;
}

// ---------------------------------------------------------------------------
//  Styles
// ---------------------------------------------------------------------------
const S = {
  carte: { background: T.carte, borderRadius: 20, padding: 18, marginBottom: 14, boxShadow: OMBRE, border: `1px solid ${T.ligne}` },
  titreCarte: { fontSize: 14, fontWeight: 900, color: T.encre, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 },
  numero: { width: 26, height: 26, borderRadius: 999, background: T.encre, color: T.or, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 },
  label: { fontSize: 11.5, fontWeight: 700, color: T.gris, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  champ: { width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${T.ligne}`, fontSize: 15, boxSizing: "border-box", background: "#FCFBF8", marginBottom: 14, fontFamily: "inherit", color: T.encre, outline: "none" },
  champMontant: { fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" },
  boutonOr: { background: `linear-gradient(135deg, #DDB866, ${T.or})`, color: T.encre, border: "none", borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 18px rgba(201,162,74,0.35)" },
  boutonClair: { background: "white", color: T.encre, border: `1.5px solid ${T.ligne}`, borderRadius: 12, padding: "11px 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  boutonWa: { background: T.wa, color: "white", border: "none", borderRadius: 12, padding: "11px 14px", fontWeight: 800, fontSize: 13.5, cursor: "pointer" },
  puce: (actif) => ({ padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${actif ? T.encre : T.ligne}`, background: actif ? T.encre : "white", color: actif ? "white" : T.encre, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }),
};

function Pastille({ couleur, fond, children }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: couleur, background: fond, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>{children}</span>;
}

function Anneau({ pourcent, taille = 96, epaisseur = 9, couleur = T.or, children }) {
  const r = (taille - epaisseur) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: taille, height: taille, flexShrink: 0 }}>
      <svg width={taille} height={taille} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={taille / 2} cy={taille / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={epaisseur} fill="none" />
        <circle cx={taille / 2} cy={taille / 2} r={r} stroke={couleur} strokeWidth={epaisseur} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pourcent)) / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

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
    setErreur(c.error ? c.error.message : "");
    setCredits(c.data || []);
    setEcheances(e.data || []);
    setPaiements(p.data || []);
    setCharge(true);
  }, [workspace?.id]);

  useEffect(() => { recharger(); }, [recharger]);

  const fiches = useMemo(() => {
    const auj = aujourdhui();
    return credits.map((cr) => {
      const ech = echeances.filter((e) => e.credit_id === cr.id).sort((a, b) => a.numero - b.numero);
      const histo = paiements.filter((p) => p.credit_id === cr.id);
      const reste = Math.max(0, ech.reduce((s, e) => s + Math.max(0, Number(e.montant_du) - Number(e.montant_paye)), 0));
      const paye = Number(cr.prix_total) - reste;
      const impayees = ech.filter((e) => Number(e.montant_paye) < Number(e.montant_du));
      const enRetard = impayees.filter((e) => e.date_echeance < auj);
      const montantEnRetard = enRetard.reduce((s, e) => s + Number(e.montant_du) - Number(e.montant_paye), 0);
      const prochaine = impayees.find((e) => e.date_echeance >= auj) || null;
      const premiereDue = impayees[0] || null;
      const joursAvant = prochaine ? joursEntre(auj, prochaine.date_echeance) : null;
      let situation = "a_jour";
      if (cr.statut === "annule") situation = "annule";
      else if (reste <= 0) situation = "solde";
      else if (enRetard.length > 0) situation = "retard";
      else if (joursAvant !== null && joursAvant <= JOURS_ALERTE) situation = "bientot";
      const relanceAujourdhui = premiereDue?.dernier_rappel_le === auj;
      const pourcent = Number(cr.prix_total) > 0 ? Math.round((paye / Number(cr.prix_total)) * 100) : 0;
      return { ...cr, ech, histo, reste, paye, pourcent, prochaine, premiereDue, joursAvant, enRetard, montantEnRetard, situation, relanceAujourdhui };
    });
  }, [credits, echeances, paiements]);

  return { fiches, charge, erreur, recharger };
}

// ---------------------------------------------------------------------------
//  Messages WhatsApp — naturels, sans signature
// ---------------------------------------------------------------------------
function nomClient(f) { return String(f.client_nom || "").trim() || "cher client"; }

function messageRappel(f, cur) {
  if (f.situation === "retard") {
    const e = f.enRetard[0];
    return f.enRetard.length > 1
      ? `Bonjour ${nomClient(f)}, j'espère que vous allez bien. Sauf erreur de notre part, ${f.enRetard.length} mensualités de votre ${f.article} ne sont pas encore réglées, pour un total de ${nb(f.montantEnRetard)} ${cur}. Pouvez-vous me dire quand vous pourrez passer les régler ? Merci beaucoup.`
      : `Bonjour ${nomClient(f)}, j'espère que vous allez bien. Sauf erreur de notre part, la mensualité de ${nb(f.montantEnRetard)} ${cur} prévue le ${dLong(e.date_echeance)} pour votre ${f.article} n'est pas encore réglée. Pouvez-vous me dire quand vous pourrez passer la régler ? Merci beaucoup.`;
  }
  const e = f.prochaine || f.premiereDue;
  const du = Number(e.montant_du) - Number(e.montant_paye);
  const quand = f.joursAvant === 0 ? "aujourd'hui" : f.joursAvant === 1 ? "demain" : `le ${dLong(e.date_echeance)}`;
  return `Bonjour ${nomClient(f)}, j'espère que vous allez bien. Petit rappel : la mensualité de ${nb(du)} ${cur} pour votre ${f.article} est prévue ${quand}. Merci de prévoir le règlement. Bonne journée à vous.`;
}
function messageRecu(f, montant, cur) {
  const apres = Math.max(0, f.reste - montant);
  if (apres <= 0) return `Bonjour ${nomClient(f)}, nous avons bien reçu votre paiement de ${nb(montant)} ${cur}. Votre ${f.article} est maintenant entièrement réglé. Merci pour votre confiance et votre sérieux.`;
  return `Bonjour ${nomClient(f)}, nous avons bien reçu votre paiement de ${nb(montant)} ${cur}, merci. Il vous reste ${nb(apres)} ${cur} à régler pour votre ${f.article}.`;
}
function messageEcheancier(f, cur) {
  const lignes = f.ech.map((e, i) => `${i + 1}. ${dCourt(e.date_echeance)} : ${nb(e.montant_du)} ${cur}`).join("\n");
  return `Bonjour ${nomClient(f)}, voici le récapitulatif de votre achat.\n\nArticle : ${f.article}\nPrix total : ${nb(f.prix_total)} ${cur}\nAcompte versé : ${nb(f.acompte)} ${cur}\nReste à payer : ${nb(f.reste)} ${cur}\n\nVos mensualités :\n${lignes}\n\nMerci pour votre confiance.`;
}
function messageRecuComptant(f, cur) {
  return `Bonjour ${nomClient(f)}, merci pour votre achat. Nous confirmons avoir bien reçu votre paiement de ${nb(f.prix_total)} ${cur} pour votre ${f.article}, réglé le ${dLong(f.date_vente)}. Merci pour votre confiance.`;
}
function ouvrirWhatsApp(tel, texte) {
  window.open(`https://wa.me/${cleanPhoneForWhatsApp(tel)}?text=${encodeURIComponent(texte)}`, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
//  PDF échéancier (professionnel, à envoyer ou imprimer)
// ---------------------------------------------------------------------------
async function telechargerEcheancierPDF(f, workspace, cur) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, marge = 16;
  const or = [201, 162, 74], encre = [14, 23, 20], gris = [107, 113, 104];
  doc.setFillColor(...encre); doc.rect(0, 0, L, 44, "F");
  doc.setFillColor(...or); doc.rect(0, 44, L, 1.4, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(String(workspace?.name || "").toUpperCase(), marge, 19);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...or);
  const comptant = f.type_vente === "comptant";
  doc.text(comptant ? "REÇU DE VENTE" : "ÉCHÉANCIER DE PAIEMENT", marge, 27);
  doc.setTextColor(220, 220, 220); doc.setFontSize(9);
  doc.text(`Émis le ${dCourt(aujourdhui())}`, marge, 34);
  doc.text(`Réf. ${String(f.id).slice(0, 8).toUpperCase()}`, L - marge, 34, { align: "right" });

  let y = 58;
  doc.setTextColor(...gris); doc.setFontSize(8.5); doc.text("CLIENT", marge, y); doc.text("ARTICLE", 110, y);
  doc.setTextColor(...encre); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(String(f.client_nom || ""), marge, y + 7);
  doc.text(doc.splitTextToSize(String(f.article || ""), 85), 110, y + 7);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...gris);
  if (f.client_tel) doc.text(String(f.client_tel), marge, y + 13);
  if (f.client_adresse) doc.text(String(f.client_adresse), marge, y + 18.5);
  doc.text(`${comptant ? "Date de la vente" : "Date de l'acompte"} : ${dCourt(f.date_vente)}`, 110, y + 18.5);

  y = 88;
  const blocs = comptant
    ? [["Prix total", f.prix_total], ["Montant payé", f.paye], ["Paiement", f.histo?.[0]?.mode || "Comptant"], ["Reste à payer", 0]]
    : [["Prix total", f.prix_total], ["Acompte versé", f.acompte], ["Déjà payé", f.paye], ["Reste à payer", f.reste]];
  const lb = (L - 2 * marge - 9) / 4;
  blocs.forEach(([t, v], i) => {
    const x = marge + i * (lb + 3);
    if (i === 3) doc.setFillColor(251, 244, 226); else doc.setFillColor(246, 244, 238);
    doc.roundedRect(x, y, lb, 22, 2.5, 2.5, "F");
    doc.setFontSize(8); doc.setTextColor(...gris); doc.text(t.toUpperCase(), x + 4, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...encre);
    doc.text(typeof v === "number" ? `${nb(v)} ${cur}` : String(v), x + 4, y + 16);
    doc.setFont("helvetica", "normal");
  });

  y = 124;
  if (comptant) {
    doc.setFillColor(227, 244, 234); doc.roundedRect(marge, y, L - 2 * marge, 16, 2.5, 2.5, "F");
    doc.setTextColor(23, 131, 74); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`PAYÉ INTÉGRALEMENT — ${nb(f.prix_total)} ${cur}`, L / 2, y + 10, { align: "center" });
    y += 16;
  }
  if (!comptant) {
  doc.setFillColor(...encre); doc.rect(marge, y, L - 2 * marge, 9, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("N°", marge + 4, y + 6); doc.text("DATE", marge + 18, y + 6); doc.text("MONTANT", 120, y + 6, { align: "right" });
  doc.text("PAYÉ", 155, y + 6, { align: "right" }); doc.text("STATUT", L - marge - 4, y + 6, { align: "right" });
  y += 9;
  const auj = aujourdhui();
  doc.setFont("helvetica", "normal");
  f.ech.forEach((e, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(250, 249, 245); doc.rect(marge, y, L - 2 * marge, 9, "F"); }
    const du = Number(e.montant_du) - Number(e.montant_paye);
    const statut = du <= 0 ? "Payé" : e.date_echeance < auj ? "En retard" : Number(e.montant_paye) > 0 ? "Partiel" : "À venir";
    doc.setTextColor(...encre); doc.setFontSize(9.5);
    doc.text(String(i + 1), marge + 4, y + 6);
    doc.text(dCourt(e.date_echeance), marge + 18, y + 6);
    doc.text(`${nb(e.montant_du)} ${cur}`, 120, y + 6, { align: "right" });
    doc.text(nb(e.montant_paye), 155, y + 6, { align: "right" });
    if (statut === "Payé") doc.setTextColor(23, 131, 74); else if (statut === "En retard") doc.setTextColor(208, 68, 47); else doc.setTextColor(...gris);
    doc.setFont("helvetica", "bold"); doc.text(statut, L - marge - 4, y + 6, { align: "right" }); doc.setFont("helvetica", "normal");
    y += 9;
  });
  doc.setDrawColor(...or); doc.setLineWidth(0.6); doc.line(marge, y + 2, L - marge, y + 2);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...encre); doc.setFontSize(10.5);
  doc.text(`Total des mensualités : ${nb(f.ech.reduce((s, e) => s + Number(e.montant_du), 0))} ${cur}`, L - marge, y + 10, { align: "right" });
  }

  y += 30;
  if (y > 255) { doc.addPage(); y = 30; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...gris);
  doc.text("Signature du client", marge, y); doc.text("Pour le vendeur", L - marge, y, { align: "right" });
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.line(marge, y + 18, marge + 60, y + 18); doc.line(L - marge - 60, y + 18, L - marge, y + 18);
  doc.setFontSize(7.5); doc.text("Document généré avec RecuVente", L / 2, 290, { align: "center" });
  doc.save(`${comptant ? "Recu" : "Echeancier"}-${String(f.client_nom || "client").replace(/[^\w-]+/g, "_")}.pdf`);
}

// ---------------------------------------------------------------------------
//  Feuilles (bas d'écran)
// ---------------------------------------------------------------------------
function Feuille({ titre, onFermer, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(14,23,20,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.fond, width: "100%", maxWidth: 560, borderRadius: "24px 24px 0 0", padding: "10px 18px 22px", boxSizing: "border-box", maxHeight: "92vh", overflowY: "auto", animation: "rvMonte 0.25s ease" }}>
        <div style={{ width: 42, height: 5, background: "#D9D4C7", borderRadius: 99, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 17, color: T.encre }}>{titre}</div>
          <button onClick={onFermer} aria-label="Fermer" style={{ background: "white", border: `1px solid ${T.ligne}`, width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer", color: T.encre }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FeuilleMessage({ titre, texteInitial, tel, onEnvoye, onFermer }) {
  const [texte, setTexte] = useState(texteInitial);
  const [copie, setCopie] = useState(false);
  return (
    <Feuille titre={titre} onFermer={onFermer}>
      <div style={{ background: "#DCF8C6", borderRadius: "16px 16px 4px 16px", padding: 2, marginBottom: 10, boxShadow: OMBRE }}>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} style={{ width: "100%", boxSizing: "border-box", border: "none", background: "transparent", padding: 12, fontSize: 14.5, lineHeight: 1.5, fontFamily: "inherit", color: "#111", resize: "vertical", outline: "none" }} />
      </div>
      <div style={{ fontSize: 12, color: T.gris, marginBottom: 12 }}>Tu peux modifier le texte avant de l'envoyer.</div>
      {!tel && <div style={{ color: T.rouge, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Aucun numéro WhatsApp enregistré pour ce client.</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button style={{ ...S.boutonClair, flex: 1 }} onClick={() => { navigator.clipboard?.writeText(texte); setCopie(true); }}>{copie ? "✓ Copié" : "Copier"}</button>
        <button style={{ ...S.boutonWa, flex: 2, padding: 14, fontSize: 15, opacity: tel ? 1 : 0.45 }} disabled={!tel} onClick={() => { ouvrirWhatsApp(tel, texte); onEnvoye?.(); onFermer(); }}>Envoyer sur WhatsApp</button>
      </div>
    </Feuille>
  );
}

function FeuilleEncaissement({ f, workspace, cur, onFermer, onFait, cible }) {
  // « cible » : la mensualité cochée « Payée » (on règle celle-là en priorité).
  const echCible = cible ? f.ech.find((e) => e.id === cible) : null;
  const dueCible = echCible ? Number(echCible.montant_du) - Number(echCible.montant_paye) : 0;
  const prochaineDue = f.premiereDue ? Number(f.premiereDue.montant_du) - Number(f.premiereDue.montant_paye) : 0;
  const suggestions = [
    echCible && dueCible > 0 && { l: `Mensualité du ${dCourt(echCible.date_echeance)}`, v: dueCible },
    !echCible && prochaineDue > 0 && { l: "Une mensualité", v: prochaineDue },
    f.montantEnRetard > 0 && f.montantEnRetard !== prochaineDue && { l: "Tout le retard", v: f.montantEnRetard },
    f.reste > 0 && f.reste !== prochaineDue && { l: "Solder tout", v: f.reste },
  ].filter(Boolean);
  const [m, setM] = useState(suggestions[0]?.v || 0);
  const [mode, setMode] = useState("Espèces");
  const [date, setDate] = useState(aujourdhui());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function valider() {
    setErreur("");
    if (m <= 0) return setErreur("Indique le montant reçu.");
    if (m > f.reste) return setErreur(`Le client ne doit plus que ${nb(f.reste)} ${cur}.`);
    setEnCours(true);
    try {
      // La mensualité cochée d'abord (s'il y en a une), puis les plus anciennes.
      const ordre = echCible ? [echCible, ...f.ech.filter((e) => e.id !== echCible.id)] : f.ech;
      const repartition = [];
      let aRepartir = m;
      for (const e of ordre) {
        if (aRepartir <= 0) break;
        const du = Number(e.montant_du) - Number(e.montant_paye);
        if (du <= 0) continue;
        const part = Math.min(du, aRepartir);
        aRepartir -= part;
        repartition.push({ echeance_id: e.id, montant: part });
      }
      const { error } = await supabase.from("paiements_credit").insert([{ workspace_id: workspace.id, credit_id: f.id, montant: m, mode, date_paiement: date, type: "mensualite", repartition }]);
      if (error) throw error;
      for (const r of repartition) {
        const e = f.ech.find((x) => x.id === r.echeance_id);
        const { error: e2 } = await supabase.from("echeances_credit").update({ montant_paye: Number(e.montant_paye) + r.montant }).eq("id", e.id);
        if (e2) throw e2;
      }
      if (m >= f.reste) await supabase.from("ventes_credit").update({ statut: "solde", updated_at: new Date().toISOString() }).eq("id", f.id);
      onFait(messageRecu(f, m, cur));
    } catch (e) {
      setErreur(e.message || "Erreur d'enregistrement.");
      setEnCours(false);
    }
  }

  return (
    <Feuille titre={echCible ? `Mensualité du ${dCourt(echCible.date_echeance)}` : "Encaisser un paiement"} onFermer={onFermer}>
      <div style={{ ...S.carte, padding: 16 }}>
        <label style={S.label}>Montant reçu</label>
        <div style={{ position: "relative" }}>
          <input autoFocus inputMode="numeric" value={m ? nb(m) : ""} onChange={(e) => setM(lireNombre(e.target.value))} placeholder="0" style={{ ...S.champ, ...S.champMontant, paddingRight: 70, fontSize: 26 }} />
          <span style={{ position: "absolute", right: 14, top: 18, fontWeight: 800, color: T.grisClair }}>{cur}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: -4 }}>
          {suggestions.map((s) => <button key={s.l} onClick={() => setM(s.v)} style={S.puce(m === s.v)}>{s.l} · {nb(s.v)}</button>)}
        </div>
      </div>
      <div style={{ ...S.carte, padding: 16 }}>
        <label style={S.label}>Payé par</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {MODES.map((x) => <button key={x} onClick={() => setMode(x)} style={S.puce(mode === x)}>{x}</button>)}
        </div>
        <label style={S.label}>Date du paiement</label>
        <input type="date" style={{ ...S.champ, marginBottom: 0 }} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {m > 0 && m <= f.reste && (
        <div style={{ background: T.vertClair, color: T.vert, borderRadius: 14, padding: "12px 14px", fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>
          Après ce paiement : {f.reste - m > 0 ? `reste ${nb(f.reste - m)} ${cur}` : "crédit entièrement soldé 🎉"}
        </div>
      )}
      {erreur && <div style={{ color: T.rouge, fontWeight: 700, marginBottom: 10 }}>{erreur}</div>}
      <button style={{ ...S.boutonOr, width: "100%", opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={valider}>
        {enCours ? "Enregistrement…" : `Valider ${m ? nb(m) + " " + cur : "le paiement"}`}
      </button>
    </Feuille>
  );
}

// ---------------------------------------------------------------------------
//  Liste
// ---------------------------------------------------------------------------
function PastilleSituation({ f }) {
  if (f.type_vente === "comptant") return <Pastille couleur={T.vert} fond={T.vertClair}>✓ Payé comptant</Pastille>;
  if (f.situation === "retard") return <Pastille couleur={T.rouge} fond={T.rougeClair}>● En retard</Pastille>;
  if (f.situation === "bientot") return <Pastille couleur={T.ambre} fond={T.ambreClair}>● {f.joursAvant === 0 ? "Aujourd'hui" : f.joursAvant === 1 ? "Demain" : `Dans ${f.joursAvant} jours`}</Pastille>;
  if (f.situation === "solde") return <Pastille couleur={T.vert} fond={T.vertClair}>✓ Soldé</Pastille>;
  if (f.situation === "annule") return <Pastille couleur={T.gris} fond="#EEECE6">Annulé</Pastille>;
  return <Pastille couleur="#3E7A57" fond="#EAF3EC">● À jour</Pastille>;
}

function Avatar({ nom, situation }) {
  const fond = situation === "retard" ? T.rougeClair : situation === "bientot" ? T.ambreClair : situation === "solde" ? T.vertClair : T.orClair;
  const couleur = situation === "retard" ? T.rouge : situation === "bientot" ? T.ambre : situation === "solde" ? T.vert : "#8A6A1E";
  return <div style={{ width: 46, height: 46, borderRadius: 14, background: fond, color: couleur, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, flexShrink: 0 }}>{initiales(nom)}</div>;
}

function CarteCredit({ f, cur, onOuvrir, onRelancer }) {
  const couleurBarre = f.situation === "retard" ? T.rouge : f.situation === "solde" ? T.vert : T.or;
  const aRelancer = f.situation === "retard" || f.situation === "bientot";
  return (
    <div style={{ ...S.carte, cursor: "pointer", padding: 16 }} onClick={onOuvrir}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Avatar nom={f.client_nom} situation={f.situation} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 15.5, color: T.encre, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.client_nom}</div>
            <PastilleSituation f={f} />
          </div>
          <div style={{ fontSize: 13, color: T.gris, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.article}</div>
        </div>
      </div>
      <div style={{ height: 7, background: "#EFEBE1", borderRadius: 99, margin: "14px 0 9px", overflow: "hidden" }}>
        <div style={{ width: `${f.pourcent}%`, height: "100%", borderRadius: 99, background: couleurBarre, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}>
        <span style={{ color: T.gris }}>{f.pourcent}% payé</span>
        <span style={{ fontWeight: 900, color: f.reste > 0 ? T.encre : T.vert }}>Reste {nb(f.reste)} {cur}</span>
      </div>
      {f.situation === "retard" && (
        <div style={{ marginTop: 10, background: T.rougeClair, color: T.rouge, borderRadius: 12, padding: "9px 12px", fontSize: 13, fontWeight: 700 }}>
          {nb(f.montantEnRetard)} {cur} en retard depuis le {dCourt(f.enRetard[0].date_echeance)}
        </div>
      )}
      {f.prochaine && f.situation !== "retard" && f.situation !== "annule" && (
        <div style={{ marginTop: 10, fontSize: 13, color: T.encre }}>
          Prochaine mensualité : <b>{nb(Number(f.prochaine.montant_du) - Number(f.prochaine.montant_paye))} {cur}</b> le {dCourt(f.prochaine.date_echeance)}
        </div>
      )}
      {onRelancer && aRelancer && (
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
          <button style={S.boutonWa} onClick={() => onRelancer(f)}>Relancer sur WhatsApp</button>
          {f.relanceAujourdhui && <span style={{ fontSize: 12.5, color: T.vert, fontWeight: 800 }}>✓ Relancé aujourd'hui</span>}
        </div>
      )}
    </div>
  );
}

function Vide({ icone, fond, titre, texte, children }) {
  return (
    <div style={{ ...S.carte, textAlign: "center", padding: "36px 22px" }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: fond, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{icone}</div>
      <div style={{ fontWeight: 900, fontSize: 17, marginTop: 14, color: T.encre }}>{titre}</div>
      <div style={{ fontSize: 13.5, color: T.gris, marginTop: 6, lineHeight: 1.5 }}>{texte}</div>
      {children}
    </div>
  );
}

function VueARelancer({ fiches, cur, onOuvrir, onRelancer, onNouveau }) {
  const retard = fiches.filter((f) => f.situation === "retard").sort((a, b) => a.enRetard[0].date_echeance.localeCompare(b.enRetard[0].date_echeance));
  const bientot = fiches.filter((f) => f.situation === "bientot").sort((a, b) => a.joursAvant - b.joursAvant);
  if (fiches.length === 0) {
    return (
      <Vide icone="🤝" fond={T.orClair} titre="Aucune vente à crédit pour l'instant" texte="Enregistre ton premier client : acompte, mensualités et dates. RecuVente te préviendra avant chaque paiement.">
        <button style={{ ...S.boutonOr, marginTop: 18 }} onClick={onNouveau}>+ Nouvelle vente à crédit</button>
      </Vide>
    );
  }
  if (retard.length === 0 && bientot.length === 0) {
    return <Vide icone="✓" fond={T.vertClair} titre="Tout le monde est à jour" texte={`Les clients apparaissent ici ${JOURS_ALERTE} jours avant leur date de paiement, et dès qu'un paiement est en retard.`} />;
  }
  const Titre = ({ couleur, children }) => <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: couleur, margin: "6px 4px 10px" }}>{children}</div>;
  return (
    <>
      {retard.length > 0 && <Titre couleur={T.rouge}>En retard · {retard.length}</Titre>}
      {retard.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} onRelancer={onRelancer} />)}
      {bientot.length > 0 && <Titre couleur={T.ambre}>Paiement dans {JOURS_ALERTE} jours ou moins · {bientot.length}</Titre>}
      {bientot.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} onRelancer={onRelancer} />)}
    </>
  );
}

function VueTous({ fiches, cur, onOuvrir }) {
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("en_cours");
  const liste = fiches.filter((f) => {
    if (filtre === "en_cours" && (f.situation === "solde" || f.situation === "annule")) return false;
    if (filtre === "retard" && f.situation !== "retard") return false;
    if (filtre === "soldes" && f.situation !== "solde") return false;
    const q = recherche.trim().toLowerCase();
    return !q || [f.client_nom, f.client_tel, f.article].some((x) => String(x || "").toLowerCase().includes(q));
  });
  return (
    <>
      <input style={{ ...S.champ, background: "white" }} placeholder="Rechercher un client, un numéro, un article…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
        {[["en_cours", "En cours"], ["retard", "En retard"], ["soldes", "Soldés"], ["tous", "Tous"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltre(k)} style={S.puce(filtre === k)}>{l}</button>
        ))}
      </div>
      {liste.length === 0 && <div style={{ textAlign: "center", color: T.grisClair, padding: 36 }}>Aucun crédit ici.</div>}
      {liste.map((f) => <CarteCredit key={f.id} f={f} cur={cur} onOuvrir={() => onOuvrir(f.id)} />)}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Registre des ventes (accueil de l'espace dédié)
// ---------------------------------------------------------------------------
function debutPeriode(cle) {
  const d = new Date();
  if (cle === "jour") return isoLocal(d);
  if (cle === "semaine") { const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return isoLocal(d); }
  if (cle === "mois") return isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  return "0000-01-01";
}

function VueRegistre({ fiches, cur, onOuvrir, onNouveau }) {
  const [periode, setPeriode] = useState("mois");
  const [recherche, setRecherche] = useState("");
  const debut = debutPeriode(periode);
  const ventes = fiches
    .filter((f) => f.situation !== "annule" && f.date_vente >= debut)
    .filter((f) => { const q = recherche.trim().toLowerCase(); return !q || [f.client_nom, f.client_tel, f.article].some((x) => String(x || "").toLowerCase().includes(q)); })
    .sort((a, b) => (b.date_vente + b.created_at).localeCompare(a.date_vente + a.created_at));
  const encaisse = fiches.filter((f) => f.situation !== "annule").reduce((s, f) => s + f.histo.filter((p) => p.date_paiement >= debut).reduce((t, p) => t + Number(p.montant), 0), 0);
  const chiffre = ventes.reduce((s, f) => s + Number(f.prix_total), 0);
  const nbComptant = ventes.filter((f) => f.type_vente === "comptant").length;
  const nbCredit = ventes.length - nbComptant;

  const groupes = [];
  for (const f of ventes) {
    const g = groupes[groupes.length - 1];
    if (g && g.date === f.date_vente) g.items.push(f); else groupes.push({ date: f.date_vente, items: [f] });
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
        {[["jour", "Aujourd'hui"], ["semaine", "Cette semaine"], ["mois", "Ce mois"], ["tout", "Tout"]].map(([k, l]) => (
          <button key={k} onClick={() => setPeriode(k)} style={S.puce(periode === k)}>{l}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={{ ...S.carte, marginBottom: 0, padding: 14 }}>
          <div style={S.label}>Ventes</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.encre, letterSpacing: "-0.01em" }}>{nb(chiffre)}</div>
          <div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{ventes.length} vente{ventes.length > 1 ? "s" : ""} · {nbComptant} comptant · {nbCredit} crédit</div>
        </div>
        <div style={{ ...S.carte, marginBottom: 0, padding: 14 }}>
          <div style={S.label}>Encaissé</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.vert, letterSpacing: "-0.01em" }}>{nb(encaisse)}</div>
          <div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{cur} reçus sur la période</div>
        </div>
      </div>
      <input style={{ ...S.champ, background: "white" }} placeholder="Rechercher un client, un numéro, un article…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />

      {ventes.length === 0 && (
        <Vide icone="🧾" fond={T.orClair} titre="Aucune vente sur cette période" texte="Enregistre chaque vente faite au bureau, au comptant ou à crédit. Tout apparaît ici, jour par jour.">
          <button style={{ ...S.boutonOr, marginTop: 18 }} onClick={onNouveau}>+ Enregistrer une vente</button>
        </Vide>
      )}

      {groupes.map((g) => (
        <div key={g.date} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 4px 8px" }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: T.encre, textTransform: "capitalize" }}>{g.date === aujourdhui() ? "Aujourd'hui" : dLong(g.date)}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.gris }}>{nb(g.items.reduce((s, f) => s + Number(f.prix_total), 0))} {cur}</div>
          </div>
          <div style={{ ...S.carte, padding: "4px 16px" }}>
            {g.items.map((f, i) => (
              <div key={f.id} onClick={() => onOuvrir(f.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${T.ligne}` : "none", cursor: "pointer" }}>
                <Avatar nom={f.client_nom} situation={f.type_vente === "comptant" ? "solde" : f.situation} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14.5, color: T.encre, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.client_nom}</div>
                  <div style={{ fontSize: 12.5, color: T.gris, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.article}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14.5, color: T.encre }}>{nb(f.prix_total)}</div>
                  {f.type_vente === "comptant"
                    ? <div style={{ fontSize: 11.5, fontWeight: 800, color: T.vert }}>Comptant</div>
                    : <div style={{ fontSize: 11.5, fontWeight: 800, color: f.situation === "retard" ? T.rouge : f.reste > 0 ? "#9A7420" : T.vert }}>{f.reste > 0 ? `Crédit · reste ${nb(f.reste)}` : "Crédit soldé"}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Nouvelle vente
// ---------------------------------------------------------------------------
function ChampMontant({ valeur, onChange, cur, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <input inputMode="numeric" value={valeur ? nb(valeur) : ""} onChange={(e) => onChange(lireNombre(e.target.value))} placeholder={placeholder}
        style={{ ...S.champ, ...S.champMontant, paddingRight: 64 }} />
      <span style={{ position: "absolute", right: 14, top: 17, fontWeight: 800, fontSize: 13, color: T.grisClair }}>{cur}</span>
    </div>
  );
}

function VueNouvelle({ workspace, cur, onCree, avecComptant }) {
  const [typeVente, setTypeVente] = useState(avecComptant ? "comptant" : "credit");
  const [client, setClient] = useState({ nom: "", tel: "", adresse: "" });
  const [article, setArticle] = useState("");
  const [prix, setPrix] = useState(0);
  const [acompte, setAcompte] = useState(0);
  const [modeAcompte, setModeAcompte] = useState("Espèces");
  const [dateAcompte, setDateAcompte] = useState(aujourdhui());
  const [typePlan, setTypePlan] = useState("montant");
  const [mensualite, setMensualite] = useState(0);
  const [nbMois, setNbMois] = useState(3);
  const [premiere, setPremiere] = useState(ajouterMois(aujourdhui(), 1));
  const [premiereTouchee, setPremiereTouchee] = useState(false);
  const [notes, setNotes] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const comptant = typeVente === "comptant";
  const reste = comptant ? 0 : Math.max(0, prix - acompte);
  const pctAcompte = prix > 0 ? Math.round((acompte / prix) * 100) : 0;

  // Par défaut, le client paie chaque mois au même jour que son acompte.
  useEffect(() => { if (!premiereTouchee && dateAcompte) setPremiere(ajouterMois(dateAcompte, 1)); }, [dateAcompte, premiereTouchee]);

  const plan = useMemo(() => {
    if (reste <= 0) return [];
    if (typePlan === "montant") return mensualite > 0 ? planParMontant(reste, mensualite, premiere) : [];
    return planParMois(reste, nbMois, premiere);
  }, [reste, typePlan, mensualite, nbMois, premiere]);

  const jourDuMois = premiere ? versDate(premiere).getDate() : null;
  const montantsEgaux = plan.length > 0 && plan.every((l) => l.montant_du === plan[0].montant_du);

  async function enregistrer() {
    setErreur("");
    if (!client.nom.trim()) return setErreur("Indique le nom du client.");
    if (!article.trim()) return setErreur("Indique l'article vendu.");
    if (prix <= 0) return setErreur("Indique le prix total.");
    if (!comptant && acompte > prix) return setErreur("L'acompte dépasse le prix total.");
    if (reste > 0 && plan.length === 0) return setErreur("Indique le montant à payer chaque mois.");
    setEnCours(true);
    try {
      const { data: cr, error } = await supabase.from("ventes_credit").insert([{
        workspace_id: workspace.id, client_nom: client.nom.trim(), client_tel: client.tel.trim() || null,
        client_adresse: client.adresse.trim() || null, article: article.trim(), prix_total: prix, acompte: comptant ? prix : acompte,
        date_vente: dateAcompte, notes: notes.trim() || null, statut: reste > 0 ? "en_cours" : "solde", type_vente: typeVente,
      }]).select().single();
      if (error) throw error;
      if (plan.length > 0) {
        const { error: e2 } = await supabase.from("echeances_credit").insert(plan.map((l, i) => ({
          workspace_id: workspace.id, credit_id: cr.id, numero: i + 1, date_echeance: l.date_echeance, montant_du: l.montant_du,
        })));
        if (e2) throw e2;
      }
      const verse = comptant ? prix : acompte;
      if (verse > 0) {
        await supabase.from("paiements_credit").insert([{ workspace_id: workspace.id, credit_id: cr.id, montant: verse, mode: modeAcompte, date_paiement: dateAcompte, type: comptant ? "comptant" : "acompte" }]);
      }
      onCree(cr.id);
    } catch (e) {
      setErreur(e.message || "Erreur d'enregistrement.");
      setEnCours(false);
    }
  }

  return (
    <div style={{ paddingBottom: 110 }}>
      {avecComptant && <div style={{ display: "flex", background: "white", border: `1px solid ${T.ligne}`, borderRadius: 18, padding: 5, marginBottom: 14, boxShadow: OMBRE }}>
        {[["comptant", "Paiement comptant", "Le client paie tout"], ["credit", "Vente à crédit", "Acompte + mensualités"]].map(([k, l, d]) => (
          <button key={k} onClick={() => setTypeVente(k)} style={{ flex: 1, padding: "12px 8px", borderRadius: 14, border: "none", cursor: "pointer", background: typeVente === k ? `linear-gradient(135deg, ${T.encre2}, ${T.encre})` : "transparent", color: typeVente === k ? "white" : T.gris, textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 14.5, color: typeVente === k ? (k === "credit" ? T.or : "white") : T.encre }}>{l}</div>
            <div style={{ fontSize: 11.5, marginTop: 2, opacity: 0.75 }}>{d}</div>
          </button>
        ))}
      </div>}
      <div style={S.carte}>
        <div style={S.titreCarte}><span style={S.numero}>1</span>Le client</div>
        <label style={S.label}>Nom complet</label>
        <input style={S.champ} value={client.nom} onChange={(e) => setClient({ ...client, nom: e.target.value })} placeholder="Ex. M. Kouassi Jean" />
        <label style={S.label}>Numéro WhatsApp</label>
        <input style={S.champ} inputMode="tel" value={client.tel} onChange={(e) => setClient({ ...client, tel: e.target.value })} placeholder="Ex. 07 00 00 00 00" />
        <label style={S.label}>Ville / adresse <span style={{ textTransform: "none", fontWeight: 500 }}>(facultatif)</span></label>
        <input style={{ ...S.champ, marginBottom: 0 }} value={client.adresse} onChange={(e) => setClient({ ...client, adresse: e.target.value })} placeholder="Ex. Yamoussoukro" />
      </div>

      <div style={S.carte}>
        <div style={S.titreCarte}><span style={S.numero}>2</span>L'article et le prix</div>
        <label style={S.label}>Article vendu</label>
        <input style={S.champ} value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Ex. Groupe électrogène Perkins 60 kVA" />
        <label style={S.label}>Prix total</label>
        <ChampMontant valeur={prix} onChange={setPrix} cur={cur} placeholder="7 500 000" />
      </div>

      {comptant && (
        <div style={S.carte}>
          <div style={S.titreCarte}><span style={S.numero}>3</span>Le paiement</div>
          <label style={S.label}>Payé par</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {MODES.map((x) => <button key={x} onClick={() => setModeAcompte(x)} style={S.puce(modeAcompte === x)}>{x}</button>)}
          </div>
          <label style={S.label}>Date de la vente</label>
          <input type="date" style={{ ...S.champ, marginBottom: 0 }} value={dateAcompte} onChange={(e) => setDateAcompte(e.target.value)} />
        </div>
      )}

      {!comptant && <div style={S.carte}>
        <div style={S.titreCarte}><span style={S.numero}>3</span>L'acompte versé</div>
        <label style={S.label}>Montant de l'acompte</label>
        <ChampMontant valeur={acompte} onChange={setAcompte} cur={cur} placeholder="5 500 000" />
        <div style={{ display: "flex", gap: 8, marginTop: -4, marginBottom: 14, flexWrap: "wrap" }}>
          {[["La moitié", 1 / 2], ["Les 2/3", 2 / 3], ["Le 1/3", 1 / 3]].map(([l, x]) => {
            const v = Math.round((prix * x) / 1000) * 1000;
            return <button key={l} onClick={() => prix > 0 && setAcompte(v)} style={S.puce(prix > 0 && acompte === v)}>{l}</button>;
          })}
        </div>
        <label style={S.label}>Payé par</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {MODES.map((x) => <button key={x} onClick={() => setModeAcompte(x)} style={S.puce(modeAcompte === x)}>{x}</button>)}
        </div>
        <label style={S.label}>Date de l'acompte</label>
        <input type="date" style={{ ...S.champ, marginBottom: 0 }} value={dateAcompte} onChange={(e) => setDateAcompte(e.target.value)} />
        {prix > 0 && (
          <div style={{ marginTop: 14, background: T.fond, borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.gris, marginBottom: 8, gap: 8 }}>
              <span>Acompte : <b style={{ color: T.encre }}>{pctAcompte}%</b></span>
              <span>Reste : <b style={{ color: T.encre, fontSize: 15 }}>{nb(reste)} {cur}</b></span>
            </div>
            <div style={{ height: 8, background: "#E6E1D4", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, pctAcompte)}%`, height: "100%", background: `linear-gradient(90deg, #DDB866, ${T.or})`, borderRadius: 99, transition: "width 0.4s" }} />
            </div>
          </div>
        )}
      </div>}

      {reste > 0 && (
        <div style={S.carte}>
          <div style={S.titreCarte}><span style={S.numero}>4</span>Le plan de paiement</div>
          <div style={{ display: "flex", background: T.fond, borderRadius: 14, padding: 4, marginBottom: 16 }}>
            {[["montant", "Montant par mois"], ["mois", "Nombre de mois"]].map(([k, l]) => (
              <button key={k} onClick={() => setTypePlan(k)} style={{ flex: 1, padding: "11px 8px", borderRadius: 11, border: "none", fontWeight: 800, fontSize: 13.5, cursor: "pointer", background: typePlan === k ? "white" : "transparent", color: typePlan === k ? T.encre : T.gris, boxShadow: typePlan === k ? OMBRE : "none" }}>{l}</button>
            ))}
          </div>
          {typePlan === "montant" ? (
            <>
              <label style={S.label}>Le client paie chaque mois</label>
              <ChampMontant valeur={mensualite} onChange={setMensualite} cur={cur} placeholder="500 000" />
            </>
          ) : (
            <>
              <label style={S.label}>Nombre de mois</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => <button key={n} onClick={() => setNbMois(n)} style={S.puce(nbMois === n)}>{n} mois</button>)}
              </div>
            </>
          )}
          <label style={S.label}>Premier paiement mensuel le</label>
          <input type="date" style={S.champ} value={premiere} onChange={(e) => { setPremiere(e.target.value); setPremiereTouchee(true); }} />
          {jourDuMois && <div style={{ fontSize: 12.5, color: T.gris, marginTop: -6, marginBottom: 14 }}>Puis le <b>{jourDuMois}</b> de chaque mois{!premiereTouchee ? " (même jour que l'acompte)" : ""}.</div>}

          {plan.length > 0 && (
            <div style={{ background: `linear-gradient(135deg, ${T.encre2}, ${T.encre})`, borderRadius: 18, padding: 16, color: "white" }}>
              <div style={{ fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.or, fontWeight: 800 }}>Échéancier</div>
              <div style={{ fontSize: 19, fontWeight: 900, marginTop: 4 }}>
                {plan.length} mensualité{plan.length > 1 ? "s" : ""}{montantsEgaux ? ` de ${nb(plan[0].montant_du)} ${cur}` : ""}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>Du {dCourt(plan[0].date_echeance)} au {dCourt(plan[plan.length - 1].date_echeance)}</div>
              <div style={{ marginTop: 14 }}>
                {plan.map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 999, border: `1.5px solid ${T.or}`, color: T.or, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 14 }}>{dCourt(l.date_echeance)}</div>
                    <div style={{ fontWeight: 900, fontSize: 14.5 }}>{nb(l.montant_du)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={S.carte}>
        <label style={S.label}>Note interne <span style={{ textTransform: "none", fontWeight: 500 }}>(facultatif)</span></label>
        <textarea style={{ ...S.champ, marginBottom: 0, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. garant, numéro de série du groupe, conditions particulières…" />
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 5, background: "rgba(244,242,236,0.94)", backdropFilter: "blur(10px)", borderTop: `1px solid ${T.ligne}`, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {erreur && <div style={{ color: T.rouge, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{erreur}</div>}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.gris, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{comptant ? "Montant encaissé" : "Reste à payer"}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: T.encre, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nb(comptant ? prix : reste)} {cur}{plan.length > 0 && <span style={{ fontSize: 12.5, color: T.gris, fontWeight: 700 }}> · {plan.length} mois</span>}
              </div>
            </div>
            <button style={{ ...S.boutonOr, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={enregistrer}>{enCours ? "…" : "Enregistrer"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Agenda des encaissements — tuiles-calendrier en 3D
// ---------------------------------------------------------------------------
const MOIS_COURTS = ["JANV.", "FÉVR.", "MARS", "AVR.", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];
const CSS_3D = `
.rv-scene{perspective:1100px;perspective-origin:50% 30%}
.rv-tuile{transform-style:preserve-3d;transform:rotateX(9deg) rotateY(-11deg) translateZ(0);transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .45s;will-change:transform}
.rv-tuile:hover,.rv-tuile:active{transform:rotateX(0) rotateY(0) translateZ(26px) translateY(-6px)}
.rv-tuile .rv-reflet{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(125deg,rgba(255,255,255,.55) 0%,rgba(255,255,255,0) 38%,rgba(255,255,255,0) 70%,rgba(255,255,255,.18) 100%);pointer-events:none}
.rv-defile{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:18px 6px 30px;scrollbar-width:none}
.rv-defile::-webkit-scrollbar{display:none}
.rv-defile>*{scroll-snap-align:start;flex:0 0 auto}
@keyframes rvPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,162,74,.55)}50%{box-shadow:0 0 0 8px rgba(201,162,74,0)}}
`;

function etatEcheance(e, auj) {
  const du = Number(e.montant_du) - Number(e.montant_paye);
  if (du <= 0) return "payee";
  if (e.date_echeance < auj) return "retard";
  if (joursEntre(auj, e.date_echeance) <= JOURS_ALERTE) return "bientot";
  return "avenir";
}

// Une page de calendrier en relief : anneaux, bandeau du mois, grand jour, montant.
function TuileDate3D({ e, client, article, cur, onClick, compact, onPayer }) {
  const auj = aujourdhui();
  const etat = etatEcheance(e, auj);
  const d = versDate(e.date_echeance);
  const du = Number(e.montant_du) - Number(e.montant_paye);
  const palette = {
    payee: { bandeau: `linear-gradient(135deg, #2FA567, ${T.vert})`, texte: T.vert, libelle: "Payée" },
    retard: { bandeau: "linear-gradient(135deg, #E8604A, #B8321F)", texte: T.rouge, libelle: `Retard · ${joursEntre(e.date_echeance, auj)} j` },
    bientot: { bandeau: "linear-gradient(135deg, #E9C46A, #B88A25)", texte: "#9A7420", libelle: joursEntre(auj, e.date_echeance) === 0 ? "Aujourd'hui" : joursEntre(auj, e.date_echeance) === 1 ? "Demain" : `Dans ${joursEntre(auj, e.date_echeance)} jours` },
    avenir: { bandeau: `linear-gradient(135deg, #2B3F36, ${T.encre})`, texte: T.gris, libelle: `Dans ${joursEntre(auj, e.date_echeance)} jours` },
  }[etat];
  const largeur = compact ? 132 : 158;
  return (
    <div className="rv-tuile" onClick={onClick} style={{
      position: "relative", width: largeur, borderRadius: 20, background: "linear-gradient(180deg,#FFFFFF 0%,#F7F3EA 100%)", cursor: onClick ? "pointer" : "default",
      border: "1px solid rgba(201,162,74,0.45)",
      boxShadow: "0 1px 0 rgba(255,255,255,.9) inset, 0 -3px 0 rgba(14,23,20,.06) inset, 0 2px 4px rgba(14,23,20,.08), 0 18px 34px -12px rgba(14,23,20,.35), 10px 22px 40px -18px rgba(14,23,20,.30)",
      opacity: etat === "payee" ? 0.78 : 1,
    }}>
      <div style={{ position: "absolute", top: -7, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 46, zIndex: 2 }}>
        {[0, 1].map((i) => <div key={i} style={{ width: 9, height: 18, borderRadius: 6, background: "linear-gradient(180deg,#E7D3A1,#9A7420)", boxShadow: "0 2px 3px rgba(0,0,0,.3)" }} />)}
      </div>
      <div style={{ background: palette.bandeau, borderRadius: "20px 20px 0 0", padding: "13px 12px 9px", color: "white", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.16em" }}>{MOIS_COURTS[d.getMonth()]} {d.getFullYear()}</div>
      </div>
      <div style={{ textAlign: "center", padding: compact ? "6px 10px 12px" : "8px 12px 14px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.grisClair, textTransform: "uppercase", letterSpacing: "0.12em" }}>{d.toLocaleDateString("fr-FR", { weekday: "long" })}</div>
        <div style={{ fontSize: compact ? 46 : 56, lineHeight: 1, fontWeight: 900, letterSpacing: "-0.04em", margin: "4px 0 6px", background: "linear-gradient(180deg,#1C2B25 30%,#556A60 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textShadow: "0 2px 0 rgba(255,255,255,.6)" }}>{d.getDate()}</div>
        {client && <div style={{ fontSize: 13, fontWeight: 900, color: T.encre, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</div>}
        {article && <div style={{ fontSize: 11, color: T.gris, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{article}</div>}
        <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(201,162,74,.6),transparent)", margin: "9px 0 8px" }} />
        <div style={{ fontSize: 15.5, fontWeight: 900, color: T.encre, letterSpacing: "-0.01em" }}>{nb(etat === "payee" ? e.montant_du : du)} <span style={{ fontSize: 10, color: T.grisClair }}>{cur}</span></div>
        <div style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, fontWeight: 900, color: palette.texte, background: etat === "avenir" ? "#EEEBE3" : "rgba(255,255,255,.7)", border: `1px solid ${etat === "avenir" ? "transparent" : palette.texte}`, borderRadius: 999, padding: "3px 9px", animation: etat === "bientot" ? "rvPulse 2s infinite" : "none" }}>{etat === "payee" ? "✓ " : ""}{palette.libelle}</div>
        {onPayer && etat !== "payee" && (
          <button onClick={(ev) => { ev.stopPropagation(); onPayer(); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 10, padding: "9px 6px", borderRadius: 12, border: "1.5px solid rgba(23,131,74,.35)", background: "white", color: T.vert, fontWeight: 900, fontSize: 12.5, cursor: "pointer", position: "relative", zIndex: 3 }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, border: `2px solid ${T.vert}`, display: "inline-block" }} />Payée
          </button>
        )}
      </div>
      <div className="rv-reflet" />
    </div>
  );
}

async function telechargerAgendaPDF(lignes, workspace, cur) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, marge = 16;
  const or = [201, 162, 74], encre = [14, 23, 20], gris = [107, 113, 104];
  const auj = aujourdhui();
  const total = lignes.reduce((s, l) => s + l.du, 0);
  const enRetard = lignes.filter((l) => l.e.date_echeance < auj).reduce((s, l) => s + l.du, 0);
  const entete = () => {
    doc.setFillColor(...encre); doc.rect(0, 0, L, 44, "F");
    doc.setFillColor(...or); doc.rect(0, 44, L, 1.4, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(String(workspace?.name || "").toUpperCase(), marge, 19);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...or);
    doc.text("AGENDA DES ENCAISSEMENTS À VENIR", marge, 27);
    doc.setTextColor(220, 220, 220); doc.setFontSize(9);
    doc.text(`Édité le ${dCourt(auj)}`, marge, 34);
  };
  entete();
  let y = 56;
  const blocs = [["Total attendu", `${nb(total)} ${cur}`], ["Dont en retard", `${nb(enRetard)} ${cur}`], ["Paiements", String(lignes.length)]];
  const lb = (L - 2 * marge - 6) / 3;
  blocs.forEach(([t, v], i) => {
    const x = marge + i * (lb + 3);
    if (i === 1 && enRetard > 0) doc.setFillColor(252, 233, 229); else doc.setFillColor(246, 244, 238);
    doc.roundedRect(x, y, lb, 20, 2.5, 2.5, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...gris); doc.text(t.toUpperCase(), x + 4, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...encre); doc.text(v, x + 4, y + 15);
  });
  y += 30;
  let moisCourant = null;
  for (const l of lignes) {
    const cleMois = l.e.date_echeance < auj ? "retard" : l.e.date_echeance.slice(0, 7);
    if (cleMois !== moisCourant) {
      moisCourant = cleMois;
      if (y > 255) { doc.addPage(); entete(); y = 56; }
      const totalMois = lignes.filter((x) => (x.e.date_echeance < auj ? "retard" : x.e.date_echeance.slice(0, 7)) === cleMois).reduce((s, x) => s + x.du, 0);
      doc.setFillColor(...(cleMois === "retard" ? [208, 68, 47] : encre)); doc.roundedRect(marge, y, L - 2 * marge, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(cleMois === "retard" ? "EN RETARD" : versDate(l.e.date_echeance).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase(), marge + 4, y + 6.8);
      doc.text(`${nb(totalMois)} ${cur}`, L - marge - 4, y + 6.8, { align: "right" });
      y += 13;
    }
    if (y > 278) { doc.addPage(); entete(); y = 56; }
    const d = versDate(l.e.date_echeance);
    doc.setFillColor(251, 244, 226); doc.roundedRect(marge, y, 16, 13, 2, 2, "F");
    doc.setTextColor(...encre); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(String(d.getDate()), marge + 8, y + 7.2, { align: "center" });
    doc.setFontSize(6.5); doc.setTextColor(154, 116, 32); doc.text(MOIS_COURTS[d.getMonth()], marge + 8, y + 11, { align: "center" });
    doc.setTextColor(...encre); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(String(l.f.client_nom || ""), marge + 21, y + 5.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gris);
    doc.text(`${String(l.f.article || "").slice(0, 60)}${l.f.client_tel ? "  ·  " + l.f.client_tel : ""}  ·  mensualité ${l.e.numero}/${l.f.ech.length}`, marge + 21, y + 10.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...(l.e.date_echeance < auj ? [208, 68, 47] : encre));
    doc.text(`${nb(l.du)} ${cur}`, L - marge, y + 8, { align: "right" });
    doc.setDrawColor(236, 231, 219); doc.setLineWidth(0.2); doc.line(marge + 21, y + 14.5, L - marge, y + 14.5);
    y += 17;
  }
  doc.setFontSize(7.5); doc.setTextColor(...gris); doc.setFont("helvetica", "normal");
  doc.text("Document généré avec RecuVente", L / 2, 290, { align: "center" });
  doc.save(`Agenda-encaissements-${auj}.pdf`);
}

function VueAgenda({ fiches, workspace, cur, onOuvrir, onPayer }) {
  const auj = aujourdhui();
  const [pdf, setPdf] = useState(false);
  const lignes = useMemo(() => {
    const out = [];
    for (const f of fiches) {
      if (f.situation === "annule") continue;
      for (const e of f.ech) {
        const du = Number(e.montant_du) - Number(e.montant_paye);
        if (du > 0) out.push({ f, e, du });
      }
    }
    return out.sort((a, b) => a.e.date_echeance.localeCompare(b.e.date_echeance));
  }, [fiches]);

  const groupes = [];
  for (const l of lignes) {
    const cle = l.e.date_echeance < auj ? "retard" : l.e.date_echeance.slice(0, 7);
    const g = groupes[groupes.length - 1];
    if (g && g.cle === cle) g.items.push(l); else groupes.push({ cle, items: [l] });
  }
  const total = lignes.reduce((s, l) => s + l.du, 0);

  if (lignes.length === 0) {
    return <Vide icone="📅" fond={T.orClair} titre="Aucun paiement à venir" texte="Dès qu'une vente à crédit est enregistrée, ses dates de paiement apparaissent ici, mois par mois." />;
  }

  return (
    <>
      <div style={{ ...S.carte, display: "flex", alignItems: "center", gap: 12, background: `linear-gradient(135deg, #FFFDF7, ${T.orClair})`, borderColor: "rgba(201,162,74,.45)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.label}>Total attendu</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.encre, letterSpacing: "-0.02em" }}>{nb(total)} <span style={{ fontSize: 12, color: T.gris }}>{cur}</span></div>
          <div style={{ fontSize: 12, color: T.gris }}>{lignes.length} paiement{lignes.length > 1 ? "s" : ""} prévus</div>
        </div>
        <button style={{ ...S.boutonOr, padding: "12px 14px", fontSize: 13.5, opacity: pdf ? 0.6 : 1 }} disabled={pdf} onClick={async () => { setPdf(true); try { await telechargerAgendaPDF(lignes, workspace, cur); } finally { setPdf(false); } }}>
          {pdf ? "…" : "📄 Agenda PDF"}
        </button>
      </div>
      {groupes.map((g) => (
        <div key={g.cle} style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 4px" }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: g.cle === "retard" ? T.rouge : T.encre, textTransform: "capitalize" }}>
              {g.cle === "retard" ? "En retard" : versDate(g.cle + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: g.cle === "retard" ? T.rouge : "#9A7420" }}>{nb(g.items.reduce((s, l) => s + l.du, 0))} {cur}</div>
          </div>
          <div className="rv-scene">
            <div className="rv-defile">
              {g.items.map((l) => (
                <TuileDate3D key={l.e.id} e={l.e} client={l.f.client_nom} article={l.f.article} cur={cur} onClick={() => onOuvrir(l.f.id)} onPayer={() => onPayer(l.f, l.e.id)} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Fiche d'un crédit
// ---------------------------------------------------------------------------
function VueDetail({ f, workspace, cur, onRetour, onChange, ouvrirMessage, ouvrirEncaissement }) {
  const auj = aujourdhui();
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const [editionDate, setEditionDate] = useState(null);
  const actif = f.reste > 0 && f.situation !== "annule";

  async function changerStatut(statut, question) {
    if (question && !window.confirm(question)) return;
    await supabase.from("ventes_credit").update({ statut, updated_at: new Date().toISOString() }).eq("id", f.id);
    onChange();
  }
  async function supprimer() {
    if (!window.confirm("Supprimer définitivement ce crédit et tout son historique ?")) return;
    await supabase.from("ventes_credit").delete().eq("id", f.id);
    await onChange();
    onRetour();
  }
  async function annulerPaiement(p) {
    if (!window.confirm(`Annuler ce paiement de ${nb(p.montant)} ${cur} du ${dCourt(p.date_paiement)} ? Le reste à payer sera recalculé.`)) return;
    for (const r of p.repartition || []) {
      const e = f.ech.find((x) => x.id === r.echeance_id);
      if (e) await supabase.from("echeances_credit").update({ montant_paye: Math.max(0, Number(e.montant_paye) - Number(r.montant)) }).eq("id", e.id);
    }
    await supabase.from("paiements_credit").delete().eq("id", p.id);
    if (f.statut === "solde") await supabase.from("ventes_credit").update({ statut: "en_cours", updated_at: new Date().toISOString() }).eq("id", f.id);
    onChange();
  }
  async function changerDate(e, nouvelle) {
    if (!nouvelle || nouvelle === e.date_echeance) return;
    await supabase.from("echeances_credit").update({ date_echeance: nouvelle }).eq("id", e.id);
    onChange();
  }

  const actions = [
    actif && f.premiereDue && { i: "💬", l: "Rappel", fn: () => ouvrirMessage({ titre: "Rappel de paiement", texte: messageRappel(f, cur), tel: f.client_tel, echeanceId: f.premiereDue.id }) },
    f.type_vente === "comptant"
      ? { i: "💬", l: "Reçu WhatsApp", fn: () => ouvrirMessage({ titre: "Envoyer le reçu", texte: messageRecuComptant(f, cur), tel: f.client_tel }) }
      : { i: "📅", l: "Échéancier", fn: () => ouvrirMessage({ titre: "Envoyer l'échéancier", texte: messageEcheancier(f, cur), tel: f.client_tel }) },
    { i: "📄", l: pdfEnCours ? "…" : f.type_vente === "comptant" ? "Reçu PDF" : "PDF", fn: async () => { setPdfEnCours(true); try { await telechargerEcheancierPDF(f, workspace, cur); } finally { setPdfEnCours(false); } } },
  ].filter(Boolean);

  return (
    <div>
      <button style={{ background: "transparent", border: "none", padding: "4px 0", marginBottom: 12, color: T.gris, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }} onClick={onRetour}>← Retour</button>

      <div style={{ background: `radial-gradient(120% 140% at 100% 0%, #2B3F36 0%, ${T.encre} 60%)`, borderRadius: 24, padding: 20, color: "white", boxShadow: "0 14px 36px rgba(14,23,20,0.28)", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.01em" }}>{f.client_nom}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>{f.client_tel || "Pas de numéro"}{f.client_adresse ? ` · ${f.client_adresse}` : ""}</div>
          </div>
          <PastilleSituation f={f} />
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 18 }}>
          <Anneau pourcent={f.pourcent} couleur={f.situation === "retard" ? "#FF8A73" : f.situation === "solde" ? "#7FD6A3" : T.or}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{f.pourcent}%</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>PAYÉ</div>
          </Anneau>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.or, fontWeight: 800 }}>{f.article}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{f.type_vente === "comptant" ? "Montant payé" : "Reste à payer"}</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}>{nb(f.type_vente === "comptant" ? f.prix_total : f.reste)} <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{cur}</span></div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{f.type_vente === "comptant" ? `Vente au comptant du ${dCourt(f.date_vente)}` : `sur ${nb(f.prix_total)} · acompte ${nb(f.acompte)}`}</div>
          </div>
        </div>
        {f.situation === "retard" && (
          <div style={{ marginTop: 16, background: "rgba(208,68,47,0.22)", border: "1px solid rgba(255,138,115,0.35)", borderRadius: 14, padding: "10px 12px", fontSize: 13.5, fontWeight: 700, color: "#FFC2B5" }}>
            {nb(f.montantEnRetard)} {cur} en retard depuis le {dCourt(f.enRetard[0].date_echeance)}
          </div>
        )}
        {f.prochaine && f.situation !== "retard" && actif && (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 12px", fontSize: 13.5 }}>
            Prochaine mensualité : <b>{nb(Number(f.prochaine.montant_du) - Number(f.prochaine.montant_paye))} {cur}</b> le {dLong(f.prochaine.date_echeance)}
          </div>
        )}
        {actif && <button style={{ ...S.boutonOr, width: "100%", marginTop: 16 }} onClick={() => ouvrirEncaissement(f)}>Encaisser un paiement</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${actions.length}, 1fr)`, gap: 10, marginBottom: 14 }}>
        {actions.map((a) => (
          <button key={a.l} onClick={a.fn} style={{ background: "white", border: `1px solid ${T.ligne}`, borderRadius: 16, padding: "14px 6px", cursor: "pointer", boxShadow: OMBRE, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 20 }}>{a.i}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.encre }}>{a.l}</span>
          </button>
        ))}
      </div>

      {f.type_vente !== "comptant" && f.ech.length > 0 && (
        <div style={{ margin: "4px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 4px" }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: T.encre }}>Calendrier des paiements</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.gris }}>Glisse →</div>
          </div>
          <div className="rv-scene">
            <div className="rv-defile">
              {f.ech.map((e) => <TuileDate3D key={e.id} e={e} cur={cur} compact onPayer={actif ? () => ouvrirEncaissement(f, e.id) : null} />)}
            </div>
          </div>
        </div>
      )}

      {f.type_vente !== "comptant" && <div style={S.carte}>
        <div style={{ ...S.titreCarte, justifyContent: "space-between" }}>
          <span>Échéancier</span>
          <span style={{ fontSize: 12, color: T.gris, fontWeight: 700 }}>{f.ech.filter((e) => Number(e.montant_paye) >= Number(e.montant_du)).length} / {f.ech.length} payées</span>
        </div>
        {f.ech.length === 0 && <div style={{ fontSize: 13.5, color: T.gris }}>Payé en une seule fois.</div>}
        {f.ech.map((e, i) => {
          const du = Number(e.montant_du) - Number(e.montant_paye);
          const payee = du <= 0;
          const retard = !payee && e.date_echeance < auj;
          const partiel = !payee && Number(e.montant_paye) > 0;
          const estProchaine = f.prochaine?.id === e.id && !retard;
          const couleur = payee ? T.vert : retard ? T.rouge : estProchaine ? T.or : "#CFC9BA";
          return (
            <div key={e.id} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: i === f.ech.length - 1 ? 0 : 16 }}>
              {i < f.ech.length - 1 && <div style={{ position: "absolute", left: 13, top: 28, bottom: 0, width: 2, background: payee ? "rgba(23,131,74,0.35)" : T.ligne }} />}
              <div style={{ width: 28, height: 28, borderRadius: 999, flexShrink: 0, background: payee ? T.vert : "white", border: `2.5px solid ${couleur}`, color: payee ? "white" : couleur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, zIndex: 1, boxShadow: estProchaine ? `0 0 0 5px ${T.orClair}` : "none", boxSizing: "border-box" }}>
                {payee ? "✓" : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  {editionDate === e.id ? (
                    <input type="date" autoFocus defaultValue={e.date_echeance} onBlur={(ev) => { setEditionDate(null); changerDate(e, ev.target.value); }} style={{ ...S.champ, marginBottom: 0, padding: "6px 10px", fontSize: 14, width: "auto" }} />
                  ) : (
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: payee ? T.gris : T.encre, display: "flex", alignItems: "center", gap: 8 }}>
                      {dCourt(e.date_echeance)}
                      {!payee && actif && <button onClick={() => setEditionDate(e.id)} title="Modifier la date" style={{ border: "none", background: T.fond, color: T.gris, borderRadius: 8, padding: "2px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Modifier</button>}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 900, color: payee ? T.gris : T.encre, whiteSpace: "nowrap" }}>{nb(e.montant_du)}</div>
                    {actif && !payee && (
                      <button onClick={() => ouvrirEncaissement(f, e.id)} title="Marquer cette mensualité payée" aria-label="Marquer payée" style={{ width: 28, height: 28, borderRadius: 9, border: `2px solid ${retard ? T.rouge : T.vert}`, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.vert, fontSize: 15, fontWeight: 900, padding: 0, flexShrink: 0 }} />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 2, fontWeight: 700, color: payee ? T.vert : retard ? T.rouge : partiel ? T.ambre : estProchaine ? "#9A7420" : T.grisClair }}>
                  {payee ? "Payée" : retard ? `En retard · reste ${nb(du)}` : partiel ? `Partielle · reste ${nb(du)}` : estProchaine ? (f.joursAvant === 0 ? "Aujourd'hui" : f.joursAvant === 1 ? "Demain" : `Dans ${f.joursAvant} jours`) : "À venir"}
                </div>
              </div>
            </div>
          );
        })}
      </div>}

      <div style={S.carte}>
        <div style={S.titreCarte}>Paiements reçus</div>
        {f.histo.length === 0 && <div style={{ fontSize: 13.5, color: T.gris }}>Aucun paiement enregistré.</div>}
        {f.histo.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? `1px solid ${T.ligne}` : "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: p.type === "acompte" ? T.orClair : T.vertClair, color: p.type === "acompte" ? "#8A6A1E" : T.vert, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900 }}>{p.type === "acompte" ? "★" : "↓"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.encre }}>{p.type === "acompte" ? "Acompte" : p.type === "comptant" ? "Paiement comptant" : "Mensualité"}</div>
              <div style={{ fontSize: 12.5, color: T.gris }}>{dCourt(p.date_paiement)}{p.mode ? ` · ${p.mode}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 900, color: T.vert, fontSize: 14.5 }}>+{nb(p.montant)}</div>
              {p.type === "mensualite" && Array.isArray(p.repartition) && (
                <button onClick={() => annulerPaiement(p)} style={{ background: "none", border: "none", padding: 0, marginTop: 2, color: T.grisClair, fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Annuler</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {f.notes && <div style={{ ...S.carte, fontSize: 13.5, color: T.gris }}><b style={{ color: T.encre }}>Note : </b>{f.notes}</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
        {f.situation === "annule"
          ? <button style={S.boutonClair} onClick={() => changerStatut(f.reste > 0 ? "en_cours" : "solde")}>Réactiver le suivi</button>
          : f.reste > 0 && <button style={S.boutonClair} onClick={() => changerStatut("annule", "Annuler ce crédit ? Il ne sera plus suivi ni relancé.")}>Annuler le crédit</button>}
        <button style={{ ...S.boutonClair, color: T.rouge }} onClick={supprimer}>Supprimer</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Panneau principal
// ---------------------------------------------------------------------------
export default function VentesCredit({ workspace, onClose, espaceDedie = false, entete = null, onDeconnexion }) {
  const { fiches: toutes, charge, erreur, recharger } = useCredits(workspace);
  // Les ventes au comptant vont dans le registre ; les écrans « crédits » ne montrent que les crédits.
  const fiches = useMemo(() => toutes.filter((f) => f.type_vente !== "comptant"), [toutes]);
  const [onglet, setOnglet] = useState(espaceDedie ? "ventes" : "relancer");
  const [ouvertId, setOuvertId] = useState(null);
  const [message, setMessage] = useState(null);
  const [encaisser, setEncaisser] = useState(null);
  const cur = devise(workspace?.currency);
  const ouvert = toutes.find((f) => f.id === ouvertId) || null;

  const stats = useMemo(() => {
    const maintenant = new Date();
    const finMois = isoLocal(new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0));
    const actifs = fiches.filter((f) => f.situation !== "solde" && f.situation !== "annule");
    const enRetard = fiches.filter((f) => f.situation === "retard");
    return {
      actifs,
      reste: actifs.reduce((s, f) => s + f.reste, 0),
      retard: enRetard.reduce((s, f) => s + f.montantEnRetard, 0),
      nbRetard: enRetard.length,
      aRelancer: fiches.filter((f) => f.situation === "retard" || f.situation === "bientot").length,
      attenduMois: actifs.reduce((s, f) => s + f.ech.filter((e) => e.date_echeance <= finMois).reduce((t, e) => t + Math.max(0, Number(e.montant_du) - Number(e.montant_paye)), 0), 0),
      encaisse: fiches.reduce((s, f) => s + (f.situation === "annule" ? 0 : f.paye), 0),
      mois: nomMois(aujourdhui()),
    };
  }, [fiches]);

  async function marquerRelance(echeanceId) {
    if (!echeanceId) return;
    await supabase.from("echeances_credit").update({ dernier_rappel_le: aujourdhui() }).eq("id", echeanceId);
    recharger();
  }
  function relancer(f) {
    setMessage({ titre: "Rappel de paiement", texte: messageRappel(f, cur), tel: f.client_tel, echeanceId: f.premiereDue?.id });
  }

  const ONGLETS = [
    ...(espaceDedie ? [{ cle: "ventes", label: "Ventes" }] : []),
    { cle: "relancer", label: "À relancer", n: stats.aRelancer },
    { cle: "agenda", label: "Agenda" },
    { cle: "tous", label: espaceDedie ? "Crédits" : "Tous", n: stats.actifs.length },
    { cle: "nouveau", label: espaceDedie ? "+ Vente" : "+ Nouvelle vente" },
  ];
  const tuile = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 12 };
  const petitTitre = { fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.fond, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <style>{`@keyframes rvMonte{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}} .rv-cr input:focus,.rv-cr textarea:focus{border-color:${T.or}!important;box-shadow:0 0 0 4px rgba(201,162,74,0.15)} .rv-cr button{font-family:inherit} ${CSS_3D}`}</style>
      <div className="rv-cr">
        <div style={{ background: `radial-gradient(130% 120% at 100% 0%, #2B3F36 0%, ${T.encre} 55%)`, color: "white", padding: "16px 16px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {espaceDedie && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: "0.02em", padding: "8px 0", whiteSpace: "nowrap" }}>RECU<span style={{ color: T.or }}>VENTE</span></div>
                <div style={{ flex: 1, minWidth: 0 }}>{entete}</div>
                {onDeconnexion && <button onClick={onDeconnexion} title="Déconnexion" aria-label="Déconnexion" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", height: 36, padding: "0 12px", borderRadius: 10, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>⏻</button>}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.or, fontWeight: 800, textTransform: "uppercase" }}>{workspace?.name}</div>
                <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: "-0.01em", marginTop: 2 }}>{espaceDedie ? "Ventes & crédits" : "Ventes à crédit"}</div>
              </div>
              {!espaceDedie && <button onClick={onClose} aria-label="Fermer" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", color: "white", width: 38, height: 38, borderRadius: 12, fontSize: 20, cursor: "pointer" }}>×</button>}
            </div>

            {charge && !ouvert && onglet !== "nouveau" && onglet !== "ventes" && onglet !== "agenda" && fiches.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 10, marginTop: 16 }}>
                <div style={{ ...tuile, padding: 14, gridRow: "span 2" }}>
                  <div style={petitTitre}>Reste à encaisser</div>
                  <div style={{ fontSize: 25, fontWeight: 900, marginTop: 6, letterSpacing: "-0.02em" }}>{nb(stats.reste)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{cur} · {stats.actifs.length} client{stats.actifs.length > 1 ? "s" : ""}</div>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "12px 0" }} />
                  <div style={{ fontSize: 11, color: T.or, fontWeight: 800 }}>Attendu d'ici fin {stats.mois}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{nb(stats.attenduMois)} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{cur}</span></div>
                </div>
                <div style={{ ...tuile, ...(stats.retard > 0 ? { background: "rgba(208,68,47,0.2)", borderColor: "rgba(255,138,115,0.3)" } : {}) }}>
                  <div style={petitTitre}>En retard</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: stats.retard > 0 ? "#FFB4A5" : "white" }}>{nb(stats.retard)}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{stats.nbRetard} client{stats.nbRetard > 1 ? "s" : ""}</div>
                </div>
                <div style={tuile}>
                  <div style={petitTitre}>Déjà encaissé</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: "#9BE0B5" }}>{nb(stats.encaisse)}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{cur}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "14px 0 14px" }}>
              {ONGLETS.map((o) => {
                const actif = onglet === o.cle && !ouvertId;
                const estNouveau = o.cle === "nouveau";
                return (
                  <button key={o.cle} onClick={() => { setOnglet(o.cle); setOuvertId(null); }} style={{ flex: "0 0 auto", padding: "10px 15px", borderRadius: 999, border: estNouveau && !actif ? `1px solid ${T.or}` : "1px solid transparent", cursor: "pointer", fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", background: actif ? (estNouveau ? T.or : "white") : "rgba(255,255,255,0.08)", color: actif ? T.encre : estNouveau ? T.or : "rgba(255,255,255,0.85)" }}>
                    {o.label}
                    {o.n > 0 && <span style={{ marginLeft: 7, background: o.cle === "relancer" ? T.rouge : T.or, color: o.cle === "relancer" ? "white" : T.encre, borderRadius: 999, fontSize: 11, padding: "1px 7px", fontWeight: 900 }}>{o.n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 16px 60px", maxWidth: 720, margin: "0 auto" }}>
          {!charge && <div style={{ textAlign: "center", color: T.grisClair, padding: 50 }}>Chargement…</div>}
          {charge && erreur && <div style={{ ...S.carte, color: T.rouge }}>Impossible de charger les crédits : {erreur}</div>}
          {charge && ouvert && (
            <VueDetail f={ouvert} workspace={workspace} cur={cur} onRetour={() => setOuvertId(null)} onChange={recharger} ouvrirMessage={setMessage} ouvrirEncaissement={(f, cible) => setEncaisser({ f, cible: cible || null })} />
          )}
          {charge && !ouvert && onglet === "ventes" && <VueRegistre fiches={toutes} cur={cur} onOuvrir={setOuvertId} onNouveau={() => setOnglet("nouveau")} />}
          {charge && !ouvert && onglet === "relancer" && <VueARelancer fiches={fiches} cur={cur} onOuvrir={setOuvertId} onRelancer={relancer} onNouveau={() => setOnglet("nouveau")} />}
          {charge && !ouvert && onglet === "agenda" && <VueAgenda fiches={fiches} workspace={workspace} cur={cur} onOuvrir={setOuvertId} onPayer={(f, id) => setEncaisser({ f, cible: id })} />}
          {charge && !ouvert && onglet === "tous" && <VueTous fiches={fiches} cur={cur} onOuvrir={setOuvertId} />}
          {charge && !ouvert && onglet === "nouveau" && (
            <VueNouvelle workspace={workspace} cur={cur} avecComptant={espaceDedie} onCree={async (id) => { await recharger(); setOnglet(espaceDedie ? "ventes" : "tous"); setOuvertId(id); }} />
          )}
        </div>
      </div>

      {encaisser && (
        <FeuilleEncaissement f={encaisser.f} cible={encaisser.cible} workspace={workspace} cur={cur} onFermer={() => setEncaisser(null)}
          onFait={async (texte) => {
            const tel = encaisser.f.client_tel;
            setEncaisser(null);
            await recharger();
            if (tel) setMessage({ titre: "Confirmer le paiement au client", texte, tel });
          }} />
      )}
      {message && (
        <FeuilleMessage titre={message.titre} texteInitial={message.texte} tel={message.tel} onEnvoye={() => marquerRelance(message.echeanceId)} onFermer={() => setMessage(null)} />
      )}
    </div>
  );
}
