import React,{useState} from "react";

export default function DigitalAccess(){
  const [token,setToken]=useState("");
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function open(){
    setBusy(true);setError("");setData(null);
    try{
      const base=import.meta.env.VITE_SUPABASE_URL;
      const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
      const r=await fetch(base+"/functions/v1/digital-download",{method:"POST",headers:{"Content-Type":"application/json","apikey":key},body:JSON.stringify({access_token:token.trim()})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Accès refusé");
      setData(j);
    }catch(e){setError(e.message||"Erreur");}
    setBusy(false);
  }
  return <div style={{minHeight:"100vh",background:"#FAFAF7",fontFamily:"inherit",padding:"40px 18px",color:"#16231F"}}>
    <div style={{maxWidth:760,margin:"0 auto",background:"#fff",border:"1px solid #ECE8DC",borderRadius:16,padding:24}}>
      <div style={{fontSize:12,fontWeight:800,color:"#1a7a3c"}}>RECUVENTE DIGITAL</div>
      <h1>Mon espace de contenu</h1>
      <p>Colle ici le code d'accès reçu après confirmation de ton paiement.</p>
      <div style={{display:"flex",gap:8}}><input value={token} onChange={e=>setToken(e.target.value)} placeholder="Code d'accès" style={{flex:1,padding:11,border:"1px solid #DDD8CC",borderRadius:9}}/><button onClick={open} disabled={busy||!token} style={{padding:"11px 15px",border:0,borderRadius:9,background:"#1a7a3c",color:"#fff",fontWeight:800}}>{busy?"…":"Accéder"}</button></div>
      {error&&<div style={{marginTop:14,color:"#B33A2A"}}>{error}</div>}
      {data&&<div style={{marginTop:24}}><h2>{data.product?.name}</h2>{data.lessons?.map(l=><div key={l.id} style={{padding:"12px 0",borderBottom:"1px solid #eee"}}><b>{l.title}</b><p>{l.description}</p>{l.video_url&&<a href={l.video_url} target="_blank" rel="noreferrer">▶ Ouvrir la vidéo</a>}</div>)}<h3>Fichiers</h3>{data.files?.map(f=><div key={f.id} style={{padding:"10px 0"}}><a href={f.signed_url} target="_blank" rel="noreferrer" download>{f.file_name}</a></div>)}</div>}
    </div>
  </div>
}
