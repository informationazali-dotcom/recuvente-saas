import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient.js";

const sectionLabels = {
  announcement: "Annonce",
  header: "En-tête",
  hero: "Hero / Bannière",
  image_texte: "Image + texte",
  collections: "Collections",
  bestsellers: "Meilleures ventes",
  bundles: "Offres / Bundles",
  products: "Produits",
  benefits: "Avantages",
  testimonials: "Témoignages",
  promo: "Promotion",
  gallery: "Galerie",
  faq: "FAQ",
  whatsapp: "WhatsApp",
  cod_form: "Commande COD",
  delivery: "Livraison",
  contact: "Contact / Footer",
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }

export default function ThemeStudio() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [themes, setThemes] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [selected, setSelected] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setError("Vous devez être connecté pour utiliser Theme Studio."); setLoading(false); return; }
      const { data: member, error: memberError } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", uid).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (memberError || !member?.workspace_id) { setError(memberError?.message || "Aucun espace de travail trouvé."); setLoading(false); return; }
      const [{ data: catalog, error: catalogError }, { data: current, error: currentError }] = await Promise.all([
        supabase.rpc("rv_theme_catalog"),
        supabase.from("rv_workspace_themes").select("*, rv_themes(*)").eq("workspace_id", member.workspace_id).neq("status", "archived").order("updated_at", { ascending: false }),
      ]);
      if (!alive) return;
      if (catalogError) setError(catalogError.message); else setThemes(catalog || []);
      if (currentError) setError(currentError.message); else setInstalled(current || []);
      setWorkspaceId(member.workspace_id);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const activeTheme = useMemo(() => selected || installed[0] || null, [selected, installed]);

  const chooseTheme = async (theme) => {
    setError(""); setMessage("");
    const existing = installed.find((x) => x.theme_id === theme.id);
    if (existing) { setSelected(existing); setConfig(clone(existing.draft_config || existing.config || theme.default_config)); return; }
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("rv_theme_install", { p_workspace_id: workspaceId, p_theme_slug: theme.slug });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    const item = data?.workspace_theme;
    if (item) {
      const next = [...installed.filter((x) => x.id !== item.id), { ...item, rv_themes: theme }];
      setInstalled(next); setSelected({ ...item, rv_themes: theme }); setConfig(clone(item.draft_config || theme.default_config));
      setMessage(`Thème « ${theme.name} » installé dans votre espace.`);
    }
  };

  const update = (path, value) => setConfig((prev) => {
    const next = clone(prev || {}); let cursor = next;
    path.slice(0, -1).forEach((key) => { if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {}; cursor = cursor[key]; });
    cursor[path[path.length - 1]] = value; return next;
  });

  const moveSection = (index, direction) => setConfig((prev) => {
    const next = clone(prev); const arr = [...(next.sections || [])]; const target = index + direction;
    if (target < 0 || target >= arr.length) return next;
    [arr[index], arr[target]] = [arr[target], arr[index]]; next.sections = arr; return next;
  });

  const removeSection = (index) => setConfig((prev) => ({ ...clone(prev), sections: (prev.sections || []).filter((_, i) => i !== index) }));
  const addSection = (type) => setConfig((prev) => ({ ...clone(prev), sections: [...(prev.sections || []), { id: `${type}-${Date.now()}`, type, settings: {} }] }));

  const publish = async () => {
    if (!activeTheme || !config) return;
    setSaving(true); setError(""); setMessage("");
    const { data, error: rpcError } = await supabase.rpc("rv_theme_publish", { p_workspace_id: workspaceId, p_workspace_theme_id: activeTheme.id, p_config: config });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    const next = { ...activeTheme, ...data, draft_config: config, config };
    setSelected(next); setInstalled((items) => items.map((x) => x.id === next.id ? { ...x, ...next } : x));
    setMessage("Thème publié. La boutique utilise maintenant cette configuration.");
  };

  if (loading) return <div style={styles.center}>Chargement de Theme Studio…</div>;

  return <div style={styles.page}>
    <header style={styles.topbar}>
      <div><div style={styles.eyebrow}>RECUVENTE</div><h1 style={styles.title}>Theme Studio</h1><p style={styles.subtitle}>Créez, personnalisez et publiez votre boutique avec un moteur de thèmes modulaire.</p></div>
      <button disabled={!activeTheme || saving} onClick={publish} style={styles.publish}>{saving ? "Enregistrement…" : "Publier la boutique"}</button>
    </header>
    {error && <div style={styles.error}>{error}</div>}{message && <div style={styles.success}>{message}</div>}
    <div style={styles.grid}>
      <aside style={styles.panel}><div style={styles.panelTitle}>Bibliothèque de thèmes</div><div style={styles.small}>Chaque thème est une base personnalisable, avec support COD et optimisation RecuVente.</div>
        <div style={styles.themeList}>{themes.map((theme) => { const isActive = activeTheme?.theme_id === theme.id; return <button key={theme.id} onClick={() => chooseTheme(theme)} style={{ ...styles.themeCard, ...(isActive ? styles.themeActive : {}) }}><div style={{ ...styles.themePreview, background: theme.category === "beauty" ? "linear-gradient(135deg,#3b2430,#d98ca4)" : theme.category === "premium" ? "linear-gradient(135deg,#111,#c8a45d)" : theme.category === "network" ? "linear-gradient(135deg,#171717,#7c3aed)" : "linear-gradient(135deg,#111827,#374151)" }}><span>{theme.category?.toUpperCase()}</span></div><div style={styles.themeName}>{theme.name} {theme.is_premium ? "• PRO" : ""}</div><div style={styles.small}>{theme.description}</div></button>; })}</div>
      </aside>
      <main style={styles.editor}>
        {!activeTheme || !config ? <div style={styles.empty}>Sélectionnez un thème pour commencer.</div> : <>
          <div style={styles.editorHeader}><div><strong>{activeTheme.rv_themes?.name || activeTheme.name}</strong><div style={styles.small}>Version {activeTheme.version || 1} • {activeTheme.status}</div></div><div style={styles.pills}>{["Responsive","SEO","COD","Analytics"].map((x) => <span key={x}>{x}</span>)}</div></div>
          <section style={styles.sectionBox}><h2 style={styles.h2}>Identité de marque</h2><div style={styles.fields}>
            <label>Principale<input type="color" value={config.brand?.primary || "#111827"} onChange={(e) => update(["brand","primary"], e.target.value)} /></label>
            <label>Accent<input type="color" value={config.brand?.accent || "#16a34a"} onChange={(e) => update(["brand","accent"], e.target.value)} /></label>
            <label>Fond<input type="color" value={config.brand?.background || "#ffffff"} onChange={(e) => update(["brand","background"], e.target.value)} /></label>
            <label>Texte<input type="color" value={config.brand?.text || "#111827"} onChange={(e) => update(["brand","text"], e.target.value)} /></label>
          </div></section>
          <section style={styles.sectionBox}><div style={styles.row}><div><h2 style={styles.h2}>Paiement à la livraison</h2><div style={styles.small}>Composant natif RecuVente pour les boutiques COD.</div></div><input type="checkbox" checked={config.cod?.enabled !== false} onChange={(e) => update(["cod","enabled"], e.target.checked)} /></div><input style={styles.textInput} value={config.cod?.cta || "Commander"} onChange={(e) => update(["cod","cta"], e.target.value)} placeholder="Texte du bouton COD" /></section>
          <section style={styles.sectionBox}><h2 style={styles.h2}>Sections de la page d'accueil</h2><div style={styles.small}>Ajoutez, supprimez et réorganisez les sections sans toucher au code.</div><div style={styles.sectionList}>{(config.sections || []).map((section,index) => <div key={section.id || index} style={styles.sectionItem}><div><strong>{sectionLabels[section.type] || section.type}</strong><div style={styles.small}>{section.type}</div></div><div style={styles.actions}><button onClick={() => moveSection(index,-1)}>↑</button><button onClick={() => moveSection(index,1)}>↓</button><button onClick={() => removeSection(index)}>×</button></div></div>)}</div><select style={styles.textInput} value="" onChange={(e) => { if (e.target.value) addSection(e.target.value); }}><option value="">+ Ajouter une section</option>{Object.entries(sectionLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></section>
          <section style={styles.sectionBox}><h2 style={styles.h2}>Prévisualisation</h2><div style={{ ...styles.preview, background: config.brand?.background || "#fff", color: config.brand?.text || "#111" }}><div style={{ background: config.brand?.primary || "#111", color:"white", padding:12, borderRadius:10, marginBottom:18 }}>Votre boutique RecuVente</div><div style={{fontSize:28,fontWeight:800,marginBottom:8}}>{config.sections?.find((s) => s.type === "hero")?.settings?.title || "Votre boutique"}</div><div style={{opacity:.7,marginBottom:20}}>Prévisualisation de votre expérience boutique.</div><button style={{background:config.brand?.accent || "#16a34a",color:"white",border:0,borderRadius:10,padding:"12px 18px",fontWeight:700}}>{config.cod?.cta || "Commander"}</button></div></section>
        </>}
      </main>
    </div>
  </div>;
}

const styles = {
  page:{minHeight:"100vh",background:"#f6f7f5",fontFamily:"Inter,system-ui,-apple-system,sans-serif",color:"#111827"},
  topbar:{padding:"28px 32px",background:"#fff",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",gap:20,alignItems:"center"},
  eyebrow:{fontSize:11,fontWeight:800,letterSpacing:2,color:"#16a34a"},
  title:{margin:"4px 0",fontSize:30}, subtitle:{margin:0,color:"#6b7280",maxWidth:760},
  publish:{border:0,borderRadius:10,padding:"12px 18px",background:"#111827",color:"white",fontWeight:800,cursor:"pointer"},
  grid:{display:"grid",gridTemplateColumns:"330px 1fr",gap:20,maxWidth:1500,margin:"20px auto",padding:"0 20px"},
  panel:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:18,height:"fit-content",position:"sticky",top:16},
  panelTitle:{fontWeight:800,fontSize:18}, small:{fontSize:12,color:"#6b7280",lineHeight:1.45}, themeList:{display:"grid",gap:10,marginTop:16},
  themeCard:{textAlign:"left",background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:10,cursor:"pointer"}, themeActive:{border:"2px solid #16a34a",background:"#f0fdf4"},
  themePreview:{height:70,borderRadius:8,color:"white",display:"flex",alignItems:"flex-end",padding:8,fontSize:9,fontWeight:800,marginBottom:8}, themeName:{fontWeight:800,fontSize:14,marginBottom:3},
  editor:{minWidth:0}, editorHeader:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:18,display:"flex",justifyContent:"space-between",gap:15}, pills:{display:"flex",gap:6,flexWrap:"wrap"},
  sectionBox:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:20,marginTop:14}, h2:{fontSize:16,margin:"0 0 12px"}, fields:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12}, row:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20},
  textInput:{width:"100%",boxSizing:"border-box",marginTop:12,padding:"11px 12px",border:"1px solid #d1d5db",borderRadius:9,background:"#fff"}, sectionList:{display:"grid",gap:8,marginBottom:10}, sectionItem:{display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px"}, actions:{display:"flex",gap:5}, preview:{border:"1px solid #e5e7eb",borderRadius:14,padding:24,minHeight:260}, empty:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:60,textAlign:"center",color:"#6b7280"}, center:{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"system-ui",color:"#6b7280"}, error:{margin:"16px auto",maxWidth:1450,padding:12,borderRadius:10,background:"#fef2f2",color:"#b91c1c"}, success:{margin:"16px auto",maxWidth:1450,padding:12,borderRadius:10,background:"#f0fdf4",color:"#166534"}
};