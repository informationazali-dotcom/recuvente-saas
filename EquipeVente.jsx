import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  Espace Équipe de vente — activité « Vente au comptant & à crédit ».
//  Trois profils :
//   • Responsable (owner/admin) : suit tous les clients par étapes, confie des
//     missions, voit le journal, invite les membres.
//   • Conseiller (rôle « conseiller ») : ses rencontres et visites du dépôt,
//     ses clients avec le prix minimum à respecter, ses comptes rendus.
//   • Représentant au bureau (rôle « bureau ») : ses passages au bureau (ses
//     ventes et crédits se font dans l'écran Ventes & crédits).
//  Notifications par WhatsApp (message déjà écrit), sans abonnement payant.
// ============================================================================

const T = {
  encre: "#0E1714", encre2: "#1C2B25", fond: "#F4F2EC", carte: "#FFFFFF", ligne: "#ECE7DB",
  or: "#C9A24A", orClair: "#F3E6C4", vert: "#17834A", vertClair: "#E3F4EA",
  rouge: "#D0442F", rougeClair: "#FCE9E5", ambre: "#D98A0B", ambreClair: "#FDF0D9",
  bleu: "#1D5C96", bleuClair: "#E7F0FA", violet: "#5B3E96", violetClair: "#EFEAF8",
  gris: "#6B7168", grisClair: "#9AA096", wa: "#25D366",
};
const OMBRE = "0 1px 2px rgba(14,23,20,0.04), 0 8px 24px rgba(14,23,20,0.06)";

export const ETAPES = [
  { cle: "nouveau", label: "Nouveau", couleur: T.bleu, fond: T.bleuClair },
  { cle: "visite", label: "Visite / rencontre", couleur: T.violet, fond: T.violetClair },
  { cle: "accord", label: "Accord", couleur: T.ambre, fond: T.ambreClair },
  { cle: "paye", label: "Payé", couleur: T.vert, fond: T.vertClair },
  { cle: "livre", label: "Livré", couleur: T.encre, fond: "#E9ECE8" },
  { cle: "perdu", label: "Perdu", couleur: T.rouge, fond: T.rougeClair },
];
const TYPES_MISSION = [
  { cle: "visite", label: "Visite du dépôt", icone: "🏭" },
  { cle: "rencontre", label: "Rencontre client", icone: "🤝" },
  { cle: "bureau", label: "Passage au bureau", icone: "🏢" },
  { cle: "appel", label: "Appel client", icone: "📞" },
  { cle: "livraison", label: "Livraison", icone: "🚚" },
  { cle: "autre", label: "Autre", icone: "📌" },
];
const RESULTATS = [
  { cle: "decide", label: "Client décidé", couleur: T.vert, fond: T.vertClair },
  { cle: "reflexion", label: "En réflexion", couleur: T.ambre, fond: T.ambreClair },
  { cle: "perdu", label: "Client perdu", couleur: T.rouge, fond: T.rougeClair },
];
export const ROLES_EQUIPE = {
  owner: "Responsable de l'équipe",
  admin: "Responsable de l'équipe",
  conseiller: "Conseiller et relation client",
  bureau: "Représentant au bureau",
};

const S = {
  carte: { background: T.carte, borderRadius: 20, padding: 16, marginBottom: 12, boxShadow: OMBRE, border: `1px solid ${T.ligne}` },
  label: { fontSize: 11.5, fontWeight: 700, color: T.gris, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  champ: { width: "100%", padding: "12px 13px", borderRadius: 12, border: `1.5px solid ${T.ligne}`, fontSize: 15, boxSizing: "border-box", background: "#FCFBF8", marginBottom: 12, fontFamily: "inherit", color: T.encre, outline: "none" },
  boutonOr: { background: `linear-gradient(135deg, #DDB866, ${T.or})`, color: T.encre, border: "none", borderRadius: 14, padding: "13px 18px", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 18px rgba(201,162,74,0.35)" },
  boutonNoir: { background: T.encre, color: "white", border: "none", borderRadius: 12, padding: "11px 14px", fontWeight: 800, fontSize: 13.5, cursor: "pointer" },
  boutonClair: { background: "white", color: T.encre, border: `1.5px solid ${T.ligne}`, borderRadius: 12, padding: "10px 13px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  boutonWa: { background: T.wa, color: "white", border: "none", borderRadius: 12, padding: "10px 13px", fontWeight: 800, fontSize: 13.5, cursor: "pointer" },
  puce: (actif) => ({ padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${actif ? T.encre : T.ligne}`, background: actif ? T.encre : "white", color: actif ? "white" : T.encre, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "0 0 auto" }),
  titreSection: { fontSize: 12, fontWeight: 900, color: T.gris, textTransform: "uppercase", letterSpacing: "0.08em", margin: "18px 2px 10px" },
};

// ---------------------------------------------------------------------------
//  Outils
// ---------------------------------------------------------------------------
function nb(x) { return Math.round(Number(x || 0)).toLocaleString("fr-FR").replace(/[  ]/g, " "); }
function lireNombre(v) { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n || null; }
function devise(code) { return code === "XOF" || code === "XAF" || !code ? "F CFA" : code; }
function telWa(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (String(tel || "").trim().startsWith("+") && d.length >= 9) return d;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("225")) return d;
  return "225" + d;
}
function ouvrirWhatsApp(tel, texte) {
  const n = telWa(tel);
  const url = n ? `https://wa.me/${n}?text=${encodeURIComponent(texte)}` : `https://wa.me/?text=${encodeURIComponent(texte)}`;
  window.open(url, "_blank");
}
function initiales(nom) { return String(nom || "?").trim().split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase() || "").join("") || "?"; }
function dateHeure(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function ilYa(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : `il y a ${j} jours`;
}
function versInputLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function estAujourdhui(iso) { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); }
function etapeDe(cle) { return ETAPES.find((e) => e.cle === cle) || ETAPES[0]; }
function typeDe(cle) { return TYPES_MISSION.find((t) => t.cle === cle) || TYPES_MISSION[5]; }
function resultatDe(cle) { return RESULTATS.find((r) => r.cle === cle) || null; }

async function journaliser(workspaceId, action, details) {
  try { await supabase.from("equipe_journal").insert([{ workspace_id: workspaceId, action, details: details || null }]); } catch (_) {}
}

function Pastille({ couleur, fond, children }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: couleur, background: fond, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>{children}</span>;
}
function Avatar({ nom, couleur = T.encre, taille = 40 }) {
  return <div style={{ width: taille, height: taille, borderRadius: 14, background: couleur, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: taille * 0.36, flexShrink: 0 }}>{initiales(nom)}</div>;
}
function couleurRole(role) { return role === "conseiller" ? T.vert : role === "bureau" ? "#B8611F" : T.encre; }
function Vide({ icone, titre, texte, children }) {
  return (
    <div style={{ ...S.carte, textAlign: "center", padding: "34px 20px" }}>
      <div style={{ fontSize: 34 }}>{icone}</div>
      <div style={{ fontWeight: 900, fontSize: 16, color: T.encre, marginTop: 8 }}>{titre}</div>
      {texte && <div style={{ fontSize: 13.5, color: T.gris, marginTop: 6, lineHeight: 1.5 }}>{texte}</div>}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
function Feuille({ titre, onFermer, children }) {
  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(14,23,20,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: T.fond, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", animation: "rvMonte .25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: T.encre }}>{titre}</div>
          <button onClick={onFermer} aria-label="Fermer" style={{ background: "white", border: `1px solid ${T.ligne}`, width: 36, height: 36, borderRadius: 12, fontSize: 19, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Données
// ---------------------------------------------------------------------------
function useEquipe(workspace, userId) {
  const [etat, setEtat] = useState({ charge: false, erreur: null, profils: [], roles: [], prospects: [], missions: [], journal: [] });
  const recharger = useCallback(async () => {
    if (!workspace?.id) return;
    const ws = workspace.id;
    const [pf, rl, pr, mi, jo] = await Promise.all([
      supabase.from("equipe_profils").select("*").eq("workspace_id", ws),
      supabase.rpc("equipe_roles", { ws }),
      supabase.from("equipe_prospects").select("*").eq("workspace_id", ws).order("updated_at", { ascending: false }),
      supabase.from("equipe_missions").select("*").eq("workspace_id", ws).order("date_prevue", { ascending: true, nullsFirst: false }),
      supabase.from("equipe_journal").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(40),
    ]);
    const erreur = pf.error?.message || pr.error?.message || mi.error?.message || null;
    setEtat({ charge: true, erreur, profils: pf.data || [], roles: rl.data || [], prospects: pr.data || [], missions: mi.data || [], journal: jo.data || [] });
  }, [workspace?.id]);
  useEffect(() => { recharger(); }, [recharger]);

  const membres = useMemo(() => {
    const parUser = {};
    for (const r of etat.roles) parUser[r.user_id] = { user_id: r.user_id, role: r.role };
    for (const p of etat.profils) parUser[p.user_id] = { ...(parUser[p.user_id] || { user_id: p.user_id, role: null }), profil: p };
    return Object.values(parUser)
      .filter((m) => ["owner", "admin", "conseiller", "bureau"].includes(m.role))
      .map((m) => ({ ...m, nom: m.profil?.nom || (m.user_id === userId ? "Moi" : ROLES_EQUIPE[m.role] || "Membre"), tel: m.profil?.tel || "" }))
      .sort((a, b) => ["owner", "admin", "conseiller", "bureau"].indexOf(a.role) - ["owner", "admin", "conseiller", "bureau"].indexOf(b.role));
  }, [etat.roles, etat.profils, userId]);
  const membreParId = useMemo(() => Object.fromEntries(membres.map((m) => [m.user_id, m])), [membres]);
  const responsable = membres.find((m) => m.role === "owner") || membres.find((m) => m.role === "admin") || null;
  return { ...etat, membres, membreParId, responsable, recharger };
}

// ---------------------------------------------------------------------------
//  Messages WhatsApp
// ---------------------------------------------------------------------------
function messageMission(m, prospect, cur, avecPrix) {
  const t = typeDe(m.type);
  const lignes = [`📌 NOUVELLE MISSION – ${t.label}`, "", m.titre];
  if (m.date_prevue) lignes.push(`Quand : ${dateHeure(m.date_prevue)}`);
  if (m.lieu) lignes.push(`Lieu : ${m.lieu}`);
  if (prospect) {
    lignes.push("", `Client : ${prospect.nom}`);
    if (prospect.tel) lignes.push(`Téléphone : ${prospect.tel}`);
    if (prospect.besoin) lignes.push(`Besoin : ${prospect.besoin}`);
    if (prospect.groupe) lignes.push(`Groupe proposé : ${prospect.groupe}`);
    if (avecPrix && prospect.prix_annonce) lignes.push(`Prix annoncé : ${nb(prospect.prix_annonce)} ${cur}`);
    if (avecPrix && prospect.prix_minimum) lignes.push(`Prix minimum : ${nb(prospect.prix_minimum)} ${cur}`);
  }
  if (m.consignes) lignes.push("", `Consignes : ${m.consignes}`);
  lignes.push("", "Merci de marquer la mission comme faite dans RecuVente avec ton compte rendu.");
  return lignes.join("\n");
}
function messageCompteRendu(m, prospect, auteur) {
  const r = resultatDe(m.resultat);
  const lignes = [`✅ MISSION FAITE – ${typeDe(m.type).label}`, "", m.titre];
  if (prospect) lignes.push(`Client : ${prospect.nom}`);
  if (r) lignes.push(`Résultat : ${r.label}`);
  if (m.compte_rendu) lignes.push("", m.compte_rendu);
  if (auteur) lignes.push("", `— ${auteur}`);
  return lignes.join("\n");
}

// ---------------------------------------------------------------------------
//  Cartes
// ---------------------------------------------------------------------------
function CarteProspect({ p, membre, cur, avecPrix, onOuvrir }) {
  const e = etapeDe(p.etape);
  return (
    <button onClick={onOuvrir} style={{ ...S.carte, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", padding: 14 }}>
      <Avatar nom={p.nom} couleur={e.couleur} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: T.encre, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</div>
          <Pastille couleur={e.couleur} fond={e.fond}>{e.label}</Pastille>
        </div>
        <div style={{ fontSize: 12.5, color: T.gris, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[p.groupe, p.ville, avecPrix && p.prix_annonce ? `${nb(p.prix_annonce)} ${cur}` : null].filter(Boolean).join(" · ") || p.besoin || "—"}
        </div>
        {membre && <div style={{ fontSize: 11.5, color: couleurRole(membre.role), fontWeight: 800, marginTop: 4 }}>→ {membre.nom}</div>}
      </div>
    </button>
  );
}

function CarteMission({ m, prospect, membre, onOuvrir }) {
  const t = typeDe(m.type);
  const r = resultatDe(m.resultat);
  const enRetard = m.statut === "a_faire" && m.date_prevue && new Date(m.date_prevue) < new Date() && !estAujourdhui(m.date_prevue);
  return (
    <button onClick={onOuvrir} style={{ ...S.carte, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", padding: 14, opacity: m.statut === "annulee" ? 0.55 : 1 }}>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: m.statut === "faite" ? T.vertClair : T.orClair, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{m.statut === "faite" ? "✅" : t.icone}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 14.5, color: T.encre }}>{m.titre}</div>
        <div style={{ fontSize: 12.5, color: enRetard ? T.rouge : T.gris, marginTop: 3, fontWeight: enRetard ? 800 : 500 }}>
          {[m.date_prevue ? (estAujourdhui(m.date_prevue) ? "Aujourd'hui " + new Date(m.date_prevue).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : dateHeure(m.date_prevue)) : "Sans date", m.lieu].filter(Boolean).join(" · ")}
          {enRetard ? " · en retard" : ""}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {prospect && <Pastille couleur={T.encre} fond="#EEF0EC">{prospect.nom}</Pastille>}
          {membre && <Pastille couleur={couleurRole(membre.role)} fond="#F3F1EA">{membre.nom}</Pastille>}
          {r && <Pastille couleur={r.couleur} fond={r.fond}>{r.label}</Pastille>}
          {m.statut === "annulee" && <Pastille couleur={T.gris} fond="#EEE">Annulée</Pastille>}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Formulaires (responsable)
// ---------------------------------------------------------------------------
function FormProspect({ workspace, initial, membres, cur, onFait, onFermer }) {
  const [f, setF] = useState(() => ({
    nom: initial?.nom || "", tel: initial?.tel || "", ville: initial?.ville || "", besoin: initial?.besoin || "", groupe: initial?.groupe || "",
    prix_annonce: initial?.prix_annonce ? nb(initial.prix_annonce) : "", prix_minimum: initial?.prix_minimum ? nb(initial.prix_minimum) : "",
    assigne_a: initial?.assigne_a || "", notes: initial?.notes || "",
  }));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const majMontant = (k) => (e) => { const n = lireNombre(e.target.value); setF((x) => ({ ...x, [k]: n ? nb(n) : "" })); };

  async function enregistrer() {
    if (!f.nom.trim()) { setErreur("Indique le nom du client."); return; }
    setEnvoi(true); setErreur("");
    const ligne = {
      nom: f.nom.trim(), tel: f.tel.trim() || null, ville: f.ville.trim() || null, besoin: f.besoin.trim() || null, groupe: f.groupe.trim() || null,
      prix_annonce: lireNombre(f.prix_annonce), prix_minimum: lireNombre(f.prix_minimum), assigne_a: f.assigne_a || null, notes: f.notes.trim() || null,
    };
    const req = initial?.id
      ? supabase.from("equipe_prospects").update(ligne).eq("id", initial.id).select().single()
      : supabase.from("equipe_prospects").insert([{ ...ligne, workspace_id: workspace.id }]).select().single();
    const { data, error } = await req;
    setEnvoi(false);
    if (error) { setErreur(error.message); return; }
    journaliser(workspace.id, initial?.id ? "Client modifié" : "Nouveau client", ligne.nom);
    onFait(data);
  }

  return (
    <Feuille titre={initial?.id ? "Modifier le client" : "Nouveau client"} onFermer={onFermer}>
      <label style={S.label}>Nom du client *</label>
      <input style={S.champ} value={f.nom} onChange={maj("nom")} placeholder="Ex. M. Koné – chantier Bingerville" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={S.label}>Téléphone</label><input style={S.champ} value={f.tel} onChange={maj("tel")} inputMode="tel" placeholder="07 00 00 00 00" /></div>
        <div><label style={S.label}>Ville / commune</label><input style={S.champ} value={f.ville} onChange={maj("ville")} placeholder="Abidjan" /></div>
      </div>
      <label style={S.label}>Besoin du client</label>
      <textarea style={{ ...S.champ, minHeight: 64 }} value={f.besoin} onChange={maj("besoin")} placeholder="Ex. alimenter un chantier, 4 climatiseurs + pompe…" />
      <label style={S.label}>Groupe proposé</label>
      <input style={S.champ} value={f.groupe} onChange={maj("groupe")} placeholder="Ex. 60 kVA Perkins" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={S.label}>Prix annoncé ({cur})</label><input style={S.champ} value={f.prix_annonce} onChange={majMontant("prix_annonce")} inputMode="numeric" /></div>
        <div><label style={S.label}>Prix minimum ({cur})</label><input style={S.champ} value={f.prix_minimum} onChange={majMontant("prix_minimum")} inputMode="numeric" /></div>
      </div>
      <label style={S.label}>Confier à</label>
      <select style={S.champ} value={f.assigne_a} onChange={maj("assigne_a")}>
        <option value="">— Personne (je le garde) —</option>
        {membres.filter((m) => m.role === "conseiller" || m.role === "bureau").map((m) => <option key={m.user_id} value={m.user_id}>{m.nom} · {ROLES_EQUIPE[m.role]}</option>)}
      </select>
      <label style={S.label}>Notes</label>
      <textarea style={{ ...S.champ, minHeight: 56 }} value={f.notes} onChange={maj("notes")} />
      {erreur && <div style={{ color: T.rouge, fontSize: 13.5, marginBottom: 10 }}>{erreur}</div>}
      <button onClick={enregistrer} disabled={envoi} style={{ ...S.boutonOr, width: "100%" }}>{envoi ? "Enregistrement…" : "Enregistrer le client"}</button>
    </Feuille>
  );
}

function FormMission({ workspace, prospects, membres, prospectInitial, cur, onFait, onFermer }) {
  const [f, setF] = useState(() => ({
    type: prospectInitial ? "visite" : "rencontre", prospect_id: prospectInitial?.id || "",
    assigne_a: prospectInitial?.assigne_a || membres.find((m) => m.role === "conseiller")?.user_id || "",
    titre: "", date_prevue: "", lieu: "", consignes: "",
  }));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const choix = membres.filter((m) => m.role === "conseiller" || m.role === "bureau");
  const prospect = prospects.find((p) => p.id === f.prospect_id) || null;

  function choisirType(cle) {
    setF((x) => {
      const suite = { ...x, type: cle };
      const bureau = choix.find((m) => m.role === "bureau");
      const conseiller = choix.find((m) => m.role === "conseiller");
      if (cle === "bureau" && bureau) suite.assigne_a = bureau.user_id;
      if ((cle === "visite" || cle === "rencontre") && conseiller) suite.assigne_a = conseiller.user_id;
      if (cle === "visite" && !x.lieu) suite.lieu = "Dépôt de Yopougon";
      if (cle === "bureau" && !x.lieu) suite.lieu = "Bureau d'Abobo";
      return suite;
    });
  }

  async function enregistrer(prevenir) {
    if (!f.assigne_a) { setErreur("Choisis le membre qui fera la mission."); return; }
    const titre = f.titre.trim() || `${typeDe(f.type).label}${prospect ? ` – ${prospect.nom}` : ""}`;
    setEnvoi(true); setErreur("");
    const ligne = {
      workspace_id: workspace.id, type: f.type, titre, prospect_id: f.prospect_id || null, assigne_a: f.assigne_a,
      date_prevue: f.date_prevue ? new Date(f.date_prevue).toISOString() : null, lieu: f.lieu.trim() || null, consignes: f.consignes.trim() || null,
    };
    const { data, error } = await supabase.from("equipe_missions").insert([ligne]).select().single();
    if (error) { setEnvoi(false); setErreur(error.message); return; }
    if (prospect && f.type !== "appel" && (prospect.etape === "nouveau" || !prospect.assigne_a)) {
      await supabase.from("equipe_prospects").update({
        etape: (f.type === "visite" || f.type === "rencontre") && prospect.etape === "nouveau" ? "visite" : prospect.etape,
        assigne_a: prospect.assigne_a || f.assigne_a,
      }).eq("id", prospect.id);
    }
    const membre = membres.find((m) => m.user_id === f.assigne_a);
    journaliser(workspace.id, "Mission confiée", `${titre} → ${membre?.nom || ""}`);
    setEnvoi(false);
    if (prevenir && membre) ouvrirWhatsApp(membre.tel, messageMission(data, prospect, cur, membre.role === "conseiller"));
    onFait(data);
  }

  return (
    <Feuille titre="Nouvelle mission" onFermer={onFermer}>
      <label style={S.label}>Type de mission</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {TYPES_MISSION.map((t) => (
          <button key={t.cle} onClick={() => choisirType(t.cle)} style={{ ...S.boutonClair, padding: "10px 6px", fontSize: 12.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, ...(f.type === t.cle ? { background: T.encre, color: "white", borderColor: T.encre } : {}) }}>
            <span style={{ fontSize: 19 }}>{t.icone}</span>{t.label}
          </button>
        ))}
      </div>
      <label style={S.label}>Client concerné</label>
      <select style={S.champ} value={f.prospect_id} onChange={maj("prospect_id")}>
        <option value="">— Aucun client précis —</option>
        {prospects.filter((p) => p.etape !== "livre" && p.etape !== "perdu").map((p) => <option key={p.id} value={p.id}>{p.nom}{p.groupe ? ` · ${p.groupe}` : ""}</option>)}
      </select>
      <label style={S.label}>Confiée à *</label>
      {choix.length === 0 ? (
        <div style={{ ...S.carte, background: T.ambreClair, color: "#7A4D06", fontSize: 13.5 }}>Ajoute d'abord tes membres dans l'onglet « Membres ».</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {choix.map((m) => (
            <button key={m.user_id} onClick={() => setF((x) => ({ ...x, assigne_a: m.user_id }))} style={{ ...S.boutonClair, display: "flex", alignItems: "center", gap: 8, ...(f.assigne_a === m.user_id ? { borderColor: couleurRole(m.role), background: "#FBFAF5", boxShadow: `0 0 0 2px ${couleurRole(m.role)}` } : {}) }}>
              <Avatar nom={m.nom} couleur={couleurRole(m.role)} taille={26} />{m.nom}
            </button>
          ))}
        </div>
      )}
      <label style={S.label}>Intitulé (facultatif)</label>
      <input style={S.champ} value={f.titre} onChange={maj("titre")} placeholder={`${typeDe(f.type).label}${prospect ? ` – ${prospect.nom}` : ""}`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={S.label}>Date et heure</label><input type="datetime-local" style={S.champ} value={f.date_prevue} onChange={maj("date_prevue")} /></div>
        <div><label style={S.label}>Lieu</label><input style={S.champ} value={f.lieu} onChange={maj("lieu")} /></div>
      </div>
      <label style={S.label}>Consignes</label>
      <textarea style={{ ...S.champ, minHeight: 60 }} value={f.consignes} onChange={maj("consignes")} placeholder="Ex. le client parle dioula, il veut voir le 100 kVA en marche." />
      {erreur && <div style={{ color: T.rouge, fontSize: 13.5, marginBottom: 10 }}>{erreur}</div>}
      <button onClick={() => enregistrer(true)} disabled={envoi || !choix.length} style={{ ...S.boutonWa, width: "100%", padding: 14, fontSize: 15, marginBottom: 8 }}>{envoi ? "…" : "Créer et prévenir sur WhatsApp"}</button>
      <button onClick={() => enregistrer(false)} disabled={envoi || !choix.length} style={{ ...S.boutonClair, width: "100%" }}>Créer sans prévenir</button>
    </Feuille>
  );
}

// ---------------------------------------------------------------------------
//  Détails
// ---------------------------------------------------------------------------
function DetailProspect({ p, workspace, eq, cur, estResponsable, onModifier, onMission, onFermer }) {
  const membre = eq.membreParId[p.assigne_a];
  const missions = eq.missions.filter((m) => m.prospect_id === p.id);
  const [notes, setNotes] = useState(p.notes || "");
  const etapesPermises = estResponsable ? ETAPES : ETAPES.filter((e) => e.cle !== "nouveau");

  async function changerEtape(cle) {
    if (cle === p.etape) return;
    await supabase.from("equipe_prospects").update({ etape: cle }).eq("id", p.id);
    journaliser(workspace.id, "Étape changée", `${p.nom} : ${etapeDe(p.etape).label} → ${etapeDe(cle).label}`);
    eq.recharger();
  }
  async function enregistrerNotes() {
    await supabase.from("equipe_prospects").update({ notes: notes.trim() || null }).eq("id", p.id);
    eq.recharger();
  }
  async function supprimer() {
    if (!window.confirm(`Supprimer le client ${p.nom} ?`)) return;
    await supabase.from("equipe_prospects").delete().eq("id", p.id);
    journaliser(workspace.id, "Client supprimé", p.nom);
    eq.recharger(); onFermer();
  }

  const ligne = (k, v) => v ? <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px dashed ${T.ligne}`, fontSize: 14 }}><span style={{ color: T.gris }}>{k}</span><span style={{ fontWeight: 800, color: T.encre, textAlign: "right" }}>{v}</span></div> : null;

  return (
    <Feuille titre={p.nom} onFermer={onFermer}>
      <div style={S.carte}>
        {ligne("Téléphone", p.tel)}
        {ligne("Ville", p.ville)}
        {ligne("Groupe proposé", p.groupe)}
        {ligne("Prix annoncé", p.prix_annonce ? `${nb(p.prix_annonce)} ${cur}` : null)}
        {p.prix_minimum ? <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", margin: "10px 0 4px", background: T.orClair, borderRadius: 12, fontSize: 14 }}><span style={{ color: "#7A5A12", fontWeight: 700 }}>Prix minimum à respecter</span><span style={{ fontWeight: 900, color: T.encre }}>{nb(p.prix_minimum)} {cur}</span></div> : null}
        {ligne("Suivi par", membre ? membre.nom : estResponsable ? "Moi" : null)}
        {p.besoin && <div style={{ fontSize: 13.5, color: T.encre2, marginTop: 10, lineHeight: 1.5 }}><b>Besoin :</b> {p.besoin}</div>}
      </div>

      <div style={S.titreSection}>Étape</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {etapesPermises.map((e) => (
          <button key={e.cle} onClick={() => changerEtape(e.cle)} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: `1.5px solid ${p.etape === e.cle ? e.couleur : T.ligne}`, background: p.etape === e.cle ? e.couleur : "white", color: p.etape === e.cle ? "white" : e.couleur }}>{e.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        {p.tel && <button onClick={() => ouvrirWhatsApp(p.tel, `Bonjour ${p.nom}, `)} style={S.boutonWa}>WhatsApp client</button>}
        {p.tel && <a href={`tel:${p.tel}`} style={{ ...S.boutonClair, textAlign: "center", textDecoration: "none" }}>Appeler</a>}
        {estResponsable && <button onClick={onMission} style={S.boutonNoir}>+ Mission</button>}
        {estResponsable && <button onClick={onModifier} style={S.boutonClair}>Modifier</button>}
      </div>

      <div style={S.titreSection}>Notes</div>
      <textarea style={{ ...S.champ, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={enregistrerNotes} placeholder="Ce que le client a dit, ses hésitations…" />

      {missions.length > 0 && <>
        <div style={S.titreSection}>Missions pour ce client</div>
        {missions.map((m) => <CarteMission key={m.id} m={m} membre={eq.membreParId[m.assigne_a]} onOuvrir={() => {}} />)}
      </>}
      {estResponsable && <button onClick={supprimer} style={{ background: "none", border: "none", color: T.rouge, fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 10 }}>Supprimer ce client</button>}
    </Feuille>
  );
}

function DetailMission({ m, workspace, eq, cur, userId, estResponsable, onFermer }) {
  const prospect = eq.prospects.find((p) => p.id === m.prospect_id) || null;
  const membre = eq.membreParId[m.assigne_a];
  const moi = eq.membreParId[userId];
  const [resultat, setResultat] = useState(m.resultat || "");
  const [cr, setCr] = useState(m.compte_rendu || "");
  const [envoi, setEnvoi] = useState(false);
  const estAMoi = m.assigne_a === userId;
  const typeAvecResultat = m.type === "visite" || m.type === "rencontre" || m.type === "appel";

  async function terminer(prevenir) {
    setEnvoi(true);
    const maj = { statut: "faite", resultat: typeAvecResultat ? (resultat || null) : null, compte_rendu: cr.trim() || null };
    const { data } = await supabase.from("equipe_missions").update(maj).eq("id", m.id).select().single();
    if (prospect && typeAvecResultat && resultat) {
      const etape = resultat === "decide" ? "accord" : resultat === "perdu" ? "perdu" : prospect.etape;
      if (etape !== prospect.etape) await supabase.from("equipe_prospects").update({ etape }).eq("id", prospect.id);
    }
    journaliser(workspace.id, "Mission faite", `${m.titre}${resultat ? ` – ${resultatDe(resultat)?.label}` : ""}`);
    setEnvoi(false);
    if (prevenir) ouvrirWhatsApp(eq.responsable?.tel, messageCompteRendu({ ...m, ...(data || maj) }, prospect, moi?.nom));
    eq.recharger(); onFermer();
  }
  async function changerStatut(statut) {
    await supabase.from("equipe_missions").update({ statut }).eq("id", m.id);
    journaliser(workspace.id, statut === "annulee" ? "Mission annulée" : "Mission rouverte", m.titre);
    eq.recharger(); onFermer();
  }

  return (
    <Feuille titre={m.titre} onFermer={onFermer}>
      <div style={S.carte}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Pastille couleur={T.encre} fond={T.orClair}>{typeDe(m.type).icone} {typeDe(m.type).label}</Pastille>
          {membre && <Pastille couleur={couleurRole(membre.role)} fond="#F3F1EA">{membre.nom}</Pastille>}
        </div>
        {m.date_prevue && <div style={{ fontSize: 14, marginBottom: 4 }}>🗓 {dateHeure(m.date_prevue)}</div>}
        {m.lieu && <div style={{ fontSize: 14, marginBottom: 4 }}>📍 {m.lieu}</div>}
        {m.consignes && <div style={{ fontSize: 13.5, color: T.encre2, background: "#FBF7EC", borderRadius: 12, padding: 10, marginTop: 8, lineHeight: 1.5 }}><b>Consignes :</b> {m.consignes}</div>}
      </div>
      {prospect && (
        <div style={S.carte}>
          <div style={{ fontWeight: 900, color: T.encre, marginBottom: 6 }}>{prospect.nom}</div>
          <div style={{ fontSize: 13.5, color: T.gris, lineHeight: 1.6 }}>
            {prospect.tel && <div>📞 {prospect.tel}</div>}
            {prospect.besoin && <div>Besoin : {prospect.besoin}</div>}
            {prospect.groupe && <div>Groupe : {prospect.groupe}</div>}
            {prospect.prix_annonce ? <div>Prix annoncé : <b style={{ color: T.encre }}>{nb(prospect.prix_annonce)} {cur}</b></div> : null}
          </div>
          {prospect.prix_minimum ? <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", marginTop: 10, background: T.orClair, borderRadius: 12, fontSize: 13.5 }}><span style={{ color: "#7A5A12", fontWeight: 700 }}>Prix minimum</span><b>{nb(prospect.prix_minimum)} {cur}</b></div> : null}
          {prospect.tel && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => ouvrirWhatsApp(prospect.tel, `Bonjour ${prospect.nom}, `)} style={{ ...S.boutonWa, flex: 1 }}>WhatsApp</button>
            <a href={`tel:${prospect.tel}`} style={{ ...S.boutonClair, flex: 1, textAlign: "center", textDecoration: "none" }}>Appeler</a>
          </div>}
        </div>
      )}

      {m.statut === "a_faire" && (estAMoi || estResponsable) && (
        <div style={S.carte}>
          <div style={{ fontWeight: 900, color: T.encre, marginBottom: 12 }}>Compte rendu</div>
          {typeAvecResultat && <>
            <label style={S.label}>Résultat</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {RESULTATS.map((r) => (
                <button key={r.cle} onClick={() => setResultat(r.cle)} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer", border: `1.5px solid ${resultat === r.cle ? r.couleur : T.ligne}`, background: resultat === r.cle ? r.couleur : "white", color: resultat === r.cle ? "white" : r.couleur }}>{r.label}</button>
              ))}
            </div>
          </>}
          <textarea style={{ ...S.champ, minHeight: 80 }} value={cr} onChange={(e) => setCr(e.target.value)} placeholder="Ce qui s'est passé, ce que le client a dit, la suite à donner…" />
          <button onClick={() => terminer(!estResponsable)} disabled={envoi} style={{ ...(estResponsable ? S.boutonOr : S.boutonWa), width: "100%", padding: 14, fontSize: 15 }}>
            {envoi ? "…" : estResponsable ? "Marquer comme faite" : "Mission faite · envoyer le compte rendu"}
          </button>
        </div>
      )}
      {m.statut === "faite" && (
        <div style={{ ...S.carte, background: T.vertClair, borderColor: "#CBE8D6" }}>
          <div style={{ fontWeight: 900, color: T.vert }}>✅ Mission faite {m.fait_le ? `· ${dateHeure(m.fait_le)}` : ""}</div>
          {resultatDe(m.resultat) && <div style={{ marginTop: 6, fontWeight: 800 }}>{resultatDe(m.resultat).label}</div>}
          {m.compte_rendu && <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: T.encre2 }}>{m.compte_rendu}</div>}
        </div>
      )}
      {estResponsable && (
        <div style={{ display: "flex", gap: 8 }}>
          {m.statut === "a_faire" && membre && <button onClick={() => ouvrirWhatsApp(membre.tel, messageMission(m, prospect, cur, membre.role === "conseiller"))} style={{ ...S.boutonWa, flex: 1 }}>Renvoyer à {membre.nom}</button>}
          {m.statut === "a_faire" && <button onClick={() => changerStatut("annulee")} style={{ ...S.boutonClair, flex: 1, color: T.rouge }}>Annuler</button>}
          {m.statut !== "a_faire" && <button onClick={() => changerStatut("a_faire")} style={{ ...S.boutonClair, flex: 1 }}>Rouvrir</button>}
        </div>
      )}
    </Feuille>
  );
}

// ---------------------------------------------------------------------------
//  Vues
// ---------------------------------------------------------------------------
function Tuile({ titre, valeur, sous, couleur = T.encre, onClick }) {
  return (
    <button onClick={onClick} style={{ ...S.carte, marginBottom: 0, textAlign: "left", cursor: onClick ? "pointer" : "default", padding: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.gris, textTransform: "uppercase", letterSpacing: "0.06em" }}>{titre}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: couleur, marginTop: 4, letterSpacing: "-0.02em" }}>{valeur}</div>
      {sous && <div style={{ fontSize: 12, color: T.gris }}>{sous}</div>}
    </button>
  );
}

function VueAccueil({ eq, cur, onAller, onOuvrirMission, onNouveauClient, onNouvelleMission }) {
  const actifs = eq.prospects.filter((p) => !["livre", "perdu"].includes(p.etape));
  const aFaire = eq.missions.filter((m) => m.statut === "a_faire");
  const aujourdhui = aFaire.filter((m) => estAujourdhui(m.date_prevue));
  const enRetard = aFaire.filter((m) => m.date_prevue && new Date(m.date_prevue) < new Date() && !estAujourdhui(m.date_prevue));
  const potentiel = actifs.filter((p) => ["visite", "accord"].includes(p.etape)).reduce((s, p) => s + Number(p.prix_annonce || 0), 0);
  const parEtape = ETAPES.filter((e) => e.cle !== "perdu").map((e) => ({ ...e, n: eq.prospects.filter((p) => p.etape === e.cle).length }));
  const max = Math.max(1, ...parEtape.map((e) => e.n));
  const conseillers = eq.membres.filter((m) => m.role === "conseiller" || m.role === "bureau");

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Tuile titre="Clients en cours" valeur={actifs.length} sous="à suivre" onClick={() => onAller("clients")} />
        <Tuile titre="Missions à faire" valeur={aFaire.length} sous={enRetard.length ? `${enRetard.length} en retard` : `${aujourdhui.length} aujourd'hui`} couleur={enRetard.length ? T.rouge : T.encre} onClick={() => onAller("missions")} />
      </div>
      {potentiel > 0 && <div style={{ ...S.carte, background: `linear-gradient(135deg, ${T.encre}, #2B3F36)`, color: "white", border: "none" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.or, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ventes en vue (visite + accord)</div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{nb(potentiel)} <span style={{ fontSize: 13, opacity: .6 }}>{cur}</span></div>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
        <button onClick={onNouveauClient} style={S.boutonOr}>+ Client</button>
        <button onClick={onNouvelleMission} style={{ ...S.boutonNoir, padding: 13, fontSize: 15 }}>+ Mission</button>
      </div>

      <div style={S.titreSection}>Parcours des clients</div>
      <div style={S.carte}>
        {parEtape.map((e) => (
          <button key={e.cle} onClick={() => onAller("clients", e.cle)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "6px 0", cursor: "pointer" }}>
            <div style={{ width: 120, fontSize: 13, fontWeight: 700, color: T.encre, textAlign: "left" }}>{e.label}</div>
            <div style={{ flex: 1, height: 12, background: "#F1EEE6", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${(e.n / max) * 100}%`, height: "100%", background: e.couleur, borderRadius: 99, transition: "width .6s" }} />
            </div>
            <div style={{ width: 26, textAlign: "right", fontWeight: 900, color: e.couleur }}>{e.n}</div>
          </button>
        ))}
      </div>

      {(aujourdhui.length > 0 || enRetard.length > 0) && <>
        <div style={S.titreSection}>À faire aujourd'hui</div>
        {[...enRetard, ...aujourdhui].map((m) => <CarteMission key={m.id} m={m} prospect={eq.prospects.find((p) => p.id === m.prospect_id)} membre={eq.membreParId[m.assigne_a]} onOuvrir={() => onOuvrirMission(m)} />)}
      </>}

      {conseillers.length > 0 && <>
        <div style={S.titreSection}>L'équipe</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {conseillers.map((m) => {
            const sesMissions = aFaire.filter((x) => x.assigne_a === m.user_id).length;
            const sesClients = actifs.filter((p) => p.assigne_a === m.user_id).length;
            return (
              <div key={m.user_id} style={{ ...S.carte, marginBottom: 0, padding: 14 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Avatar nom={m.nom} couleur={couleurRole(m.role)} taille={34} />
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 900, fontSize: 14 }}>{m.nom}</div><div style={{ fontSize: 11, color: T.gris }}>{m.role === "bureau" ? "Bureau" : "Conseiller"}</div></div>
                </div>
                <div style={{ fontSize: 12.5, color: T.gris, marginTop: 10 }}><b style={{ color: T.encre }}>{sesMissions}</b> mission{sesMissions > 1 ? "s" : ""} · <b style={{ color: T.encre }}>{sesClients}</b> client{sesClients > 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>
      </>}

      {eq.journal.length > 0 && <>
        <div style={S.titreSection}>Activité récente</div>
        <div style={S.carte}>
          {eq.journal.slice(0, 12).map((j) => (
            <div key={j.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.ligne}`, fontSize: 13 }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: couleurRole(eq.membreParId[j.user_id]?.role), marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}><b>{eq.membreParId[j.user_id]?.nom || "—"}</b> · {j.action}{j.details ? <span style={{ color: T.gris }}> — {j.details}</span> : null}</div>
              <div style={{ color: T.grisClair, fontSize: 11.5, whiteSpace: "nowrap" }}>{ilYa(j.created_at)}</div>
            </div>
          ))}
        </div>
      </>}
    </>
  );
}

function VueClients({ eq, cur, avecPrix, filtreInitial, onOuvrir, onNouveau, estResponsable }) {
  const [filtre, setFiltre] = useState(filtreInitial || "actifs");
  const [q, setQ] = useState("");
  useEffect(() => { if (filtreInitial) setFiltre(filtreInitial); }, [filtreInitial]);
  const liste = eq.prospects.filter((p) => {
    if (filtre === "actifs" && ["livre", "perdu"].includes(p.etape)) return false;
    if (filtre !== "actifs" && filtre !== "tous" && p.etape !== filtre) return false;
    if (q && !`${p.nom} ${p.tel || ""} ${p.ville || ""} ${p.groupe || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input style={{ ...S.champ, marginBottom: 0, flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" />
        {estResponsable && <button onClick={onNouveau} style={{ ...S.boutonOr, padding: "0 16px" }}>+</button>}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
        <button onClick={() => setFiltre("actifs")} style={S.puce(filtre === "actifs")}>En cours</button>
        {ETAPES.map((e) => <button key={e.cle} onClick={() => setFiltre(e.cle)} style={S.puce(filtre === e.cle)}>{e.label} · {eq.prospects.filter((p) => p.etape === e.cle).length}</button>)}
        <button onClick={() => setFiltre("tous")} style={S.puce(filtre === "tous")}>Tous</button>
      </div>
      {liste.length === 0
        ? <Vide icone="👥" titre={estResponsable ? "Aucun client ici" : "Aucun client confié"} texte={estResponsable ? "Ajoute les prospects qui t'écrivent sur WhatsApp pour suivre chaque vente." : "Les clients que le responsable te confie apparaîtront ici."}>{estResponsable && <button onClick={onNouveau} style={S.boutonOr}>+ Ajouter un client</button>}</Vide>
        : liste.map((p) => <CarteProspect key={p.id} p={p} cur={cur} avecPrix={avecPrix} membre={estResponsable ? eq.membreParId[p.assigne_a] : null} onOuvrir={() => onOuvrir(p)} />)}
    </>
  );
}

function VueMissions({ eq, userId, estResponsable, onOuvrir, onNouvelle }) {
  const [filtre, setFiltre] = useState("a_faire");
  const [qui, setQui] = useState("");
  const liste = eq.missions
    .filter((m) => (estResponsable ? true : m.assigne_a === userId))
    .filter((m) => (filtre === "toutes" ? true : m.statut === filtre))
    .filter((m) => (qui ? m.assigne_a === qui : true))
    .sort((a, b) => filtre === "faite" ? new Date(b.fait_le || 0) - new Date(a.fait_le || 0) : new Date(a.date_prevue || 8.64e15) - new Date(b.date_prevue || 8.64e15));
  return (
    <>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
        {[["a_faire", "À faire"], ["faite", "Faites"], ["annulee", "Annulées"], ["toutes", "Toutes"]].map(([k, l]) => <button key={k} onClick={() => setFiltre(k)} style={S.puce(filtre === k)}>{l}</button>)}
      </div>
      {estResponsable && <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
        <button onClick={() => setQui("")} style={S.puce(!qui)}>Tout le monde</button>
        {eq.membres.filter((m) => m.role === "conseiller" || m.role === "bureau").map((m) => <button key={m.user_id} onClick={() => setQui(m.user_id)} style={S.puce(qui === m.user_id)}>{m.nom}</button>)}
      </div>}
      {estResponsable && <button onClick={onNouvelle} style={{ ...S.boutonOr, width: "100%", marginBottom: 12 }}>+ Nouvelle mission</button>}
      {liste.length === 0
        ? <Vide icone="📋" titre={filtre === "a_faire" ? "Aucune mission à faire" : "Rien ici"} texte={estResponsable ? "Confie une visite du dépôt, une rencontre ou un passage au bureau à un membre." : "Les missions que le responsable te confie apparaîtront ici."} />
        : liste.map((m) => <CarteMission key={m.id} m={m} prospect={eq.prospects.find((p) => p.id === m.prospect_id)} membre={estResponsable ? eq.membreParId[m.assigne_a] : null} onOuvrir={() => onOuvrir(m)} />)}
    </>
  );
}

function FormProfil({ workspace, userId, profil, roleParDefaut, onFait }) {
  const [nom, setNom] = useState(profil?.nom || "");
  const [tel, setTel] = useState(profil?.tel || "");
  const [ok, setOk] = useState(false);
  async function enregistrer() {
    if (!nom.trim()) return;
    await supabase.from("equipe_profils").upsert([{ workspace_id: workspace.id, user_id: userId, nom: nom.trim(), tel: tel.trim() || null, fonction: profil?.fonction || ROLES_EQUIPE[roleParDefaut] || null }], { onConflict: "workspace_id,user_id" });
    setOk(true); setTimeout(() => setOk(false), 2000);
    onFait();
  }
  return (
    <div style={S.carte}>
      <div style={{ fontWeight: 900, color: T.encre, marginBottom: 12 }}>Mon profil</div>
      <label style={S.label}>Nom affiché</label>
      <input style={S.champ} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Rostain KOFFI" />
      <label style={S.label}>Numéro WhatsApp</label>
      <input style={S.champ} value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="07 00 00 00 00" />
      <button onClick={enregistrer} style={{ ...S.boutonNoir, width: "100%" }}>{ok ? "✓ Enregistré" : "Enregistrer"}</button>
    </div>
  );
}

function VueMembres({ workspace, eq, userId }) {
  const moi = eq.membreParId[userId];
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState({ nom: "", tel: "", email: "", password: "", role: "conseiller" });
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState("");
  const [edition, setEdition] = useState(null);

  async function inviter() {
    if (!f.nom.trim() || !f.email.trim() || f.password.length < 6) { setMsg("Nom, email et mot de passe (6 caractères minimum) sont obligatoires."); return; }
    setEnvoi(true); setMsg("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ action: "invite", workspaceId: workspace.id, email: f.email.trim(), password: f.password, role: f.role, titre: ROLES_EQUIPE[f.role] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error || `Erreur (${res.status})`); setEnvoi(false); return; }
      if (json.userId) {
        await supabase.from("equipe_profils").upsert([{ workspace_id: workspace.id, user_id: json.userId, nom: f.nom.trim(), tel: f.tel.trim() || null, fonction: ROLES_EQUIPE[f.role] }], { onConflict: "workspace_id,user_id" });
      }
      journaliser(workspace.id, "Membre ajouté", `${f.nom.trim()} – ${ROLES_EQUIPE[f.role]}`);
      const lien = `${window.location.origin}`;
      const texte = `Bonjour ${f.nom.trim()}, ton accès à l'espace équipe OU LI PAI sur RecuVente est prêt.\n\nLien : ${lien}\nEmail : ${f.email.trim()}\nMot de passe : ${f.password}\n\nTu pourras changer ton mot de passe après la première connexion.`;
      if (f.tel.trim()) ouvrirWhatsApp(f.tel, texte);
      setF({ nom: "", tel: "", email: "", password: "", role: "conseiller" }); setOuvert(false);
      eq.recharger();
    } catch (e) { setMsg(e.message); }
    setEnvoi(false);
  }
  async function majProfil(m, nom, tel) {
    await supabase.from("equipe_profils").upsert([{ workspace_id: workspace.id, user_id: m.user_id, nom: nom.trim() || m.nom, tel: tel.trim() || null, fonction: ROLES_EQUIPE[m.role] }], { onConflict: "workspace_id,user_id" });
    setEdition(null); eq.recharger();
  }

  return (
    <>
      {!moi?.profil?.tel && <div style={{ ...S.carte, background: T.ambreClair, borderColor: "#F2DCAE", color: "#7A4D06", fontSize: 13.5, lineHeight: 1.5 }}>Renseigne ton numéro WhatsApp : c'est là que l'équipe t'enverra ses comptes rendus et ses rapports.</div>}
      <FormProfil workspace={workspace} userId={userId} profil={moi?.profil} roleParDefaut={moi?.role || "owner"} onFait={eq.recharger} />

      <div style={S.titreSection}>Membres de l'équipe</div>
      {eq.membres.filter((m) => m.user_id !== userId).map((m) => (
        <div key={m.user_id} style={{ ...S.carte, padding: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar nom={m.nom} couleur={couleurRole(m.role)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>{m.nom}</div>
              <div style={{ fontSize: 12.5, color: couleurRole(m.role), fontWeight: 700 }}>{ROLES_EQUIPE[m.role]}</div>
              <div style={{ fontSize: 12.5, color: T.gris }}>{m.tel || "Pas de numéro WhatsApp"}</div>
            </div>
            <button onClick={() => setEdition(edition === m.user_id ? null : m.user_id)} style={S.boutonClair}>Modifier</button>
          </div>
          {edition === m.user_id && <EditionMembre m={m} onEnregistrer={majProfil} />}
        </div>
      ))}
      {eq.membres.filter((m) => m.user_id !== userId).length === 0 && <Vide icone="👥" titre="Ton équipe est vide" texte="Ajoute ton conseiller et ton représentant au bureau. Chacun aura son propre accès." />}

      {!ouvert ? (
        <button onClick={() => setOuvert(true)} style={{ ...S.boutonOr, width: "100%" }}>+ Ajouter un membre</button>
      ) : (
        <div style={S.carte}>
          <div style={{ fontWeight: 900, color: T.encre, marginBottom: 12 }}>Nouveau membre</div>
          <label style={S.label}>Fonction</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {["conseiller", "bureau"].map((r) => (
              <button key={r} onClick={() => setF((x) => ({ ...x, role: r }))} style={{ ...S.boutonClair, fontSize: 12.5, ...(f.role === r ? { background: couleurRole(r), color: "white", borderColor: couleurRole(r) } : {}) }}>{ROLES_EQUIPE[r]}</button>
            ))}
          </div>
          <label style={S.label}>Nom</label>
          <input style={S.champ} value={f.nom} onChange={(e) => setF((x) => ({ ...x, nom: e.target.value }))} placeholder={f.role === "conseiller" ? "Ex. Grand frère Adamo" : "Ex. Frère Blo"} />
          <label style={S.label}>Numéro WhatsApp</label>
          <input style={S.champ} value={f.tel} onChange={(e) => setF((x) => ({ ...x, tel: e.target.value }))} inputMode="tel" />
          <label style={S.label}>Email de connexion</label>
          <input style={S.champ} value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} type="email" autoCapitalize="none" />
          <label style={S.label}>Mot de passe provisoire</label>
          <input style={S.champ} value={f.password} onChange={(e) => setF((x) => ({ ...x, password: e.target.value }))} placeholder="6 caractères minimum" />
          {msg && <div style={{ color: T.rouge, fontSize: 13.5, marginBottom: 10 }}>{msg}</div>}
          <button onClick={inviter} disabled={envoi} style={{ ...S.boutonWa, width: "100%", padding: 14, fontSize: 15, marginBottom: 8 }}>{envoi ? "Création…" : "Créer l'accès et l'envoyer sur WhatsApp"}</button>
          <button onClick={() => setOuvert(false)} style={{ ...S.boutonClair, width: "100%" }}>Annuler</button>
        </div>
      )}
    </>
  );
}
function EditionMembre({ m, onEnregistrer }) {
  const [nom, setNom] = useState(m.nom);
  const [tel, setTel] = useState(m.tel || "");
  return (
    <div style={{ marginTop: 12 }}>
      <input style={S.champ} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" />
      <input style={S.champ} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Numéro WhatsApp" inputMode="tel" />
      <button onClick={() => onEnregistrer(m, nom, tel)} style={{ ...S.boutonNoir, width: "100%" }}>Enregistrer</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Composant principal
//  • integre = true : affiché dans un onglet de l'écran Ventes & crédits.
//  • sinon : portail complet (conseiller), avec son propre en-tête.
// ---------------------------------------------------------------------------
export default function EquipeVente({ workspace, userId, role, integre = false, onDeconnexion }) {
  const eq = useEquipe(workspace, userId);
  const estResponsable = role === "owner" || role === "admin";
  const avecPrix = estResponsable || role === "conseiller";
  const cur = devise(workspace?.currency);
  const [onglet, setOnglet] = useState(estResponsable ? "accueil" : "missions");
  const [filtreClients, setFiltreClients] = useState(null);
  const [prospectOuvert, setProspectOuvert] = useState(null);
  const [missionOuverte, setMissionOuverte] = useState(null);
  const [formProspect, setFormProspect] = useState(null);
  const [formMission, setFormMission] = useState(null);
  const moi = eq.membreParId[userId];

  const mesMissionsAFaire = eq.missions.filter((m) => m.assigne_a === userId && m.statut === "a_faire").length;
  const ONGLETS = estResponsable
    ? [{ cle: "accueil", label: "Tableau de bord" }, { cle: "clients", label: "Clients", n: eq.prospects.filter((p) => !["livre", "perdu"].includes(p.etape)).length }, { cle: "missions", label: "Missions", n: eq.missions.filter((m) => m.statut === "a_faire").length }, { cle: "membres", label: "Membres" }]
    : [{ cle: "missions", label: "Mes missions", n: mesMissionsAFaire }, { cle: "clients", label: "Mes clients" }, { cle: "profil", label: "Mon profil" }];

  const prospectActuel = prospectOuvert ? eq.prospects.find((p) => p.id === prospectOuvert) : null;
  const missionActuelle = missionOuverte ? eq.missions.find((m) => m.id === missionOuverte) : null;

  const contenu = (
    <>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
        {ONGLETS.map((o) => (
          <button key={o.cle} onClick={() => { setOnglet(o.cle); setFiltreClients(null); }} style={S.puce(onglet === o.cle)}>
            {o.label}{o.n > 0 && <span style={{ marginLeft: 6, background: onglet === o.cle ? T.or : T.encre, color: onglet === o.cle ? T.encre : "white", borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{o.n}</span>}
          </button>
        ))}
      </div>
      {!eq.charge && <div style={{ textAlign: "center", color: T.grisClair, padding: 40 }}>Chargement…</div>}
      {eq.charge && eq.erreur && <div style={{ ...S.carte, color: T.rouge }}>Impossible de charger l'espace équipe : {eq.erreur}</div>}
      {eq.charge && !eq.erreur && <>
        {!estResponsable && !moi?.profil?.tel && onglet !== "profil" && (
          <button onClick={() => setOnglet("profil")} style={{ ...S.carte, width: "100%", textAlign: "left", background: T.ambreClair, borderColor: "#F2DCAE", color: "#7A4D06", fontSize: 13.5, cursor: "pointer" }}>Renseigne ton numéro WhatsApp dans « Mon profil » →</button>
        )}
        {onglet === "accueil" && <VueAccueil eq={eq} cur={cur} onAller={(o, f) => { setOnglet(o); setFiltreClients(f || null); }} onOuvrirMission={(m) => setMissionOuverte(m.id)} onNouveauClient={() => setFormProspect({})} onNouvelleMission={() => setFormMission({})} />}
        {onglet === "clients" && <VueClients eq={eq} cur={cur} avecPrix={avecPrix} filtreInitial={filtreClients} estResponsable={estResponsable} onOuvrir={(p) => setProspectOuvert(p.id)} onNouveau={() => setFormProspect({})} />}
        {onglet === "missions" && <VueMissions eq={eq} userId={userId} estResponsable={estResponsable} onOuvrir={(m) => setMissionOuverte(m.id)} onNouvelle={() => setFormMission({})} />}
        {onglet === "membres" && estResponsable && <VueMembres workspace={workspace} eq={eq} userId={userId} />}
        {onglet === "profil" && <>
          <FormProfil workspace={workspace} userId={userId} profil={moi?.profil} roleParDefaut={role} onFait={eq.recharger} />
          <div style={{ ...S.carte, fontSize: 13.5, color: T.gris, lineHeight: 1.6 }}>
            <b style={{ color: T.encre }}>{ROLES_EQUIPE[role]}</b><br />
            {role === "conseiller" ? "Tu reçois les clients qui veulent rencontrer quelqu'un ou visiter le dépôt. Après chaque rencontre, marque la mission comme faite et envoie ton compte rendu." : "Tu représentes l'équipe au bureau : fiches, factures, décharges, crédits. Enregistre chaque vente dans « Ventes » et envoie ton rapport."}
          </div>
        </>}
      </>}

      {prospectActuel && <DetailProspect p={prospectActuel} workspace={workspace} eq={eq} cur={cur} estResponsable={estResponsable}
        onModifier={() => { setFormProspect(prospectActuel); setProspectOuvert(null); }}
        onMission={() => { setFormMission({ prospect: prospectActuel }); setProspectOuvert(null); }}
        onFermer={() => setProspectOuvert(null)} />}
      {missionActuelle && <DetailMission m={missionActuelle} workspace={workspace} eq={eq} cur={cur} userId={userId} estResponsable={estResponsable} onFermer={() => setMissionOuverte(null)} />}
      {formProspect && <FormProspect workspace={workspace} initial={formProspect.id ? formProspect : null} membres={eq.membres} cur={cur} onFermer={() => setFormProspect(null)} onFait={() => { setFormProspect(null); eq.recharger(); }} />}
      {formMission && <FormMission workspace={workspace} prospects={eq.prospects} membres={eq.membres} prospectInitial={formMission.prospect || null} cur={cur} onFermer={() => setFormMission(null)} onFait={() => { setFormMission(null); eq.recharger(); }} />}
    </>
  );

  if (integre) return <div className="rv-eq">{contenu}</div>;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.fond, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <style>{`@keyframes rvMonte{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}} .rv-eq input:focus,.rv-eq textarea:focus,.rv-eq select:focus{border-color:${T.or}!important;box-shadow:0 0 0 4px rgba(201,162,74,0.15)} .rv-eq button{font-family:inherit}`}</style>
      <div className="rv-eq">
        <div style={{ background: `radial-gradient(130% 120% at 100% 0%, #2B3F36 0%, ${T.encre} 55%)`, color: "white", padding: "16px 16px 18px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: "0.02em" }}>RECU<span style={{ color: T.or }}>VENTE</span></div>
              <div style={{ flex: 1 }} />
              {onDeconnexion && <button onClick={onDeconnexion} aria-label="Déconnexion" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)", height: 36, padding: "0 12px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>⏻</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <Avatar nom={moi?.nom || "?"} couleur={couleurRole(role)} taille={46} />
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.or, fontWeight: 800, textTransform: "uppercase" }}>{workspace?.name}</div>
                <div style={{ fontWeight: 900, fontSize: 20 }}>Bonjour {moi?.profil?.nom ? moi.profil.nom.split(" ").slice(-1)[0] : ""}</div>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>{ROLES_EQUIPE[role]}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 16px 60px", maxWidth: 720, margin: "0 auto" }}>{contenu}</div>
      </div>
    </div>
  );
}
