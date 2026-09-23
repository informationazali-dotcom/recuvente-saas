import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  « Caisse » (boutique physique) : vente rapide + ticket, dettes clients, clôture de caisse,
//  fournisseurs & achats. Tout passe par supabase-js + RLS (aucune nouvelle fonction serveur).
//  Une vente de caisse crée EXACTEMENT le même genre de ligne `commandes` que le flux
//  « Nouvelle vente / sur place » de l'application (+ commande_items + paiements_commande).
// ============================================================================

// ------------------------------------------------------------------ utilitaires
const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
const devise = (d) => (!d || d === "XOF" || d === "XAF" ? "F CFA" : d);
const arrondi = (n) => Math.round(Number(n) || 0);
const argent = (n, dev) => `${nombre(n)} ${dev}`;
const telChiffres = (t) => String(t || "").replace(/\D/g, "");

// Même règle que cleanPhoneForWhatsApp dans App.jsx
function numeroWhatsApp(tel) {
  let digits = telChiffres(tel);
  if (String(tel).trim().startsWith("+") && digits.length >= 9) return digits;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}
function lienWhatsApp(tel, texte) {
  const base = telChiffres(tel).length >= 8 ? `https://wa.me/${numeroWhatsApp(tel)}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texte)}`;
}

// Les modes de paiement sont ceux de `paiements_commande` (voir FenetrePaiementPartiel dans App.jsx).
const MODES = [
  { key: "cash", label: "💵 Espèces" },
  { key: "wave", label: "🌊 Wave" },
  { key: "orange_money", label: "🟠 Orange Money" },
  { key: "mtn_money", label: "🟡 MTN Money" },
  { key: "moov_money", label: "🔵 Moov Money" },
];
const LABEL_MODE = { cash: "Espèces", wave: "Wave", orange_money: "Orange Money", mtn_money: "MTN Money", moov_money: "Moov Money", en_ligne: "Payé en ligne" };
const labelMode = (k) => LABEL_MODE[k] || k || "Mode non précisé";

function jourLocalISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function bornesJour(dateStr) {
  const [y, m, j] = dateStr.split("-").map(Number);
  const debut = new Date(y, m - 1, j, 0, 0, 0, 0);
  const fin = new Date(y, m - 1, j + 1, 0, 0, 0, 0);
  return [debut.toISOString(), fin.toISOString()];
}
const dateCourte = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateHeure = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateLongue = (dateStr) => {
  const [y, m, j] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const joursDepuis = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const numeroTicket = (id) => "T-" + String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
const libelleVariante = (v) => Object.values((v && v.combinaison) || {}).join(" / ");
const nomLigne = (l) => (l.variante ? `${l.nom} — ${l.variante}` : l.nom);
const echapper = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const messageErreur = (e) => (e && e.message) || "Erreur inconnue";

function decouper(tableau, taille) {
  const r = [];
  for (let i = 0; i < tableau.length; i += taille) r.push(tableau.slice(i, i + taille));
  return r;
}

// Lit TOUTES les lignes d'une requête (l'API renvoie au plus 1000 lignes par appel).
async function toutLire(fabrique, max = 20000) {
  const out = [];
  for (let a = 0; a < max; a += 1000) {
    const { data, error } = await fabrique().range(a, a + 999);
    if (error) throw error;
    const l = data || [];
    out.push(...l);
    if (l.length < 1000) break;
  }
  return out;
}

// ------------------------------------------------------------------ stock (même formule que l'app)
//   stock actuel = stock_initial + Σ mouvements_stock.quantite − quantités commandées (hors commandes échouées)
function analyserTexteProduit(texte) {
  if (!texte) return { nom: "", quantite: 1 };
  const m = String(texte).match(/^(.*?)\s*x\s*(\d+)\s*$/i);
  if (m) return { nom: m[1].trim(), quantite: Number(m[2]) || 1 };
  return { nom: String(texte).trim(), quantite: 1 };
}

export async function chargerDonneesStock(workspaceId) {
  const [produits, commandes, items] = await Promise.all([
    toutLire(() => supabase.from("produits").select("*").eq("workspace_id", workspaceId).order("nom")),
    toutLire(() => supabase.from("commandes").select("id, produit, statut").eq("workspace_id", workspaceId).order("created_at", { ascending: false }), 5000),
    toutLire(() => supabase.from("commande_items").select("commande_id, produit_id, produit_nom, quantite").eq("workspace_id", workspaceId)),
  ]);
  // Mouvements de stock : si la table n'existe pas encore → 0 mouvement (jamais d'erreur bloquante)
  let mouvements = [];
  let mouvementsOk = true;
  try {
    mouvements = await toutLire(() => supabase.from("mouvements_stock").select("produit_id, variante, quantite").eq("workspace_id", workspaceId));
  } catch (_) {
    mouvements = [];
    mouvementsOk = false;
  }
  return construireDonneesStock(produits, commandes, items, mouvements, mouvementsOk);
}

export function construireDonneesStock(produits, commandes, items, mouvements, mouvementsOk = true) {
  const vendus = {};
  const actives = new Map(commandes.filter((c) => c.statut !== "echouee").map((c) => [c.id, c]));
  const avecItems = new Set(items.map((i) => i.commande_id));
  commandes.forEach((c) => {
    if (c.statut === "echouee" || avecItems.has(c.id)) return;
    const { nom, quantite } = analyserTexteProduit(c.produit);
    if (nom) vendus[nom] = (vendus[nom] || 0) + quantite;
  });
  items.forEach((it) => {
    if (!actives.has(it.commande_id) || !it.produit_nom) return;
    vendus[it.produit_nom] = (vendus[it.produit_nom] || 0) + Number(it.quantite || 0);
  });
  const mvts = {};
  const mvtsPresents = {};
  mouvements.forEach((m) => {
    const cle = `${m.produit_id}|${m.variante || ""}`;
    mvts[cle] = (mvts[cle] || 0) + Number(m.quantite || 0);
    mvtsPresents[cle] = true;
  });
  return { produits, vendus, mvts, mvtsPresents, mouvementsOk };
}

// Stock disponible d'un produit (ou d'une variante). `suivi` = false quand aucun stock n'a jamais été saisi
// (stock initial vide/0 et aucun mouvement) : on ne bloque alors jamais la vente.
export function stockDisponible(produit, variante, donnees) {
  const cle = `${produit.id}|${variante || ""}`;
  const mouvement = donnees.mvts[cle] || 0;
  const nomVendu = variante ? `${produit.nom} — ${variante}` : produit.nom;
  const vendu = donnees.vendus[nomVendu] || 0;
  let initial;
  if (variante) {
    const v = (produit.variantes || []).find((x) => libelleVariante(x) === variante);
    initial = Number((v && v.stock) || 0);
  } else {
    initial = Number(produit.stock_initial || 0);
  }
  const suivi = initial > 0 || !!donnees.mvtsPresents[cle];
  return { suivi, dispo: initial + mouvement - vendu, initial };
}

// ------------------------------------------------------------------ ticket
function calculRemise(sousTotal, type, valeur) {
  const v = Math.max(0, Number(valeur) || 0);
  if (!v) return 0;
  const brut = type === "pct" ? arrondi((sousTotal * Math.min(v, 100)) / 100) : arrondi(v);
  return Math.min(Math.max(brut, 0), sousTotal);
}

function htmlTicket(t, largeur, boutique) {
  const w = largeur === 58 ? "48mm" : "72mm";
  const taille = largeur === 58 ? 11 : 12.5;
  const dev = t.devise;
  const ligne = (g, d, gras) => `<div class="l${gras ? " b" : ""}"><span>${g}</span><span>${d}</span></div>`;
  const articles = t.lignes
    .map((l) => `<div class="art">${echapper(nomLigne(l))}</div>` + ligne(`${l.quantite} × ${nombre(l.prix)}`, nombre(l.quantite * l.prix)))
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Ticket ${echapper(t.numero)}</title>
<style>
@page{size:${largeur}mm auto;margin:2mm}
*{box-sizing:border-box}
body{font-family:"Courier New",monospace;font-size:${taille}px;width:${w};margin:0 auto;padding:6px 0;color:#000;background:#fff}
.c{text-align:center}.b{font-weight:700}
.l{display:flex;justify-content:space-between;gap:6px}
.art{margin-top:5px;font-weight:700;word-break:break-word}
hr{border:0;border-top:1px dashed #000;margin:6px 0}
h1{font-size:${taille + 3}px;margin:0 0 2px}
.g{font-size:${taille + 1.5}px}
</style></head><body>
<div class="c"><h1>${echapper(boutique.nom)}</h1>${boutique.tel ? `<div>Tél : ${echapper(boutique.tel)}</div>` : ""}</div>
<hr>
${ligne("Ticket", echapper(t.numero))}
${ligne("Date", echapper(dateHeure(t.dateISO)))}
${t.client && t.client.nom ? ligne("Client", echapper(t.client.nom)) : ""}
<hr>
${articles}
<hr>
${t.remise > 0 ? ligne("Sous-total", `${nombre(t.sousTotal)}`) + ligne("Remise", `- ${nombre(t.remise)}`) : ""}
<div class="l b g"><span>TOTAL</span><span>${nombre(t.total)} ${echapper(dev)}</span></div>
${ligne(`Payé (${echapper(labelMode(t.mode))})`, nombre(t.paye))}
${t.rendu > 0 ? ligne("Rendu monnaie", nombre(t.rendu)) : ""}
${t.reste > 0 ? ligne("RESTE À PAYER", `${nombre(t.reste)} ${echapper(dev)}`, true) : ""}
<hr>
<div class="c">Merci de ta visite !</div>
</body></html>`;
}

function texteRecuWhatsApp(t, boutique) {
  const dev = t.devise;
  const l = [`🧾 *${boutique.nom}* — Reçu ${t.numero}`, dateHeure(t.dateISO), ""];
  t.lignes.forEach((x) => l.push(`• ${x.quantite} × ${nomLigne(x)} — ${argent(x.quantite * x.prix, dev)}`));
  l.push("");
  if (t.remise > 0) l.push(`Remise : -${argent(t.remise, dev)}`);
  l.push(`*Total : ${argent(t.total, dev)}*`);
  l.push(`Payé : ${argent(t.paye, dev)} (${labelMode(t.mode)})`);
  if (t.rendu > 0) l.push(`Monnaie rendue : ${argent(t.rendu, dev)}`);
  if (t.reste > 0) l.push(`*Reste à payer : ${argent(t.reste, dev)}*`);
  l.push("", "Merci de ta confiance ! 🙏");
  return l.join("\n");
}

// ------------------------------------------------------------------ styles
const C = { vert: "#1a7a3c", fonce: "#16231F", fond: "#FAFAF7", bord: "#ECE8DC", ambre: "#e8920a", rouge: "#D64933", rougeF: "#B23A26", gris: "#6B7168", gris2: "#8A9089" };
const S = {
  carte: { background: "white", border: `1px solid ${C.bord}`, borderRadius: 14, padding: 14, marginBottom: 12 },
  titre: { fontWeight: 700, fontSize: 15, color: C.fonce },
  aide: { fontSize: 13, color: C.gris, lineHeight: 1.5 },
  label: { fontSize: 13, color: C.gris2, margin: "10px 0 4px", display: "block" },
  champ: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 16, boxSizing: "border-box", background: "white", color: C.fonce },
  bouton: { background: C.vert, color: "white", border: "none", padding: "13px 16px", borderRadius: 11, fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 46 },
  boutonClair: { background: "#F4F1E8", color: C.fonce, border: "1px solid #DDD8CC", padding: "11px 14px", borderRadius: 11, fontWeight: 600, fontSize: 14, cursor: "pointer", minHeight: 44 },
  boutonPetit: { background: "#F4F1E8", color: C.fonce, border: "1px solid #DDD8CC", padding: "8px 12px", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", minHeight: 38 },
  ligne: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 14, padding: "3px 0" },
};
const puce = (actif, couleur = C.vert) => ({ background: actif ? couleur : "#FAFAF7", color: actif ? "white" : C.fonce, border: `1px solid ${actif ? couleur : "#DDD8CC"}`, borderRadius: 999, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 40 });

function Alerte({ type = "erreur", children, style }) {
  const c = type === "erreur" ? { bg: "#FBEAE6", co: C.rougeF, bo: "#F0B8AC" } : type === "ok" ? { bg: "#EAF3DE", co: "#3B6D11", bo: "#C7DDA3" } : { bg: "#FBF3E3", co: "#8A6412", bo: "#EBD59B" };
  return <div role={type === "erreur" ? "alert" : "status"} style={{ background: c.bg, color: c.co, border: `1px solid ${c.bo}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.45, marginTop: 10, ...style }}>{children}</div>;
}

function Feuille({ titre, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.55)", zIndex: 95, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: "18px 16px 26px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: C.fonce }}>{titre}</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", fontSize: 22, color: C.gris2, cursor: "pointer", padding: 6 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChoixMode({ valeur, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {MODES.map((m) => (
        <button key={m.key} type="button" onClick={() => onChange(m.key)} style={puce(valeur === m.key)} aria-pressed={valeur === m.key}>{m.label}</button>
      ))}
    </div>
  );
}

// ================================================================== 1) VENTE RAPIDE
function VenteRapide({ workspace, session, donnees, recharger, onChange, peutForcer, bloque }) {
  const dev = devise(workspace.currency);
  const boutique = { nom: workspace.name || "Ma boutique", tel: workspace.whatsapp_number || "" };
  const [etape, setEtape] = useState("produits");
  const [recherche, setRecherche] = useState("");
  const [panier, setPanier] = useState([]);
  const [choixVariante, setChoixVariante] = useState(null);
  const [libreOuvert, setLibreOuvert] = useState(false);
  const [libre, setLibre] = useState({ nom: "", prix: "" });
  const [remiseType, setRemiseType] = useState("montant");
  const [remiseVal, setRemiseVal] = useState("");
  const [nomClient, setNomClient] = useState("");
  const [telClient, setTelClient] = useState("");
  const [mode, setMode] = useState("cash");
  const [recu, setRecu] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [manques, setManques] = useState(null);
  const [succes, setSucces] = useState(null);
  const [largeur, setLargeur] = useState(80);
  const iframeRef = useRef(null);

  const produits = donnees ? donnees.produits : [];
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? produits.filter((p) => String(p.nom || "").toLowerCase().includes(q)) : produits;
  }, [produits, recherche]);

  const sousTotal = panier.reduce((s, l) => s + l.prix * l.quantite, 0);
  const remise = calculRemise(sousTotal, remiseType, remiseVal);
  const total = sousTotal - remise;
  const nbArticles = panier.reduce((s, l) => s + l.quantite, 0);
  const recuNum = recu === "" ? total : Math.max(0, Number(recu) || 0);
  const paye = Math.min(recuNum, total);
  const rendu = mode === "cash" ? Math.max(0, recuNum - total) : 0;
  const excesNonCash = mode !== "cash" && recuNum > total;
  const reste = total - paye;
  const creditSansClient = reste > 0 && (!nomClient.trim() || telChiffres(telClient).length < 8);

  function ajouter(p, variante) {
    const label = variante ? libelleVariante(variante) : null;
    const cle = `${p.id}|${label || ""}`;
    const prixV = variante && variante.prix != null && variante.prix !== "" ? Number(variante.prix) : Number(p.prix_vente) || 0;
    setManques(null);
    setPanier((l) => {
      const i = l.findIndex((x) => x.cle === cle);
      if (i >= 0) return l.map((x, j) => (j === i ? { ...x, quantite: x.quantite + 1 } : x));
      return [...l, { cle, produit_id: p.id, nom: p.nom, variante: label, prix: prixV, quantite: 1 }];
    });
  }
  function toucherProduit(p) {
    if (Array.isArray(p.variantes) && p.variantes.length > 0) setChoixVariante(p);
    else ajouter(p, null);
  }
  function changerQuantite(cle, q) {
    setManques(null);
    setPanier((l) => l.flatMap((x) => (x.cle !== cle ? [x] : q <= 0 ? [] : [{ ...x, quantite: Math.floor(q) }])));
  }
  function changerPrix(cle, prix) {
    setManques(null);
    setPanier((l) => l.map((x) => (x.cle === cle ? { ...x, prix: Math.max(0, Number(prix) || 0) } : x)));
  }
  function ajouterLibre() {
    const prix = Number(libre.prix);
    if (!libre.nom.trim() || !(prix > 0)) return;
    setPanier((l) => [...l, { cle: `libre|${Date.now()}`, produit_id: null, nom: libre.nom.trim(), variante: null, prix, quantite: 1, libre: true }]);
    setLibre({ nom: "", prix: "" });
    setLibreOuvert(false);
  }

  function reinitialiser() {
    setPanier([]); setRemiseVal(""); setRemiseType("montant"); setNomClient(""); setTelClient(""); setMode("cash"); setRecu("");
    setErreur(null); setManques(null); setSucces(null); setEtape("produits"); setRecherche("");
  }

  async function valider(forcer = false) {
    if (enCours) return;
    setErreur(null);
    if (bloque) { setErreur("Ta limite de ventes du mois est atteinte pour ton plan. Passe à un plan supérieur pour continuer."); return; }
    if (panier.length === 0) { setErreur("Le panier est vide."); return; }
    if (!(total > 0)) { setErreur("Le total doit être supérieur à 0."); return; }
    if (excesNonCash) { setErreur("Le rendu de monnaie n'est possible qu'en espèces : le montant reçu ne peut pas dépasser le total."); return; }
    if (creditSansClient) { setErreur("Pour une vente à crédit, le nom ET le téléphone du client sont obligatoires (pour pouvoir le relancer)."); return; }
    setEnCours(true);
    try {
      // 1) Stock frais (un autre téléphone a pu vendre entre-temps)
      const frais = await chargerDonneesStock(workspace.id);
      const demandes = {};
      panier.forEach((l) => {
        if (!l.produit_id) return;
        const k = `${l.produit_id}|${l.variante || ""}`;
        demandes[k] = demandes[k] || { produit_id: l.produit_id, variante: l.variante, quantite: 0 };
        demandes[k].quantite += l.quantite;
      });
      const manquants = [];
      Object.values(demandes).forEach((d) => {
        const p = frais.produits.find((x) => x.id === d.produit_id);
        if (!p) return;
        const s = stockDisponible(p, d.variante, frais);
        if (s.suivi && d.quantite > s.dispo) manquants.push({ nom: nomLigne({ nom: p.nom, variante: d.variante }), dispo: Math.max(0, s.dispo), demande: d.quantite });
      });
      if (manquants.length > 0 && !(forcer && peutForcer)) {
        setManques(manquants);
        setEnCours(false);
        return;
      }
      setManques(null);

      // 2) La commande — mêmes colonnes que le flux retail « sur place » (addCommande dans App.jsx)
      const statut = paye >= total ? "confirmee" : "en_cours";
      const maintenant = new Date().toISOString();
      const par = (session && session.user && session.user.email ? session.user.email.split("@")[0] : "Caisse");
      const produitTexte = panier.map((l) => `${nomLigne(l)}${l.quantite > 1 ? ` x${l.quantite}` : ""}`).join(", ");
      const { data: cmd, error: errCmd } = await supabase
        .from("commandes")
        .insert([{
          client: nomClient.trim() || "Client comptoir",
          tel: telClient.trim(),
          produit: produitTexte,
          montant: total,
          zone: "",
          mode_vente: "sur_place",
          montant_paye: paye,
          mode_paiement: paye > 0 ? mode : null,
          workspace_id: workspace.id,
          statut,
          confirmed_at: statut === "confirmee" ? maintenant : null,
          confirmed_by: statut === "confirmee" ? par : null,
        }])
        .select()
        .single();
      if (errCmd || !cmd) { setErreur("La vente n'a pas pu être enregistrée : " + messageErreur(errCmd)); setEnCours(false); return; }

      const avertissements = [];
      // 3) Les lignes d'articles (utilisées par le calcul de stock de l'app)
      const { error: errItems } = await supabase.from("commande_items").insert(
        panier.map((l) => ({ commande_id: cmd.id, workspace_id: workspace.id, produit_id: l.produit_id, produit_nom: nomLigne(l), quantite: l.quantite, prix_unitaire: l.prix }))
      );
      if (errItems) avertissements.push("Le détail des articles n'a pas pu être enregistré (" + messageErreur(errItems) + "). Le stock ne sera pas mis à jour pour cette vente.");
      // 4) Le paiement (comme FenetrePaiementPartiel)
      if (paye > 0) {
        const { error: errPai } = await supabase.from("paiements_commande").insert([{ workspace_id: workspace.id, commande_id: cmd.id, montant: paye, mode_paiement: mode, enregistre_par: par }]);
        if (errPai) avertissements.push("Le paiement n'a pas pu être détaillé (" + messageErreur(errPai) + ").");
      }
      // 5) Remise / rendu / n° de ticket : table à part (les colonnes de commandes ne changent pas). Non bloquant.
      try {
        await supabase.from("ventes_caisse").insert([{ workspace_id: workspace.id, commande_id: cmd.id, sous_total: sousTotal, remise, montant_recu: recuNum, rendu, mode_paiement: paye > 0 ? mode : null, cree_par: session && session.user ? session.user.id : null }]);
      } catch (_) { /* table pas encore créée : la vente reste valide */ }

      setSucces({
        id: cmd.id, numero: numeroTicket(cmd.id), dateISO: cmd.created_at || maintenant, lignes: panier, sousTotal, remise, total, paye, reste, rendu, mode,
        client: { nom: nomClient.trim(), tel: telClient.trim() }, devise: dev, avertissements,
      });
      if (onChange) onChange();
      recharger();
    } catch (e) {
      setErreur("Problème de connexion : " + messageErreur(e) + ". Vérifie ton réseau puis réessaie.");
    }
    setEnCours(false);
  }

  function imprimer() {
    try {
      const w = iframeRef.current && iframeRef.current.contentWindow;
      if (w) { w.focus(); w.print(); }
    } catch (_) { /* impression bloquée par le navigateur */ }
  }

  // ---------------------------------------------------------------- écran de succès
  if (succes) {
    const html = htmlTicket(succes, largeur, boutique);
    const wa = lienWhatsApp(succes.client.tel, texteRecuWhatsApp(succes, boutique));
    return (
      <div style={{ padding: "16px 16px 40px", maxWidth: 560, margin: "0 auto" }} data-testid="succes-vente">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: C.fonce }}>Vente enregistrée</div>
          <div style={{ fontSize: 14, color: C.gris }}>Ticket {succes.numero} · {argent(succes.total, dev)}</div>
        </div>
        {succes.rendu > 0 && <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: 12, textAlign: "center", fontWeight: 800, fontSize: 18, color: "#2E6B10", marginBottom: 10 }}>Rendu de monnaie : {argent(succes.rendu, dev)}</div>}
        {succes.reste > 0 && <Alerte type="info" style={{ marginTop: 0, marginBottom: 10 }}>Dette enregistrée : <b>{succes.client.nom}</b> te doit encore <b>{argent(succes.reste, dev)}</b>. Tu la retrouves dans « Dettes clients ».</Alerte>}
        {succes.avertissements.map((a, i) => <Alerte key={i} type="info" style={{ marginTop: 0, marginBottom: 10 }}>⚠️ {a}</Alerte>)}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
          {[58, 80].map((l) => <button key={l} onClick={() => setLargeur(l)} style={puce(largeur === l)} aria-pressed={largeur === l}>Ticket {l} mm</button>)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <iframe ref={iframeRef} title="Aperçu du ticket" srcDoc={html} onLoad={(e) => { try { const d = e.target.contentDocument; e.target.style.height = d.documentElement.scrollHeight + 12 + "px"; } catch (_) {} }} style={{ width: largeur === 58 ? 236 : 316, height: 420, border: `1px solid ${C.bord}`, background: "white", borderRadius: 6 }} />
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={imprimer} style={S.bouton}>🖨️ Imprimer le ticket</button>
          <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...S.bouton, background: "#25D366", textDecoration: "none", textAlign: "center", display: "block", boxSizing: "border-box", paddingTop: 15 }}>💬 Envoyer le reçu par WhatsApp</a>
          <button onClick={reinitialiser} style={S.boutonClair}>＋ Nouvelle vente</button>
        </div>
      </div>
    );
  }

  const styleCarteProduit = { background: "white", border: `1px solid ${C.bord}`, borderRadius: 12, padding: 10, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, minHeight: 84, color: C.fonce };

  // ---------------------------------------------------------------- étape 2 : panier + paiement
  if (etape === "paiement") {
    return (
      <div style={{ padding: "12px 16px 40px", maxWidth: 620, margin: "0 auto" }}>
        <button onClick={() => setEtape("produits")} style={{ ...S.boutonPetit, marginBottom: 10 }}>← Ajouter des articles</button>
        <div style={S.carte}>
          <div style={{ ...S.titre, marginBottom: 8 }}>🛒 Panier</div>
          {panier.length === 0 && <div style={S.aide}>Le panier est vide.</div>}
          {panier.map((l) => (
            <div key={l.cle} style={{ borderTop: `1px solid ${C.bord}`, padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{nomLigne(l)}</div>
                <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>{argent(l.prix * l.quantite, dev)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <button aria-label={`Moins ${nomLigne(l)}`} onClick={() => changerQuantite(l.cle, l.quantite - 1)} style={{ ...S.boutonPetit, width: 42, fontSize: 18 }}>−</button>
                <input aria-label={`Quantité ${nomLigne(l)}`} type="number" inputMode="numeric" min="1" value={l.quantite} onChange={(e) => changerQuantite(l.cle, Number(e.target.value) || 1)} style={{ ...S.champ, width: 64, textAlign: "center", padding: "8px 4px" }} />
                <button aria-label={`Plus ${nomLigne(l)}`} onClick={() => changerQuantite(l.cle, l.quantite + 1)} style={{ ...S.boutonPetit, width: 42, fontSize: 18 }}>+</button>
                <span style={{ fontSize: 13, color: C.gris2, marginLeft: 6 }}>Prix</span>
                <input aria-label={`Prix unitaire ${nomLigne(l)}`} type="number" inputMode="numeric" min="0" value={l.prix} onChange={(e) => changerPrix(l.cle, e.target.value)} style={{ ...S.champ, width: 96, padding: "8px 8px" }} />
                <button aria-label={`Retirer ${nomLigne(l)}`} onClick={() => changerQuantite(l.cle, 0)} style={{ ...S.boutonPetit, marginLeft: "auto", color: C.rougeF }}>🗑</button>
              </div>
            </div>
          ))}
        </div>

        <div style={S.carte}>
          <div style={S.titre}>🏷️ Remise (optionnel)</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setRemiseType("montant")} style={puce(remiseType === "montant")}>Montant ({dev})</button>
            <button onClick={() => setRemiseType("pct")} style={puce(remiseType === "pct")}>Pourcentage (%)</button>
          </div>
          <input aria-label="Valeur de la remise" type="number" inputMode="decimal" min="0" placeholder={remiseType === "pct" ? "Ex : 10" : "Ex : 500"} value={remiseVal} onChange={(e) => setRemiseVal(e.target.value)} style={{ ...S.champ, marginTop: 8 }} />
        </div>

        <div style={S.carte}>
          <div style={S.titre}>👤 Client {reste > 0 ? <span style={{ color: C.rougeF, fontSize: 13 }}>(obligatoire : vente à crédit)</span> : <span style={{ color: C.gris2, fontSize: 13, fontWeight: 400 }}>(optionnel)</span>}</div>
          <input aria-label="Nom du client" placeholder="Nom du client" value={nomClient} onChange={(e) => setNomClient(e.target.value)} style={{ ...S.champ, marginTop: 8 }} />
          <input aria-label="Téléphone du client" type="tel" inputMode="tel" placeholder="Téléphone (ex : 07 00 00 00 00)" value={telClient} onChange={(e) => setTelClient(e.target.value)} style={{ ...S.champ, marginTop: 8 }} />
        </div>

        <div style={S.carte}>
          <div style={S.titre}>💰 Paiement</div>
          <div style={{ marginTop: 8 }}><ChoixMode valeur={mode} onChange={setMode} /></div>
          <label style={S.label} htmlFor="montant-recu">Montant reçu ({dev})</label>
          <input id="montant-recu" type="number" inputMode="numeric" min="0" placeholder={String(total)} value={recu} onChange={(e) => setRecu(e.target.value)} style={{ ...S.champ, fontWeight: 700, fontSize: 18 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => setRecu("")} style={S.boutonPetit}>Montant exact</button>
            <button onClick={() => setRecu("0")} style={S.boutonPetit}>Rien reçu (tout à crédit)</button>
          </div>
          <div style={{ borderTop: `1px solid ${C.bord}`, marginTop: 12, paddingTop: 8 }}>
            <div style={S.ligne}><span>Sous-total</span><b>{argent(sousTotal, dev)}</b></div>
            {remise > 0 && <div style={{ ...S.ligne, color: C.rougeF }}><span>Remise</span><b>- {argent(remise, dev)}</b></div>}
            <div style={{ ...S.ligne, fontSize: 18 }}><span>Total à payer</span><b data-testid="total">{argent(total, dev)}</b></div>
            <div style={S.ligne}><span>Payé maintenant</span><b>{argent(paye, dev)}</b></div>
            {rendu > 0 && <div style={{ ...S.ligne, fontSize: 18, color: "#2E6B10" }}><span>Rendu de monnaie</span><b data-testid="rendu">{argent(rendu, dev)}</b></div>}
            {reste > 0 && <div style={{ ...S.ligne, fontSize: 16, color: C.rougeF }}><span>Reste à payer (dette)</span><b data-testid="reste">{argent(reste, dev)}</b></div>}
          </div>
          {excesNonCash && <Alerte>En {labelMode(mode)}, le montant reçu ne peut pas dépasser le total (le rendu de monnaie ne se fait qu'en espèces).</Alerte>}
          {reste > 0 && <Alerte type="info">Vente à crédit : {argent(reste, dev)} resteront dus par le client. Elle apparaîtra dans « Dettes clients ».</Alerte>}
        </div>

        {bloque && <Alerte>Ta limite de ventes du mois est atteinte pour ton plan. Passe à un plan supérieur pour continuer à vendre.</Alerte>}
        {erreur && <Alerte>{erreur}</Alerte>}
        {manques && (
          <Alerte data-testid="stock-insuffisant">
            <b>Stock insuffisant</b>
            <ul style={{ margin: "6px 0 6px 18px", padding: 0 }}>
              {manques.map((m, i) => <li key={i}>{m.nom} : il en reste {m.dispo}, tu en vends {m.demande}</li>)}
            </ul>
            {peutForcer
              ? <button onClick={() => valider(true)} disabled={enCours} style={{ ...S.boutonPetit, background: C.rougeF, color: "white", border: "none" }}>Vendre quand même</button>
              : <span>Demande au propriétaire ou à un administrateur d'autoriser cette vente.</span>}
          </Alerte>
        )}
        <button onClick={() => valider(false)} disabled={enCours || panier.length === 0} style={{ ...S.bouton, width: "100%", marginTop: 14, opacity: enCours || panier.length === 0 ? 0.6 : 1, fontSize: 16 }}>
          {enCours ? "Enregistrement…" : reste > 0 ? `Valider la vente à crédit (${argent(total, dev)})` : `Valider la vente · ${argent(total, dev)}`}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------- étape 1 : produits
  return (
    <div style={{ padding: "12px 16px 110px", maxWidth: 760, margin: "0 auto" }}>
      <input aria-label="Rechercher un produit" type="search" placeholder="🔎 Rechercher un produit…" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ ...S.champ, marginBottom: 12 }} />
      {!donnees && <div style={S.aide}>Chargement des produits…</div>}
      {donnees && produits.length === 0 && <Alerte type="info" style={{ marginTop: 0 }}>Tu n'as pas encore de produit dans ton catalogue. Ajoute-en dans « 📦 Produits », ou vends un article hors catalogue ci-dessous.</Alerte>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {visibles.map((p) => {
          const aVariantes = Array.isArray(p.variantes) && p.variantes.length > 0;
          const st = !aVariantes ? stockDisponible(p, null, donnees) : null;
          const enPanier = panier.filter((l) => l.produit_id === p.id).reduce((s, l) => s + l.quantite, 0);
          return (
            <button key={p.id} onClick={() => toucherProduit(p)} style={{ ...styleCarteProduit, position: "relative" }} aria-label={`Ajouter ${p.nom}`}>
              {p.photo_url && <img src={p.photo_url} alt="" loading="lazy" style={{ width: "100%", height: 64, objectFit: "contain", borderRadius: 8 }} onError={(e) => { e.target.style.display = "none"; }} />}
              <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25, overflowWrap: "anywhere" }}>{p.nom}</span>
              <span style={{ color: C.vert, fontWeight: 700, fontSize: 14 }}>{aVariantes ? "Plusieurs choix" : argent(Number(p.prix_vente) || 0, dev)}</span>
              {st && st.suivi && <span style={{ fontSize: 12.5, color: st.dispo <= 0 ? C.rougeF : st.dispo <= 5 ? "#8A6412" : C.gris2 }}>{st.dispo <= 0 ? "Épuisé" : `Stock : ${st.dispo}`}</span>}
              {enPanier > 0 && <span style={{ position: "absolute", top: 6, right: 6, background: C.vert, color: "white", borderRadius: 99, minWidth: 22, height: 22, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{enPanier}</span>}
            </button>
          );
        })}
      </div>
      {donnees && visibles.length === 0 && produits.length > 0 && <div style={{ ...S.aide, marginTop: 8 }}>Aucun produit ne correspond à « {recherche} ».</div>}

      <button onClick={() => setLibreOuvert(true)} style={{ ...S.boutonClair, marginTop: 14, width: "100%" }}>＋ Article hors catalogue</button>

      {panier.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "white", borderTop: `1px solid ${C.bord}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", zIndex: 5 }}>
          <button onClick={() => setEtape("paiement")} style={{ ...S.bouton, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16 }}>
            <span>🛒 {nbArticles} article{nbArticles > 1 ? "s" : ""}</span>
            <span>Continuer · {argent(sousTotal, dev)} →</span>
          </button>
        </div>
      )}

      {choixVariante && (
        <Feuille titre={choixVariante.nom} onClose={() => setChoixVariante(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {choixVariante.variantes.map((v) => {
              const label = libelleVariante(v);
              const st = stockDisponible(choixVariante, label, donnees);
              const prixV = v.prix != null && v.prix !== "" ? Number(v.prix) : Number(choixVariante.prix_vente) || 0;
              return (
                <button key={v.id || label} onClick={() => { ajouter(choixVariante, v); setChoixVariante(null); }} style={{ ...S.boutonClair, display: "flex", justifyContent: "space-between", textAlign: "left" }}>
                  <span>{label}</span>
                  <span style={{ color: C.vert, fontWeight: 700 }}>{argent(prixV, dev)}{st.suivi ? <span style={{ color: st.dispo <= 0 ? C.rougeF : C.gris2, fontWeight: 500 }}> · {st.dispo <= 0 ? "épuisé" : `stock ${st.dispo}`}</span> : null}</span>
                </button>
              );
            })}
          </div>
        </Feuille>
      )}

      {libreOuvert && (
        <Feuille titre="Article hors catalogue" onClose={() => setLibreOuvert(false)}>
          <div style={S.aide}>Pour vendre un article qui n'est pas dans ton catalogue. Le stock n'est pas suivi pour cet article.</div>
          <input aria-label="Nom de l'article" placeholder="Nom de l'article" value={libre.nom} onChange={(e) => setLibre({ ...libre, nom: e.target.value })} style={{ ...S.champ, marginTop: 10 }} />
          <input aria-label="Prix de l'article" type="number" inputMode="numeric" placeholder={`Prix (${dev})`} value={libre.prix} onChange={(e) => setLibre({ ...libre, prix: e.target.value })} style={{ ...S.champ, marginTop: 8 }} />
          <button onClick={ajouterLibre} disabled={!libre.nom.trim() || !(Number(libre.prix) > 0)} style={{ ...S.bouton, width: "100%", marginTop: 12, opacity: !libre.nom.trim() || !(Number(libre.prix) > 0) ? 0.5 : 1 }}>Ajouter au panier</button>
        </Feuille>
      )}
    </div>
  );
}

// ================================================================== 2) DETTES CLIENTS
function DettesClients({ workspace, session, onChange, peutEncaisser }) {
  const dev = devise(workspace.currency);
  const nomBoutique = workspace.name || "ta boutique";
  const [commandes, setCommandes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [encaisse, setEncaisse] = useState(null); // { commande, montant, mode }
  const [erreurEnc, setErreurEnc] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(null); // id de dette dont l'historique est déplié
  const [historique, setHistorique] = useState({});
  const [message, setMessage] = useState(null);

  const charger = useCallback(async () => {
    try {
      const data = await toutLire(() => supabase.from("commandes").select("id, client, tel, produit, montant, montant_paye, statut, created_at").eq("workspace_id", workspace.id).neq("statut", "echouee").neq("statut", "annulee").order("created_at", { ascending: true }));
      setCommandes(data.filter((c) => c.statut !== "echouee" && c.statut !== "annulee" && Number(c.montant) - Number(c.montant_paye || 0) > 0));
      setErreur(null);
    } catch (e) {
      setErreur("Impossible de charger les dettes : " + messageErreur(e));
    }
  }, [workspace.id]);
  useEffect(() => { charger(); }, [charger]);

  const groupes = useMemo(() => {
    if (!commandes) return [];
    const q = recherche.trim().toLowerCase();
    const map = {};
    commandes.forEach((c) => {
      const chiffres = telChiffres(c.tel);
      const cle = chiffres.length >= 8 ? "t:" + chiffres.slice(-8) : "n:" + String(c.client || "").trim().toLowerCase();
      if (!map[cle]) map[cle] = { cle, nom: c.client || "Client", tel: c.tel || "", dettes: [], total: 0, plusAncien: c.created_at };
      const g = map[cle];
      g.dettes.push(c);
      g.total += Number(c.montant) - Number(c.montant_paye || 0);
      if (c.created_at < g.plusAncien) g.plusAncien = c.created_at;
      if (!g.tel && c.tel) g.tel = c.tel;
    });
    return Object.values(map)
      .filter((g) => !q || g.nom.toLowerCase().includes(q) || telChiffres(g.tel).includes(telChiffres(q) || "\u0000"))
      .map((g) => ({ ...g, dettes: g.dettes.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) }))
      .sort((a, b) => (a.plusAncien < b.plusAncien ? -1 : 1));
  }, [commandes, recherche]);
  const totalGlobal = groupes.reduce((s, g) => s + g.total, 0);

  async function voirHistorique(c) {
    if (ouvert === c.id) { setOuvert(null); return; }
    setOuvert(c.id);
    const { data, error } = await supabase.from("paiements_commande").select("*").eq("commande_id", c.id).order("created_at", { ascending: true });
    setHistorique((h) => ({ ...h, [c.id]: error ? { erreur: messageErreur(error) } : { lignes: data || [] } }));
  }

  async function confirmerEncaissement() {
    if (!encaisse || enCours) return;
    setErreurEnc(null);
    const montant = Number(encaisse.montant);
    if (!(montant > 0)) { setErreurEnc("Entre un montant supérieur à 0."); return; }
    setEnCours(true);
    try {
      // On relit la dette (un autre téléphone a pu encaisser entre-temps)
      const { data: fraiche } = await supabase.from("commandes").select("id, montant, montant_paye, statut").eq("id", encaisse.commande.id).maybeSingle();
      const c = fraiche || encaisse.commande;
      const reste = Number(c.montant) - Number(c.montant_paye || 0);
      if (reste <= 0) { setErreurEnc("Cette dette est déjà entièrement payée."); setEnCours(false); charger(); return; }
      if (montant > reste) { setErreurEnc(`Tu ne peux pas encaisser plus que le reste à payer (${argent(reste, dev)}).`); setEnCours(false); return; }
      const par = session && session.user && session.user.email ? session.user.email.split("@")[0] : "Caisse";
      const nouveauPaye = Number(c.montant_paye || 0) + montant;
      const solde = nouveauPaye >= Number(c.montant);
      const { error: e1 } = await supabase.from("paiements_commande").insert([{ workspace_id: workspace.id, commande_id: c.id, montant, mode_paiement: encaisse.mode, enregistre_par: par }]);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("commandes").update({ montant_paye: nouveauPaye, ...(solde ? { statut: "confirmee", confirmed_at: new Date().toISOString(), confirmed_by: par } : {}) }).eq("id", c.id);
      if (e2) throw new Error("Le paiement est noté mais la dette n'a pas pu être mise à jour : " + messageErreur(e2));
      setMessage(`✅ ${argent(montant, dev)} encaissés${solde ? " — dette entièrement payée" : ` — il reste ${argent(reste - montant, dev)}`}.`);
      setEncaisse(null);
      setHistorique((h) => { const n = { ...h }; delete n[c.id]; return n; });
      setOuvert(null);
      await charger();
      if (onChange) onChange();
    } catch (e) {
      setErreurEnc(messageErreur(e));
    }
    setEnCours(false);
  }

  function texteRelance(g) {
    const prenom = String(g.nom).trim().split(/\s+/)[0];
    const ancien = g.dettes[0];
    const detail = g.dettes.length === 1 ? ` pour ton achat du ${dateCourte(ancien.created_at)}` : ` pour tes ${g.dettes.length} achats (le plus ancien date du ${dateCourte(ancien.created_at)})`;
    return `Bonjour ${prenom} 👋, c'est ${nomBoutique}. Petit rappel amical : il te reste ${argent(g.total, dev)} à régler${detail}. Tu peux payer en espèces, Wave, Orange Money ou MTN Money quand tu passes. Merci beaucoup pour ta confiance ! 🙏`;
  }

  if (erreur) return <div style={{ padding: 16 }}><Alerte>{erreur}</Alerte><button onClick={charger} style={{ ...S.boutonClair, marginTop: 10 }}>Réessayer</button></div>;
  if (!commandes) return <div style={{ padding: 16 }} className="aide">Chargement des dettes…</div>;

  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ background: totalGlobal > 0 ? "#FBEAE6" : "#EAF3DE", border: `1px solid ${totalGlobal > 0 ? "#F0B8AC" : "#C7DDA3"}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.gris }}>Total que tes clients te doivent</div>
        <div style={{ fontWeight: 800, fontSize: 26, color: totalGlobal > 0 ? C.rougeF : "#2E6B10" }} data-testid="total-dettes">{argent(totalGlobal, dev)}</div>
        <div style={{ fontSize: 13, color: C.gris }}>{groupes.length} client{groupes.length > 1 ? "s" : ""} · {groupes.reduce((s, g) => s + g.dettes.length, 0)} vente{groupes.reduce((s, g) => s + g.dettes.length, 0) > 1 ? "s" : ""} à crédit</div>
      </div>
      <input aria-label="Chercher un client" type="search" placeholder="🔎 Chercher un client (nom ou téléphone)" value={recherche} onChange={(e) => setRecherche(e.target.value)} style={{ ...S.champ, marginBottom: 12 }} />
      {message && <Alerte type="ok" style={{ marginTop: 0, marginBottom: 12 }}>{message}</Alerte>}
      {groupes.length === 0 && <div style={S.carte}><div style={S.aide}>{commandes.length === 0 ? "🎉 Aucun client ne te doit d'argent pour le moment." : "Aucun client ne correspond à ta recherche."}</div></div>}
      {groupes.map((g) => (
        <div key={g.cle} style={S.carte} data-testid="groupe-dette">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{g.nom}</div>
              <div style={{ fontSize: 13, color: C.gris2 }}>{g.tel || "Pas de téléphone"} · depuis {joursDepuis(g.plusAncien)} jour{joursDepuis(g.plusAncien) > 1 ? "s" : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, color: C.gris2 }}>Total dû</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: C.rougeF }}>{argent(g.total, dev)}</div>
            </div>
          </div>
          {telChiffres(g.tel).length >= 8
            ? <a href={lienWhatsApp(g.tel, texteRelance(g))} target="_blank" rel="noopener noreferrer" style={{ ...S.boutonPetit, display: "inline-block", textDecoration: "none", marginTop: 10, background: "#E7F7EC", borderColor: "#B7E2C4", color: "#1C6B3A" }}>💬 Relancer par WhatsApp</a>
            : <div style={{ fontSize: 12.5, color: C.gris2, marginTop: 8 }}>Pas de numéro : impossible de relancer par WhatsApp.</div>}
          {g.dettes.map((c) => {
            const reste = Number(c.montant) - Number(c.montant_paye || 0);
            const h = historique[c.id];
            return (
              <div key={c.id} style={{ borderTop: `1px solid ${C.bord}`, marginTop: 10, paddingTop: 10 }} data-testid="dette">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                  <span style={{ overflowWrap: "anywhere" }}>{dateCourte(c.created_at)} · {c.produit || "Vente"}</span>
                </div>
                <div style={{ fontSize: 13, color: C.gris, marginTop: 2 }}>Total {argent(c.montant, dev)} · payé {argent(c.montant_paye || 0, dev)} · <b style={{ color: C.rougeF }}>reste {argent(reste, dev)}</b></div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {peutEncaisser && <button onClick={() => { setErreurEnc(null); setMessage(null); setEncaisse({ commande: c, montant: String(reste), mode: "cash" }); }} style={{ ...S.boutonPetit, background: C.vert, color: "white", border: "none" }}>Encaisser</button>}
                  <button onClick={() => voirHistorique(c)} style={S.boutonPetit}>{ouvert === c.id ? "Masquer l'historique" : "Historique"}</button>
                </div>
                {ouvert === c.id && (
                  <div style={{ marginTop: 8 }}>
                    {!h && <div style={S.aide}>Chargement…</div>}
                    {h && h.erreur && <Alerte>{h.erreur}</Alerte>}
                    {h && h.lignes && h.lignes.length === 0 && <div style={S.aide}>Aucun paiement détaillé pour cette vente{Number(c.montant_paye) > 0 ? ` (${argent(c.montant_paye, dev)} déjà notés sur la vente)` : ""}.</div>}
                    {h && h.lignes && h.lignes.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", background: "#EAF3DE", borderRadius: 8, padding: "7px 10px", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: "#3B6D11", fontWeight: 700 }}>{argent(p.montant, dev)} — {labelMode(p.mode_paiement)}</span>
                        <span style={{ color: C.gris2 }}>{dateHeure(p.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {encaisse && (
        <Feuille titre="Encaisser un paiement" onClose={() => setEncaisse(null)}>
          {(() => {
            const reste = Number(encaisse.commande.montant) - Number(encaisse.commande.montant_paye || 0);
            const m = Number(encaisse.montant) || 0;
            return (
              <>
                <div style={S.aide}>{encaisse.commande.client} — reste {argent(reste, dev)} sur {argent(encaisse.commande.montant, dev)}</div>
                <label style={S.label} htmlFor="montant-encaisse">Montant reçu ({dev})</label>
                <input id="montant-encaisse" type="number" inputMode="numeric" min="0" value={encaisse.montant} onChange={(e) => setEncaisse({ ...encaisse, montant: e.target.value })} style={{ ...S.champ, fontWeight: 700, fontSize: 18 }} />
                <label style={S.label}>Mode de paiement</label>
                <ChoixMode valeur={encaisse.mode} onChange={(k) => setEncaisse({ ...encaisse, mode: k })} />
                {m > 0 && m < reste && <Alerte type="info">Il restera encore {argent(reste - m, dev)} à payer après ce paiement.</Alerte>}
                {m > reste && <Alerte>Tu ne peux pas encaisser plus que le reste à payer ({argent(reste, dev)}).</Alerte>}
                {erreurEnc && <Alerte>{erreurEnc}</Alerte>}
                <button onClick={confirmerEncaissement} disabled={enCours || !(m > 0) || m > reste} style={{ ...S.bouton, width: "100%", marginTop: 14, opacity: enCours || !(m > 0) || m > reste ? 0.5 : 1 }}>{enCours ? "Enregistrement…" : "Confirmer l'encaissement"}</button>
              </>
            );
          })()}
        </Feuille>
      )}
    </div>
  );
}

// ================================================================== 3) CLÔTURE DE CAISSE
async function calculerJournee(workspaceId, dateStr) {
  const [debut, fin] = bornesJour(dateStr);
  const paiements = await toutLire(() => supabase.from("paiements_commande").select("id, commande_id, montant, mode_paiement, created_at").eq("workspace_id", workspaceId).gte("created_at", debut).lt("created_at", fin).order("created_at", { ascending: true }));
  const commandes = await toutLire(() => supabase.from("commandes").select("id, montant, montant_paye, statut, mode_vente, created_at").eq("workspace_id", workspaceId).gte("created_at", debut).lt("created_at", fin).order("created_at", { ascending: true }));
  const ventes = commandes.filter((c) => c.statut !== "echouee" && c.statut !== "annulee" && (!c.mode_vente || c.mode_vente === "sur_place"));
  const idsVentes = new Set(ventes.map((c) => c.id));
  // Toutes les lignes de paiement (toutes dates) de ces ventes : sert à repérer les paiements « sans détail »
  const toutesLignes = {};
  for (const lot of decouper(ventes.map((c) => c.id), 100)) {
    const l = await toutLire(() => supabase.from("paiements_commande").select("commande_id, montant").in("commande_id", lot));
    l.forEach((p) => { toutesLignes[p.commande_id] = (toutesLignes[p.commande_id] || 0) + Number(p.montant || 0); });
  }
  const dansLeJour = {};
  paiements.forEach((p) => { dansLeJour[p.commande_id] = (dansLeJour[p.commande_id] || 0) + Number(p.montant || 0); });

  let sansDetail = 0, detteTotal = 0, detteNb = 0, totalVentes = 0;
  ventes.forEach((c) => {
    const montant = Number(c.montant || 0);
    totalVentes += montant;
    const sd = Math.max(0, Number(c.montant_paye || 0) - (toutesLignes[c.id] || 0));
    sansDetail += sd;
    const dette = Math.max(0, montant - (dansLeJour[c.id] || 0) - sd);
    if (dette > 0) { detteTotal += dette; detteNb += 1; }
  });

  const parMode = {};
  let totalEncaisse = 0, surAnciennes = 0;
  paiements.forEach((p) => {
    const k = p.mode_paiement || "inconnu";
    parMode[k] = (parMode[k] || 0) + Number(p.montant || 0);
    totalEncaisse += Number(p.montant || 0);
    if (!idsVentes.has(p.commande_id)) surAnciennes += Number(p.montant || 0);
  });

  let remises = 0;
  try {
    const vc = await toutLire(() => supabase.from("ventes_caisse").select("commande_id, remise").eq("workspace_id", workspaceId).gte("created_at", debut).lt("created_at", fin));
    vc.forEach((r) => { if (idsVentes.has(r.commande_id)) remises += Number(r.remise || 0); });
  } catch (_) { remises = 0; }

  // Paiements fournisseurs en espèces ce jour (aide à remplir les « sorties d'espèces »)
  let fournisseursEspeces = 0;
  try {
    const pf = await toutLire(() => supabase.from("paiements_fournisseur").select("montant, mode").eq("workspace_id", workspaceId).eq("date", dateStr));
    pf.forEach((p) => { if (p.mode === "cash") fournisseursEspeces += Number(p.montant || 0); });
  } catch (_) { fournisseursEspeces = 0; }

  return { parMode, totalEncaisse, nbVentes: ventes.length, totalVentes, remises, detteTotal, detteNb, sansDetail, surAnciennes, fournisseursEspeces };
}

function ClotureCaisse({ workspace, session, peutVerrouiller }) {
  const dev = devise(workspace.currency);
  const [date, setDate] = useState(jourLocalISO());
  const [calc, setCalc] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [existante, setExistante] = useState(null);
  const [fond, setFond] = useState("");
  const [sorties, setSorties] = useState("");
  const [comptees, setComptees] = useState("");
  const [note, setNote] = useState("");
  const [historique, setHistorique] = useState([]);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const chargerHistorique = useCallback(async () => {
    const { data } = await supabase.from("clotures_caisse").select("*").eq("workspace_id", workspace.id).order("date", { ascending: false }).limit(30);
    setHistorique(data || []);
  }, [workspace.id]);

  useEffect(() => {
    let annule = false;
    setCalc(null); setErreur(null); setMessage(null);
    (async () => {
      try {
        const [c, ex] = await Promise.all([
          calculerJournee(workspace.id, date),
          supabase.from("clotures_caisse").select("*").eq("workspace_id", workspace.id).eq("date", date).maybeSingle(),
        ]);
        if (annule) return;
        if (ex.error && !/relation|does not exist|schema cache/i.test(ex.error.message || "")) throw ex.error;
        if (ex.error) { setErreur("La table des clôtures n'existe pas encore : exécute le fichier SQL de la caisse dans Supabase."); }
        const cl = ex.data || null;
        setExistante(cl);
        setFond(cl ? String(cl.fond_caisse ?? "") : "");
        setSorties(cl ? String(cl.sorties_especes ?? "") : "");
        setComptees(cl && cl.especes_comptees != null ? String(cl.especes_comptees) : "");
        setNote(cl ? cl.note || "" : "");
        setCalc(c);
      } catch (e) {
        if (!annule) setErreur("Impossible de calculer la journée : " + messageErreur(e));
      }
    })();
    return () => { annule = true; };
  }, [workspace.id, date]);
  useEffect(() => { chargerHistorique(); }, [chargerHistorique]);

  const verrouillee = !!(existante && existante.verrouille);
  // Une clôture verrouillée montre les chiffres figés au moment de l'enregistrement
  const r = verrouillee && existante.details
    ? { parMode: existante.encaissements || {}, totalEncaisse: Number(existante.total_encaisse || 0), nbVentes: existante.nb_ventes, totalVentes: Number(existante.total_ventes || 0), remises: Number(existante.total_remises || 0), detteTotal: Number(existante.dettes_creees || 0), detteNb: existante.details.dette_nb || 0, sansDetail: existante.details.sans_detail || 0, surAnciennes: existante.details.sur_anciennes || 0, fournisseursEspeces: calc ? calc.fournisseursEspeces : 0 }
    : calc;
  const fondN = Number(fond) || 0;
  const sortiesN = Number(sorties) || 0;
  const especesEncaissees = r ? Number(r.parMode.cash || 0) : 0;
  const attendues = fondN + especesEncaissees - sortiesN;
  const saisie = comptees !== "";
  const ecart = saisie ? Number(comptees) - attendues : null;

  async function enregistrer() {
    if (!r || enCours) return;
    setMessage(null);
    if (!saisie) { setMessage({ ok: false, t: "Entre l'argent que tu as réellement compté en caisse." }); return; }
    setEnCours(true);
    const ligne = {
      workspace_id: workspace.id, date, fond_caisse: fondN, sorties_especes: sortiesN, especes_attendues: attendues, especes_comptees: Number(comptees), ecart,
      total_encaisse: r.totalEncaisse, nb_ventes: r.nbVentes, total_ventes: r.totalVentes, total_remises: r.remises, dettes_creees: r.detteTotal,
      encaissements: r.parMode, details: { dette_nb: r.detteNb, sans_detail: r.sansDetail, sur_anciennes: r.surAnciennes },
      note: note.trim() || null, updated_at: new Date().toISOString(),
    };
    let err;
    if (existante) {
      ({ error: err } = await supabase.from("clotures_caisse").update(ligne).eq("id", existante.id));
    } else {
      ({ error: err } = await supabase.from("clotures_caisse").insert([{ ...ligne, cree_par: session && session.user ? session.user.id : null, cree_par_nom: session && session.user && session.user.email ? session.user.email.split("@")[0] : null }]));
    }
    setEnCours(false);
    if (err) {
      setMessage({ ok: false, t: /duplicate|unique/i.test(err.message || "") ? "Une clôture existe déjà pour ce jour (peut-être faite sur un autre téléphone). Change de date puis reviens pour la recharger." : "Enregistrement impossible : " + messageErreur(err) });
      return;
    }
    const { data } = await supabase.from("clotures_caisse").select("*").eq("workspace_id", workspace.id).eq("date", date).maybeSingle();
    setExistante(data || null);
    setMessage({ ok: true, t: existante ? "✅ Clôture mise à jour." : "✅ Clôture enregistrée." });
    chargerHistorique();
  }

  async function basculerVerrou() {
    if (!existante) return;
    const { error } = await supabase.from("clotures_caisse").update({ verrouille: !existante.verrouille, updated_at: new Date().toISOString() }).eq("id", existante.id);
    if (error) { setMessage({ ok: false, t: "Action impossible : " + messageErreur(error) }); return; }
    setExistante({ ...existante, verrouille: !existante.verrouille });
    setMessage({ ok: true, t: existante.verrouille ? "Clôture déverrouillée." : "🔒 Clôture verrouillée : elle ne peut plus être modifiée." });
    chargerHistorique();
  }

  const couleurEcart = (e) => (Number(e) === 0 ? "#2E6B10" : C.rougeF);
  const texteEcart = (e) => (Number(e) === 0 ? "Caisse juste" : Number(e) < 0 ? `Il manque ${argent(Math.abs(e), dev)}` : `Surplus de ${argent(e, dev)}`);
  const modesPresents = r ? Object.keys(r.parMode).sort((a, b) => (a === "cash" ? -1 : b === "cash" ? 1 : a < b ? -1 : 1)) : [];

  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 720, margin: "0 auto" }}>
      <label style={{ ...S.label, marginTop: 0 }} htmlFor="date-cloture">Jour à clôturer</label>
      <input id="date-cloture" type="date" max={jourLocalISO()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...S.champ, marginBottom: 12 }} />
      <div style={{ fontSize: 13, color: C.gris, marginBottom: 12, textTransform: "capitalize" }}>{dateLongue(date)}</div>
      {erreur && <Alerte>{erreur}</Alerte>}
      {!r && !erreur && <div style={S.aide}>Calcul de la journée…</div>}
      {r && (
        <>
          {verrouillee && <Alerte type="info" style={{ marginTop: 0, marginBottom: 12 }}>🔒 Clôture verrouillée : les chiffres sont figés.</Alerte>}
          <div style={S.carte}>
            <div style={{ ...S.titre, marginBottom: 6 }}>💰 Encaissements du jour</div>
            {modesPresents.length === 0 && <div style={S.aide}>Aucun paiement enregistré ce jour-là.</div>}
            {modesPresents.map((k) => <div key={k} style={S.ligne}><span>{labelMode(k)}</span><b data-testid={`mode-${k}`}>{argent(r.parMode[k], dev)}</b></div>)}
            <div style={{ ...S.ligne, borderTop: `1px solid ${C.bord}`, marginTop: 6, paddingTop: 8, fontSize: 16 }}><span>Total encaissé</span><b data-testid="total-encaisse">{argent(r.totalEncaisse, dev)}</b></div>
            {r.surAnciennes > 0 && <div style={{ fontSize: 13, color: C.gris2 }}>dont {argent(r.surAnciennes, dev)} sur des ventes d'autres jours (dettes payées, livraisons…)</div>}
            {r.sansDetail > 0 && <div style={{ fontSize: 13, color: "#8A6412", marginTop: 6 }}>⚠️ {argent(r.sansDetail, dev)} ont été notés à la main sur des ventes du jour sans préciser le mode de paiement : ils ne sont pas comptés ci-dessus.</div>}
          </div>
          <div style={S.carte}>
            <div style={{ ...S.titre, marginBottom: 6 }}>🧾 Ventes du jour</div>
            <div style={S.ligne}><span>Nombre de ventes</span><b data-testid="nb-ventes">{r.nbVentes}</b></div>
            <div style={S.ligne}><span>Montant des ventes</span><b>{argent(r.totalVentes, dev)}</b></div>
            <div style={S.ligne}><span>Remises accordées</span><b data-testid="remises">{argent(r.remises, dev)}</b></div>
            <div style={S.ligne}><span>Dettes créées ce jour</span><b data-testid="dettes-creees" style={{ color: r.detteTotal > 0 ? C.rougeF : undefined }}>{argent(r.detteTotal, dev)}{r.detteNb > 0 ? ` (${r.detteNb})` : ""}</b></div>
          </div>
          <div style={S.carte}>
            <div style={{ ...S.titre, marginBottom: 6 }}>💵 Comptage des espèces</div>
            <label style={S.label} htmlFor="fond">Fond de caisse au départ (optionnel)</label>
            <input id="fond" type="number" inputMode="numeric" min="0" value={fond} disabled={verrouillee} onChange={(e) => setFond(e.target.value)} placeholder="0" style={S.champ} />
            <label style={S.label} htmlFor="sorties">Sorties d'espèces de la caisse (optionnel)</label>
            <input id="sorties" type="number" inputMode="numeric" min="0" value={sorties} disabled={verrouillee} onChange={(e) => setSorties(e.target.value)} placeholder="0" style={S.champ} />
            {r.fournisseursEspeces > 0 && !verrouillee && <div style={{ fontSize: 13, color: C.gris, marginTop: 4 }}>Tu as payé {argent(r.fournisseursEspeces, dev)} en espèces à des fournisseurs ce jour. <button onClick={() => setSorties(String(r.fournisseursEspeces))} style={{ background: "none", border: "none", color: C.vert, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13 }}>Utiliser ce montant</button></div>}
            <div style={{ ...S.ligne, marginTop: 10 }}><span>Espèces attendues en caisse</span><b data-testid="attendues">{argent(attendues, dev)}</b></div>
            <div style={{ fontSize: 12.5, color: C.gris2 }}>= fond de caisse + espèces encaissées − sorties</div>
            <label style={S.label} htmlFor="comptees">Espèces réellement comptées ({dev})</label>
            <input id="comptees" type="number" inputMode="numeric" min="0" value={comptees} disabled={verrouillee} onChange={(e) => setComptees(e.target.value)} style={{ ...S.champ, fontWeight: 700, fontSize: 18 }} />
            {ecart !== null && <div data-testid="ecart" style={{ marginTop: 10, padding: 12, borderRadius: 12, background: Number(ecart) === 0 ? "#EAF3DE" : "#FBEAE6", color: couleurEcart(ecart), fontWeight: 800, fontSize: 17, textAlign: "center" }}>Écart : {ecart > 0 ? "+" : ""}{nombre(ecart)} {dev} · {texteEcart(ecart)}</div>}
            <label style={S.label} htmlFor="note-cloture">Note (optionnel)</label>
            <textarea id="note-cloture" rows={2} value={note} disabled={verrouillee} onChange={(e) => setNote(e.target.value)} placeholder="Ex : billet de 10 000 faux refusé" style={{ ...S.champ, resize: "vertical" }} />
            {message && <Alerte type={message.ok ? "ok" : "erreur"}>{message.t}</Alerte>}
            {!verrouillee && <button onClick={enregistrer} disabled={enCours} style={{ ...S.bouton, width: "100%", marginTop: 12, opacity: enCours ? 0.6 : 1 }}>{enCours ? "Enregistrement…" : existante ? "Mettre à jour la clôture" : "Enregistrer la clôture"}</button>}
            {existante && peutVerrouiller && <button onClick={basculerVerrou} style={{ ...S.boutonClair, width: "100%", marginTop: 8 }}>{existante.verrouille ? "🔓 Déverrouiller" : "🔒 Verrouiller cette clôture"}</button>}
          </div>
        </>
      )}
      <div style={S.carte}>
        <div style={{ ...S.titre, marginBottom: 6 }}>📅 Historique des clôtures</div>
        {historique.length === 0 && <div style={S.aide}>Aucune clôture enregistrée pour l'instant.</div>}
        {historique.map((h) => (
          <button key={h.id} onClick={() => setDate(h.date)} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 8, background: "none", border: "none", borderTop: `1px solid ${C.bord}`, padding: "10px 0", cursor: "pointer", textAlign: "left", color: C.fonce }} data-testid="hist-cloture">
            <span style={{ fontSize: 14 }}>{new Date(h.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{h.verrouille ? " 🔒" : ""}<br /><span style={{ fontSize: 12.5, color: C.gris2 }}>Comptées {nombre(h.especes_comptees)} / attendues {nombre(h.especes_attendues)}</span></span>
            <b style={{ color: couleurEcart(h.ecart), fontSize: 14, whiteSpace: "nowrap" }}>{Number(h.ecart) > 0 ? "+" : ""}{nombre(h.ecart)} {dev}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

// ================================================================== 4) FOURNISSEURS & ACHATS
function Fournisseurs({ workspace, session, donnees, recharger }) {
  const dev = devise(workspace.currency);
  const [f, setF] = useState(null);
  const [achats, setAchats] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [sel, setSel] = useState(null);
  const [formF, setFormF] = useState(null); // { id?, nom, tel, note }
  const [formA, setFormA] = useState(null);
  const [payer, setPayer] = useState(null); // { fournisseur, achat|null, montant, mode, date }
  const [ouvert, setOuvert] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState(null);
  const [erreurForm, setErreurForm] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        toutLire(() => supabase.from("fournisseurs").select("*").eq("workspace_id", workspace.id).order("nom")),
        toutLire(() => supabase.from("achats_fournisseur").select("*").eq("workspace_id", workspace.id).order("date", { ascending: false })),
        toutLire(() => supabase.from("paiements_fournisseur").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: true })),
      ]);
      setF(a); setAchats(b); setPaiements(c); setErreur(null);
    } catch (e) {
      setErreur(/relation|does not exist|schema cache/i.test(messageErreur(e)) ? "Les tables des fournisseurs n'existent pas encore : exécute le fichier SQL de la caisse dans Supabase." : "Impossible de charger les fournisseurs : " + messageErreur(e));
    }
  }, [workspace.id]);
  useEffect(() => { charger(); }, [charger]);

  const resteAchat = (a) => Math.max(0, Number(a.total || 0) - Number(a.montant_paye || 0));
  const dettesParF = useMemo(() => {
    const m = {};
    achats.forEach((a) => { m[a.fournisseur_id] = (m[a.fournisseur_id] || 0) + resteAchat(a); });
    return m;
  }, [achats]);
  const totalDu = Object.values(dettesParF).reduce((s, x) => s + x, 0);
  const par = session && session.user ? session.user.id : null;

  async function sauverFournisseur() {
    setErreurForm(null);
    if (!formF.nom.trim()) { setErreurForm("Le nom du fournisseur est obligatoire."); return; }
    setEnCours(true);
    const corps = { nom: formF.nom.trim(), telephone: formF.tel.trim() || null, note: formF.note.trim() || null };
    const { data, error } = formF.id
      ? await supabase.from("fournisseurs").update(corps).eq("id", formF.id).select().single()
      : await supabase.from("fournisseurs").insert([{ ...corps, workspace_id: workspace.id }]).select().single();
    setEnCours(false);
    if (error) { setErreurForm("Enregistrement impossible : " + messageErreur(error)); return; }
    setFormF(null);
    await charger();
    if (!formF.id && data) setSel(data.id);
  }

  async function payerSurAchats(fournisseurId, achatCible, montant, mode, date) {
    // On relit les achats du fournisseur (un autre téléphone a pu payer entre-temps)
    const { data: frais, error } = await supabase.from("achats_fournisseur").select("*").eq("workspace_id", workspace.id).eq("fournisseur_id", fournisseurId).order("date", { ascending: true });
    if (error) throw error;
    let cibles = (frais || []).filter((a) => resteAchat(a) > 0);
    if (achatCible) cibles = cibles.filter((a) => a.id === achatCible.id);
    const dispo = cibles.reduce((s, a) => s + resteAchat(a), 0);
    if (montant > dispo) throw new Error(`Tu ne peux pas payer plus que ce que tu dois (${argent(dispo, dev)}).`);
    let restant = montant;
    for (const a of cibles) {
      if (restant <= 0) break;
      const part = Math.min(restant, resteAchat(a));
      const { error: e1 } = await supabase.from("paiements_fournisseur").insert([{ workspace_id: workspace.id, achat_id: a.id, fournisseur_id: fournisseurId, montant: part, mode, date, cree_par: par }]);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("achats_fournisseur").update({ montant_paye: Number(a.montant_paye || 0) + part }).eq("id", a.id);
      if (e2) throw new Error("Le paiement est noté mais l'achat n'a pas pu être mis à jour : " + messageErreur(e2));
      restant -= part;
    }
  }

  async function confirmerPaiement() {
    setErreurForm(null);
    const montant = Number(payer.montant);
    if (!(montant > 0)) { setErreurForm("Entre un montant supérieur à 0."); return; }
    setEnCours(true);
    try {
      await payerSurAchats(payer.fournisseur.id, payer.achat, montant, payer.mode, payer.date);
      setPayer(null);
      setMsg(`✅ ${argent(montant, dev)} payés à ${payer.fournisseur.nom}.`);
      await charger();
    } catch (e) {
      setErreurForm(messageErreur(e));
    }
    setEnCours(false);
  }

  async function sauverAchat() {
    setErreurForm(null);
    const lignes = formA.lignes
      .map((l) => ({ ...l, quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire) }))
      .filter((l) => l.nom.trim() || l.produit_id);
    if (lignes.length === 0) { setErreurForm("Ajoute au moins un article."); return; }
    for (const l of lignes) {
      if (!l.nom.trim() || !(l.quantite > 0) || !(l.prix_unitaire >= 0) || Number.isNaN(l.prix_unitaire)) { setErreurForm("Chaque article doit avoir un nom, une quantité et un prix."); return; }
    }
    const total = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
    if (!(total > 0)) { setErreurForm("Le total de l'achat doit être supérieur à 0."); return; }
    const paye = Math.max(0, Number(formA.paye) || 0);
    if (paye > total) { setErreurForm("Le montant payé ne peut pas dépasser le total de l'achat."); return; }
    const lignesStock = formA.ajouterStock ? lignes.filter((l) => l.produit_id) : [];
    for (const l of lignesStock) {
      const p = (donnees ? donnees.produits : []).find((x) => x.id === l.produit_id);
      if (p && Array.isArray(p.variantes) && p.variantes.length > 0 && !l.variante) { setErreurForm(`Choisis la variante pour « ${p.nom} » (pour ajouter au bon stock).`); return; }
    }
    setEnCours(true);
    try {
      const nettoyees = lignes.map((l) => ({ produit_id: l.produit_id || null, nom: l.nom.trim(), quantite: l.quantite, prix_unitaire: l.prix_unitaire, ...(l.variante ? { variante: l.variante } : {}) }));
      const { data: achat, error } = await supabase.from("achats_fournisseur").insert([{ workspace_id: workspace.id, fournisseur_id: sel, date: formA.date, lignes: nettoyees, total, montant_paye: paye, note: formA.note.trim() || null, stock_ajoute: false, cree_par: par }]).select().single();
      if (error || !achat) throw error || new Error("Achat non enregistré");
      const avert = [];
      if (paye > 0) {
        const { error: e1 } = await supabase.from("paiements_fournisseur").insert([{ workspace_id: workspace.id, achat_id: achat.id, fournisseur_id: sel, montant: paye, mode: formA.mode, date: formA.date, cree_par: par }]);
        if (e1) avert.push("Le paiement n'a pas pu être détaillé : " + messageErreur(e1));
      }
      if (lignesStock.length > 0) {
        const fournisseur = (f || []).find((x) => x.id === sel);
        const { error: e2 } = await supabase.from("mouvements_stock").insert(lignesStock.map((l) => ({ workspace_id: workspace.id, produit_id: l.produit_id, variante: l.variante || null, type: "entree", quantite: l.quantite, note: `Achat ${fournisseur ? fournisseur.nom : "fournisseur"} du ${formA.date}`, cree_par: par })));
        if (e2) avert.push("L'achat est enregistré mais le stock n'a pas pu être mis à jour (" + messageErreur(e2) + ").");
        else {
          await supabase.from("achats_fournisseur").update({ stock_ajoute: true }).eq("id", achat.id);
          recharger();
        }
      }
      setFormA(null);
      setMsg(avert.length ? "⚠️ " + avert.join(" ") : `✅ Achat enregistré (${argent(total, dev)})${lignesStock.length ? " et ajouté à ton stock" : ""}.`);
      await charger();
    } catch (e) {
      setErreurForm("Enregistrement impossible : " + messageErreur(e));
    }
    setEnCours(false);
  }

  if (erreur) return <div style={{ padding: 16 }}><Alerte>{erreur}</Alerte><button onClick={charger} style={{ ...S.boutonClair, marginTop: 10 }}>Réessayer</button></div>;
  if (!f) return <div style={{ padding: 16 }} className="aide">Chargement…</div>;

  const fournisseur = sel ? f.find((x) => x.id === sel) : null;

  // ------------------------------------------------ détail d'un fournisseur
  if (fournisseur) {
    const sesAchats = achats.filter((a) => a.fournisseur_id === fournisseur.id);
    const du = dettesParF[fournisseur.id] || 0;
    return (
      <div style={{ padding: "12px 16px 40px", maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => { setSel(null); setMsg(null); setOuvert(null); }} style={{ ...S.boutonPetit, marginBottom: 10 }}>← Tous les fournisseurs</button>
        <div style={S.carte}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{fournisseur.nom}</div>
              {fournisseur.telephone && <div style={{ fontSize: 13.5, color: C.gris }}>📞 {fournisseur.telephone}</div>}
              {fournisseur.note && <div style={{ fontSize: 13, color: C.gris2, marginTop: 2 }}>{fournisseur.note}</div>}
            </div>
            <button onClick={() => { setErreurForm(null); setFormF({ id: fournisseur.id, nom: fournisseur.nom, tel: fournisseur.telephone || "", note: fournisseur.note || "" }); }} style={S.boutonPetit}>Modifier</button>
          </div>
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: du > 0 ? "#FBEAE6" : "#EAF3DE", color: du > 0 ? C.rougeF : "#2E6B10", fontWeight: 800, fontSize: 18 }} data-testid="du-fournisseur">
            {du > 0 ? `Je dois ${argent(du, dev)} à ${fournisseur.nom}` : "Je ne dois rien à ce fournisseur"}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => { setErreurForm(null); setMsg(null); setFormA({ date: jourLocalISO(), lignes: [{ produit_id: "", nom: "", quantite: "1", prix_unitaire: "", variante: "" }], paye: "", mode: "cash", note: "", ajouterStock: false }); }} style={S.bouton}>＋ Nouvel achat</button>
            {du > 0 && <button onClick={() => { setErreurForm(null); setMsg(null); setPayer({ fournisseur, achat: null, montant: String(du), mode: "cash", date: jourLocalISO() }); }} style={S.boutonClair}>💸 Payer une partie</button>}
          </div>
        </div>
        {msg && <Alerte type={msg.startsWith("⚠️") ? "info" : "ok"} style={{ marginTop: 0, marginBottom: 12 }}>{msg}</Alerte>}
        {sesAchats.length === 0 && <div style={S.carte}><div style={S.aide}>Aucun achat enregistré pour ce fournisseur.</div></div>}
        {sesAchats.map((a) => {
          const reste = resteAchat(a);
          const pai = paiements.filter((p) => p.achat_id === a.id);
          const lignes = Array.isArray(a.lignes) ? a.lignes : [];
          return (
            <div key={a.id} style={S.carte} data-testid="achat">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Achat du {dateCourte(a.date + "T12:00:00")}</div>
                  <div style={{ fontSize: 13, color: C.gris2 }}>{lignes.map((l) => `${l.quantite} × ${l.nom}`).join(", ")}</div>
                </div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontWeight: 800 }}>{argent(a.total, dev)}</div>
                  <div style={{ fontSize: 12.5, color: reste > 0 ? C.rougeF : "#2E6B10", fontWeight: 700 }}>{reste > 0 ? `reste ${argent(reste, dev)}` : "payé"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {reste > 0 && <button onClick={() => { setErreurForm(null); setMsg(null); setPayer({ fournisseur, achat: a, montant: String(reste), mode: "cash", date: jourLocalISO() }); }} style={{ ...S.boutonPetit, background: C.vert, color: "white", border: "none" }}>Payer cet achat</button>}
                <button onClick={() => setOuvert(ouvert === a.id ? null : a.id)} style={S.boutonPetit}>{ouvert === a.id ? "Masquer" : "Détail & paiements"}</button>
              </div>
              {ouvert === a.id && (
                <div style={{ marginTop: 8 }}>
                  {lignes.map((l, i) => <div key={i} style={S.ligne}><span>{l.quantite} × {l.nom}{l.variante ? ` — ${l.variante}` : ""} <span style={{ color: C.gris2 }}>({nombre(l.prix_unitaire)} chacun)</span></span><b>{nombre(l.quantite * l.prix_unitaire)}</b></div>)}
                  {a.stock_ajoute && <div style={{ fontSize: 12.5, color: "#2E6B10", marginTop: 4 }}>📦 Ajouté à ton stock</div>}
                  {a.note && <div style={{ fontSize: 13, color: C.gris, marginTop: 4 }}>Note : {a.note}</div>}
                  <div style={{ fontSize: 12.5, color: C.gris2, textTransform: "uppercase", margin: "10px 0 4px" }}>Paiements</div>
                  {pai.length === 0 && <div style={S.aide}>Aucun paiement enregistré.</div>}
                  {pai.map((p) => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", background: "#EAF3DE", borderRadius: 8, padding: "7px 10px", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#3B6D11", fontWeight: 700 }}>{argent(p.montant, dev)} — {labelMode(p.mode)}</span><span style={{ color: C.gris2 }}>{dateCourte(p.date + "T12:00:00")}</span></div>)}
                </div>
              )}
            </div>
          );
        })}
        {renderFeuilles()}
      </div>
    );
  }

  // ------------------------------------------------ liste des fournisseurs
  function renderFeuilles() {
    return (
      <>
        {formF && (
          <Feuille titre={formF.id ? "Modifier le fournisseur" : "Nouveau fournisseur"} onClose={() => setFormF(null)}>
            <input aria-label="Nom du fournisseur" placeholder="Nom du fournisseur" value={formF.nom} onChange={(e) => setFormF({ ...formF, nom: e.target.value })} style={S.champ} />
            <input aria-label="Téléphone du fournisseur" type="tel" inputMode="tel" placeholder="Téléphone (optionnel)" value={formF.tel} onChange={(e) => setFormF({ ...formF, tel: e.target.value })} style={{ ...S.champ, marginTop: 8 }} />
            <textarea aria-label="Note" rows={2} placeholder="Note (optionnel)" value={formF.note} onChange={(e) => setFormF({ ...formF, note: e.target.value })} style={{ ...S.champ, marginTop: 8, resize: "vertical" }} />
            {erreurForm && <Alerte>{erreurForm}</Alerte>}
            <button onClick={sauverFournisseur} disabled={enCours} style={{ ...S.bouton, width: "100%", marginTop: 12, opacity: enCours ? 0.6 : 1 }}>{enCours ? "Enregistrement…" : "Enregistrer"}</button>
          </Feuille>
        )}
        {payer && (() => {
          const max = payer.achat ? resteAchat(payer.achat) : dettesParF[payer.fournisseur.id] || 0;
          const m = Number(payer.montant) || 0;
          return (
            <Feuille titre={payer.achat ? "Payer cet achat" : `Payer ${payer.fournisseur.nom}`} onClose={() => setPayer(null)}>
              <div style={S.aide}>{payer.achat ? `Reste à payer sur cet achat : ${argent(max, dev)}` : `Tu dois ${argent(max, dev)} au total. Le paiement est réparti sur les achats les plus anciens d'abord.`}</div>
              <label style={S.label} htmlFor="montant-fourn">Montant payé ({dev})</label>
              <input id="montant-fourn" type="number" inputMode="numeric" min="0" value={payer.montant} onChange={(e) => setPayer({ ...payer, montant: e.target.value })} style={{ ...S.champ, fontWeight: 700, fontSize: 18 }} />
              <label style={S.label}>Mode de paiement</label>
              <ChoixMode valeur={payer.mode} onChange={(k) => setPayer({ ...payer, mode: k })} />
              <label style={S.label} htmlFor="date-fourn">Date</label>
              <input id="date-fourn" type="date" value={payer.date} max={jourLocalISO()} onChange={(e) => setPayer({ ...payer, date: e.target.value || payer.date })} style={S.champ} />
              {m > max && <Alerte>Tu ne peux pas payer plus que ce que tu dois ({argent(max, dev)}).</Alerte>}
              {m > 0 && m < max && <Alerte type="info">Il te restera {argent(max - m, dev)} à payer après ce paiement.</Alerte>}
              {erreurForm && <Alerte>{erreurForm}</Alerte>}
              <button onClick={confirmerPaiement} disabled={enCours || !(m > 0) || m > max} style={{ ...S.bouton, width: "100%", marginTop: 14, opacity: enCours || !(m > 0) || m > max ? 0.5 : 1 }}>{enCours ? "Enregistrement…" : "Confirmer le paiement"}</button>
            </Feuille>
          );
        })()}
        {formA && (() => {
          const produits = donnees ? donnees.produits : [];
          const lignesN = formA.lignes.map((l) => ({ q: Number(l.quantite) || 0, p: Number(l.prix_unitaire) || 0 }));
          const total = lignesN.reduce((s, l) => s + l.q * l.p, 0);
          const majLigne = (i, patch) => setFormA({ ...formA, lignes: formA.lignes.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
          return (
            <Feuille titre="Nouvel achat" onClose={() => setFormA(null)}>
              <label style={{ ...S.label, marginTop: 0 }} htmlFor="date-achat">Date de l'achat</label>
              <input id="date-achat" type="date" value={formA.date} max={jourLocalISO()} onChange={(e) => setFormA({ ...formA, date: e.target.value || formA.date })} style={S.champ} />
              <div style={{ ...S.label, marginTop: 14 }}>Articles achetés</div>
              {formA.lignes.map((l, i) => {
                const p = produits.find((x) => x.id === l.produit_id);
                const variantes = p && Array.isArray(p.variantes) ? p.variantes : [];
                return (
                  <div key={i} style={{ border: `1px solid ${C.bord}`, borderRadius: 10, padding: 10, marginBottom: 8 }} data-testid="ligne-achat">
                    {produits.length > 0 && (
                      <select aria-label={`Produit de la ligne ${i + 1}`} value={l.produit_id} onChange={(e) => { const np = produits.find((x) => x.id === e.target.value); majLigne(i, { produit_id: e.target.value, nom: np ? np.nom : l.nom, variante: "", prix_unitaire: np && Number(np.cout_achat) > 0 ? String(np.cout_achat) : l.prix_unitaire }); }} style={{ ...S.champ, marginBottom: 6 }}>
                        <option value="">Article hors catalogue…</option>
                        {produits.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                      </select>
                    )}
                    {variantes.length > 0 && (
                      <select aria-label={`Variante de la ligne ${i + 1}`} value={l.variante} onChange={(e) => majLigne(i, { variante: e.target.value })} style={{ ...S.champ, marginBottom: 6 }}>
                        <option value="">Choisis la variante…</option>
                        {variantes.map((v) => <option key={v.id || libelleVariante(v)} value={libelleVariante(v)}>{libelleVariante(v)}</option>)}
                      </select>
                    )}
                    <input aria-label={`Nom de l'article ${i + 1}`} placeholder="Nom de l'article" value={l.nom} onChange={(e) => majLigne(i, { nom: e.target.value })} style={S.champ} />
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <input aria-label={`Quantité ${i + 1}`} type="number" inputMode="numeric" min="0" placeholder="Quantité" value={l.quantite} onChange={(e) => majLigne(i, { quantite: e.target.value })} style={{ ...S.champ, width: "40%" }} />
                      <input aria-label={`Prix unitaire ${i + 1}`} type="number" inputMode="numeric" min="0" placeholder={`Prix unitaire (${dev})`} value={l.prix_unitaire} onChange={(e) => majLigne(i, { prix_unitaire: e.target.value })} style={{ ...S.champ, width: "60%" }} />
                    </div>
                    {formA.lignes.length > 1 && <button onClick={() => setFormA({ ...formA, lignes: formA.lignes.filter((_, j) => j !== i) })} style={{ ...S.boutonPetit, marginTop: 6, color: C.rougeF }}>Retirer cette ligne</button>}
                  </div>
                );
              })}
              <button onClick={() => setFormA({ ...formA, lignes: [...formA.lignes, { produit_id: "", nom: "", quantite: "1", prix_unitaire: "", variante: "" }] })} style={S.boutonClair}>＋ Ajouter un article</button>
              <div style={{ ...S.ligne, fontSize: 17, marginTop: 12 }}><span>Total de l'achat</span><b data-testid="total-achat">{argent(total, dev)}</b></div>
              <label style={S.label} htmlFor="paye-achat">Payé maintenant ({dev}) — laisse vide si rien n'est payé</label>
              <input id="paye-achat" type="number" inputMode="numeric" min="0" value={formA.paye} onChange={(e) => setFormA({ ...formA, paye: e.target.value })} style={S.champ} />
              {Number(formA.paye) > 0 && <div style={{ marginTop: 8 }}><ChoixMode valeur={formA.mode} onChange={(k) => setFormA({ ...formA, mode: k })} /></div>}
              {total > 0 && <div style={{ fontSize: 13.5, color: C.rougeF, marginTop: 6, fontWeight: 600 }}>Reste à payer au fournisseur : {argent(Math.max(0, total - (Number(formA.paye) || 0)), dev)}</div>}
              <label style={S.label} htmlFor="note-achat">Note (optionnel)</label>
              <input id="note-achat" value={formA.note} onChange={(e) => setFormA({ ...formA, note: e.target.value })} style={S.champ} />
              <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, fontSize: 14.5, cursor: "pointer" }}>
                <input type="checkbox" checked={formA.ajouterStock} onChange={(e) => setFormA({ ...formA, ajouterStock: e.target.checked })} style={{ width: 22, height: 22 }} />
                <span>Ajouter à mon stock <span style={{ color: C.gris2, fontSize: 13 }}>(pour les articles choisis dans ton catalogue)</span></span>
              </label>
              {erreurForm && <Alerte>{erreurForm}</Alerte>}
              <button onClick={sauverAchat} disabled={enCours} style={{ ...S.bouton, width: "100%", marginTop: 14, opacity: enCours ? 0.6 : 1 }}>{enCours ? "Enregistrement…" : "Enregistrer l'achat"}</button>
            </Feuille>
          );
        })()}
      </>
    );
  }

  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ background: totalDu > 0 ? "#FBEAE6" : "#EAF3DE", border: `1px solid ${totalDu > 0 ? "#F0B8AC" : "#C7DDA3"}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.gris }}>Total que tu dois à tes fournisseurs</div>
        <div style={{ fontWeight: 800, fontSize: 26, color: totalDu > 0 ? C.rougeF : "#2E6B10" }} data-testid="total-du-fournisseurs">{argent(totalDu, dev)}</div>
      </div>
      <button onClick={() => { setErreurForm(null); setFormF({ nom: "", tel: "", note: "" }); }} style={{ ...S.bouton, width: "100%", marginBottom: 12 }}>＋ Nouveau fournisseur</button>
      {msg && <Alerte type={msg.startsWith("⚠️") ? "info" : "ok"} style={{ marginTop: 0, marginBottom: 12 }}>{msg}</Alerte>}
      {f.length === 0 && <div style={S.carte}><div style={S.aide}>Tu n'as pas encore de fournisseur. Ajoute celui à qui tu achètes ta marchandise pour suivre ce que tu lui dois.</div></div>}
      {f.map((x) => (
        <button key={x.id} onClick={() => { setSel(x.id); setMsg(null); }} style={{ ...S.carte, display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer", color: C.fonce }} data-testid="fournisseur">
          <span><span style={{ fontWeight: 700, fontSize: 15.5 }}>{x.nom}</span>{x.telephone && <><br /><span style={{ fontSize: 13, color: C.gris2 }}>{x.telephone}</span></>}</span>
          <span style={{ textAlign: "right", fontWeight: 800, color: (dettesParF[x.id] || 0) > 0 ? C.rougeF : "#2E6B10", fontSize: 14 }}>{(dettesParF[x.id] || 0) > 0 ? `Je dois ${argent(dettesParF[x.id], dev)}` : "Rien à payer"}</span>
        </button>
      ))}
      {renderFeuilles()}
    </div>
  );
}

// ================================================================== MODALE
export default function CaisseModal({ workspace, session, onClose, onChange, quotaAtteint }) {
  const role = workspace.role;
  const peutGerer = role === "owner" || role === "admin";
  const peutCompta = peutGerer || role === "comptable";
  const onglets = [
    { key: "vente", label: "🛒 Vente rapide" },
    { key: "dettes", label: "📒 Dettes clients" },
    ...(peutCompta ? [{ key: "cloture", label: "🔒 Clôture" }, { key: "fournisseurs", label: "🚚 Fournisseurs" }] : []),
  ];
  const [onglet, setOnglet] = useState("vente");
  const [donnees, setDonnees] = useState(null);
  const [erreurDonnees, setErreurDonnees] = useState(null);

  const recharger = useCallback(async () => {
    try {
      setDonnees(await chargerDonneesStock(workspace.id));
      setErreurDonnees(null);
    } catch (e) {
      setErreurDonnees("Impossible de charger tes produits : " + messageErreur(e));
    }
  }, [workspace.id]);
  useEffect(() => { recharger(); }, [recharger]);

  function fermer() {
    if (onChange) onChange();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: C.fond, zIndex: 80, display: "flex", flexDirection: "column", fontFamily: "inherit" }} role="dialog" aria-label="Caisse">
      <div style={{ background: C.fonce, color: "white", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>🧾 Caisse <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.7 }}>· {workspace.name}</span></div>
        <button onClick={fermer} aria-label="Fermer la caisse" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", borderRadius: 10, width: 42, height: 42, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "10px 12px", background: "white", borderBottom: `1px solid ${C.bord}`, flexShrink: 0 }} role="tablist">
        {onglets.map((o) => (
          <button key={o.key} role="tab" aria-selected={onglet === o.key} onClick={() => setOnglet(o.key)} style={{ ...puce(onglet === o.key), flexShrink: 0, whiteSpace: "nowrap" }}>{o.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {erreurDonnees && <div style={{ padding: 16 }}><Alerte>{erreurDonnees}</Alerte><button onClick={recharger} style={{ ...S.boutonClair, marginTop: 10 }}>Réessayer</button></div>}
        {onglet === "vente" && !erreurDonnees && <VenteRapide workspace={workspace} session={session} donnees={donnees} recharger={recharger} onChange={onChange} peutForcer={peutGerer} bloque={!!quotaAtteint} />}
        {onglet === "dettes" && <DettesClients workspace={workspace} session={session} onChange={onChange} peutEncaisser={peutGerer} />}
        {onglet === "cloture" && peutCompta && <ClotureCaisse workspace={workspace} session={session} peutVerrouiller={peutGerer} />}
        {onglet === "fournisseurs" && peutCompta && <Fournisseurs workspace={workspace} session={session} donnees={donnees} recharger={recharger} />}
      </div>
    </div>
  );
}
