import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [workspace, setWorkspace] = useState(undefined);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadWorkspace() {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      setWorkspace(null);
      return;
    }
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, country, currency, created_at)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      setWorkspace({ ...data.workspaces, role: data.role });
    } else {
      setWorkspace(null);
    }
  }

  const [subscription, setSubscription] = useState(undefined);

  async function loadSubscription(workspaceId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*, subscription_plans(nom, prix, devise, max_commandes_mois)")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    setSubscription(data || null);
  }

  useEffect(() => {
    if (workspace && workspace.id) loadSubscription(workspace.id);
  }, [workspace?.id]);

  useEffect(() => {
    if (session) loadWorkspace();
  }, [session]);

  async function creerWorkspace(nom) {
    setLoadingWorkspace(true);
    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert([{ owner_id: session.user.id, name: nom }])
      .select()
      .single();
    if (error) {
      alert("Erreur: " + error.message);
      setLoadingWorkspace(false);
      return;
    }
    await supabase.from("workspace_members").insert([
      { workspace_id: ws.id, user_id: session.user.id, role: "owner" },
    ]);
    await loadWorkspace();
    setLoadingWorkspace(false);
  }

  if (session === undefined) return <Centered>Chargement…</Centered>;
  if (!session) return <AuthScreen />;

  const isAdminRoute = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1";
  if (isAdminRoute) return <AdminPanel session={session} />;

  if (workspace === undefined) return <Centered>Chargement de ton espace…</Centered>;
  if (workspace === null) return <CreateWorkspaceScreen onCreate={creerWorkspace} loading={loadingWorkspace} />;

  return <WorkspaceDashboard workspace={workspace} session={session} subscription={subscription} />;
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", background: "#FAFAF7" }}>
      {children}
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signup");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 340 }}>
        <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>RecuVente <span style={{ color: "#e8920a" }}>SaaS</span></div>
        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
          {mode === "signup" ? "Crée ton compte et ton espace" : "Connexion"}
        </div>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input placeholder="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={btnStyle}>
          {loading ? "..." : mode === "signup" ? "Créer mon compte" : "Se connecter"}
        </button>
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: "#6B7168", cursor: "pointer" }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
          {mode === "signup" ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
        </div>
      </div>
    </Centered>
  );
}

function CreateWorkspaceScreen({ onCreate, loading }) {
  const [nom, setNom] = useState("");
  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 340 }}>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Bienvenue 👋</div>
        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
          Nomme ton entreprise pour créer ton espace privé.
        </div>
        <input placeholder="Ex: Azali Express" value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} />
        <button onClick={() => nom.trim() && onCreate(nom.trim())} disabled={loading || !nom.trim()} style={btnStyle}>
          {loading ? "Création..." : "Créer mon espace"}
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10, border: "1px solid #DDD8CC", background: "white", color: "#6B7168", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Déconnexion
        </button>
      </div>
    </Centered>
  );
}

function WorkspaceDashboard({ workspace, session, subscription }) {
  const [commandes, setCommandes] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [closers, setClosers] = useState([]);
  const [produits, setProduits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showAbonnement, setShowAbonnement] = useState(false);
  const [showLivreurs, setShowLivreurs] = useState(false);
  const [showClosers, setShowClosers] = useState(false);
  const [showProduits, setShowProduits] = useState(false);

  async function loadLivreurs() {
    const { data } = await supabase.from("livreurs").select("*").eq("workspace_id", workspace.id).order("nom");
    setLivreurs(data || []);
  }

  async function loadClosers() {
    const { data } = await supabase.from("closers").select("*").eq("workspace_id", workspace.id).order("nom");
    setClosers(data || []);
  }

  async function loadProduits() {
    const { data } = await supabase.from("produits").select("*").eq("workspace_id", workspace.id).order("nom");
    setProduits(data || []);
  }

  function parseProduitTexte(texte) {
    if (!texte) return { nom: "", quantite: 1 };
    const match = texte.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
    if (match) return { nom: match[1].trim(), quantite: Number(match[2]) || 1 };
    return { nom: texte.trim(), quantite: 1 };
  }

  async function addProduit(form) {
    const { error } = await supabase.from("produits").insert([{ nom: form.nom, cout_achat: Number(form.cout_achat) || 0, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadProduits();
  }

  async function updateProduitCout(id, cout) {
    await supabase.from("produits").update({ cout_achat: Number(cout) || 0 }).eq("id", id);
    await loadProduits();
  }

  async function deleteProduit(id) {
    await supabase.from("produits").delete().eq("id", id);
    await loadProduits();
  }

  async function addLivreur(form) {
    const { error } = await supabase.from("livreurs").insert([{ ...form, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadLivreurs();
  }

  async function deleteLivreur(id) {
    await supabase.from("livreurs").delete().eq("id", id);
    await loadLivreurs();
  }

  async function addCloser(form) {
    const { error } = await supabase.from("closers").insert([{ ...form, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadClosers();
  }

  async function deleteCloser(id) {
    await supabase.from("closers").delete().eq("id", id);
    await loadClosers();
  }

  async function assignLivreur(commandeId, nom) {
    await supabase.from("commandes").update({ livreur: nom || null }).eq("id", commandeId);
    await supabase.from("relances").insert([
      { commande_id: commandeId, note: nom ? `🚚 Livreur assigné : ${nom}` : "🚚 Livreur retiré" },
    ]);
    await loadCommandes();
  }

  async function assignCloser(commandeId, nom) {
    await supabase.from("commandes").update({ closer: nom || null }).eq("id", commandeId);
    await supabase.from("relances").insert([
      { commande_id: commandeId, note: nom ? `🎧 Closer assigné : ${nom}` : "🎧 Closer retiré" },
    ]);
    await loadCommandes();
  }

  useEffect(() => {
    loadLivreurs();
    loadClosers();
    loadProduits();
  }, []);

  const accesBloque = (() => {
    if (subscription === undefined || subscription === null) return false; // pas encore chargé ou pas d'abonnement du tout (ancien workspace) : ne rien bloquer
    if (subscription.status === "active") return false;
    if (subscription.status === "trial") {
      const finEssai = new Date(subscription.trial_ends_at);
      return finEssai < new Date();
    }
    if (subscription.status === "suspended" || subscription.status === "cancelled") return true;
    return false;
  })();

  const maxCommandesMois = subscription?.subscription_plans?.max_commandes_mois ?? null;
  const commandesCeMois = commandes.filter((c) => {
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const quotaAtteint = maxCommandesMois !== null && commandesCeMois >= maxCommandesMois && !accesBloque;

  async function loadCommandes() {
    const { data, error } = await supabase
      .from("commandes")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    if (!error) setCommandes(data || []);
    setLoaded(true);
  }

  useEffect(() => {
    loadCommandes();
  }, []);

  const [vue, setVue] = useState("commandes");

  const clients = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      const key = c.tel || c.client;
      if (!map[key]) map[key] = { nom: c.client, tel: c.tel, zone: c.zone, commandes: [] };
      map[key].commandes.push(c);
    });
    return Object.values(map)
      .map((cl) => ({
        ...cl,
        total: cl.commandes.length,
        confirmees: cl.commandes.filter((c) => c.statut === "confirmee").length,
        echouees: cl.commandes.filter((c) => c.statut === "echouee").length,
        montantTotal: cl.commandes.filter((c) => c.statut === "confirmee").reduce((s, c) => s + Number(c.montant), 0),
      }))
      .sort((a, b) => b.montantTotal - a.montantTotal);
  }, [commandes]);

  async function addCommande(form) {
    if (accesBloque) {
      alert("Ton essai gratuit est terminé. Passe à un plan payant pour continuer à ajouter des commandes.");
      return;
    }
    if (quotaAtteint) {
      alert("Quota de commandes du mois atteint pour ton plan. Passe à un plan supérieur pour continuer.");
      return;
    }
    const { error } = await supabase.from("commandes").insert([
      { ...form, montant: Number(form.montant), workspace_id: workspace.id },
    ]);
    if (error) {
      alert("Erreur: " + error.message);
      return;
    }
    await loadCommandes();
    setShowAdd(false);
  }

  const totalCA = commandes.reduce((s, c) => s + Number(c.montant), 0);
  const confirmees = commandes.filter((c) => c.statut === "confirmee");
  const caConfirme = confirmees.reduce((s, c) => s + Number(c.montant), 0);

  const COUT_LIVRAISON = 1500;
  const coutLivraisons = confirmees.length * COUT_LIVRAISON;

  const coutProduitsInfo = useMemo(() => {
    let coutTotal = 0;
    let nbInconnu = 0;
    let montantInconnu = 0;
    confirmees.forEach((c) => {
      const { nom, quantite } = parseProduitTexte(c.produit);
      const trouve = produits.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      if (!trouve) {
        nbInconnu += 1;
        montantInconnu += Number(c.montant);
      } else {
        coutTotal += trouve.cout_achat * quantite;
      }
    });
    return { coutTotal, nbInconnu, montantInconnu };
  }, [confirmees, produits]);

  const beneficeReel = caConfirme - coutLivraisons - coutProduitsInfo.coutTotal;

  const depotsParLivreur = useMemo(() => {
    return livreurs
      .map((l) => {
        const mesLivrees = confirmees.filter((c) => c.livreur === l.nom);
        const montantRecupere = mesLivrees.reduce((s, c) => s + Number(c.montant), 0);
        const commission = mesLivrees.length * COUT_LIVRAISON;
        return { nom: l.nom, livrees: mesLivrees.length, montantRecupere, commission, aDeposer: montantRecupere - commission };
      })
      .filter((l) => l.livrees > 0)
      .sort((a, b) => b.aDeposer - a.aDeposer);
  }, [livreurs, confirmees]);

  const totalCommission = depotsParLivreur.reduce((s, l) => s + l.commission, 0);
  const totalADeposer = depotsParLivreur.reduce((s, l) => s + l.aDeposer, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ background: "#1a7a3c", color: "white", padding: 20, borderRadius: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Espace de</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{workspace.name}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          {workspace.country} · {workspace.currency} · rôle : {workspace.role}
        </div>
        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.85 }}>Chiffre d'affaires confirmé</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{caConfirme.toLocaleString("fr-FR")} {workspace.currency}</div>
        <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>{totalCA.toLocaleString("fr-FR")} {workspace.currency} au total (toutes commandes)</div>
        {workspace.role === "owner" && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => setShowTeam(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              👥 Gérer l'équipe
            </button>
            <button onClick={() => setShowAbonnement(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              💳 Mon abonnement
            </button>
            <button onClick={() => setShowLivreurs(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              🚚 Livreurs
            </button>
            <button onClick={() => setShowClosers(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              🎧 Closers
            </button>
          </div>
        )}
      </div>

      <SubscriptionBanner subscription={subscription} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setVue("commandes")}
          style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${vue === "commandes" ? "#1a7a3c" : "#DDD8CC"}`, background: vue === "commandes" ? "#1a7a3c" : "white", color: vue === "commandes" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Commandes
        </button>
        <button
          onClick={() => setVue("clients")}
          style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${vue === "clients" ? "#1a7a3c" : "#DDD8CC"}`, background: vue === "clients" ? "#1a7a3c" : "white", color: vue === "clients" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Clients ({clients.length})
        </button>
        {workspace.role === "owner" && (
          <button
            onClick={() => setVue("compta")}
            style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${vue === "compta" ? "#1a7a3c" : "#DDD8CC"}`, background: vue === "compta" ? "#1a7a3c" : "white", color: vue === "compta" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            🧮 Compta
          </button>
        )}
      </div>

      {vue === "commandes" && (
      <>
      {accesBloque && (
        <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#D64933" }}>
          🔒 Impossible d'ajouter de nouvelles commandes tant que l'abonnement n'est pas actif. Tes données existantes restent accessibles et en sécurité.
        </div>
      )}

      {quotaAtteint && (
        <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#D64933" }}>
          🔒 Quota du plan atteint ({commandesCeMois}/{maxCommandesMois} commandes ce mois-ci). Passe à un plan supérieur pour continuer.
        </div>
      )}

      {!accesBloque && !quotaAtteint && maxCommandesMois !== null && (
        <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 10 }}>
          {commandesCeMois} / {maxCommandesMois} commandes utilisées ce mois-ci
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Commandes ({commandes.length})</div>
        <button
          onClick={() => !accesBloque && !quotaAtteint && setShowAdd(true)}
          disabled={accesBloque || quotaAtteint}
          style={{ ...btnStyle, width: "auto", padding: "8px 16px", opacity: (accesBloque || quotaAtteint) ? 0.4 : 1, cursor: (accesBloque || quotaAtteint) ? "not-allowed" : "pointer" }}
        >
          + Ajouter
        </button>
      </div>

      {!loaded && <div style={{ color: "#8A9089", fontSize: 13 }}>Chargement...</div>}
      {loaded && commandes.length === 0 && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 20, textAlign: "center", color: "#8A9089", fontSize: 13 }}>
          Aucune commande. Ajoute la première pour tester.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commandes.map((c) => (
          <CommandeCard key={c.id} commande={c} currency={workspace.currency} onStatusChanged={loadCommandes} livreurs={livreurs} closers={closers} onAssignLivreur={assignLivreur} onAssignCloser={assignCloser} />
        ))}
      </div>
      </>
      )}

      {vue === "clients" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clients.length === 0 && <div style={{ color: "#8A9089", fontSize: 13, textAlign: "center", padding: "30px 0" }}>Aucun client pour l'instant.</div>}
          {clients.map((cl, i) => (
            <div key={i} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{cl.nom}</div>
                <div style={{ fontSize: 12, color: "#6B7168" }}>{cl.tel} · {cl.zone}</div>
                <div style={{ fontSize: 11.5, marginTop: 3, display: "flex", gap: 8 }}>
                  <span style={{ color: "#1a7a3c" }}>{cl.confirmees} confirmée{cl.confirmees > 1 ? "s" : ""}</span>
                  {cl.echouees > 0 && <span style={{ color: "#D64933" }}>{cl.echouees} échouée{cl.echouees > 1 ? "s" : ""}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a7a3c" }}>{cl.montantTotal.toLocaleString("fr-FR")} {workspace.currency}</div>
                <div style={{ fontSize: 10.5, color: "#8A9089" }}>{cl.total} commande{cl.total > 1 ? "s" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {vue === "compta" && (
        <div>
          <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💰 Bénéfice réel</div>
            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 24, color: beneficeReel >= 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 3 }}>
              {beneficeReel.toLocaleString("fr-FR")} {workspace.currency}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              CA confirmé {caConfirme.toLocaleString("fr-FR")} − Livraisons ({confirmees.length} × {COUT_LIVRAISON.toLocaleString("fr-FR")}) − Produits ({coutProduitsInfo.coutTotal.toLocaleString("fr-FR")})
            </div>
          </div>

          {coutProduitsInfo.nbInconnu > 0 && (
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#8A6412" }}>
              ⚠️ {coutProduitsInfo.nbInconnu} commande{coutProduitsInfo.nbInconnu > 1 ? "s" : ""} ({coutProduitsInfo.montantInconnu.toLocaleString("fr-FR")} {workspace.currency}) sans coût produit connu — non déduites, bénéfice sous-estimé.
              <button onClick={() => setShowProduits(true)} style={{ display: "block", marginTop: 6, background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                📦 Renseigner le catalogue
              </button>
            </div>
          )}

          <button onClick={() => setShowProduits(true)} style={{ width: "100%", background: "white", border: "1px solid #DDD8CC", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#16231F", cursor: "pointer", marginBottom: 16 }}>
            📦 Gérer le catalogue produits ({produits.length})
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💵 À payer aux livreurs</div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "#e8920a", marginTop: 3 }}>{totalCommission.toLocaleString("fr-FR")} {workspace.currency}</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #1a7a3c, #1F9D6E)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)", textTransform: "uppercase" }}>🏦 Dépôt attendu</div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "white", marginTop: 3 }}>{totalADeposer.toLocaleString("fr-FR")} {workspace.currency}</div>
            </div>
          </div>

          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Détail par livreur</div>
          {depotsParLivreur.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucune livraison confirmée pour l'instant.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {depotsParLivreur.map((l) => (
              <div key={l.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nom}</div>
                <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{l.livrees} livraison{l.livrees > 1 ? "s" : ""} · {l.montantRecupere.toLocaleString("fr-FR")} {workspace.currency} encaissé</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, background: "#FBF3E3", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#8A6412" }}>
                    Commission : <strong>{l.commission.toLocaleString("fr-FR")}</strong>
                  </div>
                  <div style={{ flex: 1, background: "#EAF3DE", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#3B6D11" }}>
                    À déposer : <strong>{l.aDeposer.toLocaleString("fr-FR")}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <a href="?admin=1" style={{ display: "block", textAlign: "center", marginTop: 20, fontSize: 12, color: "#8A9089", textDecoration: "underline" }}>
        🧮 Panel Admin RecuVente
      </a>

      <button onClick={() => supabase.auth.signOut()} style={{ ...btnStyle, marginTop: 10, background: "white", color: "#16231F", border: "1px solid #DDD8CC" }}>
        Déconnexion
      </button>

      {showAdd && <AddCommandeModal onClose={() => setShowAdd(false)} onAdd={addCommande} currency={workspace.currency} />}
      {showTeam && <TeamModal workspace={workspace} onClose={() => setShowTeam(false)} />}
      {showAbonnement && <AbonnementModal workspace={workspace} subscription={subscription} onClose={() => setShowAbonnement(false)} />}
      {showLivreurs && <EquipeModal titre="Livreurs" items={livreurs} onAdd={addLivreur} onDelete={deleteLivreur} onClose={() => setShowLivreurs(false)} />}
      {showClosers && <EquipeModal titre="Closers" items={closers} onAdd={addCloser} onDelete={deleteCloser} onClose={() => setShowClosers(false)} />}
      {showProduits && <ProduitsModal produits={produits} onAdd={addProduit} onUpdateCout={updateProduitCout} onDelete={deleteProduit} currency={workspace.currency} onClose={() => setShowProduits(false)} />}
    </div>
  );
}

function AddCommandeModal({ onClose, onAdd, currency }) {
  const [form, setForm] = useState({ client: "", tel: "", produit: "", montant: "", zone: "" });
  const canSubmit = form.client && form.montant;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 14 }}>Nouvelle commande</div>
        {["client", "tel", "produit", "montant", "zone"].map((f) => (
          <input
            key={f}
            placeholder={f === "montant" ? `Montant (${currency})` : f}
            value={form[f]}
            onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            type={f === "montant" ? "number" : "text"}
            style={inputStyle}
          />
        ))}
        <button onClick={() => canSubmit && onAdd(form)} disabled={!canSubmit} style={btnStyle}>
          Ajouter
        </button>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" };
const btnStyle = { width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#1a7a3c", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };

function TeamModal({ workspace, onClose }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  async function loadMembers() {
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch(`/api/list-members?workspaceId=${workspace.id}`, {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Erreur");
    else setMembers(json.members);
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const roleLabels = { owner: "Propriétaire", admin: "Admin", closer: "Closer", livreur: "Livreur", comptable: "Comptable" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Équipe</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <button onClick={() => setShowInvite(true)} style={{ ...btnStyle, marginBottom: 14 }}>
          + Inviter quelqu'un
        </button>

        {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        {members === null && !error && <div style={{ color: "#8A9089", fontSize: 13 }}>Chargement...</div>}

        {members && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <div key={m.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.email}</div>
                <div style={{ fontSize: 11.5, color: "#6B7168" }}>{roleLabels[m.role] || m.role}</div>
              </div>
            ))}
          </div>
        )}

        {showInvite && (
          <InviteMemberForm
            workspace={workspace}
            onClose={() => setShowInvite(false)}
            onInvited={() => {
              setShowInvite(false);
              loadMembers();
            }}
          />
        )}
      </div>
    </div>
  );
}

function InviteMemberForm({ workspace, onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("closer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roles = [
    { key: "admin", label: "Admin — accès complet" },
    { key: "closer", label: "Closer — ses commandes" },
    { key: "livreur", label: "Livreur — ses livraisons" },
    { key: "comptable", label: "Comptable — lecture financière" },
  ];

  async function submit() {
    if (!email || !password) {
      setError("Remplis email et mot de passe.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ workspaceId: workspace.id, email, password, role }),
      });
      const json = await res.json().catch(() => ({ error: `Réponse invalide du serveur (code ${res.status})` }));
      if (!res.ok) setError(json.error || `Erreur (${res.status})`);
      else onInvited();
    } catch (e) {
      setError("Erreur réseau: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 10 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Inviter quelqu'un</div>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input placeholder="Mot de passe temporaire" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Rôle</div>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, background: "white" }}>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={btnStyle}>
          {loading ? "Création..." : "Créer le compte"}
        </button>
      </div>
    </div>
  );
}

function SubscriptionBanner({ subscription }) {
  if (subscription === undefined) return null;

  if (subscription === null) {
    return (
      <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#8A6412" }}>
        ⚠️ Aucun abonnement associé à cet espace (créé avant la mise en place du système d'essai).
      </div>
    );
  }

  const planNom = subscription.subscription_plans?.nom || "?";

  if (subscription.status === "trial") {
    const finEssai = new Date(subscription.trial_ends_at);
    const joursRestants = Math.max(0, Math.floor((finEssai - new Date()) / 86400000));
    const expire = joursRestants === 0;
    return (
      <div style={{ background: expire ? "#FBEAE6" : "#EAF3DE", border: `1px solid ${expire ? "#F0B8AC" : "#C7DDA3"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: expire ? "#D64933" : "#3B6D11", fontWeight: 600 }}>
        {expire
          ? `⏰ Ton essai gratuit (${planNom}) est terminé.`
          : `🎁 Essai gratuit — plan ${planNom} — ${joursRestants} jour${joursRestants > 1 ? "s" : ""} restant${joursRestants > 1 ? "s" : ""}.`}
      </div>
    );
  }

  if (subscription.status === "active") {
    return (
      <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#3B6D11", fontWeight: 600 }}>
        ✅ Abonnement actif — plan {planNom}
      </div>
    );
  }

  if (subscription.status === "suspended") {
    return (
      <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#D64933", fontWeight: 600 }}>
        🔴 Abonnement suspendu — contacte le support pour réactiver.
      </div>
    );
  }

  return null;
}

function AdminPanel({ session }) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/admin-workspaces", {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      setDebug(json.debug || "");
    } else setData(json);
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <Centered>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ color: "#D64933", fontWeight: 600 }}>{error}</div>
          {debug && <div style={{ color: "#8A9089", fontSize: 12, marginTop: 12, wordBreak: "break-all" }}>{debug}</div>}
        </div>
      </Centered>
    );
  }

  if (data === undefined) return <Centered>Chargement...</Centered>;

  const statusLabels = { trial: "🎁 Essai", active: "✅ Actif", suspended: "🔴 Suspendu", cancelled: "Annulé" };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>Admin RecuVente</div>
        <a href="?" style={{ fontSize: 12.5, color: "#1a7a3c", textDecoration: "underline" }}>← Mon espace</a>
      </div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>Connecté en tant que {session.user.email}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#16231F", color: "white", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>MRR estimé</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: "#e8920a" }}>{data.mrr.toLocaleString("fr-FR")} XOF</div>
        </div>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>Entreprises</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{data.total}</div>
        </div>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase" }}>En essai / Actifs</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{data.enEssai} / {data.actifs}</div>
        </div>
      </div>

      {data.demandes && data.demandes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#8A6412" }}>💰 Demandes de paiement en attente ({data.demandes.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.demandes.map((d) => (
              <DemandeCard key={d.id} demande={d} onConfirmed={load} />
            ))}
          </div>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Toutes les entreprises</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.workspaces.map((ws) => (
          <div key={ws.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</div>
              <div style={{ fontSize: 11.5, color: "#6B7168" }}>{ws.ownerEmail} · {ws.nbMembres} membre{ws.nbMembres > 1 ? "s" : ""} · {ws.country}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {ws.subscription ? statusLabels[ws.subscription.status] || ws.subscription.status : "—"}
            </div>
          </div>
        ))}
        {data.workspaces.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucune entreprise inscrite pour l'instant.</div>}
      </div>
    </div>
  );
}

function AbonnementModal({ workspace, subscription, onClose }) {
  const [plans, setPlans] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    const { data: p } = await supabase.from("subscription_plans").select("*").order("prix");
    setPlans(p || []);
    const { data: d } = await supabase
      .from("upgrade_requests")
      .select("*, subscription_plans(nom)")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    setDemandes(d || []);
  }

  useEffect(() => {
    load();
  }, []);

  const demandeEnAttente = demandes.find((d) => d.statut === "en_attente");

  async function demander(planId) {
    setLoading(planId);
    const { error } = await supabase.from("upgrade_requests").insert([
      { workspace_id: workspace.id, plan_id: planId },
    ]);
    if (error) {
      setMessage("Erreur: " + error.message);
    } else {
      setMessage("✅ Demande envoyée ! Effectue le paiement Mobile Money et contacte le support pour confirmation.");
      await load();
    }
    setLoading(null);
  }

  const planActuel = subscription?.subscription_plans?.nom;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Mon abonnement</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {planActuel && (
          <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#3B6D11" }}>
            Plan actuel : <strong>{planActuel}</strong> — statut : {subscription.status}
          </div>
        )}

        {demandeEnAttente && (
          <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#8A6412" }}>
            ⏳ Demande en attente pour le plan <strong>{demandeEnAttente.subscription_plans?.nom}</strong> — en attente de confirmation.
          </div>
        )}

        {message && (
          <div style={{ background: "#EAF3DE", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#3B6D11" }}>
            {message}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map((p) => (
            <div key={p.id} style={{ border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nom}</div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: "#1a7a3c", marginTop: 3 }}>
                {Number(p.prix).toLocaleString("fr-FR")} {p.devise}<span style={{ fontSize: 11, color: "#8A9089", fontWeight: 400 }}>/mois</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 4 }}>
                {p.max_commandes_mois ? `${p.max_commandes_mois} commandes/mois` : "Commandes illimitées"} · {p.max_membres ? `${p.max_membres} membres max` : "Membres illimités"}
              </div>
              <button
                onClick={() => demander(p.id)}
                disabled={loading === p.id || !!demandeEnAttente}
                style={{ width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 8, border: "none", background: p.nom === planActuel ? "#DDD8CC" : "#1a7a3c", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                {loading === p.id ? "..." : p.nom === planActuel ? "Plan actuel" : "Demander ce plan"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemandeCard({ demande, onConfirmed }) {
  const [loading, setLoading] = useState(false);

  async function confirmer() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/confirmer-paiement", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
      body: JSON.stringify({ requestId: demande.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) await onConfirmed();
    else alert("Erreur (" + res.status + "): " + (json.error || "inconnue"));
    setLoading(false);
  }

  return (
    <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{demande.workspaceName}</div>
        <div style={{ fontSize: 12, color: "#8A6412" }}>
          Demande plan <strong>{demande.subscription_plans?.nom}</strong> — {Number(demande.subscription_plans?.prix).toLocaleString("fr-FR")} {demande.subscription_plans?.devise}
        </div>
      </div>
      <button onClick={confirmer} disabled={loading} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {loading ? "..." : "✅ Confirmer reçu"}
      </button>
    </div>
  );
}

const STATUTS = {
  en_cours: { label: "En cours", color: "#E8A93D", bg: "#FBF3E3" },
  confirmee: { label: "Confirmée", color: "#1F9D6E", bg: "#EAF7F1" },
  echouee: { label: "Échouée", color: "#D64933", bg: "#FBEAE6" },
};

function CommandeCard({ commande, currency, onStatusChanged, livreurs = [], closers = [], onAssignLivreur, onAssignCloser }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const s = STATUTS[commande.statut] || STATUTS.en_cours;

  async function changerStatut(nouveauStatut) {
    setLoading(true);
    const ancienStatut = commande.statut;
    const { error } = await supabase.from("commandes").update({ statut: nouveauStatut }).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([
        { commande_id: commande.id, note: `📋 Statut : ${STATUTS[ancienStatut]?.label || ancienStatut} → ${STATUTS[nouveauStatut]?.label || nouveauStatut}` },
      ]);
      await onStatusChanged();
    }
    setLoading(false);
    setOpen(false);
  }

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${s.color}`, borderRadius: 10, padding: "12px 14px" }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{commande.client}</div>
          <div style={{ fontSize: 12, color: "#6B7168" }}>{commande.produit} · {commande.zone}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: s.color, background: s.bg, padding: "2px 8px", borderRadius: 999, display: "inline-block" }}>
              {s.label}
            </span>
            {commande.livreur && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "#1a7a3c", background: "#EAF3DE", padding: "2px 8px", borderRadius: 999 }}>🚚 {commande.livreur}</span>
            )}
            {commande.closer && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A6412", background: "#FBF3E3", padding: "2px 8px", borderRadius: 999 }}>🎧 {commande.closer}</span>
            )}
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{Number(commande.montant).toLocaleString("fr-FR")} {currency}</div>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0EEE6" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(STATUTS).map(([key, val]) => (
              <button
                key={key}
                onClick={() => changerStatut(key)}
                disabled={loading || commande.statut === key}
                style={{
                  flex: 1,
                  padding: "7px 4px",
                  borderRadius: 7,
                  border: `1px solid ${commande.statut === key ? val.color : "#DDD8CC"}`,
                  background: commande.statut === key ? val.bg : "white",
                  color: commande.statut === key ? val.color : "#6B7168",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: commande.statut === key ? "default" : "pointer",
                }}
              >
                {val.label}
              </button>
            ))}
          </div>

          {(livreurs.length > 0 || closers.length > 0) && (
            <div style={{ display: "flex", gap: 8 }}>
              {livreurs.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10.5, color: "#8A9089", display: "block", marginBottom: 3 }}>Livreur</label>
                  <select
                    value={commande.livreur || ""}
                    onChange={(e) => onAssignLivreur(commande.id, e.target.value)}
                    style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12, background: "white" }}
                  >
                    <option value="">Non assigné</option>
                    {livreurs.map((l) => (
                      <option key={l.id} value={l.nom}>{l.nom}</option>
                    ))}
                  </select>
                </div>
              )}
              {closers.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10.5, color: "#8A9089", display: "block", marginBottom: 3 }}>Closer</label>
                  <select
                    value={commande.closer || ""}
                    onChange={(e) => onAssignCloser(commande.id, e.target.value)}
                    style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12, background: "white" }}
                  >
                    <option value="">Non assigné</option>
                    {closers.map((c) => (
                      <option key={c.id} value={c.nom}>{c.nom}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <HistoriqueRelances commandeId={commande.id} />
        </div>
      )}
    </div>
  );
}

function HistoriqueRelances({ commandeId }) {
  const [relances, setRelances] = useState(null);
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data } = await supabase.from("relances").select("*").eq("commande_id", commandeId).order("created_at", { ascending: false });
    setRelances(data || []);
  }

  useEffect(() => {
    load();
  }, [commandeId]);

  async function ajouter() {
    if (!note.trim()) return;
    setAdding(true);
    await supabase.from("relances").insert([{ commande_id: commandeId, note: note.trim() }]);
    setNote("");
    await load();
    setAdding(false);
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EEE6" }}>
      <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
        Historique {relances && relances.length > 0 && `(${relances.length})`}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouter()}
          placeholder="Ex: Appelé, pas de réponse"
          style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12 }}
        />
        <button onClick={ajouter} disabled={adding || !note.trim()} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "0 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          +
        </button>
      </div>
      {relances && relances.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
          {relances.map((r) => (
            <div key={r.id} style={{ background: "#FAFAF7", borderRadius: 7, padding: "6px 9px" }}>
              <div style={{ fontSize: 12 }}>{r.note}</div>
              <div style={{ fontSize: 10, color: "#8A9089", marginTop: 1 }}>
                {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EquipeModal({ titre, items, onAdd, onDelete, onClose }) {
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");

  async function ajouter() {
    if (!nom.trim()) return;
    await onAdd({ nom: nom.trim(), telephone: telephone.trim() });
    setNom("");
    setTelephone("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{titre}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          <input placeholder="Téléphone" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          <button onClick={ajouter} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>+</button>
        </div>

        {items.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucun {titre.toLowerCase()} pour l'instant.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.nom}</div>
                {it.telephone && <div style={{ fontSize: 11.5, color: "#6B7168" }}>{it.telephone}</div>}
              </div>
              <button onClick={() => onDelete(it.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function ProduitsModal({ produits, onAdd, onUpdateCout, onDelete, currency, onClose }) {
  const [nom, setNom] = useState("");
  const [cout, setCout] = useState("");
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");

  async function ajouter() {
    if (!nom.trim()) return;
    await onAdd({ nom: nom.trim(), cout_achat: cout });
    setNom("");
    setCout("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Catalogue produits</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 14 }}>
          Le nom doit correspondre exactement à celui utilisé dans tes commandes.
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input placeholder="Nom du produit" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 2 }} />
          <input placeholder="Coût" type="number" value={cout} onChange={(e) => setCout(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          <button onClick={ajouter} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>+</button>
        </div>

        {produits.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucun produit dans le catalogue.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {produits.map((p) => (
            <div key={p.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</div>
                {editId === p.id ? (
                  <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                    <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                    <button onClick={() => { onUpdateCout(p.id, editValue); setEditId(null); }} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "0 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>OK</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditId(p.id); setEditValue(String(p.cout_achat)); }} style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 12, color: "#6B7168", textDecoration: "underline", cursor: "pointer" }}>
                    Coût : {Number(p.cout_achat).toLocaleString("fr-FR")} {currency}
                  </button>
                )}
              </div>
              <button onClick={() => onDelete(p.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13, flexShrink: 0, marginLeft: 8 }}>🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
