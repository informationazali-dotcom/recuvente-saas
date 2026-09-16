import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const money = (n) => `${Number(n || 0).toLocaleString("fr-FR")} F CFA`;
const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)} %`;
const num = (n) => Number(n || 0).toLocaleString("fr-FR");

const DIMENSIONS = [
  ["campaign", "Campagne"], ["adset", "Ensemble de publicités"], ["creative", "Créatif"],
  ["product", "Produit"], ["city", "Ville"], ["zone", "Zone"],
  ["closer", "Closer"], ["livreur", "Livreur"], ["customer_type", "Nouveau / ancien"],
];

export default function MarketingCODDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [days, setDays] = useState(30);
  const [model, setModel] = useState("last_non_direct");
  const [dimension, setDimension] = useState("campaign");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) { setError("Connecte-toi à RecuVente pour voir ce rapport."); setLoading(false); } return; }
      const { data, error: e } = await supabase.from("workspace_members").select("workspace_id,role").eq("user_id", user.id).in("role", ["owner", "admin"]);
      if (e || !data?.length) { if (alive) { setError("Aucun espace administrateur accessible."); setLoading(false); } return; }
      if (alive) setWorkspaceId(data[0].workspace_id);
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
      const { data, error: e } = await supabase.rpc("rapport_rentabilite_cod", {
        p_workspace_id: workspaceId, p_from: from, p_to: to, p_model: model, p_dimension: dimension,
      });
      if (!alive) return;
      if (e) setError(e.message || "Impossible de charger le rapport.");
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workspaceId, days, model, dimension]);

  const totals = useMemo(() => rows.reduce((a, r) => {
    ["sessions","visitors","orders","confirmed_orders","delivered_orders","collected_orders","new_customers","returning_customers"].forEach(k => a[k] += Number(r[k] || 0));
    ["order_value","collected_revenue","product_cost","ad_spend","delivery_cost","return_cost","commissions","other_cost","gross_margin","net_profit"].forEach(k => a[k] += Number(r[k] || 0));
    return a;
  }, {sessions:0,visitors:0,orders:0,confirmed_orders:0,delivered_orders:0,collected_orders:0,new_customers:0,returning_customers:0,order_value:0,collected_revenue:0,product_cost:0,ad_spend:0,delivery_cost:0,return_cost:0,commissions:0,other_cost:0,gross_margin:0,net_profit:0}), [rows]);

  const derived = {
    confirmation: totals.orders ? totals.confirmed_orders / totals.orders : 0,
    delivery: totals.confirmed_orders ? totals.delivered_orders / totals.confirmed_orders : 0,
    collection: totals.delivered_orders ? totals.collected_orders / totals.delivered_orders : 0,
    conversion: totals.sessions ? totals.orders / totals.sessions : 0,
    aov: totals.collected_orders ? totals.collected_revenue / totals.collected_orders : 0,
    cpa: totals.collected_orders ? totals.ad_spend / totals.collected_orders : 0,
    roas: totals.ad_spend ? totals.collected_revenue / totals.ad_spend : null,
  };

  const cards = [
    ["Sessions", num(totals.sessions)], ["Commandes", num(totals.orders)], ["Confirmées", num(totals.confirmed_orders)],
    ["Livrées", num(totals.delivered_orders)], ["Encaissées", num(totals.collected_orders)],
    ["CA encaissé", money(totals.collected_revenue)], ["Bénéfice net", money(totals.net_profit)],
    ["ROAS encaissé", derived.roas == null ? "—" : `${derived.roas.toFixed(2)}x`],
  ];

  const costLine = totals.product_cost + totals.ad_spend + totals.delivery_cost + totals.return_cost + totals.commissions + totals.other_cost;

  return <div style={{minHeight:"100vh",background:"#f5f7f5",padding:"28px",fontFamily:"Inter,system-ui,sans-serif",color:"#172019"}}>
    <div style={{maxWidth:1600,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap",marginBottom:22}}>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.5,color:"#198754"}}>RECUVENTE INTELLIGENCE</div><h1 style={{margin:"5px 0",fontSize:30}}>Pilotage Marketing COD</h1><div style={{color:"#69736b"}}>Publicité → commande → confirmation → livraison → encaissement → bénéfice net.</div></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={select}><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={180}>180 jours</option></select>
          <select value={model} onChange={e=>setModel(e.target.value)} style={select}><option value="last_non_direct">Dernier clic non direct</option><option value="last">Dernier clic</option><option value="first">Premier clic</option></select>
          <select value={dimension} onChange={e=>setDimension(e.target.value)} style={select}>{DIMENSIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>

      {error && <div style={{padding:14,borderRadius:12,background:"#fff1f0",color:"#a22",marginBottom:18}}>{error}</div>}

      <div style={grid}>{cards.map(([label,value])=><div key={label} style={card}><div style={labelStyle}>{label}</div><div style={valueStyle}>{value}</div></div>)}</div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:20}}>
        <Metric title="Taux de conversion" value={pct(derived.conversion)} />
        <Metric title="Taux de confirmation" value={pct(derived.confirmation)} />
        <Metric title="Taux de livraison" value={pct(derived.delivery)} />
        <Metric title="Taux d'encaissement" value={pct(derived.collection)} />
        <Metric title="Panier moyen encaissé" value={money(derived.aov)} />
        <Metric title="CPA réellement encaissé" value={money(derived.cpa)} />
        <Metric title="Nouveaux clients" value={num(totals.new_customers)} />
        <Metric title="Clients récurrents" value={num(totals.returning_customers)} />
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:20}}>
        <Metric title="Coût produit" value={money(totals.product_cost)} />
        <Metric title="Coût publicitaire" value={money(totals.ad_spend)} />
        <Metric title="Coût livraison" value={money(totals.delivery_cost)} />
        <Metric title="Coût retours" value={money(totals.return_cost)} />
        <Metric title="Commissions" value={money(totals.commissions)} />
        <Metric title="Autres coûts" value={money(totals.other_cost)} />
        <Metric title="Marge brute" value={money(totals.gross_margin)} />
        <Metric title="Total coûts déduits" value={money(costLine)} />
      </div>

      <div style={{background:"white",border:"1px solid #e0e6e0",borderRadius:16,overflow:"auto",boxShadow:"0 6px 24px rgba(20,40,25,.04)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1850}}>
          <thead><tr>{["Dimension","Campagne","Produit","Ville","Closer","Livreur","Commandes","Confirm.","Livrées","Encaissées","CA encaissé","Coût produit","Pub","Livraison","Retours","Commissions","Bénéfice net","CPA encaissé","ROAS","Conv.","Encaissement"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="21" style={empty}>Chargement de l'intelligence COD…</td></tr> : rows.map((r,i)=><tr key={`${r.dimension}-${r.campaign}-${i}`}>
              <td style={tdStrong}>{r.dimension || "—"}</td><td style={td}>{r.campaign || "—"}</td><td style={td}>{r.product || "—"}</td><td style={td}>{r.city || "—"}</td><td style={td}>{r.closer || "—"}</td><td style={td}>{r.livreur || "—"}</td>
              <td style={td}>{num(r.orders)}</td><td style={td}>{num(r.confirmed_orders)}</td><td style={td}>{num(r.delivered_orders)}</td><td style={td}>{num(r.collected_orders)}</td>
              <td style={tdStrong}>{money(r.collected_revenue)}</td><td style={td}>{money(r.product_cost)}</td><td style={td}>{money(r.ad_spend)}</td><td style={td}>{money(r.delivery_cost)}</td><td style={td}>{money(r.return_cost)}</td><td style={td}>{money(r.commissions)}</td>
              <td style={{...tdStrong,color:Number(r.net_profit||0)>=0?"#176b3a":"#b42318"}}>{money(r.net_profit)}</td><td style={td}>{r.cpa_collected?money(r.cpa_collected):"—"}</td><td style={td}>{r.roas_collected==null?"—":`${Number(r.roas_collected).toFixed(2)}x`}</td><td style={td}>{pct(r.conversion_rate)}</td><td style={td}>{pct(r.collection_rate)}</td>
            </tr>)}
            {!loading && !rows.length && <tr><td colSpan="21" style={empty}>Aucune donnée sur cette période.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:18,padding:16,borderRadius:14,background:"#edf8f1",color:"#245a38",fontSize:13}}><strong>Règle RecuVente :</strong> une commande créée n'est pas une vente. La rentabilité est calculée sur l'argent encaissé et déduite des coûts connus. Une dépense ou une allocation non renseignée n'est jamais inventée.</div>
    </div>
  </div>;
}

function Metric({title,value}) { return <div style={card}><div style={labelStyle}>{title}</div><div style={{fontSize:18,fontWeight:800,marginTop:6}}>{value}</div></div>; }
const select={padding:10,borderRadius:10,border:"1px solid #d9ded9",background:"white"};
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:14};
const card={background:"white",border:"1px solid #e0e6e0",borderRadius:14,padding:15};
const labelStyle={fontSize:12,color:"#707970"};
const valueStyle={fontSize:22,fontWeight:800,marginTop:6};
const th={textAlign:"left",padding:"12px 9px",fontSize:10,color:"#69736b",borderBottom:"1px solid #e7ebe7",whiteSpace:"nowrap"};
const td={padding:"11px 9px",fontSize:11,borderBottom:"1px solid #f0f2f0",whiteSpace:"nowrap"};
const tdStrong={...td,fontWeight:750};
const empty={padding:32,textAlign:"center",color:"#69736b"};
