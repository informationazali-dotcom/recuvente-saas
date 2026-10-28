// =====================================================================
// RecuVente — Réseau national : ESPACE ADMINISTRATEUR (tableau de bord central)
// À afficher dans App.jsx pour le propriétaire / l'équipe de la boutique.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fmt, fmtNombre, fmtDate, rpc, erreurTexte, lienWhatsApp, telLien, useStylesReseau, exporterExcel, exporterPDF,
  STATUTS, STATUTS_MISSION, STATUTS_ARTICLE, ETATS, MODES_PAIEMENT,
  Bouton, Champ, Message, Modale, Vide, Pastille, StatutCommande, Barres, Icone,
} from "./ReseauCommun.jsx";
import { FormulaireArticle } from "./ReseauRepresentant.jsx";

const ONGLETS = [
  ["tableau", "Tableau de bord"],
  ["commandes", "Commandes"],
  ["articles", "Articles"],
  ["stocks", "Stocks"],
  ["representants", "Représentants"],
  ["zones", "Zones"],
  ["carte", "Carte"],
  ["reclamations", "Réclamations"],
  ["finances", "Finances"],
  ["vendeurs", "Vendeurs partenaires"],
  ["parametres", "Paramètres"],
  ["journal", "Journal"],
];

export default function AdminReseau({ supabase, workspaceId, slug, nomBoutique }) {
  const [param, setParam] = useState(undefined);
  const [onglet, setOnglet] = useState("tableau");
  const [notifs, setNotifs] = useState([]);
  const [panneauNotifs, setPanneauNotifs] = useState(false);
  const [erreur, setErreur] = useState("");
  const [compteurs, setCompteurs] = useState({});
  const [base, setBase] = useState({ reps: [], zones: [], categories: [] });
  useStylesReseau(param?.couleur_principale, param?.couleur_or);

  const chargerRef = useCallback(async () => {
    const [p, r, z, c] = await Promise.all([
      supabase.from("rn_parametres").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("rn_representants").select("*").eq("workspace_id", workspaceId).order("nom"),
      supabase.from("rn_zones").select("*").eq("workspace_id", workspaceId).order("nom"),
      supabase.from("rn_categories").select("*").eq("workspace_id", workspaceId).order("ordre"),
    ]);
    if (p.error) { setErreur(erreurTexte(p.error)); setParam(null); return; }
    setParam(p.data);
    setBase({ reps: r.data || [], zones: z.data || [], categories: c.data || [] });
  }, [supabase, workspaceId]);

  const chargerAlertes = useCallback(async () => {
    const [n, pa, att, val, rec, tr, ct] = await Promise.all([
      supabase.from("rn_notifications").select("*").eq("workspace_id", workspaceId).eq("cible", "admin").order("created_at", { ascending: false }).limit(60),
      supabase.from("rn_commandes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("statut", "en_attente_paiement"),
      supabase.from("rn_commandes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("statut", ["en_attente_attribution", "echec_livraison"]),
      supabase.from("rn_articles").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("statut", "en_attente"),
      supabase.from("rn_reclamations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("statut", ["ouverte", "en_cours"]),
      supabase.from("rn_transferts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("statut", "demande"),
      supabase.from("rn_contacts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("statut", "nouveau"),
    ]);
    setNotifs(n.data || []);
    setCompteurs({ commandes: (pa.count || 0) + (att.count || 0), articles: val.count || 0, reclamations: (rec.count || 0) + (ct.count || 0), stocks: tr.count || 0 });
  }, [supabase, workspaceId]);

  useEffect(() => { chargerRef(); }, [chargerRef]);
  useEffect(() => {
    if (!param) return;
    chargerAlertes();
    const canal = supabase
      .channel("rn-admin-" + workspaceId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rn_notifications", filter: `workspace_id=eq.${workspaceId}` }, (p) => {
        if (p.new.cible === "admin") chargerAlertes();
      })
      .subscribe();
    const t = setInterval(chargerAlertes, 60000);
    return () => { supabase.removeChannel(canal); clearInterval(t); };
  }, [supabase, workspaceId, param, chargerAlertes]);

  if (param === undefined) return <div className="rn" style={{ padding: 40 }}><span className="rn-spin" /></div>;
  if (!param) return <Activation supabase={supabase} workspaceId={workspaceId} nomBoutique={nomBoutique} fini={chargerRef} erreur={erreur} />;

  const nonLues = notifs.filter((n) => !n.lu).length;
  const lienBoutique = `${window.location.origin}/?reseau=${encodeURIComponent(slug || "")}`;
  const ctx = { supabase, workspaceId, slug, param, base, rechargerRef: chargerRef, rechargerAlertes: chargerAlertes, aller: setOnglet };
  return (
    <div className="rn rn-app" style={{ minHeight: "auto" }}>
      <div>
        <header className="rn-app-tete">
          <div>
            <h1>{param.nom_plateforme}</h1>
            <p style={{ opacity: 0.8, fontSize: 13 }}>Réseau national de vente</p>
          </div>
          <div className="rn-ligne">
            <a className="rn-btn rn-btn-petit" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }} href={lienBoutique} target="_blank" rel="noreferrer">Voir la boutique</a>
            <button className="rn-icone-btn" style={{ color: "#fff" }} onClick={() => setPanneauNotifs(true)} aria-label={`Alertes (${nonLues})`}>
              {Icone.cloche}{nonLues ? <span className="rn-compteur">{nonLues}</span> : null}
            </button>
          </div>
        </header>
        <nav className="rn-onglets">
          {ONGLETS.filter(([k]) => k !== "vendeurs" || param.vendeurs_actifs).map(([k, l]) => (
            <button key={k} className="rn-onglet" aria-current={onglet === k ? "page" : undefined} onClick={() => setOnglet(k)}>
              {l}{compteurs[k] ? <span className="rn-compteur">{compteurs[k]}</span> : null}
            </button>
          ))}
        </nav>
      </div>
      <main className="rn-zone-travail">
        {onglet === "tableau" ? <TableauDeBord {...ctx} /> : null}
        {onglet === "commandes" ? <Commandes {...ctx} /> : null}
        {onglet === "articles" ? <Articles {...ctx} /> : null}
        {onglet === "stocks" ? <Stocks {...ctx} /> : null}
        {onglet === "representants" ? <Representants {...ctx} /> : null}
        {onglet === "zones" ? <Zones {...ctx} /> : null}
        {onglet === "carte" ? <CarteReseau {...ctx} /> : null}
        {onglet === "reclamations" ? <Reclamations {...ctx} /> : null}
        {onglet === "finances" ? <Finances {...ctx} /> : null}
        {onglet === "vendeurs" ? <Vendeurs {...ctx} /> : null}
        {onglet === "parametres" ? <Parametres {...ctx} /> : null}
        {onglet === "journal" ? <Journal {...ctx} /> : null}
      </main>

      {panneauNotifs ? (
        <div className="rn-panneau-lateral" role="dialog" aria-label="Alertes">
          <div className="rn-modale-tete">
            <h3>Alertes</h3>
            <div className="rn-ligne">
              <Bouton variante="discret" petit onClick={async () => { await supabase.from("rn_notifications").update({ lu: true }).eq("workspace_id", workspaceId).eq("cible", "admin").eq("lu", false); chargerAlertes(); }}>Tout marquer lu</Bouton>
              <button className="rn-x" onClick={() => setPanneauNotifs(false)} aria-label="Fermer">×</button>
            </div>
          </div>
          <div className="rn-panneau-lateral-corps">
            {notifs.length ? notifs.map((n) => (
              <button key={n.id} className="rn-carte" style={{ textAlign: "left", cursor: "pointer", opacity: n.lu ? 0.65 : 1 }}
                onClick={() => { setPanneauNotifs(false); setOnglet(n.commande_id ? "commandes" : n.type === "validation" ? "articles" : ["inventaire", "stock"].includes(n.type) ? "stocks" : n.type === "contact" ? "reclamations" : n.type === "vendeur" ? "vendeurs" : "tableau"); if (n.commande_id) sessionStorage.setItem("rn_ouvrir_commande", n.commande_id); }}>
                <div className="rn-entre"><b>{n.titre}</b><span className="rn-muet rn-petit">{fmtDate(n.created_at)}</span></div>
                {n.message ? <p className="rn-petit" style={{ marginTop: 4 }}>{n.message}</p> : null}
              </button>
            )) : <Vide titre="Aucune alerte" />}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Activation({ supabase, workspaceId, nomBoutique, fini, erreur: e0 }) {
  const [nom, setNom] = useState(nomBoutique || "MISS & MISTER EXCELLENCE CÔTE D'IVOIRE");
  const [erreur, setErreur] = useState(e0);
  const [charge, setCharge] = useState(false);
  const activer = async () => {
    setCharge(true);
    try { await rpc(supabase, "rn_initialiser", { p_ws: workspaceId, p_nom: nom }); fini(); }
    catch (e) { setErreur(erreurTexte(e)); } finally { setCharge(false); }
  };
  return (
    <div className="rn" style={{ padding: 16, minHeight: "auto" }}>
      <div className="rn-carte rn-pile" style={{ maxWidth: 620, margin: "24px auto", gap: 14 }}>
        <h2>Réseau national de vente</h2>
        <p>
          Ce module vend des articles stockés chez des représentants répartis dans le pays. Chaque commande est confiée
          automatiquement au représentant le plus proche du client qui détient l'article.
        </p>
        <p className="rn-muet">L'activation crée les 6 catégories du catalogue et 32 zones de Côte d'Ivoire (régions, villes, communes d'Abidjan). Tout reste modifiable.</p>
        <Champ label="Nom affiché de la plateforme"><input value={nom} onChange={(e) => setNom(e.target.value)} /></Champ>
        <Message ton="danger">{erreur}</Message>
        <Bouton chargement={charge} onClick={activer}>Activer le réseau national</Bouton>
      </div>
    </div>
  );
}

// =================================================================== TABLEAU DE BORD
const PERIODES = { "7": "7 derniers jours", "30": "30 derniers jours", "90": "3 derniers mois", "365": "12 derniers mois", mois: "Ce mois-ci", perso: "Personnalisée" };
function bornes(periode, debut, fin) {
  const maintenant = new Date();
  if (periode === "mois") return [new Date(maintenant.getFullYear(), maintenant.getMonth(), 1), maintenant];
  if (periode === "perso" && debut && fin) return [new Date(debut + "T00:00:00Z"), new Date(fin + "T23:59:59Z")];
  return [new Date(Date.now() - Number(periode || 30) * 86400000), maintenant];
}

function TableauDeBord({ supabase, workspaceId, param, aller }) {
  const [periode, setPeriode] = useState("30");
  const [perso, setPerso] = useState({ debut: "", fin: "" });
  const [s, setS] = useState(null);
  const [erreur, setErreur] = useState("");
  const [grain, setGrain] = useState("jour");
  useEffect(() => {
    const [d, f] = bornes(periode, perso.debut, perso.fin);
    setS(null);
    rpc(supabase, "rn_stats", { p_ws: workspaceId, p_debut: d.toISOString(), p_fin: f.toISOString() }).then(setS).catch((e) => setErreur(erreurTexte(e)));
  }, [supabase, workspaceId, periode, perso.debut, perso.fin]);

  const exportPDF = () => {
    const [d, f] = bornes(periode, perso.debut, perso.fin);
    const t = (rows, cols) => `<table><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}</tr>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c[2] || ""}">${c[1](r) ?? ""}</td>`).join("")}</tr>`).join("")}</table>`;
    exporterPDF(`Rapport ${param.nom_plateforme}`, `<h1>${param.nom_plateforme}</h1><p class="meta">Rapport du ${fmtDate(d, false)} au ${fmtDate(f, false)}</p>
      <h2>Synthèse</h2>${t([
        ["Commandes reçues", s.commandes.total], ["Livrées", s.commandes.livrees], ["Annulées", s.commandes.annulees], ["En retard", s.commandes.en_retard],
        ["Chiffre d'affaires", fmt(s.finances.chiffre_affaires)], ["dont frais de livraison", fmt(s.finances.frais_livraison)],
        ["Encaissé par les représentants", fmt(s.finances.encaisse_representants)], ["À reverser", fmt(s.finances.a_reverser)],
        ["Commissions", fmt(s.finances.commissions)], ["Réductions accordées", fmt(s.finances.reductions)], ["Écart de caisse", fmt(s.finances.ecart_total)], ["Taux de réussite des livraisons", s.livraisons.taux_reussite != null ? s.livraisons.taux_reussite + " %" : "—"],
        ["Délai moyen de livraison", s.livraisons.delai_moyen_h != null ? s.livraisons.delai_moyen_h + " h" : "—"],
        ["Valeur du stock", fmt(s.stocks.valeur)]], [["Indicateur", (r) => r[0]], ["Valeur", (r) => r[1], "n"]])}
      <h2>Ventes par catégorie</h2>${t(s.par_categorie, [["Catégorie", (r) => r.categorie], ["Pièces", (r) => r.nb, "n"], ["Ventes", (r) => fmt(r.ca), "n"]])}
      <h2>Ventes par région</h2>${t(s.par_region, [["Région", (r) => r.region], ["Commandes", (r) => r.nb, "n"], ["CA", (r) => fmt(r.ca), "n"]])}
      <h2>Représentants</h2>${t(s.par_representant, [["Représentant", (r) => r.nom], ["Zone", (r) => r.zone], ["Livrées", (r) => r.livrees, "n"], ["Refus", (r) => r.refusees, "n"], ["Ventes", (r) => fmt(r.ventes), "n"], ["Commissions", (r) => fmt(r.commissions), "n"], ["À reverser", (r) => fmt(r.a_reverser), "n"], ["Stock", (r) => r.stock, "n"]])}
      <h2>Articles les plus vendus</h2>${t(s.top_articles, [["Article", (r) => r.titre], ["Pièces", (r) => r.nb, "n"], ["Ventes", (r) => fmt(r.ca), "n"]])}
      <h2>Chiffre d'affaires par mois</h2>${t(s.par_mois, [["Mois", (r) => new Date(r.periode).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })], ["Commandes", (r) => r.nb, "n"], ["CA livré", (r) => fmt(r.ca), "n"]])}
      <h2>Écarts de caisse</h2>${s.ecarts_caisse.length ? t(s.ecarts_caisse, [["Commande", (r) => r.numero], ["Représentant", (r) => r.representant], ["Dû", (r) => fmt(r.du), "n"], ["Encaissé", (r) => fmt(r.encaisse), "n"], ["Écart", (r) => fmt(r.ecart), "n"]]) : "<p>Aucun écart.</p>"}
      <h2>Zones non couvertes</h2>${t(s.zones_non_couvertes, [["Zone", (r) => r.nom], ["Commandes reçues", (r) => r.commandes, "n"]])}`);
  };
  const exportXLS = () =>
    exporterExcel("representants-" + new Date().toISOString().slice(0, 10), [
      { label: "Représentant", val: (r) => r.nom }, { label: "Zone", val: (r) => r.zone }, { label: "Livrées", val: (r) => r.livrees },
      { label: "Refus", val: (r) => r.refusees }, { label: "Échecs", val: (r) => r.echecs }, { label: "Ventes (FCFA)", val: (r) => r.ventes },
      { label: "Commissions (FCFA)", val: (r) => r.commissions }, { label: "À reverser (FCFA)", val: (r) => r.a_reverser },
      { label: "Pièces en stock", val: (r) => r.stock }, { label: "Valeur stock (FCFA)", val: (r) => r.stock_valeur },
    ], s.par_representant);

  return (
    <>
      <div className="rn-section-titre">
        <h2>Tableau de bord</h2>
        <div className="rn-ligne">
          <select value={periode} onChange={(e) => setPeriode(e.target.value)} style={{ width: "auto" }} aria-label="Période">
            {Object.entries(PERIODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {periode === "perso" ? (
            <>
              <input type="date" value={perso.debut} onChange={(e) => setPerso({ ...perso, debut: e.target.value })} style={{ width: "auto" }} aria-label="Du" />
              <input type="date" value={perso.fin} onChange={(e) => setPerso({ ...perso, fin: e.target.value })} style={{ width: "auto" }} aria-label="Au" />
            </>
          ) : null}
          {s ? <><Bouton variante="discret" petit onClick={exportXLS}>Excel</Bouton><Bouton variante="discret" petit onClick={exportPDF}>PDF</Bouton></> : null}
        </div>
      </div>
      <Message ton="danger">{erreur}</Message>
      {!s ? <span className="rn-spin" /> : (
        <>
          {(s.commandes.paiements_a_verifier || s.commandes.sans_representant || s.stocks.a_valider || s.stocks.ecarts_inventaire || s.commandes.echecs || s.transferts_demandes || s.contacts_nouveaux || s.stocks_faibles.length) ? (
            <div className="rn-kpis">
              {s.commandes.paiements_a_verifier ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("commandes")}><div className="rn-kpi-lab">Paiements à vérifier</div><div className="rn-kpi-val">{s.commandes.paiements_a_verifier}</div></button> : null}
              {s.commandes.sans_representant ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("commandes")}><div className="rn-kpi-lab">Commandes sans livreur</div><div className="rn-kpi-val">{s.commandes.sans_representant}</div></button> : null}
              {s.commandes.echecs ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("commandes")}><div className="rn-kpi-lab">Échecs de livraison</div><div className="rn-kpi-val">{s.commandes.echecs}</div></button> : null}
              {s.stocks.a_valider ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("articles")}><div className="rn-kpi-lab">Articles à valider</div><div className="rn-kpi-val">{s.stocks.a_valider}</div></button> : null}
              {s.transferts_demandes ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("stocks")}><div className="rn-kpi-lab">Demandes de transfert</div><div className="rn-kpi-val">{s.transferts_demandes}</div></button> : null}
              {s.contacts_nouveaux ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("reclamations")}><div className="rn-kpi-lab">Messages clients</div><div className="rn-kpi-val">{s.contacts_nouveaux}</div></button> : null}
              {s.stocks_faibles.length ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("stocks")}><div className="rn-kpi-lab">Représentants à stock faible</div><div className="rn-kpi-val">{s.stocks_faibles.length}</div></button> : null}
              {s.stocks.ecarts_inventaire ? <button className="rn-kpi rn-kpi-alerte" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => aller("stocks")}><div className="rn-kpi-lab">Écarts d'inventaire</div><div className="rn-kpi-val">{s.stocks.ecarts_inventaire}</div></button> : null}
            </div>
          ) : null}
          <div className="rn-kpis">
            {[
              ["Chiffre d'affaires (livré)", fmt(s.finances.chiffre_affaires)],
              ["Commandes reçues", s.commandes.total],
              ["Livrées", s.commandes.livrees],
              ["En cours", s.commandes.en_cours],
              ["En retard", s.commandes.en_retard],
              ["Annulées", s.commandes.annulees],
              ["Panier moyen", fmt(s.finances.panier_moyen)],
              ["Frais de livraison encaissés", fmt(s.finances.frais_livraison)],
              ["À reverser par les représentants", fmt(s.finances.a_reverser)],
              ["Paiements en attente", fmt(s.finances.paiements_en_attente)],
              ["Commissions", fmt(s.finances.commissions)],
              ["Réductions accordées", fmt(s.finances.reductions)],
              ["Écart de caisse", fmt(s.finances.ecart_total)],
              ["Taux de réussite des livraisons", s.livraisons.taux_reussite != null ? s.livraisons.taux_reussite + " %" : "—"],
              ["Taux d'acceptation des missions", s.livraisons.taux_acceptation != null ? s.livraisons.taux_acceptation + " %" : "—"],
              ["Délai moyen de livraison", s.livraisons.delai_moyen_h != null ? s.livraisons.delai_moyen_h + " h" : "—"],
              ["Pièces en stock", fmtNombre(s.stocks.quantite)],
              ["Valeur du stock", fmt(s.stocks.valeur)],
            ].map(([l, v]) => <div className="rn-kpi" key={l}><div className="rn-kpi-lab">{l}</div><div className="rn-kpi-val">{v}</div></div>)}
          </div>
          <div className="rn-grille-2">
            <div className="rn-carte rn-pile">
              <div className="rn-entre">
                <h3>Chiffre d'affaires</h3>
                <div className="rn-segment" role="group" aria-label="Regrouper par">
                  {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]].map(([k, l]) => <button key={k} type="button" aria-pressed={grain === k} onClick={() => setGrain(k)}>{l}</button>)}
                </div>
              </div>
              {(() => {
                const serie = grain === "jour" ? s.par_jour.map((d) => ({ periode: d.jour, ca: d.ca, nb: d.nb })) : grain === "semaine" ? s.par_semaine : grain === "mois" ? s.par_mois : s.par_annee;
                const lab = (d) => { const x = new Date(d.periode); return grain === "annee" ? String(x.getFullYear()) : grain === "mois" ? x.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : (grain === "semaine" ? "Sem. " : "") + x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); };
                return serie.length ? <Barres donnees={serie.slice(-31)} label={lab} valeur={(d) => Number(d.ca) || 0} format={fmt} /> : <p className="rn-muet">Aucune commande sur la période.</p>;
              })()}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Ventes par catégorie</h3>
              {s.par_categorie.length ? <Barres donnees={s.par_categorie} label={(d) => d.categorie} valeur={(d) => d.ca} format={fmt} /> : <p className="rn-muet">Pas encore de vente livrée.</p>}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Ventes par région</h3>
              {s.par_region.length ? <Barres donnees={s.par_region} label={(d) => d.region} valeur={(d) => d.ca} format={fmt} /> : <p className="rn-muet">Pas encore de vente livrée.</p>}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Articles les plus vendus</h3>
              {s.top_articles.length ? <Barres donnees={s.top_articles} label={(d) => d.titre} valeur={(d) => d.nb} /> : <p className="rn-muet">Pas encore de vente livrée.</p>}
            </div>
          </div>
          <div className="rn-carte rn-pile">
            <h3>Performance des représentants</h3>
            {s.par_representant.length ? (
              <div className="rn-table-boite">
                <table className="rn-table">
                  <thead><tr><th>Représentant</th><th>Zone</th><th className="rn-num">Livrées</th><th className="rn-num">Refus</th><th className="rn-num">Échecs</th><th className="rn-num">Ventes</th><th className="rn-num">Commissions</th><th className="rn-num">À reverser</th><th className="rn-num">Stock</th></tr></thead>
                  <tbody>{s.par_representant.map((r) => (
                    <tr key={r.id}><td>{r.nom}</td><td>{r.zone}</td><td className="rn-num">{r.livrees}</td><td className="rn-num">{r.refusees}</td><td className="rn-num">{r.echecs}</td>
                      <td className="rn-num">{fmt(r.ventes)}</td><td className="rn-num">{fmt(r.commissions)}</td><td className="rn-num">{fmt(r.a_reverser)}</td><td className="rn-num">{r.stock}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <Vide titre="Aucun représentant" action={<Bouton onClick={() => aller("representants")}>Ajouter un représentant</Bouton>} />}
          </div>
          <div className="rn-grille-2">
            <div className="rn-carte rn-pile">
              <h3>Zones non couvertes ({s.zones_non_couvertes.length})</h3>
              <p className="rn-muet rn-petit">Aucun représentant actif n'y livre : les commandes partent en envoi interurbain.</p>
              {s.zones_non_couvertes.slice(0, 15).map((z) => (
                <div key={z.id} className="rn-entre rn-petit"><span>{z.nom}</span>{z.commandes ? <Pastille ton="alerte">{z.commandes} commande(s)</Pastille> : null}</div>
              ))}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Écarts de caisse ({s.ecarts_caisse.length})</h3>
              <p className="rn-muet rn-petit">Montant encaissé par le livreur différent du montant dû.</p>
              {s.ecarts_caisse.length ? s.ecarts_caisse.slice(0, 12).map((e, i) => (
                <div key={i} className="rn-entre rn-petit"><span>{e.numero}, {e.representant}</span><span>dû {fmt(e.du)}, encaissé {fmt(e.encaisse)} <b style={{ color: e.ecart < 0 ? "var(--rn-rouge)" : "var(--rn-vert)" }}>{e.ecart > 0 ? "+" : ""}{fmt(e.ecart)}</b></span></div>
              )) : <p className="rn-muet">Aucun écart sur la période.</p>}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Stocks faibles</h3>
              <p className="rn-muet rn-petit">Représentants actifs sous le seuil de {param.seuil_stock_faible ?? 3} pièce(s) libre(s).</p>
              {s.stocks_faibles.length ? s.stocks_faibles.map((r) => (
                <div key={r.id} className="rn-entre rn-petit"><span>{r.nom}</span><Pastille ton={r.libre ? "alerte" : "danger"}>{r.libre} pièce(s)</Pastille></div>
              )) : <p className="rn-muet">Tous les représentants sont approvisionnés.</p>}
            </div>
            <div className="rn-carte rn-pile">
              <h3>Invendus depuis plus de 60 jours</h3>
              {s.invendus.length ? s.invendus.map((a) => (
                <div key={a.id} className="rn-entre rn-petit"><span>{a.titre} <span className="rn-muet">({a.reference})</span></span><span>{a.jours} j, {fmt(a.prix)}</span></div>
              )) : <p className="rn-muet">Aucun article qui stagne.</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =================================================================== COMMANDES
function Commandes({ supabase, workspaceId, base, rechargerAlertes }) {
  const [liste, setListe] = useState(null);
  const [filtre, setFiltre] = useState({ statut: "a_traiter", q: "" });
  const [ouverte, setOuverte] = useState(() => sessionStorage.getItem("rn_ouvrir_commande"));
  const charger = useCallback(async () => {
    let req = supabase.from("rn_commandes").select("*, zone:rn_zones(nom)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(300);
    if (filtre.statut === "a_traiter") req = req.in("statut", ["en_attente_paiement", "en_attente_attribution", "echec_livraison", "retour_demande"]);
    else if (filtre.statut === "en_cours") req = req.in("statut", ["confirmee", "representant_notifie", "livraison_acceptee", "en_preparation", "en_cours_livraison"]);
    else if (filtre.statut) req = req.eq("statut", filtre.statut);
    const { data } = await req;
    setListe(data || []);
  }, [supabase, workspaceId, filtre.statut]);
  useEffect(() => { charger(); sessionStorage.removeItem("rn_ouvrir_commande"); }, [charger]);
  const q = filtre.q.trim().toLowerCase();
  const visibles = (liste || []).filter((c) => !q || [c.numero, c.client_nom, c.client_tel].some((v) => String(v || "").toLowerCase().includes(q)));
  const exporter = () => exporterExcel("commandes-" + new Date().toISOString().slice(0, 10), [
    { label: "Numéro", val: (c) => c.numero }, { label: "Date", val: (c) => fmtDate(c.created_at) }, { label: "Client", val: (c) => c.client_nom },
    { label: "Téléphone", val: (c) => c.client_tel }, { label: "Zone", val: (c) => c.zone?.nom }, { label: "Statut", val: (c) => STATUTS[c.statut]?.label },
    { label: "Paiement", val: (c) => MODES_PAIEMENT[c.mode_paiement]?.court }, { label: "Articles (FCFA)", val: (c) => c.sous_total },
    { label: "Livraison (FCFA)", val: (c) => c.frais_livraison }, { label: "Réduction (FCFA)", val: (c) => c.reduction }, { label: "Total (FCFA)", val: (c) => c.total },
    { label: "Encaissé livreur (FCFA)", val: (c) => c.montant_encaisse }, { label: "Reversé le", val: (c) => fmtDate(c.reverse_at) }, { label: "Commission (FCFA)", val: (c) => c.commission },
  ], visibles);
  return (
    <>
      <div className="rn-section-titre">
        <h2>Commandes</h2>
        <Bouton variante="discret" petit onClick={exporter} disabled={!visibles.length}>Exporter en Excel</Bouton>
      </div>
      <div className="rn-filtres">
        <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} aria-label="Statut">
          <option value="a_traiter">À traiter</option>
          <option value="en_cours">En cours de livraison</option>
          <option value="">Toutes</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="search" placeholder="Numéro, nom ou téléphone" value={filtre.q} onChange={(e) => setFiltre({ ...filtre, q: e.target.value })} aria-label="Rechercher" />
      </div>
      {!liste ? <span className="rn-spin" /> : visibles.length ? (
        <div className="rn-table-boite">
          <table className="rn-table">
            <thead><tr><th>Commande</th><th>Client</th><th>Zone</th><th>Statut</th><th>Paiement</th><th className="rn-num">Total</th></tr></thead>
            <tbody>{visibles.map((c) => (
              <tr key={c.id} className="rn-cliquable" onClick={() => setOuverte(c.id)}>
                <td><b>{c.numero}</b>{c.express ? <> <Pastille ton="danger">Express</Pastille></> : null}<br /><span className="rn-muet rn-petit">{fmtDate(c.created_at)}</span></td>
                <td>{c.client_nom}<br /><span className="rn-muet rn-petit">{c.client_tel}</span></td>
                <td>{c.zone?.nom}{c.type_livraison === "interurbaine" ? <><br /><span className="rn-petit rn-muet">interurbaine</span></> : null}</td>
                <td><StatutCommande statut={c.statut} /></td>
                <td>{MODES_PAIEMENT[c.mode_paiement]?.court}{c.statut_paiement === "verifie" ? <><br /><Pastille ton="ok">Réglé</Pastille></> : null}</td>
                <td className="rn-num">{fmt(c.total)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Vide titre={filtre.statut === "a_traiter" ? "Rien à traiter" : "Aucune commande"}>{filtre.statut === "a_traiter" ? "Les paiements à vérifier, commandes sans livreur et échecs apparaîtront ici." : null}</Vide>}
      {ouverte ? <DetailCommande supabase={supabase} id={ouverte} reps={base.reps} fermer={() => setOuverte(null)} apres={() => { charger(); rechargerAlertes(); }} /> : null}
    </>
  );
}

function DetailCommande({ supabase, id, reps, fermer, apres }) {
  const [d, setD] = useState(null);
  const [modale, setModale] = useState(null);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  const charger = useCallback(async () => {
    const [c, l, m, h, p] = await Promise.all([
      supabase.from("rn_commandes").select("*, zone:rn_zones(nom)").eq("id", id).single(),
      supabase.from("rn_commande_lignes").select("*, article:rn_articles(reference, photos)").eq("commande_id", id).order("groupe"),
      supabase.from("rn_missions").select("*, rep:rn_representants(nom, telephone)").eq("commande_id", id).order("created_at"),
      supabase.from("rn_historique").select("*").eq("commande_id", id).order("created_at"),
      supabase.from("rn_paiements").select("*").eq("commande_id", id).order("created_at"),
    ]);
    setD({ c: c.data, lignes: l.data || [], missions: m.data || [], hist: h.data || [], paiements: p.data || [] });
  }, [supabase, id]);
  useEffect(() => { charger(); }, [charger]);
  const agir = async (nom, args, ok) => {
    setCharge(true); setMsg({});
    try { await rpc(supabase, nom, args); setModale(null); setMsg({ ton: "ok", texte: ok }); charger(); apres(); }
    catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); } finally { setCharge(false); }
  };
  if (!d) return <div className="rn-panneau-lateral"><div style={{ padding: 30 }}><span className="rn-spin" /></div></div>;
  const c = d.c;
  const groupes = [...new Set(d.lignes.map((l) => l.groupe))];
  const clos = ["livree", "annulee", "remboursee"].includes(c.statut);
  return (
    <div className="rn-panneau-lateral" role="dialog" aria-label={`Commande ${c.numero}`}>
      <div className="rn-modale-tete">
        <div><h3>{c.numero}</h3><span className="rn-muet rn-petit">{fmtDate(c.created_at)}</span></div>
        <button className="rn-x" onClick={fermer} aria-label="Fermer">×</button>
      </div>
      <div className="rn-panneau-lateral-corps">
        <div className="rn-entre"><StatutCommande statut={c.statut} /><span>{MODES_PAIEMENT[c.mode_paiement]?.label} : <b>{{ en_attente: "à vérifier", a_la_livraison: "à la livraison", verifie: "réglé", echoue: "échoué", rembourse: "remboursé" }[c.statut_paiement]}</b></span></div>
        <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>

        <div className="rn-ligne">
          {c.statut === "en_attente_paiement" ? <Bouton petit onClick={() => { setF({ provider: c.mode_paiement, reference: c.reference_paiement_client || "", montant: c.total }); setModale("paiement"); }}>Valider le paiement</Bouton> : null}
          {["en_attente_attribution", "echec_livraison"].includes(c.statut) ? <Bouton petit chargement={charge} onClick={() => agir("rn_admin_relancer", { p_cmd: c.id }, "Attribution relancée.")}>Relancer l'attribution</Bouton> : null}
          {!clos && c.statut !== "en_attente_paiement" ? <Bouton variante="contour" petit onClick={() => { setF({ groupe: groupes[0], rep: "" }); setModale("affecter"); }}>Affecter manuellement</Bouton> : null}
          {!clos ? <Bouton variante="discret" petit onClick={() => { setF({ adresse: c.adresse || "", repere: c.repere || "", client_tel: c.client_tel || "", date_livraison_souhaitee: c.date_livraison_souhaitee || "", note_client: c.note_client || "" }); setModale("modifier"); }}>Modifier la livraison</Bouton> : null}
          {!clos ? <Bouton variante="danger" petit onClick={() => { setF({ motif: "" }); setModale("annuler"); }}>Annuler</Bouton> : null}
          {["livree", "retour_demande"].includes(c.statut) || (c.statut === "annulee" && c.statut_paiement === "verifie") ? <Bouton variante="discret" petit onClick={() => { setF({ montant: c.total, reference: "" }); setModale("rembourser"); }}>Rembourser</Bouton> : null}
        </div>
        {c.reference_paiement_client && c.statut === "en_attente_paiement" ? <Message ton="alerte">Le client indique avoir payé, référence {c.reference_paiement_client}. Vérifiez-la sur votre compte marchand avant de valider.</Message> : null}

        <div className="rn-carte rn-pile" style={{ gap: 6 }}>
          <b>{c.client_nom}</b>
          <span><a href={telLien(c.client_tel)}>{c.client_tel}</a> · <a href={lienWhatsApp(c.client_tel, `Bonjour ${c.client_nom}, au sujet de votre commande ${c.numero}.`)} target="_blank" rel="noreferrer">WhatsApp</a></span>
          {c.client_email ? <span>{c.client_email}</span> : null}
          <span>{c.zone?.nom}{c.adresse ? `, ${c.adresse}` : ""}{c.repere ? `. Repère : ${c.repere}` : ""}</span>
          {c.lat ? <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">Position du client sur la carte</a> : null}
          {c.note_client ? <span className="rn-petit">Message : {c.note_client}</span> : null}
          {c.date_livraison_souhaitee ? <span className="rn-petit"><b>Livraison souhaitée le {new Date(c.date_livraison_souhaitee + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b></span> : null}
          {c.livraison_modifiee_at ? <span className="rn-petit rn-muet">Livraison modifiée le {fmtDate(c.livraison_modifiee_at)}</span> : null}
          {c.express ? <Pastille ton="danger">Livraison express</Pastille> : null}
          <span className="rn-petit rn-muet">Code de remise : {c.code_livraison} · Livraison {c.type_livraison} {c.delai_jours ? `(${c.delai_jours} j)` : ""}{c.code_promo ? ` · Code promo ${c.code_promo}` : ""}</span>
        </div>

        {groupes.map((g) => (
          <div className="rn-carte rn-pile" key={g}>
            <b>{groupes.length > 1 ? `Colis ${g}` : "Articles"}</b>
            {d.lignes.filter((l) => l.groupe === g).map((l) => (
              <div className="rn-mini-article" key={l.id}>
                {l.article?.photos?.[0] ? <img src={l.article.photos[0]} alt="" /> : <span />}
                <span>{l.titre}<br /><span className="rn-muet rn-petit">Réf. {l.article?.reference}{l.quantite > 1 ? ` × ${l.quantite}` : ""}{l.reserve ? "" : ", non réservé"}</span></span>
                <span className="rn-num">{fmt(l.prix * l.quantite)}</span>
              </div>
            ))}
            <div className="rn-chronologie">
              {d.missions.filter((m) => m.groupe === g).map((m) => (
                <div key={m.id}><span className="rn-muet">{fmtDate(m.proposee_at)}</span><span>{m.rep?.nom} <Pastille ton={STATUTS_MISSION[m.statut]?.ton}>{STATUTS_MISSION[m.statut]?.label}</Pastille>{m.distance_km != null ? ` ${m.distance_km} km` : ""}{m.motif ? ` · ${m.motif}` : ""}
                  {m.transporteur ? <><br /><span className="rn-petit">Confié à {m.transporteur}{m.numero_colis ? `, colis n° ${m.numero_colis}` : ""}</span></> : null}
                  {m.montant_du != null && m.statut === "terminee" && Number(m.montant_encaisse) !== Number(m.montant_du) && c.mode_paiement === "cod" ? <><br /><span className="rn-petit">Encaissé {fmt(m.montant_encaisse)} pour {fmt(m.montant_du)} dû</span></> : null}
                  {m.preuves?.length ? <span className="rn-preuves" style={{ marginTop: 6 }}>{m.preuves.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title={p.type === "signature" ? "Signature du client" : "Photo de remise"}><img src={p.url} alt={p.type === "signature" ? "Signature" : "Photo de remise"} /></a>)}</span> : null}
                </span></div>
              ))}
            </div>
          </div>
        ))}

        <div className="rn-carte rn-totaux">
          <div><span>Articles</span><span>{fmt(c.sous_total)}</span></div>
          <div><span>Livraison</span><span>{fmt(c.frais_livraison)}</span></div>
          {c.reduction ? <div><span>Réduction</span><span>−{fmt(c.reduction)}</span></div> : null}
          <div className="rn-total"><span>Total</span><span>{fmt(c.total)}</span></div>
          {c.montant_encaisse ? <div className="rn-petit"><span>Encaissé par le livreur</span><span>{fmt(c.montant_encaisse)}{c.reverse_at ? `, reversé le ${fmtDate(c.reverse_at, false)}` : ", à reverser"}</span></div> : null}
          {c.commission ? <div className="rn-petit"><span>Commission représentant</span><span>{fmt(c.commission)}</span></div> : null}
        </div>
        {d.paiements.length ? (
          <div className="rn-carte rn-pile"><b>Paiements enregistrés</b>
            {d.paiements.map((p) => <div key={p.id} className="rn-entre rn-petit"><span>{fmtDate(p.created_at)} · {p.provider} {p.reference ? `(${p.reference.slice(0, 18)})` : ""}</span><span>{fmt(p.montant)}</span></div>)}
          </div>
        ) : null}
        <div className="rn-carte rn-pile"><b>Historique</b>
          <div className="rn-chronologie">
            {d.hist.map((h) => <div key={h.id}><span className="rn-muet">{fmtDate(h.created_at)}</span><span>{STATUTS[h.statut]?.label}{h.note ? ` · ${h.note}` : ""}</span></div>)}
          </div>
        </div>
      </div>

      {modale === "paiement" ? (
        <Modale titre="Valider le paiement" onFermer={() => setModale(null)}>
          <p>Ne validez qu'après avoir vu la transaction sur votre compte {MODES_PAIEMENT[c.mode_paiement]?.label}. Une capture d'écran du client ne suffit pas.</p>
          <Champ label="Opérateur"><select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{Object.entries(MODES_PAIEMENT).filter(([k]) => k !== "cod").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Champ>
          <Champ label="Référence de la transaction"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Champ>
          <Champ label="Montant reçu (FCFA)"><input inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton chargement={charge} onClick={() => agir("rn_admin_valider_paiement", { p_cmd: c.id, p_provider: f.provider, p_reference: f.reference, p_montant: Number(f.montant) }, "Paiement validé, attribution lancée.")}>Valider et lancer la livraison</Bouton>
        </Modale>
      ) : null}
      {modale === "affecter" ? (
        <Modale titre="Affecter à un représentant" onFermer={() => setModale(null)}>
          {groupes.length > 1 ? <Champ label="Colis"><select value={f.groupe} onChange={(e) => setF({ ...f, groupe: Number(e.target.value) })}>{groupes.map((g) => <option key={g} value={g}>Colis {g}</option>)}</select></Champ> : null}
          <Champ label="Représentant" aide="Il doit détenir les articles. Sinon, faites d'abord un transfert dans l'onglet Stocks.">
            <select value={f.rep} onChange={(e) => setF({ ...f, rep: e.target.value })}><option value="">Choisir…</option>{reps.filter((r) => r.statut === "actif").map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select>
          </Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton chargement={charge} disabled={!f.rep} onClick={() => agir("rn_admin_affecter", { p_cmd: c.id, p_groupe: Number(f.groupe), p_rep: f.rep }, "Mission proposée au représentant choisi.")}>Proposer la mission</Bouton>
        </Modale>
      ) : null}
      {modale === "modifier" ? (
        <Modale titre="Modifier la livraison" onFermer={() => setModale(null)}>
          <p className="rn-muet">Le représentant chargé de la livraison est prévenu des changements.</p>
          <Champ label="Adresse"><input value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} /></Champ>
          <Champ label="Point de repère"><input value={f.repere} onChange={(e) => setF({ ...f, repere: e.target.value })} /></Champ>
          <Champ label="Téléphone du client"><input type="tel" value={f.client_tel} onChange={(e) => setF({ ...f, client_tel: e.target.value })} /></Champ>
          <Champ label="Date souhaitée"><input type="date" value={f.date_livraison_souhaitee} onChange={(e) => setF({ ...f, date_livraison_souhaitee: e.target.value })} /></Champ>
          <Champ label="Consignes pour le livreur"><textarea value={f.note_client} onChange={(e) => setF({ ...f, note_client: e.target.value })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton chargement={charge} onClick={() => agir("rn_admin_modifier_livraison", { p_cmd: c.id, p: f }, "Livraison modifiée, représentant prévenu.")}>Enregistrer les changements</Bouton>
        </Modale>
      ) : null}
      {modale === "annuler" ? (
        <Modale titre="Annuler la commande" onFermer={() => setModale(null)}>
          <p>Les articles réservés sont remis en vente et les représentants concernés sont prévenus.</p>
          <Champ label="Motif"><input value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton variante="danger" chargement={charge} onClick={() => agir("rn_admin_annuler", { p_cmd: c.id, p_motif: f.motif || "Annulée par l'administration" }, "Commande annulée.")}>Confirmer l'annulation</Bouton>
        </Modale>
      ) : null}
      {modale === "rembourser" ? (
        <Modale titre="Enregistrer un remboursement" onFermer={() => setModale(null)}>
          <Champ label="Montant remboursé (FCFA)"><input inputMode="numeric" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Champ label="Référence du transfert"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton chargement={charge} disabled={!Number(f.montant)} onClick={() => agir("rn_admin_rembourser", { p_cmd: c.id, p_montant: Number(f.montant), p_reference: f.reference }, "Remboursement enregistré.")}>Enregistrer</Bouton>
        </Modale>
      ) : null}
    </div>
  );
}

// =================================================================== ARTICLES
function Articles({ supabase, workspaceId, base, param, rechargerAlertes }) {
  const [liste, setListe] = useState(null);
  const [filtre, setFiltre] = useState({ statut: "", q: "", cat: "", zone: "" });
  const [edit, setEdit] = useState(null);
  const [vendeurs, setVendeurs] = useState([]);
  // une zone englobe ses villes et communes : on remonte la hiérarchie depuis la zone du représentant
  const dansZone = (repId, zoneId) => {
    let z = base.zones.find((x) => x.id === base.reps.find((r) => r.id === repId)?.zone_id);
    for (let i = 0; z && i < 5; i++) { if (z.id === zoneId) return true; z = base.zones.find((x) => x.id === z.parent_id); }
    return false;
  };
  const [msg, setMsg] = useState({});
  const charger = useCallback(async () => {
    const { data } = await supabase.from("rn_articles").select("*, stocks:rn_stocks(quantite, reservee, representant_id)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1000);
    setListe(data || []);
  }, [supabase, workspaceId]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (param.vendeurs_actifs) supabase.from("rn_vendeurs").select("id, nom, representant_id").eq("workspace_id", workspaceId).then(({ data }) => setVendeurs(data || [])); }, [supabase, workspaceId, param.vendeurs_actifs]);
  const nomRep = (id) => base.reps.find((r) => r.id === id)?.nom || "—";
  const proposePar = (a) => (a.propose_par_type === "representant" ? nomRep(a.propose_par_id) : a.propose_par_type === "vendeur" ? `Vendeur : ${vendeurs.find((v) => v.id === a.vendeur_id)?.nom || "partenaire"}` : "Administration");
  const q = filtre.q.trim().toLowerCase();
  const visibles = (liste || []).filter((a) => (!filtre.statut || a.statut === filtre.statut) && (!filtre.cat || a.categorie === filtre.cat) && (!filtre.zone || (a.stocks || []).some((x) => x.quantite > x.reservee && dansZone(x.representant_id, filtre.zone))) && (!q || [a.titre, a.reference, a.marque].some((v) => String(v || "").toLowerCase().includes(q))));
  const aValider = (liste || []).filter((a) => a.statut === "en_attente").length;

  const enregistrer = async () => {
    setMsg({});
    const v = edit;
    try {
      if (!v.titre || !v.prix) throw new Error("Titre et prix sont obligatoires.");
      if (!v.photos?.length) throw new Error("Ajoutez au moins une photo réelle.");
      if (!v.id && (!v.rep_initial || !Number(v.qte_initiale))) throw new Error("Indiquez le représentant qui détient l'article et la quantité.");
      const donnees = {
        workspace_id: workspaceId, titre: v.titre.trim(), description: v.description || null, categorie: v.categorie || base.categories[0]?.nom || "Vêtements femmes",
        sous_categorie: v.sous_categorie || null, taille: v.taille || null, marque: v.marque || null, couleur: v.couleur || null, etat: v.etat || "bon",
        defauts: v.defauts || null, prix: Number(v.prix), prix_barre: v.prix_barre ? Number(v.prix_barre) : null, photos: v.photos, vendeur_id: v.vendeur_id || null,
        poids_kg: v.poids_kg === "" || v.poids_kg == null ? null : Number(v.poids_kg),
        updated_at: new Date().toISOString(),
      };
      let id = v.id;
      if (id) {
        const { error } = await supabase.from("rn_articles").update(donnees).eq("id", id);
        if (error) throw error;
      } else {
        const reference = v.reference?.trim() || "A" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
        const { data, error } = await supabase.from("rn_articles").insert({ ...donnees, reference, statut: "disponible", propose_par_type: "admin" }).select("id").single();
        if (error) throw error;
        id = data.id;
        if (v.rep_initial && Number(v.qte_initiale) > 0) await rpc(supabase, "rn_stock_mouvement", { p_article: id, p_rep: v.rep_initial, p_type: "entree", p_q: Number(v.qte_initiale), p_note: "Stock initial" });
        await supabase.rpc("rn_admin_valider_article", { p_article: id, p_ok: true });
      }
      setEdit(null); setMsg({ ton: "ok", texte: "Article enregistré." }); charger();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const [publier, setPublier] = useState(null);
  const [histo, setHisto] = useState(null);
  const ouvrirHisto = async (a) => {
    const { data } = await supabase.from("rn_articles_historique").select("*").eq("article_id", a.id).order("created_at", { ascending: false }).limit(100);
    setHisto({ a, lignes: data || [] });
  };
  const valider = async (a, ok) => {
    // article d'un vendeur partenaire pas encore en stock : on choisit le représentant qui le gardera
    if (ok && a.vendeur_id && !(a.stocks || []).some((x) => x.quantite > 0)) {
      const v = vendeurs.find((x) => x.id === a.vendeur_id);
      setPublier({ a, rep: v?.representant_id || "", q: a.quantite_declaree || 1 });
      return;
    }
    const motif = ok ? null : window.prompt("Motif du refus (transmis au proposant) :");
    if (!ok && motif === null) return;
    try { await rpc(supabase, "rn_admin_valider_article", { p_article: a.id, p_ok: ok, p_motif: motif }); charger(); rechargerAlertes(); }
    catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const retirer = async (a) => {
    if (!window.confirm(`Retirer « ${a.titre} » de la vente ?`)) return;
    await supabase.from("rn_articles").update({ statut: a.statut === "retire" ? "disponible" : "retire" }).eq("id", a.id);
    charger();
  };
  const exporter = () => exporterExcel("articles-" + new Date().toISOString().slice(0, 10), [
    { label: "Référence", val: (a) => a.reference }, { label: "Titre", val: (a) => a.titre }, { label: "Catégorie", val: (a) => a.categorie },
    { label: "Taille", val: (a) => a.taille }, { label: "Marque", val: (a) => a.marque }, { label: "État", val: (a) => ETATS[a.etat] },
    { label: "Prix (FCFA)", val: (a) => a.prix }, { label: "Statut", val: (a) => STATUTS_ARTICLE[a.statut]?.label },
    { label: "Stock total", val: (a) => (a.stocks || []).reduce((s, x) => s + x.quantite, 0) },
    { label: "Détenu par", val: (a) => (a.stocks || []).filter((x) => x.quantite > 0).map((x) => `${nomRep(x.representant_id)} (${x.quantite})`).join(", ") },
    { label: "Ajouté le", val: (a) => fmtDate(a.created_at, false) },
  ], visibles);

  return (
    <>
      <div className="rn-section-titre">
        <h2>Articles</h2>
        <div className="rn-ligne">
          <Bouton variante="discret" petit onClick={exporter}>Exporter en Excel</Bouton>
          <Bouton petit onClick={() => setEdit({ etat: "bon", photos: [], qte_initiale: 1, categorie: base.categories[0]?.nom })}>Ajouter un article</Bouton>
        </div>
      </div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      {aValider ? <Message ton="alerte">{aValider} article(s) proposé(s) par les représentants attendent votre validation.</Message> : null}
      <div className="rn-filtres">
        <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} aria-label="Statut">
          <option value="">Tous les statuts</option>{Object.entries(STATUTS_ARTICLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtre.cat} onChange={(e) => setFiltre({ ...filtre, cat: e.target.value })} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>{base.categories.filter((c) => !c.parent_id).map((c) => <option key={c.id}>{c.nom}</option>)}
        </select>
        <select value={filtre.zone} onChange={(e) => setFiltre({ ...filtre, zone: e.target.value })} aria-label="Zone">
          <option value="">Toutes les zones</option>{[...base.zones].sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((z) => <option key={z.id} value={z.id}>Disponible : {z.nom}</option>)}
        </select>
        <input type="search" placeholder="Titre, référence, marque" value={filtre.q} onChange={(e) => setFiltre({ ...filtre, q: e.target.value })} aria-label="Rechercher" />
      </div>
      {!liste ? <span className="rn-spin" /> : visibles.length ? (
        <div className="rn-table-boite">
          <table className="rn-table">
            <thead><tr><th>Article</th><th>Statut</th><th className="rn-num">Prix</th><th>Détenu par</th><th>Proposé par</th><th /></tr></thead>
            <tbody>{visibles.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="rn-mini-article" style={{ gridTemplateColumns: "44px 1fr" }}>
                    {a.photos?.[0] ? <img src={a.photos[0]} alt="" style={{ width: 44, height: 54 }} /> : <span />}
                    <span><b>{a.titre}</b><br /><span className="rn-muet rn-petit">{a.reference}, {a.categorie}{a.taille ? `, ${a.taille}` : ""}</span></span>
                  </div>
                </td>
                <td><Pastille ton={STATUTS_ARTICLE[a.statut]?.ton}>{STATUTS_ARTICLE[a.statut]?.label}</Pastille></td>
                <td className="rn-num">{fmt(a.prix)}</td>
                <td className="rn-petit">{(a.stocks || []).filter((x) => x.quantite > 0).map((x) => `${nomRep(x.representant_id)} (${x.quantite}${x.reservee ? `, ${x.reservee} rés.` : ""})`).join(", ") || "—"}</td>
                <td className="rn-petit">{proposePar(a)}</td>
                <td>
                  <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
                    {a.statut === "en_attente" ? <><Bouton petit variante="vert" onClick={() => valider(a, true)}>Publier</Bouton><Bouton petit variante="danger" onClick={() => valider(a, false)}>Refuser</Bouton></> : null}
                    <Bouton petit variante="discret" onClick={() => setEdit({ ...a })}>Modifier</Bouton>
                    <Bouton petit variante="discret" onClick={() => ouvrirHisto(a)}>Historique</Bouton>
                    {["disponible", "retire"].includes(a.statut) ? <Bouton petit variante="discret" onClick={() => retirer(a)}>{a.statut === "retire" ? "Remettre" : "Retirer"}</Bouton> : null}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Vide titre="Aucun article" action={<Bouton onClick={() => setEdit({ etat: "bon", photos: [], qte_initiale: 1 })}>Ajouter le premier article</Bouton>} />}
      {edit ? (
        <Modale titre={edit.id ? "Modifier l'article" : "Nouvel article"} onFermer={() => setEdit(null)} large>
          <FormulaireArticle supabase={supabase} workspaceId={workspaceId} valeur={edit} categories={base.categories.filter((c) => !c.parent_id).map((c) => c.nom)} onChange={setEdit} />
          {!edit.id ? (
            <div className="rn-grille-2">
              <Champ label="Confié au représentant" aide="Celui qui détient physiquement l'article.">
                <select value={edit.rep_initial || ""} onChange={(e) => setEdit({ ...edit, rep_initial: e.target.value })}><option value="">Choisir…</option>{base.reps.filter((r) => r.statut === "actif").map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select>
              </Champ>
              <Champ label="Quantité"><input inputMode="numeric" value={edit.qte_initiale} onChange={(e) => setEdit({ ...edit, qte_initiale: e.target.value.replace(/\D/g, "") })} /></Champ>
              <Champ label="Référence (facultatif)" aide="Générée automatiquement si vide."><input value={edit.reference || ""} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></Champ>
            </div>
          ) : null}
          {param.vendeurs_actifs ? (
            <Champ label="Vendeur partenaire (facultatif)"><select value={edit.vendeur_id || ""} onChange={(e) => setEdit({ ...edit, vendeur_id: e.target.value })}><option value="">Aucun (stock propre)</option>{vendeurs.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></Champ>
          ) : null}
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton onClick={enregistrer}>Enregistrer</Bouton>
        </Modale>
      ) : null}
      {publier ? (
        <Modale titre={`Publier : ${publier.a.titre}`} onFermer={() => setPublier(null)}>
          <p>Article d'un vendeur partenaire. Choisissez le représentant qui le reçoit et le gardera jusqu'à la vente.</p>
          <Champ label="Représentant gardien">
            <select value={publier.rep} onChange={(e) => setPublier({ ...publier, rep: e.target.value })}><option value="">Choisir…</option>{base.reps.filter((r) => r.statut === "actif").map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select>
          </Champ>
          <Champ label="Nombre de pièces reçues" aide={`Déclaré par le vendeur : ${publier.a.quantite_declaree || 1}`}><input inputMode="numeric" value={publier.q} onChange={(e) => setPublier({ ...publier, q: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton variante="vert" disabled={!publier.rep || !Number(publier.q)} onClick={async () => {
            try { await rpc(supabase, "rn_admin_publier_article", { p_article: publier.a.id, p_ok: true, p_motif: null, p_rep: publier.rep, p_quantite: Number(publier.q) }); setPublier(null); setMsg({ ton: "ok", texte: "Article publié et confié au représentant." }); charger(); rechargerAlertes(); }
            catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
          }}>Publier l'article</Bouton>
        </Modale>
      ) : null}
      {histo ? (
        <Modale titre={`Historique : ${histo.a.titre}`} onFermer={() => setHisto(null)} large>
          {histo.lignes.length ? (
            <div className="rn-table-boite"><table className="rn-table">
              <thead><tr><th>Date</th><th>Modifications</th></tr></thead>
              <tbody>{histo.lignes.map((h) => (
                <tr key={h.id}><td className="rn-petit">{fmtDate(h.created_at)}</td>
                  <td className="rn-petit">{Object.entries(h.changements || {}).map(([k, v]) => <div key={k}><b>{LIBELLES_CHAMPS[k] || k}</b> : {afficherValeur(k, v?.avant)} → {afficherValeur(k, v?.apres)}</div>)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Vide titre="Aucune modification enregistrée">Les changements de prix, de statut, de titre ou de photos s'afficheront ici.</Vide>}
        </Modale>
      ) : null}
    </>
  );
}

const LIBELLES_CHAMPS = { prix: "Prix", prix_barre: "Prix neuf", statut: "Statut", titre: "Titre", etat: "État", categorie: "Catégorie", taille: "Taille", photos: "Photos", description: "Description", defauts: "Défauts", poids_kg: "Poids" };
function afficherValeur(k, v) {
  if (v == null || v === "") return "—";
  if (k === "prix" || k === "prix_barre") return fmt(v);
  if (k === "statut") return STATUTS_ARTICLE[v]?.label || v;
  if (k === "etat") return ETATS[v] || v;
  if (k === "photos") return `${Array.isArray(v) ? v.length : v} photo(s)`;
  return String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 80);
}

// =================================================================== STOCKS
function Stocks({ supabase, workspaceId, base }) {
  const [vue, setVue] = useState("par_rep");
  const [stocks, setStocks] = useState(null);
  const [mouvements, setMouvements] = useState([]);
  const [inventaires, setInventaires] = useState([]);
  const [rep, setRep] = useState("");
  const [modale, setModale] = useState(null);
  const [f, setF] = useState({});
  const [msg, setMsg] = useState({});
  const [demandes, setDemandes] = useState([]);
  const charger = useCallback(async () => {
    supabase.from("rn_transferts").select("*, article:rn_articles(titre, reference)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setDemandes(data || []));
    const [s, m, i] = await Promise.all([
      supabase.from("rn_stocks").select("*, article:rn_articles(id, titre, reference, prix, statut, created_at)").eq("workspace_id", workspaceId).gt("quantite", 0),
      supabase.from("rn_mouvements").select("*, article:rn_articles(titre, reference)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(150),
      supabase.from("rn_inventaires").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
    ]);
    setStocks(s.data || []); setMouvements(m.data || []); setInventaires(i.data || []);
  }, [supabase, workspaceId]);
  useEffect(() => { charger(); }, [charger]);
  const nomRep = (id) => base.reps.find((r) => r.id === id)?.nom || "—";
  const agir = async (nom, args, ok) => {
    try { await rpc(supabase, nom, args); setModale(null); setMsg({ ton: "ok", texte: ok }); charger(); }
    catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const visibles = (stocks || []).filter((s) => !rep || s.representant_id === rep);
  const parRep = base.reps.map((r) => {
    const l = (stocks || []).filter((s) => s.representant_id === r.id);
    return { ...r, pieces: l.reduce((a, s) => a + s.quantite, 0), reservees: l.reduce((a, s) => a + s.reservee, 0), valeur: l.reduce((a, s) => a + s.quantite * (s.article?.prix || 0), 0) };
  });
  const TYPES = { entree: "Entrée", sortie: "Sortie", vente: "Vente", retour: "Retour", transfert_sortie: "Transfert sortant", transfert_entree: "Transfert entrant", ajustement: "Ajustement", reservation: "Réservation", liberation: "Libération" };
  return (
    <>
      <div className="rn-section-titre">
        <h2>Stocks décentralisés</h2>
        <div className="rn-ligne">
          <Bouton variante="discret" petit onClick={() => { setF({ type: "entree", q: 1 }); setModale("mouvement"); }}>Mouvement de stock</Bouton>
          <Bouton petit onClick={() => { setF({ q: 1 }); setModale("transfert"); }}>Transférer un article</Bouton>
        </div>
      </div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-ligne">
        {[["par_rep", "Par représentant"], ["detail", "Détail des articles"], ["demandes", `Demandes de transfert${demandes.filter((d) => d.statut === "demande").length ? ` (${demandes.filter((d) => d.statut === "demande").length})` : ""}`], ["mouvements", "Mouvements"], ["inventaires", `Inventaires${inventaires.filter((i) => i.statut === "soumis").length ? ` (${inventaires.filter((i) => i.statut === "soumis").length})` : ""}`]].map(([k, l]) => (
          <button key={k} className="rn-cat" aria-pressed={vue === k} onClick={() => setVue(k)}>{l}</button>
        ))}
      </div>
      {!stocks ? <span className="rn-spin" /> : null}
      {stocks && vue === "par_rep" ? (
        <div className="rn-table-boite"><table className="rn-table">
          <thead><tr><th>Représentant</th><th>Statut</th><th className="rn-num">Pièces</th><th className="rn-num">Réservées</th><th className="rn-num">Valeur</th><th /></tr></thead>
          <tbody>{parRep.map((r) => (
            <tr key={r.id}><td>{r.nom}</td><td><Pastille ton={r.statut === "actif" ? (r.disponible ? "ok" : "alerte") : "neutre"}>{r.statut !== "actif" ? "Suspendu" : r.disponible ? "Disponible" : "Indisponible"}</Pastille></td>
              <td className="rn-num">{r.pieces}</td><td className="rn-num">{r.reservees}</td><td className="rn-num">{fmt(r.valeur)}</td>
              <td><Bouton petit variante="discret" onClick={() => { setRep(r.id); setVue("detail"); }}>Voir</Bouton></td></tr>
          ))}</tbody>
        </table></div>
      ) : null}
      {stocks && vue === "detail" ? (
        <>
          <div className="rn-filtres"><select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Représentant"><option value="">Tous les représentants</option>{base.reps.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></div>
          <div className="rn-table-boite"><table className="rn-table">
            <thead><tr><th>Article</th><th>Représentant</th><th className="rn-num">Quantité</th><th className="rn-num">Réservée</th><th className="rn-num">Libre</th><th>En stock depuis</th></tr></thead>
            <tbody>{visibles.map((s) => (
              <tr key={s.id}><td>{s.article?.titre}<br /><span className="rn-muet rn-petit">{s.article?.reference}</span></td><td>{nomRep(s.representant_id)}</td>
                <td className="rn-num">{s.quantite}</td><td className="rn-num">{s.reservee}</td><td className="rn-num">{s.quantite - s.reservee}</td>
                <td className="rn-petit">{fmtDate(s.article?.created_at, false)}{Date.now() - new Date(s.article?.created_at) > 60 * 86400000 ? <> <Pastille ton="alerte">+60 j</Pastille></> : null}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      ) : null}
      {vue === "demandes" ? (
        demandes.length ? demandes.map((d) => (
          <div key={d.id} className="rn-carte rn-pile" style={{ gap: 8 }}>
            <div className="rn-entre">
              <span><b>{d.article?.titre}</b> × {d.quantite} <span className="rn-muet rn-petit">({d.article?.reference})</span><br />
                <span className="rn-petit">{nomRep(d.de_representant)} → {d.destination_choisie ? nomRep(d.vers_representant) : <i>destination à choisir</i>}, {fmtDate(d.created_at)}</span></span>
              <Pastille ton={d.statut === "demande" ? "alerte" : d.statut === "valide" ? "ok" : "neutre"}>{{ demande: "À traiter", valide: "Validé", refuse: "Refusé" }[d.statut]}</Pastille>
            </div>
            {d.note ? <p className="rn-petit">{d.note}</p> : null}
            {d.statut === "demande" ? (
              <div className="rn-ligne">
                {!d.destination_choisie ? (
                  <select style={{ width: "auto" }} value={f["vers_" + d.id] || ""} onChange={(e) => setF({ ...f, ["vers_" + d.id]: e.target.value })} aria-label="Représentant destinataire">
                    <option value="">Vers…</option>{base.reps.filter((r) => r.statut === "actif" && r.id !== d.de_representant).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                  </select>
                ) : null}
                <Bouton petit variante="vert" disabled={!d.destination_choisie && !f["vers_" + d.id]} onClick={() => agir("rn_admin_traiter_transfert", { p_transfert: d.id, p_ok: true, p_vers: f["vers_" + d.id] || null, p_note: null }, "Transfert validé, stock déplacé.")}>Valider</Bouton>
                <Bouton petit variante="discret" onClick={() => { const n = window.prompt("Motif du refus (transmis au représentant) :"); if (n !== null) agir("rn_admin_traiter_transfert", { p_transfert: d.id, p_ok: false, p_vers: null, p_note: n }, "Demande refusée."); }}>Refuser</Bouton>
              </div>
            ) : null}
          </div>
        )) : <Vide titre="Aucune demande">Les représentants demandent un transfert depuis leur stock.</Vide>
      ) : null}
      {vue === "mouvements" ? (
        <div className="rn-table-boite"><table className="rn-table">
          <thead><tr><th>Date</th><th>Article</th><th>Représentant</th><th>Type</th><th className="rn-num">Qté</th><th>Note</th></tr></thead>
          <tbody>{mouvements.map((m) => (
            <tr key={m.id}><td className="rn-petit">{fmtDate(m.created_at)}</td><td>{m.article?.titre}<br /><span className="rn-muet rn-petit">{m.article?.reference}</span></td><td>{nomRep(m.representant_id)}</td><td>{TYPES[m.type]}</td><td className="rn-num">{m.quantite}</td><td className="rn-petit">{m.note}</td></tr>
          ))}</tbody>
        </table></div>
      ) : null}
      {vue === "inventaires" ? (
        inventaires.length ? inventaires.map((i) => (
          <div key={i.id} className="rn-carte rn-pile">
            <div className="rn-entre"><b>{nomRep(i.representant_id)}, {fmtDate(i.created_at)}</b><Pastille ton={i.statut === "valide" ? "ok" : i.statut === "rejete" ? "neutre" : i.ecart_total ? "alerte" : "info"}>{i.statut === "soumis" ? (i.ecart_total ? `${i.ecart_total} écart(s)` : "Conforme") : i.statut === "valide" ? "Appliqué" : "Rejeté"}</Pastille></div>
            {i.note ? <p className="rn-petit">{i.note}</p> : null}
            {(i.lignes || []).filter((l) => l.reel !== l.theorique).map((l) => (
              <div key={l.article_id} className="rn-entre rn-petit"><span>{l.titre} ({l.reference})</span><span>enregistré {l.theorique}, compté <b>{l.reel}</b></span></div>
            ))}
            {i.statut === "soumis" ? (
              <div className="rn-ligne">
                <Bouton petit onClick={() => agir("rn_admin_valider_inventaire", { p_inv: i.id, p_appliquer: true }, "Stock aligné sur l'inventaire.")}>Appliquer au stock</Bouton>
                <Bouton petit variante="discret" onClick={() => agir("rn_admin_valider_inventaire", { p_inv: i.id, p_appliquer: false }, "Inventaire rejeté.")}>Rejeter</Bouton>
              </div>
            ) : null}
          </div>
        )) : <Vide titre="Aucun inventaire">Les représentants envoient leurs comptages depuis leur espace.</Vide>
      ) : null}

      {modale === "transfert" ? (
        <Modale titre="Transférer un article" onFermer={() => setModale(null)}>
          <Champ label="Depuis"><select value={f.de || ""} onChange={(e) => setF({ ...f, de: e.target.value, article: "" })}><option value="">Choisir…</option>{base.reps.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></Champ>
          <Champ label="Article"><select value={f.article || ""} onChange={(e) => setF({ ...f, article: e.target.value })} disabled={!f.de}><option value="">Choisir…</option>{(stocks || []).filter((s) => s.representant_id === f.de && s.quantite > s.reservee).map((s) => <option key={s.article_id} value={s.article_id}>{s.article?.titre} ({s.quantite - s.reservee} libre)</option>)}</select></Champ>
          <Champ label="Vers"><select value={f.vers || ""} onChange={(e) => setF({ ...f, vers: e.target.value })}><option value="">Choisir…</option>{base.reps.filter((r) => r.id !== f.de).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></Champ>
          <Champ label="Quantité"><input inputMode="numeric" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Champ label="Note (transporteur, date…)"><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} /></Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton disabled={!f.de || !f.vers || !f.article} onClick={() => agir("rn_admin_transferer", { p_article: f.article, p_de: f.de, p_vers: f.vers, p_q: Number(f.q), p_note: f.note || null }, "Transfert enregistré. Les deux représentants sont prévenus.")}>Transférer</Bouton>
        </Modale>
      ) : null}
      {modale === "mouvement" ? (
        <MouvementAdmin supabase={supabase} workspaceId={workspaceId} reps={base.reps} f={f} setF={setF} msg={msg} fermer={() => setModale(null)}
          valider={() => agir("rn_stock_mouvement", { p_article: f.article, p_rep: f.rep, p_type: f.type, p_q: Number(f.q), p_note: f.note || null }, "Stock mis à jour.")} />
      ) : null}
    </>
  );
}

function MouvementAdmin({ supabase, workspaceId, reps, f, setF, msg, fermer, valider }) {
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => { supabase.from("rn_articles").select("id, titre, reference").eq("workspace_id", workspaceId).neq("statut", "refuse").order("created_at", { ascending: false }).limit(1000).then(({ data }) => setArticles(data || [])); }, [supabase, workspaceId]);
  const filtres = articles.filter((a) => !q || (a.titre + " " + a.reference).toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <Modale titre="Mouvement de stock" onFermer={fermer}>
      <Champ label="Chercher l'article"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre ou référence" /></Champ>
      <Champ label="Article"><select value={f.article || ""} onChange={(e) => setF({ ...f, article: e.target.value })}><option value="">Choisir…</option>{filtres.map((a) => <option key={a.id} value={a.id}>{a.titre} ({a.reference})</option>)}</select></Champ>
      <Champ label="Représentant"><select value={f.rep || ""} onChange={(e) => setF({ ...f, rep: e.target.value })}><option value="">Choisir…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></Champ>
      <Champ label="Type">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="entree">Entrée</option><option value="sortie">Sortie</option><option value="retour">Retour client</option><option value="ajustement">Ajustement (fixer la quantité exacte)</option>
        </select>
      </Champ>
      <Champ label={f.type === "ajustement" ? "Nouvelle quantité" : "Quantité"}><input inputMode="numeric" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value.replace(/\D/g, "") })} /></Champ>
      <Champ label="Motif"><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} /></Champ>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton disabled={!f.article || !f.rep || f.q === ""} onClick={valider}>Enregistrer</Bouton>
    </Modale>
  );
}

// =================================================================== REPRÉSENTANTS
function Representants({ supabase, workspaceId, slug, base, rechargerRef }) {
  const [edit, setEdit] = useState(null);
  const [zonesRep, setZonesRep] = useState([]);
  const [msg, setMsg] = useState({});
  const lienEspace = `${window.location.origin}/?reseau=${encodeURIComponent(slug || "")}&espace=representant`;
  useEffect(() => { supabase.from("rn_representant_zones").select("*").eq("workspace_id", workspaceId).then(({ data }) => setZonesRep(data || [])); }, [supabase, workspaceId, base.reps]);
  const nomZone = (id) => base.zones.find((z) => z.id === id)?.nom || "";
  const zonesTriees = useMemo(() => [...base.zones].sort((a, b) => ({ region: 0, ville: 1, commune: 2 }[a.type] - { region: 0, ville: 1, commune: 2 }[b.type]) || a.nom.localeCompare(b.nom, "fr")), [base.zones]);
  const enregistrer = async () => {
    setMsg({});
    try {
      const v = edit;
      if (!v.nom?.trim() || !v.email?.trim()) throw new Error("Nom et e-mail sont obligatoires (l'e-mail sert à se connecter).");
      const donnees = {
        workspace_id: workspaceId, nom: v.nom.trim(), email: v.email.trim().toLowerCase(), telephone: v.telephone || null, zone_id: v.zone_id || null,
        adresse: v.adresse || null, lat: v.lat === "" || v.lat == null ? null : Number(v.lat), lng: v.lng === "" || v.lng == null ? null : Number(v.lng),
        statut: v.statut || "actif", max_missions: Number(v.max_missions) || 5, taux_commission: v.taux_commission === "" || v.taux_commission == null ? null : Number(v.taux_commission),
      };
      let id = v.id;
      if (id) { const { error } = await supabase.from("rn_representants").update(donnees).eq("id", id); if (error) throw error; }
      else { const { data, error } = await supabase.from("rn_representants").insert(donnees).select("id").single(); if (error) throw error; id = data.id; }
      await supabase.from("rn_representant_zones").delete().eq("representant_id", id);
      if (v.zones?.length) {
        const { error } = await supabase.from("rn_representant_zones").insert(v.zones.map((z) => ({ representant_id: id, zone_id: z, workspace_id: workspaceId })));
        if (error) throw error;
      }
      setEdit(null); setMsg({ ton: "ok", texte: "Représentant enregistré." }); rechargerRef();
    } catch (e) { setMsg({ ton: "danger", texte: /duplicate|unique/i.test(e.message) ? "Un représentant utilise déjà cet e-mail." : erreurTexte(e) }); }
  };
  const invitation = (r) => `Bonjour ${r.nom.split(" ")[0]}, votre espace représentant est prêt.\n\n1. Ouvrez ${lienEspace}\n2. Touchez « Première connexion »\n3. Utilisez l'adresse ${r.email} et choisissez votre mot de passe.\n\nVous y recevrez vos missions de livraison.`;
  return (
    <>
      <div className="rn-section-titre">
        <h2>Représentants</h2>
        <Bouton petit onClick={() => setEdit({ statut: "actif", max_missions: 5, zones: [] })}>Ajouter un représentant</Bouton>
      </div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-carte rn-entre"><span className="rn-petit">Lien de l'espace représentant : <b>{lienEspace}</b></span><Bouton variante="discret" petit onClick={() => navigator.clipboard?.writeText(lienEspace)}>Copier</Bouton></div>
      {base.reps.length ? (
        <div className="rn-table-boite"><table className="rn-table">
          <thead><tr><th>Représentant</th><th>Zone de rattachement</th><th>Zones de livraison</th><th>Statut</th><th>Compte</th><th /></tr></thead>
          <tbody>{base.reps.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nom}</b><br /><span className="rn-muet rn-petit">{r.telephone} {r.email}</span></td>
              <td>{nomZone(r.zone_id)}{r.lat ? <><br /><span className="rn-muet rn-petit">position enregistrée</span></> : null}</td>
              <td className="rn-petit">{zonesRep.filter((z) => z.representant_id === r.id).map((z) => nomZone(z.zone_id)).join(", ") || "—"}</td>
              <td><Pastille ton={r.statut === "actif" ? (r.disponible ? "ok" : "alerte") : "neutre"}>{r.statut !== "actif" ? "Suspendu" : r.disponible ? "Disponible" : "Indisponible"}</Pastille></td>
              <td>{r.user_id ? <Pastille ton="ok">Connecté</Pastille> : <a href={lienWhatsApp(r.telephone, invitation(r))} target="_blank" rel="noreferrer" className="rn-petit">Envoyer l'invitation</a>}</td>
              <td><div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
                <Bouton petit variante="discret" onClick={() => setEdit({ ...r, zones: zonesRep.filter((z) => z.representant_id === r.id).map((z) => z.zone_id) })}>Modifier</Bouton>
                <Bouton petit variante="discret" onClick={async () => { await supabase.from("rn_representants").update({ statut: r.statut === "actif" ? "suspendu" : "actif" }).eq("id", r.id); rechargerRef(); }}>{r.statut === "actif" ? "Suspendre" : "Réactiver"}</Bouton>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Vide titre="Aucun représentant" action={<Bouton onClick={() => setEdit({ statut: "actif", max_missions: 5, zones: [] })}>Ajouter le premier représentant</Bouton>}>Les représentants stockent les articles et livrent les clients de leur zone.</Vide>}
      {edit ? (
        <Modale titre={edit.id ? "Modifier le représentant" : "Nouveau représentant"} onFermer={() => setEdit(null)} large>
          <div className="rn-grille-2">
            <Champ label="Nom complet"><input value={edit.nom || ""} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></Champ>
            <Champ label="Téléphone"><input type="tel" value={edit.telephone || ""} onChange={(e) => setEdit({ ...edit, telephone: e.target.value })} /></Champ>
            <Champ label="E-mail de connexion"><input type="email" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Champ>
            <Champ label="Zone de rattachement" aide="Sert à estimer la distance si la position n'est pas renseignée.">
              <select value={edit.zone_id || ""} onChange={(e) => setEdit({ ...edit, zone_id: e.target.value })}><option value="">Choisir…</option>{zonesTriees.map((z) => <option key={z.id} value={z.id}>{z.type === "commune" ? "— " : ""}{z.nom}</option>)}</select>
            </Champ>
            <Champ label="Adresse du point de stockage"><input value={edit.adresse || ""} onChange={(e) => setEdit({ ...edit, adresse: e.target.value })} /></Champ>
            <Champ label="Coordonnées GPS (facultatif)" aide="Copiez-les depuis Google Maps : appui long sur le lieu.">
              <input placeholder="5.3540, -3.9870" value={edit.lat != null && edit.lat !== "" ? `${edit.lat}, ${edit.lng}` : ""}
                onChange={(e) => { const [a, b] = e.target.value.split(",").map((x) => x.trim()); setEdit({ ...edit, lat: a ?? "", lng: b ?? "" }); }} />
            </Champ>
            <Champ label="Missions simultanées maximum"><input inputMode="numeric" value={edit.max_missions ?? 5} onChange={(e) => setEdit({ ...edit, max_missions: e.target.value.replace(/\D/g, "") })} /></Champ>
            <Champ label="Commission (%)" aide="Laisser vide pour le taux par défaut."><input inputMode="decimal" value={edit.taux_commission ?? ""} onChange={(e) => setEdit({ ...edit, taux_commission: e.target.value })} /></Champ>
          </div>
          <Champ label="Zones où il livre en local" aide="Cocher une région ou une ville inclut toutes ses communes.">
            <div style={{ maxHeight: 220, overflow: "auto", border: "1.5px solid var(--rn-trait)", borderRadius: 12, padding: 10, background: "#fff", display: "grid", gap: 4 }}>
              {zonesTriees.map((z) => (
                <label key={z.id} className="rn-ligne" style={{ gap: 8, paddingLeft: z.type === "commune" ? 18 : z.type === "ville" ? 8 : 0 }}>
                  <input type="checkbox" checked={(edit.zones || []).includes(z.id)} onChange={(e) => setEdit({ ...edit, zones: e.target.checked ? [...(edit.zones || []), z.id] : edit.zones.filter((x) => x !== z.id) })} />
                  <span style={{ fontWeight: z.type === "region" ? 600 : 400 }}>{z.nom}</span>
                </label>
              ))}
            </div>
          </Champ>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton onClick={enregistrer}>Enregistrer</Bouton>
        </Modale>
      ) : null}
    </>
  );
}

// =================================================================== ZONES
function Zones({ supabase, workspaceId, base, rechargerRef }) {
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState({});
  const [couvertes, setCouvertes] = useState(new Set());
  useEffect(() => {
    const [d, f] = bornes("30");
    rpc(supabase, "rn_stats", { p_ws: workspaceId, p_debut: d.toISOString(), p_fin: f.toISOString() })
      .then((s) => setCouvertes(new Set(base.zones.filter((z) => z.type !== "region" && !s.zones_non_couvertes.some((n) => n.id === z.id)).map((z) => z.id))))
      .catch(() => {});
  }, [supabase, workspaceId, base.zones]);
  const enfants = (id) => base.zones.filter((z) => z.parent_id === id).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const regions = base.zones.filter((z) => !z.parent_id).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const enregistrer = async () => {
    try {
      const v = edit;
      if (!v.nom?.trim()) throw new Error("Nom obligatoire.");
      const d = { workspace_id: workspaceId, nom: v.nom.trim(), type: v.type, parent_id: v.parent_id || null,
        lat: v.lat === "" || v.lat == null ? null : Number(v.lat), lng: v.lng === "" || v.lng == null ? null : Number(v.lng),
        frais_livraison: v.frais_livraison === "" || v.frais_livraison == null ? null : Number(v.frais_livraison),
        delai_jours: v.delai_jours === "" || v.delai_jours == null ? null : Number(v.delai_jours), actif: v.actif !== false };
      const { error } = v.id ? await supabase.from("rn_zones").update(d).eq("id", v.id) : await supabase.from("rn_zones").insert(d);
      if (error) throw error;
      setEdit(null); setMsg({ ton: "ok", texte: "Zone enregistrée." }); rechargerRef();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const Ligne = ({ z, niveau }) => (
    <>
      <tr>
        <td style={{ paddingLeft: 12 + niveau * 20 }}>{niveau ? "└ " : ""}<span style={{ fontWeight: z.type === "region" ? 700 : 500 }}>{z.nom}</span>{!z.actif ? <> <Pastille>Inactive</Pastille></> : null}</td>
        <td>{{ region: "Région", ville: "Ville", commune: "Commune" }[z.type]}</td>
        <td className="rn-num">{z.frais_livraison != null ? fmt(z.frais_livraison) : <span className="rn-muet">hérité</span>}</td>
        <td className="rn-num">{z.delai_jours != null ? `${z.delai_jours} j` : <span className="rn-muet">hérité</span>}</td>
        <td>{z.type === "region" ? null : couvertes.has(z.id) ? <Pastille ton="ok">Couverte</Pastille> : <Pastille ton="alerte">Non couverte</Pastille>}</td>
        <td><Bouton petit variante="discret" onClick={() => setEdit({ ...z })}>Modifier</Bouton></td>
      </tr>
      {enfants(z.id).map((e) => <Ligne key={e.id} z={e} niveau={niveau + 1} />)}
    </>
  );
  return (
    <>
      <div className="rn-section-titre">
        <h2>Zones et frais de livraison</h2>
        <Bouton petit onClick={() => setEdit({ type: "ville", actif: true })}>Ajouter une zone</Bouton>
      </div>
      <p className="rn-muet">Les frais et délais d'une ville ou commune vides reprennent ceux de la zone parente. Pour une livraison depuis une autre ville, les frais interurbains des paramètres s'ajoutent.</p>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-table-boite"><table className="rn-table">
        <thead><tr><th>Zone</th><th>Type</th><th className="rn-num">Frais</th><th className="rn-num">Délai</th><th>Couverture</th><th /></tr></thead>
        <tbody>{regions.map((z) => <Ligne key={z.id} z={z} niveau={0} />)}</tbody>
      </table></div>
      {edit ? (
        <Modale titre={edit.id ? "Modifier la zone" : "Nouvelle zone"} onFermer={() => setEdit(null)}>
          <Champ label="Nom"><input value={edit.nom || ""} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></Champ>
          <div className="rn-grille-2">
            <Champ label="Type"><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="region">Région</option><option value="ville">Ville</option><option value="commune">Commune</option></select></Champ>
            <Champ label="Rattachée à"><select value={edit.parent_id || ""} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })}><option value="">Aucune</option>{base.zones.filter((z) => z.id !== edit.id && z.type !== "commune").map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></Champ>
            <Champ label="Frais de livraison (FCFA)"><input inputMode="numeric" value={edit.frais_livraison ?? ""} onChange={(e) => setEdit({ ...edit, frais_livraison: e.target.value.replace(/\D/g, "") })} placeholder="hérité" /></Champ>
            <Champ label="Délai (jours)"><input inputMode="numeric" value={edit.delai_jours ?? ""} onChange={(e) => setEdit({ ...edit, delai_jours: e.target.value.replace(/\D/g, "") })} placeholder="hérité" /></Champ>
          </div>
          <Champ label="Coordonnées du centre" aide="Latitude, longitude. Sert au calcul de distance.">
            <input placeholder="5.3540, -3.9870" value={edit.lat != null && edit.lat !== "" ? `${edit.lat}, ${edit.lng}` : ""} onChange={(e) => { const [a, b] = e.target.value.split(",").map((x) => x.trim()); setEdit({ ...edit, lat: a ?? "", lng: b ?? "" }); }} />
          </Champ>
          <label className="rn-interrupteur"><input type="checkbox" checked={edit.actif !== false} onChange={(e) => setEdit({ ...edit, actif: e.target.checked })} /> Proposée aux clients</label>
          <Message ton={msg.ton}>{msg.texte}</Message>
          <Bouton onClick={enregistrer}>Enregistrer</Bouton>
        </Modale>
      ) : null}
    </>
  );
}

// =================================================================== RÉCLAMATIONS
function Reclamations({ supabase, workspaceId, rechargerAlertes }) {
  const [liste, setListe] = useState(null);
  const [filtre, setFiltre] = useState("ouvertes");
  const [rep, setRep] = useState({});
  const charger = useCallback(async () => {
    let r = supabase.from("rn_reclamations").select("*, commande:rn_commandes(numero, client_nom, client_tel, statut)").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (filtre === "ouvertes") r = r.in("statut", ["ouverte", "en_cours"]);
    const { data } = await r;
    setListe(data || []);
  }, [supabase, workspaceId, filtre]);
  useEffect(() => { charger(); }, [charger]);
  const [contacts, setContacts] = useState([]);
  const chargerContacts = useCallback(async () => {
    let r = supabase.from("rn_contacts").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100);
    if (filtre === "ouvertes") r = r.eq("statut", "nouveau");
    const { data } = await r; setContacts(data || []);
  }, [supabase, workspaceId, filtre]);
  useEffect(() => { chargerContacts(); }, [chargerContacts]);
  const traiter = async (r, statut) => {
    await supabase.from("rn_reclamations").update({ statut, reponse: rep[r.id] ?? r.reponse, traitee_at: ["resolue", "refusee"].includes(statut) ? new Date().toISOString() : null }).eq("id", r.id);
    charger(); rechargerAlertes();
  };
  return (
    <>
      <div className="rn-section-titre"><h2>Retours et réclamations</h2>
        <div className="rn-ligne"><button className="rn-cat" aria-pressed={filtre === "ouvertes"} onClick={() => setFiltre("ouvertes")}>À traiter</button><button className="rn-cat" aria-pressed={filtre === "toutes"} onClick={() => setFiltre("toutes")}>Toutes</button></div>
      </div>
      {!liste ? <span className="rn-spin" /> : liste.length ? liste.map((r) => (
        <div className="rn-carte rn-pile" key={r.id}>
          <div className="rn-entre"><b>{r.commande?.numero}, {r.commande?.client_nom}</b><span className="rn-ligne"><Pastille ton={r.type === "retour" ? "alerte" : "info"}>{{ retour: "Retour", probleme: "Problème", autre: "Question" }[r.type]}</Pastille><span className="rn-muet rn-petit">{fmtDate(r.created_at)}</span></span></div>
          <p>{r.message}</p>
          <a className="rn-petit" href={lienWhatsApp(r.commande?.client_tel, `Bonjour ${r.commande?.client_nom}, nous revenons vers vous au sujet de votre commande ${r.commande?.numero}.`)} target="_blank" rel="noreferrer">Répondre sur WhatsApp ({r.commande?.client_tel})</a>
          <Champ label="Réponse visible par le client"><textarea value={rep[r.id] ?? r.reponse ?? ""} onChange={(e) => setRep({ ...rep, [r.id]: e.target.value })} /></Champ>
          <div className="rn-ligne">
            <Bouton petit variante="discret" onClick={() => traiter(r, "en_cours")}>En traitement</Bouton>
            <Bouton petit variante="vert" onClick={() => traiter(r, "resolue")}>Marquer traitée</Bouton>
            <Bouton petit variante="discret" onClick={() => traiter(r, "refusee")}>Clôturer sans suite</Bouton>
          </div>
        </div>
      )) : <Vide titre="Aucune réclamation en attente" />}
      <h2 style={{ marginTop: 12 }}>Messages reçus par la page Contact</h2>
      {contacts.length ? contacts.map((m) => (
        <div className="rn-carte rn-pile" key={m.id} style={{ gap: 6 }}>
          <div className="rn-entre"><b>{m.nom}</b><span className="rn-ligne"><Pastille ton={m.statut === "nouveau" ? "alerte" : "ok"}>{m.statut === "nouveau" ? "Nouveau" : "Traité"}</Pastille><span className="rn-muet rn-petit">{fmtDate(m.created_at)}</span></span></div>
          <p style={{ whiteSpace: "pre-line" }}>{m.message}</p>
          <div className="rn-ligne">
            <a className="rn-btn rn-btn-contour rn-btn-petit" href={lienWhatsApp(m.telephone, `Bonjour ${m.nom}, merci pour votre message.`)} target="_blank" rel="noreferrer">Répondre sur WhatsApp</a>
            <a className="rn-btn rn-btn-discret rn-btn-petit" href={telLien(m.telephone)}>Appeler {m.telephone}</a>
            {m.statut === "nouveau" ? <Bouton petit variante="vert" onClick={async () => { await supabase.from("rn_contacts").update({ statut: "traite" }).eq("id", m.id); chargerContacts(); rechargerAlertes(); }}>Marquer traité</Bouton> : null}
          </div>
        </div>
      )) : <p className="rn-muet">Aucun message {filtre === "ouvertes" ? "en attente" : ""}.</p>}
    </>
  );
}

// =================================================================== FINANCES
function Finances({ supabase, workspaceId, base }) {
  const [lignes, setLignes] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [choix, setChoix] = useState(new Set());
  const [msg, setMsg] = useState({});
  const charger = useCallback(async () => {
    const [m, p] = await Promise.all([
      supabase.from("rn_missions").select("id, representant_id, montant_encaisse, commission, termine_at, commande:rn_commandes(id, numero, reverse_at, mode_paiement)").eq("workspace_id", workspaceId).eq("statut", "terminee").order("termine_at", { ascending: false }).limit(1000),
      supabase.from("rn_paiements").select("*, commande:rn_commandes(numero)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200),
    ]);
    setLignes(m.data || []); setPaiements(p.data || []);
  }, [supabase, workspaceId]);
  useEffect(() => { charger(); }, [charger]);
  const nomRep = (id) => base.reps.find((r) => r.id === id)?.nom || "—";
  const aReverser = (lignes || []).filter((l) => l.montant_encaisse > 0 && !l.commande?.reverse_at);
  const parRep = base.reps.map((r) => ({ ...r, du: aReverser.filter((l) => l.representant_id === r.id).reduce((s, l) => s + Number(l.montant_encaisse), 0),
    commissions: (lignes || []).filter((l) => l.representant_id === r.id).reduce((s, l) => s + Number(l.commission), 0) })).filter((r) => r.du || r.commissions);
  const marquer = async () => {
    try {
      const n = await rpc(supabase, "rn_admin_marquer_reverse", { p_cmds: [...new Set(aReverser.filter((l) => choix.has(l.id)).map((l) => l.commande.id))] });
      setMsg({ ton: "ok", texte: `${n} commande(s) marquée(s) comme reversée(s).` }); setChoix(new Set()); charger();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  return (
    <>
      <div className="rn-section-titre"><h2>Finances</h2>
        <Bouton variante="discret" petit onClick={() => exporterExcel("paiements-" + new Date().toISOString().slice(0, 10), [
          { label: "Date", val: (p) => fmtDate(p.created_at) }, { label: "Commande", val: (p) => p.commande?.numero }, { label: "Source", val: (p) => ({ webhook: "Prestataire", verification_admin: "Vérifié par l'admin", encaissement_livraison: "Encaissé à la livraison", remboursement: "Remboursement" }[p.source]) },
          { label: "Opérateur", val: (p) => p.provider }, { label: "Référence", val: (p) => p.reference }, { label: "Montant (FCFA)", val: (p) => p.montant }], paiements)}>Exporter les paiements</Bouton>
      </div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-carte rn-pile">
        <h3>Soldes par représentant</h3>
        {parRep.length ? (
          <div className="rn-table-boite"><table className="rn-table">
            <thead><tr><th>Représentant</th><th className="rn-num">Encaissé à reverser</th><th className="rn-num">Commissions cumulées</th><th className="rn-num">Net à reverser</th><th /></tr></thead>
            <tbody>{parRep.map((r) => (
              <tr key={r.id}><td>{r.nom}</td><td className="rn-num">{fmt(r.du)}</td><td className="rn-num">{fmt(r.commissions)}</td><td className="rn-num"><b>{fmt(r.du)}</b></td>
                <td>{r.du ? <a className="rn-petit" href={lienWhatsApp(r.telephone, `Bonjour ${r.nom.split(" ")[0]}, merci de reverser ${fmt(r.du)} encaissés lors de vos livraisons.`)} target="_blank" rel="noreferrer">Relancer</a> : null}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="rn-muet">Aucun montant en attente.</p>}
        <p className="rn-muet rn-petit">Les commissions sont suivies séparément : réglez-les selon l'accord passé avec chaque représentant.</p>
      </div>
      <div className="rn-carte rn-pile">
        <div className="rn-entre"><h3>Encaissements à rapprocher</h3><Bouton petit disabled={!choix.size} onClick={marquer}>Marquer comme reversé ({choix.size})</Bouton></div>
        {aReverser.length ? (
          <div className="rn-table-boite"><table className="rn-table">
            <thead><tr><th><input type="checkbox" aria-label="Tout sélectionner" checked={choix.size === aReverser.length} onChange={(e) => setChoix(e.target.checked ? new Set(aReverser.map((l) => l.id)) : new Set())} /></th><th>Commande</th><th>Représentant</th><th>Livrée le</th><th className="rn-num">Montant</th></tr></thead>
            <tbody>{aReverser.map((l) => (
              <tr key={l.id}><td><input type="checkbox" checked={choix.has(l.id)} onChange={(e) => { const n = new Set(choix); e.target.checked ? n.add(l.id) : n.delete(l.id); setChoix(n); }} aria-label={`Sélectionner ${l.commande?.numero}`} /></td>
                <td>{l.commande?.numero}</td><td>{nomRep(l.representant_id)}</td><td className="rn-petit">{fmtDate(l.termine_at)}</td><td className="rn-num">{fmt(l.montant_encaisse)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="rn-muet">Tout l'argent encaissé a été reversé.</p>}
      </div>
      <div className="rn-carte rn-pile">
        <h3>Derniers paiements enregistrés</h3>
        {paiements.slice(0, 30).map((p) => (
          <div key={p.id} className="rn-entre rn-petit"><span>{fmtDate(p.created_at)}, {p.commande?.numero}, {{ webhook: "confirmé par le prestataire", verification_admin: "vérifié par l'admin", encaissement_livraison: "encaissé à la livraison", remboursement: "remboursement" }[p.source]}</span><b>{fmt(p.montant)}</b></div>
        ))}
      </div>
    </>
  );
}

// =================================================================== VENDEURS PARTENAIRES (activable)
function Vendeurs({ supabase, workspaceId, slug, base }) {
  const [liste, setListe] = useState([]);
  const [soldes, setSoldes] = useState({});
  const [edit, setEdit] = useState(null);
  const [regl, setRegl] = useState(null);
  const [msg, setMsg] = useState({});
  const lienVendeur = `${window.location.origin}/?reseau=${encodeURIComponent(slug || "")}&espace=vendeur`;
  const charger = useCallback(async () => {
    const { data } = await supabase.from("rn_vendeurs").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }); setListe(data || []);
    rpc(supabase, "rn_admin_vendeurs_soldes", { p_ws: workspaceId }).then((l) => setSoldes(Object.fromEntries((l || []).map((x) => [x.id, x])))).catch(() => {});
  }, [supabase, workspaceId]);
  const regler = async () => {
    try { await rpc(supabase, "rn_admin_regler_vendeur", { p_vendeur: regl.v.id, p_montant: Number(regl.montant), p_mode: regl.mode, p_reference: regl.reference || null, p_note: null }); setRegl(null); setMsg({ ton: "ok", texte: "Règlement enregistré, vendeur prévenu." }); charger(); }
    catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  useEffect(() => { charger(); }, [charger]);
  const enregistrer = async () => {
    try {
      const v = edit;
      const d = { workspace_id: workspaceId, nom: v.nom, telephone: v.telephone || null, email: v.email || null, representant_id: v.representant_id || null, statut: v.statut || "actif", taux_commission: Number(v.taux_commission) || 0 };
      const { error } = v.id ? await supabase.from("rn_vendeurs").update(d).eq("id", v.id) : await supabase.from("rn_vendeurs").insert(d);
      if (error) throw error;
      setEdit(null); charger();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  return (
    <>
      <div className="rn-section-titre"><h2>Vendeurs partenaires</h2><Bouton petit onClick={() => setEdit({ statut: "actif" })}>Ajouter un vendeur</Bouton></div>
      <p className="rn-muet">Un vendeur confie ses articles à la plateforme. Ses pièces sont stockées et livrées par le représentant gardien choisi ; vous les publiez après vérification.</p>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-carte rn-entre"><span className="rn-petit">Lien d'inscription des vendeurs : <b>{lienVendeur}</b></span><Bouton variante="discret" petit onClick={() => navigator.clipboard?.writeText(lienVendeur)}>Copier</Bouton></div>
      {liste.length ? (
        <div className="rn-table-boite"><table className="rn-table">
          <thead><tr><th>Vendeur</th><th>Gardien</th><th className="rn-num">Commission</th><th className="rn-num">Ventes</th><th className="rn-num">Réglé</th><th className="rn-num">Reste dû</th><th>Statut</th><th /></tr></thead>
          <tbody>{liste.map((v) => { const x = soldes[v.id] || {}; return (
            <tr key={v.id}><td><b>{v.nom}</b><br /><span className="rn-muet rn-petit">{v.telephone} {v.email}</span>{x.a_valider ? <><br /><Pastille ton="alerte">{x.a_valider} article(s) à valider</Pastille></> : null}</td>
              <td>{base.reps.find((r) => r.id === v.representant_id)?.nom || "—"}</td><td className="rn-num">{v.taux_commission} %</td>
              <td className="rn-num">{fmt(x.ventes)}</td><td className="rn-num">{fmt(x.regle)}</td><td className="rn-num"><b>{fmt(x.reste)}</b></td>
              <td><Pastille ton={v.statut === "actif" ? "ok" : v.statut === "en_attente" ? "alerte" : "neutre"}>{{ en_attente: "En attente", actif: "Actif", suspendu: "Suspendu" }[v.statut]}</Pastille></td>
              <td><div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
                {v.statut === "en_attente" ? <Bouton petit variante="vert" onClick={() => setEdit({ ...v, statut: "actif", taux_commission: v.taux_commission || 20 })}>Valider</Bouton> : null}
                {Number(x.reste) > 0 ? <Bouton petit onClick={() => setRegl({ v, montant: String(Math.round(x.reste)), mode: "Wave", reference: "" })}>Régler</Bouton> : null}
                <Bouton petit variante="discret" onClick={() => setEdit({ ...v })}>Modifier</Bouton>
                {v.telephone ? <a className="rn-petit" href={lienWhatsApp(v.telephone, `Bonjour ${v.nom}, `)} target="_blank" rel="noreferrer">WhatsApp</a> : null}
              </div></td></tr>
          ); })}</tbody>
        </table></div>
      ) : <Vide titre="Aucun vendeur partenaire">Partagez le lien d'inscription ci-dessus ou ajoutez un vendeur.</Vide>}
      {regl ? (
        <Modale titre={`Régler ${regl.v.nom}`} onFermer={() => setRegl(null)}>
          <Champ label="Montant versé (FCFA)"><input inputMode="numeric" value={regl.montant} onChange={(e) => setRegl({ ...regl, montant: e.target.value.replace(/\D/g, "") })} /></Champ>
          <Champ label="Mode"><select value={regl.mode} onChange={(e) => setRegl({ ...regl, mode: e.target.value })}><option>Wave</option><option>Orange Money</option><option>MTN MoMo</option><option>Espèces</option><option>Virement</option></select></Champ>
          <Champ label="Référence (facultatif)"><input value={regl.reference} onChange={(e) => setRegl({ ...regl, reference: e.target.value })} /></Champ>
          <Bouton disabled={!Number(regl.montant)} onClick={regler}>Enregistrer le règlement</Bouton>
        </Modale>
      ) : null}
      {edit ? (
        <Modale titre={edit.id ? "Modifier le vendeur" : "Nouveau vendeur"} onFermer={() => setEdit(null)}>
          <Champ label="Nom"><input value={edit.nom || ""} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} /></Champ>
          <Champ label="Téléphone"><input value={edit.telephone || ""} onChange={(e) => setEdit({ ...edit, telephone: e.target.value })} /></Champ>
          <Champ label="E-mail"><input type="email" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Champ>
          <Champ label="Représentant gardien du stock"><select value={edit.representant_id || ""} onChange={(e) => setEdit({ ...edit, representant_id: e.target.value })}><option value="">Choisir…</option>{base.reps.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></Champ>
          <Champ label="Commission de la plateforme (%)"><input inputMode="decimal" value={edit.taux_commission ?? ""} onChange={(e) => setEdit({ ...edit, taux_commission: e.target.value })} /></Champ>
          <Champ label="Statut"><select value={edit.statut} onChange={(e) => setEdit({ ...edit, statut: e.target.value })}><option value="en_attente">En attente</option><option value="actif">Actif</option><option value="suspendu">Suspendu</option></select></Champ>
          <Bouton disabled={!edit.nom} onClick={enregistrer}>Enregistrer</Bouton>
        </Modale>
      ) : null}
    </>
  );
}

// =================================================================== PARAMÈTRES
function Parametres({ supabase, workspaceId, param, base, rechargerRef }) {
  const [v, setV] = useState({ ...param, textes: param.textes || {}, numeros_paiement: param.numeros_paiement || {} });
  const [msg, setMsg] = useState({});
  const [nouvelleCat, setNouvelleCat] = useState("");
  const maj = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const majTexte = (k) => (e) => setV({ ...v, textes: { ...v.textes, [k]: e.target.value } });
  const enregistrer = async () => {
    try {
      const { error } = await supabase.from("rn_parametres").update({
        nom_plateforme: v.nom_plateforme, prefixe_commande: (v.prefixe_commande || "CMD").toUpperCase().replace(/[^A-Z0-9]/g, ""),
        delai_reponse_min: Number(v.delai_reponse_min), duree_reservation_min: Number(v.duree_reservation_min), commission_taux: Number(v.commission_taux),
        interurbain_actif: v.interurbain_actif, frais_interurbain: Number(v.frais_interurbain), delai_interurbain_jours: Number(v.delai_interurbain_jours),
        modes_paiement: v.modes_paiement, numeros_paiement: v.numeros_paiement, vendeurs_actifs: v.vendeurs_actifs, whatsapp_service: v.whatsapp_service || null,
        couleur_principale: v.couleur_principale, couleur_or: v.couleur_or, logo_url: v.logo_url || null, textes: v.textes, updated_at: new Date().toISOString(),
        seuil_stock_faible: Number(v.seuil_stock_faible) || 0, livraison_offerte_des: v.livraison_offerte_des === "" || v.livraison_offerte_des == null ? null : Number(v.livraison_offerte_des),
        express_actif: !!v.express_actif, frais_express: Number(v.frais_express) || 0, delai_express_heures: Number(v.delai_express_heures) || 4,
        frais_par_km: Number(v.frais_par_km) || 0, frais_par_kg: Number(v.frais_par_kg) || 0, photo_livraison_obligatoire: !!v.photo_livraison_obligatoire,
        contact_email: v.contact_email || null, contact_telephone: v.contact_telephone || null, contact_adresse: v.contact_adresse || null,
      }).eq("workspace_id", workspaceId);
      if (error) throw error;
      setMsg({ ton: "ok", texte: "Paramètres enregistrés." }); rechargerRef();
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); }
  };
  const basculerMode = (m) => setV({ ...v, modes_paiement: v.modes_paiement.includes(m) ? v.modes_paiement.filter((x) => x !== m) : [...v.modes_paiement, m] });
  return (
    <>
      <div className="rn-section-titre"><h2>Paramètres</h2><Bouton onClick={enregistrer}>Enregistrer</Bouton></div>
      <Message ton={msg.ton} onFermer={() => setMsg({})}>{msg.texte}</Message>
      <div className="rn-grille-2">
        <div className="rn-carte rn-pile">
          <h3>Identité</h3>
          <Champ label="Nom de la plateforme"><input value={v.nom_plateforme} onChange={maj("nom_plateforme")} /></Champ>
          <Champ label="Préfixe des numéros de commande"><input value={v.prefixe_commande} onChange={maj("prefixe_commande")} maxLength={6} /></Champ>
          <Champ label="Logo (adresse de l'image)"><input value={v.logo_url || ""} onChange={maj("logo_url")} placeholder="https://…" /></Champ>
          <div className="rn-ligne">
            <Champ label="Couleur principale"><input type="color" value={v.couleur_principale || "#4A1238"} onChange={maj("couleur_principale")} style={{ width: 70, padding: 4 }} /></Champ>
            <Champ label="Couleur or"><input type="color" value={v.couleur_or || "#C9A24A"} onChange={maj("couleur_or")} style={{ width: 70, padding: 4 }} /></Champ>
          </div>
          <Champ label="WhatsApp du service client"><input type="tel" value={v.whatsapp_service || ""} onChange={maj("whatsapp_service")} /></Champ>
          <Champ label="Téléphone affiché (page Contact)"><input type="tel" value={v.contact_telephone || ""} onChange={maj("contact_telephone")} /></Champ>
          <Champ label="E-mail affiché"><input type="email" value={v.contact_email || ""} onChange={maj("contact_email")} /></Champ>
          <Champ label="Adresse affichée"><input value={v.contact_adresse || ""} onChange={maj("contact_adresse")} placeholder="Ex. Cocody, Abidjan" /></Champ>
        </div>
        <div className="rn-carte rn-pile">
          <h3>Paiement</h3>
          {Object.entries(MODES_PAIEMENT).filter(([k]) => k !== "carte").map(([k, m]) => (
            <div key={k} className="rn-pile" style={{ gap: 6 }}>
              <label className="rn-interrupteur"><input type="checkbox" checked={v.modes_paiement.includes(k)} onChange={() => basculerMode(k)} /> {m.label}</label>
              {k !== "cod" && v.modes_paiement.includes(k) ? <input placeholder={`Numéro ${m.court} qui reçoit les paiements`} value={v.numeros_paiement[k] || ""} onChange={(e) => setV({ ...v, numeros_paiement: { ...v.numeros_paiement, [k]: e.target.value } })} /> : null}
            </div>
          ))}
          <Champ label="Réservation d'un article en attente de paiement (minutes)"><input inputMode="numeric" value={v.duree_reservation_min} onChange={maj("duree_reservation_min")} /></Champ>
          <p className="rn-muet rn-petit">Carte bancaire et confirmation automatique : à brancher via un prestataire (CinetPay, par exemple). La fonction de confirmation serveur est déjà prête.</p>
        </div>
        <div className="rn-carte rn-pile">
          <h3>Livraisons et missions</h3>
          <Champ label="Délai pour accepter une mission (minutes)" aide="Passé ce délai, la mission part au représentant suivant."><input inputMode="numeric" value={v.delai_reponse_min} onChange={maj("delai_reponse_min")} /></Champ>
          <Champ label="Commission par défaut des représentants (%)"><input inputMode="decimal" value={v.commission_taux} onChange={maj("commission_taux")} /></Champ>
          <label className="rn-interrupteur"><input type="checkbox" checked={v.interurbain_actif} onChange={(e) => setV({ ...v, interurbain_actif: e.target.checked })} /> Accepter les livraisons depuis une autre ville</label>
          {v.interurbain_actif ? (
            <div className="rn-grille-2">
              <Champ label="Supplément interurbain (FCFA)"><input inputMode="numeric" value={v.frais_interurbain} onChange={maj("frais_interurbain")} /></Champ>
              <Champ label="Délai interurbain (jours)"><input inputMode="numeric" value={v.delai_interurbain_jours} onChange={maj("delai_interurbain_jours")} /></Champ>
            </div>
          ) : null}
          <div className="rn-grille-2">
            <Champ label="Livraison offerte dès (FCFA)" aide="Vide = jamais offerte."><input inputMode="numeric" value={v.livraison_offerte_des ?? ""} onChange={(e) => setV({ ...v, livraison_offerte_des: e.target.value.replace(/\D/g, "") })} /></Champ>
            <Champ label="Supplément par km (FCFA)" aide="Distance livreur → client. 0 = désactivé."><input inputMode="numeric" value={v.frais_par_km ?? 0} onChange={maj("frais_par_km")} /></Champ>
            <Champ label="Supplément par kg (FCFA)" aide="Selon le poids des articles. 0 = désactivé."><input inputMode="numeric" value={v.frais_par_kg ?? 0} onChange={maj("frais_par_kg")} /></Champ>
            <Champ label="Seuil de stock faible (pièces)"><input inputMode="numeric" value={v.seuil_stock_faible ?? 3} onChange={maj("seuil_stock_faible")} /></Champ>
          </div>
          <label className="rn-interrupteur"><input type="checkbox" checked={!!v.express_actif} onChange={(e) => setV({ ...v, express_actif: e.target.checked })} /> Proposer la livraison express (livraisons locales)</label>
          {v.express_actif ? (
            <div className="rn-grille-2">
              <Champ label="Supplément express (FCFA)"><input inputMode="numeric" value={v.frais_express ?? 1500} onChange={maj("frais_express")} /></Champ>
              <Champ label="Délai express annoncé (heures)"><input inputMode="numeric" value={v.delai_express_heures ?? 4} onChange={maj("delai_express_heures")} /></Champ>
            </div>
          ) : null}
          <label className="rn-interrupteur"><input type="checkbox" checked={!!v.photo_livraison_obligatoire} onChange={(e) => setV({ ...v, photo_livraison_obligatoire: e.target.checked })} /> Photo de remise obligatoire à la livraison</label>
          <label className="rn-interrupteur"><input type="checkbox" checked={v.vendeurs_actifs} onChange={(e) => setV({ ...v, vendeurs_actifs: e.target.checked })} /> Activer les vendeurs partenaires</label>
        </div>
        <div className="rn-carte rn-pile">
          <h3>Textes de la boutique</h3>
          <Champ label="Ce que vend la boutique" aide="Adapte les textes de la boutique (accueil, fiches, conditions).">
            <select value={v.textes.univers || "mode"} onChange={majTexte("univers")}><option value="mode">Mode de seconde main</option><option value="livres">Guides et publications</option></select>
          </Champ>
          <Champ label="Titre de l'accueil"><input value={v.textes.titre_accueil || ""} onChange={majTexte("titre_accueil")} placeholder="La mode qui a déjà du style, à petit prix" /></Champ>
          <Champ label="Sous-titre de l'accueil"><textarea value={v.textes.sous_titre_accueil || ""} onChange={majTexte("sous_titre_accueil")} /></Champ>
          <Champ label="Page Livraison" aide="Laisser vide pour le texte par défaut."><textarea value={v.textes.page_livraison || ""} onChange={majTexte("page_livraison")} /></Champ>
          <Champ label="Page Retours"><textarea value={v.textes.page_retours || ""} onChange={majTexte("page_retours")} /></Champ>
          <Champ label="Conditions générales de vente"><textarea value={v.textes.page_conditions || ""} onChange={majTexte("page_conditions")} /></Champ>
        </div>
        <div className="rn-carte rn-pile">
          <h3>Catégories</h3>
          {base.categories.filter((c) => !c.parent_id).map((c) => (
            <div key={c.id} className="rn-entre"><span>{c.nom}</span><Bouton petit variante="discret" onClick={async () => { if (window.confirm(`Supprimer la catégorie « ${c.nom} » ? Les articles gardent leur catégorie actuelle.`)) { await supabase.from("rn_categories").delete().eq("id", c.id); rechargerRef(); } }}>Supprimer</Bouton></div>
          ))}
          <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
            <input value={nouvelleCat} onChange={(e) => setNouvelleCat(e.target.value)} placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie" />
            <Bouton petit disabled={!nouvelleCat.trim()} onClick={async () => { await supabase.from("rn_categories").insert({ workspace_id: workspaceId, nom: nouvelleCat.trim(), ordre: base.categories.length + 1 }); setNouvelleCat(""); rechargerRef(); }}>Ajouter</Bouton>
          </div>
        </div>
        <CodesPromo supabase={supabase} workspaceId={workspaceId} />
      </div>
    </>
  );
}

// =================================================================== JOURNAL
function Journal({ supabase, workspaceId }) {
  const [liste, setListe] = useState(null);
  useEffect(() => { supabase.from("rn_journal").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(300).then(({ data }) => setListe(data || [])); }, [supabase, workspaceId]);
  const ACTIONS = { paiement_valide: "Paiement validé", affectation_manuelle: "Affectation manuelle", article_valide: "Article publié", article_refuse: "Article refusé", stock_entree: "Entrée de stock", stock_sortie: "Sortie de stock", stock_retour: "Retour en stock", stock_ajustement: "Ajustement de stock" };
  return (
    <>
      <Diagnostic supabase={supabase} workspaceId={workspaceId} />
      <h2>Journal des opérations</h2>
      {!liste ? <span className="rn-spin" /> : liste.length ? (
        <div className="rn-table-boite"><table className="rn-table">
          <thead><tr><th>Date</th><th>Opération</th><th>Détails</th></tr></thead>
          <tbody>{liste.map((j) => (
            <tr key={j.id}><td className="rn-petit">{fmtDate(j.created_at)}</td><td>{ACTIONS[j.action] || j.action}</td><td className="rn-petit">{Object.entries(j.details || {}).filter(([, v]) => v != null).map(([k, v]) => `${k} : ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <Vide titre="Journal vide">Les validations, paiements, affectations et mouvements de stock s'y inscrivent automatiquement.</Vide>}
    </>
  );
}

// =================================================================== CODES PROMO
function CodesPromo({ supabase, workspaceId }) {
  const [liste, setListe] = useState([]);
  const [n, setN] = useState({ code: "", type: "pourcentage", valeur: "", minimum: "", fin: "", usages_max: "" });
  const [msg, setMsg] = useState({});
  const charger = useCallback(async () => { const { data } = await supabase.from("rn_codes_promo").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }); setListe(data || []); }, [supabase, workspaceId]);
  useEffect(() => { charger(); }, [charger]);
  const ajouter = async () => {
    setMsg({});
    const { error } = await supabase.from("rn_codes_promo").insert({
      workspace_id: workspaceId, code: n.code.trim().toUpperCase(), type: n.type, valeur: n.type === "livraison_offerte" ? 0 : Number(n.valeur) || 0,
      minimum: Number(n.minimum) || 0, fin: n.fin || null, usages_max: n.usages_max ? Number(n.usages_max) : null,
    });
    if (error) return setMsg({ ton: "danger", texte: /duplicate|unique/i.test(error.message) ? "Ce code existe déjà." : erreurTexte(error) });
    setN({ code: "", type: "pourcentage", valeur: "", minimum: "", fin: "", usages_max: "" }); charger();
  };
  const decrire = (c) => (c.type === "pourcentage" ? `−${c.valeur} %` : c.type === "montant" ? `−${fmt(c.valeur)}` : "Livraison offerte") + (Number(c.minimum) ? ` dès ${fmt(c.minimum)}` : "");
  return (
    <div className="rn-carte rn-pile">
      <h3>Codes promo</h3>
      {liste.map((c) => (
        <div key={c.id} className="rn-entre rn-petit">
          <span><b>{c.code}</b> · {decrire(c)}<br /><span className="rn-muet">{c.usages}{c.usages_max ? `/${c.usages_max}` : ""} utilisation(s){c.fin ? `, jusqu'au ${new Date(c.fin + "T12:00:00").toLocaleDateString("fr-FR")}` : ""}</span></span>
          <span className="rn-ligne" style={{ flexWrap: "nowrap" }}>
            <label className="rn-interrupteur"><input type="checkbox" checked={c.actif} onChange={async () => { await supabase.from("rn_codes_promo").update({ actif: !c.actif }).eq("id", c.id); charger(); }} aria-label={`Activer ${c.code}`} /></label>
          </span>
        </div>
      ))}
      <div className="rn-grille-2">
        <Champ label="Code"><input value={n.code} onChange={(e) => setN({ ...n, code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="MISS10" maxLength={30} /></Champ>
        <Champ label="Type"><select value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="pourcentage">Pourcentage</option><option value="montant">Montant fixe</option><option value="livraison_offerte">Livraison offerte</option></select></Champ>
        {n.type !== "livraison_offerte" ? <Champ label={n.type === "pourcentage" ? "Réduction (%)" : "Réduction (FCFA)"}><input inputMode="numeric" value={n.valeur} onChange={(e) => setN({ ...n, valeur: e.target.value.replace(/\D/g, "") })} /></Champ> : null}
        <Champ label="Achat minimum (FCFA)"><input inputMode="numeric" value={n.minimum} onChange={(e) => setN({ ...n, minimum: e.target.value.replace(/\D/g, "") })} /></Champ>
        <Champ label="Valable jusqu'au (facultatif)"><input type="date" value={n.fin} onChange={(e) => setN({ ...n, fin: e.target.value })} /></Champ>
        <Champ label="Utilisations max (facultatif)"><input inputMode="numeric" value={n.usages_max} onChange={(e) => setN({ ...n, usages_max: e.target.value.replace(/\D/g, "") })} /></Champ>
      </div>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton petit disabled={n.code.length < 3 || (n.type !== "livraison_offerte" && !Number(n.valeur))} onClick={ajouter}>Créer le code</Bouton>
    </div>
  );
}

// =================================================================== CARTE DU RÉSEAU
const CONTOUR_CI = [[-7.55,4.4],[-6.9,4.6],[-6.1,4.95],[-5.0,5.15],[-4.0,5.25],[-3.3,5.12],[-2.75,5.1],[-2.95,5.7],[-3.2,6.2],[-3.0,7.0],[-2.75,7.9],[-2.5,8.2],[-2.7,9.0],[-2.75,9.4],[-3.0,9.85],[-3.6,9.9],[-4.3,9.6],[-4.7,9.75],[-5.1,10.3],[-5.5,10.4],[-6.0,10.2],[-6.2,10.6],[-6.6,10.5],[-7.0,10.2],[-7.5,10.4],[-7.9,10.3],[-8.2,10.1],[-8.0,9.4],[-8.2,9.0],[-7.8,8.5],[-8.2,8.2],[-8.5,7.7],[-8.3,7.2],[-7.9,6.6],[-7.6,5.9],[-7.5,5.3]];
const projeter = (lng, lat) => [((lng + 8.7) / 6.4) * 520 + 20, ((10.8 - lat) / 6.6) * 540 + 20];

function CarteReseau({ supabase, workspaceId, aller }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState("");
  const [survol, setSurvol] = useState(null);
  useEffect(() => { rpc(supabase, "rn_carte", { p_ws: workspaceId }).then(setD).catch((e) => setErreur(erreurTexte(e))); }, [supabase, workspaceId]);
  if (erreur) return <Message ton="danger">{erreur}</Message>;
  if (!d) return <span className="rn-spin" />;
  const contour = "M" + CONTOUR_CI.map(([x, y]) => projeter(x, y).map((v) => v.toFixed(1)).join(" ")).join(" L") + " Z";
  const zones = d.zones.filter((z) => z.lat != null && z.lng != null);
  const reps = d.representants.filter((r) => r.lat != null && r.lng != null);
  const sansCoord = d.zones.length - zones.length;
  const nonCouvertes = d.zones.filter((z) => !z.couverte);
  return (
    <>
      <div className="rn-section-titre"><h2>Carte du réseau</h2><Bouton variante="discret" petit onClick={() => aller("zones")}>Gérer les zones</Bouton></div>
      <div className="rn-grille-2" style={{ alignItems: "start" }}>
        <div className="rn-carte" style={{ padding: 10 }}>
          <svg viewBox="0 0 560 580" className="rn-carte-ci" role="img" aria-label="Carte de Côte d'Ivoire : zones couvertes et représentants">
            <path d={contour} fill="#fff" stroke="#c9b9a8" strokeWidth="2" strokeLinejoin="round" />
            {zones.map((z) => { const [x, y] = projeter(z.lng, z.lat); return (
              <circle key={z.id} cx={x} cy={y} r={z.commandes ? Math.min(14, 6 + Math.sqrt(z.commandes) * 2) : 6}
                style={{ fill: z.couverte ? "#2E7D4F" : "#C2410C", fillOpacity: 0.28, stroke: z.couverte ? "#2E7D4F" : "#C2410C", strokeWidth: 1.5, cursor: "pointer" }}
                onMouseEnter={() => setSurvol(z)} onMouseLeave={() => setSurvol(null)} onClick={() => setSurvol(z)}>
                <title>{`${z.nom} : ${z.couverte ? "couverte" : "non couverte"}, ${z.commandes} commande(s)`}</title>
              </circle>
            ); })}
            {reps.map((r) => { const [x, y] = projeter(r.lng, r.lat); return (
              <g key={r.id}><rect x={x - 5} y={y - 5} width="10" height="10" rx="2" transform={`rotate(45 ${x} ${y})`} style={{ fill: r.disponible ? "var(--rn-prune)" : "#9a8f99", stroke: "#fff", strokeWidth: 1.5 }} /><title>{`${r.nom}${r.disponible ? "" : " (indisponible)"}`}</title></g>
            ); })}
          </svg>
          <div className="rn-ligne rn-petit" style={{ gap: 14, padding: "6px 4px" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 9, background: "#2E7D4F", opacity: 0.6 }} /> Zone couverte</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 9, background: "#C2410C", opacity: 0.6 }} /> Non couverte</span>
            <span><span style={{ display: "inline-block", width: 9, height: 9, background: "var(--rn-prune)", transform: "rotate(45deg)" }} /> Représentant</span>
            <span className="rn-muet">Taille du cercle = commandes</span>
          </div>
          {survol ? <p className="rn-petit" style={{ padding: "0 4px" }}><b>{survol.nom}</b> : {survol.couverte ? "couverte" : "non couverte"}, {survol.commandes} commande(s)</p> : null}
        </div>
        <div className="rn-pile">
          <div className="rn-kpis">
            <div className="rn-kpi"><div className="rn-kpi-lab">Zones couvertes</div><div className="rn-kpi-val">{d.zones.length - nonCouvertes.length} / {d.zones.length}</div></div>
            <div className="rn-kpi"><div className="rn-kpi-lab">Représentants disponibles</div><div className="rn-kpi-val">{d.representants.filter((r) => r.disponible).length} / {d.representants.length}</div></div>
          </div>
          <div className="rn-carte rn-pile">
            <h3>Zones non couvertes ({nonCouvertes.length})</h3>
            {nonCouvertes.sort((a, b) => b.commandes - a.commandes).slice(0, 20).map((z) => (
              <div key={z.id} className="rn-entre rn-petit"><span>{z.nom}</span>{z.commandes ? <Pastille ton="alerte">{z.commandes} commande(s)</Pastille> : <span className="rn-muet">aucune commande</span>}</div>
            ))}
            {!nonCouvertes.length ? <p className="rn-muet">Tout le territoire configuré est couvert.</p> : null}
          </div>
          {sansCoord ? <p className="rn-muet rn-petit">{sansCoord} zone(s) sans coordonnées ne sont pas placées sur la carte.</p> : null}
        </div>
      </div>
    </>
  );
}

// =================================================================== DIAGNOSTIC (supervision)
function Diagnostic({ supabase, workspaceId }) {
  const [d, setD] = useState(null);
  const charger = useCallback(() => { rpc(supabase, "rn_diagnostic", { p_ws: workspaceId }).then(setD).catch(() => setD(false)); }, [supabase, workspaceId]);
  useEffect(() => { charger(); }, [charger]);
  if (d === false) return null;
  if (!d) return <span className="rn-spin" />;
  const minutes = d.tache_minute?.derniere_execution ? Math.round((Date.now() - new Date(d.tache_minute.derniere_execution)) / 60000) : null;
  const lignes = [
    ["Moteur automatique (toutes les minutes)", minutes == null ? "Pas d'information" : minutes <= 3 ? `OK, il y a ${minutes} min` : `Arrêté depuis ${minutes} min`, minutes != null && minutes <= 3 && d.tache_minute.statut !== "failed"],
    ["Missions sans réponse non réattribuées", d.missions_bloquees, !d.missions_bloquees],
    ["Réservations expirées non libérées", d.reservations_bloquees, !d.reservations_bloquees],
    ["Commandes sans livreur depuis plus d'1 h", d.sans_livreur_1h, !d.sans_livreur_1h],
    ["Alertes non parvenues aux représentants (24 h)", d.push_non_envoyes_24h, !d.push_non_envoyes_24h],
    ["Téléphones abonnés aux alertes", `${d.appareils?.representants || 0} représentant(s), ${d.appareils?.vendeurs || 0} vendeur(s)`, true],
    ["Représentants actifs sans compte ouvert", d.representants_sans_compte, !d.representants_sans_compte],
    ["Stocks incohérents", d.stock_incoherent, !d.stock_incoherent],
    ["E-mails envoyés aux clients (24 h)", d.emails_24h, true],
  ];
  return (
    <div className="rn-carte rn-pile" style={{ gap: 8 }}>
      <div className="rn-entre"><h3>État du système</h3><Bouton petit variante="discret" onClick={charger}>Actualiser</Bouton></div>
      {lignes.map(([l, v, ok]) => (
        <div key={l} className="rn-entre rn-petit"><span>{l}</span><Pastille ton={ok ? "ok" : "alerte"}>{String(v)}</Pastille></div>
      ))}
      {d.push_non_envoyes_24h ? <p className="rn-petit rn-muet">Alertes non parvenues : vérifiez la clé SUPABASE_SERVICE_ROLE_KEY dans Vercel et que les représentants ont activé les alertes.</p> : null}
    </div>
  );
}
