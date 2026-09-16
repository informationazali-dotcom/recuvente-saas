import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const money = (n) => `${Number(n || 0).toLocaleString("fr-FR")} F CFA`;
const pct = (n) => `${Number(n || 0).toFixed(1)} %`;
const num = (n) => Number(n || 0).toLocaleString("fr-FR");

const DIMENSIONS = [
  ["campagne", "Campagnes"],
  ["adset", "Ensembles publicitaires"],
  ["creative", "Créatifs"],
  ["produit", "Produits"],
  ["ville", "Villes"],
  ["zone", "Zones"],
  ["closer", "Closers"],
  ["livreur", "Livreurs"],
  ["type_client", "Nouveaux / anciens"],
  ["global", "Vue globale"],
];

export default function MarketingCODDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [days, setDays] = useState(30);
  const [dimension, setDimension] = useState("campagne");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (alive) { setError("Connecte-toi à RecuVente pour voir ce rapport."); setLoading(false); }
        return;
      }
      const { data: memberships, error: mErr } = await supabase
        .from("workspace_members")
        .select("workspace_id,role")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"]);
      if (mErr || !memberships?.length) {
        if (alive) { setError("Aucun espace administrateur accessible."); setLoading(false); }
        return;
      }
      if (alive) setWorkspaceId(memberships[0].workspace_id);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError("");
      const from = new Date(Date.now() - days * 86400000).toISOString();
      const to = new Date().toISOString();
      const { data, error: e } = await supabase.rpc("rapport_pilotage_cod", {
        p_workspace_id: workspaceId,
        p_from: from,
        p_to: to,
        p_dimension: dimension,
      });
      if (!alive) return;
      if (e) setError(e.message || "Impossible de charger le pilotage COD.");
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workspaceId, days, dimension]);

  const totals = useMemo(() => rows.reduce((a, r) => {
    for (const k of ["sessions","visiteurs","commandes","confirmees","livrees","encaissees"]) a[k] += Number(r[k] || 0);
    for (const k of ["ca_commande","ca_confirme","ca_livre","ca_encaisse","cout_produits","cout_livraison","cout_retour","commissions","autres_couts","couts_publicitaires","benefice_net"]) a[k] += Number(r[k] || 0);
    return a;
  }, {sessions:0,visiteurs:0,commandes:0,confirmees:0,livrees:0,encaissees:0,ca_commande:0,ca_confirme:0,ca_livre:0,ca_encaisse:0,cout_produits:0,cout_livraison:0,cout_retour:0,commissions:0,autres_couts:0,couts_publicitaires:0,benefice_net:0}), [rows]);

  const rate = (a,b) => b ? a / b * 100 : 0;
  const roas = totals.couts_publicitaires ? totals.ca_encaisse / totals.couts_publicitaires : 0;
  const cpa = totals.encaissees ? totals.couts_publicitaires / totals.encaissees : 0;
  const margin = totals.ca_encaisse ? totals.benefice_net / totals.ca_encaisse * 100 : 0;

  const cards = [
    ["Commandes", num(totals.commandes), "Créées"],
    ["Confirmées", num(totals.confirmees), pct(rate(totals.confirmees, totals.commandes))],
    ["Livrées", num(totals.livrees), pct(rate(totals.livrees, totals.commandes))],
    ["Encaissées", num(totals.encaissees), pct(rate(totals.encaissees, totals.commandes))],
    ["CA encaissé", money(totals.ca_encaisse), "réel COD"],
    ["Coût publicité", money(totals.couts_publicitaires), "dépenses"],
    ["ROAS encaissé", `${roas.toFixed(2)}x`, "CA / publicité"],
    ["Bénéfice net", money(totals.benefice_net), `${margin.toFixed(1)} % de marge`],
  ];

  return <div style={{minHeight:"100vh",background:"#f7f8f6",padding:"28px",fontFamily:"Inter,system-ui,sans-serif",color:"#172019"}}>
    <div style={{maxWidth:1600,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap",marginBottom:24}}>
        <div>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:1.5,color:"#198754"}}>RECUVENTE INTELLIGENCE</div>
          <h1 style={{margin:"5px 0",fontSize:30}}>Pilotage COD & Rentabilité</h1>
          <div style={{color:"#69736b"}}>Publicité → commande → confirmation → livraison → encaissement → bénéfice.</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{padding:10,borderRadius:10,border:"1px solid #d9ded9",background:"white"}}>
            <option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={180}>180 jours</option>
          </select>
          <select value={dimension} onChange={e=>setDimension(e.target.value)} style={{padding:10,borderRadius:10,border:"1px solid #d9ded9",background:"white"}}>
            {DIMENSIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{padding:14,borderRadius:12,background:"#fff1f0",color:"#a22",marginBottom:18}}>{error}</div>}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:20}}>
        {cards.map(([label,value,sub])=><div key={label} style={{background:"white",border:"1px solid #e2e7e2",borderRadius:14,padding:16}}>
          <div style={{fontSize:12,color:"#707970"}}>{label}</div><div style={{fontSize:21,fontWeight:800,marginTop:6}}>{value}</div><div style={{fontSize:11,color:"#8a928c",marginTop:4}}>{sub}</div>
        </div>)}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:20}}>
        {[["Coût produits",totals.cout_produits],["Livraison",totals.cout_livraison],["Retours",totals.cout_retour],["Commissions",totals.commissions],["Autres coûts",totals.autres_couts]].map(([label,value])=><div key={label} style={{background:"#fff",border:"1px solid #e2e7e2",borderRadius:12,padding:13}}><div style={{fontSize:11,color:"#69736b"}}>{label}</div><strong>{money(value)}</strong></div>)}
        <div style={{background:"#edf8f1",border:"1px solid #d5ebdc",borderRadius:12,padding:13}}><div style={{fontSize:11,color:"#497058"}}>CPA encaissé</div><strong>{money(cpa)}</strong></div>
      </div>

      <div style={{background:"white",border:"1px solid #e2e7e2",borderRadius:16,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1900}}>
          <thead><tr>{["Dimension","Source","Campagne","Adset","Créatif","Commandes","Confirm.","Livrées","Encaissées","CA encaissé","Produits","Livraison","Retours","Commissions","Pub","Bénéfice net","Marge","CPA","ROAS"].map(h=><th key={h} style={{textAlign:"left",padding:"13px 10px",fontSize:11,color:"#69736b",borderBottom:"1px solid #e7ebe7",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="19" style={{padding:30,textAlign:"center"}}>Analyse en cours…</td></tr> : rows.map((r,i)=>{
              const key = dimension === "campagne" ? r.campagne : dimension === "adset" ? r.adset : dimension === "creative" ? r.creative : dimension === "produit" ? r.produit : dimension === "ville" ? r.ville : dimension === "zone" ? r.zone : dimension === "closer" ? r.closer : dimension === "livreur" ? r.livreur : dimension === "type_client" ? r.type_client : "Global";
              const rowMargin = Number(r.ca_encaisse||0) ? Number(r.benefice_net||0)/Number(r.ca_encaisse||0)*100 : 0;
              const rowCpa = Number(r.encaissees||0) ? Number(r.couts_publicitaires||0)/Number(r.encaissees||0) : 0;
              const rowRoas = Number(r.couts_publicitaires||0) ? Number(r.ca_encaisse||0)/Number(r.couts_publicitaires||0) : 0;
              return <tr key={`${key}-${r.source}-${i}`}>
                {[key,r.source||"direct",r.campagne||"—",r.adset||"—",r.creative||"—",num(r.commandes),num(r.confirmees),num(r.livrees),num(r.encaissees),money(r.ca_encaisse),money(r.cout_produits),money(r.cout_livraison),money(r.cout_retour),money(r.commissions),money(r.couts_publicitaires),money(r.benefice_net),pct(rowMargin),money(rowCpa),`${rowRoas.toFixed(2)}x`].map((v,j)=><td key={j} style={{padding:"12px 10px",fontSize:12,borderBottom:"1px solid #f0f2f0",whiteSpace:"nowrap",fontWeight:[0,9,15,16,18].includes(j)?700:400}}>{v}</td>)}
              </tr>;
            })}
            {!loading && !rows.length && <tr><td colSpan="19" style={{padding:30,textAlign:"center",color:"#69736b"}}>Aucune donnée sur cette période.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:18,padding:16,borderRadius:14,background:"#edf8f1",color:"#245a38",fontSize:13}}>
        <strong>Le moteur COD ne considère pas une commande comme une vente finale.</strong> Il mesure séparément commande, confirmation, livraison et encaissement, puis retire coût produit, publicité, livraison, retours, commissions et autres coûts pour calculer le bénéfice net.
      </div>
    </div>
  </div>;
}
