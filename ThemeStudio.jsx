import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient.js";

// Libellés des sections. Union de ce qui existait déjà dans ThemeStudio + les
// types de sections déjà supportés par le moteur réel de la boutique
// (CataloguePublic.jsx) mais pas encore proposés ici. Aucune nouvelle section
// n'est inventée : tout ce qui suit est déjà rendu par la boutique publique.
const sectionLabels = {
  announcement: "Bandeau d'annonce",
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
  contact: "Contact / Appel à l'action",
  stats: "Chiffres clés",
  flash_sale: "Vente flash",
  before_after: "Avant / Après",
  category_tiles: "Tuiles catégories",
  cta_banner: "Bandeau CTA",
};

// ---------------------------------------------------------------------------
// 6 thèmes de départ. Ce sont des PRESETS CÔTÉ CLIENT : ils ne créent ni ne
// modifient aucune ligne dans la table Supabase `rv_themes` (celles-ci
// existent déjà : rv-commerce, rv-premium, rv-minimal, rv-beauty,
// rv-business, rv-mlm — voir consigne "ne pas créer de doublons"). Ils ne
// servent que de configuration de départ, appliquée UNIQUEMENT si le
// `default_config` renvoyé par `rv_theme_catalog` pour ce thème est vide, et
// on complète moins, jamais on n'écrase ce qui existe déjà côté Supabase.
// ---------------------------------------------------------------------------
const THEME_PRESETS = {
  "rv-commerce": {
    couleur: "#16a34a",
    headerBgColor: "#111827",
    headerTextColor: "#ffffff",
    headerBarreTop: "🚚 Livraison rapide  ·  💵 Paiement à la livraison  ·  🛡️ Achat sécurisé",
    headerShowSearch: true,
    headerShowPanier: true,
    announcement: "🚚 Livraison rapide partout en Côte d'Ivoire · 💵 Paiement à la livraison",
    heroTitle: "Tout ce qu'il vous faut, livré chez vous",
    heroSubtitle: "Un large choix de produits, un paiement à la livraison simple, une livraison suivie partout dans le pays.",
    buttonText: "Voir les produits",
    promoTitle: "Offre du moment",
    promoText: "Profitez de nos prix les plus bas sur une sélection de produits, pour un temps limité.",
    livraison: "Livraison en 24 à 72h selon votre ville. Vous payez uniquement à la réception, en toute confiance.",
    whatsapp: "Bonjour, j'ai une question sur vos produits.",
    statsItems: [{ valeur: "10 000+", label: "Clients livrés" }, { valeur: "98%", label: "Livraisons réussies" }, { valeur: "24-72h", label: "Délai moyen" }],
    sections: ["announcement", "hero", "collections", "bestsellers", "products", "bundles", "benefits", "testimonials", "promo", "faq", "delivery", "cod_form", "whatsapp", "contact"],
  },
  "rv-premium": {
    couleur: "#c8a45d",
    headerBgColor: "#0d0d0d",
    headerTextColor: "#c8a45d",
    headerBarreTop: "Livraison soignée · Paiement à la réception",
    headerShowSearch: false,
    headerShowPanier: true,
    heroTitle: "L'excellence, livrée avec soin",
    heroSubtitle: "Une sélection restreinte, une exigence constante. Découvrez une expérience d'achat à la hauteur de vos attentes.",
    buttonText: "Découvrir la collection",
    imageTexteTitre: "Un savoir-faire qui se voit",
    imageTexteTexte: "Chaque produit de cette collection est choisi pour sa qualité, pas pour son prix. C'est notre seule promesse.",
    imageTextePosition: "gauche",
    livraison: "Livraison discrète et suivie, avec confirmation avant expédition. Paiement à la livraison disponible.",
    sections: ["hero", "products", "image_texte", "testimonials", "faq", "cod_form", "contact"],
  },
  "rv-minimal": {
    couleur: "#111827",
    headerBgColor: "#ffffff",
    headerTextColor: "#111827",
    headerBarreTop: "",
    headerShowSearch: true,
    headerShowPanier: true,
    heroTitle: "Simple. Utile. Sans détour.",
    heroSubtitle: "L'essentiel, bien présenté.",
    buttonText: "Voir les produits",
    livraison: "Livraison rapide, paiement à la réception.",
    sections: ["hero", "products", "image_texte", "faq", "cod_form", "contact"],
  },
  "rv-beauty": {
    couleur: "#c2185b",
    headerBgColor: "#3b2430",
    headerTextColor: "#f6dfe8",
    headerBarreTop: "✨ Nouveautés chaque semaine · 💵 Paiement à la livraison",
    headerShowSearch: true,
    headerShowPanier: true,
    announcement: "✨ Nouveautés chaque semaine · Paiement à la livraison",
    heroTitle: "Révélez votre éclat naturel",
    heroSubtitle: "Des produits de beauté pensés pour votre routine, livrés chez vous en toute discrétion.",
    buttonText: "Voir la collection",
    imageTexteTitre: "Avant / après, la vraie différence",
    imageTexteTexte: "Nos clientes en parlent mieux que nous. Découvrez leurs résultats.",
    imageTextePosition: "droite",
    promoTitle: "Offre beauté du moment",
    promoText: "Une sélection en promotion, le temps d'une semaine.",
    livraison: "Livraison discrète, sans mention du contenu sur le colis. Paiement à la réception.",
    whatsapp: "Bonjour, j'aimerais des conseils sur vos produits de beauté.",
    sections: ["announcement", "hero", "collections", "products", "before_after", "testimonials", "promo", "gallery", "faq", "delivery", "cod_form", "whatsapp", "contact"],
  },
  "rv-business": {
    couleur: "#1d4ed8",
    headerBgColor: "#0f172a",
    headerTextColor: "#e2e8f0",
    headerBarreTop: "Solutions professionnelles · Accompagnement dédié",
    headerShowSearch: true,
    headerShowPanier: false,
    heroTitle: "Des solutions pensées pour votre activité",
    heroSubtitle: "Services et produits professionnels, avec un accompagnement humain à chaque étape.",
    buttonText: "Découvrir nos offres",
    imageTexteTitre: "Un accompagnement, pas juste une vente",
    imageTexteTexte: "Nous prenons le temps de comprendre votre besoin avant de vous proposer une solution.",
    imageTextePosition: "gauche",
    statsItems: [{ valeur: "500+", label: "Entreprises accompagnées" }, { valeur: "15", label: "Pays couverts" }, { valeur: "4.8/5", label: "Satisfaction client" }],
    livraison: "Mise en œuvre et livraison planifiées avec votre équipe.",
    sections: ["hero", "stats", "products", "image_texte", "benefits", "testimonials", "faq", "contact"],
  },
  "rv-mlm": {
    couleur: "#7c3aed",
    headerBgColor: "#171717",
    headerTextColor: "#ede9fe",
    headerBarreTop: "🤝 Rejoignez notre réseau · 💰 Commissions à chaque vente",
    headerShowSearch: true,
    headerShowPanier: true,
    announcement: "🤝 Rejoignez notre réseau de partenaires dès aujourd'hui",
    heroTitle: "Vendez, parrainez, gagnez",
    heroSubtitle: "Rejoignez un réseau de partenaires actifs et développez vos revenus avec des produits que vous aimez déjà.",
    buttonText: "Rejoindre le réseau",
    statsItems: [{ valeur: "2 000+", label: "Partenaires actifs" }, { valeur: "15%", label: "Commission moyenne" }, { valeur: "48h", label: "Paiement des commissions" }],
    ctaBannerTitre: "Prêt à démarrer votre activité ?",
    ctaBannerTexte: "Inscription gratuite, formation incluse, support de votre équipe à chaque étape.",
    ctaBannerBouton: "Devenir partenaire",
    promoTitle: "Kit de démarrage",
    promoText: "Recevez votre kit de partenaire avec les produits les plus demandés par vos futurs clients.",
    livraison: "Livraison rapide pour vous et vos clients directs.",
    whatsapp: "Bonjour, je souhaite rejoindre votre réseau de partenaires.",
    sections: ["announcement", "hero", "stats", "products", "cta_banner", "testimonials", "promo", "faq", "delivery", "cod_form", "whatsapp", "contact"],
  },
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Combine le preset local (base) avec le default_config Supabase du thème
// (qui a toujours le dernier mot s'il contient déjà des valeurs) — ne
// remplace jamais une configuration déjà présente côté serveur.
function seedConfig(theme) {
  const preset = THEME_PRESETS[theme.slug] || {};
  const fromDb = theme.default_config || {};
  const merged = { ...clone(preset), ...clone(fromDb) };
  if (!merged.sections || !merged.sections.length) merged.sections = preset.sections || ["hero", "products", "contact"];
  return merged;
}

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
    if (existing) { setSelected(existing); setConfig(clone(existing.draft_config || existing.config || seedConfig(theme))); return; }
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("rv_theme_install", { p_workspace_id: workspaceId, p_theme_slug: theme.slug });
    setSaving(false);
    if (rpcError) return setError(rpcError.message);
    const item = data?.workspace_theme;
    if (item) {
      const next = [...installed.filter((x) => x.id !== item.id), { ...item, rv_themes: theme }];
      setInstalled(next); setSelected({ ...item, rv_themes: theme }); setConfig(clone(item.draft_config || seedConfig(theme)));
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
  const addSection = (type) => setConfig((prev) => ({ ...clone(prev), sections: [...(prev.sections || []), type] }));

  const publish = async () => {
    if (!activeTheme || !config) return;
    setSaving(true); setError(""); setMessage("");

    // 1) Publication côté catalogue de thèmes (versionning RecuVente).
    const { data, error: rpcError } = await supabase.rpc("rv_theme_publish", { p_workspace_id: workspaceId, p_workspace_theme_id: activeTheme.id, p_config: config });
    if (rpcError) { setSaving(false); return setError(rpcError.message); }

    // 2) Pont vers la boutique publique réelle : CataloguePublic.jsx ne lit
    // que `workspaces.store_config_published`. C'est exactement le même
    // patch que celui utilisé par le Store Builder existant ("Ma Boutique"),
    // pour que la publication depuis Theme Studio ait un effet réel et
    // immédiat sur la boutique, sans dépendre d'un futur redéploiement.
    const patch = {
      store_config: config,
      store_config_published: config,
      store_is_published: true,
      store_published_at: new Date().toISOString(),
    };
    if (config.couleur) patch.couleur_marque = config.couleur;
    if (config.livraison) patch.politique_livraison = config.livraison;
    const { error: bridgeError } = await supabase.from("workspaces").update(patch).eq("id", workspaceId);

    setSaving(false);
    if (bridgeError) return setError("Thème enregistré, mais la publication sur la boutique a échoué : " + bridgeError.message);
    const next = { ...activeTheme, ...data, draft_config: config, config };
    setSelected(next); setInstalled((items) => items.map((x) => x.id === next.id ? { ...x, ...next } : x));
    setMessage("Thème publié. Votre boutique publique utilise maintenant cette configuration.");
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
        <div style={styles.themeList}>{themes.map((theme) => { const isActive = activeTheme?.theme_id === theme.id; return <button key={theme.id} onClick={() => chooseTheme(theme)} style={{ ...styles.themeCard, ...(isActive ? styles.themeActive : {}) }}><div style={{ ...styles.themePreview, background: theme.category === "beauty" ? "linear-gradient(135deg,#3b2430,#d98ca4)" : theme.category === "premium" ? "linear-gradient(135deg,#111,#c8a45d)" : theme.category === "network" ? "linear-gradient(135deg,#171717,#7c3aed)" : theme.category === "business" ? "linear-gradient(135deg,#0f172a,#1d4ed8)" : theme.category === "minimal" ? "linear-gradient(135deg,#e5e7eb,#111827)" : "linear-gradient(135deg,#111827,#374151)" }}><span>{theme.category?.toUpperCase()}</span></div><div style={styles.themeName}>{theme.name} {theme.is_premium ? "• PRO" : ""}</div><div style={styles.small}>{theme.description}</div></button>; })}</div>
      </aside>
      <main style={styles.editor}>
        {!activeTheme || !config ? <div style={styles.empty}>Sélectionnez un thème pour commencer.</div> : <>
          <div style={styles.editorHeader}><div><strong>{activeTheme.rv_themes?.name || activeTheme.name}</strong><div style={styles.small}>Version {activeTheme.version || 1} • {activeTheme.status}</div></div><div style={styles.pills}>{["Responsive","SEO","COD","Analytics"].map((x) => <span key={x}>{x}</span>)}</div></div>

          <section style={styles.sectionBox}><h2 style={styles.h2}>Identité de marque</h2><div style={styles.fields}>
            <label>Couleur principale<input type="color" value={config.couleur || "#111827"} onChange={(e) => update(["couleur"], e.target.value)} /></label>
            <label>Fond du header<input type="color" value={config.headerBgColor || "#111827"} onChange={(e) => update(["headerBgColor"], e.target.value)} /></label>
            <label>Texte du header<input type="color" value={config.headerTextColor || "#ffffff"} onChange={(e) => update(["headerTextColor"], e.target.value)} /></label>
          </div>
            <input style={styles.textInput} value={config.headerBarreTop || ""} onChange={(e) => update(["headerBarreTop"], e.target.value)} placeholder="Texte du bandeau tout en haut du header" />
            <div style={styles.row}><label style={styles.checkboxRow}><input type="checkbox" checked={config.headerShowSearch !== false} onChange={(e) => update(["headerShowSearch"], e.target.checked)} /> Recherche visible</label><label style={styles.checkboxRow}><input type="checkbox" checked={config.headerShowPanier !== false} onChange={(e) => update(["headerShowPanier"], e.target.checked)} /> Panier visible</label></div>
          </section>

          <section style={styles.sectionBox}><h2 style={styles.h2}>Hero / Bannière</h2>
            <input style={styles.textInput} value={config.heroTitle || ""} onChange={(e) => update(["heroTitle"], e.target.value)} placeholder="Titre principal" />
            <textarea style={{ ...styles.textInput, resize: "vertical" }} rows={2} value={config.heroSubtitle || ""} onChange={(e) => update(["heroSubtitle"], e.target.value)} placeholder="Sous-titre" />
            <input style={styles.textInput} value={config.buttonText || ""} onChange={(e) => update(["buttonText"], e.target.value)} placeholder="Texte du bouton d'action" />
          </section>

          <section style={styles.sectionBox}><h2 style={styles.h2}>Contenu des sections</h2><div style={styles.small}>Ces textes alimentent les sections correspondantes ci-dessous, si elles sont activées.</div>
            <input style={styles.textInput} value={config.announcement || ""} onChange={(e) => update(["announcement"], e.target.value)} placeholder="Bandeau d'annonce" />
            <input style={styles.textInput} value={config.promoTitle || ""} onChange={(e) => update(["promoTitle"], e.target.value)} placeholder="Titre de la promotion" />
            <textarea style={{ ...styles.textInput, resize: "vertical" }} rows={2} value={config.promoText || ""} onChange={(e) => update(["promoText"], e.target.value)} placeholder="Texte de la promotion" />
            <textarea style={{ ...styles.textInput, resize: "vertical" }} rows={2} value={config.livraison || ""} onChange={(e) => update(["livraison"], e.target.value)} placeholder="Texte de la section livraison" />
            <input style={styles.textInput} value={config.whatsapp || ""} onChange={(e) => update(["whatsapp"], e.target.value)} placeholder="Message WhatsApp pré-rempli" />
          </section>

          <section style={styles.sectionBox}><h2 style={styles.h2}>Sections de la page d'accueil</h2><div style={styles.small}>Ajoutez, supprimez et réorganisez les sections sans toucher au code.</div><div style={styles.sectionList}>{(config.sections || []).map((section,index) => { const type = typeof section === "string" ? section : section.type; return <div key={type + index} style={styles.sectionItem}><div><strong>{sectionLabels[type] || type}</strong><div style={styles.small}>{type}</div></div><div style={styles.actions}><button onClick={() => moveSection(index,-1)}>↑</button><button onClick={() => moveSection(index,1)}>↓</button><button onClick={() => removeSection(index)}>×</button></div></div>; })}</div><select style={styles.textInput} value="" onChange={(e) => { if (e.target.value) addSection(e.target.value); }}><option value="">+ Ajouter une section</option>{Object.entries(sectionLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></section>

          <section style={styles.sectionBox}><h2 style={styles.h2}>Prévisualisation</h2><div style={{ ...styles.preview, background: "#fff", color: "#111" }}><div style={{ background: config.headerBgColor || "#111", color: config.headerTextColor || "white", padding:12, borderRadius:10, marginBottom:18 }}>{config.headerBarreTop || "Votre boutique RecuVente"}</div><div style={{fontSize:28,fontWeight:800,marginBottom:8}}>{config.heroTitle || "Votre boutique"}</div><div style={{opacity:.7,marginBottom:20}}>{config.heroSubtitle || "Prévisualisation de votre expérience boutique."}</div><button style={{background:config.couleur || "#16a34a",color:"white",border:0,borderRadius:10,padding:"12px 18px",fontWeight:700}}>{config.buttonText || "Commander"}</button></div></section>
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
  sectionBox:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:20,marginTop:14}, h2:{fontSize:16,margin:"0 0 12px"}, fields:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12}, row:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20},
  checkboxRow:{display:"flex",alignItems:"center",gap:6,fontSize:12.5,color:"#374151"},
  textInput:{width:"100%",boxSizing:"border-box",marginTop:12,padding:"11px 12px",border:"1px solid #d1d5db",borderRadius:9,background:"#fff"}, sectionList:{display:"grid",gap:8,marginBottom:10}, sectionItem:{display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px"}, actions:{display:"flex",gap:5}, preview:{border:"1px solid #e5e7eb",borderRadius:14,padding:24,minHeight:260}, empty:{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:60,textAlign:"center",color:"#6b7280"}, center:{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"system-ui",color:"#6b7280"}, error:{margin:"16px auto",maxWidth:1450,padding:12,borderRadius:10,background:"#fef2f2",color:"#b91c1c"}, success:{margin:"16px auto",maxWidth:1450,padding:12,borderRadius:10,background:"#f0fdf4",color:"#166534"}
};
