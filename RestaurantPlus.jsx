import React, { useState, useMemo } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  "🧾 Tables & addition" : pour chaque table occupée (ou ayant encore une commande
//  non réglée), regroupe ses commandes ouvertes en une addition unique, avec paiements
//  partiels/fractionnés (plusieurs personnes, plusieurs modes — même mécanisme que
//  "paiements_commande" / "montant_paye" déjà utilisé ailleurs dans l'app), pourboire
//  optionnel, impression, et un bouton pour encaisser et libérer la table.
//  + un petit bloc de rapports (plats les plus vendus, heures de pointe, chiffre du jour
//  par type) — uniquement des données réelles, calculées ici, rien d'inventé.
// ============================================================================

const S = {
  carte: { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16 },
  bouton: { background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: "#16231F", border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 13px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
  champ: { padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" },
};

function estAujourdhui(dateStr) {
  const d = new Date(dateStr);
  const auj = new Date();
  return d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth() && d.getDate() === auj.getDate();
}

// Découpe le texte "produit" en lignes {nom, qte} — même format que le crée AddCommandeModal
// (restaurant) : "Nom xN, Nom2 xN2" — en ignorant une éventuelle note ajoutée après " | Note:"
// par le menu public.
function decouperProduit(texte) {
  const sansNote = String(texte || "").split(" | Note:")[0];
  return sansNote.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
    return m ? { nom: m[1].trim(), qte: Number(m[2]) || 1 } : { nom: s, qte: 1 };
  });
}

function imprimerAddition(table, lignesFusionnees, total, dejaPaye, reste, pourboire, workspaceNom, currency) {
  const fenetre = window.open("", "_blank", "width=380,height=640");
  if (!fenetre) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Addition</title><style>
    @page { size: 80mm auto; margin: 3mm; }
    body { font-family: 'Courier New', monospace; width: 74mm; margin: 0; font-size: 12px; }
    .titre { text-align: center; font-weight: 700; font-size: 14px; margin-bottom: 2px; }
    .sous { text-align: center; font-size: 11px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; }
    .droite { text-align: right; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    .total { font-weight: 700; font-size: 14px; }
  </style></head><body onload="window.print()">
    <div class="titre">${(workspaceNom || "").replace(/</g, "")}</div>
    <div class="sous">Table ${String(table.numero).replace(/</g, "")} — ${new Date().toLocaleString("fr-FR")}</div>
    <hr/>
    <table>
      ${lignesFusionnees.map((l) => `<tr><td>${l.qte}× ${l.nom.replace(/</g, "")}</td><td class="droite">${l.montantConnu != null ? l.montantConnu.toLocaleString("fr-FR") : "—"}</td></tr>`).join("")}
    </table>
    <hr/>
    <table>
      <tr><td>Total</td><td class="droite total">${total.toLocaleString("fr-FR")} ${currency}</td></tr>
      ${dejaPaye > 0 ? `<tr><td>Déjà payé</td><td class="droite">${dejaPaye.toLocaleString("fr-FR")} ${currency}</td></tr>` : ""}
      ${pourboire > 0 ? `<tr><td>Pourboire</td><td class="droite">${pourboire.toLocaleString("fr-FR")} ${currency}</td></tr>` : ""}
      <tr><td><b>Reste à payer</b></td><td class="droite total">${reste.toLocaleString("fr-FR")} ${currency}</td></tr>
    </table>
    <hr/>
    <div style="text-align:center;">Merci de votre visite !</div>
  </body></html>`;
  fenetre.document.write(html);
  fenetre.document.close();
}

function PanneauTable({ workspace, table, commandesOuvertes, plats, currency, confirmateurNom, onRefresh, role }) {
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState("cash");
  const [pourboire, setPourboire] = useState("");
  const [enCours, setEnCours] = useState(false);

  const total = commandesOuvertes.reduce((s, c) => s + Number(c.montant), 0);
  const dejaPaye = commandesOuvertes.reduce((s, c) => s + Number(c.montant_paye || 0), 0);
  const reste = Math.max(0, total - dejaPaye);

  const prixParNom = useMemo(() => {
    const map = {};
    plats.forEach((p) => { map[p.nom.toLowerCase()] = Number(p.prix); });
    return map;
  }, [plats]);

  const lignesFusionnees = useMemo(() => {
    const map = {};
    commandesOuvertes.forEach((c) => {
      decouperProduit(c.produit).forEach(({ nom, qte }) => {
        if (!map[nom]) map[nom] = { nom, qte: 0 };
        map[nom].qte += qte;
      });
    });
    return Object.values(map).map((l) => {
      const prixUnitaire = prixParNom[l.nom.toLowerCase()];
      return { ...l, montantConnu: prixUnitaire != null ? prixUnitaire * l.qte : null };
    });
  }, [commandesOuvertes, prixParNom]);

  async function ajouterPaiement() {
    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) return;
    setEnCours(true);
    let restant = montantNum;
    const parAncienDabord = [...commandesOuvertes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (const c of parAncienDabord) {
      if (restant <= 0) break;
      const resteCommande = Math.max(0, Number(c.montant) - Number(c.montant_paye || 0));
      if (resteCommande <= 0) continue;
      const aAppliquer = Math.min(restant, resteCommande);
      await supabase.from("paiements_commande").insert([{
        workspace_id: workspace.id, commande_id: c.id, montant: aAppliquer, mode_paiement: mode, enregistre_par: confirmateurNom || "Équipe",
      }]);
      const nouveauMontantPaye = Number(c.montant_paye || 0) + aAppliquer;
      const soldeComplet = nouveauMontantPaye >= Number(c.montant);
      await supabase.from("commandes").update({
        montant_paye: nouveauMontantPaye,
        ...(soldeComplet ? { statut: "confirmee", confirmed_at: new Date().toISOString(), confirmed_by: confirmateurNom || "Équipe" } : {}),
      }).eq("id", c.id);
      restant -= aAppliquer;
    }
    setMontant("");
    setEnCours(false);
    await onRefresh();
  }

  async function enregistrerPourboire() {
    const montantNum = Number(pourboire);
    if (!montantNum || montantNum <= 0) return;
    await supabase.from("pourboires").insert([{ workspace_id: workspace.id, table_id: table.id, montant: montantNum, enregistre_par: confirmateurNom || "Équipe" }]);
    setPourboire("");
    await onRefresh();
  }

  async function encaisserEtLiberer() {
    if (reste > 0) {
      const estGerant = role === "owner" || role === "admin";
      if (!estGerant) { alert("Il reste " + reste.toLocaleString("fr-FR") + " " + currency + " à payer. Seuls le propriétaire ou un admin peuvent libérer la table avant le règlement complet."); return; }
      const ok = window.confirm(`Il reste ${reste.toLocaleString("fr-FR")} ${currency} à payer sur cette table.\n\nLibérer quand même la table ?`);
      if (!ok) return;
    }
    setEnCours(true);
    await supabase.from("tables_restaurant").update({ statut: "libre" }).eq("id", table.id);
    setEnCours(false);
    await onRefresh();
  }

  return (
    <div style={S.carte}>
      <div data-testid={`table-${table.id}`} onClick={() => setOuvert((o) => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Table {table.numero}</div>
          <div style={{ fontSize: 11.5, color: "#8A9089" }}>{commandesOuvertes.length} commande{commandesOuvertes.length > 1 ? "s" : ""} ouverte{commandesOuvertes.length > 1 ? "s" : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: reste > 0 ? "#D64933" : "#1a7a3c" }}>{reste.toLocaleString("fr-FR")} {currency}</div>
          <div style={{ fontSize: 10.5, color: "#8A9089" }}>sur {total.toLocaleString("fr-FR")} {currency}</div>
        </div>
      </div>

      {ouvert && (
        <div style={{ marginTop: 14, borderTop: "1px solid #ECE8DC", paddingTop: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {lignesFusionnees.map((l) => (
              <div key={l.nom} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>{l.qte}× {l.nom}</span>
                <span style={{ color: "#6B7168" }}>{l.montantConnu != null ? `${l.montantConnu.toLocaleString("fr-FR")} ${currency}` : "—"}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder={`Montant reçu (${currency})`} type="number" value={montant} onChange={(e) => setMontant(e.target.value)} style={{ ...S.champ, flex: 1 }} />
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...S.champ, background: "white" }}>
              <option value="cash">Cash</option>
              <option value="orange_money">Orange Money</option>
              <option value="wave">Wave</option>
              <option value="mtn_money">MTN Money</option>
              <option value="moov_money">Moov Money</option>
            </select>
          </div>
          <button onClick={ajouterPaiement} disabled={enCours || !montant || Number(montant) <= 0} style={{ ...S.bouton, width: "100%", marginBottom: 10, opacity: enCours ? 0.6 : 1 }}>
            💵 Enregistrer ce paiement
          </button>
          <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 12 }}>Pour plusieurs personnes qui paient séparément, enregistre un paiement à chaque fois (montant + mode).</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input placeholder={`Pourboire (${currency}, optionnel)`} type="number" value={pourboire} onChange={(e) => setPourboire(e.target.value)} style={{ ...S.champ, flex: 1 }} />
            <button onClick={enregistrerPourboire} disabled={!pourboire || Number(pourboire) <= 0} style={S.boutonClair}>Ajouter</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => imprimerAddition(table, lignesFusionnees, total, dejaPaye, reste, Number(pourboire) || 0, workspace.name, currency)}
              style={{ ...S.boutonClair, flex: 1 }}
            >
              🖨️ Imprimer l'addition
            </button>
            <button onClick={encaisserEtLiberer} disabled={enCours} style={{ ...S.bouton, flex: 1, background: reste > 0 ? "#e8920a" : "#1a7a3c" }}>
              {reste > 0 ? "⚠️ Encaisser et libérer" : "✅ Encaisser et libérer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RapportsRapides({ commandes, currency }) {
  const rapport = useMemo(() => {
    const auj = commandes.filter((c) => estAujourdhui(c.created_at) && c.statut !== "annulee" && c.statut !== "echouee");

    const parPlat = {};
    auj.forEach((c) => decouperProduit(c.produit).forEach(({ nom, qte }) => { parPlat[nom] = (parPlat[nom] || 0) + qte; }));
    const topPlats = Object.entries(parPlat).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const parHeure = {};
    auj.forEach((c) => { const h = new Date(c.created_at).getHours(); parHeure[h] = (parHeure[h] || 0) + 1; });
    const heuresDePointe = Object.entries(parHeure).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => ({ heure: `${h}h`, n }));

    const parType = { sur_place: 0, emporter: 0, livraison: 0 };
    auj.forEach((c) => { if (parType[c.type_commande] !== undefined) parType[c.type_commande] += Number(c.montant); });

    return { topPlats, heuresDePointe, parType, nbCommandesAuj: auj.length };
  }, [commandes]);

  if (rapport.nbCommandesAuj === 0) return null;

  return (
    <div style={{ ...S.carte, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>📊 Aujourd'hui</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Plats les plus vendus</div>
          {rapport.topPlats.length === 0 ? <div style={{ fontSize: 12, color: "#8A9089" }}>—</div> : rapport.topPlats.map(([nom, n]) => (
            <div key={nom} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}><span>{nom}</span><span style={{ fontWeight: 700 }}>{n}</span></div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Heures de pointe</div>
          {rapport.heuresDePointe.length === 0 ? <div style={{ fontSize: 12, color: "#8A9089" }}>—</div> : rapport.heuresDePointe.map((h) => (
            <div key={h.heure} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}><span>{h.heure}</span><span style={{ fontWeight: 700 }}>{h.n} commande{h.n > 1 ? "s" : ""}</span></div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Commandé aujourd'hui par type</div>
          <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}><span>🍽️ Sur place</span><span style={{ fontWeight: 700 }}>{rapport.parType.sur_place.toLocaleString("fr-FR")} {currency}</span></div>
          <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}><span>🥡 Emporter</span><span style={{ fontWeight: 700 }}>{rapport.parType.emporter.toLocaleString("fr-FR")} {currency}</span></div>
          <div style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between" }}><span>🚚 Livraison</span><span style={{ fontWeight: 700 }}>{rapport.parType.livraison.toLocaleString("fr-FR")} {currency}</span></div>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantPlus({ workspace, commandes = [], tablesRestaurant = [], plats = [], confirmateurNom, currency, onRefresh }) {
  const commandesOuvertesParTable = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.table_id || c.statut === "annulee") return;
      const reste = Number(c.montant) - Number(c.montant_paye || 0);
      if (reste <= 0) return;
      if (!map[c.table_id]) map[c.table_id] = [];
      map[c.table_id].push(c);
    });
    return map;
  }, [commandes]);

  const tablesAvecActivite = tablesRestaurant.filter((t) => t.statut === "occupee" || (commandesOuvertesParTable[t.id] || []).length > 0);

  return (
    <div style={{ padding: "20px 20px 40px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>🧾 Tables & addition</div>

      <RapportsRapides commandes={commandes} currency={currency} />

      {tablesAvecActivite.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucune table occupée pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tablesAvecActivite.map((t) => (
            <PanneauTable
              key={t.id}
              workspace={workspace}
              table={t}
              commandesOuvertes={commandesOuvertesParTable[t.id] || []}
              plats={plats}
              currency={currency}
              confirmateurNom={confirmateurNom}
              onRefresh={onRefresh}
              role={workspace.role}
            />
          ))}
        </div>
      )}
    </div>
  );
}
