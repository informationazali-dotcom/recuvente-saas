import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const money = (n) => `${Number(n || 0).toLocaleString("fr-FR")} F CFA`;
const pct = (n) => `${Number(n || 0).toFixed(1)} %`;

export default function MarketingCODDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [days, setDays] = useState(30);
  const [model, setModel] = useState("last_non_direct");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) { setError("Connecte-toi à RecuVente pour voir ce rapport."); setLoading(false); } return; }
      const { data: memberships, error: mErr } = await supabase.from("workspace_members").select("workspace_id,role").eq("user_id", user.id).in("role", ["owner", "admin"]);
      if (mErr || !memberships?.length) { if (alive) { setError("Aucun espace administrateur accessible."); setLoading(false); } return; }
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
      const { data, error: e } = await supabase.rpc("rapport_marketing_cod", { p_workspace_id: workspaceId, p_from: from, p_to: to, p_model: model });
      if (!alive) return;
      if (e) setError(e.message || "Impossible de charger le rapport.");
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workspaceId, days, model]);

  const totals = useMemo(() => rows.reduce((a, r) => {
    for (const k of ["sessions","visitors","view_content","add_to_cart","initiate_checkout","orders","confirmed_orders","delivered_orders","collected_orders"]) a[k] += Number(r[k] || 0);
    for (const k of ["order_value","collected_revenue","ad_spend"]) a[k] += Number(r[k] || 0);
    return a;
  }, {sessions:0,visitors:0,view_content:0,add_to_cart:0,initiate_checkout:0,orders:0,confirmed_orders:0,delivered_orders:0,collected_orders:0,order_value:0,collected_revenue:0,ad_spend:0}), [rows]);

  const cards = [
    ["Sessions", totals.sessions], ["Commandes", totals.orders], ["Confirmées", totals.confirmed_orders], ["Livrées", totals.delivered_orders], ["Encaissées", totals.collected_orders], ["CA encaissé", money(totals.collected_revenue)], ["Dépenses pub", money(totals.ad_spend)], ["ROAS encaissé", totals.ad_spend ? `${(totals.collected_revenue / totals.ad_spend).toFixed(2)}x` : "—"]
  ];

  return <div style={{minHeight:"100vh",background:"#f7f8f6",padding:"28px",fontFamily:"Inter,system-ui,sans-serif",color:"#172019"}}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap",marginBottom:24}}>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.5,color:"#198754"}}>RECUVENTE ANALYTICS</div><h1 style={{margin:"5px 0",fontSize:30}}>Marketing COD</h1><div style={{color:"#69736b"}}>De la publicité jusqu'à l'argent réellement encaissé.</div></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><select value={days} onChange={e=>setDays(Number(e.target.value))} style={{padding:10,borderRadius:10,border:"1px solid #d9ded9",background:"white"}}><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option></select><select value={model} onChange={e=>setModel(e.target.value)} style={{padding:10,borderRadius:10,border:"1px solid #d9ded9",background:"white"}}><option value="last_non_direct">Dernier clic non direct</option><option value="last">Dernier clic</option><option value="first">Premier clic</option></select></div>
      </div>
      {error && <div style={{padding:14,borderRadius:12,background:"#fff1f0",color:"#a22",marginBottom:18}}>{error}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>{cards.map(([label,value])=><div key={label} style={{background:"white",border:"1px solid #e2e7e2",borderRadius:14,padding:16}}><div style={{fontSize:12,color:"#707970"}}>{label}</div><div style={{fontSize:22,fontWeight:800,marginTop:6}}>{value}</div></div>)}</div>
      <div style={{background:"white",border:"1px solid #e2e7e2",borderRadius:16,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1450}}><thead><tr>{["Source","Campagne","Sessions","Vue produit","Panier","Checkout","Commandes","Confirmées","Livrées","Encaissées","CA encaissé","Pub","Conv.","Confirm.","Livraison","Encaissement","ROAS"].map(h=><th key={h} style={{textAlign:"left",padding:"13px 10px",fontSize:11,color:"#69736b",borderBottom:"1px solid #e7ebe7",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan="17" style={{padding:30,textAlign:"center"}}>Chargement…</td></tr> : rows.filter(r=>Number(r.sessions||0)+Number(r.orders||0)+Number(r.collected_orders||0)>0).sort((a,b)=>Number(b.collected_revenue||0)-Number(a.collected_revenue||0)).map((r,i)=><tr key={`${r.source}-${r.campaign}-${i}`}>{[r.source||"direct",r.campaign||"—",r.sessions,r.view_content,r.add_to_cart,r.initiate_checkout,r.orders,r.confirmed_orders,r.delivered_orders,r.collected_orders,money(r.collected_revenue),money(r.ad_spend),pct(r.conversion_rate),pct(r.confirmation_rate),pct(r.delivery_rate),pct(r.collection_rate),r.roas_collected==null?"—":`${Number(r.roas_collected).toFixed(2)}x`].map((v,j)=><td key={j} style={{padding:"12px 10px",fontSize:12,borderBottom:"1px solid #f0f2f0",whiteSpace:"nowrap",fontWeight:j===10||j===16?700:400}}>{v}</td>)}</tr>)}{!loading && !rows.length && <tr><td colSpan="17" style={{padding:30,textAlign:"center",color:"#69736b"}}>Aucune donnée sur cette période.</td></tr>}</tbody></table>
      </div>
      <div style={{marginTop:18,padding:16,borderRadius:14,background:"#edf8f1",color:"#245a38",fontSize:13}}><strong>Lecture COD :</strong> la commande créée n'est pas la conversion finale. RecuVente distingue commande, confirmation, livraison et encaissement. Le ROAS affiché ici utilise le chiffre d'affaires réellement encaissé.</div>
    </div>
  </div>;
}
