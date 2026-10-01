import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const TYPES = [
  ["file","Fichier"],["ebook","Ebook / PDF"],["course","Formation"],["video","Vidéo"],
  ["audio","Audio"],["bundle","Bundle"],["license","Licence"],["coaching","Coaching"],["subscription","Abonnement"]
];

const S = {
  page:{minHeight:"100vh",background:"#FAFAF7",color:"#16231F",fontFamily:"inherit",padding:"28px 18px"},
  wrap:{maxWidth:1100,margin:"0 auto"},
  card:{background:"#fff",border:"1px solid #ECE8DC",borderRadius:16,padding:18,boxShadow:"0 8px 28px rgba(20,30,20,.05)"},
  input:{width:"100%",boxSizing:"border-box",padding:"10px 11px",border:"1px solid #DDD8CC",borderRadius:9,fontSize:14,background:"#fff"},
  btn:{border:"1px solid #DDD8CC",background:"#fff",borderRadius:9,padding:"9px 13px",fontWeight:700,cursor:"pointer"},
  primary:{background:"#1a7a3c",borderColor:"#1a7a3c",color:"#fff"},
};

function slugify(v){return String(v||"produit").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70)||"produit";}
function money(v,c){return new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(Number(v)||0)+" "+(c||"XOF");}

export default function DigitalCommerce({ workspaceId=null, publicProductId=null }) {
  const [workspace,setWorkspace]=useState(null);
  const [products,setProducts]=useState([]);
  const [product,setProduct]=useState(null);
  const [files,setFiles]=useState([]);
  const [lessons,setLessons]=useState([]);
  const [orders,setOrders]=useState([]);
  const [session,setSession]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [form,setForm]=useState({name:"",description:"",product_type:"file",price:"0",currency:"XOF",published:false});
  const [customer,setCustomer]=useState({name:"",email:"",phone:""});

  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session||null));},[]);

  useEffect(()=>{
    (async()=>{
      let wsId=workspaceId;
      if(!wsId){
        const {data:{user}}=await supabase.auth.getUser();
        if(!user)return;
        const {data}=await supabase.from("workspaces").select("id,name,currency,slug").eq("owner_id",user.id).order("created_at",{ascending:true}).limit(1).maybeSingle();
        if(data){wsId=data.id;setWorkspace(data);}
      }else{
        const {data}=await supabase.from("workspaces").select("id,name,currency,slug").eq("id",wsId).maybeSingle();
        setWorkspace(data);
      }
      if(wsId){
        const {data}=await supabase.from("digital_products").select("*").eq("workspace_id",wsId).order("created_at",{ascending:false});
        setProducts(data||[]);
        const {data:o}=await supabase.from("digital_orders").select("*,digital_products(name)").eq("workspace_id",wsId).order("created_at",{ascending:false}).limit(100);
        setOrders(o||[]);
      }
    })();
  },[workspaceId]);

  useEffect(()=>{
    if(!publicProductId)return;
    (async()=>{
      const {data:p}=await supabase.from("digital_products").select("*").eq("id",publicProductId).eq("published",true).maybeSingle();
      if(!p)return setMessage("Produit numérique introuvable.");
      setProduct(p);setForm(p);
      const [{data:f},{data:l}]=await Promise.all([
        supabase.from("digital_files").select("*").eq("product_id",p.id).order("created_at"),
        supabase.from("digital_lessons").select("*").eq("product_id",p.id).order("position")
      ]);
      setFiles(f||[]);setLessons(l||[]);
    })();
  },[publicProductId]);

  const selectedType=useMemo(()=>TYPES.find(x=>x[0]===form.product_type)?.[1]||"Produit numérique",[form.product_type]);

  async function saveProduct(){
    if(!workspace?.id || !form.name.trim())return;
    setBusy(true);setMessage("");
    const payload={workspace_id:workspace.id,name:form.name.trim(),slug:slugify(form.slug||form.name),description:form.description||"",product_type:form.product_type,price:Number(form.price)||0,currency:form.currency||workspace.currency||"XOF",published:!!form.published};
    const q=product
      ? supabase.from("digital_products").update(payload).eq("id",product.id).eq("workspace_id",workspace.id).select().single()
      : supabase.from("digital_products").insert(payload).select().single();
    const {data,error}=await q;
    if(error)setMessage(error.message);
    else{setProduct(data);setProducts(p=>[data,...p.filter(x=>x.id!==data.id)]);setMessage("Produit numérique enregistré.");}
    setBusy(false);
  }

  async function selectProduct(p){
    setProduct(p);setForm(p);setMessage("");
    const [{data:f},{data:l}]=await Promise.all([
      supabase.from("digital_files").select("*").eq("product_id",p.id).order("created_at"),
      supabase.from("digital_lessons").select("*").eq("product_id",p.id).order("position")
    ]);
    setFiles(f||[]);setLessons(l||[]);
  }

  async function uploadFile(e){
    const f=e.target.files?.[0];e.target.value="";if(!f||!product||!workspace)return;
    setBusy(true);setMessage("");
    const path=workspace.id+"/"+product.id+"/"+Date.now()+"-"+slugify(f.name);
    const {error}=await supabase.storage.from("digital-products").upload(path,f,{upsert:false,contentType:f.type||"application/octet-stream"});
    if(error){setMessage(error.message);setBusy(false);return;}
    const {data,rowError}=await supabase.from("digital_files").insert({workspace_id:workspace.id,product_id:product.id,file_name:f.name,storage_path:path,mime_type:f.type,size_bytes:f.size}).select().single();
    if(rowError)setMessage(rowError.message);else setFiles(x=>[...x,data]);
    setBusy(false);
  }

  async function addLesson(){
    if(!product||!workspace)return;
    const {data,error}=await supabase.from("digital_lessons").insert({workspace_id:workspace.id,product_id:product.id,position:lessons.length,title:"Nouvelle leçon",description:"",video_url:""}).select().single();
    if(error)setMessage(error.message);else setLessons(x=>[...x,data]);
  }

  async function updateLesson(l,patch){
    const {data,error}=await supabase.from("digital_lessons").update(patch).eq("id",l.id).select().single();
    if(!error)setLessons(x=>x.map(i=>i.id===l.id?data:i));else setMessage(error.message);
  }

  async function createOrder(){
    if(!product)return;
    setBusy(true);setMessage("");
    const {data,error}=await supabase.from("digital_orders").insert({
      workspace_id:product.workspace_id,product_id:product.id,customer_name:customer.name.trim(),customer_email:customer.email.trim(),customer_phone:customer.phone.trim()||null,amount:Number(product.price),currency:product.currency,status:"pending"
    }).select("id,access_token").single();
    if(error)setMessage(error.message);
    else setMessage("Commande enregistrée. Le vendeur doit confirmer le paiement avant l'accès. Référence : "+data.id);
    setBusy(false);
  }

  async function markPaid(id){
    if(!session)return;
    const {error}=await supabase.from("digital_orders").update({status:"paid",paid_at:new Date().toISOString()}).eq("id",id);
    if(error)setMessage(error.message);
    else setOrders(x=>x.map(o=>o.id===id?{...o,status:"paid",paid_at:new Date().toISOString()}:o));
  }

  if(publicProductId){
    if(!product)return <div style={S.page}><div style={S.wrap}>{message||"Chargement…"}</div></div>;
    return <div style={S.page}><div style={S.wrap}>
      <div style={{...S.card,maxWidth:760,margin:"20px auto"}}>
        {product.cover_url&&<img src={product.cover_url} alt="" style={{width:"100%",maxHeight:360,objectFit:"cover",borderRadius:12}}/>}
        <div style={{fontSize:12,fontWeight:800,color:"#1a7a3c",marginTop:18}}>{selectedType.toUpperCase()}</div>
        <h1 style={{fontSize:34,margin:"8px 0"}}>{product.name}</h1>
        <div style={{fontSize:22,fontWeight:900}}>{money(product.price,product.currency)}</div>
        <p style={{lineHeight:1.7,color:"#59615A",whiteSpace:"pre-wrap"}}>{product.description}</p>
        {lessons.length>0&&<div style={{marginTop:24}}><h2>Contenu de la formation</h2>{lessons.map((l,i)=><div key={l.id} style={{padding:"12px 0",borderBottom:"1px solid #eee"}}><b>{i+1}. {l.title}</b><div style={{color:"#687069",fontSize:13}}>{l.description}</div></div>)}</div>}
        <div style={{marginTop:26,paddingTop:20,borderTop:"1px solid #eee"}}>
          <h2>Obtenir ce produit</h2>
          <input style={{...S.input,marginBottom:8}} placeholder="Nom" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/>
          <input style={{...S.input,marginBottom:8}} placeholder="Email" type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/>
          <input style={{...S.input,marginBottom:10}} placeholder="Téléphone (facultatif)" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/>
          <button style={{...S.btn,...S.primary,width:"100%"}} disabled={busy||!customer.name||!customer.email} onClick={createOrder}>{busy?"Enregistrement…":"Commander — "+money(product.price,product.currency)}</button>
          {message&&<div style={{marginTop:10,fontSize:13}}>{message}</div>}
        </div>
      </div>
    </div></div>;
  }

  if(!session)return <div style={S.page}><div style={{...S.wrap,...S.card}}><h1>Produits numériques</h1><p>Connecte-toi à RecuVente pour gérer tes produits numériques.</p></div></div>;

  return <div style={S.page}><div style={S.wrap}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:18,flexWrap:"wrap"}}>
      <div><div style={{fontSize:12,fontWeight:800,color:"#1a7a3c"}}>RECUVENTE DIGITAL COMMERCE</div><h1 style={{margin:"4px 0"}}>Produits numériques</h1><div style={{color:"#687069"}}>{workspace?.name||""}</div></div>
      <button style={{...S.btn,...S.primary}} onClick={()=>{setProduct(null);setForm({name:"",description:"",product_type:"file",price:"0",currency:workspace?.currency||"XOF",published:false});setFiles([]);setLessons([]);}}>+ Nouveau produit</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(240px,.8fr) minmax(320px,1.4fr)",gap:18,alignItems:"start"}}>
      <div style={S.card}><h3>Catalogue</h3>{products.length===0&&<p style={{color:"#687069"}}>Aucun produit numérique.</p>}{products.map(p=><button key={p.id} onClick={()=>selectProduct(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"12px 8px",border:0,borderBottom:"1px solid #eee",background:product?.id===p.id?"#F1F7F0":"#fff",cursor:"pointer"}}><b>{p.name}</b><div style={{fontSize:12,color:"#687069"}}>{TYPES.find(x=>x[0]===p.product_type)?.[1]} · {money(p.price,p.currency)} · {p.published?"Publié":"Brouillon"}</div></button>)}</div>
      <div style={S.card}>
        <h3>{product?"Modifier le produit":"Créer un produit numérique"}</h3>
        <input style={{...S.input,marginBottom:8}} placeholder="Nom du produit" value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/>
        <select style={{...S.input,marginBottom:8}} value={form.product_type} onChange={e=>setForm({...form,product_type:e.target.value})}>{TYPES.map(t=><option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
        <div style={{display:"grid",gridTemplateColumns:"1fr 130px",gap:8}}><input style={S.input} type="number" min="0" value={form.price??0} onChange={e=>setForm({...form,price:e.target.value})}/><input style={S.input} value={form.currency||"XOF"} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></div>
        <textarea style={{...S.input,minHeight:120,marginTop:8}} placeholder="Description, promesse, contenu…" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/>
        <label style={{display:"flex",gap:8,alignItems:"center",margin:"12px 0"}}><input type="checkbox" checked={!!form.published} onChange={e=>setForm({...form,published:e.target.checked})}/> Publier immédiatement</label>
        <button style={{...S.btn,...S.primary}} disabled={busy||!form.name.trim()} onClick={saveProduct}>{busy?"Enregistrement…":"Enregistrer"}</button>
        {product&&<><h3 style={{marginTop:28}}>Fichiers privés</h3><input type="file" onChange={uploadFile} disabled={busy}/>{files.map(f=><div key={f.id} style={{fontSize:13,padding:"8px 0",borderBottom:"1px solid #eee"}}>📎 {f.file_name}</div>)}
        {product.product_type==="course"&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24}}><h3>Leçons</h3><button style={S.btn} onClick={addLesson}>+ Leçon</button></div>{lessons.map(l=><div key={l.id} style={{border:"1px solid #eee",borderRadius:10,padding:10,marginTop:8}}><input style={{...S.input,marginBottom:6}} value={l.title} onChange={e=>updateLesson(l,{title:e.target.value})}/><textarea style={{...S.input,minHeight:60,marginBottom:6}} value={l.description||""} onChange={e=>updateLesson(l,{description:e.target.value})}/><input style={S.input} placeholder="URL vidéo (facultatif)" value={l.video_url||""} onChange={e=>updateLesson(l,{video_url:e.target.value})}/></div>)}</>}
        <div style={{marginTop:18,paddingTop:18,borderTop:"1px solid #eee"}}><b>Lien public</b><div style={{fontSize:12,wordBreak:"break-all",marginTop:6}}>{window.location.origin}/?digital_product={product.id}</div></div></>}
        {message&&<div style={{marginTop:12,fontSize:13}}>{message}</div>}
      </div>
    </div>
    <div style={{...S.card,marginTop:18}}><h3>Commandes numériques</h3>{orders.length===0?<div style={{color:"#687069"}}>Aucune commande.</div>:orders.map(o=><div key={o.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid #eee",flexWrap:"wrap"}}><div><b>{o.digital_products?.name||"Produit"}</b><div style={{fontSize:12,color:"#687069"}}>{o.customer_name} · {o.customer_email} · {money(o.amount,o.currency)}</div></div>{o.status==="paid"?<span style={{fontWeight:800,color:"#1a7a3c"}}>PAYÉ</span>:<button style={{...S.btn,...S.primary}} onClick={()=>markPaid(o.id)}>Marquer payé</button>}</div>)}</div>
  </div></div>;
}
