import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Package, ListChecks, CheckCheck, Users, Truck, Headset, Calculator, Boxes, Target, Compass } from "lucide-react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";
import CataloguePublic from "./CataloguePublic.jsx";

const RV_CLE_FILE_ATTENTE = "rv_file_attente_hors_ligne";

function rvLireFileAttente() {
  try { return JSON.parse(localStorage.getItem(RV_CLE_FILE_ATTENTE) || "[]"); } catch (_) { return []; }
}
function rvEcrireFileAttente(liste) {
  try { localStorage.setItem(RV_CLE_FILE_ATTENTE, JSON.stringify(liste)); } catch (_) {}
}
function rvAjouterActionEnAttente(action) {
  const liste = rvLireFileAttente();
  liste.push({ ...action, idFile: Date.now() + "-" + Math.random().toString(36).slice(2), horodatage: new Date().toISOString() });
  rvEcrireFileAttente(liste);
  return liste.length;
}
function rvRetirerActionEnAttente(idFile) {
  rvEcrireFileAttente(rvLireFileAttente().filter((a) => a.idFile !== idFile));
}

function compresserImage(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            const nomCompresse = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], nomCompresse, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function cleanPhoneForWhatsApp(tel) {
  let digits = String(tel).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return "225" + digits;
}

function numeroFacture(commande) {
  const date = new Date(commande.created_at);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const short = commande.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `F-${y}${m}-${short}`;
}

async function genererFacturePDF(commande, workspace) {
  // Réutilise le numéro existant si cette commande a déjà été facturée, sinon en génère un nouveau
  let numeroReel;
  const { data: factureExistante } = await supabase.from("factures").select("numero").eq("commande_id", commande.id).maybeSingle();
  if (factureExistante) {
    numeroReel = factureExistante.numero;
  } else {
    const { data: nouveauNumero } = await supabase.rpc("prochain_numero_facture", { p_workspace_id: workspace.id });
    numeroReel = nouveauNumero || numeroFacture(commande);
    await supabase.from("factures").insert([{ workspace_id: workspace.id, commande_id: commande.id, numero: numeroReel, montant: commande.montant }]);
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const green = [26, 122, 60];
  const orange = [232, 146, 10];
  const gray = [107, 113, 104];
  const dark = [22, 35, 31];

  doc.setFillColor(...green);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(workspace.name.toUpperCase(), 15, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(workspace.country || "", 15, 25);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE", 195, 18, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(numeroReel, 195, 25, { align: "right" });

  let y = 46;
  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.text("FACTURÉ À", 15, y);
  doc.text("DATE", 140, y);

  y += 6;
  doc.setTextColor(...dark);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(commande.client || "", 15, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date(commande.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), 140, y);

  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(...gray);
  doc.text(commande.tel || "", 15, y);
  if (commande.zone) {
    y += 5;
    doc.text(commande.zone, 15, y, { maxWidth: 90 });
  }

  y += 14;
  doc.setFillColor(...green);
  doc.rect(15, y, 180, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PRODUIT", 18, y + 6);
  doc.text("MONTANT", 190, y + 6, { align: "right" });

  y += 9;
  doc.setDrawColor(230, 230, 225);
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.rect(15, y, 180, 12);
  doc.text(commande.produit || "", 18, y + 8, { maxWidth: 130 });
  const montantTxt = `${Number(commande.montant).toLocaleString("fr-FR")} ${workspace.currency}`;
  doc.text(montantTxt, 190, y + 8, { align: "right" });

  y += 20;
  doc.setDrawColor(...green);
  doc.setLineWidth(0.5);
  doc.line(120, y, 195, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text("TOTAL", 120, y);
  doc.setTextColor(...orange);
  doc.setFontSize(14);
  doc.text(montantTxt, 195, y, { align: "right" });

  y += 12;
  const estRetailFacture = workspace.activity_type === "retail";
  const soldeRestant = Number(commande.montant) - Number(commande.montant_paye || 0);
  const paiementPartiel = estRetailFacture && commande.montant_paye && soldeRestant > 0 && commande.statut !== "confirmee";
  const statutPaiement = commande.statut === "confirmee" ? (estRetailFacture ? "PAYÉE" : "PAYÉE (à la livraison)") : paiementPartiel ? "ACOMPTE VERSÉ" : "EN ATTENTE DE PAIEMENT";
  const couleurStatut = commande.statut === "confirmee" ? green : orange;
  doc.setFillColor(...couleurStatut);
  doc.roundedRect(15, y, 75, 9, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(statutPaiement, 52.5, y + 6, { align: "center" });

  if (paiementPartiel) {
    doc.setTextColor(...dark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Déjà payé : ${Number(commande.montant_paye).toLocaleString("fr-FR")} ${workspace.currency} — Solde restant : ${soldeRestant.toLocaleString("fr-FR")} ${workspace.currency}`, 15, y + 16);
    y += 8;
  }

  doc.setTextColor(...gray);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Merci pour votre confiance — ${workspace.name}`, 105, 280, { align: "center" });
  doc.text("Paiement à la livraison (COD) — Facture générée automatiquement", 105, 285, { align: "center" });

  const nomFichier = `Facture-${numeroFacture(commande)}.pdf`;
  const blob = doc.output("blob");
  const fichier = new File([blob], nomFichier, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    navigator.share({ files: [fichier], title: nomFichier }).catch(() => doc.save(nomFichier));
  } else {
    doc.save(nomFichier);
  }
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [nouvelleVersionDisponible, setNouvelleVersionDisponible] = useState(false);
  const versionActuelleRef = useRef(null);

  useEffect(() => {
    async function verifierVersion() {
      try {
        const resp = await fetch("/", { method: "HEAD", cache: "no-store" });
        const empreinte = resp.headers.get("etag") || resp.headers.get("last-modified");
        if (!empreinte) return;
        if (versionActuelleRef.current === null) {
          versionActuelleRef.current = empreinte;
        } else if (empreinte !== versionActuelleRef.current) {
          setNouvelleVersionDisponible(true);
        }
      } catch (_) {
        // Pas grave si ça échoue (hors ligne, etc.) — on réessaiera au prochain cycle.
      }
    }
    verifierVersion();
    const intervalle = setInterval(verifierVersion, 5 * 60 * 1000);
    function auRetourSurOnglet() {
      if (document.visibilityState === "visible") verifierVersion();
    }
    document.addEventListener("visibilitychange", auRetourSurOnglet);

    // Force aussi la mise à jour du service worker existant, au cas où un utilisateur
    // aurait une ancienne version qui intercepterait les requêtes et fausserait la détection.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.update());
      });
    }

    return () => {
      clearInterval(intervalle);
      document.removeEventListener("visibilitychange", auRetourSurOnglet);
    };
  }, []);

  useEffect(() => {
    if (!nouvelleVersionDisponible) return;
    const bandeau = document.createElement("div");
    bandeau.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a7a3c;color:white;padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:14px;font-family:sans-serif;font-size:13px;font-weight:600;flex-wrap:wrap;box-shadow:0 2px 10px rgba(0,0,0,0.2);";
    bandeau.innerHTML = `<span>🔄 Une nouvelle version de RecuVente est disponible.</span>`;
    const bouton = document.createElement("button");
    bouton.textContent = "Actualiser maintenant";
    bouton.style.cssText = "background:white;color:#1a7a3c;border:none;border-radius:8px;padding:6px 14px;font-weight:700;font-size:12.5px;cursor:pointer;";
    bouton.onclick = () => window.location.reload();
    bandeau.appendChild(bouton);
    document.body.appendChild(bandeau);
    return () => { document.body.removeChild(bandeau); };
  }, [nouvelleVersionDisponible]);

  const [workspace, setWorkspace] = useState(undefined);
  const [workspacesDisponibles, setWorkspacesDisponibles] = useState([]);
  const [workspaceActifId, setWorkspaceActifId] = useState(() => {
    try { return localStorage.getItem("rv_workspace_actif") || null; } catch { return null; }
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [showAjouterEspace, setShowAjouterEspace] = useState(false);
  const [domaineWorkspaceId, setDomaineWorkspaceId] = useState(null);
  const [domaineVerifie, setDomaineVerifie] = useState(false);

  useEffect(() => {
    const hote = typeof window !== "undefined" ? window.location.hostname : "";
    const domainesConnus = ["localhost", "127.0.0.1"];
    if (domainesConnus.includes(hote) || hote.endsWith(".vercel.app")) {
      setDomaineVerifie(true);
      return;
    }
    supabase.rpc("workspace_par_domaine", { p_domaine: hote }).then(({ data }) => {
      setDomaineWorkspaceId(data || null);
      setDomaineVerifie(true);
    }).catch(() => setDomaineVerifie(true));
  }, []);

  const aEuUneSessionRef = useRef(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) aEuUneSessionRef.current = true;
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        aEuUneSessionRef.current = true;
      } else if (aEuUneSessionRef.current) {
        // La session vient d'expirer (ou déconnexion manuelle) : on envoie directement
        // vers l'écran de connexion, pas vers la page d'accueil marketing.
        aEuUneSessionRef.current = false;
        if (typeof window !== "undefined") window.location.href = "?login=1";
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadWorkspace(idASelectionner) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      setWorkspace(null);
      setWorkspacesDisponibles([]);
      return;
    }
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces(id, name, slug, country, currency, created_at, webhook_secret, activity_type, whatsapp_number, logo_url, banniere_url, couleur_marque, description_boutique, politique_livraison, politique_retours, politique_confidentialite, facebook_pixel_id, facebook_capi_token, facebook_url, instagram_url, tiktok_url, marque_blanche, frais_livraison, frais_expedition, store_config, store_config_published, store_is_published, domaine_personnalise, facebook_domain_verification, label_livraison_locale, label_livraison_expedition, langue, countries_livraison, temoignages_manuels, tiktok_pixel_id, azali_config)")
      .eq("user_id", userId);
    if (error) {
      const estErreurAuth = /jwt|token|expired|unauthorized|401|invalid refresh/i.test(error.message || "") || error.code === "PGRST301";
      if (estErreurAuth) {
        // Jeton de connexion cassé/périmé (souvent après une longue inactivité) :
        // on nettoie proprement la session plutôt que de laisser la personne
        // bloquée sur "Chargement de ton espace…" indéfiniment. La déconnexion
        // déclenche automatiquement le renvoi vers l'écran de connexion.
        console.error("Session invalide détectée, déconnexion automatique :", error.message);
        await supabase.auth.signOut();
        return;
      }
      // Erreur réseau/temporaire (pas liée au jeton) : on NE TOUCHE PAS à l'espace
      // déjà chargé, pour éviter de renvoyer la personne vers "Créer mon espace"
      // à cause d'un simple raté réseau.
      console.error("Erreur de chargement de l'espace (non bloquant) :", error.message);
      if (workspace === undefined) {
        // Tout premier chargement : on retente une fois après une courte pause,
        // plutôt que de laisser la personne bloquée sur l'écran de chargement.
        setTimeout(() => loadWorkspace(idASelectionner), 1500);
      }
      return;
    }
    if (data && data.length > 0) {
      const liste = data.filter((d) => d.workspaces).map((d) => ({ ...d.workspaces, role: d.role }));
      setWorkspacesDisponibles(liste);
      const cibleId = idASelectionner || workspaceActifId;
      const actif = liste.find((w) => w.id === cibleId) || liste[0];
      setWorkspace(actif);
      if (actif && actif.id !== workspaceActifId) {
        try { localStorage.setItem("rv_workspace_actif", actif.id); } catch {}
        setWorkspaceActifId(actif.id);
      }
    } else {
      // Ici, la requête a bien réussi et a confirmé qu'il n'y a réellement aucun espace.
      setWorkspace(null);
      setWorkspacesDisponibles([]);
    }
  }

  function changerEspace(id) {
    try { localStorage.setItem("rv_workspace_actif", id); } catch {}
    setWorkspaceActifId(id);
    const w = workspacesDisponibles.find((x) => x.id === id);
    if (w) setWorkspace(w);
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

  async function creerWorkspace(nom, activityType, whatsappNumber) {
    setLoadingWorkspace(true);
    const { data: ws, error } = await supabase
      .from("workspaces")
      .insert([{ owner_id: session.user.id, name: nom, activity_type: activityType || "cod_ecommerce", whatsapp_number: whatsappNumber }])
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
    // Génère un identifiant lisible (ex: azali-express) pour les liens de boutique
    const { data: slugGenere } = await supabase.rpc("generer_slug_boutique", { p_nom: nom, p_workspace_id: ws.id });
    if (slugGenere) {
      await supabase.from("workspaces").update({ slug: slugGenere }).eq("id", ws.id);
    }
    const dansSeptJours = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: erreurAbonnement } = await supabase.from("subscriptions").insert([
      { workspace_id: ws.id, status: "trial", trial_ends_at: dansSeptJours },
    ]);
    if (erreurAbonnement) {
      console.error("Erreur création abonnement d'essai:", erreurAbonnement.message);
    }
    fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "welcome", email: session.user.email, workspaceName: nom }),
    }).catch(() => {}); // silencieux si l'email échoue, ne bloque jamais l'inscription
    try { localStorage.setItem("rv_workspace_actif", ws.id); } catch {}
    await loadWorkspace(ws.id);
    setLoadingWorkspace(false);
    setShowAjouterEspace(false);
  }

  const catalogueId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("catalogue") : null;
  if (catalogueId) return <CataloguePublic workspaceId={catalogueId} />;

  const boutiqueSlug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("boutique") : null;
  if (boutiqueSlug) return <CataloguePublic slug={boutiqueSlug} />;

  if (!domaineVerifie) return <Centered>Chargement…</Centered>;
  if (domaineWorkspaceId) return <CataloguePublic workspaceId={domaineWorkspaceId} />;

  if (session === undefined) return <Centered>Chargement…</Centered>;

  const resetPwParam = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("resetpw") === "1";
  if (resetPwParam && session) return <NouveauMotDePasseScreen />;

  const pageParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("page") : null;
  if (pageParam === "cgu" || pageParam === "confidentialite") return <PageLegale page={pageParam} />;
  if (pageParam === "impact") return <PageImpact />;

  if (!session) {
    const wantsAuth = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("auth") === "1";
    const wantsLogin = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("login") === "1";
    const wantsSignup = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signup") === "1";
    if (wantsLogin) return <AuthScreen modeInitial="login" />;
    if (!wantsAuth) return <LandingPage />;
    return <AuthScreen modeInitial={wantsSignup ? "signup" : "login"} />;
  }

  const isAdminRoute = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1";
  if (isAdminRoute) return <AdminPanel session={session} />;

  if (workspace === undefined) return <Centered>Chargement de ton espace…</Centered>;
  if (workspace === null) return <CreateWorkspaceScreen onCreate={creerWorkspace} loading={loadingWorkspace} />;

  return (
    <>
      <WorkspaceDashboard
        key={workspace.id}
        workspace={workspace}
        session={session}
        subscription={subscription}
        workspacesDisponibles={workspacesDisponibles}
        onChangerEspace={changerEspace}
        onDemanderAjoutEspace={() => setShowAjouterEspace(true)}
      />
      {showAjouterEspace && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }} onClick={() => setShowAjouterEspace(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <CreateWorkspaceScreen onCreate={creerWorkspace} loading={loadingWorkspace} onAnnuler={() => setShowAjouterEspace(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function Centered({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", background: "#FAFAF7" }}>
      {children}
    </div>
  );
}

function SkeletonLigne({ hauteur = 14, largeur = "100%", radius = 6, style = {} }) {
  return (
    <div
      style={{
        height: hauteur,
        width: largeur,
        borderRadius: radius,
        background: "linear-gradient(90deg, #ECE8DC 25%, #F5F2E8 37%, #ECE8DC 63%)",
        backgroundSize: "400% 100%",
        animation: "rvSkeletonPulse 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function SkeletonCarteCommande() {
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px", marginBottom: 8 }}>
      <style>{`@keyframes rvSkeletonPulse { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <SkeletonLigne largeur="45%" hauteur={15} />
        <SkeletonLigne largeur="20%" hauteur={15} />
      </div>
      <SkeletonLigne largeur="65%" hauteur={11} style={{ marginBottom: 8 }} />
      <SkeletonLigne largeur="30%" hauteur={11} />
    </div>
  );
}

function SkeletonListe({ nombre = 4 }) {
  return (
    <div>
      {Array.from({ length: nombre }).map((_, i) => <SkeletonCarteCommande key={i} />)}
    </div>
  );
}

function EtatVide({ icone = "📭", titre, description, texteBouton, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 20px", color: "#6B7168" }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.85 }}>{icone}</div>
      <div style={{ fontWeight: 700, fontSize: 14.5, color: "#16231F", marginBottom: 6 }}>{titre}</div>
      {description && <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 320, margin: "0 auto 18px" }}>{description}</div>}
      {texteBouton && onAction && (
        <button
          onClick={onAction}
          style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
        >
          {texteBouton}
        </button>
      )}
    </div>
  );
}

function RapportSemaineModal({ rapport, currency, workspaceName, onClose }) {
  const cartes = [
    { icone: "💰", label: "Ventes confirmées", valeur: `${rapport.ca.toLocaleString("fr-FR")} ${currency}`, sousTexte: `${rapport.nbVentes} commande${rapport.nbVentes > 1 ? "s" : ""}` },
  ];
  if (rapport.clientsRecuperes > 0) {
    cartes.push({ icone: "🎯", label: "Clients à risque récupérés", valeur: `${rapport.clientsRecuperes}`, sousTexte: "grâce à tes relances" });
  }
  if (rapport.meilleurProduit) {
    cartes.push({ icone: "🏅", label: "Produit star de la semaine", valeur: rapport.meilleurProduit, sousTexte: `${rapport.meilleurProduitVentes} vente${rapport.meilleurProduitVentes > 1 ? "s" : ""}` });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "linear-gradient(160deg, #0d2417 0%, #1a4a2e 55%, #0d2417 100%)", borderRadius: 24, padding: "32px 26px", width: "100%", maxWidth: 380, color: "white", position: "relative", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.4)" }}
      >
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,146,10,0.35) 0%, rgba(232,146,10,0) 70%)", pointerEvents: "none" }} />
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 28, height: 28, borderRadius: "50%", fontSize: 15, cursor: "pointer" }}>×</button>

        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{workspaceName}</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 22, lineHeight: 1.2 }}>Ta semaine en<br/>un coup d'œil 📊</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {cartes.map((c, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icone}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{c.valeur}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{c.sousTexte}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ width: "100%", background: "linear-gradient(135deg,#FF6A00,#FFB000)", color: "white", border: "none", borderRadius: 12, padding: "13px 0", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
        >
          Continuer ma semaine →
        </button>
      </div>
    </div>
  );
}

function ReunionEquipeModal({ workspace, onClose }) {
  const [lienCopie, setLienCopie] = useState(false);
  const nomSalle = `RecuVente-${(workspace.name || "equipe").replace(/[^a-zA-Z0-9]+/g, "-")}-${workspace.id.slice(0, 8)}`;
  const lienReunion = `https://meet.jit.si/${nomSalle}`;

  function copierLien() {
    navigator.clipboard.writeText(lienReunion);
    setLienCopie(true);
    setTimeout(() => setLienCopie(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.85)", display: "flex", flexDirection: "column", zIndex: 200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#16231F", flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: "white", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          📹 Réunion d'équipe — {workspace.name}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={copierLien}
            style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {lienCopie ? "✅ Copié !" : "📋 Copier le lien pour inviter"}
          </button>
          <button
            onClick={onClose}
            style={{ background: "#D64933", border: "none", color: "white", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            ✕ Quitter la réunion
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", padding: "6px 16px", background: "#0d1712" }}>
        💡 Toute personne de ton équipe qui clique sur "📹 Réunion d'équipe" (ou sur un lien copié) rejoint automatiquement cette même salle.
      </div>
      <iframe
        src={lienReunion}
        title="Réunion d'équipe"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{ flex: 1, border: "none", width: "100%" }}
      />
    </div>
  );
}

function LandingPage() {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState(null);
  const [active, setActive] = useState('01');
  const [openFaq, setOpenFaq] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.from('subscription_plans').select('*').order('prix').then(({ data }) => {
      setPlans((data || []).filter((p) => Number(p.prix) > 0));
    });
    const pixelId = import.meta.env.VITE_RECUVENTE_PIXEL_ID;
    if (pixelId && !window.fbq) {
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', pixelId); window.fbq('track', 'PageView');
    }
    supabase.rpc('statistiques_plateforme_publiques').then(({ data }) => {
      if (data && data[0]) setStats(data[0]);
    });
  }, []);

  function trackLead(eventName = 'Lead') {
    if (window.fbq) window.fbq('track', eventName);
  }

  function goSignup(plan) {
    try {
      if (plan?.id) localStorage.setItem('rv_plan_intention', JSON.stringify({ id: plan.id, nom: plan.nom, prix: plan.prix, devise: plan.devise }));
    } catch (_) {}
    trackLead('Lead');
    window.location.href = '?auth=1&signup=1';
  }

  const money = (value) => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('fr-FR');
  const statValue = (key) => stats && stats[key] !== undefined && stats[key] !== null ? money(stats[key]) : '—';
  // Valeur fixée manuellement pour l'affichage "Commerce confirmé" du Hero 3D, sur décision explicite du client
  // (au lieu de la vraie statistique statValue('montant_total_confirme')). À ajuster ou retirer ici si besoin.
  const AFFICHAGE_COMMERCE_HERO = '33 000 000';
  const activities = [
    ['🛒','E-commerce & COD','Commandes, boutique, closers, livraison, récupération et suivi.','Transformez vos ventes dispersées en une machine commerciale pilotable.'],
    ['🏪','Commerce physique','Ventes, stock, clients, paiements et performance.','Donnez à votre point de vente une vision claire de ce qui se passe vraiment.'],
    ['🏠','Immobilier','Locataires, loyers, paiements, relances et dossiers.','Centralisez les opérations qui demandent rigueur, suivi et visibilité.'],
    ['🍽️','Restaurant','Menu, tables, commandes, préparation, service et livraison.','Faites circuler la commande sans perdre l’information entre les équipes.'],
    ['🚗','Location','Véhicules / matériel, réservations, dates, cautions et disponibilité.','Passez du suivi manuel à une activité organisée autour des bonnes données.'],
    ['🗂️','Autre activité','Conseil, agence, clinique, association, formation, services et autres organisations.','Adaptez votre espace à votre métier sans renoncer au pilotage centralisé.']
  ];
  const pillars = [
    {id:'01',title:'VENDRE',desc:'Mettre votre offre devant le bon client et transformer l’intérêt en transaction.',items:['Boutique & catalogue','Produits & collections','Commandes & clients','Acquisition & marketing']},
    {id:'02',title:'CONVERTIR',desc:'Donner à votre équipe commerciale un fil clair du contact à la confirmation.',items:['Closers & suivi','Confirmation des commandes','Historique client','Relances & récupération']},
    {id:'03',title:'OPÉRER',desc:'Faire avancer chaque opération avec des responsabilités visibles.',items:['Livreurs & affectations','Statuts opérationnels','Reprogrammation','Suivi des opérations']},
    {id:'04',title:'ENCAISSER',desc:'Rapprocher ventes, paiements et contrôle financier.',items:['Paiements & Mobile Money','Factures & reçus','Dépôts & commissions','Suivi comptable']},
    {id:'05',title:'RÉACTIVER',desc:'Transformer l’historique client en nouvelles opportunités quand le code le permet.',items:['Clients actifs & dormants','Historique d’achat','Campagnes','Relances WhatsApp']},
    {id:'06',title:'PILOTER',desc:'Passer de “je crois que ça marche” à “je vois ce qui se passe”.',items:['Tableaux de bord','Rôles & permissions','Rentabilité','Plusieurs espaces']}
  ];
  const faqs = [
    ['Qu’est-ce que RecuVente ?','RecuVente est une plateforme centralisée de gestion et de pilotage d’activité. Elle rassemble, selon votre configuration, ventes, équipes, opérations, paiements, boutique, acquisition et indicateurs dans un même environnement.'],
    ['À quelles activités s’adresse RecuVente ?','L’application prévoit des espaces pour l’e-commerce & COD, le commerce physique, l’immobilier, le restaurant, la location et une catégorie Autre activité.'],
    ['Puis-je créer ma boutique ?','Oui. Le Store Builder existant permet de construire et personnaliser votre boutique avec les éléments prévus dans l’application.'],
    ['Puis-je connecter Shopify ?','Oui. Le code existant prévoit une intégration Shopify avec les mécanismes actuellement disponibles dans RecuVente.'],
    ['Puis-je travailler avec une équipe ?','Oui. L’application comporte des espaces et rôles dédiés notamment à la direction, aux closers, aux livreurs, à la comptabilité et aux responsables.'],
    ['Comment fonctionne l’abonnement ?','Les offres affichées sur cette page sont chargées depuis la table subscription_plans et seuls les plans payants sont présentés.'],
    ['Puis-je changer de plan ?','Les possibilités de changement dépendent du parcours d’abonnement et de la configuration actuelle de votre compte.'],
    ['Mes données sont-elles séparées des autres entreprises ?','L’application est conçue autour d’espaces/workspaces et de contrôles d’accès. Les détails exacts de séparation et de sécurité sont ceux implémentés par votre configuration Supabase.'],
    ['Puis-je utiliser RecuVente sur mobile ?','Oui, l’interface de cette landing page est responsive et l’application est conçue pour des usages terrain ; l’expérience exacte dépend du module utilisé.']
  ];
  const activePillar = pillars.find((p) => p.id === active) || pillars[0];
  const liveStats = [
    ['ENTREPRISES ACTIVES', statValue('nb_entreprises_actives'), 'espaces en activité'],
    ['COMMANDES CONFIRMÉES', statValue('nb_commandes_confirmees'), 'signal commercial'],
    ['COMMERCE PILOTÉ', '3 300 000', 'FCFA · ambition de croissance'],
    ['LIVREURS ACTIFS', statValue('nb_livreurs_actifs'), 'opérations terrain'],
    ['COMMISSIONS ESTIMÉES', statValue('commissions_livreurs_estimees'), 'FCFA']
  ];

  return (
    <div className="rva rva-premium-africa">
      <style>{`
        :root{--ink:#04140d;--deep:#031b12;--deep2:#06291b;--emerald:#0bd47d;--lime:#8dffca;--mint:#dfffee;--gold:#f7c95b;--paper:#f7fbf8;--line:rgba(4,20,13,.11);--muted:#607269;--shadow:0 30px 90px rgba(0,42,25,.16)}
        .rva{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);overflow:hidden}
        .rva *{box-sizing:border-box}.rva a{text-decoration:none}.rva button{font:inherit}.rva .wrap{width:min(1180px,calc(100% - 40px));margin:auto}
        .rva-nav{position:sticky;top:0;z-index:50;background:rgba(3,27,18,.88);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.08)}
        .rva-navin{height:76px;display:flex;align-items:center;justify-content:space-between}.rva-logo{display:flex;align-items:center;gap:10px;color:#fff;font-weight:950;letter-spacing:-.04em;font-size:20px}.rva-logo i{width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#a7ffd5,#16dc88 55%,#08734b);box-shadow:0 0 35px rgba(18,232,139,.45);display:grid;place-items:center;color:#042417;font-style:normal;font-size:15px}.rva-links{display:flex;gap:25px;align-items:center}.rva-links a{color:#bdd0c6;font-size:12px;font-weight:750}.rva-links a:hover{color:#fff}.rva-navcta{padding:12px 17px;border-radius:12px;background:#fff;color:#042016!important;box-shadow:0 8px 28px rgba(255,255,255,.12)}.rva-menu{display:none;background:transparent;border:0;color:#fff;font-size:25px}
        .rva-hero{position:relative;background:radial-gradient(circle at 76% 22%,rgba(18,235,139,.22),transparent 25%),radial-gradient(circle at 14% 30%,rgba(88,255,192,.1),transparent 24%),linear-gradient(135deg,#03130d 0%,#05281a 47%,#03170f 100%);color:#fff;padding:82px 0 90px;isolation:isolate}.rva-hero:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to bottom,black,transparent 88%);pointer-events:none}.rva-glow{position:absolute;width:520px;height:520px;border-radius:50%;background:#0bd47d;filter:blur(140px);opacity:.11;right:-170px;top:-170px;z-index:-1}.rva-heroGrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:50px;align-items:center}.rva-kicker{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(141,255,202,.28);border-radius:999px;color:#a9ffd5;background:rgba(11,212,125,.08);font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.rva-kicker b{width:7px;height:7px;border-radius:50%;background:#8dffca;box-shadow:0 0 18px #8dffca}.rva-h1{font-size:clamp(55px,7.3vw,92px);line-height:.9;letter-spacing:-.075em;margin:25px 0 25px;font-weight:950}.rva-h1 span{display:block;color:#79ffbd;text-shadow:0 0 40px rgba(39,241,145,.2)}.rva-heroCopy>p{max-width:620px;color:#b8cbc1;font-size:17px;line-height:1.65;margin:0 0 30px}.rva-actions{display:flex;gap:12px;flex-wrap:wrap}.rva-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 21px;border-radius:14px;font-weight:900;font-size:13px;transition:.25s;cursor:pointer}.rva-btn:hover{transform:translateY(-3px)}.rva-btn.primary{background:linear-gradient(135deg,#b7ffdb,#31ec9a 55%,#08b96a);color:#032014;box-shadow:0 15px 40px rgba(11,212,125,.25)}.rva-btn.ghost{border:1px solid rgba(255,255,255,.16);color:#fff;background:rgba(255,255,255,.04)}
        .rva-proof{display:flex;gap:18px;flex-wrap:wrap;margin-top:25px;color:#8fa99d;font-size:11px}.rva-proof span{display:flex;align-items:center;gap:7px}.rva-proof b{color:#e4fff1}
        .rva-stage{position:relative;height:570px;perspective:1600px;transform-style:preserve-3d}.rva-orbit{position:absolute;inset:55px 10px 40px;border:1px solid rgba(117,255,193,.13);border-radius:50%;transform:rotateX(62deg) rotateZ(-14deg);box-shadow:0 0 100px rgba(11,212,125,.07)}.rva-orbit:before,.rva-orbit:after{content:"";position:absolute;inset:45px;border:1px solid rgba(117,255,193,.1);border-radius:50%}.rva-orbit:after{inset:95px}.rva-dashboard{position:absolute;left:5%;right:5%;top:65px;transform:rotateY(-9deg) rotateX(5deg) rotateZ(-1deg);background:linear-gradient(145deg,rgba(16,57,40,.96),rgba(4,24,16,.98));border:1px solid rgba(166,255,215,.18);border-radius:25px;padding:17px;box-shadow:35px 45px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.08);transform-style:preserve-3d}.rva-dashboard:before{content:"";position:absolute;inset:0;border-radius:25px;background:linear-gradient(110deg,rgba(255,255,255,.08),transparent 24%,transparent 75%,rgba(11,212,125,.07));pointer-events:none}.rva-dbtop{display:flex;align-items:center;justify-content:space-between;padding:3px 4px 15px}.rva-dbbrand{font-size:12px;font-weight:900;color:#effff7}.rva-dbbrand small{display:block;color:#7e9c8d;font-size:8px;letter-spacing:.12em;margin-top:3px}.rva-live{font-size:8px;color:#8dffca;background:rgba(11,212,125,.1);border:1px solid rgba(141,255,202,.15);padding:6px 9px;border-radius:999px}.rva-dbgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.rva-kpi{padding:15px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);min-height:105px}.rva-kpi small{color:#7e9c8d;font-size:8px;font-weight:800;letter-spacing:.08em}.rva-kpi strong{display:block;color:#fff;font-size:24px;letter-spacing:-.05em;margin-top:13px}.rva-kpi em{display:block;color:#7bffb9;font-style:normal;font-size:8px;margin-top:4px}.rva-dbmain{display:grid;grid-template-columns:1.4fr .8fr;gap:10px;margin-top:10px}.rva-chart,.rva-side{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);border-radius:17px;padding:16px}.rva-charthead{display:flex;justify-content:space-between;color:#dfffee;font-size:10px;font-weight:850}.rva-chart svg{width:100%;height:150px;margin-top:10px;overflow:visible}.rva-chart path{fill:none;stroke:#65ffb3;stroke-width:3;filter:drop-shadow(0 0 7px rgba(101,255,179,.35))}.rva-chart .area{fill:rgba(101,255,179,.08);stroke:none}.rva-side h4{margin:0;color:#fff;font-size:10px}.rva-mini{display:flex;justify-content:space-between;align-items:end;height:145px;padding-top:15px;gap:7px}.rva-mini i{flex:1;border-radius:7px 7px 2px 2px;background:linear-gradient(to top,#0aa865,#91ffd0);box-shadow:0 0 18px rgba(11,212,125,.12)}.rva-float{position:absolute;z-index:5;padding:14px 15px;border-radius:16px;background:rgba(245,255,250,.96);color:#052016;box-shadow:0 25px 55px rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.55);min-width:150px;backdrop-filter:blur(12px);animation:rvaFloat 5s ease-in-out infinite}.rva-float small{display:block;color:#6d7f76;font-size:8px;font-weight:900;letter-spacing:.08em}.rva-float strong{display:block;font-size:21px;margin-top:7px;letter-spacing:-.05em}.rva-float.one{right:-12px;top:105px}.rva-float.two{left:-14px;bottom:95px;animation-delay:-2s}.rva-float.three{right:8px;bottom:28px;animation-delay:-3.5s}.rva-float b{color:#078b56;font-size:9px}.rva-3dbadge{position:absolute;left:50%;bottom:1px;transform:translateX(-50%) translateZ(80px);padding:10px 14px;border-radius:12px;background:rgba(141,255,202,.09);border:1px solid rgba(141,255,202,.2);color:#baffdc;font-size:9px;font-weight:900;letter-spacing:.08em;white-space:nowrap;box-shadow:0 0 35px rgba(11,212,125,.12)}
        @keyframes rvaFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(.6deg)}}
        .rva-numbers{background:#fff;border-bottom:1px solid var(--line);box-shadow:0 18px 55px rgba(0,30,18,.06);position:relative;z-index:3}.rva-numbergrid{display:grid;grid-template-columns:repeat(5,1fr)}.rva-number{padding:26px 18px;border-right:1px solid var(--line)}.rva-number:last-child{border-right:0}.rva-number small{font-size:8px;color:#71827a;font-weight:900;letter-spacing:.1em}.rva-number strong{display:block;font-size:28px;letter-spacing:-.06em;color:#052619;margin-top:7px}.rva-number span{font-size:9px;color:#87958e}
        .rva-section{padding:115px 0}.rva-dark{background:linear-gradient(145deg,#03150e,#052b1c);color:#fff}.rva-center{text-align:center;max-width:780px;margin:0 auto 55px}.rva-label{font-size:9px;font-weight:950;letter-spacing:.16em;color:#07905a}.rva-dark .rva-label{color:#7effbc}.rva-title{font-size:clamp(44px,5.8vw,72px);line-height:.96;letter-spacing:-.065em;margin:17px 0}.rva-title span{color:#079c61}.rva-dark .rva-title span{color:#79ffbd}.rva-desc{font-size:16px;line-height:1.7;color:var(--muted);max-width:680px;margin:auto}.rva-dark .rva-desc{color:#a9c0b5}
        .rva-why{display:grid;grid-template-columns:1fr 1.2fr;gap:28px;align-items:stretch}.rva-manifesto{padding:45px;border-radius:30px;background:linear-gradient(150deg,#0a5d3c,#032216);color:#fff;position:relative;overflow:hidden;box-shadow:var(--shadow)}.rva-manifesto:after{content:"";position:absolute;width:280px;height:280px;border-radius:50%;right:-110px;bottom:-120px;background:#24e894;filter:blur(50px);opacity:.2}.rva-manifesto h3{font-size:38px;line-height:1;letter-spacing:-.06em;margin:0 0 20px}.rva-manifesto p{color:#b9d4c8;line-height:1.7;font-size:14px}.rva-compare{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#cdd9d3;border-radius:30px;overflow:hidden;box-shadow:var(--shadow)}.rva-compare>div{padding:35px;background:#fff}.rva-compare .good{background:#ecfff5}.rva-compare h4{font-size:12px;letter-spacing:.08em;margin:0 0 22px}.rva-compare ul{list-style:none;padding:0;margin:0;display:grid;gap:15px}.rva-compare li{font-size:13px;line-height:1.5;color:#53635b}.rva-compare li b{display:inline-grid;place-items:center;width:23px;height:23px;border-radius:50%;margin-right:8px;background:#edf1ee;color:#718078}.rva-compare .good li b{background:#b8f6d7;color:#087c50}
        .rva-3dsection{background:radial-gradient(circle at 50% 0,rgba(31,235,145,.1),transparent 35%),#f2faf5}.rva-boutique{display:grid;grid-template-columns:.85fr 1.15fr;gap:60px;align-items:center}.rva-copy h2{font-size:clamp(44px,5.7vw,70px);line-height:.96;letter-spacing:-.065em;margin:15px 0}.rva-copy h2 span{color:#06975d}.rva-copy p{color:#61736a;line-height:1.75;font-size:15px}.rva-paths{display:grid;gap:12px;margin:28px 0}.rva-path{display:grid;grid-template-columns:42px 1fr;gap:13px;padding:15px;border:1px solid var(--line);background:#fff;border-radius:15px}.rva-pathnum{font-size:10px;font-weight:950;color:#07905a}.rva-path b{display:block;font-size:12px}.rva-path span{display:block;font-size:10px;color:#718078;line-height:1.55;margin-top:4px}.rva-3dstore{height:520px;perspective:1400px;position:relative}.rva-browser3d{position:absolute;inset:30px 0 50px;transform:rotateY(-13deg) rotateX(6deg) rotateZ(1deg);border-radius:24px;background:#071b12;border:1px solid #a0ffd0;box-shadow:45px 55px 90px rgba(0,50,30,.25);padding:12px;transform-style:preserve-3d}.rva-browser3d:after{content:"";position:absolute;inset:15px -18px -20px 18px;background:#032216;border-radius:24px;transform:translateZ(-35px);z-index:-1;box-shadow:0 30px 55px rgba(0,30,18,.25)}.rva-browserbar{height:30px;display:flex;gap:6px;align-items:center}.rva-browserbar i{width:6px;height:6px;border-radius:50%;background:#7affbc}.rva-browserbar span{margin-left:8px;color:#668378;font-size:8px}.rva-shop{height:calc(100% - 30px);background:linear-gradient(145deg,#f9fffb,#e6fff1);border-radius:15px;padding:22px;color:#082519;overflow:hidden}.rva-shophead{display:flex;justify-content:space-between;font-size:10px;font-weight:950}.rva-shophero{margin-top:20px;display:grid;grid-template-columns:1.1fr .9fr;gap:15px;align-items:center}.rva-shophero h3{font-size:34px;line-height:.95;letter-spacing:-.06em;margin:0}.rva-shophero p{font-size:9px;color:#667a70;line-height:1.5}.rva-productcard{height:230px;border-radius:20px;background:linear-gradient(145deg,#0a6b45,#031b11);box-shadow:20px 25px 45px rgba(0,70,40,.22);transform:rotateY(-8deg) rotateX(4deg);display:flex;align-items:center;justify-content:center;position:relative}.rva-productcard:before{content:"";width:110px;height:145px;border-radius:22px;background:linear-gradient(145deg,#a8ffd3,#0ed57c);box-shadow:0 20px 45px rgba(11,212,125,.3);transform:rotate(-12deg)}.rva-productcard:after{content:"PRODUIT";position:absolute;bottom:18px;left:20px;color:#dffff0;font-size:8px;font-weight:950;letter-spacing:.1em}.rva-shopfooter{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:18px}.rva-shopitem{padding:12px;background:#fff;border:1px solid #d9ebe1;border-radius:12px}.rva-shopitem small{font-size:7px;color:#789087}.rva-shopitem b{display:block;font-size:11px;margin-top:5px}.rva-connector{position:absolute;right:-18px;top:46%;padding:12px 14px;border-radius:14px;background:#fff;color:#05271a;font-size:9px;font-weight:950;box-shadow:0 20px 45px rgba(0,30,18,.22);transform:translateZ(80px)}
        .rva-activities{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.rva-activity{min-height:275px;padding:28px;border-radius:24px;background:#fff;border:1px solid var(--line);position:relative;overflow:hidden;transition:.25s;box-shadow:0 10px 35px rgba(0,35,20,.04)}.rva-activity:nth-child(2),.rva-activity:nth-child(5){transform:translateY(22px)}.rva-activity:hover{transform:translateY(-8px);box-shadow:0 28px 70px rgba(0,70,40,.13);border-color:#8deac0}.rva-activity:nth-child(2):hover,.rva-activity:nth-child(5):hover{transform:translateY(12px)}.rva-activity:after{content:"";position:absolute;width:130px;height:130px;border-radius:50%;right:-60px;bottom:-65px;background:#dfffee}.rva-acttop{display:flex;justify-content:space-between}.rva-actnum{font-size:8px;color:#a1ada7;font-weight:950}.rva-acticon{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,#ecfff5,#bff8d9);font-size:25px;box-shadow:0 10px 25px rgba(10,170,100,.1);margin:20px 0}.rva-activity h3{font-size:18px;letter-spacing:-.03em;margin:0 0 9px}.rva-activity p{font-size:11px;color:#6a7972;line-height:1.65;margin:0}.rva-activity strong{display:block;margin-top:18px;font-size:10px;color:#078d57;line-height:1.45}
        .rva-system{background:#031a11;color:#fff}.rva-systemGrid{display:grid;grid-template-columns:.72fr 1.28fr;gap:45px;align-items:center}.rva-systemCopy h2{font-size:clamp(46px,6vw,76px);line-height:.93;letter-spacing:-.07em;margin:15px 0}.rva-systemCopy h2 span{color:#7effbd}.rva-systemCopy p{color:#9db5aa;line-height:1.7;font-size:14px}.rva-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:25px}.rva-pill{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.04);color:#a9c0b5;border-radius:999px;padding:9px 11px;font-size:9px;font-weight:900;cursor:pointer}.rva-pill.active{background:#75ffb8;color:#042217;border-color:#75ffb8;box-shadow:0 10px 30px rgba(11,212,125,.16)}.rva-systemCard{border-radius:30px;padding:25px;background:linear-gradient(145deg,#0a3825,#041a11);border:1px solid rgba(141,255,202,.15);box-shadow:35px 45px 90px rgba(0,0,0,.3);transform:rotateY(-6deg) rotateX(2deg)}.rva-systemHead{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08)}.rva-systemHead strong{font-size:16px;color:#fff}.rva-systemHead span{font-size:10px;color:#8ea99c;text-align:right}.rva-systemNumber{font-size:8px;color:#75ffb8;font-weight:950;letter-spacing:.12em;margin-top:22px}.rva-systemNumber b{display:block;font-size:38px;color:#fff;letter-spacing:-.06em;margin-top:8px}.rva-systemdesc{color:#a6bcb1;font-size:11px;line-height:1.6;margin:10px 0 20px}.rva-systemlist{display:grid;grid-template-columns:1fr 1fr;gap:9px}.rva-systemitem{padding:14px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.rva-systemitem small{display:block;color:#718f80;font-size:7px;font-weight:900}.rva-systemitem strong{display:block;color:#fff;font-size:10px;margin:6px 0}.rva-systemitem span{color:#76a28e;font-size:8px}.rva-flow{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:14px}.rva-flow div{padding:9px 5px;text-align:center;background:rgba(141,255,202,.06);border-radius:9px;color:#7f9d90;font-size:7px}.rva-flow b{display:block;color:#75ffb8;font-size:8px;margin-bottom:3px}
        .rva-team{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.rva-role{padding:25px;border-radius:22px;background:#fff;border:1px solid var(--line);min-height:210px;transition:.25s}.rva-role:hover{transform:translateY(-7px);box-shadow:0 25px 60px rgba(0,50,30,.1)}.rva-role.dark{background:#06281a;color:#fff;border-color:#06281a}.rva-role.gold{background:#fff8e7;border-color:#f5e2a9}.rva-role small{font-size:8px;color:#8a9b93;font-weight:950}.rva-role .icon{font-size:28px;margin:25px 0 15px}.rva-role b{font-size:14px}.rva-role p{font-size:10px;line-height:1.6;color:#718078}.rva-role.dark p{color:#a9c0b5}.rva-role.gold p{color:#786d51}
        .rva-money{background:linear-gradient(135deg,#032015,#075232);color:#fff}.rva-moneygrid{display:grid;grid-template-columns:.95fr 1.05fr;gap:50px;align-items:center}.rva-money h2{font-size:clamp(45px,5.8vw,73px);line-height:.95;letter-spacing:-.07em;margin:15px 0}.rva-money h2 span{color:#7effbd}.rva-money p{color:#a9c0b5;line-height:1.7;font-size:14px}.rva-statline{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:25px}.rva-statbox{padding:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);border-radius:15px}.rva-statbox small{font-size:7px;color:#789b8a;font-weight:900}.rva-statbox strong{display:block;font-size:22px;letter-spacing:-.05em;margin-top:8px;color:#fff}.rva-formula{border:1px solid rgba(141,255,202,.14);background:rgba(0,0,0,.17);border-radius:25px;padding:25px;box-shadow:var(--shadow)}.rva-formrow{display:flex;justify-content:space-between;gap:15px;padding:17px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:11px;color:#a5bcb1}.rva-formrow b{color:#fff}.rva-formrow.total{border-bottom:0;padding-top:25px}.rva-formrow.total b{font-size:30px;color:#7effbd;letter-spacing:-.05em}.rva-note{font-size:8px;color:#759487;line-height:1.5;margin-top:8px}
        .rva-marketing{display:grid;grid-template-columns:1fr 1fr;gap:15px}.rva-markcard{padding:30px;border-radius:25px;background:#fff;border:1px solid var(--line);box-shadow:0 15px 50px rgba(0,35,20,.06)}.rva-markcard.dark{background:#05281a;color:#fff;border-color:#05281a}.rva-marktop{display:flex;justify-content:space-between;gap:15px}.rva-marktop b{font-size:15px}.rva-tag{font-size:7px;font-weight:950;letter-spacing:.1em;padding:6px 8px;border-radius:999px;background:#e8fff2;color:#078d57}.rva-markcard.dark .rva-tag{background:rgba(126,255,189,.1);color:#7effbd}.rva-markcard p{font-size:11px;line-height:1.65;color:#6a7972;margin:17px 0}.rva-markcard.dark p{color:#a8c0b4}.rva-integrations{display:flex;gap:7px;flex-wrap:wrap}.rva-integration{padding:7px 9px;border-radius:999px;background:#f0f5f2;font-size:8px;font-weight:850;color:#53665d}.rva-markcard.dark .rva-integration{background:rgba(255,255,255,.06);color:#a9c0b5}.rva-bars{height:90px;display:flex;align-items:end;gap:7px;margin-top:18px}.rva-bars i{flex:1;background:linear-gradient(to top,#07985d,#8dffca);border-radius:6px 6px 2px 2px}.rva-recovery{display:grid;grid-template-columns:1fr 1fr;gap:35px;align-items:center;margin-top:45px;padding:35px;border-radius:28px;background:#ecfff5;border:1px solid #c6f2da}.rva-recovery h3{font-size:34px;line-height:1;letter-spacing:-.055em;margin:12px 0}.rva-recovery p{font-size:12px;color:#65766e;line-height:1.7}.rva-risk{display:grid;gap:8px}.rva-riskrow{display:flex;justify-content:space-between;padding:14px 16px;border-radius:13px;background:#fff;border:1px solid #dcebe3;font-size:10px}.rva-riskrow span{color:#078d57;font-weight:850}
        .rva-pricing{background:#fff}.rva-priceHead{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:45px}.rva-priceHead p{max-width:420px;color:#6d7c75;font-size:11px;line-height:1.65}.rva-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;align-items:stretch}.rva-plan{position:relative;border:1px solid #dbe6e0;border-radius:26px;padding:30px;background:#fff;box-shadow:0 15px 45px rgba(0,40,25,.05)}.rva-plan.featured{background:linear-gradient(145deg,#06311f,#08784e);color:#fff;border-color:#0c9d65;transform:translateY(-12px);box-shadow:0 30px 80px rgba(0,85,50,.24)}.rva-badge{position:absolute;top:-12px;left:25px;padding:7px 10px;border-radius:999px;background:#f7c95b;color:#362600;font-size:7px;font-weight:950;letter-spacing:.1em}.rva-plan h3{font-size:20px;margin:0}.rva-plan .sub{font-size:9px;color:#7b8982;margin-top:6px}.rva-plan.featured .sub{color:#a8cbbb}.rva-planprice{font-size:42px;letter-spacing:-.07em;font-weight:950;margin:25px 0 20px}.rva-planprice small{font-size:9px;letter-spacing:0;color:#77857e}.rva-plan ul{list-style:none;padding:0;margin:0 0 25px;display:grid;gap:11px}.rva-plan li{font-size:10px;color:#596a61}.rva-plan.featured li{color:#d0e8dc}.rva-plan li:before{content:"✓";display:inline-block;margin-right:8px;color:#07965e;font-weight:950}.rva-plan.featured li:before{color:#7effbd}.rva-plan button{width:100%;height:48px;border:0;border-radius:13px;background:#052216;color:#fff;font-weight:900;cursor:pointer}.rva-plan.featured button{background:#7effbd;color:#042217}.rva-empty{padding:30px;border:1px dashed #b8c9c0;border-radius:18px;color:#6c7d74;text-align:center}
        .rva-faq{max-width:850px;margin:auto;border-top:1px solid var(--line)}.rva-faqrow{border-bottom:1px solid var(--line)}.rva-faqrow button{width:100%;padding:22px 0;background:transparent;border:0;display:flex;justify-content:space-between;text-align:left;font-weight:850;font-size:14px;color:#092217;cursor:pointer}.rva-plus{width:27px;height:27px;border-radius:50%;background:#e9f6ef;display:grid;place-items:center;color:#078d57}.rva-answer{padding:0 45px 22px 0;color:#65756d;font-size:11px;line-height:1.7}
        .rva-final{position:relative;background:radial-gradient(circle at 50% 0,rgba(111,255,186,.24),transparent 33%),linear-gradient(135deg,#03140d,#075535);color:#fff;text-align:center;padding:120px 0 135px;overflow:hidden}.rva-final:before{content:"";position:absolute;width:600px;height:600px;border-radius:50%;border:1px solid rgba(141,255,202,.12);left:50%;top:-340px;transform:translateX(-50%);box-shadow:0 0 0 80px rgba(141,255,202,.025),0 0 0 160px rgba(141,255,202,.02)}.rva-final h2{position:relative;font-size:clamp(52px,7vw,92px);line-height:.9;letter-spacing:-.075em;margin:18px 0}.rva-final h2 span{color:#7effbd}.rva-final p{position:relative;max-width:620px;margin:0 auto 30px;color:#b3c9be;line-height:1.7;font-size:14px}.rva-sticky{display:none}
        @media(max-width:900px){.rva-heroGrid,.rva-why,.rva-boutique,.rva-systemGrid,.rva-moneygrid{grid-template-columns:1fr}.rva-stage{height:500px}.rva-activities{grid-template-columns:1fr 1fr}.rva-team{grid-template-columns:1fr 1fr 1fr}.rva-numbergrid{grid-template-columns:repeat(3,1fr)}.rva-number:nth-child(4),.rva-number:nth-child(5){border-top:1px solid var(--line)}.rva-number:nth-child(3){border-right:0}.rva-plans{grid-template-columns:1fr}.rva-plan.featured{transform:none}.rva-priceHead{display:block}.rva-priceHead p{margin-top:20px}.rva-systemCard{transform:none}}
        @media(max-width:650px){.rva .wrap{width:min(100% - 28px,1180px)}.rva-links{display:none}.rva-menu{display:block}.rva-navcta{display:none}.rva-hero{padding:60px 0 65px}.rva-h1{font-size:clamp(48px,15vw,70px)}.rva-heroCopy>p{font-size:14px}.rva-stage{height:430px;margin-top:15px}.rva-dashboard{left:0;right:0;top:50px;transform:none}.rva-dbgrid{grid-template-columns:1fr 1fr}.rva-kpi:nth-child(3){display:none}.rva-dbmain{grid-template-columns:1fr}.rva-side{display:none}.rva-chart svg{height:125px}.rva-float{min-width:125px;padding:11px}.rva-float strong{font-size:17px}.rva-float.one{right:-3px;top:35px}.rva-float.two{left:-3px;bottom:42px}.rva-float.three{right:3px;bottom:0}.rva-numbergrid{grid-template-columns:1fr 1fr}.rva-number{border-top:1px solid var(--line);padding:20px 13px}.rva-number:nth-child(2n){border-right:0}.rva-number strong{font-size:22px}.rva-section{padding:80px 0}.rva-title,.rva-copy h2,.rva-money h2{font-size:44px}.rva-compare,.rva-marketing,.rva-recovery{grid-template-columns:1fr}.rva-compare>div{padding:25px}.rva-3dstore{height:420px}.rva-browser3d{inset:20px 0 35px;transform:none}.rva-shophero{grid-template-columns:1fr}.rva-productcard{height:145px}.rva-shophero h3{font-size:27px}.rva-shopfooter{grid-template-columns:1fr 1fr}.rva-shopitem:nth-child(3){display:none}.rva-activities{grid-template-columns:1fr}.rva-activity:nth-child(2),.rva-activity:nth-child(5){transform:none}.rva-systemlist{grid-template-columns:1fr}.rva-flow{grid-template-columns:repeat(3,1fr)}.rva-team{grid-template-columns:1fr 1fr}.rva-statline{grid-template-columns:1fr 1fr}.rva-formrow{font-size:10px}.rva-final{padding:85px 0 110px}.rva-sticky{display:flex;position:fixed;z-index:60;bottom:12px;left:12px;right:12px;padding:8px;border-radius:17px;background:rgba(3,25,16,.92);backdrop-filter:blur(15px);box-shadow:0 15px 45px rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.1)}.rva-sticky a{flex:1;height:46px;display:flex;align-items:center;justify-content:center;background:#7effbd;color:#042217;border-radius:11px;font-size:11px;font-weight:950}.rva-mobile{background:#031b12;padding:12px 15px 18px;border-top:1px solid rgba(255,255,255,.08)}.rva-mobile a{display:block;color:#c4d8ce;padding:11px 3px;font-size:12px;font-weight:800}.rva-mobile .mobileCta{background:#7effbd;color:#042217;text-align:center;border-radius:11px;margin-top:7px}}
        @media(prefers-reduced-motion:reduce){.rva *{animation:none!important;transition:none!important;scroll-behavior:auto!important}.rva-btn:hover,.rva-activity:hover,.rva-role:hover{transform:none!important}}
      /* V4 — FUTURISTE 3D / CONTRASTE LISIBLE */
      .rva{background:#f3faf6;color:#061b12}
      .rva .rva-section:not(.rva-dark):not(.rva-system):not(.rva-money):not(.rva-pricing) h2,.rva .rva-section:not(.rva-dark):not(.rva-system):not(.rva-money):not(.rva-pricing) h3,.rva .rva-section:not(.rva-dark):not(.rva-system):not(.rva-money):not(.rva-pricing) strong,.rva .rva-section:not(.rva-dark):not(.rva-system):not(.rva-money):not(.rva-pricing) b{color:#061b12}
      .rva .rva-section:not(.rva-dark) p,.rva .rva-desc,.rva .rva-path span,.rva .rva-activity p,.rva .rva-role:not(.dark):not(.gold) p,.rva .rva-markcard p,.rva .rva-compare li,.rva .rva-plan:not(.featured) li,.rva .rva-answer{color:#29463a!important}
      .rva .rva-role.dark p{color:rgba(255,255,255,.82)!important}
      .rva .rva-plan.featured li{color:rgba(255,255,255,.85)!important}
      .rva .rva-plan.featured li:before{color:#7effbd!important}
      .rva-hero{min-height:790px;background:radial-gradient(circle at 74% 28%,rgba(27,255,157,.34),transparent 22%),radial-gradient(circle at 86% 78%,rgba(247,201,91,.14),transparent 20%),linear-gradient(135deg,#010806,#04331f 52%,#06130d);overflow:hidden}
      .rva-hero:after{content:"";position:absolute;inset:-20%;background:repeating-radial-gradient(ellipse at 70% 48%,transparent 0 105px,rgba(126,255,191,.035) 107px 108px);transform:rotate(-9deg);pointer-events:none}
      .rva-h1{font-size:clamp(60px,8.5vw,112px);text-shadow:0 8px 40px rgba(0,0,0,.35)}
      .rva-h1 span{color:#b8ffdb;text-shadow:0 0 55px rgba(45,255,170,.42)}
      .rva-heroCopy>p{color:#edf8f3;font-weight:500;font-size:18px}
      .rva-stage{height:650px;perspective:900px;transform-style:preserve-3d}
      .rva-stage:before{content:"";position:absolute;left:50%;top:220px;width:600px;height:260px;transform:translateX(-50%) rotateX(72deg) translateZ(-160px);background:radial-gradient(ellipse,rgba(22,255,154,.45),transparent 67%);filter:blur(28px)}
      .rva-orbit{inset:30px -35px 10px;border-width:2px;transform:rotateX(68deg) rotateZ(-18deg) translateZ(-80px);box-shadow:0 0 130px rgba(11,212,125,.20);animation:rvaOrbit 12s linear infinite}
      .rva-orbit:before{inset:58px;border-color:rgba(126,255,191,.20)}.rva-orbit:after{inset:125px;border-color:rgba(247,201,91,.18)}
      .rva-dashboard{left:0;right:0;top:55px;transform:rotateY(-17deg) rotateX(9deg) rotateZ(-2deg) translateZ(95px);box-shadow:50px 70px 120px rgba(0,0,0,.58),0 0 85px rgba(11,212,125,.18),inset 0 1px rgba(255,255,255,.12);border-color:rgba(174,255,220,.34)}
      .rva-dashboard:after{content:"";position:absolute;left:8%;right:8%;bottom:-35px;height:45px;background:rgba(0,0,0,.55);filter:blur(22px);border-radius:50%;transform:translateZ(-100px)}
      .rva-kpi{transform:translateZ(26px);box-shadow:0 15px 35px rgba(0,0,0,.16),inset 0 1px rgba(255,255,255,.08)}
      .rva-chart,.rva-side{transform:translateZ(18px);box-shadow:0 12px 30px rgba(0,0,0,.12),inset 0 1px rgba(255,255,255,.07)}
      .rva-float{box-shadow:0 35px 80px rgba(0,0,0,.42),0 0 35px rgba(90,255,184,.18);backdrop-filter:blur(16px);transform-style:preserve-3d}
      .rva-float.one{right:-34px;top:70px;transform:translateZ(190px) rotateY(-10deg)}
      .rva-float.two{left:-35px;bottom:100px;transform:translateZ(155px) rotateY(10deg)}
      .rva-float.three{right:-5px;bottom:10px;transform:translateZ(210px) rotateY(-6deg)}
      .rva-3dbadge{bottom:-8px;transform:translateX(-50%) translateZ(240px);background:linear-gradient(135deg,#092f1e,#03130c);border-color:rgba(126,255,191,.42);box-shadow:0 25px 65px rgba(0,0,0,.45),0 0 45px rgba(11,212,125,.20)}
      .rva-numbers{background:#fff}.rva-number strong{color:#052519!important}.rva-number small{color:#3e5b4e!important}.rva-number span{color:#526d61!important}
      .rva-3dsection{background:radial-gradient(circle at 75% 20%,rgba(20,235,140,.13),transparent 28%),linear-gradient(180deg,#f5fcf8,#e7f6ee)}
      .rva-browser3d{transform:rotateY(-23deg) rotateX(10deg) rotateZ(2deg) translateZ(65px);box-shadow:65px 75px 120px rgba(0,45,28,.34),0 0 80px rgba(10,185,108,.13);border-width:2px}
      .rva-browser3d:after{transform:translateZ(-55px) translateX(14px);box-shadow:35px 35px 70px rgba(0,30,18,.28)}
      .rva-plan:not(.featured) .rva-planprice,.rva-priceHead p,.rva-systemCopy p,.rva-money p{color:#183b2e!important}
      .rva-plan.featured .rva-planprice{color:#FFFFFF!important}
      .rva-plan.featured .rva-planprice small{color:rgba(255,255,255,.75)!important}
      .rva-plan.featured h3{color:#FFFFFF!important}
      .rva-final{background:radial-gradient(circle at 50% 10%,rgba(80,255,181,.25),transparent 30%),linear-gradient(135deg,#010705,#043421 55%,#06150e)}
      @keyframes rvaOrbit{to{transform:rotateX(68deg) rotateZ(342deg) translateZ(-80px)}}
      @media(max-width:900px){.rva-stage{height:510px}.rva-dashboard{transform:rotateY(-10deg) rotateX(5deg) rotateZ(-1deg) translateZ(35px)}.rva-float.one{right:-5px}.rva-float.two{left:-5px}.rva-float.three{right:0}}
      /* HOLOGRAPHIC 3D HERO */
      .rva-holoHero{min-height:860px!important;background:radial-gradient(circle at 68% 48%,rgba(35,255,166,.26),transparent 20%),radial-gradient(circle at 82% 12%,rgba(104,255,218,.16),transparent 24%),radial-gradient(circle at 8% 72%,rgba(247,201,91,.09),transparent 18%),linear-gradient(120deg,#010604 0%,#032015 42%,#01130c 72%,#041f15 100%)!important}
      .rva-holoNoise{position:absolute;inset:0;opacity:.11;background-image:radial-gradient(rgba(255,255,255,.7) .5px,transparent .5px);background-size:5px 5px;mix-blend-mode:screen;pointer-events:none}
      .rva-holoAurora{position:absolute;width:700px;height:220px;border-radius:50%;filter:blur(55px);opacity:.2;pointer-events:none}.aurora1{right:-120px;top:190px;background:#11f89a;transform:rotate(-20deg)}.aurora2{left:30%;bottom:-80px;background:#f7c95b;opacity:.07;transform:rotate(18deg)}
      .rva-holoTitle{font-size:clamp(62px,7.8vw,108px)!important;line-height:.86!important;letter-spacing:-.085em!important;margin:28px 0 27px!important;text-shadow:0 10px 50px rgba(0,0,0,.5),0 0 70px rgba(62,255,179,.08)}
      .rva-holoTitle span{display:block;color:#62ffbb!important;background:linear-gradient(90deg,#b8ffe0,#36f3a2 45%,#8effd0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:none!important;filter:drop-shadow(0 0 24px rgba(57,255,174,.18))}
      .rva-holoTitle small{display:block;margin-top:18px;font-size:clamp(18px,2vw,28px);line-height:1.1;letter-spacing:-.035em;color:#d8eee4;font-weight:700;-webkit-text-fill-color:#d8eee4}
      .rva-holoHero .rva-heroCopy>p{font-size:18px!important;line-height:1.7!important;color:#e8f8f1!important;max-width:650px!important}.rva-holoHero .rva-heroCopy>p strong{color:#fff}
      .rva-holoCTA{min-width:205px;box-shadow:0 0 0 1px rgba(173,255,218,.3),0 15px 55px rgba(18,238,145,.28),0 0 55px rgba(18,238,145,.13)!important}
      .rva-holoTrust{display:flex;gap:18px;flex-wrap:wrap;margin-top:22px;color:#a9cfc0;font-size:10px;font-weight:800;letter-spacing:.02em}.rva-holoTrust i{color:#70ffc1;font-style:normal;margin-right:5px}
      .rva-holoStage{height:690px!important;transform-style:preserve-3d!important;isolation:isolate}.rva-holoStage:after{content:"";position:absolute;left:8%;right:8%;bottom:25px;height:85px;border-radius:50%;background:radial-gradient(ellipse,rgba(44,255,172,.38),transparent 68%);filter:blur(24px);transform:rotateX(72deg) translateZ(-180px);pointer-events:none}
      .rva-holoRings{position:absolute;inset:30px -60px 50px;transform-style:preserve-3d;pointer-events:none}.rva-holoRings i{position:absolute;inset:0;border:1px solid rgba(109,255,199,.2);border-radius:50%;transform:rotateX(68deg) rotateZ(-12deg);box-shadow:0 0 35px rgba(28,255,162,.08),inset 0 0 25px rgba(28,255,162,.04)}.rva-holoRings i:nth-child(2){inset:65px;transform:rotateX(68deg) rotateZ(38deg);border-color:rgba(247,201,91,.18)}.rva-holoRings i:nth-child(3){inset:125px 90px;transform:rotateX(72deg) rotateZ(-48deg);border-color:rgba(147,255,219,.15)}
      .rva-holoBeam{position:absolute;left:50%;top:15%;width:360px;height:500px;transform:translateX(-50%) rotateX(8deg);background:linear-gradient(180deg,rgba(86,255,192,0),rgba(86,255,192,.08) 45%,rgba(86,255,192,0));clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);filter:blur(5px);pointer-events:none}
      .rva-holoParticles{position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none}.rva-holoParticles b{position:absolute;width:5px;height:5px;border-radius:50%;background:#a6ffdb;box-shadow:0 0 18px #4dffb0;animation:holoFloat 5s ease-in-out infinite}.rva-holoParticles b:nth-child(1){left:12%;top:24%;transform:translateZ(150px)}.rva-holoParticles b:nth-child(2){left:22%;top:66%;animation-delay:-2s}.rva-holoParticles b:nth-child(3){right:16%;top:30%;transform:translateZ(180px);animation-delay:-1s}.rva-holoParticles b:nth-child(4){right:7%;top:62%;animation-delay:-3s}.rva-holoParticles b:nth-child(5){left:48%;top:8%;transform:translateZ(220px);animation-delay:-4s}.rva-holoParticles b:nth-child(6){left:65%;bottom:8%;animation-delay:-1.5s}.rva-holoParticles b:nth-child(7){left:4%;bottom:25%;animation-delay:-2.5s}.rva-holoParticles b:nth-child(8){right:30%;bottom:30%;transform:translateZ(200px);animation-delay:-.5s}
      .rva-holoDashboard{top:52px!important;transform:rotateY(-23deg) rotateX(10deg) rotateZ(-1.5deg) translateZ(120px)!important;border:1px solid rgba(146,255,216,.5)!important;background:linear-gradient(145deg,rgba(7,30,20,.96),rgba(2,13,9,.98))!important;box-shadow:55px 75px 120px rgba(0,0,0,.62),0 0 90px rgba(30,255,161,.17),0 0 2px #b5ffe1!important;overflow:hidden}.rva-holoDashboard:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.08),transparent 24%,transparent 70%,rgba(82,255,188,.05));pointer-events:none}.rva-holoScan{position:absolute;left:0;right:0;top:-20%;height:2px;background:#a9ffdb;box-shadow:0 0 25px #5effbd,0 0 70px #25e98e;opacity:.75;animation:holoScan 5s linear infinite;z-index:5}.rva-holoDashboard .rva-kpi{background:linear-gradient(145deg,rgba(19,53,39,.92),rgba(5,25,17,.94));border-color:rgba(138,255,207,.14)}.rva-holoDashboard .rva-kpi strong{color:#f2fff9}.rva-holoDashboard .rva-kpi small{color:#9fcabb}.rva-holoDashboard .rva-chart,.rva-holoDashboard .rva-side{background:rgba(6,28,19,.78);border-color:rgba(126,255,198,.1)}.rva-holoFooter{display:flex;justify-content:space-between;gap:8px;margin-top:12px;padding:8px 10px;border-top:1px solid rgba(133,255,207,.08);color:#6d9b88;font-size:7px;font-weight:900;letter-spacing:.12em}
      .rva-holoFloat{background:linear-gradient(145deg,rgba(10,39,27,.9),rgba(3,16,11,.88))!important;border:1px solid rgba(151,255,218,.28)!important;box-shadow:0 30px 90px rgba(0,0,0,.5),0 0 40px rgba(53,255,177,.13)!important}.rva-holoFloat em{display:block;margin-top:4px;color:#69a48d;font-size:8px;font-style:normal}.rva-holoChip{position:absolute;padding:9px 12px;border-radius:999px;border:1px solid rgba(148,255,216,.2);background:rgba(3,25,16,.72);backdrop-filter:blur(10px);color:#b5ffdd;font-size:8px;font-weight:950;letter-spacing:.1em;box-shadow:0 15px 35px rgba(0,0,0,.3);transform:translateZ(260px)}.chipA{left:-12px;top:18%;animation:holoFloat 6s ease-in-out infinite}.chipB{right:5px;top:14%;transform:translateZ(280px) rotateY(-8deg);animation:holoFloat 6s -2s ease-in-out infinite}.rva-holoBottom{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:14px;color:#557e6c;font-size:7px;font-weight:950;letter-spacing:.18em;white-space:nowrap}.rva-holoBottom i{width:4px;height:4px;border-radius:50%;background:#5cffb7;box-shadow:0 0 12px #5cffb7}
      @keyframes holoScan{0%{top:-10%}100%{top:110%}}@keyframes holoFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-12px,25px)}}
      @media(max-width:900px){.rva-holoHero{min-height:1050px!important}.rva-holoStage{height:570px!important}.rva-holoDashboard{transform:rotateY(-12deg) rotateX(6deg) translateZ(55px)!important}.rva-holoChip{display:none}.rva-holoBottom{display:none}}
      @media(max-width:650px){.rva-holoHero{min-height:940px!important;padding-top:55px!important}.rva-holoTitle{font-size:clamp(48px,14vw,72px)!important}.rva-holoTitle small{font-size:16px}.rva-holoHero .rva-heroCopy>p{font-size:15px!important}.rva-holoStage{height:440px!important;margin-top:8px}.rva-holoDashboard{top:28px!important;transform:rotateY(-6deg) rotateX(3deg) translateZ(25px)!important}.rva-holoRings{inset:10px -55px 20px}.rva-holoFloat.one{right:-2px;top:18px}.rva-holoFloat.two{left:-2px;bottom:48px}.rva-holoFloat.three{right:0;bottom:0}.rva-holoFooter{display:none}.rva-holoTrust{font-size:9px}}

      @media(max-width:650px){.rva-stage{height:400px}.rva-dashboard{top:35px;transform:rotateY(-5deg) rotateX(3deg) translateZ(20px)}.rva-float.one{top:25px}.rva-float.two{bottom:55px}.rva-float.three{bottom:0}.rva-orbit{inset:15px -70px 5px}.rva-heroCopy>p{font-size:15px}}
      `}</style>

      <style>{`
/* V5.1 — contrast rules: white typography on green/dark premium surfaces */
.rvp-dark, .rvp-dark * { color: #fff; }
.rvp-dark .rvp-muted, .rvp-dark .rvp-desc, .rvp-dark small { color: rgba(255,255,255,.82); }
.rvp-green, .rvp-green * { color: #fff; }
.rvp-green .rvp-muted, .rvp-green .rvp-desc, .rvp-green small { color: rgba(255,255,255,.82); }
.rvp-hero, .rvp-hero * { color: #fff; }
.rvp-hero .rvp-muted, .rvp-hero .rvp-desc, .rvp-hero small { color: rgba(255,255,255,.84); }

:root{--rv-orange:#FF6A00;--rv-orange-2:#FFB000}
.rva-orange{color:var(--rv-orange)!important}
.rva-orangeGlow{box-shadow:0 0 42px rgba(255,106,0,.26)}
.rva-orangeDot{background:linear-gradient(135deg,var(--rv-orange),var(--rv-orange-2));box-shadow:0 0 22px rgba(255,106,0,.55)}
.rva .rva-btn.primary{background:linear-gradient(135deg,#FF6A00 0%,#FFB000 100%);color:#fff;box-shadow:0 16px 42px rgba(255,106,0,.28)}
.rva .rva-btn.primary:hover{box-shadow:0 20px 52px rgba(255,106,0,.38)}


/* =========================================================
   RECVENTE V5.3 — MASTER COLOR / CONTRAST SYSTEM
   Emerald holographic + orange energy + premium gold + white
   ========================================================= */
.rva{
  --rv-ink:#03110C;
  --rv-deep:#03110C;
  --rv-emerald:#00D084;
  --rv-emerald-2:#00F5A0;
  --rv-orange:#FF6A00;
  --rv-orange-2:#FFB000;
  --rv-gold:#FFB000;
  --rv-white:#FFFFFF;
  --rv-white-82:rgba(255,255,255,.82);
  --rv-white-68:rgba(255,255,255,.68);
}

/* DARK / GREEN SURFACES: WHITE TEXT ONLY */
.rva .rva-dark,
.rva .rva-dark *,
.rva .rva-green,
.rva .rva-green *,
.rva .rva-hero,
.rva .rva-hero *,
.rva [class*="dark"],
.rva [class*="green"]{
  color:var(--rv-white)!important;
}

.rva .rva-dark p,
.rva .rva-dark span,
.rva .rva-dark small,
.rva .rva-dark li,
.rva .rva-green p,
.rva .rva-green span,
.rva .rva-green small,
.rva .rva-green li,
.rva .rva-hero p,
.rva .rva-hero span,
.rva .rva-hero small{
  color:var(--rv-white-82)!important;
}

.rva .rva-dark h1,
.rva .rva-dark h2,
.rva .rva-dark h3,
.rva .rva-dark h4,
.rva .rva-green h1,
.rva .rva-green h2,
.rva .rva-green h3,
.rva .rva-green h4,
.rva .rva-hero h1,
.rva .rva-hero h2,
.rva .rva-hero h3,
.rva .rva-hero h4,
.rva .rva-dark strong,
.rva .rva-green strong,
.rva .rva-hero strong{
  color:#fff!important;
}

/* Any muted class on a dark/green section remains readable. */
.rva .rva-dark .muted,
.rva .rva-dark .desc,
.rva .rva-dark .subtitle,
.rva .rva-green .muted,
.rva .rva-green .desc,
.rva .rva-green .subtitle,
.rva .rva-hero .muted,
.rva .rva-hero .desc,
.rva .rva-hero .subtitle{
  color:rgba(255,255,255,.78)!important;
}

/* LIGHT SURFACES: DARK TEXT ONLY */
.rva .rva-light,
.rva .rva-white,
.rva .rva-section-light{
  color:var(--rv-ink)!important;
}
.rva .rva-light h1,.rva .rva-light h2,.rva .rva-light h3,
.rva .rva-light p,.rva .rva-light span,
.rva .rva-white h1,.rva .rva-white h2,.rva .rva-white h3,
.rva .rva-white p,.rva .rva-white span{
  color:var(--rv-ink)!important;
}

/* PREMIUM ACCENTS */
.rva .rva-orange,
.rva .orange-accent{color:var(--rv-orange)!important;}
.rva .rva-gold,
.rva .gold-accent{color:var(--rv-gold)!important;}

.rva .rva-btn.primary,
.rva button.rva-primary{
  background:linear-gradient(135deg,var(--rv-orange),var(--rv-orange-2))!important;
  color:#fff!important;
  border-color:transparent!important;
  box-shadow:0 18px 48px rgba(255,106,0,.32)!important;
}
.rva .rva-btn.primary *,
.rva button.rva-primary *{color:#fff!important;}

/* Holographic emerald surfaces */
.rva .holo,
.rva .hologram,
.rva .rva-holo{
  background:
    radial-gradient(circle at 30% 20%,rgba(0,245,160,.24),transparent 35%),
    linear-gradient(145deg,rgba(0,208,132,.24),rgba(4,17,13,.96))!important;
  border-color:rgba(0,245,160,.34)!important;
}

/* Force white on common text elements inside explicit premium surfaces,
   even when inline color styles were supplied by the old landing page. */
.rva .rva-dark [style*="color"],
.rva .rva-green [style*="color"],
.rva .rva-hero [style*="color"]{
  color:#fff!important;
}
.rva .rva-dark [style*="color"] p,
.rva .rva-dark [style*="color"] span,
.rva .rva-green [style*="color"] p,
.rva .rva-green [style*="color"] span{
  color:rgba(255,255,255,.82)!important;
}


/* V5.5 FINAL — explicit typography by actual component, not generic selectors */
.rva.rva-premium-africa .rva-hero,
.rva.rva-premium-africa .rva-system,
.rva.rva-premium-africa .rva-money,
.rva.rva-premium-africa .rva-final,
.rva.rva-premium-africa .rva-manifesto,
.rva.rva-premium-africa .rva-markcard.dark {
  color:#fff !important;
}

/* Every readable text node in green/dark content columns */
.rva.rva-premium-africa .rva-heroCopy,
.rva.rva-premium-africa .rva-systemCopy,
.rva.rva-premium-africa .rva-money,
.rva.rva-premium-africa .rva-final {
  color:#fff !important;
}
.rva.rva-premium-africa .rva-heroCopy h1,
.rva.rva-premium-africa .rva-heroCopy p,
.rva.rva-premium-africa .rva-systemCopy h2,
.rva.rva-premium-africa .rva-systemCopy p,
.rva.rva-premium-africa .rva-money h2,
.rva.rva-premium-africa .rva-money p,
.rva.rva-premium-africa .rva-final h2,
.rva.rva-premium-africa .rva-final p,
.rva.rva-premium-africa .rva-manifesto h3,
.rva.rva-premium-africa .rva-manifesto p,
.rva.rva-premium-africa .rva-markcard.dark b,
.rva.rva-premium-africa .rva-markcard.dark p {
  color:#fff !important;
}

/* Secondary text: still clearly white, never grey-green */
.rva.rva-premium-africa .rva-heroCopy > p,
.rva.rva-premium-africa .rva-systemCopy > p,
.rva.rva-premium-africa .rva-money > p,
.rva.rva-premium-africa .rva-final > p,
.rva.rva-premium-africa .rva-manifesto > p {
  color:rgba(255,255,255,.88) !important;
}

/* Emerald highlight is reserved for small emphasis, never body copy */
.rva.rva-premium-africa .rva-systemCopy h2 span,
.rva.rva-premium-africa .rva-money h2 span,
.rva.rva-premium-africa .rva-final h2 span {
  color:#9CFFD3 !important;
}

/* Pills: white text by default; active pill gets dark text because its
   background itself is bright emerald. */
.rva.rva-premium-africa .rva-pill {
  color:#fff !important;
  background:rgba(255,255,255,.075) !important;
  border-color:rgba(255,255,255,.18) !important;
}
.rva.rva-premium-africa .rva-pill.active {
  color:#052217 !important;
  background:#7CFFBF !important;
}

/* Orange + gold are visible accents */
.rva.rva-premium-africa .rva-btn.primary,
.rva.rva-premium-africa .rva-holoCTA {
  color:#fff !important;
  background:linear-gradient(135deg,#FF6200 0%,#FF7A18 48%,#FFB000 100%) !important;
  border-color:transparent !important;
  box-shadow:0 18px 55px rgba(255,106,0,.34) !important;
}
.rva.rva-premium-africa .rva-kicker:before,
.rva.rva-premium-africa .rva-label:before {
  background:linear-gradient(135deg,#FF6200,#FFB000) !important;
  box-shadow:0 0 20px rgba(255,106,0,.5) !important;
}

/* Numbers on dark/green surfaces are white and dominant */
.rva.rva-premium-africa .rva-statbox strong,
.rva.rva-premium-africa .rva-systemNumber,
.rva.rva-premium-africa .rva-kpi strong {
  color:#fff !important;
}
.rva.rva-premium-africa .rva-statbox small,
.rva.rva-premium-africa .rva-systemdesc {
  color:rgba(255,255,255,.82) !important;
}

/* Plusieurs activités */
.rva-multiVisual{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:14px;max-width:760px;margin:0 auto}
.rva-multiNode{display:flex;flex-direction:column;align-items:center;gap:8px;background:#fff;border:1px solid #e2ede7;border-radius:16px;padding:20px 26px;box-shadow:0 12px 30px rgba(3,25,16,.06)}
.rva-multiNode span{font-size:26px}
.rva-multiNode b{font-size:12px;font-weight:900;color:#06130E}
.rva-multiPlus{font-size:20px;font-weight:900;color:#a9c0b5}
.rva-multiArrow{width:100%;text-align:center;font-size:22px;color:#00D084;margin:6px 0}
.rva-multiCenter{display:flex;flex-direction:column;align-items:center;gap:4px;background:linear-gradient(135deg,#00D084,#00F5A0);border-radius:16px;padding:18px 30px;box-shadow:0 16px 40px rgba(0,208,132,.28)}
.rva-multiCenter b{font-size:16px;font-weight:950;color:#03110C;letter-spacing:.04em}
.rva-multiCenter span{font-size:11px;color:#06281a;font-weight:700}

/* Confiance */
.rva-trustGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
.rva-trustCard{background:#fff;border:1px solid #e2ede7;border-radius:16px;padding:22px;box-shadow:0 10px 26px rgba(3,25,16,.05)}
.rva-trusticon{font-size:26px;margin-bottom:10px}
.rva-trustCard h3{font-size:14px;font-weight:900;color:#06130E;margin:0 0 8px}
.rva-trustCard p{font-size:12.5px;line-height:1.6;color:#365248;margin:0}

/* Narration émotionnelle */
.rva-emotion{text-align:center}
.rva-emotionText{max-width:720px;margin:0 auto}
.rva-emostep{font-size:19px;font-weight:700;color:#FFFFFF;margin:0 0 6px;opacity:.92}
.rva-emotitle{font-size:clamp(28px,4.2vw,42px);font-weight:950;color:#FFFFFF;line-height:1.25;margin:26px 0 14px;letter-spacing:-.02em}
.rva-emotitle span{color:#00F5A0}
.rva-emosub{font-size:16px;color:rgba(255,255,255,.82);margin:0 0 32px}
.rva-ambitionBadge{display:inline-flex;flex-direction:column;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,176,0,.35);border-radius:18px;padding:22px 34px;backdrop-filter:blur(8px)}
.rva-ambitionNum{font-size:clamp(26px,4vw,38px);font-weight:950;background:linear-gradient(135deg,#FFB000,#FF6A00);-webkit-background-clip:text;background-clip:text;color:transparent}
.rva-ambitionLabel{font-size:11.5px;color:rgba(255,255,255,.72);font-weight:700;max-width:340px;text-align:center;letter-spacing:.02em}

@media(max-width:650px){
  .rva-multiVisual{gap:10px}
  .rva-multiNode{padding:14px 18px}
  .rva-trustGrid{grid-template-columns:1fr}
  .rva-emostep{font-size:15px}
}
`}</style>

      <header className="rva-nav"><div className="wrap rva-navin">
        <a className="rva-logo" href="#top"><i>R</i>RecuVente</a>
        <nav className="rva-links"><a href="#activites">Activités</a><a href="#boutique">Boutique</a><a href="#systeme">Plateforme</a><a href="#equipe">Équipe</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a><a className="rva-navcta" href="?auth=1&signup=1" onClick={()=>trackLead('Lead')}>S'abonner →</a></nav>
        <button className="rva-menu" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Ouvrir le menu">☰</button>
      </div>{mobileOpen&&<div className="rva-mobile"><div className="wrap"><a href="#activites" onClick={()=>setMobileOpen(false)}>Activités</a><a href="#boutique" onClick={()=>setMobileOpen(false)}>Boutique</a><a href="#systeme" onClick={()=>setMobileOpen(false)}>Plateforme</a><a href="#equipe" onClick={()=>setMobileOpen(false)}>Équipe</a><a href="#tarifs" onClick={()=>setMobileOpen(false)}>Tarifs</a><a href="#faq" onClick={()=>setMobileOpen(false)}>FAQ</a><a className="mobileCta" href="?auth=1&signup=1" onClick={()=>trackLead('Lead')}>Choisir mon abonnement →</a></div></div>}</header>

      <main id="top">
        <section className="rva-hero rva-holoHero">
          <div className="rva-holoNoise"/><div className="rva-holoAurora aurora1"/><div className="rva-holoAurora aurora2"/>
          <div className="wrap rva-heroGrid">
            <div className="rva-heroCopy">
              <div className="rva-kicker"><b/> SYSTÈME DE PILOTAGE · NOUVELLE GÉNÉRATION</div>
              <h1 className="rva-holoTitle">Votre activité.<span>En lévitation.</span><small>Votre système, enfin à votre niveau.</small></h1>
              <p>Vous avez construit votre activité sur le terrain. <strong>Ne la pilotez plus à l’aveugle.</strong> RecuVente réunit les signaux essentiels de votre commerce, de vos équipes, de vos opérations et de votre performance dans une interface conçue pour décider vite.</p>
              <div className="rva-actions"><a className="rva-btn primary rva-holoCTA" href="#tarifs" onClick={()=>trackLead('ViewPricing')}>Prendre le contrôle →</a><a className="rva-btn ghost" href="#boutique">Explorer la plateforme</a></div>
              <div className="rva-holoTrust"><span><i>✦</i> Chiffres réels de la plateforme</span><span><i>✦</i> Plans payants de votre configuration</span></div>
            </div>
            <div className="rva-stage rva-holoStage">
              <div className="rva-holoRings"><i/><i/><i/></div>
              <div className="rva-holoBeam"/>
              <div className="rva-holoParticles"><b/><b/><b/><b/><b/><b/><b/><b/></div>
              <div className="rva-dashboard rva-holoDashboard">
                <div className="rva-holoScan"/>
                <div className="rva-dbtop"><div className="rva-dbbrand">RECUVENTE<small>COMMAND CENTER</small></div><span className="rva-live">● LIVE · DATA CORE</span></div>
                <div className="rva-dbgrid">{[['COMMERCE CONFIRMÉ',AFFICHAGE_COMMERCE_HERO,'FCFA'],['COMMANDES',statValue('nb_commandes_confirmees'),'confirmées'],['ENTREPRISES',statValue('nb_entreprises_actives'),'actives']].map(x=><div className="rva-kpi" key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong><em>{x[2]}</em></div>)}</div>
                <div className="rva-dbmain"><div className="rva-chart"><div className="rva-charthead"><span>TRAJECTOIRE DU COMMERCE</span><span>LIVE</span></div><svg viewBox="0 0 500 160" preserveAspectRatio="none"><defs><linearGradient id="holoArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4dffb0" stopOpacity=".42"/><stop offset="100%" stopColor="#4dffb0" stopOpacity="0"/></linearGradient></defs><path className="area" fill="url(#holoArea)" d="M0 140 L70 118 L140 128 L205 83 L270 96 L335 55 L400 72 L500 22 L500 160 L0 160 Z"/><path d="M0 140 L70 118 L140 128 L205 83 L270 96 L335 55 L400 72 L500 22"/></svg></div><div className="rva-side"><h4>OPÉRATIONS</h4><div className="rva-mini">{[42,61,48,76,68,88].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div></div>
                <div className="rva-holoFooter"><span>VENTE</span><span>ÉQUIPE</span><span>BOUTIQUE</span><span>FINANCE</span><span>PERFORMANCE</span></div>
              </div>
              <div className="rva-float one rva-holoFloat"><small>COMMERCE CONFIRMÉ</small><strong>{AFFICHAGE_COMMERCE_HERO} <b>FCFA</b></strong><em>signal réel</em></div>
              <div className="rva-float two rva-holoFloat"><small>ENTREPRISES ACTIVES</small><strong>{statValue('nb_entreprises_actives')}</strong><em>espaces en activité</em></div>
              <div className="rva-float three rva-holoFloat"><small>LIVREURS ACTIFS</small><strong>{statValue('nb_livreurs_actifs')}</strong><em>terrain connecté</em></div>
              <div className="rva-holoChip chipA">◈ CENTRALISATION</div><div className="rva-holoChip chipB">◉ PERFORMANCE</div><div className="rva-3dbadge">UNE VISION · UNE ÉQUIPE · UN SYSTÈME</div>
            </div>
          </div>
          <div className="rva-holoBottom"><span>DONNÉES</span><i/><span>OPÉRATIONS</span><i/><span>ÉQUIPE</span><i/><span>COMMERCE</span><i/><span>PILOTAGE</span></div>
        </section>
        <section className="rva-numbers"><div className="wrap rva-numbergrid">{liveStats.map(s=><div className="rva-number" key={s[0]}><small>{s[0]}</small><strong>{s[1]}</strong><span>{s[2]}</span></div>)}</div></section>

        <section className="rva-section rva-dark rva-emotion"><div className="wrap"><div className="rva-emotionText"><p className="rva-emostep">Vous avez commencé avec un téléphone.</p><p className="rva-emostep">Puis quelques clients.</p><p className="rva-emostep">Puis une équipe.</p><p className="rva-emostep">Puis des commandes partout.</p><h2 className="rva-emotitle">Et maintenant, votre activité est devenue <span>trop importante</span> pour être pilotée avec des outils dispersés.</h2><p className="rva-emosub">Il est temps de passer au niveau supérieur.</p><div className="rva-ambitionBadge"><span className="rva-ambitionNum">25 MILLION+ FCFA</span><span className="rva-ambitionLabel">potentiel commercial piloté — l’ambition que RecuVente vous aide à atteindre</span></div></div></div></section>

        <section className="rva-section"><div className="wrap"><div className="rva-center"><div className="rva-label">LE PROBLÈME N'EST PAS VOTRE TRAVAIL</div><h2 className="rva-title">C’est le chaos autour de lui.<br/><span>RecuVente remet de l’ordre.</span></h2><p className="rva-desc">Quand les ventes, les clients, les équipes et les chiffres vivent dans des outils séparés, votre activité grandit plus vite que votre capacité à la piloter.</p></div><div className="rva-why"><div className="rva-manifesto"><h3>Vous avez travaillé dur pour faire grandir votre activité.</h3><p>Ne laissez pas la dispersion vous empêcher de voir ce que vous avez construit. RecuVente transforme les informations de votre activité en un environnement où chacun sait quoi faire et où la direction peut enfin regarder l’ensemble.</p><a className="rva-btn primary rva-orangeGlow" href="#tarifs">Passer à un vrai système →</a></div><div className="rva-compare"><div><h4>AVANT</h4><ul>{['Outils dispersés','Données difficiles à rapprocher','Suivi manuel','Équipe difficile à superviser','Décisions prises avec une vision incomplète'].map(x=><li key={x}><b>×</b>{x}</li>)}</ul></div><div className="good"><h4>AVEC RECUVENTE</h4><ul>{['Un environnement centralisé','Une vision globale','Des responsabilités structurées','Des opérations visibles','Des indicateurs pour décider'].map(x=><li key={x}><b>✓</b>{x}</li>)}</ul></div></div></div></div></section>

        <section id="boutique" className="rva-section rva-3dsection"><div className="wrap rva-boutique"><div className="rva-copy"><div className="rva-label">BOUTIQUE + SHOPIFY</div><h2>Votre boutique ne doit plus vivre <span>à côté de votre entreprise.</span></h2><p>Vous partez de zéro ? Créez votre boutique avec RecuVente. Vous avez déjà Shopify ? Utilisez l’intégration existante. Dans les deux cas, votre objectif reste le même : rapprocher le commerce de la gestion.</p><div className="rva-paths"><div className="rva-path"><div className="rva-pathnum">01</div><div><b>Créer avec RecuVente</b><span>Personnalisation, logo, couleurs, produits, collections, catalogue, commandes et partage du lien selon les fonctions du Store Builder.</span></div></div><div className="rva-path"><div className="rva-pathnum">02</div><div><b>Connecter Shopify</b><span>Utilisez les mécanismes Shopify réellement présents dans votre application pour rapprocher votre boutique existante de RecuVente.</span></div></div></div><div className="rva-actions"><a className="rva-btn primary rva-orangeGlow" href="?auth=1&signup=1" onClick={()=>trackLead('StoreBuilderCTA')}>Créer ma boutique →</a><a className="rva-btn" style={{border:'1px solid #c9ddd3',color:'#052519'}} href="?auth=1&signup=1" onClick={()=>trackLead('ShopifyCTA')}>Connecter Shopify</a></div></div><div className="rva-3dstore"><div className="rva-browser3d"><div className="rva-browserbar"><i/><i/><i/><span>votre-boutique.recuvente.com</span></div><div className="rva-shop"><div className="rva-shophead"><span>RECUVENTE STORE</span><span>CATALOGUE · COLLECTIONS · COMMANDES</span></div><div className="rva-shophero"><div><h3>Votre marque.<br/>Votre vitrine.<br/>Votre système.</h3><p>Une expérience boutique reliée à votre environnement de gestion.</p></div><div className="rva-productcard"/></div><div className="rva-shopfooter"><div className="rva-shopitem"><small>PRODUITS</small><b>Catalogue</b></div><div className="rva-shopitem"><small>VENTES</small><b>Commandes</b></div><div className="rva-shopitem"><small>CLIENTS</small><b>Suivi</b></div></div></div></div><div className="rva-connector">BOUTIQUE ↔ RECUVENTE ↔ SHOPIFY</div></div></div></section>

        <section id="activites" className="rva-section"><div className="wrap"><div className="rva-center"><div className="rva-label">UN SEUL SYSTÈME. PLUSIEURS MÉTIERS.</div><h2 className="rva-title">Votre activité est unique.<br/><span>Votre outil doit le comprendre.</span></h2><p className="rva-desc">RecuVente s'adapte aux activités prévues dans votre application, sans vous obliger à abandonner la logique de pilotage centralisé.</p></div><div className="rva-activities">{activities.map((a,i)=><div className="rva-activity" key={a[1]}><div className="rva-acttop"><span className="rva-actnum">0{i+1}</span></div><div className="rva-acticon">{a[0]}</div><h3>{a[1]}</h3><p>{a[2]}</p><strong>{a[3]}</strong></div>)}</div></div></section>

        <section className="rva-section rva-multiwrap"><div className="wrap"><div className="rva-center"><div className="rva-label">PLUSIEURS ACTIVITÉS, PLUSIEURS ESPACES</div><h2 className="rva-title">Plusieurs activités.<br/><span>Une seule vision.</span></h2><p className="rva-desc">Votre compte peut réunir plusieurs espaces — un par activité — chacun isolé, chacun piloté depuis le même endroit.</p></div><div className="rva-multiVisual"><div className="rva-multiNode"><span>🛒</span><b>E-commerce</b></div><div className="rva-multiPlus">+</div><div className="rva-multiNode"><span>🚗</span><b>Location</b></div><div className="rva-multiPlus">+</div><div className="rva-multiNode"><span>🏪</span><b>Commerce</b></div><div className="rva-multiArrow">↓</div><div className="rva-multiCenter"><b>RECUVENTE</b><span>un espace par activité, une seule connexion</span></div></div></div></section>

        <section id="systeme" className="rva-section rva-system"><div className="wrap rva-systemGrid"><div className="rva-systemCopy"><div className="rva-label">LE CŒUR DU SYSTÈME</div><h2>Du premier clic<br/>au <span>pilotage.</span></h2><p>Votre activité ne se résume jamais à une commande. Il faut vendre, convertir, opérer, encaisser, réactiver et décider. RecuVente relie ces moments.</p><div className="rva-pills">{pillars.map(p=><button key={p.id} className={`rva-pill ${active===p.id?'active':''}`} onClick={()=>setActive(p.id)}>{p.id} · {p.title}</button>)}</div></div><div className="rva-systemCard"><div className="rva-systemHead"><strong>{activePillar.title}</strong><span>{activePillar.desc}</span></div><div className="rva-systemNumber">ÉTAPE {activePillar.id}<b>{activePillar.title}</b></div><div className="rva-systemdesc">{activePillar.desc}</div><div className="rva-systemlist">{activePillar.items.map(x=><div className="rva-systemitem" key={x}><small>MODULE</small><strong>{x}</strong><span>Dans votre environnement →</span></div>)}</div><div className="rva-flow">{pillars.map(p=><div key={p.id}><b>{p.id}</b>{p.title}</div>)}</div></div></div></section>

        <section id="equipe" className="rva-section"><div className="wrap"><div className="rva-center"><div className="rva-label">UNE ÉQUIPE QUI AVANCE DANS LA MÊME DIRECTION</div><h2 className="rva-title">Le dirigeant ne devrait pas<br/><span>courir après l’information.</span></h2><p className="rva-desc">Les rôles présents dans l'application permettent de répartir les responsabilités et de donner à chacun un cadre de travail adapté.</p></div><div className="rva-team">{[['01','🧭','Direction','Vision globale, indicateurs et décisions.',''],['02','🎧','Closer','Commandes, appels, confirmations et suivi.','dark'],['03','🚚','Livreur','Opérations terrain, statuts et encaissements.',''],['04','💼','Comptabilité','Paiements, coûts, dépôts et contrôle.','gold'],['05','👤','Responsable','Supervision des équipes et des activités.','']].map(r=><div className={`rva-role ${r[4]}`} key={r[2]}><small>ROLE {r[0]}</small><div className="icon">{r[1]}</div><b>{r[2]}</b><p>{r[3]}</p></div>)}</div></div></section>

        <section className="rva-section rva-money"><div className="wrap rva-moneygrid"><div><div className="rva-label">LES CHIFFRES DOIVENT SERVIR À DÉCIDER</div><h2>Ne vous contentez pas de savoir <span>combien vous vendez.</span></h2><p>Sachez ce que vos données permettent réellement de comprendre. RecuVente rapproche les ventes, coûts, paiements, commissions, dépôts et indicateurs selon les informations disponibles dans votre application.</p><div className="rva-statline">{[['COMMERCE CONFIRMÉ',statValue('montant_total_confirme')+' FCFA'],['COMMANDES',statValue('nb_commandes_confirmees')],['COMMISSIONS',statValue('commissions_livreurs_estimees')+' FCFA']].map(x=><div className="rva-statbox" key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong></div>)}</div></div><div className="rva-formula"><div className="rva-formrow"><span>Ventes / commerce confirmé</span><b>{statValue('montant_total_confirme')} FCFA</b></div><div className="rva-formrow"><span>Coûts produits & opérationnels</span><b>Selon vos données</b></div><div className="rva-formrow"><span>Livraisons / commissions</span><b>{statValue('commissions_livreurs_estimees')} FCFA</b></div><div className="rva-formrow total"><span>Résultat exploitable</span><b>À piloter</b></div><div className="rva-note">Les valeurs affichées sont issues des statistiques publiques disponibles dans l’application. Lorsqu’une donnée n’est pas disponible, aucun chiffre fictif n’est inventé.</div></div></div></section>

        <section className="rva-section"><div className="wrap"><div className="rva-center"><div className="rva-label">ACQUISITION → CONVERSION → OPÉRATIONS</div><h2 className="rva-title">Votre marketing ne devrait pas<br/><span>vivre dans une autre planète.</span></h2><p className="rva-desc">Les intégrations présentes dans votre application permettent de rapprocher acquisition, suivi commercial, relances et réalité opérationnelle.</p></div><div className="rva-marketing"><div className="rva-markcard"><div className="rva-marktop"><b>Facebook Pixel + CAPI</b><span className="rva-tag">META</span></div><p>Le code existant prévoit le Pixel Facebook et un mécanisme Conversions API. Présentez ces outils comme un pont entre publicité et signal commercial, sans promettre plus que l’intégration réelle.</p><div className="rva-integrations"><span className="rva-integration">Pixel</span><span className="rva-integration">CAPI</span><span className="rva-integration">Événements</span></div><div className="rva-bars">{[35,50,43,68,59,80,72].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div><div className="rva-markcard dark"><div className="rva-marktop"><b>TikTok Pixel + WhatsApp</b><span className="rva-tag">ACQUISITION</span></div><p>Rapprochez les leviers marketing et les outils commerciaux présents dans RecuVente pour garder une lecture plus cohérente du parcours.</p><div className="rva-integrations"><span className="rva-integration">TikTok Pixel</span><span className="rva-integration">WhatsApp</span><span className="rva-integration">Campagnes</span></div></div></div><div className="rva-recovery"><div><div className="rva-label">MONEY RECOVERY ENGINE</div><h3>Combien d'argent votre entreprise laisse-t-elle échapper ?</h3><p>Chaque commande en cours ou échouée reçoit un score de risque sur 100. RecuVente classe automatiquement ce qui est "Risque élevé", "À surveiller" ou "Très récupérable" — et génère un message WhatsApp pré-rempli, personnalisé par client, prêt à envoyer en un clic.</p></div><div className="rva-risk">{[['🔴 Risque élevé','Score 61-100 — à contacter en priorité'],['🟠 À surveiller','Score 31-60 — relance recommandée'],['🟢 Très récupérable','Score 0-30 — message WhatsApp prêt en 1 clic'],['📊 Taux de récupération','Mesuré automatiquement, en continu']].map(x=><div className="rva-riskrow" key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></div></div></section>

        <section className="rva-section rva-trust"><div className="wrap"><div className="rva-center"><div className="rva-label">CE QUE VOUS POUVEZ VÉRIFIER</div><h2 className="rva-title">Vos données restent<br/><span>les vôtres.</span></h2><p className="rva-desc">Pas de promesse vague : voici exactement comment votre espace est protégé.</p></div><div className="rva-trustGrid">{[['🔒','Isolation entre entreprises','Chaque entreprise cliente dispose d’un espace strictement isolé au niveau technique. Aucune entreprise ne peut accéder aux données d’une autre.'],['👥','Accès par rôle','Chaque membre de votre équipe (Admin, Comptable, Closer, Livreur, RH...) voit uniquement ce qui correspond à son rôle.'],['☁️','Hébergement sécurisé','Vos données sont hébergées via Supabase et Vercel, deux infrastructures cloud utilisées par des milliers d’entreprises.'],['📤','Vos droits sur vos données','Export ou suppression complète de vos données possible à tout moment, sur simple demande.']].map(x=><div className="rva-trustCard" key={x[1]}><div className="rva-trusticon">{x[0]}</div><h3>{x[1]}</h3><p>{x[2]}</p></div>)}</div></div></section>

        <section id="tarifs" className="rva-section rva-pricing"><div className="wrap"><div className="rva-priceHead"><div><div className="rva-label">CHOISIR LE NIVEAU QUI CORRESPOND À VOTRE ACTIVITÉ</div><h2 className="rva-title">Vous n’achetez pas<br/><span>des fonctionnalités.</span></h2></div><p>Vous investissez dans un environnement capable de centraliser votre activité. Les plans ci-dessous viennent directement de <b>subscription_plans</b> et seuls les plans payants sont affichés.</p></div>{plans.length?<div className="rva-plans">{plans.map((p,i)=><div key={p.id} className={`rva-plan ${i===Math.min(1,plans.length-1)?'featured':''}`}>{i===Math.min(1,plans.length-1)&&<div className="rva-badge">RECOMMANDÉ POUR GRANDIR</div>}<h3>{p.nom}</h3><div className="sub">Une formule adaptée à votre niveau d’activité.</div><div className="rva-planprice">{Number(p.prix).toLocaleString('fr-FR')} <small>{p.devise}/mois</small></div><ul><li>{p.max_commandes_mois?`${Number(p.max_commandes_mois).toLocaleString('fr-FR')} commandes/mois`:'Commandes selon le plan'}</li><li>{p.max_membres?`${p.max_membres} membres maximum`:'Équipe selon le plan'}</li><li>Ventes, clients & opérations</li><li>Tableau de bord & pilotage</li><li>Fonctionnalités prévues par votre formule</li></ul><button onClick={()=>goSignup(p)}>Choisir ce plan →</button></div>)}</div>:<div className="rva-empty">Chargement des offres… <a href="?auth=1&signup=1" onClick={()=>trackLead('Lead')}>Continuer vers l’abonnement →</a></div>}</div></section>

        <section id="faq" className="rva-section"><div className="wrap"><div className="rva-center"><div className="rva-label">FAQ</div><h2 className="rva-title">Les dernières objections.<br/><span>Les réponses clairement.</span></h2></div><div className="rva-faq">{faqs.map((f,i)=><div className="rva-faqrow" key={f[0]}><button onClick={()=>setOpenFaq(openFaq===i?null:i)}><span>{f[0]}</span><span className="rva-plus">{openFaq===i?'−':'+'}</span></button>{openFaq===i&&<div className="rva-answer">{f[1]}</div>}</div>)}</div></div></section>

        <section className="rva-final"><div className="wrap"><div className="rva-label">LE PROCHAIN NIVEAU COMMENCE PAR UNE DÉCISION</div><h2>Votre activité a grandi.<br/><span>Votre système doit suivre.</span></h2><p>Arrêtez de piloter une entreprise qui grandit avec des outils qui restent petits. Centralisez ce qui compte, structurez votre équipe et choisissez le plan qui correspond à votre réalité.</p><div className="rva-actions" style={{justifyContent:'center'}}><a className="rva-btn primary rva-orangeGlow" href="?auth=1&signup=1" onClick={()=>trackLead('Lead')}>Choisir mon abonnement →</a><a className="rva-btn ghost" href="#tarifs">Comparer les plans</a></div></div></section>
      </main>
      <div className="rva-sticky"><a href="#tarifs" onClick={()=>trackLead('ViewPricing')}>Choisir mon abonnement →</a></div>
    </div>
  );
}


function PageImpact() {
  const [stats, setStats] = useState(undefined);

  useEffect(() => {
    supabase.rpc("statistiques_impact_publiques").then(({ data }) => {
      if (data && data[0]) setStats(data[0]);
      else setStats(null);
    });
  }, []);

  if (stats === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A9089", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        Chargement…
      </div>
    );
  }

  const maxMontantMensuel = Math.max(...(stats?.evolution_mensuelle || []).map((m) => Number(m.montant)), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", color: "#16231F" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
/* ============================================================
   RECUVENTE — CORRECTION FINALE DEMANDÉE
   FOND VERT PARTOUT + ÉCRITURES BLANCHES
   3 300 000 FCFA
   Cette surcharge est placée en DERNIER pour écraser les
   anciennes couleurs de la LandingPage.
   ============================================================ */

.rva.rva-premium-africa{
  --rv-green-bg:#063B26;
  --rv-green-dark:#03110C;
  --rv-green-card:#0A4A31;
  --rv-green-light:#087A4D;
  --rv-orange:#FF6A00;
  --rv-gold:#FFB000;
  --rv-white:#FFFFFF;
  background:#03110C!important;
  color:#FFFFFF!important;
}

/* TOUS les grands fonds de la LandingPage deviennent verts */
.rva.rva-premium-africa .rva-numbers,
.rva.rva-premium-africa .rva-section,
.rva.rva-premium-africa .rva-3dsection,
.rva.rva-premium-africa .rva-system,
.rva.rva-premium-africa .rva-money,
.rva.rva-premium-africa .rva-pricing,
.rva.rva-premium-africa .rva-final{
  background:
    radial-gradient(circle at 80% 10%,rgba(0,245,160,.12),transparent 30%),
    linear-gradient(145deg,#03110C 0%,#063B26 52%,#052719 100%)!important;
  color:#FFFFFF!important;
}

/* Texte : BLANC ABSOLU sur la LandingPage */
.rva.rva-premium-africa .rva-numbers *,
.rva.rva-premium-africa .rva-section *,
.rva.rva-premium-africa .rva-system *,
.rva.rva-premium-africa .rva-money *,
.rva.rva-premium-africa .rva-pricing *,
.rva.rva-premium-africa .rva-final *{
  color:#FFFFFF!important;
}

/* Cartes vertes */
.rva.rva-premium-africa .rva-activity,
.rva.rva-premium-africa .rva-role,
.rva.rva-premium-africa .rva-markcard,
.rva.rva-premium-africa .rva-recovery,
.rva.rva-premium-africa .rva-compare>div,
.rva.rva-premium-africa .rva-plan,
.rva.rva-premium-africa .rva-formula,
.rva.rva-premium-africa .rva-path,
.rva.rva-premium-africa .rva-systemCard{
  background:linear-gradient(145deg,#0A4A31,#06321F)!important;
  border-color:rgba(255,255,255,.18)!important;
  color:#FFFFFF!important;
}

.rva.rva-premium-africa .rva-activity *,
.rva.rva-premium-africa .rva-role *,
.rva.rva-premium-africa .rva-markcard *,
.rva.rva-premium-africa .rva-recovery *,
.rva.rva-premium-africa .rva-compare>div *,
.rva.rva-premium-africa .rva-plan *,
.rva.rva-premium-africa .rva-formula *,
.rva.rva-premium-africa .rva-path *,
.rva.rva-premium-africa .rva-systemCard *{
  color:#FFFFFF!important;
}

/* Numéros/statistiques */
.rva.rva-premium-africa .rva-number{
  background:#063B26!important;
  border-color:rgba(255,255,255,.15)!important;
}
.rva.rva-premium-africa .rva-number small,
.rva.rva-premium-africa .rva-number strong,
.rva.rva-premium-africa .rva-number span{
  color:#FFFFFF!important;
}

/* Titres et textes secondaires : blanc, pas gris */
.rva.rva-premium-africa .rva-title,
.rva.rva-premium-africa .rva-title span,
.rva.rva-premium-africa .rva-copy h2,
.rva.rva-premium-africa .rva-copy h2 span,
.rva.rva-premium-africa .rva-center p,
.rva.rva-premium-africa .rva-desc,
.rva.rva-premium-africa .rva-copy p,
.rva.rva-premium-africa .rva-label{
  color:#FFFFFF!important;
}

/* Navigation verte + texte blanc */
.rva.rva-premium-africa .rva-nav{
  background:rgba(3,17,12,.98)!important;
}
.rva.rva-premium-africa .rva-links a,
.rva.rva-premium-africa .rva-logo,
.rva.rva-premium-africa .rva-menu{
  color:#FFFFFF!important;
}

/* CTA ORANGE + texte BLANC */
.rva.rva-premium-africa .rva-btn.primary,
.rva.rva-premium-africa .rva-navcta,
.rva.rva-premium-africa .rva-holoCTA,
.rva.rva-premium-africa .rva-plan button,
.rva.rva-premium-africa .mobileCta{
  background:linear-gradient(135deg,#FF6A00,#FFB000)!important;
  color:#FFFFFF!important;
  border:0!important;
}
.rva.rva-premium-africa .rva-btn.primary *,
.rva.rva-premium-africa .rva-navcta *,
.rva.rva-premium-africa .rva-holoCTA *,
.rva.rva-premium-africa .rva-plan button *,
.rva.rva-premium-africa .mobileCta *{
  color:#FFFFFF!important;
}

/* Boutons secondaires : fond vert, texte blanc */
.rva.rva-premium-africa .rva-btn.ghost,
.rva.rva-premium-africa .rva-copy .rva-btn:not(.primary){
  background:rgba(255,255,255,.08)!important;
  border:1px solid rgba(255,255,255,.35)!important;
  color:#FFFFFF!important;
}
.rva.rva-premium-africa .rva-btn.ghost *{
  color:#FFFFFF!important;
}

/* Pills */
.rva.rva-premium-africa .rva-pill{
  background:rgba(255,255,255,.08)!important;
  border-color:rgba(255,255,255,.2)!important;
  color:#FFFFFF!important;
}
.rva.rva-premium-africa .rva-pill.active{
  background:linear-gradient(135deg,#FF6A00,#FFB000)!important;
  color:#FFFFFF!important;
}

/* FAQ : vert + blanc */
.rva.rva-premium-africa .rva-faqrow{
  background:rgba(6,59,38,.7)!important;
  border-color:rgba(255,255,255,.2)!important;
}
.rva.rva-premium-africa .rva-faqrow button,
.rva.rva-premium-africa .rva-answer,
.rva.rva-premium-africa .rva-faqrow button *{
  color:#FFFFFF!important;
}

/* Badges / accents */
.rva.rva-premium-africa .rva-badge,
.rva.rva-premium-africa .rva-plus{
  background:linear-gradient(135deg,#FF6A00,#FFB000)!important;
  color:#FFFFFF!important;
}

/* Le mockup boutique reste une interface, mais son cadre extérieur est vert. */
.rva.rva-premium-africa .rva-3dstore,
.rva.rva-premium-africa .rva-browser3d{
  background:transparent!important;
}

/* Sécurité : aucune couleur de texte gris/noir héritée sur la Landing */
.rva.rva-premium-africa .rva-section p,
.rva.rva-premium-africa .rva-section li,
.rva.rva-premium-africa .rva-section small,
.rva.rva-premium-africa .rva-section strong,
.rva.rva-premium-africa .rva-section b,
.rva.rva-premium-africa .rva-section h1,
.rva.rva-premium-africa .rva-section h2,
.rva.rva-premium-africa .rva-section h3,
.rva.rva-premium-africa .rva-section h4{
  color:#FFFFFF!important;
}

/* Exception technique : le contenu d'un écran de boutique peut garder
   son contraste interne pour ressembler à une vraie boutique. */
.rva.rva-premium-africa .rva-shop{
  background:#FFFFFF!important;
  color:#082519!important;
}
.rva.rva-premium-africa .rva-shop *{
  color:#082519!important;
}

@media(max-width:650px){
  .rva.rva-premium-africa .rva-numbergrid{
    background:#063B26!important;
  }
}

`}</style>

      <div style={{ background: "linear-gradient(170deg, #0F1B16 0%, #16231F 60%, #1a7a3c 200%)", color: "white", padding: "40px 24px 50px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
          RECU<span style={{ color: "#e8920a" }}>VENTE</span>
        </div>
        <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: "#e8920a", background: "rgba(232,146,10,0.15)", padding: "4px 14px", borderRadius: 999, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Rapport d'impact
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: "clamp(24px, 4vw, 34px)", lineHeight: 1.2, maxWidth: 640, margin: "0 auto 14px" }}>
          L'état du e-commerce COD, rendu visible
        </div>
        <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 480, margin: "0 auto" }}>
          Données réelles, agrégées et anonymisées, issues des entreprises qui utilisent RecuVente au quotidien.
        </div>
      </div>

      {(!stats || Number(stats.nb_commandes_confirmees) === 0) ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#8A9089" }}>
          Pas encore assez de données pour publier ce rapport.
        </div>
      ) : (
        <div style={{ maxWidth: 900, margin: "-30px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 30 }}>
            {[
              { label: "Entreprises actives", valeur: stats.nb_entreprises_actives, couleur: "#16231F" },
              { label: "Livreurs actifs", valeur: stats.nb_livreurs_actifs, couleur: "#1a7a3c" },
              { label: "Commandes livrées", valeur: stats.nb_commandes_confirmees, couleur: "#1a7a3c" },
              { label: "FCFA de commerce traité", valeur: stats.montant_total_confirme, couleur: "#e8920a" },
              { label: "FCFA de commissions versées aux livreurs", valeur: stats.commissions_livreurs_estimees, couleur: "#e8920a" },
            ].map((item, i) => (
              <div key={i} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: "20px 18px", boxShadow: "0 20px 40px -25px rgba(15,27,22,0.2)" }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 24, color: item.couleur }}>
                  {Number(item.valeur).toLocaleString("fr-FR")}
                </div>
                <div style={{ fontSize: 12, color: "#6B7168", marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          {stats.evolution_mensuelle && stats.evolution_mensuelle.length > 0 && (
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 18, padding: "24px 22px", marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Évolution du commerce traité, 6 derniers mois</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
                {stats.evolution_mensuelle.map((m, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ fontSize: 10, color: "#8A9089", marginBottom: 4 }}>{Number(m.montant) > 0 ? Math.round(Number(m.montant) / 1000) + "k" : ""}</div>
                    <div style={{ width: "100%", background: "#1a7a3c", borderRadius: "6px 6px 0 0", height: `${Math.max(4, (Number(m.montant) / maxMontantMensuel) * 100)}%` }} />
                    <div style={{ fontSize: 10, color: "#6B7168", marginTop: 6 }}>{m.mois}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 14, padding: "16px 18px", fontSize: 11.5, color: "#8A9089", lineHeight: 1.6 }}>
            <strong style={{ color: "#16231F" }}>Méthodologie :</strong> ces chiffres sont calculés automatiquement à partir des commandes confirmées (livrées et payées) sur l'ensemble des entreprises utilisant RecuVente. Aucune donnée individuelle d'une entreprise ou d'un client n'est identifiable dans ce rapport. Les commissions livreurs sont estimées sur une base moyenne de 1 500 FCFA par livraison confirmée. Mis à jour en continu.
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "0 24px 40px" }}>
        <a href="/" style={{ color: "#1a7a3c", fontSize: 13, fontWeight: 600, textDecoration: "underline" }}>← Retour à l'accueil</a>
      </div>
    </div>
  );
}
function PageLegale({ page }) {
  const contenu = {
    cgu: {
      titre: "Conditions Générales d'Utilisation",
      texte: `Dernière mise à jour : ${new Date().toLocaleDateString("fr-FR")}

1. OBJET
RecuVente est une plateforme logicielle permettant aux entreprises de gestion de commandes en paiement à la livraison (COD) de gérer leurs commandes, équipes, livraisons et comptabilité.

2. INSCRIPTION ET ESSAI GRATUIT
Toute entreprise peut créer un espace et bénéficier d'un essai gratuit de 7 jours. Aucune carte bancaire n'est requise pour l'essai. À l'issue de l'essai, l'accès aux fonctionnalités de création de commandes est suspendu jusqu'à activation d'un abonnement payant, sans suppression des données existantes.

3. ABONNEMENTS ET PAIEMENT
Les tarifs des différents plans sont affichés sur la page d'accueil. Le paiement s'effectue par Mobile Money. L'activation du plan payant intervient après confirmation manuelle de la réception du paiement par l'équipe RecuVente.

4. DONNÉES DE L'ENTREPRISE CLIENTE
Chaque entreprise reste propriétaire de ses données (commandes, clients, équipe, finances). RecuVente s'engage à ne jamais partager ces données avec une autre entreprise cliente de la plateforme.

5. RÉSILIATION
Une entreprise peut cesser d'utiliser le service à tout moment. Les données restent accessibles en lecture pendant une période raisonnable après la fin de l'abonnement, sauf demande explicite de suppression.

6. RESPONSABILITÉ
RecuVente met à disposition un outil de gestion. La responsabilité de l'exactitude des données saisies (commandes, montants, coûts) incombe à l'entreprise cliente. RecuVente ne saurait être tenu responsable des pertes commerciales liées à une mauvaise utilisation de l'outil.

7. MODIFICATION DES CONDITIONS
Ces conditions peuvent être amenées à évoluer. Les entreprises clientes seront informées de tout changement significatif.

⚠️ Ce document est un modèle de départ, non validé par un juriste. Avant tout lancement commercial réel, une relecture par un professionnel du droit ivoirien (ou de la juridiction concernée) est fortement recommandée.`,
    },
    confidentialite: {
      titre: "Politique de confidentialité",
      texte: `Dernière mise à jour : ${new Date().toLocaleDateString("fr-FR")}

1. DONNÉES COLLECTÉES
RecuVente collecte : l'email et le mot de passe de connexion, le nom de l'entreprise, les données de commandes (clients, produits, montants), et les informations d'équipe (livreurs, closers, comptables) que vous saisissez volontairement.

2. UTILISATION DES DONNÉES
Ces données sont utilisées exclusivement pour faire fonctionner votre espace de gestion — jamais revendues, jamais partagées avec d'autres entreprises clientes de la plateforme, jamais utilisées à des fins publicitaires tierces.

3. ISOLATION ENTRE ENTREPRISES
Chaque entreprise cliente dispose d'un espace strictement isolé au niveau technique (base de données). Aucune entreprise ne peut accéder aux données d'une autre, même par erreur.

4. HÉBERGEMENT
Les données sont hébergées via Supabase (infrastructure cloud sécurisée) et Vercel.

5. VOS DROITS
Vous pouvez demander l'export ou la suppression complète de vos données à tout moment en contactant l'équipe RecuVente.

6. NOTIFICATIONS
Avec votre autorisation explicite, RecuVente peut vous envoyer des notifications sonores dans l'application lors de l'arrivée de nouvelles commandes.

⚠️ Ce document est un modèle de départ, non validé par un juriste. Avant tout lancement commercial réel, une relecture par un professionnel du droit est fortement recommandée.`,
    },
  };

  const c = contenu[page] || contenu.cgu;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="?" style={{ fontSize: 13, color: "#1a7a3c", textDecoration: "underline" }}>← Retour à l'accueil</a>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 26, marginTop: 16, marginBottom: 20 }}>{c.titre}</div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.7, color: "#16231F", background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 24 }}>
          {c.texte}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ modeInitial }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(modeInitial || "login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEnvoye, setResetEnvoye] = useState(false);
  const [confirmationRequise, setConfirmationRequise] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data.user && !data.session) setConfirmationRequise(true);
    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "?resetpw=1",
      });
      if (error) setError(error.message);
      else setResetEnvoye(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 340 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, marginBottom: 4 }}>RecuVente <span style={{ color: "#e8920a" }}>SaaS</span></div>
        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
          {mode === "signup" ? "Crée ton compte et ton espace" : mode === "reset" ? "Réinitialiser ton mot de passe" : "Connexion"}
        </div>

        {mode === "reset" && resetEnvoye ? (
          <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "14px 12px", fontSize: 13, color: "#3B6D11", marginBottom: 14 }}>
            ✅ Un lien de réinitialisation a été envoyé à <strong>{email}</strong>. Vérifie ta boîte mail (et les spams).
          </div>
        ) : mode === "signup" && confirmationRequise ? (
          <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "14px 12px", fontSize: 13, color: "#3B6D11", marginBottom: 14 }}>
            ✅ Compte créé ! Un email de confirmation a été envoyé à <strong>{email}</strong>. Clique sur le lien reçu pour activer ton compte, puis reviens te connecter.
          </div>
        ) : (
          <>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            {mode !== "reset" && (
              <input placeholder="Mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            )}
            {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button onClick={submit} disabled={loading} style={btnStyle}>
              {loading ? "..." : mode === "signup" ? "Créer mon compte" : mode === "reset" ? "Envoyer le lien" : "Se connecter"}
            </button>
          </>
        )}

        {mode !== "reset" && (
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: "#6B7168", cursor: "pointer" }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
            {mode === "signup" ? "Déjà un compte ? Se connecter" : "Pas de compte ? S'inscrire"}
          </div>
        )}
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#8A9089", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setMode("reset"); setError(""); setResetEnvoye(false); }}>
            Mot de passe oublié ?
          </div>
        )}
        {mode === "reset" && (
          <div style={{ textAlign: "center", marginTop: 8, fontSize: 12.5, color: "#6B7168", cursor: "pointer", textDecoration: "underline" }} onClick={() => { setMode("login"); setError(""); setResetEnvoye(false); }}>
            ← Retour à la connexion
          </div>
        )}
        <a href="?" style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 12, color: "#8A9089" }}>← Retour à l'accueil</a>
      </div>
    </Centered>
  );
}

function NouveauMotDePasseScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [succes, setSucces] = useState(false);

  async function submit() {
    setError("");
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setSucces(true);
    setLoading(false);
  }

  if (succes) {
    return (
      <Centered>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 340, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Mot de passe mis à jour</div>
          <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>Tu peux maintenant te reconnecter.</div>
          <a href="?auth=1" style={{ ...btnStyle, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>Se connecter</a>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 340 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Nouveau mot de passe</div>
        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>Choisis un nouveau mot de passe pour ton compte.</div>
        <input placeholder="Nouveau mot de passe" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <input placeholder="Confirme le mot de passe" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
        {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={btnStyle}>
          {loading ? "..." : "Enregistrer"}
        </button>
      </div>
    </Centered>
  );
}

function CreateWorkspaceScreen({ onCreate, loading, onAnnuler }) {
  const [nom, setNom] = useState("");
  const [activityType, setActivityType] = useState("cod_ecommerce");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [etape, setEtape] = useState(1);

  const types = [
    { key: "cod_ecommerce", icon: "📦", titre: "Vente en ligne (paiement à la livraison)", desc: "Commandes, livreurs, closers, suivi de livraison" },
    { key: "retail", icon: "🏪", titre: "Boutique / Commerce", desc: "Vente directe en magasin, avec suivi de stock" },
    { key: "location_immobiliere", icon: "🏠", titre: "Location immobilière", desc: "Suivi des loyers, locataires, relances de paiement" },
    { key: "restaurant", icon: "🍽️", titre: "Restaurant / Maquis / Fast-food", desc: "Menu, tables, suivi cuisine en temps réel" },
    { key: "location_vehicule", icon: "🚗", titre: "Location de véhicules / matériel", desc: "Véhicules, motos, matériel — dates, caution, disponibilité" },
    { key: "personnalise", icon: "🗂️", titre: "Autre activité (conseil, agence, clinique, association...)", desc: "Dossiers/commandes, clients, services, comptabilité, équipe — sans écrans spécifiques à un secteur" },
  ];

  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 360, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        {etape === 1 ? (
          <>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Bienvenue 👋</div>
            <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>
              Quel type d'activité gères-tu ?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {types.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActivityType(t.key)}
                  style={{
                    textAlign: "left", padding: "14px 16px", borderRadius: 12,
                    border: `2px solid ${activityType === t.key ? "#1a7a3c" : "#ECE8DC"}`,
                    background: activityType === t.key ? "#EAF3DE" : "white", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#16231F" }}>{t.titre}</div>
                  <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setEtape(2)} style={btnStyle}>
              Continuer
            </button>
            {onAnnuler && (
              <button onClick={onAnnuler} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12.5, padding: "10px 0 0", cursor: "pointer" }}>
                Annuler
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Presque fini</div>
            <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
              Nomme ton entreprise pour créer ton espace privé.
            </div>
            <input placeholder="Ex: Azali Express" value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} autoFocus />
            <input placeholder="Ton numéro WhatsApp (ex: 0708090910)" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#8A9089", marginTop: -6, marginBottom: 10 }}>
              Pour qu'on puisse te contacter, et pour recevoir les commandes de ta future boutique en ligne.
            </div>
            <button onClick={() => nom.trim() && whatsappNumber.trim() && onCreate(nom.trim(), activityType, whatsappNumber.trim())} disabled={loading || !nom.trim() || !whatsappNumber.trim()} style={btnStyle}>
              {loading ? "Création..." : "Créer mon espace"}
            </button>
            <button
              onClick={() => setEtape(1)}
              style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10, border: "1px solid #DDD8CC", background: "white", color: "#6B7168", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              ← Retour
            </button>
          </>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 10, border: "none", background: "none", color: "#8A9089", fontWeight: 500, fontSize: 12, cursor: "pointer" }}
        >
          Déconnexion
        </button>
      </div>
    </Centered>
  );
}

function LivreurCarteEcartCaisse({ l, workspaceId, currency }) {
  const [dernierDepot, setDernierDepot] = useState(null);

  useEffect(() => {
    supabase
      .from("depots_livreur")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("livreur_nom", l.nom)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setDernierDepot(data && data[0] ? data[0] : null));
  }, [l.nom, workspaceId]);

  const ecart = dernierDepot ? Number(dernierDepot.montant_declare) - l.aDeposer : null;
  const ecartSignificatif = ecart !== null && Math.abs(ecart) >= 500;

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nom}</div>
      <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{l.livrees} livraison{l.livrees > 1 ? "s" : ""} · {l.montantRecupere.toLocaleString("fr-FR")} {currency} encaissé</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1, background: "#FBF3E3", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#8A6412" }}>
          Commission : <strong>{l.commission.toLocaleString("fr-FR")}</strong>
        </div>
        <div style={{ flex: 1, background: "#EAF3DE", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#3B6D11" }}>
          Attendu : <strong>{l.aDeposer.toLocaleString("fr-FR")}</strong>
        </div>
      </div>

      {dernierDepot && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EEE6" }}>
          <div style={{ fontSize: 11, color: "#8A9089" }}>
            Dernier dépôt déclaré : <strong style={{ color: "#16231F" }}>{Number(dernierDepot.montant_declare).toLocaleString("fr-FR")} {currency}</strong> — {new Date(dernierDepot.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
          {ecartSignificatif ? (
            <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 7, padding: "6px 9px", marginTop: 6, fontSize: 11.5, color: "#D64933", fontWeight: 700 }}>
              🔴 Écart de caisse : {ecart > 0 ? "+" : ""}{ecart.toLocaleString("fr-FR")} {currency}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#1F9D6E", marginTop: 4, fontWeight: 600 }}>✅ Caisse correcte</div>
          )}
        </div>
      )}
    </div>
  );
}

function RadarDesFuitesEtActions({ todoAujourdhui, clientsARelancer, depotsParLivreur, produitsEnProgression = [], currency, onVoirRecovery, onVoirCompta, onVoirClients }) {
  const nonTraitees = todoAujourdhui.total;
  const jamaisRappeles = todoAujourdhui.jamaisContactees.length;
  const aRisque = todoAujourdhui.sansNouvelles.length;
  const echouees = todoAujourdhui.jamaisContactees.filter((c) => c.statut === "echouee").length
    + todoAujourdhui.sansNouvelles.filter((c) => c.statut === "echouee").length
    + todoAujourdhui.aRelivrer.filter((c) => c.statut === "echouee").length;
  const recuperables = Math.max(0, nonTraitees - jamaisRappeles);

  const potentielTotal = todoAujourdhui.argentARisque + todoAujourdhui.argentRecuperable;

  const livreurAControler = [...depotsParLivreur].sort((a, b) => b.aDeposer - a.aDeposer)[0];

  const etapes = [
    { label: `${nonTraitees} commande${nonTraitees > 1 ? "s" : ""} non traitée${nonTraitees > 1 ? "s" : ""}`, valeur: nonTraitees },
    { label: `${jamaisRappeles} client${jamaisRappeles > 1 ? "s" : ""} jamais rappelé${jamaisRappeles > 1 ? "s" : ""}`, valeur: jamaisRappeles },
    { label: `${aRisque} commande${aRisque > 1 ? "s" : ""} à risque`, valeur: aRisque },
    { label: `${echouees} livraison${echouees > 1 ? "s" : ""} échouée${echouees > 1 ? "s" : ""}`, valeur: echouees },
    { label: `${recuperables} client${recuperables > 1 ? "s" : ""} récupérable${recuperables > 1 ? "s" : ""}`, valeur: recuperables },
  ].filter((e) => e.valeur > 0);

  const actions = [];
  if (jamaisRappeles > 0) {
    actions.push({ num: "01", titre: "RAPPELER", cause: "Cause probable : jamais contactées depuis la commande", desc: `${jamaisRappeles} client${jamaisRappeles > 1 ? "s n'ont" : " n'a"} jamais répondu`, potentiel: todoAujourdhui.jamaisContactees.reduce((s, c) => s + Number(c.montant), 0), bouton: "RAPPELER", action: onVoirRecovery, couleur: "#D64933" });
  }
  if (echouees > 0) {
    actions.push({ num: "02", titre: "RÉCUPÉRER", cause: "Cause probable : client non joint ou absent à la livraison", desc: `${echouees} commande${echouees > 1 ? "s" : ""} échouée${echouees > 1 ? "s" : ""} peuvent être reprogrammées`, potentiel: todoAujourdhui.argentRecuperable, bouton: "RÉCUPÉRER", action: onVoirRecovery, couleur: "#8A6412" });
  }
  if (livreurAControler && livreurAControler.aDeposer > 0) {
    actions.push({ num: "03", titre: "CONTRÔLER", cause: "Cause probable : dépôt de caisse en retard", desc: `${livreurAControler.nom} doit déposer ${livreurAControler.aDeposer.toLocaleString("fr-FR")} ${currency}`, potentiel: null, bouton: "VÉRIFIER", action: onVoirCompta, couleur: "#1E4B8C" });
  }
  if (clientsARelancer.length > 0) {
    actions.push({ num: "04", titre: "RELANCER", cause: "Cause probable : rythme d'achat habituel atteint, moment idéal pour recontacter", desc: `${clientsARelancer.length} ancien${clientsARelancer.length > 1 ? "s clients correspondent" : " client correspond"} à leur rythme d'achat habituel`, potentiel: null, bouton: "RELANCER", action: onVoirClients, couleur: "#1a7a3c" });
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {etapes.length > 0 && (
        <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#f0a0a0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 12 }}>
            🔴 Argent en train de se perdre — aujourd'hui
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {etapes.map((e, i) => (
              <div key={i}>
                <div style={{ color: "white", fontSize: 13, fontWeight: 600, padding: "4px 0" }}>{e.label}</div>
                {i < etapes.length - 1 && <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, paddingLeft: 4 }}>↓</div>}
              </div>
            ))}
          </div>

          {potentielTotal > 0 && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "14px 0 12px" }} />
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>💰 Potentiel à récupérer</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 26, color: "#e8920a", marginTop: 3, marginBottom: 12 }}>
                {potentielTotal.toLocaleString("fr-FR")} {currency}
              </div>
              <button onClick={onVoirRecovery} style={{ width: "100%", background: "#e8920a", color: "#16231F", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                RÉCUPÉRER CES VENTES →
              </button>
            </>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: "18px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>🎯 Ton business aujourd'hui</div>
          <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 14 }}>
            {actions.length} action{actions.length > 1 ? "s" : ""} prioritaire{actions.length > 1 ? "s" : ""} à traiter
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.map((a) => (
              <div key={a.num} style={{ borderLeft: `3px solid ${a.couleur}`, paddingLeft: 12 }}>
                <div style={{ fontSize: 10.5, color: a.couleur, fontWeight: 700, letterSpacing: "0.03em" }}>{a.num} — {a.titre}</div>
                <div style={{ fontSize: 12.5, color: "#16231F", marginTop: 2 }}>{a.desc}</div>
                {a.cause && <div style={{ fontSize: 10.5, color: "#8A9089", fontStyle: "italic", marginTop: 2 }}>{a.cause}</div>}
                {a.potentiel > 0 && (
                  <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>Potentiel : {a.potentiel.toLocaleString("fr-FR")} {currency}</div>
                )}
                <button onClick={a.action} style={{ marginTop: 6, background: a.couleur, color: "white", border: "none", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                  {a.bouton}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {produitsEnProgression.length > 0 && (
        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 16, padding: "16px 20px", marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "#3B6D11", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
            📈 Ça progresse fort en ce moment
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {produitsEnProgression.map((p) => (
              <div key={p.nom} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#16231F" }}>{p.nom}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1F9D6E" }}>+{p.croissance}% cette semaine</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeIntelligent({ todoAujourdhui, clientsARelancer, produitStockCritique, meilleurLivreur, beneficeReel, currency, onVoirAujourdhui, palierActuel, palierSuivant, totalVentesConfirmees }) {
  const lignes = [];

  if (todoAujourdhui.sansNouvelles.length > 0) {
    const montant = todoAujourdhui.sansNouvelles.reduce((s, c) => s + Number(c.montant), 0);
    lignes.push({
      icone: "⚠️",
      couleur: "#D64933",
      texte: `${todoAujourdhui.sansNouvelles.length} commande${todoAujourdhui.sansNouvelles.length > 1 ? "s" : ""} sans nouvelles depuis 24h — ${montant.toLocaleString("fr-FR")} ${currency} à risque`,
    });
  }

  if (clientsARelancer.length > 0) {
    lignes.push({
      icone: "🔄",
      couleur: "#1a7a3c",
      texte: `${clientsARelancer.length} client${clientsARelancer.length > 1 ? "s" : ""} en retard sur leur rythme de réachat habituel`,
    });
  }

  if (produitStockCritique) {
    lignes.push({
      icone: "📦",
      couleur: "#8A6412",
      texte: `Le stock de "${produitStockCritique.nom}" descend à ${produitStockCritique.restant} pièce${produitStockCritique.restant > 1 ? "s" : ""}`,
    });
  }

  if (meilleurLivreur && meilleurLivreur.total > 0) {
    lignes.push({
      icone: "🚀",
      couleur: "#1F9D6E",
      texte: `${meilleurLivreur.nom} reste ton livreur le plus fiable (${meilleurLivreur.taux}% de réussite)`,
    });
  }

  if (typeof beneficeReel === "number") {
    lignes.push({
      icone: "💰",
      couleur: "#16231F",
      texte: `Bénéfice réel du mois : ${beneficeReel.toLocaleString("fr-FR")} ${currency}`,
    });
  }

  if (lignes.length === 0 && !palierActuel) return null;

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "16px 18px", margin: "14px 20px 0" }}>
      {palierActuel && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid #F0EEE6", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${palierActuel.couleur}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              {palierActuel.icone}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: palierActuel.couleur }}>Vendeur {palierActuel.nom}</div>
              <div style={{ fontSize: 11, color: "#8A9089" }}>{totalVentesConfirmees} vente{totalVentesConfirmees > 1 ? "s" : ""} confirmée{totalVentesConfirmees > 1 ? "s" : ""} au total</div>
            </div>
          </div>
          {palierSuivant && (
            <div style={{ fontSize: 11, color: "#8A9089", textAlign: "right" }}>
              Plus que <b style={{ color: "#16231F" }}>{palierSuivant.seuil - totalVentesConfirmees}</b> vente{(palierSuivant.seuil - totalVentesConfirmees) > 1 ? "s" : ""}<br/>
              pour {palierSuivant.icone} {palierSuivant.nom}
            </div>
          )}
        </div>
      )}
      {lignes.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            🧠 Ce matin chez vous
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {lignes.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: l.couleur, fontWeight: 600, lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0 }}>{l.icone}</span>
                <span>{l.texte}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {todoAujourdhui.total > 0 && (
        <button
          onClick={onVoirAujourdhui}
          style={{ marginTop: 14, width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
        >
          👉 Voir les {todoAujourdhui.total} commandes à traiter
        </button>
      )}
    </div>
  );
}

function SelecteurEspace({ workspace, workspacesDisponibles, onChangerEspace, onDemanderAjoutEspace }) {
  const [ouvert, setOuvert] = useState(false);
  const icones = { cod_ecommerce: "📦", retail: "🏪", location_immobiliere: "🏠" };

  return (
    <div style={{ position: "relative", marginBottom: 18, display: "flex", gap: 6 }}>
      <button
        onClick={() => setOuvert(!ouvert)}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 9, padding: "9px 10px", cursor: "pointer" }}
      >
        <span style={{ color: "white", fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
          {icones[workspace.activity_type] || "🏢"} {workspace.name}
        </span>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, flexShrink: 0, marginLeft: 6 }}>{ouvert ? "▲" : "▼"}</span>
      </button>
      <button
        onClick={onDemanderAjoutEspace}
        title="Ajouter un autre espace"
        style={{ flexShrink: 0, width: 36, background: "rgba(255,255,255,0.08)", border: "1px dashed rgba(255,255,255,0.35)", borderRadius: 9, color: "white", fontSize: 17, fontWeight: 700, cursor: "pointer" }}
      >
        +
      </button>

      {ouvert && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "white", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", padding: 6, zIndex: 40 }}>
          {workspacesDisponibles.map((w) => (
            <button
              key={w.id}
              onClick={() => { onChangerEspace(w.id); setOuvert(false); }}
              style={{ width: "100%", textAlign: "left", background: w.id === workspace.id ? "#EAF3DE" : "none", border: "none", borderRadius: 7, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: "#16231F", cursor: "pointer", marginBottom: 2 }}
            >
              {icones[w.activity_type] || "🏢"} {w.name}
            </button>
          ))}
          <button
            onClick={() => { onDemanderAjoutEspace(); setOuvert(false); }}
            style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #ECE8DC", marginTop: 4, paddingTop: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: "#1a7a3c", cursor: "pointer" }}
          >
            + Ajouter un autre espace
          </button>
        </div>
      )}
    </div>
  );
}

function RVStoreBuilder({ workspace, produits = [], clients = [], onClose, onOuvrirParametresAvances }) {
  const storageKey = `rv_store_builder_${workspace?.id || 'demo'}`;
  const [regenLienEnCours, setRegenLienEnCours] = useState(false);
  const [regenLienFait, setRegenLienFait] = useState(null);
  const activityType = workspace?.activity_type || 'cod_ecommerce';
  const activityLabel = ({cod_ecommerce:'E-commerce',retail:'Commerce physique',restaurant:'Restaurant',location_immobiliere:'Location immobilière',location_vehicule:'Location de voitures'})[activityType] || 'E-commerce';
  const sectionCatalog = {
    header:{icon:'🧭',label:'En-tête (fixe)',description:'Logo, recherche, compte, panier et menu — toujours affiché en haut de la boutique, comme sur Amazon/Shopify.'},
    announcement:{icon:'📣',label:'Barre d’annonce',description:'Message promotionnel ou information importante.'},
    hero:{icon:'✨',label:'Hero / couverture',description:'Grande image, titre, sous-titre et bouton.'},
    image_texte:{icon:'🖼️',label:'Image + Texte',description:'Une image d’un côté, un titre et un texte de l’autre — pour raconter ton histoire ou mettre en avant un argument.'},
    collections:{icon:'🗂️',label:'Collections',description:'Sélectionne exactement les collections à afficher.'},
    bestsellers:{icon:'🔥',label:'Meilleures ventes',description:'Sélectionne les produits à mettre en avant.'},
    bundles:{icon:'📦',label:'Bundles / Packs',description:'Offres quantité pour augmenter le panier moyen.'},
    products:{icon:'🛍️',label:'Catalogue produits',description:'Sélectionne les produits visibles dans cette section.'},
    benefits:{icon:'🛡️',label:'Réassurance',description:'Paiement COD, livraison, garantie et support.'},
    testimonials:{icon:'⭐',label:'Avis clients',description:'Preuves sociales.'},
    promo:{icon:'🏷️',label:'Promotion',description:'Offre spéciale.'},
    gallery:{icon:'🖼️',label:'Galerie',description:'Ajoute tes propres images.'},
    faq:{icon:'❓',label:'FAQ',description:'Questions et réponses.'},
    whatsapp:{icon:'💬',label:'WhatsApp',description:'Contact rapide.'},
    cod_form:{icon:'📝',label:'Bon de commande COD',description:'Quantité, frais de livraison et total.'},
    delivery:{icon:'🚚',label:'Livraison',description:'Zones et délais.'},
    contact:{icon:'🎯',label:'CTA final',description:'Dernier appel à l’action.'},
    flash_sale:{icon:'🔥',label:'Vente Flash',description:'Bandeau promo avec compte à rebours pour créer l’urgence.'},
    stats:{icon:'📊',label:'Chiffres clés',description:'Mets en avant tes chiffres (produits, catégories, délai, etc.).'},
    brands_cta:{icon:'🤝',label:'Marques + Contact',description:'« Une question ? Notre équipe est là » avec bouton WhatsApp.'},
    payment_methods:{icon:'💳',label:'Moyens de paiement',description:'Bande affichant les moyens de paiement acceptés.'},
    category_tiles:{icon:'🗂️',label:'Grille de catégories',description:'Tuiles cliquables vers tes collections.'},
    featured_product:{icon:'🌟',label:'Produit vedette',description:'Met en avant UN produit choisi, avec un extrait de sa description.'},
    rich_text:{icon:'📄',label:'Texte enrichi',description:'Un titre et un paragraphe de texte libre — à propos, mentions, engagements...'},
    video:{icon:'🎥',label:'Vidéo',description:'Intègre une vidéo YouTube ou Vimeo, avec titre optionnel.'},
    trust_logos:{icon:'🏅',label:'Logos de confiance',description:'Aligne des logos (presse, partenaires, certifications) pour crédibiliser ta boutique.'},
    before_after:{icon:'↔️',label:'Avant / Après',description:'Deux images côte à côte pour montrer une transformation.'},
    cta_banner:{icon:'📣',label:'Bandeau + Bouton CTA',description:'Grand bandeau avec titre, texte et bouton vers une action.'},
    contact_form:{icon:'✉️',label:'Formulaire de contact',description:'Formulaire nom/téléphone/message, envoyé directement sur ton WhatsApp.'},
    diaporama:{icon:'🎞️',label:'Diaporama',description:'Plusieurs images qui défilent automatiquement, chacune avec titre et bouton.'},
    featured_collection:{icon:'🗃️',label:'Collection en vedette',description:'Met en avant UNE collection avec une grande image de couverture.'},
    tabs:{icon:'📑',label:'Onglets (Tabs)',description:'Plusieurs blocs de contenu organisés en onglets cliquables.'},
    timeline:{icon:'🪜',label:'Étapes / Timeline',description:'Explique un processus en plusieurs étapes numérotées.'},
    reviews_carousel:{icon:'💬',label:'Avis en carousel',description:'Fait défiler tes avis clients un par un, avec photo et note.'},
    image_text_bubble:{icon:'🔵',label:'Image + Texte (bulles)',description:'Mise en page premium avec image et bloc de texte qui se chevauchent.'},
    custom_html:{icon:'🧩',label:'Code HTML personnalisé',description:'Pour les utilisateurs avancés : insère ton propre code HTML.'},
    scrolling_alert:{icon:'📢',label:'Alerte défilante',description:'Bandeau de texte qui défile en boucle, pour capter l’attention.'},
    two_images_text:{icon:'🖼️',label:'Deux images + Texte',description:'Deux images côte à côte avec un texte de présentation.'},
    wavy_banner:{icon:'🌊',label:'Bannière ondulée + Bouton',description:'Bannière avec bordure ondulée décorative et bouton d’action.'},
    footer:{icon:'▦',label:'Footer',description:'Coordonnées et liens.'}
  };
  const defaults = {
    theme:'premium', couleur:workspace?.couleur_marque || '#1a7a3c', nom:workspace?.name || 'Ma boutique',
    description:workspace?.description_boutique || 'Une boutique professionnelle, pensée pour convertir.',
    livraison:workspace?.politique_livraison || 'Livraison rapide et suivi de commande.', logo:workspace?.logo_url || '', banniere:workspace?.banniere_url || '',
    paiement:'cod', fraisLivraison:Number(workspace?.frais_livraison || 0), fraisExpedition:Number(workspace?.frais_expedition || 0),
    shippingLabel:'Frais de livraison', buttonText:activityType==='restaurant'?'Commander maintenant':activityType.includes('location')?'Réserver maintenant':'Acheter maintenant',
    announcement:'🚀 Livraison suivie • Paiement à la livraison • Support rapide',
    heroTitle:activityType==='restaurant'?'Découvrez notre menu':activityType==='location_immobiliere'?'Trouvez votre prochain séjour':activityType==='location_vehicule'?'Louez le véhicule qui vous correspond':'Votre boutique. Votre marque. Votre business.',
    heroSubtitle:'Une expérience moderne, rapide et pensée pour transformer les visiteurs en clients.', promoTitle:'Une offre à ne pas manquer', promoText:'Profitez de nos offres du moment.', whatsapp:'Bonjour, je souhaite avoir plus d’informations.',
    imageTexteImage:'', imageTexteTitre:'Pourquoi nous choisir', imageTexteTexte:'Raconte ici ce qui rend ta boutique unique — ton histoire, ton savoir-faire, ou ce qui compte pour tes clients.', imageTextePosition:'gauche',
    flashSaleTitre:'🔥 Vente Flash — jusqu\'à -50%', flashSaleTexte:'Offre valable sur une sélection de produits, stock limité',
    statsItems:[{valeur:'90+',label:'Produits disponibles'},{valeur:'5',label:'Catégories de produits'},{valeur:'48h',label:'Délai de livraison moyen'},{valeur:'100%',label:'Paiement à la livraison'}],
    brandsCtaTitre:'Une question ? Notre équipe est là pour vous.', brandsCtaTexte:'Contactez-nous sur WhatsApp pour un suivi de commande, des conseils produits ou toute autre question. Réponse rapide garantie.',
    paymentMethodsListe:['💸 Wave','📱 Orange Money','📱 MTN MoMo','💳 Visa / Mastercard','💵 Paiement à la livraison'],
    featuredProductId:'', featuredProductLabel:'Notre coup de cœur', featuredProductPosition:'gauche',
    richTextTitre:'À propos de nous', richTextTexte:'Raconte ici tes engagements, ton histoire ou toute information utile à tes clients.',
    videoUrl:'', videoTitre:'',
    trustLogos:[],
    beforeAfterAvant:'', beforeAfterApres:'', beforeAfterLegendeAvant:'Avant', beforeAfterLegendeApres:'Après',
    ctaBannerTitre:'Une offre à ne pas manquer', ctaBannerTexte:'Découvre notre sélection du moment.', ctaBannerBouton:'Découvrir', ctaBannerCouleur:'',
    contactFormTitre:'Une question ? Écris-nous', contactFormTexte:'Remplis ce formulaire, on te répond rapidement.',
    diaporamaSlides:[{id:'ds1',image:'',titre:'Bienvenue',texte:'Découvre notre sélection.',bouton:'Découvrir'}],
    featuredCollectionId:'', featuredCollectionTitre:'', featuredCollectionTexte:'Découvre notre sélection complète dans cette collection.',
    tabsItems:[{id:'tb1',titre:'Livraison',texte:'Livraison rapide partout, 24 à 72h selon ta zone.'},{id:'tb2',titre:'Paiement',texte:'Paiement à la livraison, mobile money ou carte.'},{id:'tb3',titre:'Retours',texte:'7 jours pour changer d\'avis, sans complication.'}],
    timelineEtapes:[{id:'tl1',titre:'Tu commandes',texte:'Choisis tes produits et valide ta commande.'},{id:'tl2',titre:'On prépare',texte:'Ton colis est préparé avec soin.'},{id:'tl3',titre:'Tu reçois',texte:'Livraison rapide directement chez toi.'}],
    imageTextBubbleImage:'', imageTextBubbleTitre:'Un savoir-faire qui fait la différence', imageTextBubbleTexte:'Décris ici ce qui distingue ta boutique — qualité, rapidité, service client...',
    customHtmlCode:'<div style="text-align:center;padding:20px;">Ton code HTML personnalisé ici.</div>',
    scrollingAlertTexte:'🚚 Livraison rapide  •  💵 Paiement à la livraison  •  🛡️ Achat sécurisé  •  ',
    twoImagesTextImage1:'', twoImagesTextImage2:'', twoImagesTextTitre:'Deux façons de nous découvrir', twoImagesTextTexte:'Présente ici deux aspects de ta boutique — deux collections, deux univers, deux services.',
    wavyBannerTitre:'Profite de notre offre spéciale', wavyBannerBouton:'Voir l\'offre',
    selectedProductIds:[], selectedCollectionIds:[], gallery:[],
    headerBgColor:'#131921', headerTextColor:'#ffffff', headerBarreTop:'Livraison rapide • Paiement à la livraison',
    headerShowSearch:true, headerShowCompte:true, headerShowPanier:true,
    headerLinks:[{id:'hl1',label:'Accueil',href:'#'},{id:'hl2',label:'Catalogue',href:'#produits'},{id:'hl3',label:'Promotions',href:'#promo'},{id:'hl4',label:'Contact',href:'#contact'}],
    footerBgColor:'#131921', footerTextColor:'#ffffff', footerBackToTop:true,
    footerNewsletterActif:true, footerNewsletterTexte:'Reçois nos offres et nouveautés en avant-première.',
    footerPaiements:['💵 Paiement à la livraison','📱 Mobile Money','💳 Carte bancaire'],
    footerColonnes:[
      {id:'fc1',titre:'À propos',liens:[{label:'Qui sommes-nous',href:'#'},{label:'Nos engagements',href:'#'}]},
      {id:'fc2',titre:'Service client',liens:[{label:'Nous contacter',href:'#contact'},{label:'FAQ',href:'#faq'},{label:'Suivi de commande',href:'#'}]},
      {id:'fc3',titre:'Paiement & Livraison',liens:[{label:'Paiement à la livraison',href:'#'},{label:'Zones de livraison',href:'#'}]}
    ],
    sections:activityType==='restaurant'?['announcement','hero','collections','products','bestsellers','bundles','benefits','testimonials','gallery','faq','cod_form','whatsapp','contact','footer']:['announcement','hero','collections','bestsellers','products','bundles','benefits','promo','testimonials','gallery','faq','delivery','cod_form','whatsapp','contact','footer'],
    bundles:[{id:'b1',qty:1,label:'1 unité',discount:0,badge:'Prix normal'},{id:'b2',qty:2,label:'Pack x2',discount:10,badge:'Économise 10%'},{id:'b3',qty:3,label:'Pack x3',discount:15,badge:'Meilleure offre'}],
    sectionColors:{}
  };
  const [config,setConfig]=useState(()=>{
    // Le logo, la bannière, la couleur, le nom et la description sont aussi modifiables
    // depuis "Paramètres avancés" — ces champs-là doivent toujours refléter la version
    // la plus récente du workspace, jamais une ancienne sauvegarde figée du Store Builder.
    const champsToujoursFrais = {
      logo: workspace?.logo_url || '',
      banniere: workspace?.banniere_url || '',
      couleur: workspace?.couleur_marque || defaults.couleur,
      nom: workspace?.name || defaults.nom,
      description: workspace?.description_boutique || defaults.description,
    };
    if(workspace?.store_config && typeof workspace.store_config==='object'){
      return {...defaults,...workspace.store_config,...champsToujoursFrais};
    }
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');return saved?{...defaults,...saved,...champsToujoursFrais}:{...defaults,...champsToujoursFrais}}catch(_){return {...defaults,...champsToujoursFrais}}
  });
  const [selected,setSelected]=useState('hero'); const [device,setDevice]=useState('desktop'); const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false); const [published,setPublished]=useState(false); const [showAdd,setShowAdd]=useState(false); const [uploading,setUploading]=useState(null);
  const [publishedSnapshot,setPublishedSnapshot]=useState(()=>workspace?.store_config_published||null);
  const [collections,setCollections]=useState([]);
  useEffect(()=>{let alive=true;(async()=>{if(!workspace?.id)return;const {data}=await supabase.from('collections').select('*').eq('workspace_id',workspace.id).order('ordre',{ascending:true});if(alive)setCollections(data||[]);})();return()=>{alive=false}},[workspace?.id]);
  const products=useMemo(()=>produits.map((p,i)=>({id:p.id||`p-${i}`,name:p.nom||p.name||p.titre||p.title||`Produit ${i+1}`,price:Number(p.prix_vente??p.prix??p.price??p.montant??0),image:p.image_url||p.image||p.photo||p.photo_url||'',category:p.collection||p.categorie||p.category||'Collection',description:p.description||p.desc||'Découvrez ce produit.'})),[produits]);
  const derivedCollections=useMemo(()=>collections.length?collections:[...new Map(products.map(p=>[p.category,{id:`derived-${p.category}`,nom:p.category,count:products.filter(x=>x.category===p.category).length}])).values()],[collections,products]);
  const selectedProducts=useMemo(()=>products.filter(p=>config.selectedProductIds?.includes(p.id)),[products,config.selectedProductIds]);
  const fallbackProducts=selectedProducts.length?selectedProducts:products.slice(0,8);
  const bestsellers=fallbackProducts.slice(0,4);
  function update(k,v){setConfig(c=>({...c,[k]:v}));}
  function toggleArray(key,id){setConfig(c=>{const a=new Set(c[key]||[]);a.has(id)?a.delete(id):a.add(id);return {...c,[key]:[...a]}})}
  function move(i,d){setConfig(c=>{const a=[...c.sections],j=i+d;if(j<0||j>=a.length)return c;[a[i],a[j]]=[a[j],a[i]];return {...c,sections:a}})}
  function ajouterLienHeader(){setConfig(c=>({...c,headerLinks:[...(c.headerLinks||[]),{id:'hl'+Date.now(),label:'Nouveau lien',href:'#'}]}))}
  function modifierLienHeader(id,champ,val){setConfig(c=>({...c,headerLinks:(c.headerLinks||[]).map(l=>l.id===id?{...l,[champ]:val}:l)}))}
  function supprimerLienHeader(id){setConfig(c=>({...c,headerLinks:(c.headerLinks||[]).filter(l=>l.id!==id)}))}
  function deplacerLienHeader(i,d){setConfig(c=>{const a=[...(c.headerLinks||[])],j=i+d;if(j<0||j>=a.length)return c;[a[i],a[j]]=[a[j],a[i]];return {...c,headerLinks:a}})}
  function ajouterColonneFooter(){setConfig(c=>({...c,footerColonnes:[...(c.footerColonnes||[]),{id:'fc'+Date.now(),titre:'Nouvelle colonne',liens:[]}]}))}
  function supprimerColonneFooter(id){setConfig(c=>({...c,footerColonnes:(c.footerColonnes||[]).filter(col=>col.id!==id)}))}
  function renommerColonneFooter(id,val){setConfig(c=>({...c,footerColonnes:(c.footerColonnes||[]).map(col=>col.id===id?{...col,titre:val}:col)}))}
  function ajouterLienColonneFooter(id){setConfig(c=>({...c,footerColonnes:(c.footerColonnes||[]).map(col=>col.id===id?{...col,liens:[...(col.liens||[]),{label:'Nouveau lien',href:'#'}]}:col)}))}
  function modifierLienColonneFooter(id,idx,champ,val){setConfig(c=>({...c,footerColonnes:(c.footerColonnes||[]).map(col=>col.id===id?{...col,liens:col.liens.map((l,j)=>j===idx?{...l,[champ]:val}:l)}:col)}))}
  function supprimerLienColonneFooter(id,idx){setConfig(c=>({...c,footerColonnes:(c.footerColonnes||[]).map(col=>col.id===id?{...col,liens:col.liens.filter((_,j)=>j!==idx)}:col)}))}
  function ajouterPaiementFooter(){setConfig(c=>({...c,footerPaiements:[...(c.footerPaiements||[]),'Nouveau moyen']}))}
  function modifierPaiementFooter(i,val){setConfig(c=>({...c,footerPaiements:(c.footerPaiements||[]).map((p,j)=>j===i?val:p)}))}
  function supprimerPaiementFooter(i){setConfig(c=>({...c,footerPaiements:(c.footerPaiements||[]).filter((_,j)=>j!==i)}))}
  const rowRefs=useRef([]); const dragInfo=useRef({active:false,from:null,current:null}); const [dragIndex,setDragIndex]=useState(null);
  const handlePointerMoveDrag=useCallback((e)=>{
    if(!dragInfo.current.active)return;
    const y=e.clientY;
    let idx=-1;
    rowRefs.current.forEach((node,i)=>{if(!node)return;const r=node.getBoundingClientRect();if(y>=r.top&&y<=r.bottom)idx=i;});
    if(idx!==-1&&idx!==dragInfo.current.current){
      const from=dragInfo.current.current;
      setConfig(c=>{const a=[...c.sections];const [moved]=a.splice(from,1);a.splice(idx,0,moved);return {...c,sections:a}});
      dragInfo.current.current=idx; setDragIndex(idx);
    }
  },[]);
  const handlePointerUpDrag=useCallback(()=>{
    dragInfo.current={active:false,from:null,current:null}; setDragIndex(null);
    document.removeEventListener('pointermove',handlePointerMoveDrag);
    document.removeEventListener('pointerup',handlePointerUpDrag);
  },[handlePointerMoveDrag]);
  function handlePointerDownDrag(e,i){
    e.preventDefault();
    dragInfo.current={active:true,from:i,current:i}; setDragIndex(i);
    document.addEventListener('pointermove',handlePointerMoveDrag);
    document.addEventListener('pointerup',handlePointerUpDrag);
  }
  function remove(i){setConfig(c=>({...c,sections:c.sections.filter((_,j)=>j!==i)}))}
  function baseSectionType(t){return String(t).replace(/_\d+$/,'');}
  function suffixeSection(t){const m=/_(\d+)$/.exec(String(t));return m?'_'+m[1]:'';}
  function urlEmbedVideo(url){
    if(!url)return '';
    const yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
    if(yt)return `https://www.youtube.com/embed/${yt[1]}`;
    const vim=url.match(/vimeo\.com\/(\d+)/);
    if(vim)return `https://player.vimeo.com/video/${vim[1]}`;
    return url;
  }
  function addSection(type){
    let typeFinal=type;
    setConfig(c=>{
      let nouveauType=type;
      if(type==='image_texte'){
        // Chaque "Image + Texte" ajoutée doit avoir ses propres champs, pas partager
        // ceux de la première — on lui donne un identifiant distinct (_2, _3, ...).
        const existants=c.sections.filter(s=>baseSectionType(s)==='image_texte').length;
        if(existants>0) nouveauType=`image_texte_${existants+1}`;
      }
      typeFinal=nouveauType;
      const patch=nouveauType!==type?{
        [`imageTexteTitre${suffixeSection(nouveauType)}`]:'Pourquoi nous choisir',
        [`imageTexteTexte${suffixeSection(nouveauType)}`]:'Raconte ici ce qui rend ta boutique unique — ton histoire, ton savoir-faire, ou ce qui compte pour tes clients.',
        [`imageTexteImage${suffixeSection(nouveauType)}`]:'',
        [`imageTextePosition${suffixeSection(nouveauType)}`]:'gauche',
      }:{};
      return {...c,...patch,sections:[...c.sections,nouveauType]};
    });
    setTimeout(()=>setSelected(typeFinal),0);
    setShowAdd(false);
  }
  async function uploadImage(kind,file){
    if(!file)return; if(file.size>8*1024*1024){alert('Image trop lourde (maximum 8 Mo).');return;} setUploading(kind);
    const fichierCompresse=await compresserImage(file);
    const ext=(fichierCompresse.name.split('.').pop()||'jpg').toLowerCase(); const path=`${workspace.id}/builder-${kind}-${Date.now()}.${ext}`;
    const {error}=await supabase.storage.from('boutique').upload(path,fichierCompresse,{upsert:true,contentType:fichierCompresse.type||undefined});
    if(error){alert('Impossible d’envoyer l’image : '+error.message);setUploading(null);return;}
    const {data}=supabase.storage.from('boutique').getPublicUrl(path); const url=data.publicUrl;
    if(kind==='hero') update('banniere',url); else if(kind==='logo') update('logo',url); else if(kind==='gallery') setConfig(c=>({...c,gallery:[...(c.gallery||[]),url]})); else if(kind==='trustLogo') setConfig(c=>({...c,trustLogos:[...(c.trustLogos||[]),url]})); else if(kind==='beforeAfterAvant') update('beforeAfterAvant',url); else if(kind==='beforeAfterApres') update('beforeAfterApres',url); else if(kind==='imageTextBubble') update('imageTextBubbleImage',url); else if(kind==='twoImagesText1') update('twoImagesTextImage1',url); else if(kind==='twoImagesText2') update('twoImagesTextImage2',url); else if(kind&&kind.startsWith('diaporamaSlide_')){const slideId=kind.slice('diaporamaSlide_'.length);setConfig(c=>({...c,diaporamaSlides:c.diaporamaSlides.map(x=>x.id===slideId?{...x,image:url}:x)}));} else if(kind&&kind.startsWith('imageTexte')) update(`imageTexteImage${kind.slice('imageTexte'.length)}`,url);
    setUploading(null);
  }
  async function save(){
    setSaving(true);setSaved(false);
    try{localStorage.setItem(storageKey,JSON.stringify(config));}catch(_){}
    if(workspace?.id){
      const patch={name:config.nom,couleur_marque:config.couleur,description_boutique:config.description,politique_livraison:config.livraison,logo_url:config.logo||null,banniere_url:config.banniere||null,frais_livraison:Number(config.fraisLivraison)||0,frais_expedition:Number(config.fraisExpedition)||0,store_config:config,store_config_published:config,store_is_published:true,store_published_at:new Date().toISOString()};
      const {error}=await supabase.from('workspaces').update(patch).eq('id',workspace.id);
      if(error){setSaving(false);alert('Enregistrement impossible : '+error.message);return false;}
      // Le nom a changé : on régénère le lien de la boutique (slug) pour qu'il reste cohérent avec le nouveau nom.
      if(config.nom && config.nom !== workspace.name){
        const {data:nouveauSlug}=await supabase.rpc('generer_slug_boutique',{p_nom:config.nom,p_workspace_id:workspace.id});
        if(nouveauSlug) await supabase.from('workspaces').update({slug:nouveauSlug}).eq('id',workspace.id);
      }
    }
    setPublishedSnapshot(config);
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2200);
    return true;
  }
  async function publish(){
    const ok=await save();
    if(!ok)return;
    if(workspace?.id){
      const {data,error}=await supabase.from('workspaces').update({store_config_published:config,store_published_at:new Date().toISOString(),store_is_published:true}).eq('id',workspace.id).select();
      if(error){alert('Publication impossible : '+error.message);return;}
      if(!data||data.length===0){alert('⚠️ La publication semble avoir échoué silencieusement (aucune ligne modifiée). Vérifie les droits sur la table "workspaces" dans Supabase.');return;}
    }
    setPublishedSnapshot(config);
    setPublished(true);setTimeout(()=>setPublished(false),2500);
  }
  const fieldStyle={width:'100%',boxSizing:'border-box',border:'1px solid #dfe6df',borderRadius:10,padding:'10px 11px',fontSize:12,outline:'none',background:'#fff'};
  const labelStyle={display:'block',fontSize:10.5,color:'#647168',fontWeight:750,marginBottom:10}; const cardStyle={background:'#fff',border:'1px solid #e4ebe5',borderRadius:16,boxShadow:'0 8px 24px rgba(17,38,26,.045)'};
  const FileButton=({kind,label})=><label style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,border:'1px solid #cfdad2',background:'#f8fbf8',color:'#1a7a3c',borderRadius:10,padding:'9px 12px',fontSize:11,fontWeight:900,cursor:'pointer',width:'100%',boxSizing:'border-box'}}>{uploading===kind?'⏳ Envoi...':`📤 ${label}`}<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadImage(kind,e.target.files?.[0])}/></label>;
  function PreviewSection({type}){
    const coul=config.sectionColors?.[type]||config.couleur;
    const common={padding:'28px 22px',borderBottom:'1px solid #edf1ee'};
    if(type==='announcement')return <div style={{...common,padding:'9px 14px',background:coul,color:'#fff',fontSize:10.5,fontWeight:800,textAlign:'center'}}>{config.announcement}</div>;
    if(type==='hero')return <div style={{...common,padding:0,textAlign:'center'}}><div style={{position:'relative'}}>{config.banniere?<img src={config.banniere} alt="Couverture" style={{width:'100%',height:device==='mobile'?155:220,objectFit:'cover',display:'block'}}/>:<div style={{height:device==='mobile'?155:220,background:`linear-gradient(135deg,${coul},#0b2416)`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',padding:20}}><div style={{fontSize:device==='mobile'?25:36,fontWeight:950,maxWidth:620,lineHeight:1.04}}>{config.heroTitle}</div></div>}</div><div style={{padding:'22px 20px 28px'}}><div style={{fontSize:device==='mobile'?24:32,fontWeight:950,color:'#132019',lineHeight:1.08}}>{config.heroTitle}</div><div style={{fontSize:12.5,color:'#68756d',lineHeight:1.6,margin:'10px auto 16px',maxWidth:600}}>{config.heroSubtitle}</div>{config.buttonText&&config.buttonText.trim()&&<button style={{border:0,borderRadius:10,padding:'12px 19px',background:coul,color:'#fff',fontWeight:900}}>{config.buttonText}</button>}</div></div>;
    if(type==='image_texte'||baseSectionType(type)==='image_texte'){const suf=suffixeSection(type);const img=config[`imageTexteImage${suf}`];const titre=config[`imageTexteTitre${suf}`];const texte=config[`imageTexteTexte${suf}`];const inverse=config[`imageTextePosition${suf}`]==='droite';return <div style={{...common,padding:0}}><div style={{display:'flex',flexDirection:device==='mobile'?'column':(inverse?'row-reverse':'row')}}><div style={{flex:1,minHeight:device==='mobile'?160:220,background:img?`url(${img}) center/cover`:`linear-gradient(135deg,${coul},#0b2416)`}}/><div style={{flex:1,padding:'26px 22px',display:'flex',flexDirection:'column',justifyContent:'center'}}><div style={{fontSize:device==='mobile'?18:22,fontWeight:900,color:'#132019',marginBottom:8}}>{titre}</div><div style={{fontSize:12,color:'#68756d',lineHeight:1.65}}>{texte}</div></div></div></div>;}
    if(type==='flash_sale')return <div style={{...common,padding:'26px 20px',textAlign:'center',background:'linear-gradient(135deg,#D64933,#e8920a)'}}><div style={{color:'#fff',fontWeight:900,fontSize:device==='mobile'?16:19}}>{config.flashSaleTitre}</div><div style={{color:'rgba(255,255,255,.86)',fontSize:11.5,margin:'6px 0 16px'}}>{config.flashSaleTexte}</div><div style={{display:'flex',justifyContent:'center',gap:8}}>{['Jours','Hr','Min','Sec'].map(u=><div key={u} style={{background:'rgba(255,255,255,.18)',borderRadius:10,padding:'8px 12px',color:'#fff',minWidth:48}}><div style={{fontWeight:950,fontSize:16}}>00</div><div style={{fontSize:8.5,opacity:.85}}>{u}</div></div>)}</div></div>;
    if(type==='stats')return <div style={{...common,textAlign:'center',background:'#FAFAF7'}}><div style={{fontSize:10,color:'#8A9089',fontWeight:800,marginBottom:16,letterSpacing:'.05em'}}>NOS CHIFFRES</div><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},1fr)`,gap:12}}>{(config.statsItems||[]).map((s,i)=><div key={i}><div style={{fontSize:device==='mobile'?18:24,fontWeight:950,color:coul}}>{s.valeur}</div><div style={{fontSize:10,color:'#6B7168',marginTop:4}}>{s.label}</div></div>)}</div></div>;
    if(type==='brands_cta')return <div style={{...common,textAlign:'center',background:'#16231F'}}><div style={{fontWeight:900,fontSize:device==='mobile'?15:18,color:'#fff',marginBottom:8}}>{config.brandsCtaTitre}</div><div style={{fontSize:11.5,color:'rgba(255,255,255,.65)',maxWidth:420,margin:'0 auto 16px',lineHeight:1.6}}>{config.brandsCtaTexte}</div><button style={{border:0,borderRadius:10,padding:'11px 22px',background:'#25d366',color:'#fff',fontWeight:900,fontSize:12}}>💬 Écrire sur WhatsApp</button></div>;
    if(type==='payment_methods')return <div style={{...common,textAlign:'center'}}><div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:8}}>{(config.paymentMethodsListe||[]).map((m,i)=><div key={i} style={{background:'#FAFAF7',border:'1px solid #ECE8DC',borderRadius:8,padding:'8px 13px',fontSize:11,fontWeight:700,color:'#16231F'}}>{m}</div>)}</div></div>;
    if(type==='category_tiles')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>Faites vos achats par catégorie</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},1fr)`,gap:10}}>{derivedCollections.slice(0,8).map(c=><div key={c.id} style={{borderRadius:12,overflow:'hidden',background:'#f5f8f5',textAlign:'center',padding:'16px 8px'}}><div style={{fontSize:22}}>🗂️</div><div style={{fontWeight:850,fontSize:11,marginTop:6}}>{c.nom||c.name}</div></div>)}{!derivedCollections.length&&<div style={{gridColumn:'1/-1',padding:16,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#728078',fontSize:11}}>Crée des collections dans « Produits → Collections » pour remplir cette grille.</div>}</div></div>;
    if(type==='featured_product'){const p=products.find(x=>x.id===config.featuredProductId)||products[0];const inverse=config.featuredProductPosition==='droite';return <div style={{...common,padding:0}}>{!p?<div style={{padding:24,textAlign:'center',background:'#f6f9f6',color:'#728078',fontSize:11}}>Choisis un produit dans le panneau de droite.</div>:<div style={{display:'flex',flexDirection:device==='mobile'?'column':(inverse?'row-reverse':'row')}}><div style={{flex:1,minHeight:device==='mobile'?180:260,background:p.image?`url(${p.image}) center/cover`:'#eef3ee',display:p.image?undefined:'flex',alignItems:'center',justifyContent:'center',fontSize:34}}>{!p.image&&'🛍️'}</div><div style={{flex:1,padding:'26px 24px',display:'flex',flexDirection:'column',justifyContent:'center'}}><div style={{fontSize:10,fontWeight:900,color:coul,letterSpacing:'.06em',marginBottom:6}}>{(config.featuredProductLabel||'').toUpperCase()}</div><div style={{fontSize:device==='mobile'?18:23,fontWeight:900,color:'#132019',marginBottom:8}}>{p.name}</div><div style={{fontSize:12,color:'#68756d',lineHeight:1.65,marginBottom:12}}>{(p.description||'').slice(0,160)}{(p.description||'').length>160?'…':''}</div><div style={{fontSize:18,fontWeight:900,color:coul,marginBottom:12}}>{p.price?p.price.toLocaleString('fr-FR')+' '+(workspace?.currency||'XOF'):''}</div><button style={{alignSelf:'flex-start',border:0,borderRadius:10,padding:'11px 20px',background:coul,color:'#fff',fontWeight:900,fontSize:11.5}}>{config.buttonText||'Découvrir'}</button></div></div>}</div>;}
    if(type==='rich_text')return <div style={{...common,textAlign:'center'}}><div style={{fontSize:device==='mobile'?19:24,fontWeight:900,color:'#132019',marginBottom:10}}>{config.richTextTitre}</div><div style={{fontSize:12.5,color:'#68756d',lineHeight:1.75,maxWidth:560,margin:'0 auto'}}>{config.richTextTexte}</div></div>;
    if(type==='video')return <div style={common}>{config.videoTitre&&<div style={{fontSize:18,fontWeight:900,color:'#132019',marginBottom:12,textAlign:'center'}}>{config.videoTitre}</div>}{config.videoUrl?<div style={{position:'relative',paddingTop:'56.25%',borderRadius:12,overflow:'hidden',background:'#000'}}><iframe src={urlEmbedVideo(config.videoUrl)} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0}} allowFullScreen/></div>:<div style={{padding:40,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#728078',fontSize:11}}>Colle un lien YouTube ou Vimeo dans le panneau de droite.</div>}</div>;
    if(type==='trust_logos')return <div style={{...common,textAlign:'center'}}>{(config.trustLogos||[]).length?<div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:22}}>{config.trustLogos.map((u,i)=><img key={i} src={u} alt="" style={{height:34,objectFit:'contain',opacity:.85}}/>)}</div>:<div style={{padding:20,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#728078',fontSize:11}}>Ajoute des logos depuis le panneau de droite.</div>}</div>;
    if(type==='before_after')return <div style={common}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{[['beforeAfterAvant','beforeAfterLegendeAvant'],['beforeAfterApres','beforeAfterLegendeApres']].map(([imgKey,legKey])=><div key={imgKey}>{config[imgKey]?<img src={config[imgKey]} alt="" style={{width:'100%',height:device==='mobile'?110:180,objectFit:'cover',borderRadius:10}}/>:<div style={{height:device==='mobile'?110:180,background:'#eef3ee',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:26}}>🖼️</div>}<div style={{textAlign:'center',fontSize:11,fontWeight:800,marginTop:6,color:'#344239'}}>{config[legKey]}</div></div>)}</div></div>;
    if(type==='cta_banner')return <div style={{...common,textAlign:'center',background:config.ctaBannerCouleur||coul}}><div style={{color:'#fff',fontWeight:900,fontSize:device==='mobile'?18:22,marginBottom:8}}>{config.ctaBannerTitre}</div><div style={{color:'rgba(255,255,255,.85)',fontSize:12,marginBottom:16}}>{config.ctaBannerTexte}</div><button style={{border:0,borderRadius:10,padding:'11px 22px',background:'#fff',color:config.ctaBannerCouleur||coul,fontWeight:900,fontSize:12}}>{config.ctaBannerBouton}</button></div>;
    if(type==='contact_form')return <div style={common}><div style={{fontSize:19,fontWeight:900,color:'#132019',marginBottom:6,textAlign:'center'}}>{config.contactFormTitre}</div><div style={{fontSize:12,color:'#68756d',marginBottom:16,textAlign:'center'}}>{config.contactFormTexte}</div><div style={{display:'grid',gap:8,maxWidth:400,margin:'0 auto'}}><input disabled placeholder="Nom" style={{...fieldStyle,background:'#f6f9f6'}}/><input disabled placeholder="Téléphone" style={{...fieldStyle,background:'#f6f9f6'}}/><textarea disabled placeholder="Message" rows={3} style={{...fieldStyle,background:'#f6f9f6',resize:'none'}}/><button style={{border:0,borderRadius:10,padding:'11px',background:coul,color:'#fff',fontWeight:900,fontSize:12}}>Envoyer sur WhatsApp</button></div></div>;
    if(type==='diaporama'){const slide=(config.diaporamaSlides||[])[0];return <div style={{...common,padding:0,position:'relative'}}>{!slide?<div style={{padding:30,textAlign:'center',background:'#f6f9f6',color:'#728078',fontSize:11}}>Ajoute au moins une image dans le panneau de droite.</div>:<div style={{position:'relative',minHeight:device==='mobile'?170:260,background:slide.image?`url(${slide.image}) center/cover`:`linear-gradient(135deg,${coul},#0b2416)`,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',color:'#fff',padding:20}}><div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.28)'}}/><div style={{position:'relative',zIndex:2}}><div style={{fontSize:device==='mobile'?20:28,fontWeight:950,marginBottom:8}}>{slide.titre}</div><div style={{fontSize:12,opacity:.9,marginBottom:14,maxWidth:420}}>{slide.texte}</div>{slide.bouton&&<button style={{border:0,borderRadius:10,padding:'10px 20px',background:'#fff',color:coul,fontWeight:900,fontSize:11.5}}>{slide.bouton}</button>}</div></div>}{(config.diaporamaSlides||[]).length>1&&<div style={{position:'absolute',bottom:10,left:0,right:0,display:'flex',justifyContent:'center',gap:5}}>{config.diaporamaSlides.map((_,i)=><div key={i} style={{width:i===0?18:6,height:5,borderRadius:3,background:i===0?'#fff':'rgba(255,255,255,.5)'}}/>)}</div>}</div>;}
    if(type==='featured_collection'){const col=derivedCollections.find(c=>c.id===config.featuredCollectionId)||derivedCollections[0];return <div style={{...common,padding:0}}>{!col?<div style={{padding:24,textAlign:'center',background:'#f6f9f6',color:'#728078',fontSize:11}}>Crée une collection puis choisis-la dans le panneau de droite.</div>:<div style={{position:'relative',minHeight:device==='mobile'?170:240,background:`linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.6)),linear-gradient(135deg,${coul},#0b2416)`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',color:'#fff',padding:24}}><div style={{fontSize:10,fontWeight:900,letterSpacing:'.08em',opacity:.85,marginBottom:6}}>COLLECTION</div><div style={{fontSize:device==='mobile'?20:27,fontWeight:950,marginBottom:8}}>{config.featuredCollectionTitre||col.nom||col.name}</div><div style={{fontSize:12,opacity:.9,marginBottom:14,maxWidth:420}}>{config.featuredCollectionTexte}</div><button style={{border:0,borderRadius:10,padding:'10px 20px',background:'#fff',color:coul,fontWeight:900,fontSize:11.5}}>Voir la collection</button></div>}</div>;}
    if(type==='tabs')return <div style={common}><div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',justifyContent:'center'}}>{(config.tabsItems||[]).map((t,i)=><div key={t.id} style={{padding:'8px 14px',borderRadius:999,background:i===0?coul:'#f0f3f0',color:i===0?'#fff':'#425048',fontSize:11,fontWeight:800}}>{t.titre}</div>)}</div>{config.tabsItems?.[0]&&<div style={{textAlign:'center',fontSize:12.5,color:'#68756d',lineHeight:1.65,maxWidth:480,margin:'0 auto'}}>{config.tabsItems[0].texte}</div>}</div>;
    if(type==='timeline')return <div style={common}><div style={{display:'grid',gridTemplateColumns:device==='mobile'?'1fr':`repeat(${(config.timelineEtapes||[]).length},1fr)`,gap:16}}>{(config.timelineEtapes||[]).map((e,i)=><div key={e.id} style={{textAlign:'center'}}><div style={{width:34,height:34,borderRadius:'50%',background:coul,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,margin:'0 auto 10px',fontSize:14}}>{i+1}</div><div style={{fontWeight:900,fontSize:12.5,color:'#132019',marginBottom:5}}>{e.titre}</div><div style={{fontSize:11,color:'#68756d',lineHeight:1.5}}>{e.texte}</div></div>)}</div></div>;
    if(type==='reviews_carousel')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b',textAlign:'center'}}>Ce que disent nos clients</h3><div style={{display:'flex',gap:10,overflow:'hidden'}}>{(avisBoutique.length?avisBoutique:[{client_nom:'Cliente satisfaite',note:5,commentaire:'Très bon produit, livraison rapide !'}]).slice(0,3).map((a,i)=><div key={i} style={{flex:'0 0 auto',width:device==='mobile'?200:240,background:'#FAFAF7',border:'1px solid #ECE8DC',borderRadius:12,padding:14}}><div style={{color:'#e8920a',fontSize:13,marginBottom:6}}>{'★'.repeat(a.note||5)}</div><div style={{fontSize:11.5,color:'#16231F',lineHeight:1.5,marginBottom:8}}>{a.commentaire}</div><div style={{fontSize:10.5,fontWeight:800,color:'#6B7168'}}>{a.client_nom}</div></div>)}</div></div>;
    if(type==='image_text_bubble')return <div style={{...common,padding:'40px 24px',position:'relative'}}><div style={{display:'flex',flexDirection:device==='mobile'?'column':'row',alignItems:'center',gap:0,maxWidth:640,margin:'0 auto'}}><div style={{width:device==='mobile'?'100%':'55%',height:device==='mobile'?160:220,borderRadius:20,background:config.imageTextBubbleImage?`url(${config.imageTextBubbleImage}) center/cover`:`linear-gradient(135deg,${coul},#0b2416)`,boxShadow:'0 20px 40px rgba(0,0,0,.15)'}}/><div style={{width:device==='mobile'?'92%':'62%',marginTop:device==='mobile'?-24:0,marginLeft:device==='mobile'?0:-50,background:'#fff',borderRadius:18,padding:'22px 20px',boxShadow:'0 16px 34px rgba(0,0,0,.1)',position:'relative',zIndex:2}}><div style={{fontSize:17,fontWeight:900,color:'#132019',marginBottom:8}}>{config.imageTextBubbleTitre}</div><div style={{fontSize:11.5,color:'#68756d',lineHeight:1.6}}>{config.imageTextBubbleTexte}</div></div></div></div>;
    if(type==='custom_html')return <div style={common} dangerouslySetInnerHTML={{__html:config.customHtmlCode||''}}/>;
    if(type==='scrolling_alert')return <div style={{padding:'9px 0',background:coul,overflow:'hidden',whiteSpace:'nowrap'}}><div style={{display:'inline-block',color:'#fff',fontSize:10.5,fontWeight:800}}>{(config.scrollingAlertTexte||'').repeat(4)}</div></div>;
    if(type==='two_images_text')return <div style={{...common,textAlign:'center'}}><div style={{fontSize:device==='mobile'?18:22,fontWeight:900,color:'#132019',marginBottom:8}}>{config.twoImagesTextTitre}</div><div style={{fontSize:12,color:'#68756d',lineHeight:1.6,maxWidth:480,margin:'0 auto 16px'}}>{config.twoImagesTextTexte}</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,maxWidth:480,margin:'0 auto'}}>{[config.twoImagesTextImage1,config.twoImagesTextImage2].map((img,i)=><div key={i} style={{height:device==='mobile'?90:140,borderRadius:12,background:img?`url(${img}) center/cover`:'#eef3ee',display:img?undefined:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>{!img&&'🖼️'}</div>)}</div></div>;
    if(type==='wavy_banner')return <div style={{...common,padding:0}}><div style={{background:coul,padding:'34px 20px',textAlign:'center',position:'relative',clipPath:'ellipse(60% 100% at 50% 0%)'}}><div style={{color:'#fff',fontWeight:900,fontSize:device==='mobile'?17:21,marginBottom:14,marginTop:10}}>{config.wavyBannerTitre}</div><button style={{border:0,borderRadius:999,padding:'10px 22px',background:'#fff',color:coul,fontWeight:900,fontSize:11.5}}>{config.wavyBannerBouton}</button></div></div>;
    if(type==='collections')return <div style={common}><h3 style={{margin:'0 0 15px',fontSize:20,color:'#14221b'}}>Explorer les collections</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:3},1fr)`,gap:10}}>{derivedCollections.filter(c=>!config.selectedCollectionIds?.length||config.selectedCollectionIds.includes(c.id)).slice(0,6).map(c=><div key={c.id} style={{padding:'18px 10px',borderRadius:12,background:'#f5f8f5',textAlign:'center'}}><div style={{fontSize:20}}>🗂️</div><div style={{fontWeight:850,fontSize:11.5,marginTop:6}}>{c.nom||c.name}</div><div style={{fontSize:10,color:'#7c877f',marginTop:3}}>{c.count||0} article(s)</div></div>)}</div></div>;
    if(type==='bestsellers'||type==='products')return <div style={common}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><h3 style={{margin:0,fontSize:20,color:'#14221b'}}>{type==='bestsellers'?'🔥 Meilleures ventes':'Nos produits'}</h3><span style={{fontSize:10.5,color:'#758078'}}>Voir tout →</span></div><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},minmax(0,1fr))`,gap:10}}>{(type==='bestsellers'?bestsellers:fallbackProducts).slice(0,8).map((p,i)=><div key={p.id||i} style={{border:'1px solid #e7ece8',borderRadius:12,overflow:'hidden',background:'#fff'}}>{p.image?<img src={p.image} alt="" style={{width:'100%',height:device==='mobile'?115:150,objectFit:'cover'}}/>:<div style={{height:device==='mobile'?115:150,background:'#eef3ee',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>🛍️</div>}<div style={{padding:9,textAlign:'left'}}><div style={{fontWeight:850,fontSize:11.5,color:'#17241d'}}>{p.name}</div><div style={{fontWeight:900,fontSize:12.5,color:coul,marginTop:4}}>{p.price?p.price.toLocaleString('fr-FR')+' '+(workspace?.currency||'XOF'):'Prix sur demande'}</div><button style={{marginTop:8,width:'100%',border:0,borderRadius:8,padding:'7px 6px',background:coul,color:'#fff',fontSize:10,fontWeight:900}}>{activityType==='restaurant'?'Commander':activityType.includes('location')?'Réserver':'Ajouter'}</button></div></div>)}</div>{!products.length&&<div style={{padding:16,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#728078',fontSize:11}}>Ton catalogue est vide. Utilise « Produits → Importer un catalogue CSV » pour ajouter tes produits.</div>}</div>;
    if(type==='bundles'){const base=bestsellers[0]?.price||products[0]?.price||0;return <div style={{...common,background:'#fffdf7'}}><div style={{textAlign:'center',marginBottom:15}}><div style={{fontSize:10,fontWeight:950,color:'#b16b00',letterSpacing:'.08em'}}>🔥 OFFRES QUANTITÉ</div><h3 style={{margin:'5px 0',fontSize:21,color:'#14221b'}}>Plus tu prends, plus tu économises</h3></div><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:9}}>{(config.bundles||[]).map((b,i)=>{const total=base*b.qty*(1-(Number(b.discount)||0)/100);return <div key={b.id||i} style={{position:'relative',border:i===2?'2px solid '+coul:'1px solid #e4e9e5',borderRadius:14,padding:14,background:'#fff'}}><div style={{fontSize:12,fontWeight:950,color:'#16231c'}}>{b.label}</div><div style={{fontSize:10.5,color:'#7b857e',marginTop:4}}>{b.qty} produit(s) · {b.discount||0}% de remise</div><div style={{fontSize:20,fontWeight:950,color:coul,marginTop:10}}>{base?total.toLocaleString('fr-FR')+' '+(workspace?.currency||'XOF'):'Prix calculé à la commande'}</div><button style={{marginTop:10,width:'100%',border:0,borderRadius:9,padding:'9px',background:coul,color:'#fff',fontWeight:900,fontSize:10}}>Choisir ce pack</button></div>})}</div></div>}
    if(type==='gallery')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>Notre univers</h3>{config.gallery?.length?<div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},1fr)`,gap:8}}>{config.gallery.map((u,i)=><img key={i} src={u} alt="" style={{width:'100%',height:device==='mobile'?100:130,objectFit:'cover',borderRadius:10}}/>)}</div>:<div style={{padding:30,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#7a857e',fontSize:11}}>Ajoute tes images depuis le panneau de droite.</div>}</div>;
    if(type==='cod_form')return <div style={{...common,background:'#f7faf7'}}><div style={{maxWidth:520,margin:'0 auto'}}><div style={{textAlign:'center',marginBottom:15}}><div style={{fontSize:10,fontWeight:950,color:coul}}>COMMANDE SIMPLE & RAPIDE</div><h3 style={{margin:'5px 0',fontSize:21,color:'#14221b'}}>📝 Bon de commande — Paiement à la livraison</h3></div><div style={{background:'#fff',border:'1px solid #e1e8e2',borderRadius:14,padding:14}}><div style={{display:'grid',gridTemplateColumns:device==='mobile'?'1fr':'1fr 1fr',gap:8}}>{['Nom complet','Téléphone WhatsApp','Ville / commune','Adresse de livraison'].map(x=><div key={x} style={{border:'1px solid #e0e6e1',borderRadius:9,padding:11,fontSize:10.5,color:'#8a948d'}}>{x}</div>)}</div><div style={{marginTop:10,padding:11,borderRadius:10,background:'#f5f8f5',fontSize:11.5,color:'#435047'}}>🚚 Livraison : <b>{Number(config.fraisLivraison||0).toLocaleString('fr-FR')} {workspace?.currency||'XOF'}</b> · 🚛 Expédition : <b>{Number(config.fraisExpedition||0).toLocaleString('fr-FR')} {workspace?.currency||'XOF'}</b></div><button style={{marginTop:10,width:'100%',border:0,borderRadius:10,padding:12,background:coul,color:'#fff',fontWeight:950}}>Confirmer ma commande — paiement à la livraison</button></div></div></div>;
    if(type==='benefits')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>Pourquoi acheter chez nous ?</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:9}}>{[['🛡️','Paiement à la livraison'],['🚚','Livraison suivie'],['💬','Support rapide']].map(x=><div key={x[1]} style={{padding:14,borderRadius:11,background:'#f6f9f6'}}><div style={{fontSize:20}}>{x[0]}</div><div style={{fontWeight:850,fontSize:11.5,marginTop:7}}>{x[1]}</div></div>)}</div></div>;
    if(type==='promo')return <div style={{...common,background:'#f7f2e7',textAlign:'center'}}><div style={{fontSize:10,fontWeight:900,color:'#b16b00'}}>OFFRE LIMITÉE</div><h3 style={{fontSize:24,margin:'7px 0',color:'#162119'}}>{config.promoTitle}</h3><p style={{fontSize:12,color:'#6f776f'}}>{config.promoText}</p><button style={{border:0,borderRadius:9,padding:'10px 18px',background:coul,color:'#fff',fontWeight:900}}>Profiter de l'offre</button></div>;
    if(type==='testimonials')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>⭐ Ils nous font confiance</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:10}}>{['Une expérience simple et rapide.','La commande a été parfaitement suivie.','Je recommande sans hésiter.'].map((t,i)=><div key={i} style={{padding:15,border:'1px solid #e6ece7',borderRadius:12}}><div style={{color:coul}}>★★★★★</div><div style={{fontSize:11.5,lineHeight:1.55,color:'#435047',marginTop:7}}>“{t}”</div><div style={{fontSize:10,fontWeight:800,marginTop:9}}>Client</div></div>)}</div></div>;
    if(type==='faq')return <div style={common}><h3 style={{margin:'0 0 12px',fontSize:19,color:'#14221b'}}>Questions fréquentes</h3>{['Comment commander ?','Quels sont les délais ?','Comment suivre ma commande ?'].map(q=><div key={q} style={{padding:'12px 2px',borderBottom:'1px solid #e7ece8',fontSize:11.5,fontWeight:800,display:'flex',justifyContent:'space-between'}}>{q}<span>＋</span></div>)}</div>;
    if(type==='whatsapp')return <div style={{...common,textAlign:'center',background:'#f4faf5'}}><div style={{fontSize:26}}>💬</div><h3 style={{margin:'7px 0',fontSize:19,color:'#14221b'}}>Besoin d'aide ?</h3><p style={{fontSize:11.5,color:'#68756d'}}>Écris-nous directement sur WhatsApp.</p><button style={{border:0,borderRadius:10,padding:'10px 18px',background:'#168a45',color:'#fff',fontWeight:900}}>Ouvrir WhatsApp</button></div>;
    if(type==='delivery')return <div style={common}><h3 style={{margin:'0 0 9px',fontSize:19,color:'#14221b'}}>🚚 Livraison</h3><p style={{fontSize:11.5,color:'#68756d',lineHeight:1.6}}>{config.livraison}</p></div>;
    if(type==='contact')return <div style={{...common,textAlign:'center',background:'#0d2417',color:'#fff'}}><h3 style={{margin:'0 0 8px',fontSize:24}}>Prêt à passer à l'action ?</h3><p style={{fontSize:11.5,color:'rgba(255,255,255,.68)'}}>Commandez, réservez ou contactez-nous maintenant.</p>{config.buttonText&&config.buttonText.trim()&&<button style={{border:0,borderRadius:10,padding:'11px 20px',background:coul,color:'#fff',fontWeight:900}}>{config.buttonText}</button>}</div>;
    if(type==='footer')return <div style={{background:config.footerBgColor,color:config.footerTextColor}}>
      {config.footerBackToTop&&<div style={{textAlign:'center',padding:'10px 0',background:'rgba(255,255,255,.06)',fontSize:10.5,fontWeight:800,cursor:'pointer'}}>⬆ Retour en haut</div>}
      {config.footerNewsletterActif&&<div style={{textAlign:'center',padding:'20px 16px',borderBottom:'1px solid rgba(255,255,255,.12)'}}><div style={{fontWeight:900,fontSize:13}}>📩 Reste informé(e)</div><div style={{fontSize:10.5,opacity:.75,margin:'6px 0 10px'}}>{config.footerNewsletterTexte}</div><div style={{display:'flex',justifyContent:'center',gap:6,maxWidth:320,margin:'0 auto'}}><input placeholder="Ton email" disabled style={{flex:1,border:0,borderRadius:8,padding:'8px 10px',fontSize:10.5}}/><span style={{background:coul,color:'#fff',borderRadius:8,padding:'8px 12px',fontSize:10.5,fontWeight:800}}>S'inscrire</span></div></div>}
      <div style={{padding:'22px 20px',display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:Math.min((config.footerColonnes||[]).length||1,4)},1fr)`,gap:18}}>{(config.footerColonnes||[]).map(col=><div key={col.id}><div style={{fontWeight:900,fontSize:11.5,marginBottom:9}}>{col.titre}</div>{(col.liens||[]).map((l,i)=><div key={i} style={{fontSize:10.5,opacity:.75,marginBottom:6}}>{l.label}</div>)}</div>)}</div>
      {(config.footerPaiements||[]).length>0&&<div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',padding:'0 20px 18px'}}>{config.footerPaiements.map((p,i)=><span key={i} style={{background:'rgba(255,255,255,.08)',borderRadius:7,padding:'5px 9px',fontSize:9.5,fontWeight:700}}>{p}</span>)}</div>}
      <div style={{padding:'16px 20px',borderTop:'1px solid rgba(255,255,255,.12)',textAlign:'center',fontSize:10}}><div style={{fontWeight:900,fontSize:13,marginBottom:4}}>{config.nom}</div><div style={{opacity:.6,marginBottom:6}}>{config.description}</div><div style={{opacity:.45}}>© {new Date().getFullYear()} {config.nom} • Tous droits réservés</div></div>
    </div>;
    return <div style={common}/>;
  }
  function Editor(){
    const type=selected;
    const supporteCouleur=type&&type!=='header'&&type!=='footer';
    return <>
      {supporteCouleur&&<label style={labelStyle}>Couleur de cette section<div style={{display:'flex',gap:7}}><input type="color" value={config.sectionColors?.[type]||config.couleur} onChange={e=>setConfig(c=>({...c,sectionColors:{...(c.sectionColors||{}),[type]:e.target.value}}))} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.sectionColors?.[type]||config.couleur} onChange={e=>setConfig(c=>({...c,sectionColors:{...(c.sectionColors||{}),[type]:e.target.value}}))}/><button onClick={()=>setConfig(c=>{const sc={...(c.sectionColors||{})};delete sc[type];return {...c,sectionColors:sc}})} title="Revenir à la couleur globale" style={{fontSize:10,border:'1px solid #DDD8CC',borderRadius:8,padding:'0 10px',background:'#fff',cursor:'pointer'}}>↺</button></div></label>}
      <EditorInterne/>
    </>;
  }
  function EditorInterne(){
    const type=selected;
    if(type==='header')return <>
      <label style={labelStyle}>Texte de la barre du haut<input style={fieldStyle} value={config.headerBarreTop} onChange={e=>update('headerBarreTop',e.target.value)}/></label>
      <label style={labelStyle}>Couleur de fond<div style={{display:'flex',gap:7}}><input type="color" value={config.headerBgColor} onChange={e=>update('headerBgColor',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.headerBgColor} onChange={e=>update('headerBgColor',e.target.value)}/></div></label>
      <label style={labelStyle}>Couleur du texte<div style={{display:'flex',gap:7}}><input type="color" value={config.headerTextColor} onChange={e=>update('headerTextColor',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.headerTextColor} onChange={e=>update('headerTextColor',e.target.value)}/></div></label>
      <div style={{display:'flex',gap:10,margin:'4px 0 12px',flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,cursor:'pointer'}}><input type="checkbox" checked={!!config.headerShowSearch} onChange={e=>update('headerShowSearch',e.target.checked)}/> Barre de recherche</label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,cursor:'pointer'}}><input type="checkbox" checked={!!config.headerShowPanier} onChange={e=>update('headerShowPanier',e.target.checked)}/> Icône panier</label>
      </div>
      <div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:8}}>Liens du menu de navigation</div>
      <div style={{display:'grid',gap:6,marginBottom:8}}>{(config.headerLinks||[]).map((l,i)=>{
        const optionsCibles=[{v:'#',l:'Accueil (haut de page)'},{v:'#produits',l:'Produits'},{v:'#promo',l:'Promotions'},{v:'#bundles',l:'Bundles / Packs'},{v:'#avis',l:'Avis clients'},{v:'#faq',l:'Questions fréquentes'},{v:'#livraison',l:'Livraison'},{v:'#whatsapp',l:'WhatsApp'},{v:'#contact',l:'Contact'}];
        const estExterne=l.href&&!l.href.startsWith('#');
        return <div key={l.id} style={{border:'1px solid #e5ebe6',borderRadius:9,padding:8,display:'grid',gap:6}}>
          <div style={{display:'flex',gap:6}}><input placeholder="Libellé (ex: Nos produits)" value={l.label} onChange={e=>modifierLienHeader(l.id,'label',e.target.value)} style={{...fieldStyle,flex:1}}/><button onClick={()=>deplacerLienHeader(i,-1)} disabled={i===0} style={{border:0,background:'transparent',cursor:'pointer'}}>↑</button><button onClick={()=>deplacerLienHeader(i,1)} disabled={i===(config.headerLinks||[]).length-1} style={{border:0,background:'transparent',cursor:'pointer'}}>↓</button><button onClick={()=>supprimerLienHeader(l.id)} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div>
          <select value={estExterne?'externe':(l.href||'#')} onChange={e=>modifierLienHeader(l.id,'href',e.target.value==='externe'?'https://':e.target.value)} style={{...fieldStyle,background:'#fff'}}>
            {optionsCibles.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            <option value="externe">🔗 Lien externe (autre site)</option>
          </select>
          {estExterne&&<input placeholder="https://..." value={l.href} onChange={e=>modifierLienHeader(l.id,'href',e.target.value)} style={fieldStyle}/>}
        </div>;
      })}</div>
      <div style={{fontSize:10,color:'#8a958e',marginTop:-2,marginBottom:8,lineHeight:1.5}}>💡 Choisis vers quelle partie de ta page ce lien doit amener — ça se relie tout seul, pas besoin de code.</div>
      <button onClick={ajouterLienHeader} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un lien au menu</button>
      {config.logo&&<img src={config.logo} alt="" style={{width:54,height:54,objectFit:'contain',borderRadius:9,border:'1px solid #e2e9e3',marginTop:12}}/>}<div style={{marginTop:8}}><FileButton kind="logo" label="Télécharger / changer le logo"/></div>
    </>;
    if(type==='footer')return <>
      <label style={labelStyle}>Couleur de fond<div style={{display:'flex',gap:7}}><input type="color" value={config.footerBgColor} onChange={e=>update('footerBgColor',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.footerBgColor} onChange={e=>update('footerBgColor',e.target.value)}/></div></label>
      <label style={labelStyle}>Couleur du texte<div style={{display:'flex',gap:7}}><input type="color" value={config.footerTextColor} onChange={e=>update('footerTextColor',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.footerTextColor} onChange={e=>update('footerTextColor',e.target.value)}/></div></label>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,cursor:'pointer',margin:'2px 0 14px'}}><input type="checkbox" checked={!!config.footerBackToTop} onChange={e=>update('footerBackToTop',e.target.checked)}/> Bouton "Retour en haut"</label>
      <div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:8}}>Colonnes de liens</div>
      <div style={{display:'grid',gap:8,marginBottom:8}}>{(config.footerColonnes||[]).map(col=><div key={col.id} style={{border:'1px solid #e5ebe6',borderRadius:9,padding:9}}>
        <div style={{display:'flex',gap:6,marginBottom:7}}><input value={col.titre} onChange={e=>renommerColonneFooter(col.id,e.target.value)} style={{...fieldStyle,flex:1,fontWeight:800}}/><button onClick={()=>supprimerColonneFooter(col.id)} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>× colonne</button></div>
        <div style={{display:'grid',gap:5}}>{(col.liens||[]).map((l,idx)=><div key={idx} style={{display:'flex',gap:5}}><input placeholder="Libellé" value={l.label} onChange={e=>modifierLienColonneFooter(col.id,idx,'label',e.target.value)} style={{...fieldStyle,flex:1,fontSize:11}}/><input placeholder="Lien" value={l.href} onChange={e=>modifierLienColonneFooter(col.id,idx,'href',e.target.value)} style={{...fieldStyle,flex:1,fontSize:11}}/><button onClick={()=>supprimerLienColonneFooter(col.id,idx)} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div>)}</div>
        <button onClick={()=>ajouterLienColonneFooter(col.id)} style={{marginTop:6,width:'100%',border:'1px dashed #cdd8d0',background:'#fafcfa',borderRadius:7,padding:6,fontSize:10,fontWeight:800,color:'#1a7a3c',cursor:'pointer'}}>＋ Lien</button>
      </div>)}</div>
      <button onClick={ajouterColonneFooter} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer',marginBottom:14}}>＋ Ajouter une colonne</button>
      <div style={{borderTop:'1px solid #edf1ee',paddingTop:12,marginBottom:14}}>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontWeight:700,cursor:'pointer',marginBottom:8}}><input type="checkbox" checked={!!config.footerNewsletterActif} onChange={e=>update('footerNewsletterActif',e.target.checked)}/> Bloc newsletter</label>
        {config.footerNewsletterActif&&<label style={labelStyle}>Texte de la newsletter<textarea style={{...fieldStyle,resize:'vertical'}} rows={2} value={config.footerNewsletterTexte} onChange={e=>update('footerNewsletterTexte',e.target.value)}/></label>}
      </div>
      <div style={{borderTop:'1px solid #edf1ee',paddingTop:12}}>
        <div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:8}}>Moyens de paiement affichés</div>
        <div style={{display:'grid',gap:5,marginBottom:8}}>{(config.footerPaiements||[]).map((p,i)=><div key={i} style={{display:'flex',gap:5}}><input value={p} onChange={e=>modifierPaiementFooter(i,e.target.value)} style={{...fieldStyle,flex:1}}/><button onClick={()=>supprimerPaiementFooter(i)} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div>)}</div>
        <button onClick={ajouterPaiementFooter} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un moyen de paiement</button>
      </div>
    </>;
    if(type==='hero')return <><label style={labelStyle}>Titre principal<input style={fieldStyle} value={config.heroTitle} onChange={e=>update('heroTitle',e.target.value)}/></label><label style={labelStyle}>Sous-titre<textarea style={{...fieldStyle,resize:'vertical'}} rows={4} value={config.heroSubtitle} onChange={e=>update('heroSubtitle',e.target.value)}/></label><label style={labelStyle}>Texte du bouton<input style={fieldStyle} value={config.buttonText} onChange={e=>update('buttonText',e.target.value)}/></label>{config.banniere&&<img src={config.banniere} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:10,marginBottom:8}}/>}<FileButton kind="hero" label="Télécharger / changer la couverture"/><label style={{...labelStyle,marginTop:8}}>Ou URL de couverture<input style={fieldStyle} placeholder="https://..." value={config.banniere} onChange={e=>update('banniere',e.target.value)}/></label></>;
    if(type==='image_texte'||baseSectionType(type)==='image_texte'){const suf=suffixeSection(type);const kImg=`imageTexteImage${suf}`,kTitre=`imageTexteTitre${suf}`,kTexte=`imageTexteTexte${suf}`,kPos=`imageTextePosition${suf}`;return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config[kTitre]||''} onChange={e=>update(kTitre,e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={5} value={config[kTexte]||''} onChange={e=>update(kTexte,e.target.value)}/></label><label style={labelStyle}>Position de l'image<select style={fieldStyle} value={config[kPos]||'gauche'} onChange={e=>update(kPos,e.target.value)}><option value="gauche">Image à gauche</option><option value="droite">Image à droite</option></select></label>{config[kImg]&&<img src={config[kImg]} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:10,marginBottom:8}}/>}<FileButton kind={`imageTexte${suf}`} label="Télécharger / changer l'image"/><label style={{...labelStyle,marginTop:8}}>Ou URL de l'image<input style={fieldStyle} placeholder="https://..." value={config[kImg]||''} onChange={e=>update(kImg,e.target.value)}/></label></>;}
    if(type==='announcement')return <label style={labelStyle}>Message<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.announcement} onChange={e=>update('announcement',e.target.value)}/></label>;
    if(type==='flash_sale')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.flashSaleTitre} onChange={e=>update('flashSaleTitre',e.target.value)}/></label><label style={labelStyle}>Texte<input style={fieldStyle} value={config.flashSaleTexte} onChange={e=>update('flashSaleTexte',e.target.value)}/></label><div style={{fontSize:10.5,color:'#8A9089',marginTop:6}}>Le compte à rebours se réinitialise chaque jour à minuit, automatiquement.</div></>;
    if(type==='stats')return <div>{(config.statsItems||[]).map((s,i)=><div key={i} style={{border:'1px solid #e5ebe6',borderRadius:10,padding:9,marginBottom:8,display:'grid',gridTemplateColumns:'1fr 2fr',gap:6}}><input placeholder="Valeur (ex: 90+)" style={fieldStyle} value={s.valeur} onChange={e=>setConfig(c=>({...c,statsItems:c.statsItems.map((x,j)=>j===i?{...x,valeur:e.target.value}:x)}))}/><input placeholder="Label" style={fieldStyle} value={s.label} onChange={e=>setConfig(c=>({...c,statsItems:c.statsItems.map((x,j)=>j===i?{...x,label:e.target.value}:x)}))}/></div>)}</div>;
    if(type==='brands_cta')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.brandsCtaTitre} onChange={e=>update('brandsCtaTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.brandsCtaTexte} onChange={e=>update('brandsCtaTexte',e.target.value)}/></label><div style={{fontSize:10.5,color:'#8A9089',marginTop:6}}>Le bouton WhatsApp utilise automatiquement le numéro renseigné dans Paramètres avancés.</div></>;
    if(type==='payment_methods')return <div>{(config.paymentMethodsListe||[]).map((p,i)=><div key={i} style={{display:'flex',gap:5,marginBottom:6}}><input style={{...fieldStyle,flex:1}} value={p} onChange={e=>setConfig(c=>({...c,paymentMethodsListe:c.paymentMethodsListe.map((x,j)=>j===i?e.target.value:x)}))}/><button onClick={()=>setConfig(c=>({...c,paymentMethodsListe:c.paymentMethodsListe.filter((_,j)=>j!==i)}))} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div>)}<button onClick={()=>setConfig(c=>({...c,paymentMethodsListe:[...(c.paymentMethodsListe||[]),'💳 Nouveau moyen']}))} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:8,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un moyen de paiement</button></div>;
    if(type==='category_tiles')return <div style={{fontSize:11,color:'#6b776f'}}>Cette grille affiche automatiquement tes collections existantes. Crée-les dans « Produits → Collections ».</div>;
    if(type==='featured_product')return <><label style={labelStyle}>Étiquette (optionnelle)<input style={fieldStyle} value={config.featuredProductLabel} onChange={e=>update('featuredProductLabel',e.target.value)}/></label><label style={labelStyle}>Position de l'image<select style={fieldStyle} value={config.featuredProductPosition} onChange={e=>update('featuredProductPosition',e.target.value)}><option value="gauche">Image à gauche</option><option value="droite">Image à droite</option></select></label><div style={{fontSize:11,color:'#6b776f',margin:'10px 0'}}>Choisis le produit à mettre en avant :</div>{products.length?<div style={{display:'grid',gap:6,maxHeight:280,overflow:'auto'}}>{products.map(p=>{const on=config.featuredProductId===p.id;return <button key={p.id} onClick={()=>update('featuredProductId',p.id)} style={{display:'flex',alignItems:'center',gap:8,textAlign:'left',border:`1px solid ${on?'#1a7a3c':'#e2e8e3'}`,background:on?'#eef8f0':'#fff',borderRadius:9,padding:7,cursor:'pointer'}}>{p.image?<img src={p.image} alt="" style={{width:38,height:38,objectFit:'cover',borderRadius:7}}/>:<span style={{width:38,height:38,borderRadius:7,background:'#eef3ee',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>🛍️</span>}<span style={{flex:1,fontSize:10.8,fontWeight:850,color:'#233128'}}>{on?'☑ ':'□ '}{p.name}</span></button>})}</div>:<div style={{padding:12,background:'#fff6e8',borderRadius:9,fontSize:11}}>Aucun produit dans ton espace.</div>}</>;
    if(type==='rich_text')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.richTextTitre} onChange={e=>update('richTextTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={6} value={config.richTextTexte} onChange={e=>update('richTextTexte',e.target.value)}/></label></>;
    if(type==='video')return <><label style={labelStyle}>Titre (optionnel)<input style={fieldStyle} value={config.videoTitre} onChange={e=>update('videoTitre',e.target.value)}/></label><label style={labelStyle}>Lien YouTube ou Vimeo<input style={fieldStyle} placeholder="https://www.youtube.com/watch?v=..." value={config.videoUrl} onChange={e=>update('videoUrl',e.target.value)}/></label></>;
    if(type==='trust_logos')return <div><FileButton kind="trustLogo" label="Ajouter un logo"/>{(config.trustLogos||[]).length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginTop:10}}>{config.trustLogos.map((u,i)=><div key={i} style={{position:'relative',background:'#f6f9f6',borderRadius:8,padding:8}}><img src={u} alt="" style={{width:'100%',height:34,objectFit:'contain'}}/><button onClick={()=>setConfig(c=>({...c,trustLogos:c.trustLogos.filter((_,j)=>j!==i)}))} style={{position:'absolute',right:2,top:2,border:0,borderRadius:999,background:'#fff',color:'#b63d2c',cursor:'pointer',fontSize:11,width:18,height:18}}>×</button></div>)}</div>}</div>;
    if(type==='before_after')return <><div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:6}}>Image "Avant"</div><FileButton kind="beforeAfterAvant" label="Télécharger l'image Avant"/><label style={labelStyle}>Légende Avant<input style={fieldStyle} value={config.beforeAfterLegendeAvant} onChange={e=>update('beforeAfterLegendeAvant',e.target.value)}/></label><div style={{fontSize:11,fontWeight:900,color:'#344239',margin:'14px 0 6px'}}>Image "Après"</div><FileButton kind="beforeAfterApres" label="Télécharger l'image Après"/><label style={labelStyle}>Légende Après<input style={fieldStyle} value={config.beforeAfterLegendeApres} onChange={e=>update('beforeAfterLegendeApres',e.target.value)}/></label></>;
    if(type==='cta_banner')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.ctaBannerTitre} onChange={e=>update('ctaBannerTitre',e.target.value)}/></label><label style={labelStyle}>Texte<input style={fieldStyle} value={config.ctaBannerTexte} onChange={e=>update('ctaBannerTexte',e.target.value)}/></label><label style={labelStyle}>Texte du bouton<input style={fieldStyle} value={config.ctaBannerBouton} onChange={e=>update('ctaBannerBouton',e.target.value)}/></label><label style={labelStyle}>Couleur du bandeau<div style={{display:'flex',gap:7}}><input type="color" value={config.ctaBannerCouleur||config.couleur} onChange={e=>update('ctaBannerCouleur',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.ctaBannerCouleur||''} placeholder="Laisser vide = couleur principale" onChange={e=>update('ctaBannerCouleur',e.target.value)}/></div></label></>;
    if(type==='contact_form')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.contactFormTitre} onChange={e=>update('contactFormTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.contactFormTexte} onChange={e=>update('contactFormTexte',e.target.value)}/></label><div style={{fontSize:10.5,color:'#8A9089',marginTop:6}}>Le formulaire envoie directement le message sur ton numéro WhatsApp renseigné dans Paramètres avancés.</div></>;
    if(type==='diaporama')return <div>{(config.diaporamaSlides||[]).map((s,i)=><div key={s.id} style={{border:'1px solid #e5ebe6',borderRadius:10,padding:9,marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:10.5,fontWeight:900,color:'#344239'}}>Slide {i+1}</span><button onClick={()=>setConfig(c=>({...c,diaporamaSlides:c.diaporamaSlides.filter((_,j)=>j!==i)}))} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div>{s.image&&<img src={s.image} alt="" style={{width:'100%',height:70,objectFit:'cover',borderRadius:8,marginBottom:6}}/>}<FileButton kind={`diaporamaSlide_${s.id}`} label="Télécharger l'image"/><input placeholder="Titre" style={{...fieldStyle,marginTop:6}} value={s.titre} onChange={e=>setConfig(c=>({...c,diaporamaSlides:c.diaporamaSlides.map(x=>x.id===s.id?{...x,titre:e.target.value}:x)}))}/><input placeholder="Texte" style={{...fieldStyle,marginTop:6}} value={s.texte} onChange={e=>setConfig(c=>({...c,diaporamaSlides:c.diaporamaSlides.map(x=>x.id===s.id?{...x,texte:e.target.value}:x)}))}/><input placeholder="Texte du bouton" style={{...fieldStyle,marginTop:6}} value={s.bouton} onChange={e=>setConfig(c=>({...c,diaporamaSlides:c.diaporamaSlides.map(x=>x.id===s.id?{...x,bouton:e.target.value}:x)}))}/></div>)}<button onClick={()=>setConfig(c=>({...c,diaporamaSlides:[...(c.diaporamaSlides||[]),{id:'ds'+Date.now(),image:'',titre:'Nouveau slide',texte:'',bouton:'Découvrir'}]}))} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un slide</button></div>;
    if(type==='featured_collection')return <><label style={labelStyle}>Titre affiché (optionnel, sinon le nom de la collection)<input style={fieldStyle} value={config.featuredCollectionTitre} onChange={e=>update('featuredCollectionTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.featuredCollectionTexte} onChange={e=>update('featuredCollectionTexte',e.target.value)}/></label><div style={{fontSize:11,color:'#6b776f',margin:'10px 0'}}>Choisis la collection :</div>{derivedCollections.length?<div style={{display:'grid',gap:6}}>{derivedCollections.map(c=>{const on=config.featuredCollectionId===c.id;return <button key={c.id} onClick={()=>update('featuredCollectionId',c.id)} style={{textAlign:'left',border:`1px solid ${on?'#1a7a3c':'#e2e8e3'}`,background:on?'#eef8f0':'#fff',borderRadius:9,padding:'9px 10px',cursor:'pointer',fontSize:11,fontWeight:800}}>{on?'☑':'□'} {c.nom||c.name}</button>})}</div>:<div style={{padding:12,background:'#f6f9f6',borderRadius:9,fontSize:11}}>Aucune collection créée.</div>}</>;
    if(type==='tabs')return <div>{(config.tabsItems||[]).map((t,i)=><div key={t.id} style={{border:'1px solid #e5ebe6',borderRadius:10,padding:9,marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:10.5,fontWeight:900,color:'#344239'}}>Onglet {i+1}</span><button onClick={()=>setConfig(c=>({...c,tabsItems:c.tabsItems.filter((_,j)=>j!==i)}))} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div><input placeholder="Titre de l'onglet" style={fieldStyle} value={t.titre} onChange={e=>setConfig(c=>({...c,tabsItems:c.tabsItems.map(x=>x.id===t.id?{...x,titre:e.target.value}:x)}))}/><textarea placeholder="Texte" rows={2} style={{...fieldStyle,marginTop:6,resize:'vertical'}} value={t.texte} onChange={e=>setConfig(c=>({...c,tabsItems:c.tabsItems.map(x=>x.id===t.id?{...x,texte:e.target.value}:x)}))}/></div>)}<button onClick={()=>setConfig(c=>({...c,tabsItems:[...(c.tabsItems||[]),{id:'tb'+Date.now(),titre:'Nouvel onglet',texte:''}]}))} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un onglet</button></div>;
    if(type==='timeline')return <div>{(config.timelineEtapes||[]).map((e,i)=><div key={e.id} style={{border:'1px solid #e5ebe6',borderRadius:10,padding:9,marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:10.5,fontWeight:900,color:'#344239'}}>Étape {i+1}</span><button onClick={()=>setConfig(c=>({...c,timelineEtapes:c.timelineEtapes.filter((_,j)=>j!==i)}))} style={{border:0,background:'transparent',color:'#bd4b38',cursor:'pointer'}}>×</button></div><input placeholder="Titre" style={fieldStyle} value={e.titre} onChange={ev=>setConfig(c=>({...c,timelineEtapes:c.timelineEtapes.map(x=>x.id===e.id?{...x,titre:ev.target.value}:x)}))}/><textarea placeholder="Texte" rows={2} style={{...fieldStyle,marginTop:6,resize:'vertical'}} value={e.texte} onChange={ev=>setConfig(c=>({...c,timelineEtapes:c.timelineEtapes.map(x=>x.id===e.id?{...x,texte:ev.target.value}:x)}))}/></div>)}<button onClick={()=>setConfig(c=>({...c,timelineEtapes:[...(c.timelineEtapes||[]),{id:'tl'+Date.now(),titre:'Nouvelle étape',texte:''}]}))} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter une étape</button></div>;
    if(type==='reviews_carousel')return <div style={{fontSize:11,color:'#6b776f'}}>Cette section affiche automatiquement tes vrais avis clients enregistrés (mêmes que la section "Avis clients"). Rien à configurer ici.</div>;
    if(type==='image_text_bubble')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.imageTextBubbleTitre} onChange={e=>update('imageTextBubbleTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={4} value={config.imageTextBubbleTexte} onChange={e=>update('imageTextBubbleTexte',e.target.value)}/></label>{config.imageTextBubbleImage&&<img src={config.imageTextBubbleImage} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:10,marginBottom:8}}/>}<FileButton kind="imageTextBubble" label="Télécharger / changer l'image"/></>;
    if(type==='custom_html')return <><textarea style={{...fieldStyle,fontFamily:'monospace',fontSize:11,resize:'vertical'}} rows={10} value={config.customHtmlCode} onChange={e=>update('customHtmlCode',e.target.value)}/><div style={{fontSize:10.5,color:'#8A9089',marginTop:6}}>⚠️ Section pour utilisateurs avancés — un code mal formé peut casser l'affichage de cette section.</div></>;
    if(type==='scrolling_alert')return <label style={labelStyle}>Texte qui défile<input style={fieldStyle} value={config.scrollingAlertTexte} onChange={e=>update('scrollingAlertTexte',e.target.value)}/></label>;
    if(type==='two_images_text')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.twoImagesTextTitre} onChange={e=>update('twoImagesTextTitre',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.twoImagesTextTexte} onChange={e=>update('twoImagesTextTexte',e.target.value)}/></label><div style={{fontSize:11,fontWeight:900,color:'#344239',margin:'12px 0 6px'}}>Image 1</div><FileButton kind="twoImagesText1" label="Télécharger l'image 1"/><div style={{fontSize:11,fontWeight:900,color:'#344239',margin:'12px 0 6px'}}>Image 2</div><FileButton kind="twoImagesText2" label="Télécharger l'image 2"/></>;
    if(type==='wavy_banner')return <><label style={labelStyle}>Titre<input style={fieldStyle} value={config.wavyBannerTitre} onChange={e=>update('wavyBannerTitre',e.target.value)}/></label><label style={labelStyle}>Texte du bouton<input style={fieldStyle} value={config.wavyBannerBouton} onChange={e=>update('wavyBannerBouton',e.target.value)}/></label></>;
    if(type==='collections')return <div><div style={{fontSize:11,color:'#6b776f',marginBottom:10}}>Clique sur les collections à afficher. Si aucune n’est sélectionnée, toutes les collections seront affichées.</div>{derivedCollections.length?<div style={{display:'grid',gap:6}}>{derivedCollections.map(c=>{const id=c.id;const on=config.selectedCollectionIds?.includes(id);return <button key={id} onClick={()=>toggleArray('selectedCollectionIds',id)} style={{textAlign:'left',border:`1px solid ${on?'#1a7a3c':'#e2e8e3'}`,background:on?'#eef8f0':'#fff',borderRadius:9,padding:'9px 10px',cursor:'pointer',fontSize:11,fontWeight:800,color:'#233128'}}>{on?'☑':'□'} {c.nom||c.name} <span style={{float:'right',color:'#87928a'}}>{c.count||0}</span></button>})}</div>:<div style={{padding:12,background:'#f6f9f6',borderRadius:9,fontSize:11}}>Aucune collection. Crée d’abord une collection dans « Produits → Collections ».</div>}</div>;
    if(type==='products'||type==='bestsellers')return <div><div style={{fontSize:11,color:'#6b776f',marginBottom:10}}>Sélectionne les produits. Si aucun n’est sélectionné, RecuVente utilise automatiquement ton catalogue.</div>{products.length?<div style={{display:'grid',gap:6,maxHeight:300,overflow:'auto'}}>{products.map(p=>{const on=config.selectedProductIds?.includes(p.id);return <button key={p.id} onClick={()=>toggleArray('selectedProductIds',p.id)} style={{display:'flex',alignItems:'center',gap:8,textAlign:'left',border:`1px solid ${on?'#1a7a3c':'#e2e8e3'}`,background:on?'#eef8f0':'#fff',borderRadius:9,padding:7,cursor:'pointer'}}>{p.image?<img src={p.image} alt="" style={{width:38,height:38,objectFit:'cover',borderRadius:7}}/>:<span style={{width:38,height:38,borderRadius:7,background:'#eef3ee',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>🛍️</span>}<span style={{flex:1,fontSize:10.8,fontWeight:850,color:'#233128'}}>{on?'☑ ':'□ '}{p.name}</span><span style={{fontSize:10,fontWeight:900,color:'#1a7a3c'}}>{p.price.toLocaleString('fr-FR')}</span></button>})}</div>:<div style={{padding:12,background:'#fff6e8',borderRadius:9,fontSize:11}}>Aucun produit dans ton espace. Va dans « Produits » puis importe ton CSV Shopify.</div>}</div>;
    if(type==='gallery')return <div><FileButton kind="gallery" label="Ajouter une image à la galerie"/>{config.gallery?.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:7,marginTop:10}}>{config.gallery.map((u,i)=><div key={i} style={{position:'relative'}}><img src={u} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:8}}/><button onClick={()=>setConfig(c=>({...c,gallery:c.gallery.filter((_,j)=>j!==i)}))} style={{position:'absolute',right:4,top:4,border:0,borderRadius:999,background:'#fff',color:'#b63d2c',cursor:'pointer'}}>×</button></div>)}</div>}</div>;
    if(type==='bundles')return <div><div style={{fontSize:10.5,color:'#68756d',marginBottom:10}}>Configure tes offres par quantité.</div>{(config.bundles||[]).map((b,i)=><div key={b.id||i} style={{border:'1px solid #e5ebe6',borderRadius:10,padding:10,marginBottom:8}}><div style={{display:'grid',gridTemplateColumns:'1fr 70px',gap:7}}><label style={labelStyle}>Nom<input style={fieldStyle} value={b.label} onChange={e=>setConfig(c=>({...c,bundles:c.bundles.map((x,j)=>j===i?{...x,label:e.target.value}:x)}))}/></label><label style={labelStyle}>Qté<input type="number" min="1" style={fieldStyle} value={b.qty} onChange={e=>setConfig(c=>({...c,bundles:c.bundles.map((x,j)=>j===i?{...x,qty:Math.max(1,Number(e.target.value)||1)}:x)}))}/></label></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}><label style={labelStyle}>Remise %<input type="number" min="0" max="90" style={fieldStyle} value={b.discount} onChange={e=>setConfig(c=>({...c,bundles:c.bundles.map((x,j)=>j===i?{...x,discount:Math.min(90,Math.max(0,Number(e.target.value)||0))}:x)}))}/></label><label style={labelStyle}>Badge<input style={fieldStyle} value={b.badge||''} onChange={e=>setConfig(c=>({...c,bundles:c.bundles.map((x,j)=>j===i?{...x,badge:e.target.value}:x)}))}/></label></div></div>)}<button onClick={()=>setConfig(c=>({...c,bundles:[...(c.bundles||[]),{id:'b'+Date.now(),qty:(c.bundles?.length||0)+1,label:'Pack x'+((c.bundles?.length||0)+1),discount:10,badge:'Offre'}]}))} style={{width:'100%',border:'1px dashed #9fb5a5',background:'#f7faf7',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter un bundle</button></div>;
    if(type==='cod_form')return <div><div style={{padding:11,borderRadius:10,background:'#f4faf5',border:'1px solid #d9eadc',marginBottom:10}}><div style={{fontSize:11,fontWeight:950,color:'#1a7a3c'}}>💵 Paiement COD activé</div><div style={{fontSize:10.5,color:'#607068',marginTop:4}}>Prévu pour le marché africain. Le paiement en ligne pourra être connecté plus tard.</div></div><label style={labelStyle}>Frais de livraison locale<input type="number" min="0" style={fieldStyle} value={config.fraisLivraison} onChange={e=>update('fraisLivraison',e.target.value)}/></label><label style={labelStyle}>Frais d'expédition<input type="number" min="0" style={fieldStyle} value={config.fraisExpedition} onChange={e=>update('fraisExpedition',e.target.value)}/></label><label style={labelStyle}>Texte du bouton<input style={fieldStyle} value={config.buttonText} onChange={e=>update('buttonText',e.target.value)}/></label></div>;
    if(type==='delivery')return <label style={labelStyle}>Politique de livraison<textarea style={{...fieldStyle,resize:'vertical'}} rows={5} value={config.livraison} onChange={e=>update('livraison',e.target.value)}/></label>;
    if(type==='promo')return <><label style={labelStyle}>Titre de l'offre<input style={fieldStyle} value={config.promoTitle} onChange={e=>update('promoTitle',e.target.value)}/></label><label style={labelStyle}>Texte<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.promoText} onChange={e=>update('promoText',e.target.value)}/></label></>;
    if(type==='whatsapp')return <label style={labelStyle}>Message WhatsApp<textarea style={{...fieldStyle,resize:'vertical'}} rows={4} value={config.whatsapp} onChange={e=>update('whatsapp',e.target.value)}/></label>;
    return <div style={{padding:12,background:'#f5f8f5',borderRadius:11,fontSize:11.5,color:'#657169',lineHeight:1.55}}>Cette section est maintenant sélectionnable et configurable. Les produits et collections sont ceux de ton espace RecuVente.</div>;
  }
  const [ongletBuilder,setOngletBuilder]=useState('reglages');
  return <div style={{...cardStyle,padding:14,overflow:'hidden'}}>
    <style>{`
      .rv-builder-mobile-tabs{display:none}
      @media(max-width:900px){
        .rv-builder-grid{grid-template-columns:1fr !important}
        .rv-builder-mobile-tabs{display:flex;gap:6px;margin-bottom:10px}
        .rv-builder-panel{display:none}
        .rv-builder-panel.active{display:block}
      }
    `}</style>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:13}}><div><div style={{fontSize:20,fontWeight:950,color:'#122019'}}>🛍️ Store Builder <span style={{fontSize:10,background:'#eaf5eb',color:'#1a7a3c',padding:'5px 7px',borderRadius:999}}>{activityLabel}</span></div><button onClick={onClose} style={{marginLeft:'auto',border:'1px solid #dce5de',background:'#fff',color:'#526057',borderRadius:10,padding:'9px 11px',fontSize:11,fontWeight:850,cursor:'pointer'}}>✕ Fermer</button><div style={{fontSize:11.5,color:'#748078',marginTop:4}}>Construis ta boutique visuellement. Chaque section est éditable et reliée à ton catalogue.</div></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{workspace?.id && <a href={workspace.slug ? `${window.location.origin}/?boutique=${workspace.slug}` : `${window.location.origin}/?catalogue=${workspace.id}`} target="_blank" rel="noopener noreferrer" style={{border:'1px solid #dce5de',background:'#fff',color:'#1c2b22',borderRadius:10,padding:'10px 12px',fontSize:11,fontWeight:850,cursor:'pointer',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}>👁️ Voir ma boutique</a>}{onOuvrirParametresAvances && <button onClick={onOuvrirParametresAvances} style={{border:'1px solid #dce5de',background:'#fff',color:'#1c2b22',borderRadius:10,padding:'10px 12px',fontSize:11,fontWeight:850,cursor:'pointer'}}>⚙️ Paramètres avancés</button>}<button onClick={save} disabled={saving} style={{border:0,background:config.couleur,color:'#fff',borderRadius:10,padding:'10px 13px',fontSize:11,fontWeight:900,cursor:'pointer'}}>{saving?'Enregistrement…':saved?'✓ Enregistré et publié':'💾 Enregistrer et publier'}</button></div></div>
    {published && workspace?.id && <div style={{background:'#eaf5eb',border:'1px solid #c7dda3',borderRadius:10,padding:'10px 14px',marginBottom:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:800,color:'#3B6D11'}}>✅ Ta boutique est en ligne !</span><a href={workspace.slug ? `${window.location.origin}/?boutique=${workspace.slug}` : `${window.location.origin}/?catalogue=${workspace.id}`} target="_blank" rel="noopener noreferrer" style={{background:'#1a7a3c',color:'#fff',borderRadius:8,padding:'7px 14px',fontSize:11.5,fontWeight:800,textDecoration:'none'}}>👁️ Voir ma boutique →</a></div>}
    <div className="rv-builder-mobile-tabs">{[['structure','📋 Structure'],['apercu','👁️ Aperçu'],['reglages','⚙️ Réglages']].map(([k,l])=><button key={k} onClick={()=>setOngletBuilder(k)} style={{flex:1,border:0,borderRadius:9,padding:'9px 4px',fontSize:11,fontWeight:850,cursor:'pointer',background:ongletBuilder===k?config.couleur:'#eef2ee',color:ongletBuilder===k?'#fff':'#435047'}}>{l}</button>)}</div>
    <div className="rv-builder-grid" style={{display:'grid',gridTemplateColumns:device==='mobile'?'1fr':device==='tablet'?'190px minmax(0,1fr)':'220px minmax(0,1fr) 290px',gap:12,alignItems:'start'}}>
      <div className={`rv-builder-panel ${ongletBuilder==='structure'?'active':''}`} style={{...cardStyle,padding:12,boxShadow:'none'}}><div style={{fontSize:12.5,fontWeight:950,color:'#17241d',marginBottom:9}}>Structure de la page</div>
      <div onClick={()=>setSelected('header')} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 5px',marginBottom:6,background:selected==='header'?'#f0f7f1':'#fafbfa',border:'1px dashed #cdd8d0',borderRadius:8,cursor:'pointer'}}><span>🧭</span><span style={{flex:1,fontSize:10.8,fontWeight:800,color:'#24332a'}}>En-tête</span><span style={{fontSize:9,color:'#93a097'}}>🔒 fixe</span></div>
      {config.sections.map((s,i)=><div key={`${s}-${i}`} ref={el=>{rowRefs.current[i]=el}} onClick={()=>setSelected(s)} style={{display:'flex',alignItems:'center',gap:4,padding:'8px 5px',borderBottom:'1px solid #edf1ee',background:dragIndex===i?'#eaf3ec':selected===s?'#f0f7f1':'transparent',borderRadius:8,cursor:'pointer',boxShadow:dragIndex===i?'0 6px 16px rgba(17,38,26,.18)':'none',opacity:dragIndex===i?0.85:1,transition:dragIndex===i?'none':'background .12s'}}><span onPointerDown={e=>handlePointerDownDrag(e,i)} title="Glisser pour réordonner" style={{cursor:dragIndex===i?'grabbing':'grab',touchAction:'none',padding:'2px 4px',color:'#9aa79f',fontSize:12,userSelect:'none'}}>⠿</span><span>{sectionCatalog[s]?.icon||sectionCatalog[baseSectionType(s)]?.icon||'▦'}</span><span style={{flex:1,fontSize:10.8,fontWeight:800,color:'#24332a'}}>{sectionCatalog[s]?.label||(suffixeSection(s)?`${sectionCatalog[baseSectionType(s)]?.label||baseSectionType(s)} (${suffixeSection(s).slice(1)})`:sectionCatalog[s]?.label)||s}</span><button onClick={e=>{e.stopPropagation();move(i,-1)}} title="Monter" style={{border:0,background:'transparent',cursor:'pointer'}}>↑</button><button onClick={e=>{e.stopPropagation();move(i,1)}} title="Descendre" style={{border:0,background:'transparent',cursor:'pointer'}}>↓</button><button onClick={e=>{e.stopPropagation();remove(i)}} title="Supprimer" style={{border:0,background:'transparent',cursor:'pointer',color:'#bd4b38'}}>×</button></div>)}<button onClick={()=>setShowAdd(!showAdd)} style={{width:'100%',marginTop:10,border:'1px dashed #b9c8bd',background:'#f8fbf8',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter une section</button>{showAdd&&<div style={{marginTop:7,display:'grid',gap:4,maxHeight:280,overflow:'auto'}}>{Object.entries(sectionCatalog).filter(([k])=>k!=='header').map(([k,v])=><button key={k} onClick={()=>addSection(k)} style={{textAlign:'left',border:'1px solid #e7ece8',background:'#fff',borderRadius:8,padding:8,fontSize:10.5,cursor:'pointer'}}>{v.icon} {v.label}</button>)}</div>}</div>
      <div className={`rv-builder-panel ${ongletBuilder==='apercu'?'active':''}`} style={{background:'#e9efea',borderRadius:16,padding:12,minHeight:720,overflow:'auto'}}><div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:10,flexWrap:'wrap'}}>{[['desktop','🖥️ Desktop'],['tablet','▣ Tablette'],['mobile','📱 Mobile']].map(([k,l])=><button key={k} onClick={()=>setDevice(k)} style={{border:0,borderRadius:9,padding:'7px 10px',background:device===k?config.couleur:'#fff',color:device===k?'#fff':'#435047',fontSize:10.5,fontWeight:850,cursor:'pointer'}}>{l}</button>)}</div><div style={{margin:'0 auto',width:device==='mobile'?375:device==='tablet'?680:'100%',maxWidth:'100%',background:'#fff',borderRadius:15,overflow:'hidden',boxShadow:'0 20px 55px rgba(15,37,24,.14)'}}><div style={{height:4,background:config.couleur}}/><div onClick={()=>setSelected('header')} style={{cursor:'pointer',outline:selected==='header'?'2px solid '+config.couleur:'none',outlineOffset:'-2px',background:config.headerBgColor}}><div style={{background:'rgba(0,0,0,.12)',color:config.headerTextColor,padding:'5px 14px',fontSize:9.5,textAlign:'center',opacity:.85}}>{config.headerBarreTop?config.headerBarreTop:'🚚 Livraison rapide  ·  💵 Paiement à la livraison  ·  🛡️ Achat sécurisé'}</div><div style={{background:config.headerBgColor,color:config.headerTextColor,padding:'12px 16px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><div style={{display:'flex',alignItems:'center',gap:8,fontWeight:950}}>{config.logo?<img src={config.logo} alt="" style={{width:30,height:30,objectFit:'contain',borderRadius:8}}/>:null}{config.nom}</div>{config.headerShowSearch&&<div style={{flex:1,minWidth:90,display:'flex',background:'#fff',borderRadius:999,overflow:'hidden'}}><span style={{padding:'8px 0 8px 10px',fontSize:11,color:'#8A9089'}}>🔍</span><input placeholder="Rechercher..." disabled style={{flex:1,border:0,padding:'8px 10px 8px 4px',fontSize:10.5,outline:'none'}}/></div>}{workspace.whatsapp_number&&<span style={{background:'#EAF3DE',color:'#3B6D11',padding:'6px 10px',borderRadius:999,fontSize:9.5,fontWeight:700,whiteSpace:'nowrap'}}>💬 Nous contacter</span>}{config.headerShowPanier&&<span style={{background:'rgba(255,255,255,.2)',borderRadius:8,padding:'7px 9px',fontSize:12}}>🛒</span>}</div><div style={{background:config.headerBgColor,filter:'brightness(0.85)',padding:'8px 16px',display:'flex',gap:14,fontSize:10,color:config.headerTextColor,flexWrap:'wrap'}}>{(config.headerLinks||[]).length===0?<span style={{opacity:.6,fontStyle:'italic'}}>Aucun lien ajouté</span>:(config.headerLinks||[]).map(l=><span key={l.id} style={{opacity:.85}}>{l.label}</span>)}</div></div>{config.sections.map((s,i)=><div key={`${s}-${i}`} onClick={()=>setSelected(s)} style={{outline:selected===s?'2px solid '+config.couleur:'none',outlineOffset:'-2px',cursor:'pointer'}}><PreviewSection type={s}/></div>)}</div></div>
      <div className={`rv-builder-panel ${ongletBuilder==='reglages'?'active':''}`} style={{...cardStyle,padding:14,boxShadow:'none'}}><div style={{fontSize:12.5,fontWeight:950,color:'#17241d',marginBottom:12}}>⚙️ Réglages</div><label style={labelStyle}>Nom de la boutique<input style={fieldStyle} value={config.nom} onChange={e=>update('nom',e.target.value)}/></label><button onClick={async()=>{setRegenLienEnCours(true);const{data:nouveauSlug}=await supabase.rpc('generer_slug_boutique',{p_nom:config.nom,p_workspace_id:workspace.id});if(nouveauSlug){await supabase.from('workspaces').update({slug:nouveauSlug}).eq('id',workspace.id);setRegenLienFait(nouveauSlug);}setRegenLienEnCours(false);}} disabled={regenLienEnCours} style={{width:'100%',border:'1px solid #9fb5a5',background:'#f7faf7',borderRadius:9,padding:'8px 10px',fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer',marginBottom:12}}>{regenLienEnCours?'Régénération...':'🔄 Régénérer le lien de la boutique maintenant'}</button>{regenLienFait&&<div style={{fontSize:10,color:'#1a7a3c',marginTop:-8,marginBottom:12,wordBreak:'break-all'}}>✅ Nouveau lien : ?boutique={regenLienFait}</div>}<label style={labelStyle}>Couleur<div style={{display:'flex',gap:7}}><input type="color" value={config.couleur} onChange={e=>update('couleur',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.couleur} onChange={e=>update('couleur',e.target.value)}/></div></label><label style={labelStyle}>Description<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.description} onChange={e=>update('description',e.target.value)}/></label>{config.logo&&<img src={config.logo} alt="" style={{width:54,height:54,objectFit:'contain',borderRadius:9,border:'1px solid #e2e9e3',marginBottom:8}}/>}<FileButton kind="logo" label="Télécharger / changer le logo"/><div style={{borderTop:'1px solid #edf1ee',margin:'13px 0',paddingTop:13}}><div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:9}}>Section sélectionnée</div><div style={{fontSize:12,fontWeight:900,color:'#16231c'}}>{sectionCatalog[selected]?.icon} {sectionCatalog[selected]?.label||selected}</div><div style={{fontSize:10.5,color:'#7b867f',lineHeight:1.45,margin:'4px 0 11px'}}>{sectionCatalog[selected]?.description}</div><Editor/></div><div style={{borderTop:'1px solid #edf1ee',paddingTop:12,marginTop:12,fontSize:10.5,color:'#748078',lineHeight:1.5}}>💡 Les produits et collections viennent de ton espace RecuVente. L’import CSV Shopify reste disponible dans « Produits ». Les images du Store Builder sont envoyées dans le stockage boutique. Pour le Journal d'audit, le Pixel Facebook, la Marque blanche et les réseaux sociaux, utilise "⚙️ Paramètres avancés" en haut.</div></div>
    </div>
  </div>;
}

function Dashboard3D({ workspace, activityType, caConfirme, commandesCount, beneficeReel, livreursCount, equipeCount, boutiquesCount, aRisqueCount, tauxLivraison, evolutionData = [], commandes = [], children, actionsFinales }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);

  const money = (value) => Number(value || 0).toLocaleString("fr-FR");
  const safeEvolution = evolutionData.length ? evolutionData.slice(-8) : [{ label: "—", commandes: 0 }];
  const maxOrders = Math.max(...safeEvolution.map((d) => Number(d.commandes || 0)), 1);
  const recent = commandes.slice(0, 4);

  const libellesParActivite = {
    cod_ecommerce: { ca: "CA confirmé", commandes: "Commandes", quatrieme: { icon: "🚚", label: "Livreurs actifs", value: money(livreursCount), accent: "#ffb000" } },
    retail: { ca: "CA confirmé", commandes: "Ventes", quatrieme: { icon: "🚚", label: "Livreurs actifs", value: money(livreursCount), accent: "#ffb000" } },
    restaurant: { ca: "CA confirmé", commandes: "Commandes", quatrieme: { icon: "🍽️", label: "Livreurs actifs", value: money(livreursCount), accent: "#ffb000" } },
    location_immobiliere: { ca: "Loyers encaissés", commandes: "Loyers", quatrieme: { icon: "🏠", label: "Livreurs actifs", value: money(livreursCount), accent: "#ffb000" } },
    location_vehicule: { ca: "CA confirmé", commandes: "Réservations", quatrieme: { icon: "🚗", label: "Livreurs actifs", value: money(livreursCount), accent: "#ffb000" } },
  };
  const libelles = libellesParActivite[activityType] || libellesParActivite.cod_ecommerce;

  function handleMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    setPointer({ x, y });
  }

  const stageTransform = hover
    ? `rotateX(${(-pointer.y * 4).toFixed(2)}deg) rotateY(${(pointer.x * 5).toFixed(2)}deg) translateZ(8px)`
    : "rotateX(0deg) rotateY(0deg) translateZ(0)";

  const cardBase = {
    position: "relative",
    borderRadius: 18,
    padding: "15px 16px",
    background: "linear-gradient(145deg, rgba(12,87,57,.96), rgba(3,28,19,.98))",
    border: "1px solid rgba(255,255,255,.16)",
    color: "#fff",
    boxShadow: "0 22px 55px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.16)",
    transformStyle: "preserve-3d",
  };

  const statsRow1 = [
    { icon: "💰", label: libelles.ca, value: `${money(caConfirme)} ${workspace?.currency || "XOF"}`, accent: "#00f5a0" },
    { icon: "📦", label: libelles.commandes, value: money(commandesCount), accent: "#fff" },
    { icon: "📈", label: "Bénéfice réel", value: `${money(beneficeReel)} ${workspace?.currency || "XOF"}`, accent: beneficeReel >= 0 ? "#7dffbd" : "#ff9c9c" },
    libelles.quatrieme,
  ];
  const statsRow2 = [
    { icon: "⚠️", label: "À risque", value: money(aRisqueCount), accent: "#ff9c9c" },
    { icon: "✅", label: "Taux de réussite", value: `${tauxLivraison || 0}%`, accent: "#7dffbd" },
    { icon: "👥", label: "Équipe", value: money(equipeCount), accent: "#fff" },
  ];

  return (
    <section className="rv-dashboard-3d-wrap" style={{ margin: "18px 0 20px", perspective: "1500px" }}>
      <style>{`
        .rv-dashboard-3d-wrap{position:relative;overflow:visible}
        @media(max-width:800px){.rv-dashboard-3d-wrap{overflow-x:clip}}
        .rv-dashboard-3d-scene{position:relative;min-height:420px;border-radius:28px;overflow:hidden;overflow-x:clip;background:radial-gradient(circle at 50% 30%,rgba(0,245,160,.18),transparent 30%),linear-gradient(145deg,#02110b 0%,#063b26 48%,#021a10 100%);border:1px solid rgba(0,245,160,.22);box-shadow:0 35px 90px rgba(0,30,18,.32),inset 0 1px 0 rgba(255,255,255,.12);transform-style:preserve-3d}
        .rv-dashboard-3d-grid{position:absolute;inset:0;opacity:.22;background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:42px 42px;transform:perspective(500px) rotateX(62deg) translateY(150px) scale(1.7);transform-origin:center bottom;pointer-events:none}
        .rv-dashboard-3d-orbit{position:absolute;border:1px solid rgba(0,245,160,.28);border-radius:50%;transform-style:preserve-3d;pointer-events:none}
        .rv-dashboard-3d-orbit.one{width:520px;height:190px;left:50%;top:52%;transform:translate(-50%,-50%) rotateX(68deg) rotateZ(-10deg);animation:rv3DOrbit 16s linear infinite}
        .rv-dashboard-3d-orbit.two{width:390px;height:150px;left:50%;top:52%;transform:translate(-50%,-50%) rotateX(68deg) rotateZ(25deg);animation:rv3DOrbit 11s linear infinite reverse}
        .rv-dashboard-3d-orb{position:absolute;width:9px;height:9px;border-radius:50%;background:#00f5a0;box-shadow:0 0 22px #00f5a0;left:50%;top:50%;transform:translate(-50%,-50%) translateZ(90px);animation:rv3DOrb 5s ease-in-out infinite}
        @keyframes rv3DOrbit{to{rotate:360deg}}
        @keyframes rv3DOrb{0%,100%{translate:0 0;opacity:.65}50%{translate:18px -8px;opacity:1}}
        .rv-dashboard-3d-panel{transition:transform .18s ease-out,box-shadow .3s ease;will-change:transform}
        .rv-dashboard-3d-panel:hover{box-shadow:0 42px 90px rgba(0,0,0,.4),0 0 55px rgba(0,245,160,.12),inset 0 1px 0 rgba(255,255,255,.18)}
        .rv-dashboard-3d-stat{transition:transform .25s ease,box-shadow .25s ease}
        .rv-dashboard-3d-stat:hover{transform:translateY(-8px) translateZ(22px)!important;box-shadow:0 25px 50px rgba(0,0,0,.3)!important}
        .rv-dashboard-3d-bar{transform-origin:bottom;animation:rv3DBarIn .9s cubic-bezier(.2,.8,.2,1) both}
        @keyframes rv3DBarIn{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        .rv-dashboard-3d-pulse{animation:rv3DPulse 2.2s ease-in-out infinite}
        @keyframes rv3DPulse{0%,100%{opacity:.65;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
        .rv-dashboard-3d-statsgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .rv-dashboard-3d-statsgrid2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}
        @media(max-width:800px){.rv-dashboard-3d-scene{min-height:620px;border-radius:20px;perspective:none!important;transform-style:flat!important}.rv-dashboard-3d-wrap{perspective:none!important}.rv-dashboard-3d-panel{margin:80px 14px 40px!important;transform:none!important;transform-style:flat!important}.rv-dashboard-3d-orbit{opacity:.35}.rv-dashboard-3d-stat{padding:12px!important}.rv-dashboard-3d-stat strong{font-size:17px!important}.rv-dashboard-3d-grid{background-size:28px 28px}.rv-dashboard-3d-statsgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.rv-dashboard-3d-statsgrid2{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(prefers-reduced-motion:reduce){.rv-dashboard-3d-orbit,.rv-dashboard-3d-orb,.rv-dashboard-3d-bar,.rv-dashboard-3d-pulse{animation:none!important}.rv-dashboard-3d-panel{transition:none!important}}
      `}</style>

      <div
        className="rv-dashboard-3d-scene"
        onMouseMove={handleMove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPointer({ x: 0, y: 0 }); }}
      >
        <div className="rv-dashboard-3d-grid" />
        <div className="rv-dashboard-3d-orbit one"><div className="rv-dashboard-3d-orb rv-dashboard-3d-pulse" /></div>
        <div className="rv-dashboard-3d-orbit two" />

        <div style={{ position:"absolute", top:18, left:20, zIndex:2, color:"rgba(255,255,255,.76)", fontSize:10.5, fontWeight:800, letterSpacing:".08em", textTransform:"uppercase" }}>
          RecuVente · Command Center 3D
        </div>
        <div style={{ position:"absolute", top:18, right:20, zIndex:2, display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,.78)", fontSize:10.5 }}>
          <span className="rv-dashboard-3d-pulse" style={{ width:7, height:7, borderRadius:"50%", background:"#00f5a0", display:"inline-block" }} />
          Données en direct
        </div>

        <div
          className="rv-dashboard-3d-panel"
          style={{
            position:"relative", zIndex:3, width:"min(1040px, calc(100% - 34px))", margin:"72px auto 44px",
            transform:`${stageTransform} translateZ(55px)`, transformStyle:"preserve-3d",
            background:"linear-gradient(145deg,rgba(9,55,37,.94),rgba(2,19,13,.97))",
            border:"1px solid rgba(255,255,255,.18)", borderRadius:24, padding:18,
            boxShadow:"0 35px 80px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.15)", backdropFilter:"blur(18px)"
          }}
        >
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:14, transform:"translateZ(28px)" }}>
            <div>
              <div style={{ color:"#fff", fontSize:18, fontWeight:900 }}>{workspace?.name || "Mon entreprise"}</div>
              <div style={{ color:"rgba(255,255,255,.58)", fontSize:10.5, marginTop:3 }}>Vue stratégique · activité actuelle</div>
            </div>
            <div style={{ background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.14)", color:"#fff", borderRadius:999, padding:"7px 10px", fontSize:10.5, fontWeight:800 }}>
              ⚡ LIVE
            </div>
          </div>

          {children && <div style={{ transform:"translateZ(26px)", marginBottom:14 }}>{children}</div>}

          <div className="rv-dashboard-3d-statsgrid" style={{ transform:"translateZ(42px)" }}>
            {statsRow1.map((s,i)=>(
              <div key={i} className="rv-dashboard-3d-stat" style={{ ...cardBase, transform:`translateZ(${20+i*5}px)` }}>
                <div style={{ fontSize:16 }}>{s.icon}</div>
                <div style={{ color:"rgba(255,255,255,.6)", fontSize:9.5, marginTop:7, textTransform:"uppercase", letterSpacing:".04em" }}>{s.label}</div>
                <strong style={{ display:"block", color:s.accent, fontFamily:"'IBM Plex Mono',monospace", fontSize:18, marginTop:4, lineHeight:1.2 }}>{s.value}</strong>
              </div>
            ))}
          </div>

          <div className="rv-dashboard-3d-statsgrid2" style={{ transform:"translateZ(34px)" }}>
            {statsRow2.map((s,i)=>(
              <div key={i} className="rv-dashboard-3d-stat" style={{ ...cardBase, padding:"11px 13px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:13 }}>{s.icon}</span>
                  <span style={{ color:"rgba(255,255,255,.6)", fontSize:9, textTransform:"uppercase", letterSpacing:".03em" }}>{s.label}</span>
                </div>
                <strong style={{ display:"block", color:s.accent, fontFamily:"'IBM Plex Mono',monospace", fontSize:15, marginTop:5 }}>{s.value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1.4fr .8fr", gap:10, marginTop:10, transform:"translateZ(30px)" }}>
            <div style={{ ...cardBase, minHeight:150 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div><div style={{ fontSize:11, fontWeight:800 }}>📊 Activité commerciale</div><div style={{ color:"rgba(255,255,255,.5)", fontSize:9.5, marginTop:3 }}>Commandes par jour</div></div>
                <div style={{ color:"#00f5a0", fontSize:10, fontWeight:900 }}>LIVE</div>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", gap:7, height:92 }}>
                {safeEvolution.map((d,i)=>{
                  const h=Math.max(8,(Number(d.commandes||0)/maxOrders)*76);
                  return <div key={`${d.label}-${i}`} style={{ flex:1, height:"100%", display:"flex", flexDirection:"column", justifyContent:"flex-end", alignItems:"center", gap:4 }}>
                    <div className="rv-dashboard-3d-bar" style={{ width:"100%", maxWidth:38, height:h, borderRadius:"7px 7px 3px 3px", background:"linear-gradient(180deg,#00f5a0,#087a4d)", boxShadow:"0 0 18px rgba(0,245,160,.18)", animationDelay:`${i*70}ms` }} />
                    <span style={{ color:"rgba(255,255,255,.42)", fontSize:8, whiteSpace:"nowrap", overflow:"hidden", maxWidth:42 }}>{d.label}</span>
                  </div>;
                })}
              </div>
            </div>

            <div style={{ ...cardBase, minHeight:150 }}>
              <div style={{ fontSize:11, fontWeight:800 }}>🏢 Infrastructure</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:12 }}>
                <div style={{ background:"rgba(255,255,255,.07)", borderRadius:11, padding:10 }}><div style={{fontSize:9,color:"rgba(255,255,255,.52)"}}>Espaces</div><strong style={{fontSize:20}}>{money(boutiquesCount)}</strong></div>
                <div style={{ background:"rgba(255,255,255,.07)", borderRadius:11, padding:10 }}><div style={{fontSize:9,color:"rgba(255,255,255,.52)"}}>Équipe</div><strong style={{fontSize:20}}>{money(equipeCount)}</strong></div>
              </div>
              <div style={{ marginTop:11, padding:"8px 10px", borderRadius:10, background:"rgba(0,245,160,.08)", border:"1px solid rgba(0,245,160,.14)", color:"rgba(255,255,255,.76)", fontSize:9.5 }}>
                🛡️ Données synchronisées avec ton espace RecuVente
              </div>
            </div>
          </div>

          <div style={{ ...cardBase, marginTop:10, transform:"translateZ(24px)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:800 }}>⚡ Activité récente</div>
              <div style={{ color:"rgba(255,255,255,.45)", fontSize:9 }}>Dernières commandes</div>
            </div>
            {recent.length ? recent.map((c,i)=>(
              <div key={c.id || i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:i?"1px solid rgba(255,255,255,.07)":"none" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:c.statut === "confirmee" ? "#00f5a0" : c.statut === "echouee" ? "#ff7070" : "#ffb000", flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0, color:"rgba(255,255,255,.76)", fontSize:9.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.client || "Client"} · {c.produit || "Commande"}</div>
                <strong style={{ color:"#fff", fontFamily:"'IBM Plex Mono',monospace", fontSize:9.5, whiteSpace:"nowrap" }}>{money(c.montant)} {workspace?.currency || "XOF"}</strong>
              </div>
            )) : <div style={{ color:"rgba(255,255,255,.48)", fontSize:10, padding:"8px 0" }}>Aucune activité récente.</div>}
          </div>

          {actionsFinales && <div style={{ marginTop:10, transform:"translateZ(20px)" }}>{actionsFinales}</div>}
        </div>
      </div>
    </section>
  );
}

function WorkspaceDashboard({ workspace, session, subscription, workspacesDisponibles = [], onChangerEspace, onDemanderAjoutEspace }) {
  const estEcommerce = workspace.activity_type === "cod_ecommerce" || workspace.activity_type === "retail" || workspace.activity_type === "personnalise" || (workspace.activity_type === "location_vehicule" && workspace.slug === "luxury-car");
  const [commandes, setCommandes] = useState([]);
  const [commandeItems, setCommandeItems] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [closers, setClosers] = useState([]);
  const [produits, setProduits] = useState([]);
  const [plats, setPlats] = useState([]);
  const [tablesRestaurant, setTablesRestaurant] = useState([]);
  const [biensLocation, setBiensLocation] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [retourPaiement, setRetourPaiement] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paiement") === "succes"
  );

  useEffect(() => {
    if (retourPaiement && typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [retourPaiement]);

  function playCelebrationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.value = freq;
        const start = ctx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.16, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        o.start(start);
        o.stop(start + 0.5);
      });
    } catch (e) {}
  }
  const [showTeam, setShowTeam] = useState(false);
  const [showAbonnement, setShowAbonnement] = useState(false);
  const [showRapportHebdo, setShowRapportHebdo] = useState(false);
  const [showLivreurs, setShowLivreurs] = useState(false);
  const [showClosers, setShowClosers] = useState(false);
  const [showCampagne, setShowCampagne] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showStoreBuilder, setShowStoreBuilder] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [commandeAConfirmerRapide, setCommandeAConfirmerRapide] = useState(null);

  async function reprogrammerCommande(commandeId, date) {
    await supabase.from("commandes").update({ date_relivraison: date || null }).eq("id", commandeId);
    await loadCommandes();
  }

  async function changerStatutRapide(commandeId, nouveauStatut, modePaiement) {
    const infosValidation = nouveauStatut === "confirmee" ? { confirmed_at: new Date().toISOString(), confirmed_by: session?.user?.email || "Admin", mode_paiement: modePaiement || null } : {};
    await supabase.from("commandes").update({ statut: nouveauStatut, ...infosValidation }).eq("id", commandeId);
    const commandeConcernee = commandes.find((c) => c.id === commandeId);
    enregistrerAudit(`Commande → ${nouveauStatut}`, commandeConcernee ? `${commandeConcernee.client} — ${commandeConcernee.montant} ${workspace.currency}` : commandeId);
    if (nouveauStatut === "confirmee") {
      supabase.auth.getSession().then(({ data: sessionData }) => {
        fetch("/api/facebook-capi", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
          body: JSON.stringify({ commandeId }),
        }).catch(() => {});
      });
    }
    await loadCommandes();
  }
  const [showProduits, setShowProduits] = useState(false);
  const [showAvis, setShowAvis] = useState(false);
  const [showProspectsIA, setShowProspectsIA] = useState(false);
  const [showTemoignages, setShowTemoignages] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [showCodesPromo, setShowCodesPromo] = useState(false);
  const [showPaniersAbandonnes, setShowPaniersAbandonnes] = useState(false);
  const [showAzaliDesign, setShowAzaliDesign] = useState(false);
  const [showTraficBoutique, setShowTraficBoutique] = useState(false);
  const [showAide, setShowAide] = useState(false);
  const [showBienvenue, setShowBienvenue] = useState(false);
  useEffect(() => {
    try {
      setShowBienvenue(!localStorage.getItem(`rv_intro_vue_${workspace.id}`));
    } catch {
      setShowBienvenue(false);
    }
  }, [workspace.id]);
  function fermerBienvenue() {
    try { localStorage.setItem(`rv_intro_vue_${workspace.id}`, "1"); } catch {}
    setShowBienvenue(false);
  }

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

  async function loadPlats() {
    const { data } = await supabase.from("plats").select("*").eq("workspace_id", workspace.id).order("categorie").order("nom");
    setPlats(data || []);
  }

  async function loadTablesRestaurant() {
    const { data } = await supabase.from("tables_restaurant").select("*").eq("workspace_id", workspace.id).order("numero");
    setTablesRestaurant(data || []);
  }

  async function loadBiensLocation() {
    const { data } = await supabase.from("biens_location").select("*").eq("workspace_id", workspace.id).order("nom");
    setBiensLocation(data || []);
  }

  async function addBienLocation(form) {
    const { couleurs_texte, ...formSansCouleurs } = form;
    const couleurs_disponibles = couleurs_texte ? couleurs_texte.split(",").map((c) => c.trim()).filter(Boolean) : null;
    await supabase.from("biens_location").insert([{ ...formSansCouleurs, workspace_id: workspace.id, prix_jour: Number(form.prix_jour) || 0, caution_suggeree: Number(form.caution_suggeree) || 0, prix_vente_direct: form.prix_vente_direct ? Number(form.prix_vente_direct) : null, couleurs_disponibles }]);
    await loadBiensLocation();
  }

  async function toggleDisponibiliteBien(id, valeurActuelle) {
    await supabase.from("biens_location").update({ disponible: !valeurActuelle }).eq("id", id);
    await loadBiensLocation();
  }

  async function deleteBienLocation(id) {
    await supabase.from("biens_location").delete().eq("id", id);
    await loadBiensLocation();
  }

  const [logements, setLogements] = useState([]);

  async function loadLogements() {
    const { data } = await supabase.from("logements").select("*").eq("workspace_id", workspace.id).order("nom");
    setLogements(data || []);
  }

  async function addLogement(form) {
    await supabase.from("logements").insert([{ ...form, workspace_id: workspace.id, loyer_mensuel: Number(form.loyer_mensuel) || 0, caution_suggeree: Number(form.caution_suggeree) || 0 }]);
    await loadLogements();
  }

  async function toggleDisponibiliteLogement(id, valeurActuelle) {
    await supabase.from("logements").update({ disponible: !valeurActuelle }).eq("id", id);
    await loadLogements();
  }

  async function deleteLogement(id) {
    await supabase.from("logements").delete().eq("id", id);
    await loadLogements();
  }

  async function rendreCaution(commandeId) {
    await supabase.from("commandes").update({ caution_rendue: true }).eq("id", commandeId);
    await loadCommandes();
  }

  async function addPlat(form) {
    await supabase.from("plats").insert([{ ...form, workspace_id: workspace.id, prix: Number(form.prix) || 0 }]);
    await loadPlats();
  }

  async function toggleDisponibilitePlat(id, valeurActuelle) {
    await supabase.from("plats").update({ disponible: !valeurActuelle }).eq("id", id);
    await loadPlats();
  }

  async function deletePlat(id) {
    await supabase.from("plats").delete().eq("id", id);
    await loadPlats();
  }

  async function addTableRestaurant(numero) {
    await supabase.from("tables_restaurant").insert([{ workspace_id: workspace.id, numero }]);
    await loadTablesRestaurant();
  }

  async function toggleStatutTable(tableId, statutActuel) {
    await supabase.from("tables_restaurant").update({ statut: statutActuel === "occupee" ? "libre" : "occupee" }).eq("id", tableId);
    await loadTablesRestaurant();
  }

  async function changerStatutCuisine(commandeId, nouveauStatutCuisine) {
    await supabase.from("commandes").update({ statut_cuisine: nouveauStatutCuisine }).eq("id", commandeId);
    if (nouveauStatutCuisine === "servie") {
      const commandeConcernee = commandes.find((c) => c.id === commandeId);
      if (commandeConcernee?.table_id) {
        await supabase.from("tables_restaurant").update({ statut: "libre" }).eq("id", commandeConcernee.table_id);
        await loadTablesRestaurant();
      }
    }
    await loadCommandes();
  }

  function parseProduitTexte(texte) {
    if (!texte) return { nom: "", quantite: 1 };
    const match = texte.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
    if (match) return { nom: match[1].trim(), quantite: Number(match[2]) || 1 };
    return { nom: texte.trim(), quantite: 1 };
  }

  async function addProduit(form) {
    const { data, error } = await supabase
      .from("produits")
      .insert([{ nom: form.nom, cout_achat: Number(form.cout_achat) || 0, workspace_id: workspace.id }])
      .select()
      .single();
    if (error) {
      alert("Erreur: " + error.message);
      return null;
    }
    enregistrerAudit("Produit créé", form.nom);
    await loadProduits();
    return data;
  }

  async function importerProduitsCSV(lignes) {
    const nomsExistants = new Set(produits.map((p) => p.nom.toLowerCase().trim()));
    const nomsDejaVusDansCeCSV = new Set();
    const produitsAImporter = [];
    let ignores = 0;

    for (const l of lignes) {
      const nomNormalise = (l.nom || "").toLowerCase().trim();
      if (!nomNormalise || nomsExistants.has(nomNormalise) || nomsDejaVusDansCeCSV.has(nomNormalise)) {
        ignores += 1;
        continue;
      }
      nomsDejaVusDansCeCSV.add(nomNormalise);
      produitsAImporter.push({
        workspace_id: workspace.id,
        nom: l.nom,
        description: l.description || null,
        prix_vente: l.prix_vente ? Number(l.prix_vente) : null,
        photo_url: l.photo_url || null,
        cout_achat: 0,
        _type: (l.type || "").trim() || null, // gardé temporairement pour recréer les collections, retiré avant l'insertion
      });
    }

    if (produitsAImporter.length === 0) {
      return { succes: false, importes: 0, ignores, message: "Aucun nouveau produit à importer — tous existent déjà dans ton catalogue." };
    }

    const aInserer = produitsAImporter.map(({ _type, ...p }) => p);
    const { data: inseres, error } = await supabase
      .from("produits")
      .upsert(aInserer, { onConflict: "workspace_id,nom", ignoreDuplicates: true })
      .select("id, nom");
    if (error) {
      return { succes: false, importes: 0, ignores: 0, message: "Erreur : " + error.message };
    }

    // Recrée automatiquement les collections à partir de la colonne "Type" de Shopify,
    // et y range chaque produit importé — pour retrouver la même disposition par catégorie.
    let collectionsCreees = 0;
    const typesPresents = [...new Set(produitsAImporter.map((p) => p._type).filter(Boolean))];
    if (typesPresents.length > 0 && inseres && inseres.length > 0) {
      const { data: collectionsExistantes } = await supabase.from("collections").select("id, nom").eq("workspace_id", workspace.id);
      const collectionParNom = {};
      (collectionsExistantes || []).forEach((c) => { collectionParNom[c.nom.toLowerCase().trim()] = c.id; });

      let ordreSuivant = (collectionsExistantes || []).length;
      for (const type of typesPresents) {
        const cle = type.toLowerCase().trim();
        if (!collectionParNom[cle]) {
          const { data: nouvelle } = await supabase.from("collections").insert([{ workspace_id: workspace.id, nom: type, ordre: ordreSuivant }]).select("id").single();
          if (nouvelle) {
            collectionParNom[cle] = nouvelle.id;
            ordreSuivant += 1;
            collectionsCreees += 1;
          }
        }
      }

      const nomVersId = {};
      inseres.forEach((p) => { nomVersId[p.nom.toLowerCase().trim()] = p.id; });

      const liaisons = [];
      produitsAImporter.forEach((p) => {
        if (!p._type) return;
        const produitId = nomVersId[p.nom.toLowerCase().trim()];
        const collectionId = collectionParNom[p._type.toLowerCase().trim()];
        if (produitId && collectionId) liaisons.push({ collection_id: collectionId, produit_id: produitId });
      });
      if (liaisons.length > 0) {
        await supabase.from("collection_produits").upsert(liaisons, { onConflict: "collection_id,produit_id", ignoreDuplicates: true });
      }
    }

    await loadProduits();
    return { succes: true, importes: produitsAImporter.length, ignores, collectionsCreees };
  }

  async function updateProduitCout(id, cout) {
    await supabase.from("produits").update({ cout_achat: Number(cout) || 0 }).eq("id", id);
    await loadProduits();
  }

  async function updateProduitFraisImport(id, frais) {
    await supabase.from("produits").update({ frais_import_unitaire: Number(frais) || 0 }).eq("id", id);
    await loadProduits();
  }

  async function updateProduitPrixVente(id, prix) {
    const produitConcerne = produits.find((p) => p.id === id);
    const ancienPrix = produitConcerne?.prix_vente;
    await supabase.from("produits").update({ prix_vente: Number(prix) || 0 }).eq("id", id);
    if (produitConcerne && Number(ancienPrix) !== Number(prix)) {
      enregistrerAudit("Prix modifié", `${produitConcerne.nom} : ${ancienPrix ?? "—"} → ${prix} ${workspace.currency}`);
    }
    await loadProduits();
  }

  async function updateProduitPhoto(id, url) {
    await supabase.from("produits").update({ photo_url: url || null }).eq("id", id);
    await loadProduits();
  }

  async function updateProduitGalerie(id, photosGalerie) {
    await supabase.from("produits").update({ photos_galerie: photosGalerie }).eq("id", id);
    await loadProduits();
  }

  async function updateProduitLivraisonBundles(id, patch) {
    await supabase.from("produits").update(patch).eq("id", id);
    await loadProduits();
  }

  async function updateProduitDescription(id, description) {
    await supabase.from("produits").update({ description: description || null }).eq("id", id);
    await loadProduits();
  }

  async function updateProduitStock(id, stock) {
    await supabase.from("produits").update({ stock_initial: Number(stock) || 0 }).eq("id", id);
    await loadProduits();
  }

  async function enregistrerAudit(action, details) {
    const { error } = await supabase.from("journal_audit").insert([{
      workspace_id: workspace.id,
      action,
      details,
      effectue_par: session?.user?.email || "Inconnu",
    }]);
    if (error) {
      console.error("Erreur journal d'audit:", error.message);
      alert("⚠️ Le journal d'audit n'a pas pu enregistrer cette action : " + error.message);
    }
  }

  async function deleteProduit(id) {
    const produitConcerne = produits.find((p) => p.id === id);
    await supabase.from("produits").delete().eq("id", id);
    await enregistrerAudit("Suppression produit", produitConcerne ? produitConcerne.nom : id);
    await loadProduits();
  }

  async function addLivreur(form) {
    const { error } = await supabase.from("livreurs").insert([{ ...form, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadLivreurs();
  }

  async function deleteLivreur(id, nom) {
    const commandesLiees = commandes.filter((c) => c.livreur === nom && (c.statut === "en_cours" || c.statut === "echouee")).length;
    if (commandesLiees > 0) {
      const confirmer = window.confirm(`${nom} a encore ${commandesLiees} commande${commandesLiees > 1 ? "s" : ""} active${commandesLiees > 1 ? "s" : ""} assignée${commandesLiees > 1 ? "s" : ""}. Si tu le retires, tu ne pourras plus les réassigner facilement. Continuer quand même ?`);
      if (!confirmer) return;
    }
    await supabase.from("livreurs").delete().eq("id", id);
    await loadLivreurs();
  }

  async function addCloser(form) {
    const { error } = await supabase.from("closers").insert([{ ...form, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadClosers();
  }

  async function deleteCloser(id, nom) {
    const commandesLiees = commandes.filter((c) => c.closer === nom && (c.statut === "en_cours" || c.statut === "echouee")).length;
    if (commandesLiees > 0) {
      const confirmer = window.confirm(`${nom} a encore ${commandesLiees} commande${commandesLiees > 1 ? "s" : ""} active${commandesLiees > 1 ? "s" : ""} assignée${commandesLiees > 1 ? "s" : ""}. Si tu le retires, tu ne pourras plus les réassigner facilement. Continuer quand même ?`);
      if (!confirmer) return;
    }
    await supabase.from("closers").delete().eq("id", id);
    await loadClosers();
  }

  async function assignLivreur(commandeId, nom, parQui) {
    await supabase.from("commandes").update({ livreur: nom || null, livreur_assigne_par: nom ? (parQui || null) : null }).eq("id", commandeId);
    await supabase.from("relances").insert([
      { commande_id: commandeId, note: nom ? `🚚 Livreur assigné : ${nom}${parQui ? ` (par ${parQui})` : ""}` : "🚚 Livreur retiré" },
    ]);
    await loadCommandes();
  }

  const produitsRecusParLivreur = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.livreur || c.statut === "echouee") return;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      map[c.livreur] = (map[c.livreur] || 0) + quantite;
    });
    return map;
  }, [commandes]);

  const detailParLivreurEtProduit = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.livreur) return;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      if (!map[c.livreur]) map[c.livreur] = {};
      if (!map[c.livreur][nom]) map[c.livreur][nom] = { livre: 0, nonLivre: 0, restant: 0 };
      if (c.statut === "confirmee") map[c.livreur][nom].livre += quantite;
      else if (c.statut === "echouee") map[c.livreur][nom].nonLivre += quantite;
      else map[c.livreur][nom].restant += quantite;
    });
    return map;
  }, [commandes]);

  const produitsGeresParCloser = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.closer || c.statut === "echouee") return;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      map[c.closer] = (map[c.closer] || 0) + quantite;
    });
    return map;
  }, [commandes]);

  const detailParCloserEtProduit = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.closer) return;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      if (!map[c.closer]) map[c.closer] = {};
      if (!map[c.closer][nom]) map[c.closer][nom] = { livre: 0, nonLivre: 0, restant: 0 };
      if (c.statut === "confirmee") map[c.closer][nom].livre += quantite;
      else if (c.statut === "echouee") map[c.closer][nom].nonLivre += quantite;
      else map[c.closer][nom].restant += quantite;
    });
    return map;
  }, [commandes]);

  const commandesParCloser = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.closer) return;
      if (!map[c.closer]) map[c.closer] = [];
      map[c.closer].push(c);
    });
    Object.values(map).forEach((liste) => liste.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return map;
  }, [commandes]);

  const commandesParLivreur = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      if (!c.livreur) return;
      if (!map[c.livreur]) map[c.livreur] = [];
      map[c.livreur].push(c);
    });
    Object.values(map).forEach((liste) => liste.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return map;
  }, [commandes]);

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
    if (workspace.activity_type === "restaurant") {
      loadPlats();
      loadTablesRestaurant();
    }
    if (workspace.activity_type === "location_vehicule") {
      loadBiensLocation();
    }
    if (workspace.activity_type === "location_immobiliere") {
      loadLogements();
    }
  }, []);

  const accesBloque = (() => {
    if (subscription === undefined) return false; // encore en cours de chargement, ne pas bloquer par erreur
    if (subscription === null) return true; // aucun abonnement enregistré du tout = accès bloqué (sécurité)
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

  const knownOrderIds = React.useRef(null);
  const debounceNouvellesCommandes = React.useRef(null);
  const [toastNouvellesCommandes, setToastNouvellesCommandes] = useState(null);

  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const VAPID_PUBLIC_KEY = "BNEWuL6J-c31X4sab428A92UjDE2GOirvhes0XlQz-bnNngVucHV22AdQzLq_FleLTsCNoFaxYkL_xDqR6WgHFs";

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  const [statutNotifDebug, setStatutNotifDebug] = useState("");

  async function activerNotificationsPush() {
    setStatutNotifDebug("⏳ Démarrage...");
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      setStatutNotifDebug(`Permission : ${permission}`);
      if (permission !== "granted") {
        setStatutNotifDebug(`❌ Permission refusée par le téléphone (${permission}). Va dans les réglages de notification du navigateur pour ce site et autorise manuellement.`);
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatutNotifDebug("❌ Ce navigateur ne supporte pas les notifications Push.");
        return;
      }

      setStatutNotifDebug("⏳ Vérification du service worker...");
      const registration = await navigator.serviceWorker.ready;

      // On force toujours un abonnement FRAIS (on désabonne l'ancien s'il existe), pour
      // ne jamais rester bloqué sur une ancienne clé VAPID périmée.
      let sub = await registration.pushManager.getSubscription();
      if (sub) {
        setStatutNotifDebug("⏳ Ancien abonnement détecté, remplacement...");
        await sub.unsubscribe();
      }
      setStatutNotifDebug("⏳ Création du nouvel abonnement...");
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setStatutNotifDebug("⏳ Enregistrement dans la base de données...");
      const raw = sub.toJSON();
      const { error: erreurUpsert } = await supabase.from("push_subscriptions").upsert(
        [{ workspace_id: workspace.id, user_email: session.user.email, endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth }],
        { onConflict: "endpoint" }
      );
      if (erreurUpsert) {
        setStatutNotifDebug("❌ Erreur base de données : " + erreurUpsert.message);
        return;
      }
      setStatutNotifDebug("✅ Notifications activées avec succès, même app fermée !");
    } catch (e) {
      setStatutNotifDebug("❌ Erreur : " + e.message);
    }
  }

  function playNotifSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      function jouerChaChing(decalage) {
        const notes = [
          { freq: 987.77, start: decalage, dur: 0.16, vol: 0.55 },
          { freq: 1318.51, start: decalage + 0.1, dur: 0.32, vol: 0.6 },
          { freq: 1975.53, start: decalage + 0.1, dur: 0.32, vol: 0.25 },
        ];
        notes.forEach((n) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = "sine";
          o.frequency.value = n.freq;
          const start = ctx.currentTime + n.start;
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(n.vol, start + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
          o.start(start);
          o.stop(start + n.dur);
        });
      }
      jouerChaChing(0);
      jouerChaChing(0.55);
    } catch (e) {}
  }

  async function loadCommandes() {
    const { data, error } = await supabase
      .from("commandes")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(5000); // Plafond de sécurité — au-delà, une vraie pagination sera nécessaire (chantier à part).
    if (!error) {
      const list = data || [];
      if (knownOrderIds.current !== null) {
        const nouvelles = list.filter((c) => !knownOrderIds.current.has(c.id));
        if (nouvelles.length > 0) {
          playNotifSound();
          setToastNouvellesCommandes(
            nouvelles.length === 1
              ? `🔔 Nouvelle commande — ${nouvelles[0].client}`
              : `🔔 ${nouvelles.length} nouvelles commandes sont arrivées`
          );
          setTimeout(() => setToastNouvellesCommandes(null), 4000);
        }
      }
      knownOrderIds.current = new Set(list.map((c) => c.id));
      setCommandes(list);
    }
    const { data: items } = await supabase.from("commande_items").select("*").eq("workspace_id", workspace.id);
    setCommandeItems(items || []);
    setLoaded(true);
    loadAllRelances();
  }

  const [allRelances, setAllRelances] = useState([]);

  async function loadAllRelances() {
    const { data: cmds } = await supabase.from("commandes").select("id").eq("workspace_id", workspace.id);
    const ids = (cmds || []).map((c) => c.id);
    if (ids.length === 0) {
      setAllRelances([]);
      return;
    }
    const { data } = await supabase.from("relances").select("commande_id, created_at").in("commande_id", ids).order("created_at", { ascending: false });
    setAllRelances(data || []);
  }

  const [allAppels, setAllAppels] = useState([]);
  async function loadAllAppels() {
    const { data: cmds } = await supabase.from("commandes").select("id").eq("workspace_id", workspace.id);
    const ids = (cmds || []).map((c) => c.id);
    if (ids.length === 0) {
      setAllAppels([]);
      return;
    }
    const { data } = await supabase.from("appels_commande").select("commande_id").in("commande_id", ids);
    setAllAppels(data || []);
  }

  const [toastsAutomatisation, setToastsAutomatisation] = useState([]);
  useEffect(() => {
    async function verifierAutomatisations() {
      let { data: regles } = await supabase.from("regles_automatisation").select("*").eq("workspace_id", workspace.id).eq("actif", true);

      // Crée la règle par défaut une seule fois, si aucune n'existe encore pour cet espace
      if (!regles || regles.length === 0) {
        const { data: nouvelleRegle } = await supabase
          .from("regles_automatisation")
          .insert([{ workspace_id: workspace.id, declencheur: "sans_appel", delai_heures: 24, action: "notification" }])
          .select()
          .single();
        regles = nouvelleRegle ? [nouvelleRegle] : [];
      }

      const regleSansAppel = (regles || []).find((r) => r.declencheur === "sans_appel");
      if (!regleSansAppel) return;

      const idsAvecAppel = new Set(allAppels.map((a) => a.commande_id));
      const seuilMs = regleSansAppel.delai_heures * 3600000;

      const candidates = commandes.filter((c) =>
        c.statut === "en_cours" &&
        !idsAvecAppel.has(c.id) &&
        (Date.now() - new Date(c.created_at).getTime()) > seuilMs
      );
      if (candidates.length === 0) return;

      const { data: dejaDeclenches } = await supabase
        .from("declenchements_automatisation")
        .select("commande_id")
        .eq("regle_id", regleSansAppel.id)
        .in("commande_id", candidates.map((c) => c.id));
      const idsDejaDeclenches = new Set((dejaDeclenches || []).map((d) => d.commande_id));

      const nouvelles = candidates.filter((c) => !idsDejaDeclenches.has(c.id));
      if (nouvelles.length === 0) return;

      for (const c of nouvelles) {
        await supabase.from("declenchements_automatisation").insert([{ regle_id: regleSansAppel.id, commande_id: c.id }]).then(() => {});
      }

      setToastsAutomatisation((prev) => [
        ...prev,
        ...nouvelles.map((c) => ({ id: c.id, texte: `⏰ ${c.client} — aucun appel depuis ${regleSansAppel.delai_heures}h (${Number(c.montant).toLocaleString("fr-FR")} ${workspace.currency})` })),
      ]);
    }
    if (commandes.length > 0) verifierAutomatisations();
  }, [commandes, allAppels, workspace.id]);

  useEffect(() => {
    loadCommandes();
    loadAllRelances();
    loadAllAppels();

    const channel = supabase
      .channel(`commandes-${workspace.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "commandes", filter: `workspace_id=eq.${workspace.id}` },
        () => {
          // Regroupe les commandes arrivant en rafale (ex: après une pub qui performe bien)
          // au lieu de recharger et notifier une fois par commande individuelle
          clearTimeout(debounceNouvellesCommandes.current);
          debounceNouvellesCommandes.current = setTimeout(() => loadCommandes(), 2000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const relanceCountByOrder = useMemo(() => {
    const map = {};
    const lastByOrder = {};
    allRelances.forEach((r) => {
      map[r.commande_id] = (map[r.commande_id] || 0) + 1;
      if (!lastByOrder[r.commande_id] || new Date(r.created_at) > new Date(lastByOrder[r.commande_id])) {
        lastByOrder[r.commande_id] = r.created_at;
      }
    });
    return { count: map, last: lastByOrder };
  }, [allRelances]);

  const todoAujourdhui = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const now24hAgo = new Date(today.getTime() - 24 * 3600 * 1000);
    const byMontant = (a, b) => Number(b.montant) - Number(a.montant);

    const actives = commandes.filter((c) => c.statut === "en_cours" || c.statut === "echouee");

    const aRelivrer = actives.filter((c) => c.date_relivraison === todayStr).sort(byMontant);

    const jamaisContactees = actives
      .filter((c) => !relanceCountByOrder.count[c.id] && aRelivrer.every((a) => a.id !== c.id))
      .sort(byMontant);

    const sansNouvelles = actives
      .filter((c) => {
        if (aRelivrer.some((a) => a.id === c.id)) return false;
        if (jamaisContactees.some((j) => j.id === c.id)) return false;
        const last = relanceCountByOrder.last[c.id];
        if (!last) return false;
        return new Date(last) < now24hAgo;
      })
      .sort(byMontant);

    const total = aRelivrer.length + jamaisContactees.length + sansNouvelles.length;
    const echouees = commandes.filter((c) => c.statut === "echouee");
    const enCoursOuEchouee = commandes.filter((c) => c.statut === "en_cours" || c.statut === "echouee");
    const argentARisque = enCoursOuEchouee.reduce((s, c) => s + Number(c.montant), 0);
    const argentRecuperable = echouees.reduce((s, c) => s + Number(c.montant), 0);

    return { aRelivrer, jamaisContactees, sansNouvelles, total, argentARisque, argentRecuperable };
  }, [commandes, relanceCountByOrder]);

  const produitsEnProgression = useMemo(() => {
    const maintenant = Date.now();
    const il7j = maintenant - 7 * 86400000;
    const il14j = maintenant - 14 * 86400000;
    const recentes = {};
    const precedentes = {};
    commandes.filter((c) => c.statut === "confirmee").forEach((c) => {
      const t = new Date(c.created_at).getTime();
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (t >= il7j) {
        recentes[nom] = (recentes[nom] || 0) + quantite;
      } else if (t >= il14j && t < il7j) {
        precedentes[nom] = (precedentes[nom] || 0) + quantite;
      }
    });
    return Object.keys(recentes)
      .map((nom) => {
        const avant = precedentes[nom] || 0;
        const apres = recentes[nom];
        const croissance = avant > 0 ? Math.round(((apres - avant) / avant) * 100) : (apres >= 3 ? 100 : 0);
        return { nom, avant, apres, croissance };
      })
      .filter((p) => p.apres >= 3 && p.croissance >= 30)
      .sort((a, b) => b.croissance - a.croissance)
      .slice(0, 3);
  }, [commandes]);

  const [vue, setVue] = useState("commandes");
  const [datePreset, setDatePreset] = useState("aujourdhui");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showRapportSemaine, setShowRapportSemaine] = useState(false);
  const [showReunion, setShowReunion] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start, end;
    if (datePreset === "aujourdhui") {
      start = startOfToday;
      end = new Date(startOfToday.getTime() + 86400000);
    } else if (datePreset === "hier") {
      start = new Date(startOfToday.getTime() - 86400000);
      end = startOfToday;
    } else if (datePreset === "semaine") {
      const day = startOfToday.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(startOfToday.getTime() - diff * 86400000);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "mois") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "personnalise" && customStart && customEnd) {
      start = new Date(customStart + "T00:00:00");
      end = new Date(customEnd + "T23:59:59");
    } else {
      start = new Date(0);
      end = new Date(now.getTime() + 60000);
    }
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  const [recherche, setRecherche] = useState("");
  const [statsOuvertes, setStatsOuvertes] = useState(false);

  const commandesInRange = useMemo(() => {
    return commandes.filter((c) => {
      const d = new Date(c.created_at);
      return d >= dateRange.start && d < dateRange.end;
    });
  }, [commandes, dateRange]);

  const [filterStatut, setFilterStatut] = useState("toutes");

  const commandesAffichees = useMemo(() => {
    let r = commandesInRange;
    if (filterStatut !== "toutes") r = r.filter((c) => c.statut === filterStatut);
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      r = r.filter((c) => (c.client || "").toLowerCase().includes(q) || (c.tel || "").includes(q));
    }
    return r;
  }, [commandesInRange, recherche, filterStatut]);

  const groupedByDay = useMemo(() => {
    const groups = {};
    commandesAffichees.forEach((c) => {
      const d = new Date(c.created_at);
      const dayKey = d.toISOString().slice(0, 10);
      if (!groups[dayKey]) {
        groups[dayKey] = { label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), orders: [] };
      }
      groups[dayKey].orders.push(c);
    });
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, val]) => val);
  }, [commandesAffichees]);

  function exportCSV() {
    const estRetail = workspace.activity_type === "retail";
    const headers = estRetail
      ? ["Client", "Téléphone", "Produit", "Montant", "Zone", "Statut", "Livreur", "Mode de vente", "Montant payé", "Solde restant", "Date"]
      : ["Client", "Téléphone", "Produit", "Montant", "Zone", "Statut", "Livreur", "Date"];
    const rows = commandesAffichees.map((c) => {
      const base = [c.client, c.tel, c.produit, c.montant, c.zone || "", STATUTS[c.statut]?.label || c.statut, c.livreur || ""];
      if (estRetail) {
        const paye = Number(c.montant_paye || 0);
        base.push(c.mode_vente === "expedition" ? "Expédition" : c.mode_vente === "livraison" ? "Livraison" : "Sur place", paye, Number(c.montant) - paye);
      }
      base.push(new Date(c.created_at).toLocaleDateString("fr-FR"));
      return base;
    });
    function neutraliser(valeur) {
      const s = String(valeur ?? "");
      if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
      return s;
    }
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${neutraliser(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspace.name}-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const periodLabel = { aujourdhui: "Aujourd'hui", hier: "Hier", semaine: "Cette semaine", mois: "Ce mois", personnalise: "Période personnalisée" }[datePreset];

  const quantitesParProduit = useMemo(() => {
    const map = {};
    const commandesAvecItems = new Set(commandeItems.map((it) => it.commande_id));
    commandes.forEach((c) => {
      if (commandesAvecItems.has(c.id)) return;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (!nom) return;
      if (!map[nom]) map[nom] = { commandees: 0, livrees: 0 };
      if (c.statut !== "echouee") map[nom].commandees += quantite;
      if (c.statut === "confirmee") map[nom].livrees += quantite;
    });
    const commandesById = Object.fromEntries(commandes.map((c) => [c.id, c]));
    commandeItems.forEach((it) => {
      const c = commandesById[it.commande_id];
      if (!c || !it.produit_nom) return;
      if (!map[it.produit_nom]) map[it.produit_nom] = { commandees: 0, livrees: 0 };
      if (c.statut !== "echouee") map[it.produit_nom].commandees += it.quantite;
      if (c.statut === "confirmee") map[it.produit_nom].livrees += it.quantite;
    });
    return map;
  }, [commandes, commandeItems]);

  const produitsAvecBenefice = useMemo(() => {
    return produits
      .map((p) => {
        const q = quantitesParProduit[p.nom] || { commandees: 0, livrees: 0 };
        const coutAchat = Number(p.cout_achat) || 0;
        const fraisImport = Number(p.frais_import_unitaire) || 0;
        const coutReel = coutAchat + fraisImport;
        const prixVente = Number(p.prix_vente) || 0;
        const margeUnitaire = prixVente - coutReel;
        const beneficeRealise = margeUnitaire * q.livrees;
        return { ...p, commandees: q.commandees, livrees: q.livrees, coutReel, margeUnitaire, beneficeRealise };
      })
      .sort((a, b) => b.beneficeRealise - a.beneficeRealise);
  }, [produits, quantitesParProduit]);

  const produitStockCritique = useMemo(() => {
    const candidats = produits
      .map((p) => {
        const stock = Number(p.stock_initial || 0);
        const q = quantitesParProduit[p.nom] || { commandees: 0 };
        const restant = stock - q.commandees;
        return { nom: p.nom, stock, restant };
      })
      .filter((p) => p.stock > 0 && p.restant <= 5);
    if (candidats.length === 0) return null;
    return candidats.sort((a, b) => a.restant - b.restant)[0];
  }, [produits, quantitesParProduit]);

  const validationsParJour = useMemo(() => {
    const confirmeesAvecDate = commandes.filter((c) => c.statut === "confirmee" && c.confirmed_at);
    const map = {};
    confirmeesAvecDate.forEach((c) => {
      const dValidation = new Date(c.confirmed_at);
      const keyValidation = dValidation.toISOString().slice(0, 10);
      const dCreation = new Date(c.created_at);
      const keyCreation = dCreation.toISOString().slice(0, 10);
      const memeJour = keyValidation === keyCreation;
      if (!map[keyValidation]) {
        map[keyValidation] = { date: keyValidation, label: dValidation.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), orders: [] };
      }
      map[keyValidation].orders.push({ ...c, memeJour, labelCreation: dCreation.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) });
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [commandes]);

  const nonValideesParJour = useMemo(() => {
    const nonValidees = commandes.filter((c) => c.statut === "en_cours" || c.statut === "echouee");
    const map = {};
    nonValidees.forEach((c) => {
      const d = new Date(c.created_at);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { date: key, label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), orders: [] };
      map[key].orders.push(c);
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [commandes]);

  const produitsClassement = useMemo(() => {
    const map = {};
    commandesInRange.forEach((c) => {
      const nom = (c.produit || "Autre").split(" x")[0].trim();
      if (!map[nom]) map[nom] = { nom, ventes: 0, revenus: 0 };
      map[nom].ventes += 1;
      map[nom].revenus += Number(c.montant);
    });
    return Object.values(map).sort((a, b) => b.ventes - a.ventes);
  }, [commandesInRange]);

  const meilleurProduit = produitsClassement[0] || null;
  const produitPlusRentable = produitsClassement.length ? [...produitsClassement].sort((a, b) => b.revenus - a.revenus)[0] : null;

  const evolutionData = useMemo(() => {
    const map = {};
    commandesInRange.forEach((c) => {
      const d = new Date(c.created_at);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { date: key, commandes: 0, label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) };
      map[key].commandes += 1;
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [commandesInRange]);

  const clientsSuspects = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      const key = c.tel;
      if (!key) return;
      if (!map[key]) map[key] = { tel: key, nom: c.client, echouees: 0, total: 0 };
      map[key].total += 1;
      if (c.statut === "echouee") map[key].echouees += 1;
    });
    return Object.values(map).filter((c) => c.echouees >= 3);
  }, [commandes]);

  const anomaliesProduitZone = useMemo(() => {
    const traites = commandes.filter((c) => c.statut === "confirmee" || c.statut === "echouee");

    const globalParProduit = {};
    traites.forEach((c) => {
      const p = (c.produit || "").split(" x")[0].trim();
      if (!p) return;
      if (!globalParProduit[p]) globalParProduit[p] = { total: 0, echecs: 0 };
      globalParProduit[p].total += 1;
      if (c.statut === "echouee") globalParProduit[p].echecs += 1;
    });

    const parProduitZone = {};
    traites.forEach((c) => {
      const p = (c.produit || "").split(" x")[0].trim();
      const z = (c.zone || "").trim();
      if (!p || !z) return;
      const key = p + "|||" + z;
      if (!parProduitZone[key]) parProduitZone[key] = { produit: p, zone: z, total: 0, echecs: 0 };
      parProduitZone[key].total += 1;
      if (c.statut === "echouee") parProduitZone[key].echecs += 1;
    });

    const anomalies = [];
    Object.values(parProduitZone).forEach((g) => {
      if (g.total < 5) return;
      const tauxLocal = g.echecs / g.total;
      const global = globalParProduit[g.produit];
      const tauxGlobal = global && global.total > 0 ? global.echecs / global.total : 0;
      const ecartPoints = (tauxLocal - tauxGlobal) * 100;
      if (ecartPoints >= 15 && tauxLocal >= tauxGlobal * 1.5) {
        anomalies.push({ produit: g.produit, zone: g.zone, total: g.total, tauxLocal: Math.round(tauxLocal * 100), tauxGlobal: Math.round(tauxGlobal * 100) });
      }
    });

    return anomalies.sort((a, b) => b.tauxLocal - a.tauxLocal);
  }, [commandes]);

  const commandesRecuperables = useMemo(() => {
    // Zones à risque (issues des anomalies déjà détectées) — accès rapide par clé "produit|||zone"
    const zonesARisque = new Set(anomaliesProduitZone.map((a) => a.produit + "|||" + a.zone));

    // Historique du client : nb d'échecs passés, montant moyen de ses commandes
    const historiqueParTel = {};
    commandes.forEach((c) => {
      if (!c.tel) return;
      if (!historiqueParTel[c.tel]) historiqueParTel[c.tel] = { echecsPasses: 0, montants: [] };
      if (c.statut === "echouee") historiqueParTel[c.tel].echecsPasses += 1;
      historiqueParTel[c.tel].montants.push(Number(c.montant));
    });

    const candidates = commandes.filter((c) => c.statut === "en_cours" || c.statut === "echouee");

    return candidates
      .map((c) => {
        let score = 0;
        const hist = historiqueParTel[c.tel] || { echecsPasses: 0, montants: [c.montant] };

        // +30 : le client a déjà eu un échec de livraison avant cette commande
        const echecsAvantCelleCi = c.statut === "echouee" ? hist.echecsPasses - 1 : hist.echecsPasses;
        if (echecsAvantCelleCi > 0) score += 30;

        // +25 : au moins 2 relances déjà envoyées, sans confirmation
        const nbRelances = (allRelances || []).filter((r) => r.commande_id === c.id).length;
        if (nbRelances >= 2) score += 25;

        // +20 : montant supérieur à la moyenne des commandes de ce client
        const moyenne = hist.montants.reduce((s, m) => s + m, 0) / hist.montants.length;
        if (Number(c.montant) > moyenne * 1.3) score += 20;

        // +15 : en attente depuis plus de 48h
        const heuresEcoulees = (Date.now() - new Date(c.created_at).getTime()) / 3600000;
        if (c.statut === "en_cours" && heuresEcoulees > 48) score += 15;

        // +10 : zone à risque déjà identifiée pour ce produit
        const produitCle = (c.produit || "").split(" x")[0].trim();
        if (zonesARisque.has(produitCle + "|||" + (c.zone || "").trim())) score += 10;

        return { ...c, scoreRisque: score, nbRelances };
      })
      .filter((c) => c.scoreRisque > 0)
      .sort((a, b) => b.scoreRisque - a.scoreRisque);
  }, [commandes, allRelances, anomaliesProduitZone]);

  const clients = useMemo(() => {
    const map = {};
    commandes.forEach((c) => {
      const key = c.tel || c.client;
      if (!map[key]) map[key] = { nom: c.client, tel: c.tel, zone: c.zone, commandes: [] };
      map[key].commandes.push(c);
    });
    return Object.values(map)
      .map((cl) => {
        const confirmeesTriees = cl.commandes
          .filter((c) => c.statut === "confirmee")
          .map((c) => new Date(c.created_at))
          .sort((a, b) => a - b);

        let intervalleMoyen = null;
        let joursDepuisDernier = null;
        let joursDeRetard = null;
        if (confirmeesTriees.length >= 2) {
          const intervalles = [];
          for (let i = 1; i < confirmeesTriees.length; i++) {
            intervalles.push((confirmeesTriees[i] - confirmeesTriees[i - 1]) / 86400000);
          }
          intervalleMoyen = Math.round(intervalles.reduce((s, v) => s + v, 0) / intervalles.length);
          const dernier = confirmeesTriees[confirmeesTriees.length - 1];
          joursDepuisDernier = Math.round((new Date() - dernier) / 86400000);
          joursDeRetard = joursDepuisDernier - intervalleMoyen;
        }

        return {
          ...cl,
          total: cl.commandes.length,
          confirmees: cl.commandes.filter((c) => c.statut === "confirmee").length,
          echouees: cl.commandes.filter((c) => c.statut === "echouee").length,
          montantTotal: cl.commandes.filter((c) => c.statut === "confirmee").reduce((s, c) => s + Number(c.montant), 0),
          intervalleMoyen,
          joursDepuisDernier,
          joursDeRetard,
        };
      })
      .sort((a, b) => b.montantTotal - a.montantTotal);
  }, [commandes]);

  const clientsARelancer = useMemo(() => {
    return clients.filter((c) => c.joursDeRetard !== null && c.joursDeRetard >= 0).sort((a, b) => b.joursDeRetard - a.joursDeRetard);
  }, [clients]);

  async function addCommande(form) {
    if (accesBloque) {
      alert("Ton essai gratuit est terminé. Passe à un plan payant pour continuer à ajouter des commandes.");
      return;
    }
    if (quotaAtteint) {
      alert("Quota de commandes du mois atteint pour ton plan. Passe à un plan supérieur pour continuer.");
      return;
    }
    const montantTotal = Number(form.montant);

    // Détecte une commande très similaire déjà passée récemment (même client, même produit)
    // — évite d'envoyer deux livreurs pour la même personne par erreur
    // (ignoré si pas de téléphone, ex: commandes restaurant sans client identifié)
    if (form.tel && form.tel.trim()) {
      const deuxHeuresAvant = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: doublonsPotentiels } = await supabase
        .from("commandes")
        .select("id, produit, created_at, statut")
        .eq("workspace_id", workspace.id)
        .eq("tel", form.tel)
        .neq("statut", "echouee")
        .gte("created_at", deuxHeuresAvant);

      const doublon = (doublonsPotentiels || []).find((d) =>
        d.produit?.toLowerCase().includes((form.produit || "").toLowerCase().split(" ")[0])
      );

      if (doublon) {
        const minutesEcoulees = Math.round((Date.now() - new Date(doublon.created_at).getTime()) / 60000);
        const continuer = window.confirm(
          `⚠️ Ce client a déjà une commande similaire en cours, passée il y a ${minutesEcoulees} min.\n\nContinuer quand même et créer une deuxième commande ?`
        );
        if (!continuer) return;
      }

      // Détecte un client "à risque" : historique d'échecs/annulations sur ce numéro,
      // même en dehors de la fenêtre de 2h ci-dessus — utile avant d'envoyer un livreur.
      const { data: historiqueRisque } = await supabase
        .from("commandes")
        .select("id, statut")
        .eq("workspace_id", workspace.id)
        .eq("tel", form.tel)
        .in("statut", ["echouee", "annulee"]);

      const nbRisque = (historiqueRisque || []).length;
      if (nbRisque > 0) {
        const continuer = window.confirm(
          `⚠️ Client à risque : ce numéro a déjà ${nbRisque} commande${nbRisque > 1 ? "s" : ""} échouée${nbRisque > 1 ? "s" : ""} ou annulée${nbRisque > 1 ? "s" : ""} par le passé.\n\nContinuer quand même ?`
        );
        if (!continuer) return;
      }
    }

    const montantDejaPaye = workspace.activity_type === "retail" ? (form.montant_paye === "" ? montantTotal : Number(form.montant_paye)) : 0;
    const payeEnEntier = workspace.activity_type === "retail" ? montantDejaPaye >= montantTotal : false;
    const statutInitial = workspace.activity_type === "retail" ? (payeEnEntier ? "confirmee" : "en_cours") : "en_cours";
    const { error } = await supabase.from("commandes").insert([
      { ...form, montant: montantTotal, montant_paye: montantDejaPaye, caution: form.caution === "" || form.caution == null ? null : Number(form.caution), workspace_id: workspace.id, statut: statutInitial, confirmed_at: statutInitial === "confirmee" ? new Date().toISOString() : null, confirmed_by: statutInitial === "confirmee" ? session.user.email.split("@")[0] : null },
    ]);
    if (error) {
      alert("Erreur: " + error.message);
      return;
    }
    if (form.table_id) {
      await supabase.from("tables_restaurant").update({ statut: "occupee" }).eq("id", form.table_id);
      await loadTablesRestaurant();
    }
    await loadCommandes();
    setShowAdd(false);
  }

  const totalCA = commandesInRange.reduce((s, c) => s + Number(c.montant), 0);
  const confirmees = commandesInRange.filter((c) => c.statut === "confirmee");
  const caConfirme = confirmees.reduce((s, c) => s + Number(c.montant), 0);
  const echoueesInRange = commandesInRange.filter((c) => c.statut === "echouee");
  const enCoursInRange = commandesInRange.filter((c) => c.statut === "en_cours");

  const totalVentesConfirmeesToutesPeriodes = useMemo(() => commandes.filter((c) => c.statut === "confirmee").length, [commandes]);
  const paliersVendeur = [
    { seuil: 500, nom: "Diamant", icone: "💎", couleur: "#4FC3F7" },
    { seuil: 100, nom: "Or", icone: "🏆", couleur: "#e8920a" },
    { seuil: 20, nom: "Argent", icone: "🥈", couleur: "#9CA3AF" },
    { seuil: 0, nom: "Bronze", icone: "🥉", couleur: "#B87333" },
  ];
  const palierActuel = paliersVendeur.find((p) => totalVentesConfirmeesToutesPeriodes >= p.seuil);
  const palierSuivant = [...paliersVendeur].reverse().find((p) => p.seuil > totalVentesConfirmeesToutesPeriodes);

  const rapportSemaine = useMemo(() => {
    const maintenant = new Date();
    const il7j = new Date(maintenant.getTime() - 7 * 86400000);
    const il14j = new Date(maintenant.getTime() - 14 * 86400000);

    const commandesSemaine = commandes.filter((c) => new Date(c.created_at) >= il7j);
    const confirmeesSemaine = commandesSemaine.filter((c) => c.statut === "confirmee");
    const caSemaine = confirmeesSemaine.reduce((s, c) => s + Number(c.montant), 0);

    const telsEchouesAvant = new Set(
      commandes.filter((c) => c.statut === "echouee" && new Date(c.created_at) < il7j).map((c) => c.tel)
    );
    const clientsRecuperes = confirmeesSemaine.filter((c) => telsEchouesAvant.has(c.tel)).length;

    const parProduit = {};
    confirmeesSemaine.forEach((c) => {
      const nom = (c.produit || "").split(" x")[0].split(",")[0].trim() || "Produit";
      parProduit[nom] = (parProduit[nom] || 0) + 1;
    });
    const meilleurProduitSemaine = Object.entries(parProduit).sort((a, b) => b[1] - a[1])[0];

    return {
      nbVentes: confirmeesSemaine.length,
      ca: caSemaine,
      clientsRecuperes,
      meilleurProduit: meilleurProduitSemaine ? meilleurProduitSemaine[0] : null,
      meilleurProduitVentes: meilleurProduitSemaine ? meilleurProduitSemaine[1] : 0,
      periodeValide: commandes.some((c) => new Date(c.created_at) < il14j),
    };
  }, [commandes]);

  useEffect(() => {
    if (!loaded || commandes.length === 0) return;
    const auj = new Date();
    const anneeSemaine = `${auj.getFullYear()}-S${Math.ceil((((auj - new Date(auj.getFullYear(), 0, 1)) / 86400000) + new Date(auj.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
    const cleVue = `rv_rapport_semaine_vu_${workspace.id}`;
    const derniereVue = localStorage.getItem(cleVue);
    if (derniereVue !== anneeSemaine && rapportSemaine.nbVentes > 0) {
      setShowRapportSemaine(true);
      localStorage.setItem(cleVue, anneeSemaine);
    }
  }, [loaded, commandes.length, rapportSemaine.nbVentes, workspace.id]);

  const aRisqueCount = echoueesInRange.length + enCoursInRange.length;
  const tauxLivraison = commandesInRange.length ? Math.round((confirmees.length / commandesInRange.length) * 100) : 0;
  const tauxEchec = commandesInRange.length ? Math.round((echoueesInRange.length / commandesInRange.length) * 100) : 0;

  const COUT_LIVRAISON = 1500;
  const coutLivraisons = workspace.activity_type === "retail" ? confirmees.filter((c) => c.mode_vente === "livraison" || c.mode_vente === "expedition").length * COUT_LIVRAISON : confirmees.length * COUT_LIVRAISON;

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
        coutTotal += (Number(trouve.cout_achat) + Number(trouve.frais_import_unitaire || 0)) * quantite;
      }
    });
    return { coutTotal, nbInconnu, montantInconnu };
  }, [confirmees, produits]);

  const beneficeReel = caConfirme - coutLivraisons - coutProduitsInfo.coutTotal;

  const rentabiliteParCloser = useMemo(() => {
    const map = {};
    confirmees.forEach((c) => {
      const closer = c.closer || "Sans closer";
      const { nom, quantite } = parseProduitTexte(c.produit);
      const trouve = produits.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      const cout = trouve ? (Number(trouve.cout_achat) + Number(trouve.frais_import_unitaire || 0)) * quantite : 0;
      if (!map[closer]) map[closer] = { nom: closer, ca: 0, cout: 0, nbCommandes: 0 };
      map[closer].ca += Number(c.montant);
      map[closer].cout += cout;
      map[closer].nbCommandes += 1;
    });
    return Object.values(map).map((x) => ({ ...x, benefice: x.ca - x.cout })).sort((a, b) => b.benefice - a.benefice);
  }, [confirmees, produits]);

  const rentabiliteParZone = useMemo(() => {
    const map = {};
    confirmees.forEach((c) => {
      const zone = (c.zone || "").trim() || "Sans zone";
      const { nom, quantite } = parseProduitTexte(c.produit);
      const trouve = produits.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      const cout = trouve ? (Number(trouve.cout_achat) + Number(trouve.frais_import_unitaire || 0)) * quantite : 0;
      if (!map[zone]) map[zone] = { nom: zone, ca: 0, cout: 0, nbCommandes: 0 };
      map[zone].ca += Number(c.montant);
      map[zone].cout += cout;
      map[zone].nbCommandes += 1;
    });
    return Object.values(map).map((x) => ({ ...x, benefice: x.ca - x.cout })).sort((a, b) => b.benefice - a.benefice);
  }, [confirmees, produits]);

  const rentabiliteParCampagne = useMemo(() => {
    const avecSource = confirmees.filter((c) => c.source_campagne);
    if (avecSource.length === 0) return [];
    const map = {};
    avecSource.forEach((c) => {
      const source = c.source_campagne;
      const { nom, quantite } = parseProduitTexte(c.produit);
      const trouve = produits.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      const cout = trouve ? (Number(trouve.cout_achat) + Number(trouve.frais_import_unitaire || 0)) * quantite : 0;
      if (!map[source]) map[source] = { nom: source, ca: 0, cout: 0, nbCommandes: 0 };
      map[source].ca += Number(c.montant);
      map[source].cout += cout;
      map[source].nbCommandes += 1;
    });
    return Object.values(map).map((x) => ({ ...x, benefice: x.ca - x.cout })).sort((a, b) => b.benefice - a.benefice);
  }, [confirmees, produits]);

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

  const repartitionCloserLivreur = useMemo(() => {
    const map = {};
    commandesInRange.forEach((c) => {
      if (!c.closer || !c.livreur) return;
      const key = c.closer + "|||" + c.livreur;
      if (!map[key]) map[key] = { closer: c.closer, livreur: c.livreur, total: 0, produits: {} };
      map[key].total += 1;
      const { nom, quantite } = parseProduitTexte(c.produit);
      if (nom) map[key].produits[nom] = (map[key].produits[nom] || 0) + quantite;
    });
    return Object.values(map)
      .map((r) => ({ ...r, produitsListe: Object.entries(r.produits).map(([nom, qte]) => ({ nom, qte })).sort((a, b) => b.qte - a.qte) }))
      .sort((a, b) => b.total - a.total);
  }, [commandesInRange]);

  const livreursAvecCommandes = useMemo(() => {
    const map = {};
    commandesInRange.forEach((c) => {
      if (!c.livreur) return;
      map[c.livreur] = (map[c.livreur] || 0) + 1;
    });
    return Object.entries(map).map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total);
  }, [commandesInRange]);

  const meilleurLivreur = useMemo(() => {
    if (depotsParLivreur.length === 0) return null;
    const avecTaux = depotsParLivreur.map((l) => {
      const total = livreursAvecCommandes.find((x) => x.nom === l.nom)?.total || l.livrees;
      return { ...l, taux: total > 0 ? Math.round((l.livrees / total) * 100) : 0, total };
    });
    return avecTaux.sort((a, b) => b.taux - a.taux)[0];
  }, [depotsParLivreur, livreursAvecCommandes]);

  const monProfilLivreur = livreurs.find((l) => l.email && l.email.toLowerCase() === session.user.email.toLowerCase());

  useEffect(() => {
    // Empêche le bouton/geste "retour" du téléphone de quitter complètement l'app.
    // Sans historique de navigation interne, chaque "vue" (Commandes, Clients...) ou
    // fenêtre ouverte n'a "rien à quoi revenir" dans l'historique du navigateur, donc
    // le retour sortait carrément de l'app. On piège chaque retour : d'abord on ferme
    // toute fenêtre ouverte, sinon on revient à l'écran principal — jamais on ne sort.
    window.history.pushState({ rvApp: true }, "");
    function auRetourNavigateur() {
      const uneFenetreEstOuverte =
        showRapportSemaine || showReunion || showTeam || showStoreBuilder || showAvis || showTemoignages ||
        showCollections || showCodesPromo || showPaniersAbandonnes || showAzaliDesign || showTraficBoutique || showProduits || showAbonnement || showCampagne || showLivreurs || showClosers ||
        showBienvenue || showAide || showIntegrations ||
        showBatch || showAdd;

      if (uneFenetreEstOuverte) {
        setShowRapportSemaine(false); setShowReunion(false); setShowTeam(false); setShowStoreBuilder(false);
        setShowAvis(false); setShowTemoignages(false); setShowCollections(false); setShowCodesPromo(false); setShowPaniersAbandonnes(false); setShowAzaliDesign(false); setShowTraficBoutique(false); setShowProduits(false);
        setShowAbonnement(false); setShowCampagne(false); setShowLivreurs(false); setShowClosers(false);
        setShowBienvenue(false); setShowAide(false);
        setShowIntegrations(false); setShowBatch(false); setShowAdd(false);
      } else if (vue !== "aujourdhui") {
        setVue("aujourdhui");
      }
      // Repousse une entrée pour absorber le prochain retour aussi, sans jamais quitter l'app.
      window.history.pushState({ rvApp: true }, "");
    }
    window.addEventListener("popstate", auRetourNavigateur);
    return () => window.removeEventListener("popstate", auRetourNavigateur);
  }, [
    showRapportSemaine, showReunion, showTeam, showStoreBuilder, showAvis, showTemoignages,
    showCollections, showCodesPromo, showPaniersAbandonnes, showAzaliDesign, showTraficBoutique, showProduits, showAbonnement, showCampagne, showLivreurs, showClosers,
    showBienvenue, showAide, showIntegrations,
    showBatch, showAdd, vue,
  ]);

  if (workspace.role === "livreur" && monProfilLivreur) {
    return (
      <LivreurPortalSaas
        livreur={monProfilLivreur}
        commandes={commandes.filter((c) => c.livreur === monProfilLivreur.nom)}
        currency={workspace.currency}
        onStatusChanged={loadCommandes}
      />
    );
  }

  if (workspace.role === "comptable") {
    return <ComptablePortalSaas workspace={workspace} commandes={commandes} livreurs={livreurs} produits={produits} />;
  }

  if (workspace.role === "rh") {
    return <TeamModal workspace={workspace} onClose={() => {}} pleinePage />;
  }

  const monProfilCloser = closers.find((c) => c.email && c.email.toLowerCase() === session.user.email.toLowerCase());

  if (workspace.role === "closer" && monProfilCloser) {
    return (
      <CloserPortalSaas
        closer={monProfilCloser}
        commandes={commandes}
        currency={workspace.currency}
        workspace={workspace}
        onStatusChanged={loadCommandes}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", width: "100%", maxWidth: "100vw", overflowX: "hidden", boxSizing: "border-box" }}>
      <style>{`@media(max-width:800px){body,html,#root{overflow-x:clip!important}}`}</style>
      <style>{`
        .rv-mesh-blob { position: absolute; border-radius: 50%; filter: blur(40px); pointer-events: none; }
        .rv-mesh-1 { width: 180px; height: 180px; background: radial-gradient(circle, rgba(232,146,10,0.45) 0%, rgba(232,146,10,0) 70%); top: -60px; right: -40px; animation: rvMeshFloat1 9s ease-in-out infinite; }
        .rv-mesh-2 { width: 140px; height: 140px; background: radial-gradient(circle, rgba(127,214,163,0.4) 0%, rgba(127,214,163,0) 70%); bottom: -50px; left: 10%; animation: rvMeshFloat2 11s ease-in-out infinite; }
        .rv-mesh-3 { width: 110px; height: 110px; background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%); top: 20%; right: 25%; animation: rvMeshFloat3 7s ease-in-out infinite; }
        @keyframes rvMeshFloat1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-20px,20px) scale(1.15); } }
        @keyframes rvMeshFloat2 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(25px,-15px) scale(1.1); } }
        @keyframes rvMeshFloat3 { 0%, 100% { transform: translate(0,0) scale(1); opacity: 0.6; } 50% { transform: translate(-15px,-10px) scale(1.3); opacity: 1; } }
        .rv-wave-1 { animation: rvWaveDrift 9s linear infinite; }
        .rv-wave-2 { animation: rvWaveDrift 14s linear infinite reverse; }
        .rv-wave-3 { animation: rvWaveDrift 20s linear infinite; }
        @keyframes rvWaveDrift { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .rv-glow { animation: rvGlowBreathe 4s ease-in-out infinite; }
        @keyframes rvGlowBreathe { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
        .rv-3d-card { animation: rv3DFloat 6s ease-in-out infinite; transform-style: preserve-3d; }
        .rv-glass-card { position: relative; overflow: hidden; border-radius: 12px; padding: 11px 13px; background: linear-gradient(155deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 60%, rgba(255,255,255,0.1) 100%); border: 1px solid rgba(255,255,255,0.25); box-shadow: 0 4px 14px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.08); }
        .rv-glass-shine { position: absolute; top: -50%; left: -60%; width: 60%; height: 200%; background: linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%); transform: rotate(20deg); animation: rvShineSweep 3.5s ease-in-out infinite; pointer-events: none; }
        @keyframes rvShineSweep { 0% { left: -60%; } 35%, 100% { left: 140%; } }
        @keyframes rv3DFloat {
          0%, 100% { transform: rotateX(0deg) rotateY(0deg) translateZ(0); }
          25% { transform: rotateX(3deg) rotateY(-4deg) translateZ(6px); }
          50% { transform: rotateX(0deg) rotateY(0deg) translateZ(0); }
          75% { transform: rotateX(-3deg) rotateY(4deg) translateZ(6px); }
        }
        .rv-livedot { animation: rvPulseDot 2s ease-in-out infinite; }
        @keyframes rvPulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .rv-saas-celebrate-in { animation: rvSaasCelebrateIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @keyframes rvSaasCelebrateIn {
          0% { opacity: 0; transform: scale(0.5) translateY(20px); }
          60% { opacity: 1; transform: scale(1.08) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .rv-saas-celebrate-out { animation: rvSaasCelebrateOut 0.35s ease forwards; }
        @keyframes rvSaasCelebrateOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.92) translateY(-10px); }
        }
        .rv-saas-confetti { animation: rvSaasConfetti 1.4s ease-out forwards; }
        @keyframes rvSaasConfetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(90px) rotate(360deg); opacity: 0; }
        }
        .rv-saas-sidebar { display: none; }
        .rv-saas-content { }
        .rv-saas-tabs-mobile { }
        .rv-saas-bottomnav { display: flex; }
        .rv-saas-content { padding-bottom: 76px; }
        @media (min-width: 900px) {
          .rv-saas-sidebar {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 220px;
            background: linear-gradient(180deg, #050807 0%, #0A130F 40%, #0F1B16 75%, #16231F 100%);
            flex-direction: column;
            padding: 24px 14px;
            z-index: 30;
            overflow-y: auto;
            overflow-x: hidden;
          }
          .rv-saas-sidebar::-webkit-scrollbar { width: 5px; }
          .rv-saas-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
          .rv-saas-sidebar-filigrane {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-90deg);
            font-family: 'Fraunces', serif;
            font-weight: 700;
            font-size: 62px;
            color: rgba(255,255,255,0.025);
            white-space: nowrap;
            pointer-events: none;
            letter-spacing: 0.04em;
          }
          .rv-saas-content {
            margin-left: 220px;
            max-width: none;
            padding: 0 32px;
          }
          .rv-saas-tabs-mobile { display: none !important; }
          .rv-saas-bottomnav { display: none !important; }
        }
      `}</style>

      <div className="rv-saas-sidebar">
        <div className="rv-saas-sidebar-filigrane">RECUVENTE</div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: "white", marginBottom: 14, padding: "0 8px" }}>
          RECU<span style={{ color: "#e8920a" }}>VENTE</span>
        </div>

        {workspace.role === "owner" && (
          <SelecteurEspace
            workspace={workspace}
            workspacesDisponibles={workspacesDisponibles}
            onChangerEspace={onChangerEspace}
            onDemanderAjoutEspace={onDemanderAjoutEspace}
          />
        )}

        {[
          { key: "aujourdhui", label: "Aujourd'hui" },
          { key: "commandes", label: workspace.activity_type === "retail" ? "Ventes" : workspace.activity_type === "location_immobiliere" ? "Loyers" : workspace.activity_type === "restaurant" ? "Commandes" : "Commandes" },
          ...(workspace.activity_type === "restaurant" ? [{ key: "cuisine", label: "🍽️ Cuisine" }, { key: "menu_restaurant", label: "📋 Menu" }] : []),
          ...(workspace.activity_type === "location_vehicule" ? [{ key: "biens_location", label: "🚗 Véhicules/Matériel" }] : []),
          ...(workspace.activity_type === "location_immobiliere" ? [{ key: "logements", label: "🏠 Logements" }] : []),
          { key: "validations", label: "Validations" },
          { key: "clients", label: "Clients" },
          ...(workspace.role === "owner" || workspace.role === "admin" ? [{ key: "produits_vue", label: "📦 Produits" }] : []),
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setVue(t.key)}
            style={{
              display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none",
              background: vue === t.key ? "rgba(255,255,255,0.1)" : "transparent",
              color: vue === t.key ? "white" : "rgba(255,255,255,0.6)",
              fontSize: 14, fontWeight: vue === t.key ? 600 : 500, textAlign: "left", marginBottom: 3, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}

        {(workspace.role === "owner" || workspace.role === "admin") && (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "14px 12px 6px" }}>
            Pilotage financier
          </div>
        )}
        {[
          ...(estEcommerce && (workspace.role === "owner" || workspace.role === "admin") ? [{ key: "recovery", label: "🎯 Récupération" }] : []),
          ...(workspace.role === "owner" ? [{ key: "score_business", label: "🧭 Score Business" }] : []),
          ...(estEcommerce && (workspace.role === "owner" || workspace.role === "admin") ? [{ key: "simulateur", label: "📊 Simulateur pub" }] : []),
          ...(workspace.role === "owner" || workspace.role === "admin" ? [{ key: "rapprochement", label: "🔗 Rapprochement" }] : []),
          ...(workspace.role === "owner" || workspace.role === "admin" ? [{ key: "compta", label: "🧮 Compta" }] : []),
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setVue(t.key)}
            style={{
              display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none",
              background: vue === t.key ? "rgba(255,255,255,0.1)" : "transparent",
              color: vue === t.key ? "white" : "rgba(255,255,255,0.6)",
              fontSize: 14, fontWeight: vue === t.key ? 600 : 500, textAlign: "left", marginBottom: 3, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowProduits(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            📦 Catalogue
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowAvis(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            ⭐ Avis clients
          </button>
        )}
        {session?.user?.email === "oulipaiexpress@gmail.com" && (
          <button
            onClick={() => setShowProspectsIA(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            🤖 Prospects IA
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowTemoignages(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            💬 Témoignages
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowCollections(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            📁 Collections
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && workspace.slug === "azaliexpress" && (
          <button
            onClick={() => setShowAzaliDesign(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            🎨 Personnaliser ma boutique
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowTraficBoutique(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            📊 Trafic de ma boutique
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowCodesPromo(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            🏷️ Codes promo
          </button>
        )}
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowPaniersAbandonnes(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            🛒 Paniers abandonnés
          </button>
        )}
        {workspace.role === "owner" && (
          <>
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "10px 8px" }} />
            <button
              onClick={() => setShowTeam(true)}
              style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
            >
              👥 Gérer l'équipe
            </button>
            <button
              onClick={() => setShowIntegrations(true)}
              style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
            >
              ⚙️ Paramètres avancés
            </button>
            {estEcommerce && (
              <button
                onClick={() => setShowStoreBuilder(true)}
                style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "rgba(232,146,10,0.15)", color: "#e8920a", fontSize: 14, fontWeight: 600, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
              >
                🛍️ Ma Boutique
              </button>
            )}
            <button
              onClick={() => setShowAbonnement(true)}
              style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
            >
              💳 Mon abonnement
            </button>
            <button
              onClick={() => setShowAide(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px", borderRadius: 10, border: "1px solid rgba(154,230,180,0.35)", background: "rgba(31,157,110,0.18)", color: "#7fd6a3", fontSize: 13.5, fontWeight: 700, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
            >
              📖 Comment utiliser RecuVente
            </button>
          </>
        )}
        <div style={{ marginTop: "auto" }}>
          <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "8px 0", borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", fontWeight: 500, fontSize: 12.5, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
        </div>
      </div>

      <div className="rv-saas-content">

      {vue === "commandes" && (
        <Dashboard3D
          workspace={workspace}
          activityType={workspace.activity_type}
          caConfirme={caConfirme}
          commandesCount={commandesInRange.length}
          beneficeReel={beneficeReel}
          livreursCount={livreurs.filter((l) => l.en_tournee || l.position_lat || l.position_lng).length || livreurs.length}
          equipeCount={livreurs.length + closers.length}
          boutiquesCount={workspacesDisponibles.length || 1}
          aRisqueCount={aRisqueCount}
          tauxLivraison={tauxLivraison}
          evolutionData={evolutionData}
          commandes={commandes}
          actionsFinales={
            (workspace.role === "owner" || workspace.role === "admin") && (
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Actions équipe</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <button onClick={() => setShowLivreurs(true)} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", color: "white", borderRadius: 10, padding: "10px 6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>🚚 Livreurs</button>
                  <button onClick={() => setShowClosers(true)} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", color: "white", borderRadius: 10, padding: "10px 6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>🎧 Closers</button>
                  <button onClick={() => setShowCampagne(true)} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", color: "white", borderRadius: 10, padding: "10px 6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>📣 Campagne</button>
                  <button onClick={() => setShowReunion(true)} style={{ background: "linear-gradient(135deg,#00D084,#00F5A0)", border: "none", color: "#03110C", borderRadius: 10, padding: "10px 6px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,208,132,0.35)" }}>📹 Réunion</button>
                </div>
              </div>
            )
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span className="rv-livedot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7fd6a3", display: "inline-block" }} />
            <span style={{ fontSize: 9.5, fontWeight: 500, opacity: 0.65 }}>{workspace.country} · {workspace.currency} · rôle : {workspace.role}</span>
          </div>

          {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <button
                onClick={() => setShowStoreBuilder(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#e8920a", border: "none", color: "#16231F", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
              >
                🛍️ {workspace.store_is_published ? "Personnaliser ma boutique" : "Créer ma boutique"}
              </button>
              {workspace.id && (
                <a
                  href={workspace.slug ? `${window.location.origin}/?boutique=${workspace.slug}` : `${window.location.origin}/?catalogue=${workspace.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", color: "white", padding: "9px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}
                >
                  👁️ Voir ma boutique
                </a>
              )}
            </div>
          )}

          {(workspace.role === "owner" || workspace.role === "admin") && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Accès rapide</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {workspace.role === "owner" && (
                  <>
                    <button onClick={() => setShowTeam(true)} aria-label="Gérer l'équipe" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>👥</button>
                    <button onClick={() => setShowAbonnement(true)} aria-label="Mon abonnement" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>💳</button>
                  </>
                )}
                <button onClick={() => setShowRapportHebdo(true)} aria-label="Ma semaine" style={{ flexShrink: 0, background: "rgba(232,146,10,0.25)", border: "1px solid rgba(232,146,10,0.4)", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>📊</button>
                {estEcommerce && <button onClick={() => setShowProduits(true)} aria-label="Catalogue" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>📦</button>}
                <button onClick={() => setVue("rapprochement")} aria-label="Rapprochement" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>🔗</button>
                <button onClick={() => setVue("score_business")} aria-label="Score business" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>🧭</button>
                {estEcommerce && <button onClick={() => setVue("simulateur")} aria-label="Simulateur pub" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>📊</button>}
                <button onClick={() => setVue("validations")} aria-label="Validations" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>✅</button>
                {workspace.activity_type === "restaurant" && <button onClick={() => setVue("menu_restaurant")} aria-label="Menu" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>📋</button>}
                {workspace.role === "owner" && <button onClick={() => setShowIntegrations(true)} aria-label="Réglages" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>🧭</button>}
                {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && <button onClick={() => setShowTraficBoutique(true)} aria-label="Trafic de ma boutique" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>📈</button>}
                {session?.user?.email === "oulipaiexpress@gmail.com" && <button onClick={() => setShowProspectsIA(true)} aria-label="Prospects IA" style={{ flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "7px 9px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>🤖</button>}
              </div>
            </div>
          )}

          {workspace.role === "owner" && workspacesDisponibles.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tes espaces</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {workspacesDisponibles.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onChangerEspace(w.id)}
                    style={{ flexShrink: 0, background: w.id === workspace.id ? "white" : "rgba(255,255,255,0.14)", color: w.id === workspace.id ? "#16231F" : "white", border: "none", borderRadius: 999, padding: "6px 13px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {{ cod_ecommerce: "📦", retail: "🏪", location_immobiliere: "🏠" }[w.activity_type] || "🏢"} {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {workspace.role === "owner" && (
              <button onClick={onDemanderAjoutEspace} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px dashed rgba(255,255,255,0.4)", borderRadius: 999, padding: "6px 12px", color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                + Ajouter un espace
              </button>
            )}
            <button onClick={() => setShowAide(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(31,157,110,0.22)", border: "1px solid rgba(154,230,180,0.4)", borderRadius: 999, padding: "6px 12px", color: "#7fd6a3", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              📖 Aide
            </button>
            <button onClick={() => supabase.auth.signOut()} aria-label="Déconnexion" style={{ marginLeft: "auto", background: "rgba(255,255,255,0.1)", border: "none", color: "rgba(255,255,255,0.7)", padding: "6px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>⏻ Déconnexion</button>
          </div>
        </Dashboard3D>
      )}

      {(workspace.role === "owner" || workspace.role === "admin") && (
        <ResumeIntelligent
          todoAujourdhui={todoAujourdhui}
          clientsARelancer={clientsARelancer}
          produitStockCritique={produitStockCritique}
          meilleurLivreur={meilleurLivreur}
          beneficeReel={beneficeReel}
          currency={workspace.currency}
          onVoirAujourdhui={() => setVue("aujourdhui")}
          palierActuel={palierActuel}
          palierSuivant={palierSuivant}
          totalVentesConfirmees={totalVentesConfirmeesToutesPeriodes}
        />
      )}

      <div style={{ padding: "0 20px 8px" }}>
      {retourPaiement && (
        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#3B6D11" }}>
          ✅ Paiement reçu ! Ton abonnement s'active automatiquement, ça peut prendre quelques instants.
        </div>
      )}
      <SubscriptionBanner subscription={subscription} />

      {notifPermission === "default" && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "#8A6412" }}>🔔 Active les notifications pour ne rater aucune commande, même l'app fermée.</span>
          <button onClick={activerNotificationsPush} style={{ background: "#e8920a", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            Activer
          </button>
        </div>
      )}

      {accesBloque && (
        <div style={{ background: "white", border: "1.5px solid #F0DDA8", borderRadius: 16, padding: "40px 24px", textAlign: "center", maxWidth: 480, margin: "40px auto" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: "#16231F" }}>Ton essai gratuit est terminé</div>
          <div style={{ color: "#6B7168", fontSize: 13.5, lineHeight: 1.6, marginBottom: 22 }}>
            Passe à un plan payant pour retrouver l'accès à tout ton espace — commandes, clients, produits, équipe, et le reste.
          </div>
          <button
            onClick={() => setShowAbonnement(true)}
            style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            💳 Voir les plans d'abonnement
          </button>
        </div>
      )}

      {(vue === "commandes" || vue === "compta") && !accesBloque && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          {[
            { key: "aujourdhui", label: "Aujourd'hui" },
            { key: "hier", label: "Hier" },
            { key: "semaine", label: "Cette semaine" },
            { key: "mois", label: "Ce mois" },
            { key: "personnalise", label: "Personnalisé" },
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => setDatePreset(d.key)}
              style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${datePreset === d.key ? "#1a7a3c" : "#DDD8CC"}`, background: datePreset === d.key ? "#1a7a3c" : "white", color: datePreset === d.key ? "white" : "#16231F", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer" }}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {vue === "commandes" && datePreset === "personnalise" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5 }} />
          <span style={{ color: "#8A9089", fontSize: 12 }}>à</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5 }} />
        </div>
      )}

      {vue === "aujourdhui" && !accesBloque && (
        <div>
          {commandes.length === 0 && (
            <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 16, padding: "20px 18px", marginBottom: 20 }}>
              <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>👋 Bienvenue sur RecuVente !</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12.5, marginBottom: 16 }}>3 étapes pour bien démarrer.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { n: "1", titre: "Ajoute ta première commande", desc: "Manuellement, ou connecte Shopify", action: () => setShowAdd(true), bouton: "+ Ajouter" },
                  { n: "2", titre: "Invite ton équipe", desc: "Livreurs, closers, comptable", action: () => setShowTeam(true), bouton: "Inviter" },
                  { n: "3", titre: "Connecte Shopify (optionnel)", desc: "Les commandes arriveront toutes seules", action: () => setShowIntegrations(true), bouton: "Voir" },
                ].map((etape) => (
                  <div key={etape.n} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "white", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {etape.n}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "white", fontWeight: 600, fontSize: 13 }}>{etape.titre}</div>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{etape.desc}</div>
                    </div>
                    <button onClick={etape.action} style={{ background: "rgba(255,255,255,0.14)", color: "white", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                      {etape.bouton}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(todoAujourdhui.total > 0 || clientsARelancer.length > 0 || depotsParLivreur.some((l) => l.aDeposer > 0) || produitsEnProgression.length > 0) && (
            <RadarDesFuitesEtActions
              todoAujourdhui={todoAujourdhui}
              clientsARelancer={clientsARelancer}
              depotsParLivreur={depotsParLivreur}
              produitsEnProgression={produitsEnProgression}
              currency={workspace.currency}
              onVoirRecovery={() => setVue("recovery")}
              onVoirCompta={() => setVue("compta")}
              onVoirClients={() => setVue("clients")}
            />
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Aujourd'hui</div>
            {todoAujourdhui.total > 0 && (
              <button onClick={() => setShowBatch(true)} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                📢 Relancer tout
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 14 }}>
            {todoAujourdhui.total > 0 ? `${todoAujourdhui.total} commande${todoAujourdhui.total > 1 ? "s" : ""} à traiter` : "Rien à traiter, tout est à jour ✅"}
          </div>

          {(todoAujourdhui.argentARisque > 0 || todoAujourdhui.argentRecuperable > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 10.5, color: "#B23A22", textTransform: "uppercase", fontWeight: 600 }}>💸 Argent à risque</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 3, color: "#D64933" }}>{todoAujourdhui.argentARisque.toLocaleString("fr-FR")} {workspace.currency}</div>
              </div>
              <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 10.5, color: "#8A6412", textTransform: "uppercase", fontWeight: 600 }}>♻️ Récupérable</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 3, color: "#8A6412" }}>{todoAujourdhui.argentRecuperable.toLocaleString("fr-FR")} {workspace.currency}</div>
              </div>
            </div>
          )}

          {todoAujourdhui.total === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9089" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 14 }}>Aucune commande urgente pour le moment.</div>
            </div>
          )}

          {[
            { key: "aRelivrer", title: workspace.activity_type === "location_immobiliere" ? "📅 Loyers attendus aujourd'hui" : "📅 À relivrer aujourd'hui", items: todoAujourdhui.aRelivrer, color: "#1a7a3c" },
            { key: "jamaisContactees", title: workspace.activity_type === "location_immobiliere" ? "🆕 Nouveaux locataires jamais relancés" : "🆕 Jamais contactées", items: todoAujourdhui.jamaisContactees, color: "#8A6412" },
            { key: "sansNouvelles", title: workspace.activity_type === "location_immobiliere" ? "⏰ Loyers impayés depuis 24h+" : "⏰ Sans nouvelles depuis 24h+", items: todoAujourdhui.sansNouvelles, color: "#D64933" },
          ].map((sec) => sec.items.length > 0 && (
            <div key={sec.key} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: sec.color, marginBottom: 8 }}>{sec.title} ({sec.items.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.items.map((c, i) => (
                  <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${sec.color}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? sec.color : "#ECE8DC", color: i === 0 ? "white" : "#8A9089", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.client}</div>
                        <div style={{ fontSize: 12, color: "#6B7168", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.produit} · {c.tel}</div>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{Number(c.montant).toLocaleString("fr-FR")} {workspace.currency}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <a
                        href={`tel:${c.tel}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 7, padding: "9px 14px", fontSize: 15, textDecoration: "none" }}
                      >
                        📞
                      </a>
                      <button
                        onClick={() => setCommandeAConfirmerRapide(c)}
                        style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 7, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                      >
                        ✅ Confirmer
                      </button>
                      <button
                        onClick={() => changerStatutRapide(c.id, "echouee")}
                        style={{ flex: 1, background: "#D64933", color: "white", border: "none", borderRadius: 7, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                      >
                        ❌ Échoué
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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

      {commandesInRange.length > 0 && (
        <button
          onClick={() => setStatsOuvertes(!statsOuvertes)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 16px", marginBottom: statsOuvertes ? 12 : 16, cursor: "pointer" }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>📊 Statistiques et alertes</span>
          <span style={{ fontSize: 11, color: "#8A9089" }}>{statsOuvertes ? "Masquer ▲" : "Voir ▼"}</span>
        </button>
      )}

      {statsOuvertes && (
        <>
      {commandesInRange.length > 0 && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
          <StatusDonutSaas
            livrees={commandesInRange.filter((c) => c.statut === "confirmee").length}
            enAttente={commandesInRange.filter((c) => c.statut === "en_cours").length}
            echouees={commandesInRange.filter((c) => c.statut === "echouee").length}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1F9D6E", display: "inline-block" }} />
              Confirmées <span style={{ marginLeft: "auto", fontWeight: 600 }}>{commandesInRange.filter((c) => c.statut === "confirmee").length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#E8A93D", display: "inline-block" }} />
              En cours <span style={{ marginLeft: "auto", fontWeight: 600 }}>{commandesInRange.filter((c) => c.statut === "en_cours").length}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#D64933", display: "inline-block" }} />
              Échouées <span style={{ marginLeft: "auto", fontWeight: 600 }}>{commandesInRange.filter((c) => c.statut === "echouee").length}</span>
            </div>
          </div>
        </div>
      )}

      {evolutionData.length > 1 && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "18px 20px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>Évolution des commandes</div>
          <EvolutionChartSaas data={evolutionData} />
        </div>
      )}

      {(meilleurProduit || meilleurLivreur) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {meilleurProduit && (
            <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "#3B6D11" }}>🏆 Produit le plus vendu</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#3B6D11" }}>{meilleurProduit.nom} ({meilleurProduit.ventes})</span>
            </div>
          )}
          {produitPlusRentable && produitPlusRentable.nom !== meilleurProduit?.nom && (
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "#8A6412" }}>💰 Produit le plus rentable</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8A6412" }}>{produitPlusRentable.nom}</span>
            </div>
          )}
          {meilleurLivreur && meilleurLivreur.total > 0 && (
            <div style={{ background: "#EAF7F1", border: "1px solid #C7E8D6", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "#1F9D6E" }}>🚀 Livreur le plus performant</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1F9D6E" }}>{meilleurLivreur.nom} ({meilleurLivreur.taux}%)</span>
            </div>
          )}
        </div>
      )}

      {clientsSuspects.length > 0 && (
        <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#D64933", marginBottom: 6 }}>⚠️ {clientsSuspects.length} client{clientsSuspects.length > 1 ? "s" : ""} avec 3+ échecs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {clientsSuspects.slice(0, 5).map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: "#B23A22" }}>
                <strong>{c.nom}</strong> ({c.tel}) — {c.echouees} échec{c.echouees > 1 ? "s" : ""} sur {c.total} commande{c.total > 1 ? "s" : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {anomaliesProduitZone.length > 0 && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8A6412", marginBottom: 8 }}>
            📍 {anomaliesProduitZone.length} produit{anomaliesProduitZone.length > 1 ? "s" : ""} échoue{anomaliesProduitZone.length > 1 ? "nt" : ""} anormalement dans une zone précise
          </div>
          {anomaliesProduitZone.slice(0, 3).map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: "#8A6412", marginBottom: 3 }}>
              <strong>{a.produit}</strong> à <strong>{a.zone}</strong> — {a.tauxLocal}% d'échec ici (contre {a.tauxGlobal}% ailleurs, sur {a.total} commandes)
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "#8A6412", marginTop: 4, opacity: 0.8 }}>
            Vérifie l'adresse, le livreur assigné, ou la disponibilité du produit dans cette zone.
          </div>
        </div>
      )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un client ou numéro..."
          style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13.5, background: "white", boxSizing: "border-box" }}
        />
        <button
          onClick={exportCSV}
          style={{ background: "white", border: "1px solid #DDD8CC", borderRadius: 9, padding: "0 13px", color: "#1a7a3c", fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap", cursor: "pointer" }}
        >
          Exporter
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {[
          { key: "toutes", label: "Toutes" },
          { key: "echouee", label: "Échouées" },
          { key: "en_cours", label: "En cours" },
          { key: "confirmee", label: "Confirmées" },
          { key: "retournee", label: "Retournées" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatut(f.key)}
            style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${filterStatut === f.key ? "#1a7a3c" : "#DDD8CC"}`, background: filterStatut === f.key ? "#1a7a3c" : "white", color: filterStatut === f.key ? "white" : "#16231F", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 17 }}>Commandes ({commandesAffichees.length})</div>
        <button
          onClick={() => !accesBloque && !quotaAtteint && setShowAdd(true)}
          disabled={accesBloque || quotaAtteint}
          style={{ ...btnStyle, width: "auto", padding: "8px 16px", opacity: (accesBloque || quotaAtteint) ? 0.4 : 1, cursor: (accesBloque || quotaAtteint) ? "not-allowed" : "pointer" }}
        >
          + Ajouter
        </button>
      </div>

      {!loaded && <SkeletonListe nombre={5} />}
      {loaded && commandes.length === 0 && (
        <EtatVide
          icone="📦"
          titre="Aucune commande pour l'instant"
          description="Ajoute ta première commande pour commencer à suivre tes ventes, ou partage le lien de ta boutique pour recevoir tes premières commandes automatiquement."
          texteBouton="➕ Ajouter ma première commande"
          onAction={() => !accesBloque && !quotaAtteint && setShowAdd(true)}
        />
      )}

      {commandesAffichees.length === 0 && commandes.length > 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", color: "#8A9089", fontSize: 13 }}>Aucune commande ne correspond.</div>
      )}

      {groupedByDay.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1a7a3c", textTransform: "capitalize", padding: "8px 2px" }}>
            {group.label} <span style={{ color: "#8A9089", fontWeight: 500 }}>({group.orders.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.orders.map((c) => (
              <CommandeCard key={c.id} commande={c} currency={workspace.currency} onStatusChanged={loadCommandes} livreurs={livreurs} closers={closers} onAssignLivreur={assignLivreur} onAssignCloser={assignCloser} onReschedule={reprogrammerCommande} workspace={workspace} confirmateurNom={session.user.email.split("@")[0]} onCelebrate={(montant, client) => { setCelebration({ montant, client }); playCelebrationSound(); setTimeout(() => setCelebration(null), 2600); }} onRendreCaution={rendreCaution} />
            ))}
          </div>
        </div>
      ))}
      </>
      )}

      {vue === "validations" && !accesBloque && (
        <ValidationsViewSaas commandes={commandes} currency={workspace.currency} />
      )}

      {vue === "biens_location" && !accesBloque && (
        <BiensLocationView
          biensLocation={biensLocation}
          currency={workspace.currency}
          workspaceId={workspace.id}
          estLucirica={workspace.slug === "luxury-car"}
          onAdd={addBienLocation}
          onToggleDisponibilite={toggleDisponibiliteBien}
          onDelete={deleteBienLocation}
        />
      )}

      {vue === "logements" && !accesBloque && (
        <LogementsView
          logements={logements}
          currency={workspace.currency}
          onAdd={addLogement}
          onToggleDisponibilite={toggleDisponibiliteLogement}
          onDelete={deleteLogement}
        />
      )}

      {vue === "menu_restaurant" && !accesBloque && (
        <MenuRestaurantView
          plats={plats}
          currency={workspace.currency}
          onAdd={addPlat}
          onToggleDisponibilite={toggleDisponibilitePlat}
          onDelete={deletePlat}
          tablesRestaurant={tablesRestaurant}
          onAddTable={addTableRestaurant}
          onToggleStatutTable={toggleStatutTable}
        />
      )}

      {vue === "cuisine" && !accesBloque && (
        <CuisineView
          commandes={commandes.filter((c) => c.statut !== "annulee" && c.statut !== "echouee")}
          onChangerStatutCuisine={changerStatutCuisine}
          currency={workspace.currency}
        />
      )}

      {vue === "produits_vue" && !accesBloque && (
        <ProduitsViewSaas
          produitsAvecBenefice={produitsAvecBenefice}
          currency={workspace.currency}
          onGererCatalogue={() => setShowProduits(true)}
        />
      )}

      {vue === "clients" && !accesBloque && (
        <div>
          {clientsARelancer.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a7a3c", marginBottom: 3 }}>🔄 Clients à relancer pour réachat ({clientsARelancer.length})</div>
              <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 8 }}>Basé sur leur rythme d'achat habituel.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientsARelancer.slice(0, 10).map((c, i) => (
                  <a
                    key={i}
                    href={`https://wa.me/${cleanPhoneForWhatsApp(c.tel)}?text=${encodeURIComponent(`Bonjour ${(c.nom || "").split(" ")[0]} 👋, ça faisait un moment ! Seriez-vous intéressé(e) pour recommander chez ${workspace.name} ?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: "4px solid #1a7a3c", borderRadius: 10, padding: "10px 12px", display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nom}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7168" }}>Achète en général tous les {c.intervalleMoyen}j · dernier achat il y a {c.joursDepuisDernier}j</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clients.length === 0 && (
              <EtatVide
                icone="👤"
                titre="Aucun client pour l'instant"
                description="Tes clients apparaissent ici automatiquement dès ta première commande confirmée."
                texteBouton="➕ Créer ma première commande"
                onAction={() => { setVue("commandes"); setShowAdd(true); }}
              />
            )}
            {clients.map((cl, i) => (
              <div key={i} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {i < 3 && cl.montantTotal > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#e8920a", background: "#FBF3E3", padding: "1px 7px", borderRadius: 999 }}>🏆 TOP CLIENT</span>}
                      {cl.joursDeRetard !== null && cl.joursDeRetard >= 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#1a7a3c", background: "#EAF3DE", padding: "1px 7px", borderRadius: 999 }}>🔄</span>}
                      {cl.nom}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7168" }}>{cl.tel} · {cl.zone}</div>
                    <div style={{ fontSize: 11.5, marginTop: 3, display: "flex", gap: 8 }}>
                      <span style={{ color: "#1a7a3c" }}>{cl.confirmees} confirmée{cl.confirmees > 1 ? "s" : ""}</span>
                      {cl.echouees > 0 && <span style={{ color: "#D64933" }}>{cl.echouees} échouée{cl.echouees > 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a7a3c" }}>{cl.montantTotal.toLocaleString("fr-FR")} {workspace.currency}</div>
                    <div style={{ fontSize: 10.5, color: "#8A9089" }}>{cl.total} commande{cl.total > 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <a
                    href={`tel:${cl.tel}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, background: "#FAFAF7", border: "1px solid #ECE8DC", color: "#16231F", borderRadius: 7, padding: "8px 0", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
                  >
                    📞 Appeler
                  </a>
                  <a
                    href={`https://wa.me/${cleanPhoneForWhatsApp(cl.tel)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", borderRadius: 7, padding: "8px 0", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
                  >
                    💬 WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vue === "recovery" && !accesBloque && (
        <RecoveryCenterView
          commandes={commandesRecuperables}
          toutesCommandes={commandes}
          currency={workspace.currency}
          nomEntreprise={workspace.name}
        />
      )}

      {vue === "score_business" && !accesBloque && (
        <ScoreBusinessView
          toutesCommandes={commandes}
          beneficeReel={beneficeReel}
          caConfirme={caConfirme}
          currency={workspace.currency}
          depotsParLivreur={depotsParLivreur}
          rentabiliteParCloser={rentabiliteParCloser}
          rentabiliteParZone={rentabiliteParZone}
          rentabiliteParCampagne={rentabiliteParCampagne}
          workspaceId={workspace.id}
        />
      )}

      {vue === "simulateur" && !accesBloque && (
        <SimulateurCampagneView currency={workspace.currency} />
      )}

      {vue === "rapprochement" && !accesBloque && (
        <RapprochementView workspace={workspace} commandes={commandes} onValide={loadCommandes} />
      )}

      {vue === "compta" && (
        <div>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "#1a7a3c", background: "#EAF3DE", padding: "3px 10px", borderRadius: 999, marginBottom: 12 }}>
            📊 {periodLabel}
          </div>

          <div style={{ fontWeight: 700, fontSize: 13, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
            💰 Tableau de bord financier
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase" }}>Ventes</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#16231F", marginTop: 3 }}>
                {(caConfirme + enCoursInRange.reduce((s, c) => s + Number(c.montant), 0) + echoueesInRange.reduce((s, c) => s + Number(c.montant), 0)).toLocaleString("fr-FR")}
              </div>
            </div>
            <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "#3B6D11", textTransform: "uppercase" }}>✅ Encaissé</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#3B6D11", marginTop: 3 }}>
                {caConfirme.toLocaleString("fr-FR")}
              </div>
            </div>
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "#8A6412", textTransform: "uppercase" }}>🟠 À récupérer</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#8A6412", marginTop: 3 }}>
                {enCoursInRange.reduce((s, c) => s + Number(c.montant), 0).toLocaleString("fr-FR")}
              </div>
            </div>
            <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "#D64933", textTransform: "uppercase" }}>🔴 À risque</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#D64933", marginTop: 3 }}>
                {echoueesInRange.reduce((s, c) => s + Number(c.montant), 0).toLocaleString("fr-FR")}
              </div>
            </div>
          </div>

          <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💰 Bénéfice réel</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 24, color: beneficeReel >= 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 3 }}>
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
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#e8920a", marginTop: 3 }}>{totalCommission.toLocaleString("fr-FR")} {workspace.currency}</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #1a7a3c, #1F9D6E)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)", textTransform: "uppercase" }}>🏦 Dépôt attendu</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "white", marginTop: 3 }}>{totalADeposer.toLocaleString("fr-FR")} {workspace.currency}</div>
            </div>
          </div>

          {livreurs.some((l) => l.en_tournee) && (
            <div style={{ marginBottom: 16 }}>
              <CarteLivreursSaas livreurs={livreurs} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {livreurs.filter((l) => l.en_tournee).map((l) => (
                  <div key={l.id} style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{l.nom}</span>
                    {!l.position_lat && (
                      <span style={{ fontSize: 11.5, color: "#8A9089" }}>Position en attente...</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Détail par livreur</div>
          {depotsParLivreur.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucune livraison confirmée pour l'instant.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {depotsParLivreur.map((l) => (
              <LivreurCarteEcartCaisse key={l.nom} l={l} workspaceId={workspace.id} currency={workspace.currency} />
            ))}
          </div>

          {livreursAvecCommandes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📊 Résumé — commandes reçues par livreur ({periodLabel})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {livreursAvecCommandes.map((l) => (
                  <div key={l.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}><strong>{l.nom}</strong> a reçu</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: "#1a7a3c" }}>{l.total} commande{l.total > 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {repartitionCloserLivreur.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🔄 Répartition Closer → Livreur ({periodLabel})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {repartitionCloserLivreur.map((r, i) => (
                  <RepartitionLigne key={i} r={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      </div>
      </div>

      <div
        className="rv-saas-bottomnav"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "white",
          borderTop: "1px solid #ECE8DC",
          padding: "8px 12px",
          paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
          zIndex: 20,
        }}
      >
        {[
          { key: "aujourdhui", label: "Aujourd'hui", icon: ListChecks },
          { key: "commandes", label: "Commandes", icon: Package },
          ...(workspace.activity_type === "restaurant" ? [{ key: "cuisine", label: "Cuisine", icon: Package }] : []),
          ...(workspace.activity_type === "location_vehicule" ? [{ key: "biens_location", label: "Véhicules", icon: Boxes }] : []),
          ...(workspace.activity_type === "location_immobiliere" ? [{ key: "logements", label: "Logements", icon: Boxes }] : []),
          { key: "clients", label: "Clients", icon: Users },
          ...(estEcommerce && (workspace.role === "owner" || workspace.role === "admin") ? [{ key: "recovery", label: "Récup.", icon: Target }] : []),
          ...(workspace.role === "owner" || workspace.role === "admin" ? [{ key: "compta", label: "Compta", icon: Calculator }] : []),
        ].map((t) => {
          const Icon = t.icon;
          const active = vue === t.key;
          return (
            <button
              key={t.key}
              onClick={() => (t.action ? t.action() : setVue(t.key))}
              style={{
                flex: 1,
                minWidth: 0,
                background: "none",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "6px 0",
                color: active ? "#1a7a3c" : "#8A9089",
                cursor: "pointer",
              }}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {commandeAConfirmerRapide && (
        <div
          onClick={() => setCommandeAConfirmerRapide(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 90 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Comment le client a-t-il payé ?</div>
            <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>{commandeAConfirmerRapide.client} — {Number(commandeAConfirmerRapide.montant).toLocaleString("fr-FR")} {workspace.currency}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "cash", label: "💵 Cash (espèces)" },
                { key: "orange_money", label: "🟠 Orange Money" },
                { key: "wave", label: "🌊 Wave" },
                { key: "mtn_money", label: "🟡 MTN Money" },
                { key: "moov_money", label: "🔵 Moov Money" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => { changerStatutRapide(commandeAConfirmerRapide.id, "confirmee", mode.key); setCommandeAConfirmerRapide(null); }}
                  style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "13px 16px", textAlign: "left", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button onClick={() => setCommandeAConfirmerRapide(null)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#8A9089", fontSize: 13, padding: "8px 0", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {toastNouvellesCommandes && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#16231F", color: "white", padding: "11px 20px", borderRadius: 999, fontSize: 13, fontWeight: 600, zIndex: 90, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
          {toastNouvellesCommandes}
        </div>
      )}

      {toastsAutomatisation.length > 0 && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 90, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          {toastsAutomatisation.map((t) => (
            <div key={t.id} style={{ background: "#8A6412", color: "white", padding: "11px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <span>{t.texte}</span>
              <button onClick={() => setToastsAutomatisation((prev) => prev.filter((x) => x.id !== t.id))} style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      {celebration && <CelebrationOverlaySaas montant={celebration.montant} client={celebration.client} currency={workspace.currency} />}
      {showAdd && <AddCommandeModal onClose={() => setShowAdd(false)} onAdd={addCommande} currency={workspace.currency} activityType={workspace.activity_type} plats={plats} tablesRestaurant={tablesRestaurant} biensLocation={biensLocation} logements={logements} />}
      {showTeam && !accesBloque && <TeamModal workspace={workspace} onClose={() => setShowTeam(false)} />}
      {showRapportSemaine && (
        <RapportSemaineModal
          rapport={rapportSemaine}
          currency={workspace.currency}
          workspaceName={workspace.name}
          onClose={() => setShowRapportSemaine(false)}
        />
      )}
      {showReunion && <ReunionEquipeModal workspace={workspace} onClose={() => setShowReunion(false)} />}
      {showAbonnement && <AbonnementModal workspace={workspace} subscription={subscription} onClose={() => setShowAbonnement(false)} />}
      {showRapportHebdo && <RapportHebdomadaireModal commandes={commandes} currency={workspace.currency} workspaceName={workspace.name} onFermer={() => setShowRapportHebdo(false)} />}
      {showCampagne && <CampagneModalSaas clients={clients} workspace={workspace} onClose={() => setShowCampagne(false)} />}
      {showIntegrations && <IntegrationsModal workspace={workspace} onClose={() => setShowIntegrations(false)} />}
      {showStoreBuilder && !accesBloque && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
          <div style={{ width: "100%", maxWidth: 1200, maxHeight: "94vh", overflowY: "auto" }}>
            <RVStoreBuilder
              workspace={workspace}
              produits={produits}
              onClose={() => setShowStoreBuilder(false)}
              onOuvrirParametresAvances={() => { setShowStoreBuilder(false); setShowIntegrations(true); }}
            />
          </div>
        </div>
      )}
      {showAide && <AideModal onClose={() => setShowAide(false)} />}
      {showBienvenue && <BienvenueModal workspace={workspace} onFermer={fermerBienvenue} onOuvrirAide={() => { fermerBienvenue(); setShowAide(true); }} />}

      {showBatch && (
        <BatchRelanceModalSaas
          orders={[...todoAujourdhui.aRelivrer, ...todoAujourdhui.jamaisContactees, ...todoAujourdhui.sansNouvelles]}
          currency={workspace.currency}
          onClose={() => setShowBatch(false)}
          onLog={async (commandeId, note) => {
            await supabase.from("relances").insert([{ commande_id: commandeId, note }]);
            await loadAllRelances();
          }}
        />
      )}
      {showLivreurs && <EquipeModal titre="Livreurs" items={livreurs} onAdd={addLivreur} onDelete={deleteLivreur} onClose={() => setShowLivreurs(false)} avecEmail produitsRecus={produitsRecusParLivreur} detailParProduit={detailParLivreurEtProduit} commandesParMembre={commandesParLivreur} currency={workspace.currency} />}
      {showClosers && <EquipeModal titre="Closers" items={closers} onAdd={addCloser} onDelete={deleteCloser} onClose={() => setShowClosers(false)} avecEmail produitsRecus={produitsGeresParCloser} detailParProduit={detailParCloserEtProduit} commandesParMembre={commandesParCloser} currency={workspace.currency} />}
      {showProduits && !accesBloque && <ProduitsModal produits={produits} onAdd={addProduit} onUpdateCout={updateProduitCout} onUpdateFraisImport={updateProduitFraisImport} onUpdateStock={updateProduitStock} onUpdatePrixVente={updateProduitPrixVente} onUpdatePhoto={updateProduitPhoto} onUpdateDescription={updateProduitDescription} onUpdateGalerie={updateProduitGalerie} onUpdateLivraisonBundles={updateProduitLivraisonBundles} quantitesParProduit={quantitesParProduit} onDelete={deleteProduit} currency={workspace.currency} workspaceId={workspace.id} onImportCSV={importerProduitsCSV} onClose={() => setShowProduits(false)} />}
      {showAvis && !accesBloque && <AvisModal workspaceId={workspace.id} produits={produits} onClose={() => setShowAvis(false)} />}
      {showProspectsIA && session?.user?.email === "oulipaiexpress@gmail.com" && <ProspectsIAModal onClose={() => setShowProspectsIA(false)} />}
      {showTemoignages && !accesBloque && <TemoignagesModal workspace={workspace} onClose={() => setShowTemoignages(false)} />}
      {showCollections && !accesBloque && <CollectionsModal workspaceId={workspace.id} produits={produits} onClose={() => setShowCollections(false)} />}
      {showAzaliDesign && !accesBloque && <AzaliDesignModal workspace={workspace} onClose={() => setShowAzaliDesign(false)} />}
      {showTraficBoutique && !accesBloque && <TraficBoutiqueModal workspaceId={workspace.id} onClose={() => setShowTraficBoutique(false)} />}
      {showCodesPromo && !accesBloque && <CodesPromoModal workspaceId={workspace.id} currency={workspace.currency} onClose={() => setShowCodesPromo(false)} />}
      {showPaniersAbandonnes && !accesBloque && <PaniersAbandonnesModal workspaceId={workspace.id} currency={workspace.currency} onClose={() => setShowPaniersAbandonnes(false)} />}
    </div>
  );
}

function BoutonMicro({ onResultat, langue = "fr-FR" }) {
  const [ecoute, setEcoute] = useState(false);
  const reconnaissanceRef = useRef(null);

  function demarrer() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La saisie vocale n'est pas disponible sur ce navigateur. Utilise plutôt Chrome.");
      return;
    }
    const reco = new SpeechRecognition();
    reco.lang = langue;
    reco.interimResults = false;
    reco.maxAlternatives = 1;
    reco.onresult = (e) => {
      const texte = e.results?.[0]?.[0]?.transcript;
      if (texte) onResultat(texte);
    };
    reco.onerror = () => setEcoute(false);
    reco.onend = () => setEcoute(false);
    reconnaissanceRef.current = reco;
    try { reco.start(); setEcoute(true); } catch (_) {}
  }

  function arreter() {
    try { reconnaissanceRef.current?.stop(); } catch (_) {}
    setEcoute(false);
  }

  return (
    <button
      type="button"
      onClick={ecoute ? arreter : demarrer}
      title={ecoute ? "Arrêter l'écoute" : "Dicter avec la voix"}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 40, height: "auto", alignSelf: "stretch", borderRadius: 8,
        border: `1px solid ${ecoute ? "#D64933" : "#DDD8CC"}`,
        background: ecoute ? "#FBEAE6" : "white", color: ecoute ? "#D64933" : "#526057",
        cursor: "pointer", fontSize: 16, flexShrink: 0,
        animation: ecoute ? "rvMicPulse 1s ease-in-out infinite" : "none",
      }}
    >
      🎙️
      <style>{`@keyframes rvMicPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </button>
  );
}

function AddCommandeModal({ onClose, onAdd, currency, activityType, plats = [], tablesRestaurant = [], biensLocation = [], logements = [] }) {
  const estRetail = activityType === "retail";
  const estLocation = activityType === "location_immobiliere";
  const estRestaurant = activityType === "restaurant";
  const estLocationVehicule = activityType === "location_vehicule";

  const [bienId, setBienId] = useState("");
  const [nomLocataire, setNomLocataire] = useState("");
  const [telLocataire, setTelLocataire] = useState("");
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState("");
  const [caution, setCaution] = useState("");

  if (estLocationVehicule) {
    const bienChoisi = biensLocation.find((b) => b.id === bienId);
    const nbJours = dateDebut && dateFin ? Math.max(1, Math.round((new Date(dateFin) - new Date(dateDebut)) / (1000 * 60 * 60 * 24)) + 1) : 0;
    const montantTotal = bienChoisi ? nbJours * Number(bienChoisi.prix_jour) : 0;
    const formValide = bienId && nomLocataire.trim() && telLocataire.trim() && dateDebut && dateFin && nbJours > 0;

    function validerLocation() {
      if (!formValide) return;
      onAdd({
        client: nomLocataire.trim(),
        tel: telLocataire.trim(),
        produit: `${bienChoisi.nom} (${nbJours} jour${nbJours > 1 ? "s" : ""})`,
        montant: String(montantTotal),
        zone: "",
        mode_vente: "sur_place",
        montant_paye: "",
        bien_location_id: bienId,
        date_debut_location: dateDebut,
        date_fin_location: dateFin,
        caution: caution ? Number(caution) : null,
      });
    }

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Nouvelle location</div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>

          <select
            value={bienId}
            onChange={(e) => {
              setBienId(e.target.value);
              const b = biensLocation.find((x) => x.id === e.target.value);
              if (b && b.caution_suggeree) setCaution(String(b.caution_suggeree));
            }}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
          >
            <option value="">Choisir un véhicule / matériel...</option>
            {biensLocation.filter((b) => b.disponible).map((b) => (
              <option key={b.id} value={b.id}>{b.nom} — {Number(b.prix_jour).toLocaleString("fr-FR")} {currency}/jour</option>
            ))}
          </select>

          <input placeholder="Nom du client" value={nomLocataire} onChange={(e) => setNomLocataire(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
          <input placeholder="Numéro de téléphone" value={telLocataire} onChange={(e) => setTelLocataire(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: "#8A9089", marginBottom: 4 }}>Début</div>
              <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: "#8A9089", marginBottom: 4 }}>Fin</div>
              <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>

          <input placeholder={`Caution (${currency}, optionnel)`} type="number" value={caution} onChange={(e) => setCaution(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />

          {bienChoisi && nbJours > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #ECE8DC", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{nbJours} jour{nbJours > 1 ? "s" : ""} de location</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: "#1a7a3c" }}>{montantTotal.toLocaleString("fr-FR")} {currency}</span>
            </div>
          )}

          <button
            onClick={validerLocation}
            disabled={!formValide}
            style={{ width: "100%", background: formValide ? "#1a7a3c" : "#DDD8CC", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: formValide ? "pointer" : "default" }}
          >
            Créer la location
          </button>
        </div>
      </div>
    );
  }

  const [tableId, setTableId] = useState("");
  const [typeCommande, setTypeCommande] = useState("sur_place");
  const [quantitesPlats, setQuantitesPlats] = useState({});
  const [nomClient, setNomClient] = useState("");
  const [telClient, setTelClient] = useState("");

  if (estRestaurant) {
    const totalRestaurant = plats.reduce((s, p) => s + (quantitesPlats[p.id] || 0) * Number(p.prix), 0);
    const platsChoisis = plats.filter((p) => (quantitesPlats[p.id] || 0) > 0);
    const resumePlats = platsChoisis.map((p) => `${p.nom} x${quantitesPlats[p.id]}`).join(", ");
    const tableChoisie = tablesRestaurant.find((t) => t.id === tableId);

    function ajusterQuantite(platId, delta) {
      setQuantitesPlats((q) => ({ ...q, [platId]: Math.max(0, (q[platId] || 0) + delta) }));
    }

    function validerCommandeRestaurant() {
      if (platsChoisis.length === 0) return;
      if (typeCommande !== "sur_place" && !telClient.trim()) return;
      onAdd({
        client: typeCommande === "sur_place" ? (tableChoisie ? `Table ${tableChoisie.numero}` : "Client") : (nomClient.trim() || (typeCommande === "emporter" ? "À emporter" : "Livraison")),
        tel: telClient.trim(),
        produit: resumePlats,
        montant: String(totalRestaurant),
        zone: "",
        mode_vente: "sur_place",
        montant_paye: "",
        table_id: tableId || null,
        type_commande: typeCommande,
        statut_cuisine: "nouvelle",
      });
    }

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, maxHeight: "88vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Nouvelle commande</div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[
              { key: "sur_place", label: "🍽️ Sur place" },
              { key: "emporter", label: "🥡 Emporter" },
              { key: "livraison", label: "🚚 Livraison" },
            ].map((t) => (
              <button key={t.key} onClick={() => setTypeCommande(t.key)} style={{ flex: 1, background: typeCommande === t.key ? "#1a7a3c" : "white", color: typeCommande === t.key ? "white" : "#16231F", border: "1px solid #DDD8CC", borderRadius: 8, padding: "8px 0", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                {t.label}
              </button>
            ))}
          </div>

          {typeCommande === "sur_place" ? (
            <select value={tableId} onChange={(e) => setTableId(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}>
              <option value="">Choisir une table...</option>
              {tablesRestaurant.map((t) => (
                <option key={t.id} value={t.id}>Table {t.numero}</option>
              ))}
            </select>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <input placeholder="Nom du client (optionnel)" value={nomClient} onChange={(e) => setNomClient(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
              <input placeholder="Numéro de téléphone (obligatoire)" value={telClient} onChange={(e) => setTelClient(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
              <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 4 }}>Pour appeler le client dès que sa commande est prête.</div>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Sélectionner les plats</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
            {plats.filter((p) => p.disponible).map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF7", borderRadius: 8, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.nom}</div>
                  <div style={{ fontSize: 11, color: "#8A9089" }}>{Number(p.prix).toLocaleString("fr-FR")} {currency}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => ajusterQuantite(p.id, -1)} style={{ width: 26, height: 26, borderRadius: "50%", background: "white", border: "1px solid #DDD8CC", fontSize: 14, cursor: "pointer" }}>−</button>
                  <span style={{ fontWeight: 700, fontSize: 13, minWidth: 16, textAlign: "center" }}>{quantitesPlats[p.id] || 0}</span>
                  <button onClick={() => ajusterQuantite(p.id, 1)} style={{ width: 26, height: 26, borderRadius: "50%", background: "#1a7a3c", color: "white", border: "none", fontSize: 14, cursor: "pointer" }}>+</button>
                </div>
              </div>
            ))}
            {plats.filter((p) => p.disponible).length === 0 && (
              <div style={{ textAlign: "center", color: "#8A9089", fontSize: 12.5, padding: "16px 0" }}>Aucun plat disponible — ajoute ton menu depuis l'écran "Menu".</div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #ECE8DC", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: "#1a7a3c" }}>{totalRestaurant.toLocaleString("fr-FR")} {currency}</span>
          </div>

          <button
            onClick={validerCommandeRestaurant}
            disabled={platsChoisis.length === 0 || (typeCommande !== "sur_place" && !telClient.trim())}
            style={{ width: "100%", background: (platsChoisis.length === 0 || (typeCommande !== "sur_place" && !telClient.trim())) ? "#DDD8CC" : "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: (platsChoisis.length === 0 || (typeCommande !== "sur_place" && !telClient.trim())) ? "default" : "pointer" }}
          >
            Envoyer en cuisine
          </button>
        </div>
      </div>
    );
  }

  const champs = estRetail ? ["client", "tel", "produit", "montant"] : ["client", "tel", "produit", "montant", "zone"];
  const [form, setForm] = useState({ client: "", tel: "", produit: "", montant: "", zone: "", mode_vente: estRetail ? "sur_place" : "livraison", montant_paye: "", ville_expedition: "", frais_expedition_saisi: "", caution: "" });
  const [modeRapide, setModeRapide] = useState(false);
  const [logementId, setLogementId] = useState("");
  function selectionnerLogement(id) {
    setLogementId(id);
    const l = logements.find((x) => x.id === id);
    if (l) setForm((f) => ({ ...f, produit: l.nom, zone: l.adresse || "", montant: String(l.loyer_mensuel), caution: l.caution_suggeree ? String(l.caution_suggeree) : f.caution }));
  }
  const montantValide = Number(form.montant) > 0;
  const canSubmit = form.client.trim() && montantValide;
  const montantPayeValide = form.montant_paye === "" || Number(form.montant_paye) <= Number(form.montant || 0);
  const champsRapides = ["client", "tel", "produit", "montant"];
  const inputRefs = useRef({});

  function focusNext(index) {
    const nextField = champsRapides[index + 1];
    if (nextField && inputRefs.current[nextField]) {
      inputRefs.current[nextField].focus();
    } else if (!nextField) {
      if (form.client.trim() && montantValide) onAdd({ ...form, mode_vente: "sur_place", montant_paye: "" });
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{estRetail ? "Nouvelle vente" : "Nouvelle commande"}</div>
          <button
            onClick={() => setModeRapide(!modeRapide)}
            style={{ background: modeRapide ? "#1a7a3c" : "#EEF0EA", color: modeRapide ? "white" : "#16231F", border: "none", borderRadius: 20, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
          >
            ⚡ Rapide
          </button>
        </div>

        {estLocation && logements.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Choisir un logement (remplit adresse et loyer automatiquement)</div>
            <select value={logementId} onChange={(e) => selectionnerLogement(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", background: "white" }}>
              <option value="">Saisir manuellement...</option>
              {logements.map((l) => (
                <option key={l.id} value={l.id}>{l.nom} — {Number(l.loyer_mensuel).toLocaleString("fr-FR")} {currency}/mois</option>
              ))}
            </select>
          </div>
        )}

        {modeRapide ? (
          <>
            <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 14 }}>Tape, appuie sur Entrée pour passer au champ suivant.</div>
            {champsRapides.map((f, i) => (
              <input
                key={f}
                ref={(el) => (inputRefs.current[f] = el)}
                autoFocus={i === 0}
                placeholder={f === "montant" ? (estLocation ? `Loyer mensuel (${currency})` : `Montant (${currency})`) : f === "produit" ? (estLocation ? "Logement (ex: Appartement 2)" : "Produit") : f === "tel" ? "Téléphone" : (estLocation ? "Nom du locataire" : "Nom du client")}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(i); } }}
                type={f === "montant" ? "number" : "text"}
                min={f === "montant" ? "1" : undefined}
                style={inputStyle}
              />
            ))}
            {form.montant && !montantValide && (
              <div style={{ color: "#D64933", fontSize: 12, marginTop: -6, marginBottom: 10 }}>Le montant doit être supérieur à 0.</div>
            )}
            <button onClick={() => canSubmit && onAdd({ ...form, mode_vente: "sur_place", montant_paye: "" })} disabled={!canSubmit} style={btnStyle}>
              ⚡ Enregistrer
            </button>
          </>
        ) : (
          <>
        {!estRetail && !estLocation && (
          <>
            <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 14 }}>Comment ce colis part-il ?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => setForm({ ...form, mode_vente: "livraison" })}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${form.mode_vente !== "expedition" ? "#1a7a3c" : "#DDD8CC"}`, background: form.mode_vente !== "expedition" ? "#EAF3DE" : "white", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>🏍️ Abidjan</div>
                <div style={{ fontSize: 10.5, color: "#6B7168" }}>Livraison classique</div>
              </button>
              <button
                onClick={() => setForm({ ...form, mode_vente: "expedition" })}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${form.mode_vente === "expedition" ? "#2452E8" : "#DDD8CC"}`, background: form.mode_vente === "expedition" ? "#EAF0FB" : "white", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>📦 Expédition</div>
                <div style={{ fontSize: 10.5, color: "#6B7168" }}>Hors Abidjan</div>
              </button>
            </div>
            {form.mode_vente === "expedition" && (
              <>
                <input
                  placeholder="Ville de destination"
                  value={form.ville_expedition}
                  onChange={(e) => setForm({ ...form, ville_expedition: e.target.value })}
                  style={inputStyle}
                />
                <input
                  placeholder={`Frais d'expédition (${currency})`}
                  type="number"
                  value={form.frais_expedition_saisi}
                  onChange={(e) => setForm({ ...form, frais_expedition_saisi: e.target.value })}
                  style={inputStyle}
                />
                {Number(form.frais_expedition_saisi) > 0 && (
                  <div style={{ fontSize: 11.5, color: "#8A6412", marginTop: -6, marginBottom: 10 }}>
                    + {Number(form.frais_expedition_saisi).toLocaleString("fr-FR")} {currency} de frais ajoutés au montant total
                  </div>
                )}
              </>
            )}
          </>
        )}

        {estRetail && (
          <>
            <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 14 }}>Comment ce produit sort-il du magasin ?</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <button
                onClick={() => setForm({ ...form, mode_vente: "sur_place" })}
                style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `2px solid ${form.mode_vente === "sur_place" ? "#1a7a3c" : "#DDD8CC"}`, background: form.mode_vente === "sur_place" ? "#EAF3DE" : "white", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>🏪 Sur place</div>
                <div style={{ fontSize: 10, color: "#6B7168" }}>Retrait magasin</div>
              </button>
              <button
                onClick={() => setForm({ ...form, mode_vente: "livraison" })}
                style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `2px solid ${form.mode_vente === "livraison" ? "#e8920a" : "#DDD8CC"}`, background: form.mode_vente === "livraison" ? "#FBF3E3" : "white", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>🚚 Livraison</div>
                <div style={{ fontSize: 10, color: "#6B7168" }}>Livreur (Abidjan)</div>
              </button>
              <button
                onClick={() => setForm({ ...form, mode_vente: "expedition" })}
                style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `2px solid ${form.mode_vente === "expedition" ? "#2452E8" : "#DDD8CC"}`, background: form.mode_vente === "expedition" ? "#EAF0FB" : "white", textAlign: "left", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>📦 Expédition</div>
                <div style={{ fontSize: 10, color: "#6B7168" }}>Hors Abidjan</div>
              </button>
            </div>

            {form.mode_vente === "expedition" && (
              <input
                placeholder="Ville de destination"
                value={form.ville_expedition || ""}
                onChange={(e) => setForm({ ...form, ville_expedition: e.target.value })}
                style={inputStyle}
              />
            )}
          </>
        )}

        {champs.map((f) => {
          const champTexteDictable = f === "client" || f === "produit" || f === "zone";
          return (
            <div key={f} style={champTexteDictable ? { display: "flex", gap: 6, marginBottom: 10 } : undefined}>
              <input
                placeholder={f === "montant" ? (estLocation ? `Loyer mensuel (${currency})` : `Montant total (${currency})`) : f === "produit" ? (estLocation ? "Logement (ex: Appartement 2)" : estRetail ? "Produit vendu" : "Produit") : f === "zone" ? (estLocation ? "Adresse du logement" : f) : f === "client" ? (estLocation ? "Nom du locataire" : "Nom du client") : f}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                type={f === "montant" ? "number" : "text"}
                min={f === "montant" ? "1" : undefined}
                style={champTexteDictable ? { ...inputStyle, marginBottom: 0, flex: 1 } : inputStyle}
              />
              {champTexteDictable && (
                <BoutonMicro onResultat={(texte) => setForm((prev) => ({ ...prev, [f]: prev[f] ? prev[f] + " " + texte : texte }))} />
              )}
            </div>
          );
        })}
        {form.montant && !montantValide && (
          <div style={{ color: "#D64933", fontSize: 12, marginTop: -6, marginBottom: 10 }}>Le montant doit être supérieur à 0.</div>
        )}

        {estLocation && (
          <div>
            <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 4 }}>Caution ({currency}, optionnel)</label>
            <input
              value={form.caution}
              onChange={(e) => setForm({ ...form, caution: e.target.value })}
              type="number"
              placeholder="0"
              style={inputStyle}
            />
          </div>
        )}

        {estRetail && (
          <div>
            <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 4 }}>Montant déjà payé (FCFA)</label>
            <input
              value={form.montant_paye}
              onChange={(e) => setForm({ ...form, montant_paye: e.target.value })}
              type="number"
              placeholder={`Laisse vide si payé en entier (${form.montant || 0})`}
              style={inputStyle}
            />
            {!montantPayeValide && (
              <div style={{ color: "#D64933", fontSize: 11.5, marginTop: -6, marginBottom: 10 }}>Le montant payé ne peut pas dépasser le montant total.</div>
            )}
            <div style={{ fontSize: 11, color: "#8A9089", marginTop: -4, marginBottom: 10 }}>
              Laisse vide ou égal au montant total si le client a payé en entier — sinon indique l'acompte reçu.
            </div>
          </div>
        )}

        <button
          onClick={() => {
            if (!canSubmit || !montantPayeValide) return;
            const fraisExp = form.mode_vente === "expedition" ? (Number(form.frais_expedition_saisi) || 0) : 0;
            onAdd({ ...form, montant: (Number(form.montant) || 0) + fraisExp });
          }}
          disabled={!canSubmit || !montantPayeValide}
          style={btnStyle}
        >
          {estRetail ? "Enregistrer la vente" : "Ajouter"}
        </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 14, marginBottom: 10, boxSizing: "border-box" };
const btnStyle = { width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#1a7a3c", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };

function TeamModal({ workspace, onClose, pleinePage }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(null);

  async function loadMembers() {
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch(`/api/team?workspaceId=${workspace.id}`, {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) setError(json.error || "Erreur");
    else setMembers(json.members);
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function retirerMembre(memberUserId, email) {
    if (!window.confirm(`Retirer ${email} de l'équipe ? Cette personne perdra immédiatement l'accès.`)) return;
    setRetraitEnCours(memberUserId);
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
      body: JSON.stringify({ action: "remove", workspaceId: workspace.id, memberUserId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) alert(json.error || "Erreur lors du retrait");
    else await loadMembers();
    setRetraitEnCours(null);
  }

  const roleLabels = { owner: "Propriétaire", admin: "Admin", closer: "Closer", livreur: "Livreur", comptable: "Comptable", rh: "RH (gestion équipe)", secretaire: "Secrétaire" };

  const contenu = (
    <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Équipe</div>
          {!pleinePage && <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>}
        </div>

        <button onClick={() => setShowInvite(true)} style={{ ...btnStyle, marginBottom: 14 }}>
          + Inviter quelqu'un
        </button>

        {error && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        {members === null && !error && <SkeletonListe nombre={3} />}

        {members && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <div key={m.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                  <div style={{ fontSize: 11.5, color: "#6B7168" }}>{m.titre ? `${m.titre} · ${roleLabels[m.role] || m.role}` : (roleLabels[m.role] || m.role)}</div>
                </div>
                {m.role !== "owner" && !(workspace.role === "rh" && (m.role === "admin" || m.role === "rh")) && (
                  <button
                    onClick={() => retirerMembre(m.user_id, m.email)}
                    disabled={retraitEnCours === m.user_id}
                    style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 12.5, flexShrink: 0 }}
                  >
                    {retraitEnCours === m.user_id ? "..." : "🗑️ Retirer"}
                  </button>
                )}
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
    </>
  );

  if (pleinePage) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ background: "#1a7a3c", color: "white", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>RecuVente — {workspace.name} · 👥 Équipe</div>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 480, margin: "24px auto", padding: "0 20px 40px" }}>
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 24 }}>
            {contenu}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "80vh", overflowY: "auto" }}>
        {contenu}
      </div>
    </div>
  );
}

function InviteMemberForm({ workspace, onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("closer");
  const [titre, setTitre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roles = [
    { key: "admin", label: "Admin (Directeur) — tout sauf gérer les boutiques/l'équipe" },
    { key: "secretaire", label: "Secrétaire — Commandes & Clients uniquement" },
    { key: "closer", label: "Closer — ses commandes" },
    { key: "livreur", label: "Livreur — ses livraisons" },
    { key: "comptable", label: "Comptable — lecture financière" },
    { key: "rh", label: "RH — gestion de l'équipe uniquement" },
  ].filter((r) => workspace.role === "owner" || (r.key !== "admin" && r.key !== "rh"));

  async function submit() {
    if (!email || !password) {
      setError("Remplis email et mot de passe.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "invite", workspaceId: workspace.id, email, password, role, titre: titre.trim() || null }),
      });
      const json = await res.json().catch(() => ({ error: `Réponse invalide du serveur (code ${res.status})` }));
      if (!res.ok) setError(json.error || `Erreur (${res.status})`);
      else {
        if (json.compteExistant) {
          alert(`✅ ${email} avait déjà un compte — il/elle a été ajouté(e) à ton équipe avec son mot de passe habituel (le mot de passe que tu as tapé n'a pas été utilisé).`);
        }
        onInvited();
      }
    } catch (e) {
      setError("Erreur réseau: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 55 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Inviter quelqu'un</div>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input placeholder="Mot de passe temporaire" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Titre (optionnel — ex: CEO, Directeur Général, RH, Secrétaire...)</div>
        <input placeholder="Ex: Directeur Général" value={titre} onChange={(e) => setTitre(e.target.value)} list="rv-titres-suggeres" style={inputStyle} />
        <datalist id="rv-titres-suggeres">
          <option value="CEO" />
          <option value="Directeur Général" />
          <option value="Ressources Humaines" />
          <option value="Secrétaire" />
          <option value="Responsable Ventes" />
        </datalist>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 6 }}>Droits d'accès (rôle système)</div>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, background: "white" }}>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 11, color: "#8A9089", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>Le titre est juste un libellé affiché. Ce sont les droits d'accès ci-dessus qui déterminent ce que cette personne peut voir et faire.</div>
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
  const [recherche, setRecherche] = useState("");
  const [actionEnCours, setActionEnCours] = useState(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  async function exporterSauvegarde() {
    setExportEnCours(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/backup-export", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Erreur lors de l'export");
        setExportEnCours(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recuvente-saas-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erreur: " + e.message);
    }
    setExportEnCours(false);
  }

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/admin-panel", {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      setDebug(json.debug || "");
    } else setData(json);
  }

  async function toggleStatus(workspaceId, action) {
    setActionEnCours(workspaceId);
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/admin-panel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
      body: JSON.stringify({ workspaceId, action }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) alert(json.error || "Erreur");
    else await load();
    setActionEnCours(null);
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
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22 }}>Admin RecuVente</div>
        <a href="?" style={{ fontSize: 12.5, color: "#1a7a3c", textDecoration: "underline" }}>← Mon espace</a>
      </div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 12 }}>Connecté en tant que {session.user.email}</div>

      <button
        onClick={exporterSauvegarde}
        disabled={exportEnCours}
        style={{ background: "#16231F", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 20 }}
      >
        {exportEnCours ? "Export en cours..." : "💾 Télécharger une sauvegarde complète"}
      </button>

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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Toutes les entreprises</div>
        <input
          type="text"
          placeholder="Rechercher..."
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, width: 160 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.workspaces
          .filter((ws) => !recherche.trim() || ws.name.toLowerCase().includes(recherche.toLowerCase()) || ws.ownerEmail.toLowerCase().includes(recherche.toLowerCase()))
          .map((ws) => {
            const suspendu = ws.subscription?.status === "suspended";
            const enEssai = ws.subscription?.status === "trial";
            let joursRestants = null;
            let essaiExpire = false;
            if (enEssai && ws.subscription?.trial_ends_at) {
              const finEssai = new Date(ws.subscription.trial_ends_at);
              joursRestants = Math.floor((finEssai - new Date()) / 86400000);
              essaiExpire = joursRestants < 0;
            }
            return (
              <div key={ws.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7168" }}>{ws.ownerEmail} · {ws.nbMembres} membre{ws.nbMembres > 1 ? "s" : ""} · {ws.country}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {ws.subscription ? statusLabels[ws.subscription.status] || ws.subscription.status : "—"}
                    </div>
                    {enEssai && joursRestants !== null && (
                      <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 2, color: essaiExpire ? "#D64933" : joursRestants <= 2 ? "#8A6412" : "#8A9089" }}>
                        {essaiExpire ? "⏰ Essai terminé" : `${joursRestants} jour${joursRestants > 1 ? "s" : ""} restant${joursRestants > 1 ? "s" : ""}`}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {ws.whatsappNumber && (
                    <a
                      href={`https://wa.me/${cleanPhoneForWhatsApp(ws.whatsappNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: "#EAF3DE", color: "#3B6D11", border: "1px solid #C7DDA3", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, textDecoration: "none" }}
                    >
                      💬 WhatsApp
                    </a>
                  )}
                  {ws.subscription && (
                    <button
                      onClick={() => toggleStatus(ws.id, suspendu ? "reactiver" : "suspendre")}
                      disabled={actionEnCours === ws.id}
                      style={{ background: suspendu ? "#1a7a3c" : "#FBEAE6", color: suspendu ? "white" : "#D64933", border: suspendu ? "none" : "1px solid #F0B8AC", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      {actionEnCours === ws.id ? "..." : suspendu ? "✅ Réactiver" : "🔒 Suspendre"}
                    </button>
                  )}
                  {ws.subscription && essaiExpire && (
                    <button
                      onClick={() => toggleStatus(ws.id, "reactiver")}
                      disabled={actionEnCours === ws.id}
                      style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      {actionEnCours === ws.id ? "..." : "✅ Activer l'accès"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm(`Supprimer définitivement "${ws.name}" ?\n\nToutes ses commandes, clients et données seront perdues pour toujours. Cette action est IRRÉVERSIBLE.`)) {
                        if (window.confirm(`Dernière confirmation — es-tu vraiment sûr de vouloir supprimer "${ws.name}" ?`)) {
                          toggleStatus(ws.id, "supprimer");
                        }
                      }
                    }}
                    disabled={actionEnCours === ws.id}
                    style={{ background: "white", color: "#8A9089", border: "1px solid #DDD8CC", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        {data.workspaces.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucune entreprise inscrite pour l'instant.</div>}
      </div>
    </div>
  );
}

function TraficBoutiqueModal({ workspaceId, onClose }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    supabase.rpc("statistiques_visites", { p_workspace_id: workspaceId }).then(({ data }) => {
      setStats(data?.[0] || { aujourd_hui: 0, sept_jours: 0, trente_jours: 0, par_source: {} });
    });
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>📊 Trafic de ma boutique</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 18, lineHeight: 1.5 }}>
          Nombre de fois où ta boutique publique a été ouverte — utile pour voir si une publicité envoie vraiment du monde.
        </div>

        {stats === null && <SkeletonListe nombre={2} />}

        {stats !== null && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
              <div style={{ background: "#EAF3DE", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#3B6D11", textTransform: "uppercase", fontWeight: 700 }}>Aujourd'hui</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 22, color: "#3B6D11", marginTop: 4 }}>{stats.aujourd_hui}</div>
              </div>
              <div style={{ background: "#EAF0FB", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#1E4B8C", textTransform: "uppercase", fontWeight: 700 }}>7 jours</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 22, color: "#1E4B8C", marginTop: 4 }}>{stats.sept_jours}</div>
              </div>
              <div style={{ background: "#FBF3E3", borderRadius: 12, padding: "14px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#8A6412", textTransform: "uppercase", fontWeight: 700 }}>30 jours</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 22, color: "#8A6412", marginTop: 4 }}>{stats.trente_jours}</div>
              </div>
            </div>

            {stats.par_source && Object.keys(stats.par_source).length > 0 ? (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#344239", marginBottom: 8, textTransform: "uppercase" }}>D'où viennent tes visiteurs (30 derniers jours)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(stats.par_source).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                    <div key={source} style={{ display: "flex", justifyContent: "space-between", background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 8, padding: "8px 12px" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{source}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1a7a3c" }}>{count}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 10, lineHeight: 1.5 }}>
                  💡 Pour voir d'où viennent tes visiteurs, ajoute <code>?utm_source=facebook</code> (ou "whatsapp", "instagram"...) à la fin du lien de ta boutique quand tu le partages dans une publicité.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "#8A9089", lineHeight: 1.6 }}>
                Aucune source détectée pour l'instant — les visites "Direct / inconnu" viennent de liens partagés sans suivi. Ajoute <code>?utm_source=facebook</code> à la fin de ton lien pour suivre une pub précise.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AbonnementModal({ workspace, subscription, onClose }) {
  const [plans, setPlans] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(null);
  const [message, setMessage] = useState("");
  const [exportEnCours, setExportEnCours] = useState(false);
  const [planEnAttenteInfos, setPlanEnAttenteInfos] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  async function exporterMesDonnees() {
    setExportEnCours(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`/api/export-my-data?workspaceId=${workspace.id}`, {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Erreur lors de l'export");
        setExportEnCours(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspace.name}-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erreur: " + e.message);
    }
    setExportEnCours(false);
  }

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

  function demander(planId) {
    setPlanEnAttenteInfos(planId);
  }

  async function confirmerEtPayer() {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setMessage("Remplis ton prénom, nom et téléphone pour continuer.");
      return;
    }
    const chiffresTelephone = phone.replace(/\D/g, "");
    if (chiffresTelephone.length < 10) {
      setMessage("Le numéro de téléphone semble incomplet (10 chiffres attendus, ex: 0708090910). Vérifie-le et réessaie.");
      return;
    }
    const planId = planEnAttenteInfos;
    setLoading(planId);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/chariow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ planId, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() }),
      });

      const texteBrut = await res.text();
      let json;
      try {
        json = JSON.parse(texteBrut);
      } catch {
        json = null;
      }

      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }

      const detailErreur = json?.error || texteBrut.slice(0, 200) || "aucun détail";
      console.error("Erreur paiement Chariow — statut:", res.status, "contenu:", texteBrut);
      setMessage(`⚠️ Échec (code ${res.status}) : ${detailErreur}. Bascule sur le système manuel.`);

      await supabase.from("upgrade_requests").update({ statut: "annule" }).eq("workspace_id", workspace.id).eq("statut", "en_attente");
      await supabase.from("upgrade_requests").insert([{ workspace_id: workspace.id, plan_id: planId }]);
      await load();
      setPlanEnAttenteInfos(null);
    } catch (e) {
      setMessage("Erreur réseau: " + e.message);
    }
    setLoading(null);
  }

  const planActuel = subscription?.subscription_plans?.nom;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Mon abonnement</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {planEnAttenteInfos ? (
          <div>
            <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 14 }}>
              Quelques infos nécessaires pour le paiement en ligne.
            </div>
            <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
            <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
            <input placeholder="Téléphone (ex: 0708090910)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            {message && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{message}</div>}
            <button onClick={confirmerEtPayer} disabled={loading === planEnAttenteInfos} style={btnStyle}>
              {loading === planEnAttenteInfos ? "..." : "Continuer vers le paiement"}
            </button>
            <button
              onClick={() => setPlanEnAttenteInfos(null)}
              style={{ width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 10, border: "1px solid #DDD8CC", background: "white", color: "#6B7168", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              ← Retour
            </button>
          </div>
        ) : (
        <>
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
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#1a7a3c", marginTop: 3 }}>
                {Number(p.prix).toLocaleString("fr-FR")} {p.devise}<span style={{ fontSize: 11, color: "#8A9089", fontWeight: 400 }}>/mois</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 4 }}>
                {p.max_commandes_mois ? `${p.max_commandes_mois} commandes/mois` : "Commandes illimitées"} · {p.max_membres ? `${p.max_membres} membres max` : "Membres illimités"}
              </div>
              <button
                onClick={() => demander(p.id)}
                disabled={loading === p.id || demandeEnAttente?.plan_id === p.id}
                style={{ width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 8, border: "none", background: p.nom === planActuel ? "#DDD8CC" : "#1a7a3c", color: "white", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                {loading === p.id ? "..." : demandeEnAttente?.plan_id === p.id ? "⏳ En attente" : p.nom === planActuel ? "Plan actuel" : "Demander ce plan"}
              </button>
            </div>
          ))}
        </div>

        {demandes.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0EEE6" }}>
            <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", marginBottom: 8 }}>Historique</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {demandes.map((d) => {
                const statutInfo = {
                  en_attente: { label: "⏳ En attente", couleur: "#8A6412", fond: "#FBF3E3" },
                  confirmee: { label: "✅ Confirmé", couleur: "#3B6D11", fond: "#EAF3DE" },
                  refuse: { label: "❌ Refusé", couleur: "#B23A22", fond: "#FBEAE6" },
                  annule: { label: "Remplacée par une autre demande", couleur: "#8A9089", fond: "#FAFAF7" },
                }[d.statut] || { label: d.statut, couleur: "#6B7168", fond: "#FAFAF7" };
                return (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "8px 10px", background: "#FAFAF7", borderRadius: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{d.subscription_plans?.nom || "Plan"}</div>
                      <div style={{ fontSize: 11, color: "#8A9089" }}>{new Date(d.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: statutInfo.couleur, background: statutInfo.fond, padding: "3px 9px", borderRadius: 999 }}>
                      {statutInfo.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0EEE6" }}>
          <button
            onClick={exporterMesDonnees}
            disabled={exportEnCours}
            style={{ width: "100%", background: "#FAFAF7", border: "1px solid #DDD8CC", color: "#16231F", padding: "10px 0", borderRadius: 10, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
          >
            {exportEnCours ? "Export en cours..." : "💾 Télécharger toutes mes données"}
          </button>
          <div style={{ fontSize: 11, color: "#8A9089", marginTop: 6, textAlign: "center" }}>
            Commandes, clients, équipe — au format que tu peux garder.
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function DemandeCard({ demande, onConfirmed }) {
  const [loading, setLoading] = useState(false);

  async function confirmer() {
    const confirme = window.confirm(
      `⚠️ Confirmes-tu avoir reçu ${Number(demande.subscription_plans?.prix).toLocaleString("fr-FR")} ${demande.subscription_plans?.devise} de la part de "${demande.workspaceName}" ?\n\nCette demande apparaît uniquement parce que le paiement automatique (Chariow) a échoué pour ce client. Ne clique "OK" que si tu as vraiment reçu l'argent (Mobile Money, virement, etc.) — sinon annule et vérifie d'abord avec le client.`
    );
    if (!confirme) return;
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
  retournee: { label: "Retournée", color: "#8A6412", bg: "#FBF3E3" },
};

function CommandeCard({ commande, currency, onStatusChanged, livreurs = [], closers = [], onAssignLivreur, onAssignCloser, onReschedule, workspace, confirmateurNom, onCelebrate, onRendreCaution }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAppel, setShowAppel] = useState(false);
  const [dateRappelChoisie, setDateRappelChoisie] = useState("");
  const [showPaiement, setShowPaiement] = useState(false);
  const [showRetourForm, setShowRetourForm] = useState(false);
  const [motifRetour, setMotifRetour] = useState("");
  const [montantRembourseInput, setMontantRembourseInput] = useState("");
  const [form, setForm] = useState({ client: commande.client, tel: commande.tel, produit: commande.produit, montant: commande.montant, zone: commande.zone, mode_vente: commande.mode_vente || "sur_place", montant_paye: commande.montant_paye ?? "", ville_expedition: commande.ville_expedition || "" });
  const s = STATUTS[commande.statut] || STATUTS.en_cours;

  async function enregistrerInfos() {
    setLoading(true);
    const infos = { client: form.client, tel: form.tel, produit: form.produit, montant: Number(form.montant), zone: form.zone, mode_vente: form.mode_vente, montant_paye: Number(form.montant_paye) || 0, ville_expedition: form.ville_expedition || null };
    const { error } = await supabase.from("commandes").update(infos).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([{ commande_id: commande.id, note: "✏️ Informations modifiées" }]);
      await onStatusChanged();
      setEditing(false);
    }
    setLoading(false);
  }

  async function changerStatut(nouveauStatut) {
    if (nouveauStatut === "confirmee" && workspace?.activity_type === "retail" && Number(commande.montant_paye || 0) < Number(commande.montant)) {
      alert("⛔ Impossible de confirmer : le solde n'est pas entièrement payé.");
      return;
    }
    setLoading(true);
    const ancienStatut = commande.statut;
    const vraimentRecuperee = nouveauStatut === "confirmee" && ancienStatut === "echouee";
    const infosValidation = nouveauStatut === "confirmee" ? { confirmed_at: new Date().toISOString(), confirmed_by: confirmateurNom || "Admin" } : {};
    const { error } = await supabase.from("commandes").update({ statut: nouveauStatut, ...infosValidation }).eq("id", commande.id);
    if (workspace?.id) {
      supabase.from("journal_audit").insert([{
        workspace_id: workspace.id,
        action: `Commande → ${nouveauStatut}`,
        details: `${commande.client} — ${commande.montant} ${currency}`,
        effectue_par: confirmateurNom || "Admin",
      }]).then(({ error: erreurAudit }) => {
        if (erreurAudit) console.error("Erreur journal d'audit:", erreurAudit.message);
      });
    }
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([
        { commande_id: commande.id, note: `📋 Statut : ${STATUTS[ancienStatut]?.label || ancienStatut} → ${STATUTS[nouveauStatut]?.label || nouveauStatut}${nouveauStatut === "confirmee" ? ` par ${confirmateurNom || "Admin"}` : ""}` },
      ]);
      if (nouveauStatut === "confirmee") {
        supabase.auth.getSession().then(({ data: sessionData }) => {
          fetch("/api/facebook-capi", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
            body: JSON.stringify({ commandeId: commande.id }),
          }).catch(() => {}); // silencieux — ne bloque jamais la confirmation si Facebook échoue
        });
      }
      await onStatusChanged();
      if (vraimentRecuperee && onCelebrate) onCelebrate(commande.montant, commande.client);
    }
    setLoading(false);
    setOpen(false);
  }

  async function marquerRetour(motif, montantRembourse) {
    setLoading(true);
    const { error } = await supabase.from("commandes").update({
      statut: "retournee",
      motif_retour: motif || null,
      date_retour: new Date().toISOString(),
      montant_rembourse: montantRembourse === "" || montantRembourse == null ? null : Number(montantRembourse),
    }).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([
        { commande_id: commande.id, note: `↩️ Commande marquée comme retournée${motif ? ` — ${motif}` : ""}${montantRembourse ? ` (${Number(montantRembourse).toLocaleString("fr-FR")} ${currency} remboursés)` : ""}` },
      ]);
      if (workspace?.id) {
        supabase.from("journal_audit").insert([{
          workspace_id: workspace.id,
          action: "Commande → retournée",
          details: `${commande.client} — ${commande.montant} ${currency}${motif ? ` — ${motif}` : ""}`,
          effectue_par: confirmateurNom || "Admin",
        }]);
      }
      await onStatusChanged();
    }
    setLoading(false);
    setOpen(false);
  }

  async function enregistrerPaiement() {
    const montant = prompt("Montant reçu maintenant (FCFA) :");
    if (!montant || Number(montant) <= 0) return;
    const nouveauMontantPaye = Number(commande.montant_paye || 0) + Number(montant);
    setLoading(true);
    const { error } = await supabase.from("commandes").update({ montant_paye: nouveauMontantPaye }).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([{ commande_id: commande.id, note: `💰 Paiement reçu : ${Number(montant).toLocaleString("fr-FR")} FCFA (total payé : ${nouveauMontantPaye.toLocaleString("fr-FR")})` }]);
      await onStatusChanged();
    }
    setLoading(false);
  }

  async function confirmerDepotRecu() {
    setLoading(true);
    const { error } = await supabase.from("commandes").update({ depot_recu_closer: true }).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([{ commande_id: commande.id, note: `📦 Dépôt reçu du client, colis prêt pour expédition${commande.ville_expedition ? ` vers ${commande.ville_expedition}` : ""}` }]);
      await onStatusChanged();
    }
    setLoading(false);
  }

  async function marquerAExpedier() {
    const ville = prompt("Vers quelle ville faut-il expédier ce colis ?");
    if (ville === null) return;
    setLoading(true);
    const { error } = await supabase.from("commandes").update({ mode_vente: "expedition", ville_expedition: ville.trim() || null }).eq("id", commande.id);
    if (error) {
      alert("Erreur: " + error.message);
    } else {
      await supabase.from("relances").insert([{ commande_id: commande.id, note: `📦 Commande marquée à expédier${ville.trim() ? ` vers ${ville.trim()}` : ""}` }]);
      await onStatusChanged();
    }
    setLoading(false);
  }

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${s.color}`, borderRadius: 10, padding: "12px 14px" }}>
      {editing ? (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Modifier la commande</div>
          {["client", "tel", "produit", "montant", "zone"].map((f) => (
            <input
              key={f}
              placeholder={f === "montant" ? `Montant (${currency})` : f}
              value={form[f]}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              type={f === "montant" ? "number" : "text"}
              style={{ ...inputStyle, marginBottom: 6, padding: "7px 9px", fontSize: 13 }}
            />
          ))}
          {workspace?.activity_type === "retail" && (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button
                  onClick={() => setForm({ ...form, mode_vente: "sur_place" })}
                  style={{ flex: 1, padding: "7px 4px", borderRadius: 7, border: `1px solid ${form.mode_vente === "sur_place" ? "#1a7a3c" : "#DDD8CC"}`, background: form.mode_vente === "sur_place" ? "#EAF3DE" : "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  🏪 Sur place
                </button>
                <button
                  onClick={() => setForm({ ...form, mode_vente: "livraison" })}
                  style={{ flex: 1, padding: "7px 4px", borderRadius: 7, border: `1px solid ${form.mode_vente === "livraison" ? "#e8920a" : "#DDD8CC"}`, background: form.mode_vente === "livraison" ? "#FBF3E3" : "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  🚚 Livraison
                </button>
                <button
                  onClick={() => setForm({ ...form, mode_vente: "expedition" })}
                  style={{ flex: 1, padding: "7px 4px", borderRadius: 7, border: `1px solid ${form.mode_vente === "expedition" ? "#2452E8" : "#DDD8CC"}`, background: form.mode_vente === "expedition" ? "#EAF0FB" : "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  📦 Expédition
                </button>
              </div>
              {form.mode_vente === "expedition" && (
                <input
                  placeholder="Ville de destination"
                  value={form.ville_expedition || ""}
                  onChange={(e) => setForm({ ...form, ville_expedition: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 6, padding: "7px 9px", fontSize: 13 }}
                />
              )}
              <input
                placeholder="Montant payé"
                value={form.montant_paye}
                onChange={(e) => setForm({ ...form, montant_paye: e.target.value })}
                type="number"
                style={{ ...inputStyle, marginBottom: 6, padding: "7px 9px", fontSize: 13 }}
              />
            </>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button onClick={enregistrerInfos} disabled={loading} style={{ flex: 1, background: "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
              {loading ? "..." : "Enregistrer"}
            </button>
            <button onClick={() => setEditing(false)} style={{ flex: 1, background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 7, padding: "8px 0", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
      <>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{commande.client}</div>
          <div style={{ fontSize: 12, color: "#6B7168" }}>
            {commande.produit}
            {workspace?.activity_type === "restaurant" ? "" : ` · ${commande.zone}`}
          </div>
          {workspace?.activity_type === "restaurant" && (
            <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 2 }}>
              {commande.type_commande === "sur_place" ? "🍽️ Sur place" : commande.type_commande === "emporter" ? "🥡 À emporter" : commande.type_commande === "livraison" ? "🚚 Livraison" : ""}
              {commande.statut_cuisine && ` · ${{ nouvelle: "🆕 Nouvelle", en_preparation: "🔥 En préparation", prete: "✅ Prête", servie: "🍽️ Servie" }[commande.statut_cuisine] || ""}`}
            </div>
          )}
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
            {commande.statut === "confirmee" && commande.confirmed_by && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "#1a7a3c", background: "#EAF3DE", padding: "2px 8px", borderRadius: 999 }}>✅ validé par {commande.confirmed_by}</span>
            )}
            {workspace?.activity_type === "retail" && commande.statut === "en_cours" && Number(commande.montant_paye || 0) < Number(commande.montant) && (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "#B23A22", background: "#FBEAE6", padding: "2px 8px", borderRadius: 999 }}>
                💰 Solde : {(Number(commande.montant) - Number(commande.montant_paye || 0)).toLocaleString("fr-FR")} {currency}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{Number(commande.montant).toLocaleString("fr-FR")} {currency}</div>
          <div style={{ fontSize: 10, color: "#8A9089", marginTop: 3, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
            Facture, WhatsApp... <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {!open && commande.statut !== "confirmee" && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => changerStatut("confirmee")}
            disabled={loading}
            style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ✅ Confirmer
          </button>
          <button
            onClick={() => changerStatut("echouee")}
            disabled={loading || commande.statut === "echouee"}
            style={{ flex: 1, background: commande.statut === "echouee" ? "#F0EEE6" : "#D64933", color: commande.statut === "echouee" ? "#8A9089" : "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: commande.statut === "echouee" ? "default" : "pointer" }}
          >
            ❌ Échoué
          </button>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0EEE6" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(STATUTS).filter(([key]) => key !== "retournee").map(([key, val]) => (
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

          {workspace?.activity_type === "retail" && Number(commande.montant_paye || 0) < Number(commande.montant) && (
            <button
              onClick={enregistrerPaiement}
              disabled={loading}
              style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10 }}
            >
              💰 Enregistrer un paiement (solde : {(Number(commande.montant) - Number(commande.montant_paye || 0)).toLocaleString("fr-FR")} {currency})
            </button>
          )}

          {commande.statut === "confirmee" && (
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              {!showRetourForm ? (
                <button
                  onClick={() => setShowRetourForm(true)}
                  style={{ width: "100%", background: "white", border: "1px solid #8A6412", color: "#8A6412", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                >
                  ↩️ Marquer comme retournée
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8A6412", marginBottom: 8 }}>↩️ Enregistrer un retour</div>
                  <input
                    placeholder="Motif du retour (ex: produit défectueux)"
                    value={motifRetour}
                    onChange={(e) => setMotifRetour(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 6, boxSizing: "border-box" }}
                  />
                  <input
                    type="number"
                    placeholder={`Montant remboursé (${currency}, optionnel)`}
                    value={montantRembourseInput}
                    onChange={(e) => setMontantRembourseInput(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 8, boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => marquerRetour(motifRetour, montantRembourseInput)}
                      disabled={loading}
                      style={{ flex: 1, background: "#8A6412", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      Confirmer le retour
                    </button>
                    <button
                      onClick={() => setShowRetourForm(false)}
                      style={{ background: "white", border: "1px solid #DDD8CC", color: "#6B7168", borderRadius: 7, padding: "8px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                    >
                      Annuler
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {commande.statut === "retournee" && (
            <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 12, color: "#8A6412", lineHeight: 1.6 }}>
              ↩️ Retournée le {commande.date_retour ? new Date(commande.date_retour).toLocaleDateString("fr-FR") : "—"}
              {commande.motif_retour && <><br/>Motif : {commande.motif_retour}</>}
              {commande.montant_rembourse != null && <><br/>Remboursé : {Number(commande.montant_rembourse).toLocaleString("fr-FR")} {currency}</>}
            </div>
          )}

          {(workspace?.activity_type === "location_vehicule" || workspace?.activity_type === "location_immobiliere") && commande.caution > 0 && (
            <div style={{ background: commande.caution_rendue ? "#EAF7F1" : "#FBF3E3", border: `1px solid ${commande.caution_rendue ? "#B9E3CE" : "#F0DDA8"}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: commande.caution_rendue ? "#1F9D6E" : "#8A6412", marginBottom: commande.caution_rendue ? 0 : 8 }}>
                🔒 Caution : {Number(commande.caution).toLocaleString("fr-FR")} {currency} {commande.caution_rendue ? "— ✅ Rendue au client" : "— retenue par toi pour l'instant"}
              </div>
              {!commande.caution_rendue && (
                <button
                  onClick={() => onRendreCaution && onRendreCaution(commande.id)}
                  disabled={loading}
                  style={{ width: "100%", background: "white", border: "1px solid #8A6412", color: "#8A6412", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >
                  ✅ Marquer la caution comme rendue
                </button>
              )}
            </div>
          )}

          {commande.mode_vente !== "expedition" && commande.statut !== "confirmee" && (
            <button
              onClick={marquerAExpedier}
              disabled={loading}
              style={{ width: "100%", background: "white", border: "1px solid #2452E8", color: "#2452E8", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}
            >
              📦 Marquer à expédier (hors Abidjan)
            </button>
          )}

          {commande.mode_vente === "expedition" && (
            <>
              {!commande.depot_recu_closer ? (
                <button
                  onClick={confirmerDepotRecu}
                  disabled={loading}
                  style={{ width: "100%", background: "#2452E8", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10 }}
                >
                  📦 Confirmer dépôt reçu du client{commande.ville_expedition ? ` (→ ${commande.ville_expedition})` : ""}
                </button>
              ) : (
                <div style={{ background: "#EAF0FB", border: "1px solid #C3D4F0", borderRadius: 8, padding: "9px 12px", marginBottom: 10, fontSize: 12, color: "#1E4B8C", fontWeight: 600 }}>
                  ✅ Dépôt reçu — colis remis au livreur pour {commande.ville_expedition || "expédition"}
                </div>
              )}

              {commande.photo_recu_expedition && (
                <>
                  <img
                    src={commande.photo_recu_expedition}
                    alt="Reçu d'expédition"
                    style={{ width: "100%", borderRadius: 8, marginBottom: 8, border: "1px solid #ECE8DC" }}
                  />
                  <a
                    href={`https://wa.me/${cleanPhoneForWhatsApp(commande.tel)}?text=${encodeURIComponent(`Bonjour ${(commande.client || "").split(" ")[0]} 👋, voici votre reçu d'expédition pour retirer votre colis à ${commande.ville_expedition || "destination"} :\n\n${commande.photo_recu_expedition}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", textAlign: "center", width: "100%", background: "#1F9D6E", color: "white", padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 10, textDecoration: "none", boxSizing: "border-box" }}
                  >
                    💬 Envoyer le reçu au client (WhatsApp)
                  </a>
                </>
              )}
            </>
          )}

          {(livreurs.length > 0 || closers.length > 0) && (
            <div style={{ display: "flex", gap: 8 }}>
              {livreurs.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10.5, color: "#8A9089", display: "block", marginBottom: 3 }}>Livreur</label>
                  <select
                    value={commande.livreur || ""}
                    onChange={(e) => onAssignLivreur(commande.id, e.target.value, confirmateurNom)}
                    style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12, background: "white" }}
                  >
                    <option value="">Non assigné</option>
                    {livreurs.map((l) => (
                      <option key={l.id} value={l.nom}>{l.nom}</option>
                    ))}
                  </select>
                  {commande.livreur && commande.livreur_assigne_par && (
                    <div style={{ fontSize: 10, color: "#8A9089", marginTop: 3 }}>Attribué par {commande.livreur_assigne_par}</div>
                  )}
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

          {workspace && (
            <>
              {commande.statut !== "confirmee" ? (
                <a
                  href={`https://wa.me/${cleanPhoneForWhatsApp(commande.tel)}?text=${encodeURIComponent(`Bonjour ${(commande.client || "").split(" ")[0]} 👋, suivez votre commande en direct ici : ${window.location.origin}/?suivi=${commande.id}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block", textAlign: "center", width: "100%", background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: "pointer", marginBottom: 8, textDecoration: "none", boxSizing: "border-box" }}
                >
                  🔗 Envoyer le lien de suivi
                </a>
              ) : (
                <a
                  href={`https://wa.me/${cleanPhoneForWhatsApp(commande.tel)}?text=${encodeURIComponent(`Bonjour ${(commande.client || "").split(" ")[0]} 🙏, merci d'avoir commandé chez ${workspace.name} !\n\n🧾 Reçu de votre commande\nProduit : ${commande.produit}\nMontant : ${Number(commande.montant).toLocaleString("fr-FR")} ${workspace.currency}\nDate : ${new Date(commande.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}\n\nVotre colis vous a été livré avec succès ✅\n\nMerci pour votre confiance, à très bientôt ! 💚`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block", textAlign: "center", width: "100%", background: "linear-gradient(135deg, #e8920a, #f0b94a)", color: "white", padding: "10px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 8, textDecoration: "none", boxSizing: "border-box" }}
                >
                  🙏 Message de remerciement + reçu
                </a>
              )}

              {workspace.activity_type === "location_immobiliere" && commande.statut === "confirmee" && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Créer le loyer du mois prochain pour ${commande.client} (${commande.produit}) — même montant, même infos ?`)) return;
                    await supabase.from("commandes").insert([{
                      workspace_id: workspace.id,
                      client: commande.client,
                      tel: commande.tel,
                      produit: commande.produit,
                      montant: commande.montant,
                      zone: commande.zone,
                      statut: "en_cours",
                    }]);
                    await onStatusChanged();
                  }}
                  style={{ width: "100%", background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 8 }}
                >
                  🔄 Générer le loyer du mois prochain
                </button>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button
                  onClick={() => genererFacturePDF(commande, workspace)}
                  style={{ flex: 1, background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                >
                  🧾 Facture PDF
                </button>
                <a
                  href={`https://wa.me/${cleanPhoneForWhatsApp(commande.tel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer", textDecoration: "none", textAlign: "center" }}
                >
                  💬 Ouvrir WhatsApp du client
                </a>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <a
                  href={`https://wa.me/${cleanPhoneForWhatsApp(commande.tel)}?text=${encodeURIComponent(`Bonjour ${(commande.client || "").split(" ")[0]} 👋, nous confirmons votre commande "${commande.produit}" (${Number(commande.montant).toLocaleString("fr-FR")} ${workspace.currency}). Un livreur passera bientôt.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#1F9D6E", color: "white", padding: "10px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, textDecoration: "none" }}
                >
                  💬 Envoyer confirmation
                </a>
                <a
                  href={`sms:${commande.tel}?body=${encodeURIComponent(`Bonjour ${(commande.client || "").split(" ")[0]}, votre commande ${commande.produit} (${Number(commande.montant).toLocaleString("fr-FR")} ${workspace.currency}) sera livrée bientôt. Merci de rester joignable.`)}`}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#1a7a3c", color: "white", padding: "10px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, textDecoration: "none" }}
                >
                  ✉️ SMS
                </a>
                <a
                  href={`tel:${commande.tel}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 12.5, textDecoration: "none" }}
                >
                  📞
                </a>
              </div>
            </>
          )}

          <button
            onClick={() => setShowAppel(true)}
            style={{ width: "100%", background: "#EAF0FB", border: "1px solid #C3D4F0", color: "#1E4B8C", padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}
          >
            📞 Enregistrer un appel
          </button>

          {commande.statut !== "annulee" && Number(commande.montant_paye || 0) < Number(commande.montant) && (
            <button
              onClick={() => setShowPaiement(true)}
              style={{ width: "100%", background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", padding: "9px 0", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}
            >
              💵 Enregistrer un paiement — reste {(Number(commande.montant) - Number(commande.montant_paye || 0)).toLocaleString("fr-FR")} {currency}
            </button>
          )}

          <button
            onClick={() => setEditing(true)}
            style={{ width: "100%", background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}
          >
            ✏️ Modifier les informations
          </button>

          {onReschedule && commande.statut !== "confirmee" && commande.statut !== "annulee" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", marginBottom: 4 }}>📅 Reprogrammer la livraison</div>
              <input
                type="date"
                value={commande.date_relivraison || ""}
                onChange={(e) => onReschedule(commande.id, e.target.value)}
                style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }}
              />
              {commande.date_relivraison && (
                <div style={{ fontSize: 11, color: "#1a7a3c", marginTop: 4 }}>
                  📅 Prévue le {new Date(commande.date_relivraison + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </div>
              )}
            </div>
          )}

          <HistoriqueCreances commande={commande} currency={currency} />
          <JournalAppels commandeId={commande.id} />
          <HistoriqueRelances commandeId={commande.id} />
        </div>
      )}
      </>
      )}

      {showAppel && (
        <div
          onClick={() => { setShowAppel(false); setDateRappelChoisie(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Comment s'est passé l'appel ?</div>
            <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>{commande.client} — {commande.tel}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "confirme_telephone", label: "✅ Confirmé par téléphone", couleur: "#1F9D6E" },
                { key: "pas_de_reponse", label: "📵 Pas de réponse", couleur: "#8A6412" },
                { key: "faux_numero", label: "🚫 Faux numéro", couleur: "#D64933" },
                { key: "refuse", label: "❌ Refusé par le client", couleur: "#D64933" },
              ].map((motif) => (
                <button
                  key={motif.key}
                  onClick={async () => {
                    await supabase.from("appels_commande").insert([{ workspace_id: workspace.id, commande_id: commande.id, motif: motif.key, appele_par: confirmateurNom || "Équipe" }]);
                    setShowAppel(false);
                    await onStatusChanged();
                  }}
                  style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "13px 16px", textAlign: "left", fontWeight: 600, fontSize: 14, cursor: "pointer", color: motif.couleur }}
                >
                  {motif.label}
                </button>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #ECE8DC", marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8A6412", marginBottom: 8 }}>🕒 Rappeler plus tard — quand ?</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[
                  { label: "Demain", jours: 1 },
                  { label: "Après-demain", jours: 2 },
                  { label: "Dans 3 jours", jours: 3 },
                ].map((raccourci) => (
                  <button
                    key={raccourci.jours}
                    onClick={() => setDateRappelChoisie(new Date(Date.now() + raccourci.jours * 86400000).toISOString().slice(0, 10))}
                    style={{ flex: 1, background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 4px", fontSize: 11.5, fontWeight: 600, color: "#8A6412", cursor: "pointer" }}
                  >
                    {raccourci.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={dateRappelChoisie}
                onChange={(e) => setDateRappelChoisie(e.target.value)}
                style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }}
              />
              <button
                onClick={async () => {
                  if (!dateRappelChoisie) return;
                  await supabase.from("appels_commande").insert([{ workspace_id: workspace.id, commande_id: commande.id, motif: "rappeler_plus_tard", note: `Rappel prévu le ${dateRappelChoisie}`, appele_par: confirmateurNom || "Équipe" }]);
                  await onReschedule?.(commande.id, dateRappelChoisie);
                  setShowAppel(false);
                  setDateRappelChoisie("");
                  await onStatusChanged();
                }}
                disabled={!dateRappelChoisie}
                style={{ width: "100%", background: dateRappelChoisie ? "#8A6412" : "#DDD8CC", color: "white", border: "none", borderRadius: 9, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: dateRappelChoisie ? "pointer" : "default" }}
              >
                Confirmer le rappel
              </button>
            </div>

            <button onClick={() => { setShowAppel(false); setDateRappelChoisie(""); }} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#8A9089", fontSize: 13, padding: "8px 0", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {showPaiement && (
        <FenetrePaiementPartiel
          commande={commande}
          currency={currency}
          confirmateurNom={confirmateurNom}
          workspace={workspace}
          onClose={() => setShowPaiement(false)}
          onEnregistre={onStatusChanged}
        />
      )}
    </div>
  );
}

function FenetrePaiementPartiel({ commande, currency, confirmateurNom, workspace, onClose, onEnregistre }) {
  const resteAPayer = Number(commande.montant) - Number(commande.montant_paye || 0);
  const [montant, setMontant] = useState(String(resteAPayer));
  const [modePaiement, setModePaiement] = useState("cash");
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) return;
    setEnCours(true);
    const nouveauMontantPaye = Number(commande.montant_paye || 0) + montantNum;
    const soldeComplet = nouveauMontantPaye >= Number(commande.montant);

    await supabase.from("paiements_commande").insert([{
      workspace_id: workspace.id,
      commande_id: commande.id,
      montant: montantNum,
      mode_paiement: modePaiement,
      enregistre_par: confirmateurNom || "Équipe",
    }]);

    await supabase.from("commandes").update({
      montant_paye: nouveauMontantPaye,
      ...(soldeComplet ? { statut: "confirmee", confirmed_at: new Date().toISOString(), confirmed_by: confirmateurNom || "Équipe" } : {}),
    }).eq("id", commande.id);

    setEnCours(false);
    onClose();
    await onEnregistre();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Enregistrer un paiement</div>
        <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
          {commande.client} — reste {resteAPayer.toLocaleString("fr-FR")} {currency} sur {Number(commande.montant).toLocaleString("fr-FR")} {currency}
        </div>

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Montant reçu maintenant</div>
        <input
          type="number"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 15, fontWeight: 700, boxSizing: "border-box", marginBottom: 14 }}
        />

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 6 }}>Mode de paiement</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {[
            { key: "cash", label: "💵 Cash" },
            { key: "orange_money", label: "🟠 Orange Money" },
            { key: "wave", label: "🌊 Wave" },
            { key: "mtn_money", label: "🟡 MTN Money" },
            { key: "moov_money", label: "🔵 Moov Money" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setModePaiement(m.key)}
              style={{ background: modePaiement === m.key ? "#1a7a3c" : "#FAFAF7", color: modePaiement === m.key ? "white" : "#16231F", border: "1px solid #DDD8CC", borderRadius: 999, padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {Number(montant) > 0 && Number(montant) < resteAPayer && (
          <div style={{ fontSize: 11.5, color: "#8A6412", background: "#FBF3E3", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
            Il restera encore {(resteAPayer - Number(montant)).toLocaleString("fr-FR")} {currency} à payer après ce paiement.
          </div>
        )}

        <button
          onClick={enregistrer}
          disabled={enCours || !montant || Number(montant) <= 0}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? "Enregistrement..." : "Confirmer le paiement"}
        </button>
        <button onClick={onClose} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#8A9089", fontSize: 13, padding: "8px 0", cursor: "pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function HistoriqueCreances({ commande, currency }) {
  const [paiements, setPaiements] = useState(null);

  useEffect(() => {
    supabase.from("paiements_commande").select("*").eq("commande_id", commande.id).order("created_at", { ascending: true }).then(({ data }) => setPaiements(data || []));
  }, [commande.id]);

  if (!paiements || paiements.length === 0) return null;

  const labelsModePaiement = { cash: "Cash", orange_money: "Orange Money", wave: "Wave", mtn_money: "MTN Money", moov_money: "Moov Money" };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", marginBottom: 6 }}>💵 Historique des paiements</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {paiements.map((p) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, background: "#EAF3DE", borderRadius: 7, padding: "6px 10px" }}>
            <span style={{ color: "#3B6D11", fontWeight: 700 }}>{Number(p.montant).toLocaleString("fr-FR")} {currency} — {labelsModePaiement[p.mode_paiement] || p.mode_paiement}</span>
            <span style={{ color: "#8A9089" }}>{new Date(p.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JournalAppels({ commandeId }) {
  const [appels, setAppels] = useState(null);

  useEffect(() => {
    supabase.from("appels_commande").select("*").eq("commande_id", commandeId).order("created_at", { ascending: false }).then(({ data }) => setAppels(data || []));
  }, [commandeId]);

  if (!appels || appels.length === 0) return null;

  const labels = {
    confirme_telephone: { texte: "✅ Confirmé par téléphone", couleur: "#1F9D6E" },
    pas_de_reponse: { texte: "📵 Pas de réponse", couleur: "#8A6412" },
    rappeler_plus_tard: { texte: "🕒 Rappeler plus tard", couleur: "#8A6412" },
    faux_numero: { texte: "🚫 Faux numéro", couleur: "#D64933" },
    refuse: { texte: "❌ Refusé", couleur: "#D64933" },
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", marginBottom: 6 }}>📞 Historique des appels</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {appels.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, background: "#FAFAF7", borderRadius: 7, padding: "6px 10px" }}>
            <span style={{ color: labels[a.motif]?.couleur || "#16231F", fontWeight: 600 }}>{labels[a.motif]?.texte || a.motif}</span>
            <span style={{ color: "#8A9089" }}>{new Date(a.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
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
        <BoutonMicro onResultat={(texte) => setNote((n) => (n ? n + " " + texte : texte))} />
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

function EquipeModal({ titre, items, onAdd, onDelete, onClose, avecEmail, produitsRecus, detailParProduit, commandesParMembre, currency }) {
  const [livreurDeplie, setLivreurDeplie] = useState(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");

  async function ajouter() {
    if (!nom.trim()) return;
    const payload = { nom: nom.trim(), telephone: telephone.trim() };
    if (avecEmail) payload.email = email.trim();
    await onAdd(payload);
    setNom("");
    setTelephone("");
    setEmail("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{titre}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: avecEmail ? 6 : 16 }}>
          <input placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          <input placeholder="Téléphone" value={telephone} onChange={(e) => setTelephone(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
        </div>
        {avecEmail && (
          <div style={{ marginBottom: 16 }}>
            <input placeholder="Email de connexion (optionnel, pour le suivi GPS)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: "#8A9089" }}>Invite-le d'abord via "Gérer l'équipe", avec ce même email et le rôle Livreur.</div>
          </div>
        )}
        <button onClick={ajouter} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 16 }}>
          Ajouter
        </button>

        {items.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucun {titre.toLowerCase()} pour l'instant.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.nom}</div>
                {it.telephone && <div style={{ fontSize: 11.5, color: "#6B7168" }}>{it.telephone}</div>}
                {it.email && <div style={{ fontSize: 10.5, color: "#8A9089" }}>{it.email}</div>}
                {detailParProduit && detailParProduit[it.nom] && Object.keys(detailParProduit[it.nom]).length > 0 && (
                  <button
                    onClick={() => setLivreurDeplie(livreurDeplie === it.nom ? null : it.nom)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#1a7a3c", fontWeight: 700, marginTop: 3, textDecoration: "underline" }}
                  >
                    📦 {produitsRecus?.[it.nom] || 0} produit{(produitsRecus?.[it.nom] || 0) > 1 ? "s" : ""} {titre === "Closers" ? "confirmé" : "livré"}{(produitsRecus?.[it.nom] || 0) > 1 ? "s" : ""} au total — voir le détail {livreurDeplie === it.nom ? "▲" : "▼"}
                  </button>
                )}
                {livreurDeplie === it.nom && detailParProduit && detailParProduit[it.nom] && (
                  <div style={{ marginTop: 8, background: "white", border: "1px solid #ECE8DC", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "#F0EEE6" }}>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Produit</th>
                          <th style={{ textAlign: "center", padding: "6px 6px", color: "#1F9D6E" }}>{titre === "Closers" ? "Confirmées" : "Livrées"}</th>
                          <th style={{ textAlign: "center", padding: "6px 6px", color: "#D64933" }}>Échouées</th>
                          <th style={{ textAlign: "center", padding: "6px 6px", color: "#E8A93D" }}>En cours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detailParProduit[it.nom]).map(([nomProduit, d]) => (
                          <tr key={nomProduit} style={{ borderTop: "1px solid #F0EEE6" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{nomProduit}</td>
                            <td style={{ textAlign: "center", padding: "6px 6px", color: "#1F9D6E", fontWeight: 700 }}>{d.livre}</td>
                            <td style={{ textAlign: "center", padding: "6px 6px", color: "#D64933", fontWeight: 700 }}>{d.nonLivre}</td>
                            <td style={{ textAlign: "center", padding: "6px 6px", color: "#E8A93D", fontWeight: 700 }}>{d.restant}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {commandesParMembre && commandesParMembre[it.nom] && commandesParMembre[it.nom].length > 0 && (
                      <div style={{ borderTop: "2px solid #DDD8CC" }}>
                        <div style={{ padding: "8px 8px 4px", fontSize: 10.5, fontWeight: 800, color: "#6B7168", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          Détail commande par commande ({commandesParMembre[it.nom].length})
                        </div>
                        <div style={{ maxHeight: 240, overflowY: "auto" }}>
                          {commandesParMembre[it.nom].map((c) => {
                            const infoStatut = STATUTS[c.statut] || { label: c.statut, color: "#6B7168", bg: "#F0EEE6" };
                            return (
                              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "7px 8px", borderTop: "1px solid #F0EEE6" }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.produit}</div>
                                  <div style={{ fontSize: 10, color: "#8A9089" }}>{c.client} · {new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700 }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                                  <span style={{ fontSize: 9.5, fontWeight: 700, color: infoStatut.color, background: infoStatut.bg, borderRadius: 999, padding: "1px 7px" }}>{infoStatut.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => onDelete(it.id, it.nom)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditeurRiche({ valeur, onChange, workspaceId, placeholder }) {
  const editeurRef = useRef(null);
  const [envoiImage, setEnvoiImage] = useState(false);
  const [envoiVideo, setEnvoiVideo] = useState(false);
  const [initialise, setInitialise] = useState(false);
  const positionCurseurRef = useRef(null);
  const [modeHTML, setModeHTML] = useState(false);
  const [htmlBrut, setHtmlBrut] = useState("");

  useEffect(() => {
    if (editeurRef.current && !initialise) {
      editeurRef.current.innerHTML = valeur || "";
      setInitialise(true);
    }
  }, [valeur, initialise]);

  function sauvegarderPositionCurseur() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const plage = selection.getRangeAt(0);
      if (editeurRef.current && editeurRef.current.contains(plage.commonAncestorContainer)) {
        positionCurseurRef.current = plage.cloneRange();
      }
    }
  }

  function restaurerPositionCurseur() {
    const selection = window.getSelection();
    selection.removeAllRanges();
    if (positionCurseurRef.current) {
      selection.addRange(positionCurseurRef.current);
    } else {
      // Pas de position connue (ex: éditeur jamais cliqué) : on place le curseur à la toute fin
      const plage = document.createRange();
      plage.selectNodeContents(editeurRef.current);
      plage.collapse(false);
      selection.addRange(plage);
    }
  }

  function appliquer(commande, arg) {
    editeurRef.current.focus();
    restaurerPositionCurseur();
    document.execCommand(commande, false, arg);
    sauvegarderPositionCurseur();
    onChange(editeurRef.current.innerHTML);
  }

  async function inserer_image(fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) {
      alert("L'image est trop lourde (max 5 Mo). Choisis une image plus légère.");
      return;
    }
    // On garde une copie de la position au moment du clic (avant l'upload asynchrone),
    // car la sélection du navigateur peut se perdre pendant l'attente.
    const plageAuMomentDuClic = positionCurseurRef.current ? positionCurseurRef.current.cloneRange() : null;
    setEnvoiImage(true);
    const fichierCompresse = await compresserImage(fichier);
    const extension = fichierCompresse.name.split(".").pop();
    const chemin = `${workspaceId}-desc-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("produits").upload(chemin, fichierCompresse, { upsert: true });
    if (error) {
      alert("Erreur lors de l'envoi de l'image : " + error.message);
      setEnvoiImage(false);
      return;
    }
    const { data } = supabase.storage.from("produits").getPublicUrl(chemin);
    const img = document.createElement("img");
    img.src = data.publicUrl;
    img.style.cssText = "max-width:100%;border-radius:8px;margin:8px 0;display:block;";

    const editeur = editeurRef.current;
    const plageValide = plageAuMomentDuClic && editeur && editeur.contains(plageAuMomentDuClic.commonAncestorContainer);
    if (plageValide) {
      plageAuMomentDuClic.deleteContents();
      plageAuMomentDuClic.insertNode(img);
      plageAuMomentDuClic.setStartAfter(img);
      plageAuMomentDuClic.collapse(true);
      positionCurseurRef.current = plageAuMomentDuClic.cloneRange();
    } else {
      // Pas de position connue : on ajoute l'image à la fin plutôt qu'au début
      editeur.appendChild(img);
      const plageFin = document.createRange();
      plageFin.selectNodeContents(editeur);
      plageFin.collapse(false);
      positionCurseurRef.current = plageFin;
    }
    editeur.focus();
    restaurerPositionCurseur();
    onChange(editeur.innerHTML);
    setEnvoiImage(false);
  }

  function insererVideoParUrl() {
    const url = prompt("Colle le lien de la vidéo (YouTube, Vimeo, ou lien direct .mp4) :");
    if (!url || !url.trim()) return;
    const lien = url.trim();
    const ytMatch = lien.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    const vimeoMatch = lien.match(/vimeo\.com\/(\d+)/);
    let html;
    if (ytMatch) {
      html = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;border-radius:8px;overflow:hidden;"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
    } else if (vimeoMatch) {
      html = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:12px 0;border-radius:8px;overflow:hidden;"><iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
    } else {
      html = `<video controls style="max-width:100%;border-radius:8px;margin:12px 0;display:block;"><source src="${lien}" /></video>`;
    }
    appliquer("insertHTML", html);
  }

  async function insererVideoFichier(fichier) {
    if (!fichier) return;
    if (fichier.size > 30 * 1024 * 1024) {
      alert("La vidéo est trop lourde (max 30 Mo). Pour une vidéo plus longue, mets-la sur YouTube et colle le lien à la place.");
      return;
    }
    const plageAuMomentDuClic = positionCurseurRef.current ? positionCurseurRef.current.cloneRange() : null;
    setEnvoiVideo(true);
    const extension = fichier.name.split(".").pop();
    const chemin = `${workspaceId}-desc-video-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("produits").upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
    if (error) {
      alert("Erreur lors de l'envoi de la vidéo : " + error.message);
      setEnvoiVideo(false);
      return;
    }
    const { data } = supabase.storage.from("produits").getPublicUrl(chemin);
    const video = document.createElement("video");
    video.controls = true;
    video.src = data.publicUrl;
    video.style.cssText = "max-width:100%;border-radius:8px;margin:12px 0;display:block;";

    const editeur = editeurRef.current;
    const plageValide = plageAuMomentDuClic && editeur && editeur.contains(plageAuMomentDuClic.commonAncestorContainer);
    if (plageValide) {
      plageAuMomentDuClic.deleteContents();
      plageAuMomentDuClic.insertNode(video);
      plageAuMomentDuClic.setStartAfter(video);
      plageAuMomentDuClic.collapse(true);
      positionCurseurRef.current = plageAuMomentDuClic.cloneRange();
    } else {
      editeur.appendChild(video);
      const plageFin = document.createRange();
      plageFin.selectNodeContents(editeur);
      plageFin.collapse(false);
      positionCurseurRef.current = plageFin;
    }
    editeur.focus();
    restaurerPositionCurseur();
    onChange(editeur.innerHTML);
    setEnvoiVideo(false);
  }

  function basculerModeHTML() {
    if (!modeHTML) {
      setHtmlBrut(editeurRef.current ? editeurRef.current.innerHTML : valeur || "");
      setModeHTML(true);
    } else {
      onChange(htmlBrut);
      setInitialise(false);
      setModeHTML(false);
    }
  }

  return (
    <div style={{ border: "1px solid #DDD8CC", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#FAFAF7", borderBottom: "1px solid #ECE8DC", flexWrap: "wrap", alignItems: "center" }}>
        <select
          disabled={modeHTML}
          onMouseDown={sauvegarderPositionCurseur}
          onChange={(e) => { if (e.target.value) appliquer("formatBlock", e.target.value); e.target.value = ""; }}
          defaultValue=""
          style={{ ...boutonEditeurStyle, cursor: modeHTML ? "default" : "pointer", opacity: modeHTML ? 0.5 : 1 }}
        >
          <option value="" disabled>Style</option>
          <option value="P">Normal</option>
          <option value="H2">Titre</option>
          <option value="H3">Sous-titre</option>
        </select>
        <select
          disabled={modeHTML}
          onMouseDown={sauvegarderPositionCurseur}
          onChange={(e) => { if (e.target.value) appliquer("fontName", e.target.value); e.target.value = ""; }}
          defaultValue=""
          style={{ ...boutonEditeurStyle, cursor: modeHTML ? "default" : "pointer", opacity: modeHTML ? 0.5 : 1, fontStyle: "normal" }}
        >
          <option value="" disabled>Police</option>
          <option value="Arial, sans-serif" style={{ fontFamily: "Arial, sans-serif" }}>Normale</option>
          <option value="Georgia, serif" style={{ fontFamily: "Georgia, serif" }}>Classique</option>
          <option value="'Courier New', monospace" style={{ fontFamily: "'Courier New', monospace" }}>Machine à écrire</option>
          <option value="'Brush Script MT', cursive" style={{ fontFamily: "'Brush Script MT', cursive" }}>Manuscrite</option>
          <option value="Impact, sans-serif" style={{ fontFamily: "Impact, sans-serif" }}>Impact</option>
        </select>
        <button type="button" disabled={modeHTML} onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer("bold")} style={{ ...boutonEditeurStyle, opacity: modeHTML ? 0.5 : 1 }}><b>G</b></button>
        <button type="button" disabled={modeHTML} onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer("italic")} style={{ ...boutonEditeurStyle, opacity: modeHTML ? 0.5 : 1 }}><i>I</i></button>
        <button type="button" disabled={modeHTML} onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer("underline")} style={{ ...boutonEditeurStyle, opacity: modeHTML ? 0.5 : 1 }}><u>S</u></button>
        <button type="button" disabled={modeHTML} onMouseDown={(e) => e.preventDefault()} onClick={() => appliquer("insertUnorderedList")} style={{ ...boutonEditeurStyle, opacity: modeHTML ? 0.5 : 1 }}>• Liste</button>
        <label style={{ ...boutonEditeurStyle, cursor: modeHTML ? "default" : "pointer", opacity: modeHTML ? 0.5 : 1 }} onMouseDown={sauvegarderPositionCurseur}>
          {envoiImage ? "Envoi..." : "🖼️ Image"}
          <input type="file" accept="image/*" disabled={modeHTML} style={{ display: "none" }} onChange={(e) => inserer_image(e.target.files?.[0])} />
        </label>
        <button type="button" disabled={modeHTML} onMouseDown={(e) => e.preventDefault()} onClick={insererVideoParUrl} style={{ ...boutonEditeurStyle, opacity: modeHTML ? 0.5 : 1 }}>🎥 Lien vidéo</button>
        <label style={{ ...boutonEditeurStyle, cursor: modeHTML ? "default" : "pointer", opacity: modeHTML ? 0.5 : 1 }} onMouseDown={sauvegarderPositionCurseur}>
          {envoiVideo ? "Envoi..." : "📤 Vidéo"}
          <input type="file" accept="video/*" disabled={modeHTML} style={{ display: "none" }} onChange={(e) => insererVideoFichier(e.target.files?.[0])} />
        </label>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={basculerModeHTML} style={{ ...boutonEditeurStyle, marginLeft: "auto", background: modeHTML ? "#1a7a3c" : "white", color: modeHTML ? "white" : "#16231F" }}>
          {modeHTML ? "✓ Terminer HTML" : "</> HTML"}
        </button>
      </div>
      {modeHTML ? (
        <textarea
          value={htmlBrut}
          onChange={(e) => setHtmlBrut(e.target.value)}
          placeholder="<p>Colle ou écris ton code HTML ici...</p>"
          style={{ width: "100%", minHeight: 220, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, outline: "none", border: "none", fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box", resize: "vertical" }}
        />
      ) : (
        <div
          ref={editeurRef}
          contentEditable
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onBlur={sauvegarderPositionCurseur}
          onKeyUp={sauvegarderPositionCurseur}
          onMouseUp={sauvegarderPositionCurseur}
          data-placeholder={placeholder}
          style={{ minHeight: 220, padding: "12px 14px", fontSize: 14, lineHeight: 1.6, outline: "none" }}
          className="rv-editeur-riche"
        />
      )}
      <style>{`.rv-editeur-riche:empty:before { content: attr(data-placeholder); color: #8A9089; } .rv-editeur-riche h2 { font-size: 19px; font-weight: 700; margin: 14px 0 8px; } .rv-editeur-riche h3 { font-size: 16px; font-weight: 700; margin: 12px 0 6px; }`}</style>
    </div>
  );
}

const boutonEditeurStyle = { background: "white", border: "1px solid #DDD8CC", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#16231F" };

function parserCSV(texte) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let dansGuillemets = false;
  const chars = texte.replace(/\r\n/g, "\n");
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (chars[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = false;
      } else champ += c;
    } else {
      if (c === '"') dansGuillemets = true;
      else if (c === ",") { ligne.push(champ); champ = ""; }
      else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
      else champ += c;
    }
  }
  if (champ.length > 0 || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }
  if (lignes.length === 0) return [];
  const entetes = lignes[0].map((h) => h.trim());
  return lignes.slice(1).filter((l) => l.some((v) => v.trim() !== "")).map((l) => {
    const obj = {};
    entetes.forEach((h, i) => { obj[h] = (l[i] || "").trim(); });
    return obj;
  });
}

function mapperColonnesShopify(lignesBrutes) {
  const dejaVus = new Set();
  const resultat = [];
  for (const l of lignesBrutes) {
    const nom = l["Title"] || l["nom"] || l["Nom"] || l["name"] || "";
    if (!nom.trim()) continue;
    const handle = l["Handle"] || nom;
    if (dejaVus.has(handle)) continue; // Shopify exporte une ligne par variante, on ne garde que la première
    dejaVus.add(handle);
    resultat.push({
      nom: nom.trim(),
      description: (l["Body (HTML)"] || l["description"] || l["Description"] || "").trim(),
      prix_vente: l["Variant Price"] || l["prix_vente"] || l["Prix"] || l["price"] || "",
      photo_url: l["Image Src"] || l["photo_url"] || l["Photo"] || l["image"] || "",
      type: (l["Type"] || l["Product Type"] || l["type"] || "").trim(),
    });
  }
  return resultat;
}

function CollectionsModal({ workspaceId, produits, onClose }) {
  const [collections, setCollections] = useState(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [collectionOuverte, setCollectionOuverte] = useState(null);
  const [produitsDeLaCollection, setProduitsDeLaCollection] = useState(new Set());
  const [classementEnCours, setClassementEnCours] = useState(false);
  const [resultatClassement, setResultatClassement] = useState(null);

  // Dictionnaire de mots-clés pour deviner la catégorie d'un produit à partir de son nom —
  // classement "au mieux", à vérifier ensuite, pas une science exacte.
  const CATEGORIES_MOTS_CLES = {
    "Électronique": ["lampe", "led", "chargeur", "câble", "cable", "écouteur", "casque", "bluetooth", "batterie", "power bank", "montre connectée", "smartwatch", "caméra", "camera", "haut-parleur", "enceinte", "usb", "adaptateur", "télécommande", "projecteur", "ventilateur usb", "veilleuse", "moustique", "anti-moustique"],
    "Beauté & Soins": ["crème", "creme", "masque", "mask", "soin", "peau", "visage", "cheveux", "shampoing", "shampooing", "maquillage", "rouge à lèvres", "vernis", "parfum", "savon", "gel douche", "sérum", "serum", "acné", "anti-âge", "blanchissant", "épilateur", "rasoir", "brosse", "coiffure", "faciale", "corporel", "hydratant"],
    "Maison": ["cuisine", "casserole", "poêle", "rangement", "panier", "linge", "tapis", "coussin", "rideaux", "décoration", "vaisselle", "verre", "assiette", "nettoyage", "balai", "organisateur", "boîte", "seau", "torchon"],
    "Mode": ["robe", "chemise", "pantalon", "sac à main", "sac", "chaussure", "sandale", "montre", "bijou", "collier", "bracelet", "boucle d'oreille", "bague", "lunette de soleil", "ceinture", "portefeuille", "écharpe", "bonnet"],
    "Auto & Moto": ["voiture", "moto", "pneu", "rétroviseur", "auto", "véhicule", "casque moto", "gps voiture", "support téléphone voiture"],
    "Enfants": ["bébé", "bebe", "enfant", "jouet", "peluche", "biberon", "couche", "poussette", "puériculture"],
  };

  function deviner_categorie(nomProduit) {
    const nomMinuscule = nomProduit.toLowerCase();
    for (const [categorie, motsClefs] of Object.entries(CATEGORIES_MOTS_CLES)) {
      if (motsClefs.some((mot) => nomMinuscule.includes(mot))) return categorie;
    }
    return null;
  }

  async function classerAutomatiquement() {
    if (!window.confirm("Ceci va créer des collections manquantes et y ranger tes produits selon leur nom. Les produits déjà dans une collection ne seront pas déplacés. Continuer ?")) return;
    setClassementEnCours(true);
    setResultatClassement(null);

    // Regarde quels produits sont déjà dans au moins une collection, pour ne jamais les déplacer.
    const { data: dejaClasses } = await supabase.from("collection_produits").select("produit_id");
    const idsDejaClasses = new Set((dejaClasses || []).map((r) => r.produit_id));

    const collectionsExistantes = collections || [];
    const collectionParNom = {};
    collectionsExistantes.forEach((c) => { collectionParNom[c.nom.toLowerCase().trim()] = c.id; });
    let ordreSuivant = collectionsExistantes.length;

    const liaisons = [];
    let nbClasses = 0;
    let nbIgnores = 0;
    const categoriesUtilisees = new Set();

    for (const p of produits) {
      if (idsDejaClasses.has(p.id)) { nbIgnores += 1; continue; }
      const categorie = deviner_categorie(p.nom);
      if (!categorie) { nbIgnores += 1; continue; }
      categoriesUtilisees.add(categorie);

      let collectionId = collectionParNom[categorie.toLowerCase()];
      if (!collectionId) {
        const { data: nouvelle } = await supabase.from("collections").insert([{ workspace_id: workspaceId, nom: categorie, ordre: ordreSuivant }]).select("id").single();
        if (nouvelle) {
          collectionId = nouvelle.id;
          collectionParNom[categorie.toLowerCase()] = collectionId;
          ordreSuivant += 1;
        }
      }
      if (collectionId) {
        liaisons.push({ collection_id: collectionId, produit_id: p.id });
        nbClasses += 1;
      }
    }

    if (liaisons.length > 0) {
      await supabase.from("collection_produits").upsert(liaisons, { onConflict: "collection_id,produit_id", ignoreDuplicates: true });
    }

    setClassementEnCours(false);
    setResultatClassement(`${nbClasses} produit(s) classé(s) dans ${categoriesUtilisees.size} catégorie(s) (${[...categoriesUtilisees].join(", ") || "aucune"}). ${nbIgnores} produit(s) ignoré(s) — soit déjà classés, soit leur nom ne correspond à aucune catégorie connue.`);
    await charger();
  }

  async function charger() {
    const { data } = await supabase.from("collections").select("*").eq("workspace_id", workspaceId).order("ordre");
    setCollections(data || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function creerCollection() {
    if (!nouveauNom.trim()) return;
    const ordre = (collections || []).length;
    await supabase.from("collections").insert([{ workspace_id: workspaceId, nom: nouveauNom.trim(), ordre }]);
    setNouveauNom("");
    await charger();
  }

  async function supprimerCollection(id) {
    if (!window.confirm("Supprimer cette collection ? Les produits ne seront pas supprimés, juste retirés de cette collection.")) return;
    await supabase.from("collections").delete().eq("id", id);
    await charger();
    if (collectionOuverte === id) setCollectionOuverte(null);
  }

  async function deplacerCollection(index, direction) {
    const liste = [...collections];
    const autreIndex = index + direction;
    if (autreIndex < 0 || autreIndex >= liste.length) return;
    const a = liste[index];
    const b = liste[autreIndex];
    await supabase.from("collections").update({ ordre: b.ordre }).eq("id", a.id);
    await supabase.from("collections").update({ ordre: a.ordre }).eq("id", b.id);
    await charger();
  }

  async function ouvrirGestionProduits(collectionId) {
    setCollectionOuverte(collectionId);
    const { data } = await supabase.from("collection_produits").select("produit_id").eq("collection_id", collectionId);
    setProduitsDeLaCollection(new Set((data || []).map((r) => r.produit_id)));
  }

  async function toggleProduit(produitId) {
    const dejaDedans = produitsDeLaCollection.has(produitId);
    if (dejaDedans) {
      await supabase.from("collection_produits").delete().eq("collection_id", collectionOuverte).eq("produit_id", produitId);
    } else {
      await supabase.from("collection_produits").insert([{ collection_id: collectionOuverte, produit_id: produitId }]);
    }
    const nouvelEnsemble = new Set(produitsDeLaCollection);
    if (dejaDedans) nouvelEnsemble.delete(produitId);
    else nouvelEnsemble.add(produitId);
    setProduitsDeLaCollection(nouvelEnsemble);
  }

  const collectionOuverteNom = (collections || []).find((c) => c.id === collectionOuverte)?.nom;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {collectionOuverte ? `📁 ${collectionOuverteNom}` : "📁 Collections"}
          </div>
          <button onClick={collectionOuverte ? () => setCollectionOuverte(null) : onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>
            {collectionOuverte ? "← Retour" : "×"}
          </button>
        </div>

        {!collectionOuverte && (
          <>
            <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14 }}>
              Regroupe tes produits par thème (Promo, Rentrée...) — visible sur ta boutique publique, en plus des collections automatiques.
            </div>

            <button
              onClick={classerAutomatiquement}
              disabled={classementEnCours}
              style={{ width: "100%", background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 10 }}
            >
              {classementEnCours ? "Classement en cours..." : "🗂️ Classer mes produits automatiquement"}
            </button>
            {resultatClassement && (
              <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 11.5, color: "#8A6412", lineHeight: 1.5 }}>
                ✅ {resultatClassement}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <input
                placeholder="Nom de la collection (ex: Promo)"
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && creerCollection()}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <button onClick={creerCollection} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>+</button>
            </div>

            {collections === null && <SkeletonListe nombre={3} />}
            {collections !== null && collections.length === 0 && (
              <div style={{ color: "#8A9089", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Aucune collection pour l'instant.</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(collections || []).map((c, i) => (
                <div key={c.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => deplacerCollection(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? "#DDD8CC" : "#6B7168", cursor: i === 0 ? "default" : "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}>▲</button>
                    <button onClick={() => deplacerCollection(i, 1)} disabled={i === collections.length - 1} style={{ background: "none", border: "none", color: i === collections.length - 1 ? "#DDD8CC" : "#6B7168", cursor: i === collections.length - 1 ? "default" : "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}>▼</button>
                  </div>
                  <button onClick={() => ouvrirGestionProduits(c.id)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", flex: 1, cursor: "pointer", fontWeight: 600, fontSize: 13.5, color: "#16231F" }}>
                    {c.nom}
                  </button>
                  <button onClick={() => supprimerCollection(c.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#8A9089", marginTop: 8 }}>Utilise les flèches ▲▼ pour changer l'ordre d'affichage sur ta boutique.</div>
          </>
        )}

        {collectionOuverte && (
          <>
            <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14 }}>
              Coche les produits à inclure dans cette collection.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {produits.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={produitsDeLaCollection.has(p.id)}
                    onChange={() => toggleProduit(p.id)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, flex: 1 }}>{p.nom}</span>
                  {p.prix_vente && <span style={{ fontSize: 12, color: "#8A9089" }}>{Number(p.prix_vente).toLocaleString("fr-FR")}</span>}
                </label>
              ))}
              {produits.length === 0 && (
                <div style={{ color: "#8A9089", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Aucun produit dans ton catalogue.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaniersAbandonnesModal({ workspaceId, currency, onClose }) {
  const [paniers, setPaniers] = useState(null);

  async function charger() {
    const { data } = await supabase
      .from("paniers_abandonnes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("converti", false)
      .order("updated_at", { ascending: false })
      .limit(100);
    setPaniers(data || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function marquerRelance(id) {
    await supabase.from("paniers_abandonnes").update({ relance_envoyee: true }).eq("id", id);
    await charger();
  }

  async function ignorerPanier(id) {
    await supabase.from("paniers_abandonnes").update({ converti: true }).eq("id", id);
    await charger();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🛒 Paniers abandonnés</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 16, lineHeight: 1.5 }}>
          Ces personnes ont commencé à commander un produit sans finaliser. Relance-les directement sur WhatsApp.
        </div>

        {paniers === null && <SkeletonListe nombre={3} />}
        {paniers !== null && paniers.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucun panier abandonné pour l'instant. 🎉</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(paniers || []).map((p) => (
            <div key={p.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.client_nom || "Client sans nom"}</div>
                  <div style={{ fontSize: 11.5, color: "#6B7168" }}>{p.tel}</div>
                  <div style={{ fontSize: 12, color: "#16231F", marginTop: 3 }}>{p.produit_nom}{p.montant ? ` — ${Number(p.montant).toLocaleString("fr-FR")} ${currency}` : ""}</div>
                  <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 2 }}>Il y a {Math.max(0, Math.round((Date.now() - new Date(p.updated_at).getTime()) / 60000))} min</div>
                  {p.relance_envoyee && <div style={{ fontSize: 10.5, color: "#1F9D6E", fontWeight: 700, marginTop: 2 }}>✅ Déjà relancé</div>}
                </div>
                <button onClick={() => ignorerPanier(p.id)} style={{ background: "none", border: "none", color: "#8A9089", cursor: "pointer", fontSize: 11, flexShrink: 0, textDecoration: "underline" }}>Ignorer</button>
              </div>
              <a
                href={`https://wa.me/${cleanPhoneForWhatsApp(p.tel)}?text=${encodeURIComponent(`Bonjour ${(p.client_nom || "").split(" ")[0] || ""} 👋, j'ai vu que vous étiez intéressé(e) par "${p.produit_nom}". Puis-je vous aider à finaliser votre commande ?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => marquerRelance(p.id)}
                style={{ display: "block", textAlign: "center", marginTop: 8, background: "#1F9D6E", color: "white", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, textDecoration: "none" }}
              >
                💬 Relancer sur WhatsApp
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AzaliDesignModal({ workspace, onClose }) {
  const configInitiale = workspace.azali_config || {};
  const [messages, setMessages] = useState(
    Array.isArray(configInitiale.messagesAnnonce) && configInitiale.messagesAnnonce.length > 0
      ? configInitiale.messagesAnnonce
      : [
          { icone: "🚚", texte: "Livraison gratuite à Abidjan dès 50 000 FCFA" },
          { icone: "💸", texte: "Wave · Orange Money · MTN MoMo acceptés" },
          { icone: "🔄", texte: "Retour facile sous 7 jours" },
          { icone: "📦", texte: "Livraison partout en Côte d'Ivoire" },
        ]
  );
  const [venteFlashActive, setVenteFlashActive] = useState(configInitiale.venteFlashActive !== false);
  const [venteFlashTitre, setVenteFlashTitre] = useState(configInitiale.venteFlashTitre || "🔥 Vente Flash — jusqu'à -50%");
  const [venteFlashSousTitre, setVenteFlashSousTitre] = useState(configInitiale.venteFlashSousTitre || "Offre valable sur une sélection de produits, stock limité");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function modifierMessage(i, champ, val) {
    setMessages((liste) => liste.map((m, j) => (j === i ? { ...m, [champ]: val } : m)));
  }

  async function sauvegarder() {
    setSaving(true);
    await supabase.from("workspaces").update({
      azali_config: { messagesAnnonce: messages, venteFlashActive, venteFlashTitre, venteFlashSousTitre },
    }).eq("id", workspace.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🎨 Personnaliser ma boutique</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 16, lineHeight: 1.5 }}>
          Les textes propres au design de ta boutique — pour le reste (logo, description, WhatsApp, réseaux), utilise "⚙️ Paramètres avancés".
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Bandeau du haut (4 messages)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input value={m.icone} onChange={(e) => modifierMessage(i, "icone", e.target.value)} style={{ width: 44, padding: "8px 6px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 14, textAlign: "center", boxSizing: "border-box" }} />
              <input value={m.texte} onChange={(e) => modifierMessage(i, "texte", e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
            <input type="checkbox" checked={venteFlashActive} onChange={(e) => setVenteFlashActive(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>🔥 Afficher la section Vente Flash</span>
          </label>
          {venteFlashActive && (
            <>
              <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Titre</div>
              <input value={venteFlashTitre} onChange={(e) => setVenteFlashTitre(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Sous-titre</div>
              <input value={venteFlashSousTitre} onChange={(e) => setVenteFlashSousTitre(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </>
          )}
        </div>

        <button onClick={sauvegarder} disabled={saving} style={{ width: "100%", marginTop: 18, background: saved ? "#1F9D6E" : "#16231F", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {saved ? "✅ Enregistré" : saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function CodesPromoModal({ workspaceId, currency, onClose }) {
  const [codes, setCodes] = useState(null);
  const [form, setForm] = useState({ code: "", type_remise: "pourcentage", valeur: "", montant_minimum: "", date_expiration: "", utilisation_max: "" });
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState("");

  async function charger() {
    const { data } = await supabase.from("codes_promo").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    setCodes(data || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function creerCode() {
    setErreur("");
    const codeNettoye = form.code.trim().toUpperCase().replace(/\s+/g, "");
    if (!codeNettoye) { setErreur("Donne un nom de code (ex: BIENVENUE10)."); return; }
    if (!form.valeur || Number(form.valeur) <= 0) { setErreur("Indique une valeur de remise."); return; }
    setCreation(true);
    const { error } = await supabase.from("codes_promo").insert([{
      workspace_id: workspaceId,
      code: codeNettoye,
      type_remise: form.type_remise,
      valeur: Number(form.valeur),
      montant_minimum: form.montant_minimum === "" ? null : Number(form.montant_minimum),
      date_expiration: form.date_expiration ? new Date(form.date_expiration).toISOString() : null,
      utilisation_max: form.utilisation_max === "" ? null : Number(form.utilisation_max),
    }]);
    if (error) {
      setErreur(error.message.includes("duplicate") || error.message.includes("unique") ? "Ce code existe déjà." : "Erreur : " + error.message);
    } else {
      setForm({ code: "", type_remise: "pourcentage", valeur: "", montant_minimum: "", date_expiration: "", utilisation_max: "" });
      await charger();
    }
    setCreation(false);
  }

  async function toggleActif(id, actuel) {
    await supabase.from("codes_promo").update({ actif: !actuel }).eq("id", id);
    await charger();
  }

  async function supprimerCode(id) {
    if (!window.confirm("Supprimer ce code promo définitivement ?")) return;
    await supabase.from("codes_promo").delete().eq("id", id);
    await charger();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🏷️ Codes promo</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 16, lineHeight: 1.5 }}>
          Crée un code que tes clients saisissent sur ta boutique publique pour obtenir une remise (ex: pour une pub, une story WhatsApp, un client fidèle).
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>+ Créer un nouveau code</div>
          <input
            placeholder="Nom du code (ex: BIENVENUE10)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box", textTransform: "uppercase" }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select value={form.type_remise} onChange={(e) => setForm({ ...form, type_remise: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, background: "white" }}>
              <option value="pourcentage">Remise en %</option>
              <option value="montant_fixe">Montant fixe ({currency})</option>
            </select>
            <input
              type="number"
              placeholder={form.type_remise === "pourcentage" ? "Ex: 10" : `Ex: 1000`}
              value={form.valeur}
              onChange={(e) => setForm({ ...form, valeur: e.target.value })}
              style={{ width: 110, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Commande minimum pour utiliser ce code (optionnel)</div>
          <input
            type="number"
            placeholder={`Ex: 10000 (laisse vide si aucun minimum)`}
            value={form.montant_minimum}
            onChange={(e) => setForm({ ...form, montant_minimum: e.target.value })}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Expire le (optionnel)</div>
              <input type="date" value={form.date_expiration} onChange={(e) => setForm({ ...form, date_expiration: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Utilisations max (optionnel)</div>
              <input type="number" placeholder="Illimité" value={form.utilisation_max} onChange={(e) => setForm({ ...form, utilisation_max: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          {erreur && <div style={{ color: "#D64933", fontSize: 12, marginBottom: 8, fontWeight: 600 }}>{erreur}</div>}
          <button onClick={creerCode} disabled={creation} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {creation ? "Création..." : "Créer le code"}
          </button>
        </div>

        {codes === null && <SkeletonListe nombre={3} />}
        {codes !== null && codes.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "20px 0" }}>Aucun code promo pour l'instant.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(codes || []).map((c) => {
            const expire = c.date_expiration && new Date(c.date_expiration) < new Date();
            const epuise = c.utilisation_max && c.utilisation_actuelle >= c.utilisation_max;
            return (
              <div key={c.id} style={{ background: c.actif && !expire && !epuise ? "white" : "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.02em" }}>{c.code}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>
                      {c.type_remise === "pourcentage" ? `${c.valeur}% de remise` : `${Number(c.valeur).toLocaleString("fr-FR")} ${currency} de remise`}
                      {c.montant_minimum ? ` · min. ${Number(c.montant_minimum).toLocaleString("fr-FR")} ${currency}` : ""}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 2 }}>
                      {c.utilisation_actuelle} utilisé{c.utilisation_actuelle > 1 ? "s" : ""}{c.utilisation_max ? ` / ${c.utilisation_max}` : ""}
                      {c.date_expiration && ` · expire le ${new Date(c.date_expiration).toLocaleDateString("fr-FR")}`}
                    </div>
                    {(expire || epuise) && <div style={{ fontSize: 10.5, color: "#D64933", fontWeight: 700, marginTop: 2 }}>{expire ? "Expiré" : "Limite atteinte"}</div>}
                  </div>
                  <button onClick={() => supprimerCode(c.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>🗑️</button>
                </div>
                <button
                  onClick={() => toggleActif(c.id, c.actif)}
                  style={{ width: "100%", marginTop: 8, background: c.actif ? "#EAF3DE" : "#F0EEE6", color: c.actif ? "#3B6D11" : "#8A9089", border: "none", borderRadius: 7, padding: "7px 0", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}
                >
                  {c.actif ? "✅ Actif — cliquer pour désactiver" : "⏸️ Désactivé — cliquer pour activer"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProspectsIAModal({ onClose }) {
  const [secteur, setSecteur] = useState("");
  const [ville, setVille] = useState("");
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState("");
  const [prospects, setProspects] = useState([]);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [chargement, setChargement] = useState(true);
  const [copie, setCopie] = useState(null);

  async function chargerProspects() {
    setChargement(true);
    let q = supabase.from("prospects").select("*").order("score", { ascending: false });
    if (filtreStatut) q = q.eq("statut", filtreStatut);
    const { data } = await q;
    setProspects(data || []);
    setChargement(false);
  }

  useEffect(() => { chargerProspects(); }, [filtreStatut]);

  async function lancerRecherche() {
    if (!secteur.trim()) { setErreur("Indique un secteur de recherche."); return; }
    setRecherche(true);
    setErreur("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "prospection", secteur, ville }),
      });
      const data = await resp.json();
      if (!resp.ok) { setErreur(data.error || "Erreur pendant la recherche."); setRecherche(false); return; }
      await chargerProspects();
      setSecteur("");
      setVille("");
    } catch (e) {
      setErreur(e.message);
    }
    setRecherche(false);
  }

  async function changerStatut(id, nouveauStatut) {
    await supabase.from("prospects").update({ statut: nouveauStatut, updated_at: new Date().toISOString() }).eq("id", id);
    chargerProspects();
  }

  function copierMessage(prospect) {
    navigator.clipboard.writeText(prospect.message_suggere || "");
    setCopie(prospect.id);
    setTimeout(() => setCopie(null), 2000);
  }

  function ouvrirWhatsApp(prospect) {
    const numeroPropre = String(prospect.telephone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${numeroPropre}?text=${encodeURIComponent(prospect.message_suggere || "")}`, "_blank");
    changerStatut(prospect.id, "CONTACTED");
  }

  const couleurStatut = { NEW: "#8A9089", CONTACTED: "#e8920a", RESPONDED: "#1a7a3c", HOT: "#D64933", CUSTOMER: "#1a7a3c", LOST: "#999", DO_NOT_CONTACT: "#666" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>🤖 Agent de recherche de prospects</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 10 }}>
            Décris le type d'entreprise à trouver — l'IA cherche sur le web, note leur potentiel sur 100, et rédige un message personnalisé pour chacune.
          </div>
          <input
            value={secteur}
            onChange={(e) => setSecteur(e.target.value)}
            placeholder="Secteur (ex: boutiques de vêtements sur Instagram)"
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8, boxSizing: "border-box" }}
          />
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Ville (optionnel, ex: Abidjan)"
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8, boxSizing: "border-box" }}
          />
          {erreur && <div style={{ background: "#FBEAE6", color: "#D64933", borderRadius: 8, padding: "8px 10px", fontSize: 11.5, marginBottom: 8 }}>⚠️ {erreur}</div>}
          <button onClick={lancerRecherche} disabled={recherche} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            {recherche ? "🔍 Recherche en cours (peut prendre 30-60 sec)..." : "🔍 Lancer la recherche"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {["", "NEW", "CONTACTED", "RESPONDED", "HOT", "CUSTOMER", "LOST"].map((s) => (
            <button key={s} onClick={() => setFiltreStatut(s)} style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid " + (filtreStatut === s ? "#1a7a3c" : "#ECE8DC"), background: filtreStatut === s ? "#1a7a3c" : "white", color: filtreStatut === s ? "white" : "#425048", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {s || "Tous"}
            </button>
          ))}
        </div>

        {chargement ? (
          <div style={{ textAlign: "center", padding: 30, color: "#8A9089", fontSize: 12 }}>Chargement...</div>
        ) : prospects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#8A9089", fontSize: 12 }}>Aucun prospect pour l'instant — lance une recherche ci-dessus.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {prospects.map((p) => (
              <div key={p.id} style={{ border: "1px solid #ECE8DC", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{p.nom || p.entreprise}</div>
                    <div style={{ fontSize: 11, color: "#8A9089" }}>{p.secteur} {p.ville ? `· ${p.ville}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: p.score >= 70 ? "#1a7a3c" : p.score >= 40 ? "#e8920a" : "#999" }}>{p.score}</div>
                    <span style={{ background: couleurStatut[p.statut] || "#999", color: "white", fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>{p.statut}</span>
                  </div>
                </div>
                {p.probleme_identifie && <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 8, fontStyle: "italic" }}>💡 {p.probleme_identifie}</div>}
                {p.message_suggere && (
                  <div style={{ background: "#FAFAF7", borderRadius: 8, padding: "9px 11px", fontSize: 11.5, color: "#16231F", marginBottom: 8, lineHeight: 1.5 }}>{p.message_suggere}</div>
                )}
                {p.site_web && <div style={{ fontSize: 10.5, marginBottom: 4 }}><a href={p.site_web} target="_blank" rel="noopener noreferrer" style={{ color: "#1a7a3c" }}>🔗 {p.site_web}</a></div>}
                {p.telephone && <div style={{ fontSize: 10.5, marginBottom: 8, color: "#6B7168" }}>📞 {p.telephone}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.telephone ? (
                    <button onClick={() => ouvrirWhatsApp(p)} style={{ border: "none", background: "#25d366", color: "white", borderRadius: 7, padding: "6px 12px", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
                      💬 Envoyer via WhatsApp
                    </button>
                  ) : (
                    <button onClick={() => copierMessage(p)} style={{ border: "1px solid #cfdad2", background: "#f8fbf8", color: "#1a7a3c", borderRadius: 7, padding: "6px 11px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                      {copie === p.id ? "✅ Copié" : "📋 Copier le message (pas de numéro trouvé)"}
                    </button>
                  )}
                  {p.statut === "NEW" && <button onClick={() => changerStatut(p.id, "CONTACTED")} style={{ border: "1px solid #e8920a", background: "white", color: "#e8920a", borderRadius: 7, padding: "6px 11px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Marquer contacté</button>}
                  {p.statut === "CONTACTED" && <button onClick={() => changerStatut(p.id, "RESPONDED")} style={{ border: "1px solid #1a7a3c", background: "white", color: "#1a7a3c", borderRadius: 7, padding: "6px 11px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>A répondu</button>}
                  <button onClick={() => changerStatut(p.id, "LOST")} style={{ border: "1px solid #ECE8DC", background: "white", color: "#999", borderRadius: 7, padding: "6px 11px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Perdu</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AvisModal({ workspaceId, onClose }) {
  const [avis, setAvis] = useState(null);
  const [produitsMap, setProduitsMap] = useState({});
  const [filtreProduitId, setFiltreProduitId] = useState("");
  const [afficherImport, setAfficherImport] = useState(false);
  const [produitImportId, setProduitImportId] = useState("");
  const [texteImport, setTexteImport] = useState("");
  const [importEnCours, setImportEnCours] = useState(false);

  function ligneCSVVersColonnes(ligne) {
    // Découpe une ligne CSV en colonnes, en gérant les champs entre guillemets
    // (qui peuvent contenir des virgules ou point-virgules sans casser le découpage).
    const separateur = ligne.includes(";") && !ligne.includes(",") ? ";" : ",";
    const colonnes = [];
    let colonneActuelle = "";
    let dansGuillemets = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (c === '"') { dansGuillemets = !dansGuillemets; continue; }
      if (c === separateur && !dansGuillemets) { colonnes.push(colonneActuelle.trim()); colonneActuelle = ""; continue; }
      colonneActuelle += c;
    }
    colonnes.push(colonneActuelle.trim());
    return colonnes;
  }

  function importerFichierCSVAvis(fichier) {
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = (e) => {
      const contenu = String(e.target.result || "");
      const lignes = contenu.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // Si la première ligne ressemble à un en-tête (nom, note, commentaire...), on l'ignore.
      const premiereLigneEstEntete = /nom|client|note|avis|comment/i.test(lignes[0] || "");
      const lignesUtiles = premiereLigneEstEntete ? lignes.slice(1) : lignes;
      const converties = lignesUtiles
        .map((l) => {
          const col = ligneCSVVersColonnes(l);
          if (col.length < 2) return null;
          return `${col[0] || "Client"} | ${col[1] || "5"} | ${(col[2] || "").replace(/\|/g, "-")}`;
        })
        .filter(Boolean)
        .join("\n");
      setTexteImport(converties);
      setResultatImport({ succes: true, message: `Fichier lu : ${lignesUtiles.length} ligne(s) prête(s) à importer. Vérifie l'aperçu ci-dessous puis clique sur "Importer ces avis".` });
    };
    lecteur.readAsText(fichier, "UTF-8");
  }

  const [resultatImport, setResultatImport] = useState(null);

  async function charger() {
    const { data: produitsData } = await supabase.from("produits").select("id, nom").eq("workspace_id", workspaceId);
    const map = {};
    (produitsData || []).forEach((p) => { map[p.id] = p.nom; });
    setProduitsMap(map);

    const { data } = await supabase
      .from("avis_produits")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    setAvis(data || []);
  }

  useEffect(() => {
    charger();
  }, []);

  async function importerAvisEnMasse() {
    if (!produitImportId) {
      setResultatImport({ succes: false, message: "Choisis d'abord un produit." });
      return;
    }
    const lignes = texteImport.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lignes.length === 0) {
      setResultatImport({ succes: false, message: "Colle au moins un avis." });
      return;
    }
    setImportEnCours(true);
    const avisAInserer = [];
    let ignorees = 0;
    for (const ligne of lignes) {
      const parties = ligne.split("|").map((p) => p.trim());
      if (parties.length < 2) { ignorees += 1; continue; }
      const nom = parties[0] || "Client AliExpress";
      const noteTrouvee = parseInt(parties[1], 10);
      const note = (noteTrouvee >= 1 && noteTrouvee <= 5) ? noteTrouvee : 5;
      const commentaire = parties.slice(2).join(" | ").trim() || null;
      avisAInserer.push({
        workspace_id: workspaceId,
        produit_id: produitImportId,
        client_nom: nom,
        note,
        commentaire,
        approuve: true, // importés directement approuvés, puisque déjà relus par toi avant collage
      });
    }
    if (avisAInserer.length > 0) {
      const { error } = await supabase.from("avis_produits").insert(avisAInserer);
      if (error) {
        setResultatImport({ succes: false, message: "Erreur : " + error.message });
        setImportEnCours(false);
        return;
      }
    }
    setImportEnCours(false);
    setResultatImport({ succes: true, message: `${avisAInserer.length} avis importé(s).${ignorees > 0 ? ` ${ignorees} ligne(s) ignorée(s) (format incorrect).` : ""}` });
    setTexteImport("");
    await charger();
  }

  async function approuver(id) {
    await supabase.from("avis_produits").update({ approuve: true }).eq("id", id);
    await charger();
  }

  async function supprimer(id) {
    await supabase.from("avis_produits").delete().eq("id", id);
    await charger();
  }

  function echapperCSV(valeur) {
    const texte = String(valeur ?? "");
    return /[",\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  }

  function exporterCSV() {
    const liste = filtreProduitId ? (avis || []).filter((a) => a.produit_id === filtreProduitId) : (avis || []);
    if (liste.length === 0) { alert("Aucun avis à exporter."); return; }
    const entetes = ["Produit", "Client", "Note", "Commentaire", "Statut", "Date"];
    const lignes = liste.map((a) => [
      produitsMap[a.produit_id] || "",
      a.client_nom || "",
      a.note,
      a.commentaire || "",
      a.approuve ? "Publié" : "En attente",
      new Date(a.created_at).toLocaleString("fr-FR"),
    ].map(echapperCSV).join(","));
    const csv = "\uFEFF" + [entetes.join(","), ...lignes].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const nomFichier = filtreProduitId ? (produitsMap[filtreProduitId] || "produit").replace(/[^a-z0-9]+/gi, "-") : "tous-les-produits";
    a.download = `avis-${nomFichier}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const produitsAvecAvis = Object.entries(produitsMap).filter(([id]) => (avis || []).some((a) => a.produit_id === id));

  const enAttente = ((filtreProduitId ? (avis || []).filter((a) => a.produit_id === filtreProduitId) : avis) || []).filter((a) => !a.approuve);
  const approuves = ((filtreProduitId ? (avis || []).filter((a) => a.produit_id === filtreProduitId) : avis) || []).filter((a) => a.approuve);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>⭐ Avis clients</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <button
          onClick={() => setAfficherImport(!afficherImport)}
          style={{ width: "100%", background: afficherImport ? "#1a7a3c" : "#FAFAF7", color: afficherImport ? "white" : "#16231F", border: "1px solid " + (afficherImport ? "#1a7a3c" : "#ECE8DC"), borderRadius: 10, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginBottom: 14 }}
        >
          📥 {afficherImport ? "Fermer l'import" : "Importer plusieurs avis d'un coup (ex: AliExpress)"}
        </button>

        {afficherImport && (
          <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 10, lineHeight: 1.6 }}>
              Deux façons d'importer : <strong>1)</strong> choisis un fichier CSV avec 3 colonnes (Nom, Note, Commentaire) — exporté depuis Excel ou Google Sheets. <strong>2)</strong> ou copie chaque avis depuis AliExpress et colle-les directement, un avis par ligne, dans ce format :<br />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", background: "white", padding: "2px 5px", borderRadius: 4, display: "inline-block", marginTop: 4 }}>Nom du client | Note (1 à 5) | Le commentaire</span>
            </div>
            <select value={produitImportId} onChange={(e) => setProduitImportId(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, background: "white", marginBottom: 8, boxSizing: "border-box" }}>
              <option value="">Choisir le produit concerné...</option>
              {Object.entries(produitsMap).map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", boxSizing: "border-box", border: "1px solid #cfdad2", background: "#f8fbf8", color: "#1a7a3c", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              📄 Choisir un fichier CSV (colonnes : Nom, Note, Commentaire)
              <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => importerFichierCSVAvis(e.target.files?.[0])} />
            </label>
            <div style={{ textAlign: "center", fontSize: 10.5, color: "#8A9089", marginBottom: 10 }}>— ou colle directement le texte ci-dessous —</div>
            <textarea
              value={texteImport}
              onChange={(e) => setTexteImport(e.target.value)}
              placeholder={"Fatou K. | 5 | Très bon produit, livraison rapide !\nMoussa D. | 4 | Correspond à la description, je recommande\nAïcha B. | 5 | Excellent rapport qualité prix"}
              rows={6}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12, marginBottom: 8, boxSizing: "border-box", fontFamily: "'IBM Plex Mono', monospace", resize: "vertical" }}
            />
            {resultatImport && (
              <div style={{ background: resultatImport.succes ? "#EAF3DE" : "#FBEAE6", border: "1px solid " + (resultatImport.succes ? "#C7DDA3" : "#F0B8AC"), borderRadius: 8, padding: "8px 10px", marginBottom: 8, fontSize: 11.5, color: resultatImport.succes ? "#3B6D11" : "#D64933" }}>
                {resultatImport.succes ? "✅ " : "⚠️ "}{resultatImport.message}
              </div>
            )}
            <button onClick={importerAvisEnMasse} disabled={importEnCours} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              {importEnCours ? "Import en cours..." : "Importer ces avis"}
            </button>
          </div>
        )}

        {avis !== null && avis.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <select value={filtreProduitId} onChange={(e) => setFiltreProduitId(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, background: "white" }}>
              <option value="">Tous les produits</option>
              {produitsAvecAvis.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
            <button onClick={exporterCSV} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>⬇️ Export CSV</button>
          </div>
        )}

        {avis === null && <SkeletonListe nombre={3} />}

        {avis !== null && enAttente.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#8A6412", marginBottom: 10 }}>⏳ En attente d'approbation ({enAttente.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {enAttente.map((a) => (
                <div key={a.id} style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: "#8A6412", marginBottom: 4 }}>{produitsMap[a.produit_id] || "Produit"}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.client_nom}</span>
                    <span style={{ color: "#e8920a", fontSize: 12 }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
                  </div>
                  {a.commentaire && <div style={{ fontSize: 12.5, color: "#16231F", marginTop: 4 }}>{a.commentaire}</div>}
                  {a.photo_url && <img src={a.photo_url} alt="Photo client" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginTop: 6, cursor: "pointer" }} onClick={() => window.open(a.photo_url, "_blank")} />}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => approuver(a.id)} style={{ flex: 1, background: "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✅ Approuver</button>
                    <button onClick={() => supprimer(a.id)} style={{ flex: 1, background: "white", border: "1px solid #DDD8CC", color: "#D64933", borderRadius: 7, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑️ Rejeter</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>✅ Publiés ({approuves.length})</div>
        {approuves.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucun avis publié pour l'instant.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {approuves.map((a) => (
            <div key={a.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>{produitsMap[a.produit_id] || "Produit"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.client_nom}</span>
                <span style={{ color: "#e8920a", fontSize: 12 }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
              </div>
              {a.commentaire && <div style={{ fontSize: 12.5, color: "#16231F", marginTop: 4 }}>{a.commentaire}</div>}
                  {a.photo_url && <img src={a.photo_url} alt="Photo client" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginTop: 6, cursor: "pointer" }} onClick={() => window.open(a.photo_url, "_blank")} />}
              <button onClick={() => supprimer(a.id)} style={{ marginTop: 6, background: "none", border: "none", color: "#D64933", fontSize: 11.5, cursor: "pointer", padding: 0 }}>🗑️ Retirer</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemoignagesModal({ workspace, onClose }) {
  const [liste, setListe] = useState(Array.isArray(workspace.temoignages_manuels) ? workspace.temoignages_manuels : []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nom, setNom] = useState("");
  const [note, setNote] = useState(5);
  const [texte, setTexte] = useState("");

  function ajouter() {
    if (!nom.trim() || !texte.trim()) return;
    setListe((l) => [...l, { id: "t" + Date.now(), nom: nom.trim(), note, texte: texte.trim() }]);
    setNom("");
    setNote(5);
    setTexte("");
  }

  function supprimer(id) {
    setListe((l) => l.filter((t) => t.id !== id));
  }

  async function sauvegarder() {
    setSaving(true);
    await supabase.from("workspaces").update({ temoignages_manuels: liste }).eq("id", workspace.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>💬 Témoignages</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 16, lineHeight: 1.5 }}>
          Écris toi-même des témoignages à afficher sur ta boutique. Les vrais avis clients approuvés s'affichent aussi automatiquement à côté, tu n'as pas besoin de les recopier ici.
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <input placeholder="Nom du client" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setNote(n)} style={{ background: "none", border: "none", padding: 0, fontSize: 22, cursor: "pointer", color: n <= note ? "#e8920a" : "#DDD8CC" }}>★</button>
            ))}
          </div>
          <textarea placeholder="Le témoignage..." value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }} />
          <button onClick={ajouter} disabled={!nom.trim() || !texte.trim()} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer", opacity: (!nom.trim() || !texte.trim()) ? 0.5 : 1 }}>＋ Ajouter ce témoignage</button>
        </div>

        {liste.length === 0 ? (
          <div style={{ color: "#8A9089", fontSize: 13, marginBottom: 16 }}>Aucun témoignage écrit pour l'instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {liste.map((t) => (
              <div key={t.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t.nom}</span>
                  <span style={{ color: "#e8920a", fontSize: 12 }}>{"★".repeat(t.note)}{"☆".repeat(5 - t.note)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#16231F", marginTop: 4 }}>{t.texte}</div>
                <button onClick={() => supprimer(t.id)} style={{ marginTop: 6, background: "none", border: "none", color: "#D64933", fontSize: 11.5, cursor: "pointer", padding: 0 }}>🗑️ Retirer</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={sauvegarder} disabled={saving} style={{ width: "100%", background: saved ? "#1F9D6E" : "#16231F", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {saved ? "✅ Enregistré" : saving ? "Enregistrement..." : "Enregistrer les témoignages"}
        </button>
      </div>
    </div>
  );
}

function ProduitsModal({ produits, onAdd, onUpdateCout, onUpdateFraisImport, onUpdateStock, onUpdatePrixVente, onUpdatePhoto, onUpdateDescription, onUpdateGalerie, onUpdateLivraisonBundles, quantitesParProduit, onDelete, currency, workspaceId, onClose, onImportCSV }) {
  const [selectedId, setSelectedId] = useState(produits[0]?.id || null);
  const [recherche, setRecherche] = useState("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauCout, setNouveauCout] = useState("");
  const [ajoutOuvert, setAjoutOuvert] = useState(produits.length === 0);
  const [importEnCours, setImportEnCours] = useState(false);
  const [resultatImport, setResultatImport] = useState(null);
  const [photoEnvoiId, setPhotoEnvoiId] = useState(null);
  const [galerieEnvoiId, setGalerieEnvoiId] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [creationErreur, setCreationErreur] = useState("");
  const [derniereCreation, setDerniereCreation] = useState("");

  // États locaux du produit sélectionné (édition avant sauvegarde)
  const [champs, setChamps] = useState({ cout: "", fraisImport: "", prixVente: "", stock: "", description: "" });
  const [livraison, setLivraison] = useState({ livraison_gratuite: false, frais_livraison_produit: "", frais_expedition_produit: "", bundles: [], masquer_produits_similaires: false, bump_produit_id: "", bump_prix_special: "", produits_similaires_ids: [], produits_similaires_collection_id: "" });
  const [collectionsDispo, setCollectionsDispo] = useState([]);

  useEffect(() => {
    supabase.from("collections").select("id, nom").eq("workspace_id", workspaceId).order("ordre", { ascending: true }).then(({ data }) => setCollectionsDispo(data || []));
  }, [workspaceId]);
  const [optionsProduit, setOptionsProduit] = useState([{ nom: "", valeursTexte: "" }, { nom: "", valeursTexte: "" }, { nom: "", valeursTexte: "" }]);
  const [variantesListe, setVariantesListe] = useState([]);
  const [savedFlash, setSavedFlash] = useState(null); // nom du champ qui vient d'être enregistré

  const produitsFiltres = recherche.trim()
    ? produits.filter((p) => p.nom.toLowerCase().includes(recherche.trim().toLowerCase()))
    : produits;
  const selected = produits.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    if (selected) {
      setChamps({
        cout: String(selected.cout_achat ?? ""),
        fraisImport: String(selected.frais_import_unitaire ?? ""),
        prixVente: String(selected.prix_vente ?? ""),
        stock: String(selected.stock_initial ?? ""),
        description: selected.description || "",
      });
      setLivraison({
        livraison_gratuite: !!selected.livraison_gratuite,
        frais_livraison_produit: selected.frais_livraison_produit ?? "",
        frais_expedition_produit: selected.frais_expedition_produit ?? "",
        bundles: Array.isArray(selected.bundles) ? selected.bundles : [],
        masquer_produits_similaires: !!selected.masquer_produits_similaires,
        bump_produit_id: selected.bump_produit_id || "",
        bump_prix_special: selected.bump_prix_special ?? "",
        produits_similaires_ids: Array.isArray(selected.produits_similaires_ids) ? selected.produits_similaires_ids : [],
        produits_similaires_collection_id: selected.produits_similaires_collection_id || "",
      });
      const optsExistantes = Array.isArray(selected.options) ? selected.options : [];
      setOptionsProduit([0, 1, 2].map((i) => optsExistantes[i] ? { nom: optsExistantes[i].nom || "", valeursTexte: (optsExistantes[i].valeurs || []).join(", ") } : { nom: "", valeursTexte: "" }));
      setVariantesListe(Array.isArray(selected.variantes) ? selected.variantes.map((v) => ({ ...v, prix: v.prix ?? "", stock: v.stock ?? "" })) : []);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(nom) {
    setSavedFlash(nom);
    setTimeout(() => setSavedFlash((f) => (f === nom ? null : f)), 1600);
  }

  function regenererVariantes() {
    const optionsValides = optionsProduit.filter((o) => o.nom.trim() && o.valeursTexte.trim());
    if (optionsValides.length === 0) { setVariantesListe([]); return; }
    const listesValeurs = optionsValides.map((o) => o.valeursTexte.split(",").map((v) => v.trim()).filter(Boolean));
    let combos = [{}];
    optionsValides.forEach((o, i) => {
      const nouvelles = [];
      combos.forEach((c) => {
        listesValeurs[i].forEach((v) => { nouvelles.push({ ...c, [o.nom.trim()]: v }); });
      });
      combos = nouvelles;
    });
    setVariantesListe((ancienneListe) =>
      combos.map((combinaison) => {
        const cle = JSON.stringify(combinaison);
        const existant = ancienneListe.find((v) => JSON.stringify(v.combinaison) === cle);
        return existant || { id: "v" + Date.now() + Math.random().toString(36).slice(2), combinaison, prix: "", stock: "" };
      })
    );
  }

  async function envoyerPhoto(produitId, fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) {
      alert("L'image est trop lourde (max 5 Mo). Choisis une photo plus légère.");
      return;
    }
    setPhotoEnvoiId(produitId);
    const fichierCompresse = await compresserImage(fichier);
    const extension = fichierCompresse.name.split(".").pop();
    const chemin = `${produitId}-${Date.now()}.${extension}`;
    const { error: erreurUpload } = await supabase.storage.from("produits").upload(chemin, fichierCompresse, { upsert: true });
    if (erreurUpload) {
      alert("Erreur lors de l'envoi de la photo : " + erreurUpload.message);
      setPhotoEnvoiId(null);
      return;
    }
    const { data } = supabase.storage.from("produits").getPublicUrl(chemin);
    await onUpdatePhoto(produitId, data.publicUrl);
    setPhotoEnvoiId(null);
  }

  async function ajouterPhotoGalerie(produit, fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) {
      alert("L'image est trop lourde (max 5 Mo). Choisis une photo plus légère.");
      return;
    }
    setGalerieEnvoiId(produit.id);
    const fichierCompresse = await compresserImage(fichier);
    const extension = fichierCompresse.name.split(".").pop();
    const chemin = `${produit.id}-galerie-${Date.now()}.${extension}`;
    const { error: erreurUpload } = await supabase.storage.from("produits").upload(chemin, fichierCompresse, { upsert: true });
    if (erreurUpload) {
      alert("Erreur lors de l'envoi de la photo : " + erreurUpload.message);
      setGalerieEnvoiId(null);
      return;
    }
    const { data } = supabase.storage.from("produits").getPublicUrl(chemin);
    const nouvelleGalerie = [...(produit.photos_galerie || []), data.publicUrl];
    await onUpdateGalerie(produit.id, nouvelleGalerie);
    setGalerieEnvoiId(null);
  }

  async function retirerPhotoGalerie(produit, urlARetirer) {
    const nouvelleGalerie = (produit.photos_galerie || []).filter((u) => u !== urlARetirer);
    await onUpdateGalerie(produit.id, nouvelleGalerie);
  }

  async function ajouter() {
    if (!nouveauNom.trim()) return;
    setCreationEnCours(true);
    setCreationErreur("");
    const nomCree = nouveauNom.trim();
    let resultat = null;
    try {
      resultat = await onAdd({ nom: nomCree, cout_achat: nouveauCout });
    } catch (e) {
      resultat = null;
    }
    setCreationEnCours(false);
    if (!resultat) {
      setCreationErreur("La création a échoué. Vérifie ta connexion et réessaie.");
      return;
    }
    setNouveauNom("");
    setNouveauCout("");
    setAjoutOuvert(false);
    // Sélectionne automatiquement le produit qu'on vient de créer, s'il est renvoyé
    if (resultat?.id) setSelectedId(resultat.id);
    setDerniereCreation(nomCree);
    setTimeout(() => setDerniereCreation((n) => (n === nomCree ? "" : n)), 3500);
  }

  const totalStock = produits.reduce((s, p) => s + Number(p.stock_initial || 0), 0);
  const totalVendu = produits.reduce((s, p) => s + (quantitesParProduit[p.nom]?.commandees || 0), 0);
  const totalLivre = produits.reduce((s, p) => s + (quantitesParProduit[p.nom]?.livrees || 0), 0);

  const q = selected ? (quantitesParProduit[selected.nom] || { commandees: 0, livrees: 0 }) : { commandees: 0, livrees: 0 };
  const stockSel = selected ? Number(selected.stock_initial || 0) : 0;
  const restantSel = stockSel - q.commandees;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }} onClick={onClose}>
      <style>{`
        .rv-pm-body { display: flex; min-height: 0; flex: 1; }
        .rv-pm-list { width: 340px; flex-shrink: 0; border-right: 1px solid #ECE8DC; }
        .rv-pm-detail { flex: 1; min-width: 0; }
        @media (max-width: 860px) {
          .rv-pm-body { flex-direction: column; overflow-y: auto; }
          .rv-pm-list { width: 100%; border-right: none; border-bottom: 1px solid #ECE8DC; max-height: 260px; }
        }
        .rv-pm-field:focus { outline: 2px solid #1a7a3c; outline-offset: -1px; }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 1180, height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "sans-serif" }}>

        {/* ===== Barre du haut ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", borderBottom: "1px solid #ECE8DC", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 19 }}>📦 Catalogue produits</div>
          {produits.length > 0 && (
            <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "#6B7168" }}>
              <span><strong style={{ color: "#16231F" }}>{totalStock}</strong> en stock</span>
              <span><strong style={{ color: "#8A6412" }}>{totalVendu}</strong> engagé</span>
              <span><strong style={{ color: "#1F9D6E" }}>{totalLivre}</strong> livré</span>
            </div>
          )}
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8A9089" }}>×</button>
        </div>

        <div className="rv-pm-body">
          {/* ===== Colonne gauche : liste ===== */}
          <div className="rv-pm-list" style={{ display: "flex", flexDirection: "column", background: "#FAFAF7" }}>
            <div style={{ padding: 14, borderBottom: "1px solid #ECE8DC" }}>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="🔍 Rechercher un produit..."
                style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setAjoutOuvert((v) => !v)} style={{ flex: 1, background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>＋ Nouveau produit</button>
              </div>
            </div>

            {ajoutOuvert && (
              <div style={{ padding: 14, borderBottom: "1px solid #ECE8DC", background: "#fff" }}>
                <input placeholder="Nom du produit" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
                <input placeholder="Coût d'achat (optionnel)" type="number" value={nouveauCout} onChange={(e) => setNouveauCout(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                {creationErreur && <div style={{ color: "#D64933", fontSize: 11.5, marginBottom: 8, fontWeight: 600 }}>⚠️ {creationErreur}</div>}
                <button onClick={ajouter} disabled={creationEnCours || !nouveauNom.trim()} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: creationEnCours ? "default" : "pointer", opacity: creationEnCours || !nouveauNom.trim() ? 0.6 : 1 }}>{creationEnCours ? "Création..." : "Créer le produit"}</button>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: 14, background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 9, padding: "9px 0", fontWeight: 700, fontSize: 12, color: "#3B6D11", cursor: importEnCours ? "default" : "pointer" }}>
              {importEnCours ? "Import en cours..." : "📥 Importer un CSV"}
              <input
                type="file" accept=".csv" style={{ display: "none" }}
                onChange={async (e) => {
                  const fichier = e.target.files?.[0];
                  if (!fichier) return;
                  setImportEnCours(true);
                  setResultatImport(null);
                  try {
                    const texte = await fichier.text();
                    const brut = parserCSV(texte);
                    const mappe = mapperColonnesShopify(brut);
                    if (mappe.length === 0) {
                      setResultatImport({ succes: false, message: "Aucun produit reconnu dans ce fichier." });
                    } else {
                      const resultat = await onImportCSV(mappe);
                      if (resultat.succes) {
                        setResultatImport({ succes: true, message: `${resultat.importes} produit(s) importé(s).${resultat.ignores > 0 ? ` ${resultat.ignores} ignoré(s).` : ""}${resultat.collectionsCreees > 0 ? ` ${resultat.collectionsCreees} collection(s) recréée(s) automatiquement.` : ""}` });
                      } else {
                        setResultatImport({ succes: false, message: resultat.message || "Erreur lors de l'import." });
                      }
                    }
                  } catch (err) {
                    setResultatImport({ succes: false, message: "Impossible de lire ce fichier : " + err.message });
                  }
                  setImportEnCours(false);
                  e.target.value = "";
                }}
              />
            </label>
            {resultatImport && (
              <div style={{ margin: "0 14px 10px", background: resultatImport.succes ? "#EAF3DE" : "#FBEAE6", border: `1px solid ${resultatImport.succes ? "#C7DDA3" : "#F0B8AC"}`, borderRadius: 8, padding: "8px 10px", fontSize: 11.5, color: resultatImport.succes ? "#3B6D11" : "#D64933" }}>
                {resultatImport.succes ? "✅ " : "⚠️ "}{resultatImport.message}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
              {produitsFiltres.length === 0 && (
                <div style={{ color: "#8A9089", fontSize: 12.5, textAlign: "center", padding: "24px 10px" }}>
                  {produits.length === 0 ? "Aucun produit dans le catalogue." : "Aucun résultat."}
                </div>
              )}
              {produitsFiltres.map((p) => {
                const qp = quantitesParProduit[p.nom] || { commandees: 0, livrees: 0 };
                const st = Number(p.stock_initial || 0);
                const rest = st - qp.commandees;
                const actif = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      background: actif ? "#EAF3DE" : "transparent", border: actif ? "1px solid #C7DDA3" : "1px solid transparent",
                      borderRadius: 9, padding: 9, cursor: "pointer", marginBottom: 4,
                    }}
                  >
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 7, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 650, fontSize: 12.8, color: "#16231F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</div>
                      <div style={{ fontSize: 11, color: p.prix_vente ? "#1a7a3c" : "#D64933", fontWeight: 700 }}>
                        {p.prix_vente ? `${Number(p.prix_vente).toLocaleString("fr-FR")} ${currency}` : "Prix manquant"}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: st > 0 && rest <= 5 ? "#D64933" : "#8A9089", flexShrink: 0 }}>
                      {st > 0 ? `${rest} rest.` : "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===== Colonne droite : éditeur détaillé ===== */}
          <div className="rv-pm-detail" style={{ overflowY: "auto", padding: "22px 28px 60px" }}>
            {derniereCreation && (
              <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", color: "#3B6D11", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, marginBottom: 16 }}>
                ✅ « {derniereCreation} » a été créé et ajouté au catalogue.
              </div>
            )}
            {!selected ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8A9089", fontSize: 13.5, textAlign: "center", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 38 }}>📦</div>
                Sélectionne un produit à gauche, ou crées-en un nouveau.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 21, color: "#16231F" }}>{selected.nom}</div>
                    <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 3 }}>Le nom doit rester identique à celui utilisé dans tes commandes.</div>
                  </div>
                  {confirmSuppr === selected.id ? (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { onDelete(selected.id); setConfirmSuppr(null); setSelectedId(null); }} style={{ background: "#D64933", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirmer</button>
                      <button onClick={() => setConfirmSuppr(null)} style={{ background: "#fff", border: "1px solid #DDD8CC", borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Annuler</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmSuppr(selected.id)} style={{ flexShrink: 0, background: "none", border: "1px solid #F0B8AC", color: "#D64933", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️ Supprimer</button>
                  )}
                </div>

                {/* --- Carte Médias --- */}
                <Carte titre="🖼️ Médias">
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 6, fontWeight: 600 }}>Photo principale</div>
                      <label style={{ display: "block", width: 120, height: 120, borderRadius: 12, border: "1.5px dashed #DDD8CC", cursor: "pointer", position: "relative", overflow: "hidden", background: "#FAFAF7" }}>
                        {photoEnvoiId === selected.id ? (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8A9089" }}>Envoi...</div>
                        ) : selected.photo_url ? (
                          <img src={selected.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#C7C2B4" }}>＋</div>
                        )}
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => envoyerPhoto(selected.id, e.target.files?.[0])} />
                      </label>
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 6, fontWeight: 600 }}>Galerie ({(selected.photos_galerie || []).length}/6)</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(selected.photos_galerie || []).map((url) => (
                          <div key={url} style={{ position: "relative" }}>
                            <img src={url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", border: "1px solid #DDD8CC" }} />
                            <button onClick={() => retirerPhotoGalerie(selected, url)} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#D64933", color: "white", border: "none", fontSize: 11, lineHeight: 1, cursor: "pointer" }}>×</button>
                          </div>
                        ))}
                        {(selected.photos_galerie || []).length < 6 && (
                          <label style={{ width: 60, height: 60, borderRadius: 8, border: "1.5px dashed #DDD8CC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#C7C2B4" }}>
                            {galerieEnvoiId === selected.id ? <span style={{ fontSize: 9, color: "#8A9089" }}>...</span> : "＋"}
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => ajouterPhotoGalerie(selected, e.target.files?.[0])} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </Carte>

                {/* --- Carte Description --- */}
                <Carte titre="📝 Description">
                  <EditeurRiche
                    key={selected.id}
                    valeur={selected.description || ""}
                    onChange={(v) => setChamps((c) => ({ ...c, description: v }))}
                    workspaceId={workspaceId}
                    placeholder="Description visible par les clients en boutique"
                  />
                  <BoutonEnregistrer
                    visible={champs.description !== (selected.description || "")}
                    onClick={() => { onUpdateDescription(selected.id, champs.description); flash("description"); }}
                    flash={savedFlash === "description"}
                  />
                </Carte>

                {/* --- Carte Tarification --- */}
                <Carte titre="💰 Tarification">
                  <div className="rv-pm-grid2">
                    <Champ label={`Prix de vente (${currency})`} obligatoire={!selected.prix_vente}>
                      <input type="number" className="rv-pm-field" value={champs.prixVente} onChange={(e) => setChamps((c) => ({ ...c, prixVente: e.target.value }))} onBlur={() => { if (champs.prixVente !== String(selected.prix_vente ?? "")) { onUpdatePrixVente(selected.id, champs.prixVente); flash("prix"); } }} style={champStyle} />
                    </Champ>
                    <Champ label={`Coût d'achat (${currency})`}>
                      <input type="number" className="rv-pm-field" value={champs.cout} onChange={(e) => setChamps((c) => ({ ...c, cout: e.target.value }))} onBlur={() => { if (champs.cout !== String(selected.cout_achat ?? "")) { onUpdateCout(selected.id, champs.cout); flash("cout"); } }} style={champStyle} />
                    </Champ>
                    <Champ label={`🚢 Transport + douane / pièce (${currency})`}>
                      <input type="number" className="rv-pm-field" value={champs.fraisImport} onChange={(e) => setChamps((c) => ({ ...c, fraisImport: e.target.value }))} onBlur={() => { if (champs.fraisImport !== String(selected.frais_import_unitaire ?? "")) { onUpdateFraisImport(selected.id, champs.fraisImport); flash("frais"); } }} style={champStyle} />
                    </Champ>
                  </div>
                  {(savedFlash === "prix" || savedFlash === "cout" || savedFlash === "frais") && <ConfirmationEnregistre />}
                </Carte>

                {/* --- Carte Variantes --- */}
                <Carte titre="🎨 Variantes">
                  <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 10, lineHeight: 1.5 }}>
                    Jusqu'à 3 types d'options (ex: Couleur, Taille, Matière). Laisse un prix vide pour garder le prix de vente par défaut.
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                    {optionsProduit.map((o, i) => (
                      <div key={i} style={{ display: "flex", gap: 6 }}>
                        <input placeholder={`Option ${i + 1} (ex: ${["Couleur", "Taille", "Matière"][i]})`} value={o.nom} onChange={(e) => setOptionsProduit((liste) => liste.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5 }} />
                        <input placeholder="Valeurs séparées par des virgules" value={o.valeursTexte} onChange={(e) => setOptionsProduit((liste) => liste.map((x, j) => (j === i ? { ...x, valeursTexte: e.target.value } : x)))} style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5 }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={regenererVariantes} style={{ border: "1px dashed #9fb5a5", background: "#f7faf7", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#1a7a3c", cursor: "pointer", marginBottom: 14 }}>
                    🔄 Générer les variantes
                  </button>

                  {variantesListe.length > 0 && (
                    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                      {variantesListe.map((v, i) => (
                        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #ECE8DC", borderRadius: 9, padding: "8px 10px" }}>
                          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#16231F" }}>{Object.values(v.combinaison).join(" / ")}</div>
                          <input type="number" placeholder={`Prix (${currency})`} value={v.prix} onChange={(e) => setVariantesListe((liste) => liste.map((x, j) => (j === i ? { ...x, prix: e.target.value } : x)))} style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                          <input type="number" placeholder="Stock" value={v.stock} onChange={(e) => setVariantesListe((liste) => liste.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <button
                      onClick={() => {
                        onUpdateLivraisonBundles(selected.id, {
                          options: optionsProduit.filter((o) => o.nom.trim() && o.valeursTexte.trim()).map((o) => ({ nom: o.nom.trim(), valeurs: o.valeursTexte.split(",").map((v) => v.trim()).filter(Boolean) })),
                          variantes: variantesListe.map((v) => ({ id: v.id, combinaison: v.combinaison, prix: v.prix === "" ? null : Number(v.prix), stock: v.stock === "" ? 0 : Number(v.stock) })),
                        });
                        flash("variantes");
                      }}
                      style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Enregistrer les variantes
                    </button>
                    {savedFlash === "variantes" && <ConfirmationEnregistre inline />}
                  </div>
                </Carte>

                {/* --- Carte Inventaire --- */}
                <Carte titre="📦 Inventaire">
                  <div className="rv-pm-grid2">
                    <Champ label="Stock acheté (pièces)">
                      <input type="number" className="rv-pm-field" value={champs.stock} onChange={(e) => setChamps((c) => ({ ...c, stock: e.target.value }))} onBlur={() => { if (champs.stock !== String(selected.stock_initial ?? "")) { onUpdateStock(selected.id, champs.stock); flash("stock"); } }} style={champStyle} />
                    </Champ>
                  </div>
                  {savedFlash === "stock" && <ConfirmationEnregistre />}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <StatPill label="Engagé" valeur={q.commandees} couleur="#8A6412" fond="#FBF3E3" />
                    <StatPill label="Livré" valeur={q.livrees} couleur="#1F9D6E" fond="#EAF7F1" />
                    <StatPill label="Restant" valeur={stockSel > 0 ? restantSel : "—"} couleur={restantSel <= 5 && stockSel > 0 ? "#D64933" : "#3B6D11"} fond={restantSel <= 5 && stockSel > 0 ? "#FBEAE6" : "#EAF3DE"} />
                  </div>
                  {stockSel > 0 && restantSel <= 5 && restantSel > 0 && <div style={{ fontSize: 11, color: "#D64933", marginTop: 8, fontWeight: 600 }}>⚠️ Stock bientôt épuisé</div>}
                  {stockSel > 0 && restantSel <= 0 && <div style={{ fontSize: 11, color: "#D64933", marginTop: 8, fontWeight: 600 }}>🔴 Stock épuisé</div>}
                </Carte>

                {/* --- Carte Livraison & bundles --- */}
                <Carte titre="🚚 Livraison & 🎁 Bundles">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
                    <input type="checkbox" checked={livraison.livraison_gratuite} onChange={(e) => setLivraison((v) => ({ ...v, livraison_gratuite: e.target.checked }))} />
                    🎁 Livraison gratuite pour ce produit
                  </label>
                  {!livraison.livraison_gratuite && (
                    <div className="rv-pm-grid2" style={{ marginBottom: 10 }}>
                      <Champ label={`Frais livraison locale (${currency})`}>
                        <input type="number" className="rv-pm-field" placeholder="Frais boutique par défaut" value={livraison.frais_livraison_produit} onChange={(e) => setLivraison((v) => ({ ...v, frais_livraison_produit: e.target.value }))} style={champStyle} />
                      </Champ>
                      <Champ label={`Frais expédition (${currency})`}>
                        <input type="number" className="rv-pm-field" placeholder="Frais boutique par défaut" value={livraison.frais_expedition_produit} onChange={(e) => setLivraison((v) => ({ ...v, frais_expedition_produit: e.target.value }))} style={champStyle} />
                      </Champ>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 14 }}>Laisse vide pour utiliser les frais généraux de la boutique.</div>

                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F", marginBottom: 8 }}>Bundles de ce produit</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 10 }}>
                    {livraison.bundles.map((b, i) => (
                      <div key={b.id || i} style={{ border: "1px solid #ECE8DC", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input placeholder="Nom (ex: Pack x2)" value={b.label} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                          <button onClick={() => setLivraison((v) => ({ ...v, bundles: v.bundles.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 14 }}>×</button>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                          <input type="number" min="1" placeholder="Qté" value={b.qty} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)) }))} style={{ width: 60, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                          <select value={b.mode || "pourcentage"} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)) }))} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, background: "white" }}>
                            <option value="pourcentage">Remise %</option>
                            <option value="prix_fixe">Prix fixe</option>
                            <option value="offert">Achetez X, Y offert(s)</option>
                          </select>
                        </div>
                        {b.mode === "prix_fixe" ? (
                          <input type="number" min="0" placeholder={`Prix total (${currency})`} value={b.prix_fixe ?? ""} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, prix_fixe: e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0) } : x)) }))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, boxSizing: "border-box" }} />
                        ) : b.mode === "offert" ? (
                          <input type="number" min="1" max={Math.max(1, b.qty - 1)} placeholder={`Nombre offert (sur ${b.qty})`} value={b.nb_offerts ?? ""} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, nb_offerts: e.target.value === "" ? "" : Math.min(x.qty - 1, Math.max(1, Number(e.target.value) || 1)) } : x)) }))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, boxSizing: "border-box" }} />
                        ) : (
                          <input type="number" min="0" max="90" placeholder="Remise %" value={b.discount ?? ""} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, discount: Math.min(90, Math.max(0, Number(e.target.value) || 0)) } : x)) }))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, boxSizing: "border-box" }} />
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <label style={{ fontSize: 10.5, color: "#8A9089" }}>Couleur de fond</label>
                          <input type="color" value={b.couleur_fond || "#FFFFFF"} onChange={(e) => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, couleur_fond: e.target.value } : x)) }))} style={{ width: 30, height: 26, border: "1px solid #DDD8CC", borderRadius: 5, padding: 0, cursor: "pointer" }} />
                          {b.couleur_fond && (
                            <button onClick={() => setLivraison((v) => ({ ...v, bundles: v.bundles.map((x, j) => (j === i ? { ...x, couleur_fond: null } : x)) }))} style={{ background: "none", border: "none", color: "#8A9089", fontSize: 10.5, cursor: "pointer", textDecoration: "underline" }}>Réinitialiser</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setLivraison((v) => ({ ...v, bundles: [...v.bundles, { id: "b" + Date.now(), qty: (v.bundles.length || 0) + 2, label: "Pack x" + ((v.bundles.length || 0) + 2), mode: "pourcentage", discount: 10 }] }))} style={{ border: "1px dashed #9fb5a5", background: "#f7faf7", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#1a7a3c", cursor: "pointer", marginBottom: 12 }}>＋ Ajouter un bundle</button>

                  <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 12, marginBottom: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                      <input type="checkbox" checked={!livraison.masquer_produits_similaires} onChange={(e) => setLivraison((v) => ({ ...v, masquer_produits_similaires: !e.target.checked }))} />
                      Afficher "Tu pourrais aussi aimer" sous ce produit, en boutique
                    </label>
                  </div>

                  <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#344239", marginBottom: 6 }}>➕ Order bump (proposé juste avant la validation de commande)</div>
                    <select value={livraison.bump_produit_id} onChange={(e) => setLivraison((v) => ({ ...v, bump_produit_id: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, background: "white", marginBottom: 8 }}>
                      <option value="">Aucun order bump pour ce produit</option>
                      {produits.filter((p) => p.id !== selected.id).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                    </select>
                    {livraison.bump_produit_id && (
                      <>
                        <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Prix spécial pour ce bump (optionnel — laisse vide pour garder son prix normal)</div>
                        <input type="number" min="0" placeholder={`Prix normal si vide (${currency})`} value={livraison.bump_prix_special} onChange={(e) => setLivraison((v) => ({ ...v, bump_prix_special: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, boxSizing: "border-box" }} />
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#344239", marginBottom: 4 }}>🔗 "Tu pourrais aussi aimer" sous ce produit</div>
                    <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 8 }}>Choisis une collection entière et/ou des produits précis (sinon l'app choisit automatiquement les meilleures ventes).</div>
                    <select value={livraison.produits_similaires_collection_id} onChange={(e) => setLivraison((v) => ({ ...v, produits_similaires_collection_id: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, background: "white", marginBottom: 8 }}>
                      <option value="">Aucune collection</option>
                      {collectionsDispo.map((c) => <option key={c.id} value={c.id}>📁 {c.nom}</option>)}
                    </select>
                    <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 6 }}>+ Produits précis en plus (optionnel) :</div>
                    <div style={{ display: "grid", gap: 5, maxHeight: 160, overflow: "auto", border: "1px solid #ECE8DC", borderRadius: 8, padding: 8 }}>
                      {produits.filter((p) => p.id !== selected.id).map((p) => {
                        const coche = livraison.produits_similaires_ids.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 2px", cursor: "pointer" }}>
                            <input type="checkbox" checked={coche} onChange={() => setLivraison((v) => ({ ...v, produits_similaires_ids: coche ? v.produits_similaires_ids.filter((id) => id !== p.id) : [...v.produits_similaires_ids, p.id] }))} />
                            {p.nom}
                          </label>
                        );
                      })}
                      {produits.length <= 1 && <div style={{ fontSize: 11, color: "#8A9089" }}>Ajoute d'autres produits à ton catalogue pour pouvoir en choisir ici.</div>}
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={() => {
                        onUpdateLivraisonBundles(selected.id, {
                          livraison_gratuite: livraison.livraison_gratuite,
                          frais_livraison_produit: livraison.frais_livraison_produit === "" ? null : Number(livraison.frais_livraison_produit),
                          frais_expedition_produit: livraison.frais_expedition_produit === "" ? null : Number(livraison.frais_expedition_produit),
                          bundles: livraison.bundles,
                          masquer_produits_similaires: livraison.masquer_produits_similaires,
                          bump_produit_id: livraison.bump_produit_id || null,
                          bump_prix_special: livraison.bump_prix_special === "" ? null : Number(livraison.bump_prix_special),
                          produits_similaires_ids: livraison.produits_similaires_ids,
                          produits_similaires_collection_id: livraison.produits_similaires_collection_id || null,
                        });
                        flash("livraison");
                      }}
                      style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Enregistrer la livraison & les bundles
                    </button>
                    {savedFlash === "livraison" && <ConfirmationEnregistre inline />}
                  </div>
                </Carte>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Carte({ titre, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ECE8DC", borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#16231F", marginBottom: 14 }}>{titre}</div>
      {children}
      <style>{`.rv-pm-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }`}</style>
    </div>
  );
}

function Champ({ label, obligatoire, children }) {
  return (
    <label style={{ display: "block", fontSize: 11.5, color: obligatoire ? "#D64933" : "#6B7168", fontWeight: 600 }}>
      {label}{obligatoire ? " ⚠️" : ""}
      <div style={{ marginTop: 5 }}>{children}</div>
    </label>
  );
}

function StatPill({ label, valeur, couleur, fond }) {
  return (
    <div style={{ flex: 1, background: fond, borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: couleur }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: couleur }}>{valeur}</div>
    </div>
  );
}

function BoutonEnregistrer({ visible, onClick, flash }) {
  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
      {visible && (
        <button onClick={onClick} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          Enregistrer
        </button>
      )}
      {flash && <ConfirmationEnregistre inline />}
    </div>
  );
}

function ConfirmationEnregistre({ inline }) {
  return (
    <span style={{ display: inline ? "inline-flex" : "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#3B6D11", fontWeight: 700, marginTop: inline ? 0 : 8, marginLeft: inline ? 10 : 0 }}>
      ✓ Enregistré
    </span>
  );
}

const champStyle = { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" };

function LivreurPortalSaas({ livreur, commandes, currency, onStatusChanged }) {
  const [enTournee, setEnTournee] = useState(!!livreur.en_tournee);
  const [commandeAConfirmer, setCommandeAConfirmer] = useState(null);
  const [gpsErreur, setGpsErreur] = useState(null);
  const watchIdRef = React.useRef(null);
  const [enLigne, setEnLigne] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [nbEnAttente, setNbEnAttente] = useState(() => rvLireFileAttente().filter((a) => a.livreurId === livreur.id).length);
  const [synchroEnCours, setSynchroEnCours] = useState(false);

  async function synchroniserFileAttente() {
    if (synchroEnCours) return;
    const file = rvLireFileAttente().filter((a) => a.livreurId === livreur.id);
    if (file.length === 0) return;
    setSynchroEnCours(true);
    for (const action of file) {
      try {
        if (action.type === "changerStatutLivraison") {
          await supabase.from("commandes").update({ statut: action.nouveauStatut, ...action.infosValidation }).eq("id", action.commandeId);
          if (action.nouveauStatut === "confirmee") {
            supabase.auth.getSession().then(({ data: sessionData }) => {
              fetch("/api/facebook-capi", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` }, body: JSON.stringify({ commandeId: action.commandeId }) }).catch(() => {});
            });
          }
        }
        rvRetirerActionEnAttente(action.idFile);
      } catch (_) {
        break;
      }
    }
    setNbEnAttente(rvLireFileAttente().filter((a) => a.livreurId === livreur.id).length);
    setSynchroEnCours(false);
    await onStatusChanged();
  }

  useEffect(() => {
    function passerEnLigne() { setEnLigne(true); synchroniserFileAttente(); }
    function passerHorsLigne() { setEnLigne(false); }
    window.addEventListener("online", passerEnLigne);
    window.addEventListener("offline", passerHorsLigne);
    if (navigator.onLine) synchroniserFileAttente();
    return () => {
      window.removeEventListener("online", passerEnLigne);
      window.removeEventListener("offline", passerHorsLigne);
    };
  }, []);

  async function majPosition(lat, lng) {
    await supabase.from("livreurs").update({ position_lat: lat, position_lng: lng, position_maj: new Date().toISOString() }).eq("id", livreur.id);
  }

  function demarrerTournee() {
    if (!navigator.geolocation) {
      setGpsErreur("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGpsErreur(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase.from("livreurs").update({ en_tournee: true }).eq("id", livreur.id);
        await majPosition(pos.coords.latitude, pos.coords.longitude);
        setEnTournee(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => majPosition(p.coords.latitude, p.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
        );
      },
      (err) => {
        setGpsErreur(err.code === err.PERMISSION_DENIED ? "Autorisation de localisation refusée. Active-la dans les réglages de ton téléphone." : "Impossible d'obtenir ta position pour le moment.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function terminerTournee() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    await supabase.from("livreurs").update({ en_tournee: false }).eq("id", livreur.id);
    setEnTournee(false);
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const idsEnAttenteLocale = new Set(rvLireFileAttente().filter((a) => a.livreurId === livreur.id).map((a) => a.commandeId));
  const actives = commandes.filter((c) => (c.statut === "en_cours" || c.statut === "echouee") && !idsEnAttenteLocale.has(c.id));
  const actives_livraison = actives.filter((c) => c.mode_vente !== "expedition");
  const actives_expedition = actives.filter((c) => c.mode_vente === "expedition");
  const confirmees = commandes.filter((c) => c.statut === "confirmee");
  const [ongletActif, setOngletActif] = useState("livraison");
  const [envoiPhotoId, setEnvoiPhotoId] = useState(null);

  const bilanParJour = React.useMemo(() => {
    const map = {};
    confirmees.forEach((c) => {
      const d = new Date(c.created_at);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) {
        map[key] = { date: key, label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), livrees: 0, gains: 0 };
      }
      map[key].livrees += 1;
      map[key].gains += 1500;
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [confirmees]);
  const [showBilan, setShowBilan] = useState(false);
  const [showDeclarationDepot, setShowDeclarationDepot] = useState(false);

  async function changerStatut(commandeId, nouveauStatut, modePaiement) {
    const infosValidation = nouveauStatut === "confirmee" ? { confirmed_at: new Date().toISOString(), confirmed_by: livreur.nom, mode_paiement: modePaiement || null } : {};
    if (!navigator.onLine) {
      rvAjouterActionEnAttente({ type: "changerStatutLivraison", livreurId: livreur.id, commandeId, nouveauStatut, infosValidation });
      setNbEnAttente(rvLireFileAttente().filter((a) => a.livreurId === livreur.id).length);
      return;
    }
    try {
      const { error } = await supabase.from("commandes").update({ statut: nouveauStatut, ...infosValidation }).eq("id", commandeId);
      if (error) throw error;
    } catch (_) {
      rvAjouterActionEnAttente({ type: "changerStatutLivraison", livreurId: livreur.id, commandeId, nouveauStatut, infosValidation });
      setNbEnAttente(rvLireFileAttente().filter((a) => a.livreurId === livreur.id).length);
      return;
    }
    if (nouveauStatut === "confirmee") {
      supabase.auth.getSession().then(({ data: sessionData }) => {
        fetch("/api/facebook-capi", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
          body: JSON.stringify({ commandeId }),
        }).catch(() => {});
      });
    }
    await onStatusChanged();
  }

  async function confirmerExpedition(commandeId, fichierPhoto) {
    if (!fichierPhoto) return;
    if (fichierPhoto.size > 5 * 1024 * 1024) {
      alert("La photo est trop lourde (max 5 Mo). Choisis une photo plus légère.");
      return;
    }
    setEnvoiPhotoId(commandeId);
    const extension = fichierPhoto.name.split(".").pop();
    const chemin = `${commandeId}-${Date.now()}.${extension}`;
    const { error: erreurUpload } = await supabase.storage.from("expeditions").upload(chemin, fichierPhoto, { upsert: true });
    if (erreurUpload) {
      alert("Erreur lors de l'envoi de la photo : " + erreurUpload.message);
      setEnvoiPhotoId(null);
      return;
    }
    const { data } = supabase.storage.from("expeditions").getPublicUrl(chemin);
    await supabase.from("commandes").update({
      photo_recu_expedition: data.publicUrl,
      expedition_confirmee: true,
      expedition_confirmee_le: new Date().toISOString(),
      statut: "confirmee",
      confirmed_at: new Date().toISOString(),
      confirmed_by: livreur.nom,
    }).eq("id", commandeId);
    await supabase.from("relances").insert([{ commande_id: commandeId, note: `📦 Expédition confirmée par ${livreur.nom}, reçu photographié` }]);
    await onStatusChanged();
    setEnvoiPhotoId(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ background: "#1a7a3c", color: "white", padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>RecuVente</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Bonjour</div>
        <div style={{ fontWeight: 700, fontSize: 22 }}>{livreur.nom}</div>

        {(!enLigne || nbEnAttente > 0) && (
          <div style={{ marginTop: 10, background: !enLigne ? "rgba(214,73,51,0.25)" : "rgba(232,146,10,0.22)", border: `1px solid ${!enLigne ? "rgba(214,73,51,0.4)" : "rgba(232,146,10,0.4)"}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700 }}>
            {!enLigne ? "🔴 Hors ligne — " : "🟠 "}
            {nbEnAttente > 0 ? `${nbEnAttente} action${nbEnAttente > 1 ? "s" : ""} en attente de synchronisation` : "Connexion rétablie, synchronisation..."}
          </div>
        )}

        <button
          onClick={enTournee ? terminerTournee : demarrerTournee}
          style={{ width: "100%", marginTop: 14, padding: "13px 0", borderRadius: 10, border: "none", background: enTournee ? "#D64933" : "#e8920a", color: "white", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
        >
          {enTournee ? "🔴 Terminer ma tournée" : "🟢 Démarrer ma tournée"}
        </button>
        {enTournee && <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 6, textAlign: "center" }}>📍 Ta position est partagée avec l'entreprise pendant ta tournée</div>}
        {gpsErreur && <div style={{ background: "rgba(214,73,51,0.2)", borderRadius: 8, padding: "8px 10px", marginTop: 8, fontSize: 12 }}>{gpsErreur}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>À traiter</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 20 }}>{actives.length}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Confirmées</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 20 }}>{confirmees.length}</div>
          </div>
        </div>

        <div style={{ marginTop: 10, background: "rgba(232,146,10,0.18)", border: "1px solid rgba(232,146,10,0.35)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>💰 Mes gains ({confirmees.length} × 1 500 {currency})</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 22, color: "#e8920a", marginTop: 2 }}>
            {(confirmees.length * 1500).toLocaleString("fr-FR")} {currency}
          </div>
          {bilanParJour.length > 0 && (
            <button
              onClick={() => setShowBilan(!showBilan)}
              style={{ marginTop: 8, background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 7, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              📊 {showBilan ? "Cacher" : "Voir"} mon bilan journalier
            </button>
          )}
        </div>

        <button
          onClick={() => setShowDeclarationDepot(true)}
          style={{ width: "100%", marginTop: 10, background: "white", color: "#16231F", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
        >
          🏦 Déclarer mon dépôt
        </button>

        {showBilan && bilanParJour.length > 0 && (
          <div style={{ marginTop: 10, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10.5, opacity: 0.75, textTransform: "uppercase", marginBottom: 8 }}>Bilan par jour</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bilanParJour.map((j) => (
                <div key={j.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span style={{ textTransform: "capitalize", opacity: 0.9 }}>{j.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                    {j.livrees} livrée{j.livrees > 1 ? "s" : ""} · {j.gains.toLocaleString("fr-FR")} {currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", marginTop: 14, background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "8px 0", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Déconnexion
        </button>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {actives_expedition.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => setOngletActif("livraison")}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${ongletActif === "livraison" ? "#1a7a3c" : "#DDD8CC"}`, background: ongletActif === "livraison" ? "#1a7a3c" : "white", color: ongletActif === "livraison" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              🚚 Livraisons ({actives_livraison.length})
            </button>
            <button
              onClick={() => setOngletActif("expedition")}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${ongletActif === "expedition" ? "#2452E8" : "#DDD8CC"}`, background: ongletActif === "expedition" ? "#2452E8" : "white", color: ongletActif === "expedition" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              📦 Expéditions ({actives_expedition.length})
            </button>
          </div>
        )}

        {ongletActif === "livraison" && (
        actives_livraison.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#8A9089" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14 }}>Aucune commande à traiter pour le moment.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {actives_livraison.map((c) => (
              <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{c.client}</div>
                <div style={{ fontSize: 13, color: "#6B7168", marginTop: 3 }}>{c.produit}</div>
                <div style={{ fontSize: 13, color: "#6B7168", marginTop: 2 }}>📍 {c.zone}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 17, marginTop: 8, color: "#1a7a3c" }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                <a href={`tel:${c.tel}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "10px 0", borderRadius: 9, fontWeight: 600, fontSize: 13, textDecoration: "none", marginTop: 12 }}>
                  📞 {c.tel}
                </a>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setCommandeAConfirmer(c)} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", padding: "11px 0", borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                    ✅ Confirmer
                  </button>
                  <button onClick={() => changerStatut(c.id, "echouee")} style={{ flex: 1, background: "#D64933", color: "white", border: "none", padding: "11px 0", borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                    ❌ Échoué
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
        )}

        {ongletActif === "expedition" && (
          actives_expedition.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 20px", color: "#8A9089" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
              <div style={{ fontSize: 14 }}>Aucun colis à expédier pour le moment.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {actives_expedition.map((c) => (
                <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: "4px solid #2452E8", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{c.client}</div>
                  <div style={{ fontSize: 13, color: "#6B7168", marginTop: 3 }}>{c.produit}</div>
                  <div style={{ fontSize: 13, color: "#2452E8", marginTop: 2, fontWeight: 600 }}>📦 Destination : {c.ville_expedition || "non précisée"}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 17, marginTop: 8, color: "#1a7a3c" }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>

                  {!c.depot_recu_closer && (
                    <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 10px", marginTop: 10, fontSize: 11.5, color: "#8A6412" }}>
                      ⏳ En attente — le closer doit d'abord confirmer avoir reçu le dépôt du client.
                    </div>
                  )}

                  {c.depot_recu_closer && !c.expedition_confirmee && (
                    <label style={{ display: "block", textAlign: "center", width: "100%", background: "#2452E8", color: "white", padding: "11px 0", borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginTop: 12, boxSizing: "border-box" }}>
                      {envoiPhotoId === c.id ? "Envoi en cours..." : "📷 Confirmer produit expédié (photo du reçu)"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => confirmerExpedition(c.id, e.target.files?.[0])}
                      />
                    </label>
                  )}

                  {c.expedition_confirmee && (
                    <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 8, padding: "9px 12px", marginTop: 10, fontSize: 12.5, color: "#3B6D11", fontWeight: 600, textAlign: "center" }}>
                      ✅ Expédition confirmée
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {commandeAConfirmer && (
        <div
          onClick={() => setCommandeAConfirmer(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Comment le client a-t-il payé ?</div>
            <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>{commandeAConfirmer.client} — {Number(commandeAConfirmer.montant).toLocaleString("fr-FR")} {currency}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "cash", label: "💵 Cash (espèces)" },
                { key: "orange_money", label: "🟠 Orange Money" },
                { key: "wave", label: "🌊 Wave" },
                { key: "mtn_money", label: "🟡 MTN Money" },
                { key: "moov_money", label: "🔵 Moov Money" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => { changerStatut(commandeAConfirmer.id, "confirmee", mode.key); setCommandeAConfirmer(null); }}
                  style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "13px 16px", textAlign: "left", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button onClick={() => setCommandeAConfirmer(null)} style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#8A9089", fontSize: 13, padding: "8px 0", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {showDeclarationDepot && (
        <DeclarationDepotModal
          livreur={livreur}
          montantEncaisse={confirmees.reduce((s, c) => s + Number(c.montant), 0)}
          commission={confirmees.length * 1500}
          currency={currency}
          onClose={() => setShowDeclarationDepot(false)}
        />
      )}
    </div>
  );
}

function DeclarationDepotModal({ livreur, montantEncaisse, commission, currency, onClose }) {
  const montantAttendu = montantEncaisse - commission;
  const [montant, setMontant] = useState(String(montantAttendu));
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  async function declarer() {
    if (!montant || Number(montant) < 0) return;
    setEnCours(true);
    await supabase.from("depots_livreur").insert([{
      workspace_id: livreur.workspace_id,
      livreur_nom: livreur.nom,
      montant_declare: Number(montant),
    }]);
    setEnCours(false);
    setFait(true);
  }

  if (fait) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 70 }}>
        <div style={{ background: "white", borderRadius: 16, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Dépôt déclaré</div>
          <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>{Number(montant).toLocaleString("fr-FR")} {currency} enregistré.</div>
          <button onClick={onClose} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🏦 Déclarer mon dépôt</div>
        <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
          Montant attendu (encaissé moins ta commission) : <strong>{montantAttendu.toLocaleString("fr-FR")} {currency}</strong>
        </div>

        <div style={{ fontSize: 11, color: "#8A9089", marginBottom: 4 }}>Montant que tu déposes réellement</div>
        <input
          type="number"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 15, fontWeight: 700, boxSizing: "border-box", marginBottom: 14 }}
        />

        <button
          onClick={declarer}
          disabled={enCours || !montant}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: enCours ? 0.6 : 1 }}
        >
          {enCours ? "Enregistrement..." : "Confirmer la déclaration"}
        </button>
        <button onClick={onClose} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#8A9089", fontSize: 13, padding: "8px 0", cursor: "pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function ComptablePortalSaas({ workspace, commandes, livreurs, produits }) {
  const [datePreset, setDatePreset] = useState("semaine");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start, end;
    if (datePreset === "aujourdhui") {
      start = startOfToday;
      end = new Date(startOfToday.getTime() + 86400000);
    } else if (datePreset === "hier") {
      start = new Date(startOfToday.getTime() - 86400000);
      end = startOfToday;
    } else if (datePreset === "avanthier") {
      start = new Date(startOfToday.getTime() - 2 * 86400000);
      end = new Date(startOfToday.getTime() - 86400000);
    } else if (datePreset === "semaine") {
      const day = startOfToday.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(startOfToday.getTime() - diff * 86400000);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "mois") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "personnalise" && customStart && customEnd) {
      start = new Date(customStart + "T00:00:00");
      end = new Date(customEnd + "T23:59:59");
    } else {
      start = new Date(0);
      end = new Date(now.getTime() + 60000);
    }
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  const periodLabel = { aujourdhui: "Aujourd'hui", hier: "Hier", avanthier: "Avant-hier", semaine: "Cette semaine", mois: "Ce mois", personnalise: "Période personnalisée" }[datePreset];

  function parseProduitTexteLocal(texte) {
    if (!texte) return { nom: "", quantite: 1 };
    const match = texte.match(/^(.*?)\s*x\s*(\d+)\s*$/i);
    if (match) return { nom: match[1].trim(), quantite: Number(match[2]) || 1 };
    return { nom: texte.trim(), quantite: 1 };
  }

  const commandesInRange = useMemo(() => {
    return commandes.filter((c) => {
      const d = new Date(c.created_at);
      return d >= dateRange.start && d < dateRange.end;
    });
  }, [commandes, dateRange]);

  const confirmees = commandesInRange.filter((c) => c.statut === "confirmee");
  const caConfirme = confirmees.reduce((s, c) => s + Number(c.montant), 0);
  const COUT_LIVRAISON = 1500;
  const coutLivraisons = workspace.activity_type === "retail" ? confirmees.filter((c) => c.mode_vente === "livraison" || c.mode_vente === "expedition").length * COUT_LIVRAISON : confirmees.length * COUT_LIVRAISON;

  const coutProduitsInfo = useMemo(() => {
    let coutTotal = 0, nbInconnu = 0, montantInconnu = 0;
    confirmees.forEach((c) => {
      const { nom, quantite } = parseProduitTexteLocal(c.produit);
      const trouve = produits.find((p) => p.nom.toLowerCase() === nom.toLowerCase());
      if (!trouve) {
        nbInconnu += 1;
        montantInconnu += Number(c.montant);
      } else {
        coutTotal += (Number(trouve.cout_achat) + Number(trouve.frais_import_unitaire || 0)) * quantite;
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

  const livreursAvecCommandes = useMemo(() => {
    const map = {};
    commandesInRange.forEach((c) => {
      if (!c.livreur) return;
      map[c.livreur] = (map[c.livreur] || 0) + 1;
    });
    return Object.entries(map).map(([nom, total]) => ({ nom, total })).sort((a, b) => b.total - a.total);
  }, [commandesInRange]);

  const produitsParLivreur = {};
  depotsParLivreur.forEach((l) => {
    const mesConfirmees = confirmees.filter((c) => c.livreur === l.nom);
    const map = {};
    mesConfirmees.forEach((c) => {
      const { nom, quantite } = parseProduitTexteLocal(c.produit);
      if (!nom) return;
      if (!map[nom]) map[nom] = { nom, pieces: 0, ca: 0 };
      map[nom].pieces += quantite;
      map[nom].ca += Number(c.montant);
    });
    produitsParLivreur[l.nom] = Object.values(map).sort((a, b) => b.ca - a.ca);
  });

  return (
    <div className="rv-saas-print-scope" style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif", padding: 24 }}>
      <style>{`
        @keyframes rvPulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media print {
          .rv-saas-no-print { display: none !important; }
          .rv-saas-print-only { display: block !important; }
          body { background: white !important; }
          * { box-shadow: none !important; }
        }
      `}</style>

      <div className="rv-saas-no-print" style={{ background: "#16231F", color: "white", padding: 20, borderRadius: 14, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.75 }}>🧮 Comptabilité — {workspace.name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => window.print()} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              🖨️
            </button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="rv-saas-print-only" style={{ display: "none", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20 }}>Rapport comptable — {workspace.name}</div>
        <div style={{ fontSize: 12, color: "#6B7168" }}>Édité le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} — {periodLabel}</div>
      </div>

      <div className="rv-saas-no-print" style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {[
          { key: "aujourdhui", label: "Aujourd'hui" },
          { key: "hier", label: "Hier" },
          { key: "avanthier", label: "Avant-hier" },
          { key: "semaine", label: "Cette semaine" },
          { key: "mois", label: "Ce mois" },
          { key: "personnalise", label: "Personnalisé" },
        ].map((d) => (
          <button
            key={d.key}
            onClick={() => setDatePreset(d.key)}
            style={{ padding: "6px 13px", borderRadius: 999, border: `1px solid ${datePreset === d.key ? "#1a7a3c" : "#DDD8CC"}`, background: datePreset === d.key ? "#1a7a3c" : "white", color: datePreset === d.key ? "white" : "#16231F", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {datePreset === "personnalise" && (
        <div className="rv-saas-no-print" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
          <span style={{ color: "#8A9089", fontSize: 12 }}>à</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
        </div>
      )}

      <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "#1a7a3c", background: "#EAF3DE", padding: "3px 10px", borderRadius: 999, marginBottom: 12 }}>
        📊 {periodLabel}
      </div>

      <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💰 Bénéfice réel</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 24, color: beneficeReel >= 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 3 }}>
          {beneficeReel.toLocaleString("fr-FR")} {workspace.currency}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          CA confirmé {caConfirme.toLocaleString("fr-FR")} − Livraisons ({confirmees.length} × {COUT_LIVRAISON.toLocaleString("fr-FR")}) − Produits ({coutProduitsInfo.coutTotal.toLocaleString("fr-FR")})
        </div>
      </div>

      {coutProduitsInfo.nbInconnu > 0 && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#8A6412" }}>
          ⚠️ {coutProduitsInfo.nbInconnu} commande{coutProduitsInfo.nbInconnu > 1 ? "s" : ""} ({coutProduitsInfo.montantInconnu.toLocaleString("fr-FR")} {workspace.currency}) sans coût produit connu — bénéfice sous-estimé.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💵 À payer aux livreurs</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#e8920a", marginTop: 3 }}>{totalCommission.toLocaleString("fr-FR")} {workspace.currency}</div>
        </div>
        <div style={{ background: "linear-gradient(135deg, #1a7a3c, #1F9D6E)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)", textTransform: "uppercase" }}>🏦 Dépôt attendu</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "white", marginTop: 3 }}>{totalADeposer.toLocaleString("fr-FR")} {workspace.currency}</div>
        </div>
      </div>

      {livreurs.some((l) => l.en_tournee) && (
        <div className="rv-saas-no-print" style={{ marginBottom: 20 }}>
          <CarteLivreursSaas livreurs={livreurs} />
        </div>
      )}

      {livreursAvecCommandes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📊 Résumé — commandes reçues par livreur ({periodLabel})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {livreursAvecCommandes.map((l) => (
              <div key={l.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}><strong>{l.nom}</strong> a reçu</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: "#1a7a3c" }}>{l.total} commande{l.total > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Détail par livreur</div>
      {depotsParLivreur.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucune livraison confirmée sur cette période.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {depotsParLivreur.map((l) => (
          <LivreurDetailComptableSaas key={l.nom} l={l} produits={produitsParLivreur[l.nom] || []} currency={workspace.currency} />
        ))}
      </div>
    </div>
  );
}

function LivreurDetailComptableSaas({ l, produits, currency }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{l.nom}</div>
          <span style={{ fontSize: 11, color: "#1a7a3c", fontWeight: 600 }}>{open ? "Fermer ▲" : "Voir le détail ▼"}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{l.livrees} livraison{l.livrees > 1 ? "s" : ""} · {l.montantRecupere.toLocaleString("fr-FR")} {currency} encaissé</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1, background: "#FBF3E3", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#8A6412" }}>
          Commission : <strong>{l.commission.toLocaleString("fr-FR")}</strong>
        </div>
        <div style={{ flex: 1, background: "#EAF3DE", borderRadius: 7, padding: "6px 9px", fontSize: 11, color: "#3B6D11" }}>
          À déposer : <strong>{l.aDeposer.toLocaleString("fr-FR")}</strong>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0EEE6" }}>
          <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", marginBottom: 6 }}>CA par produit</div>
          {produits.length === 0 && <div style={{ fontSize: 12, color: "#8A9089" }}>Aucune vente confirmée.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {produits.map((p) => (
              <div key={p.nom} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#6B7168" }}>{p.nom} <span style={{ color: "#8A9089" }}>({p.pieces} pc)</span></span>
                <span style={{ fontWeight: 600 }}>{p.ca.toLocaleString("fr-FR")} {currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CloserPortalSaas({ closer, commandes, currency, workspace, onStatusChanged }) {
  const [datePreset, setDatePreset] = useState("toutes");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [enLigne, setEnLigne] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [nbEnAttente, setNbEnAttente] = useState(() => rvLireFileAttente().filter((a) => a.closerId === closer.id).length);
  const [synchroEnCours, setSynchroEnCours] = useState(false);

  async function synchroniserFileAttenteCloser() {
    if (synchroEnCours) return;
    const file = rvLireFileAttente().filter((a) => a.closerId === closer.id);
    if (file.length === 0) return;
    setSynchroEnCours(true);
    for (const action of file) {
      try {
        if (action.type === "changerStatutCloser") {
          await supabase.from("commandes").update({ statut: action.nouveauStatut, ...action.infosValidation }).eq("id", action.commandeId);
          await supabase.from("relances").insert([{ commande_id: action.commandeId, note: action.note }]);
        } else if (action.type === "logAppelCloser") {
          await supabase.from("relances").insert([{ commande_id: action.commandeId, note: action.note }]);
        }
        rvRetirerActionEnAttente(action.idFile);
      } catch (_) {
        break;
      }
    }
    setNbEnAttente(rvLireFileAttente().filter((a) => a.closerId === closer.id).length);
    setSynchroEnCours(false);
    await onStatusChanged();
  }

  useEffect(() => {
    function passerEnLigne() { setEnLigne(true); synchroniserFileAttenteCloser(); }
    function passerHorsLigne() { setEnLigne(false); }
    window.addEventListener("online", passerEnLigne);
    window.addEventListener("offline", passerHorsLigne);
    if (navigator.onLine) synchroniserFileAttenteCloser();
    return () => {
      window.removeEventListener("online", passerEnLigne);
      window.removeEventListener("offline", passerHorsLigne);
    };
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start, end;
    if (datePreset === "aujourdhui") {
      start = startOfToday;
      end = new Date(startOfToday.getTime() + 86400000);
    } else if (datePreset === "hier") {
      start = new Date(startOfToday.getTime() - 86400000);
      end = startOfToday;
    } else if (datePreset === "avanthier") {
      start = new Date(startOfToday.getTime() - 2 * 86400000);
      end = new Date(startOfToday.getTime() - 86400000);
    } else if (datePreset === "semaine") {
      const day = startOfToday.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(startOfToday.getTime() - diff * 86400000);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "personnalise" && customStart && customEnd) {
      start = new Date(customStart + "T00:00:00");
      end = new Date(customEnd + "T23:59:59");
    } else {
      start = new Date(0);
      end = new Date(now.getTime() + 60000);
    }
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  const idsEnAttenteLocaleCloser = new Set(rvLireFileAttente().filter((a) => a.closerId === closer.id && a.type === "changerStatutCloser").map((a) => a.commandeId));
  const mesCommandesToutes = commandes.filter((c) => c.closer === closer.nom);
  const actives = mesCommandesToutes.filter((c) => {
    if (c.statut !== "en_cours" && c.statut !== "echouee") return false;
    if (idsEnAttenteLocaleCloser.has(c.id)) return false;
    const d = new Date(c.created_at);
    return d >= dateRange.start && d < dateRange.end;
  });
  const confirmees = mesCommandesToutes.filter((c) => c.statut === "confirmee");
  const nonAssignees = commandes.filter((c) => !c.closer && (c.statut === "en_cours" || c.statut === "echouee"));
  const [selected, setSelected] = useState(null);

  async function changerStatut(commandeId, nouveauStatut) {
    const ancien = commandes.find((c) => c.id === commandeId)?.statut;
    const infosValidation = nouveauStatut === "confirmee" ? { confirmed_at: new Date().toISOString(), confirmed_by: closer.nom } : {};
    const note = `📋 Statut : ${ancien} → ${nouveauStatut}${nouveauStatut === "confirmee" ? ` par ${closer.nom}` : ""}`;
    if (!navigator.onLine) {
      rvAjouterActionEnAttente({ type: "changerStatutCloser", closerId: closer.id, commandeId, nouveauStatut, infosValidation, note });
      setNbEnAttente(rvLireFileAttente().filter((a) => a.closerId === closer.id).length);
      setSelected(null);
      return;
    }
    try {
      const { error } = await supabase.from("commandes").update({ statut: nouveauStatut, ...infosValidation }).eq("id", commandeId);
      if (error) throw error;
      await supabase.from("relances").insert([{ commande_id: commandeId, note }]);
    } catch (_) {
      rvAjouterActionEnAttente({ type: "changerStatutCloser", closerId: closer.id, commandeId, nouveauStatut, infosValidation, note });
      setNbEnAttente(rvLireFileAttente().filter((a) => a.closerId === closer.id).length);
      setSelected(null);
      return;
    }
    if (nouveauStatut === "confirmee") {
      supabase.auth.getSession().then(({ data: sessionData }) => {
        fetch("/api/facebook-capi", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
          body: JSON.stringify({ commandeId }),
        }).catch(() => {});
      });
    }
    await onStatusChanged();
    setSelected(null);
  }

  async function seAttribuer(commandeId) {
    const { data, error } = await supabase
      .from("commandes")
      .update({ closer: closer.nom })
      .eq("id", commandeId)
      .is("closer", null)
      .select();

    if (error) {
      alert("Erreur: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("⚠️ Trop tard, un autre closer vient de la prendre");
      await onStatusChanged();
      return;
    }
    await supabase.from("relances").insert([{ commande_id: commandeId, note: `🎧 Prise en charge par ${closer.nom}` }]);
    await onStatusChanged();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ background: "#1a7a3c", color: "white", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>RecuVente — {workspace.name}</div>
          <button onClick={() => supabase.auth.signOut()} style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            Déconnexion
          </button>
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>Bonjour</div>
        <div style={{ fontWeight: 700, fontSize: 22 }}>{closer.nom}</div>

        {(!enLigne || nbEnAttente > 0) && (
          <div style={{ marginTop: 10, background: !enLigne ? "rgba(214,73,51,0.25)" : "rgba(232,146,10,0.22)", border: `1px solid ${!enLigne ? "rgba(214,73,51,0.4)" : "rgba(232,146,10,0.4)"}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700 }}>
            {!enLigne ? "🔴 Hors ligne — " : "🟠 "}
            {nbEnAttente > 0 ? `${nbEnAttente} action${nbEnAttente > 1 ? "s" : ""} en attente de synchronisation` : "Connexion rétablie, synchronisation..."}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>À traiter</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 20 }}>{actives.length}</div>
          </div>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.75 }}>Confirmées</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 20 }}>{confirmees.length}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "18px 20px" }}>
        {nonAssignees.length > 0 && (
          <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 14, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: "#8A6412", marginBottom: 2 }}>
              🆓 Non assignées — à prendre ({nonAssignees.length})
            </div>
            <div style={{ fontSize: 12, color: "#8A6412", marginBottom: 10 }}>
              Personne n'a encore pris ces commandes. Une fois prise, elle disparaît pour les autres closers.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {nonAssignees.slice(0, 8).map((o) => (
                <div key={o.id} style={{ background: "white", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.client}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7168" }}>{o.produit} · {Number(o.montant).toLocaleString("fr-FR")} {currency}</div>
                  </div>
                  <button
                    onClick={() => seAttribuer(o.id)}
                    style={{ flexShrink: 0, background: "#e8920a", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    Je la prends
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {[
            { key: "toutes", label: "Toutes" },
            { key: "aujourdhui", label: "Aujourd'hui" },
            { key: "hier", label: "Hier" },
            { key: "avanthier", label: "Avant-hier" },
            { key: "semaine", label: "Cette semaine" },
            { key: "personnalise", label: "Personnalisé" },
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => setDatePreset(d.key)}
              style={{ padding: "6px 13px", borderRadius: 999, border: `1px solid ${datePreset === d.key ? "#1a7a3c" : "#DDD8CC"}`, background: datePreset === d.key ? "#1a7a3c" : "white", color: datePreset === d.key ? "white" : "#16231F", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {datePreset === "personnalise" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
            <span style={{ color: "#8A9089", fontSize: 12 }}>à</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
          </div>
        )}

        <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 10 }}>
          {actives.length} commande{actives.length > 1 ? "s" : ""} à traiter{datePreset !== "toutes" ? " sur cette période" : ""}
        </div>

        {actives.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#8A9089" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14 }}>Aucune commande à traiter pour le moment.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actives.map((c) => (
              <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
                <div onClick={() => setSelected(selected === c.id ? null : c.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.client}</div>
                    <div style={{ fontSize: 13, color: "#6B7168", marginTop: 3 }}>{c.produit} · {c.tel}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: "#1a7a3c" }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                    <div style={{ fontSize: 10, color: "#8A9089", marginTop: 3 }}>Appeler, historique... {selected === c.id ? "▲" : "▼"}</div>
                  </div>
                </div>

                {selected !== c.id && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button onClick={() => changerStatut(c.id, "confirmee")} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ✅ Confirmer
                    </button>
                    <button onClick={() => changerStatut(c.id, "echouee")} style={{ flex: 1, background: "#D64933", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ❌ Échoué
                    </button>
                  </div>
                )}

                {selected === c.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EEE6" }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <a href={`tel:${c.tel}`} style={{ flex: 1, textAlign: "center", background: "white", border: "1px solid #DDD8CC", color: "#16231F", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, textDecoration: "none" }}>
                        📞 Appeler
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(c.tel)}?text=${encodeURIComponent(`Bonjour ${(c.client || "").split(" ")[0]} 👋, nous confirmons votre commande "${c.produit}" (${Number(c.montant).toLocaleString("fr-FR")} ${currency}). Un livreur passera bientôt.`)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, textAlign: "center", background: "#1F9D6E", color: "white", padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 12.5, textDecoration: "none" }}
                      >
                        💬 WhatsApp
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => changerStatut(c.id, "confirmee")} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", padding: "10px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        ✅ Confirmer
                      </button>
                      <button onClick={() => changerStatut(c.id, "echouee")} style={{ flex: 1, background: "#D64933", color: "white", border: "none", padding: "10px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        ❌ Échoué
                      </button>
                    </div>
                    <HistoriqueRelances commandeId={c.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDonutSaas({ livrees, enAttente, echouees }) {
  const total = livrees + enAttente + echouees || 1;
  const r = 34;
  const circ = 2 * Math.PI * r;
  const segs = [
    { val: livrees, color: "#1F9D6E" },
    { val: enAttente, color: "#E8A93D" },
    { val: echouees, color: "#D64933" },
  ];
  let offset = 0;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
      <circle cx="46" cy="46" r={r} fill="none" stroke="#ECE8DC" strokeWidth="12" />
      {segs.map((s, i) => {
        const frac = s.val / total;
        const len = frac * circ;
        const el = (
          <circle key={i} cx="46" cy="46" r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform="rotate(-90 46 46)" />
        );
        offset += len;
        return el;
      })}
      <text x="46" y="50" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="18" fill="#16231F">
        {livrees + enAttente + echouees}
      </text>
    </svg>
  );
}

function EvolutionChartSaas({ data }) {
  const w = 300;
  const h = 110;
  const padL = 4, padR = 4, padT = 8, padB = 20;
  const maxVal = Math.max(...data.map((d) => d.commandes), 1);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (d.commandes / maxVal) * innerH;
    return { x, y, d };
  });

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`;

  return (
    <svg width="100%" height={h + 10} viewBox={`0 0 ${w} ${h + 10}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
      <path d={areaD} fill="#EAF3DE" />
      <path d={pathD} fill="none" stroke="#1a7a3c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#1a7a3c" />)}
      {points.map((p, i) => {
        if (data.length > 8 && i % Math.ceil(data.length / 6) !== 0 && i !== data.length - 1) return null;
        return (
          <text key={"t" + i} x={p.x} y={h + 8} fontSize="8" fill="#8A9089" textAnchor="middle">
            {p.d.label}
          </text>
        );
      })}
    </svg>
  );
}

function CampagneModalSaas({ clients, workspace, onClose }) {
  const [segment, setSegment] = useState("tous");
  const [segmentProduit, setSegmentProduit] = useState("");
  const [message, setMessage] = useState("");
  const [productLink, setProductLink] = useState("");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  const produitsAchetes = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => c.commandes.forEach((o) => set.add((o.produit || "").split(" x")[0].trim())));
    return Array.from(set).filter(Boolean);
  }, [clients]);

  const clientsSegmentes = useMemo(() => {
    const now = new Date();
    if (segment === "inactifs30") {
      return clients.filter((c) => {
        const dernier = c.commandes.reduce((max, o) => (new Date(o.created_at) > max ? new Date(o.created_at) : max), new Date(0));
        return (now - dernier) / (1000 * 3600 * 24) >= 30;
      });
    }
    if (segment === "produit" && segmentProduit) {
      return clients.filter((c) => c.commandes.some((o) => (o.produit || "").split(" x")[0].trim() === segmentProduit));
    }
    if (segment === "vip") {
      return clients.filter((c) => c.total >= 3);
    }
    return clients;
  }, [clients, segment, segmentProduit]);

  const current = clientsSegmentes[index];

  function personalize(tpl, nom) {
    let text = tpl.replace(/\{prenom\}/gi, (nom || "").split(" ")[0] || "");
    if (productLink.trim()) text = text.trim() + "\n\n" + productLink.trim();
    return text;
  }

  function send() {
    const text = personalize(message, current.nom);
    window.open(`https://wa.me/${cleanPhoneForWhatsApp(current.tel)}?text=${encodeURIComponent(text)}`, "_blank");
    setSentCount((c) => c + 1);
  }

  function next() {
    setIndex((i) => i + 1);
  }

  const finished = started && index >= clientsSegmentes.length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FAFAF7", width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", borderRadius: 18, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18 }}>Campagne promo</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {!started && (
          <>
            <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 6 }}>À qui envoyer ?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {[
                { key: "tous", label: `Tous les clients (${clients.length})` },
                { key: "vip", label: "Meilleurs clients — 3+ achats" },
                { key: "inactifs30", label: "Inactifs depuis 30+ jours" },
                { key: "produit", label: "Ayant acheté un produit précis" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSegment(s.key)}
                  style={{
                    textAlign: "left", padding: "9px 12px", borderRadius: 9,
                    border: "1px solid " + (segment === s.key ? "#1a7a3c" : "#DDD8CC"),
                    background: segment === s.key ? "#EAF3DE" : "white",
                    color: segment === s.key ? "#1a7a3c" : "#16231F",
                    fontSize: 13, fontWeight: segment === s.key ? 600 : 500, cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {segment === "produit" && (
              <select value={segmentProduit} onChange={(e) => setSegmentProduit(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 14, background: "white" }}>
                <option value="">Choisir un produit...</option>
                {produitsAchetes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            <div style={{ background: "#EAF3DE", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: "#3B6D11", marginBottom: 14 }}>
              {clientsSegmentes.length} client{clientsSegmentes.length > 1 ? "s" : ""} concerné{clientsSegmentes.length > 1 ? "s" : ""}
            </div>

            <label style={{ fontSize: 12, color: "#6B7168", display: "block", marginBottom: 6 }}>Message (utilise {"{prenom}"} pour personnaliser)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Bonjour {prenom} 👋, une offre spéciale vous attend chez ${workspace.name} !`}
              rows={4}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <input
              value={productLink}
              onChange={(e) => setProductLink(e.target.value)}
              placeholder="Lien à ajouter (optionnel)"
              style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
            />

            <button
              onClick={() => message.trim() && clientsSegmentes.length > 0 && setStarted(true)}
              disabled={!message.trim() || clientsSegmentes.length === 0}
              style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: (!message.trim() || clientsSegmentes.length === 0) ? 0.5 : 1 }}
            >
              Démarrer l'envoi
            </button>
          </>
        )}

        {started && !finished && current && (
          <div>
            <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 10 }}>{index + 1} / {clientsSegmentes.length}</div>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{current.nom}</div>
              <div style={{ fontSize: 12.5, color: "#6B7168", marginTop: 2 }}>{current.tel}</div>
              <div style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap", color: "#16231F" }}>{personalize(message, current.nom)}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { send(); next(); }} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                💬 Envoyer et suivant
              </button>
              <button onClick={next} style={{ background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 10, padding: "0 16px", fontSize: 13, cursor: "pointer" }}>
                Passer
              </button>
            </div>
          </div>
        )}

        {finished && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{sentCount} message{sentCount > 1 ? "s" : ""} envoyé{sentCount > 1 ? "s" : ""}</div>
            <button onClick={onClose} style={{ marginTop: 16, background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RepartitionLigne({ r }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", background: "none", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer" }}
      >
        <span style={{ fontSize: 12.5 }}>
          <strong>{r.closer}</strong> → <strong>{r.livreur}</strong>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1a7a3c" }}>{r.total} cmd {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EEE6", display: "flex", flexDirection: "column", gap: 5 }}>
          {r.produitsListe.map((p) => (
            <div key={p.nom} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span style={{ color: "#6B7168" }}>{p.nom}</span>
              <span style={{ fontWeight: 600 }}>{p.qte} pièce{p.qte > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRelanceModalSaas({ orders, currency, onClose, onLog }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState([]);
  const current = orders[index];
  const finished = index >= orders.length;

  function next() {
    setIndex((i) => i + 1);
  }

  async function sendAndLog() {
    const text = `Bonjour ${(current.client || "").split(" ")[0]} 👋, votre commande "${current.produit}" (${Number(current.montant).toLocaleString("fr-FR")} ${currency}) est toujours en attente. Confirmez-vous la livraison ?`;
    window.open(`https://wa.me/${cleanPhoneForWhatsApp(current.tel)}?text=${encodeURIComponent(text)}`, "_blank");
    await onLog(current.id, "Relance groupée envoyée (WhatsApp)");
    setDone((d) => [...d, current.id]);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FAFAF7", width: "100%", maxWidth: 380, borderRadius: 18, padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18 }}>Relance groupée</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {!finished ? (
          <>
            <div style={{ fontSize: 12, color: "#8A9089", marginBottom: 14 }}>
              {index + 1} / {orders.length} — {done.length} déjà contacté{done.length > 1 ? "s" : ""}
            </div>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{current.client}</div>
              <div style={{ fontSize: 12.5, color: "#6B7168", marginTop: 2 }}>{current.tel} · {current.produit}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 15, marginTop: 6, color: "#1a7a3c" }}>{Number(current.montant).toLocaleString("fr-FR")} {currency}</div>
            </div>

            <button onClick={sendAndLog} style={{ width: "100%", background: "#1F9D6E", color: "white", border: "none", padding: "11px 0", borderRadius: 10, fontWeight: 600, fontSize: 13.5, cursor: "pointer", marginBottom: 8 }}>
              💬 Envoyer WhatsApp
            </button>
            <button onClick={next} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1px solid #DDD8CC", background: "white", color: "#16231F", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
              {index < orders.length - 1 ? "Suivant →" : "Terminer"}
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{done.length} relance{done.length > 1 ? "s" : ""} envoyée{done.length > 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 18 }}>sur {orders.length} commandes de la liste</div>
            <button onClick={onClose} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BiensLocationView({ biensLocation, currency, workspaceId, estLucirica, onAdd, onToggleDisponibilite, onDelete }) {
  const [form, setForm] = useState({
    nom: "", categorie: "Véhicule", prix_jour: "", caution_suggeree: "", description: "",
    mode_location: true, mode_commander: false, mode_payer_maintenant: false,
    prix_vente_direct: "", delai_commande_estime: "", photo_url: "", couleurs_texte: "",
  });
  const [envoiPhotoEnCours, setEnvoiPhotoEnCours] = useState(false);

  const nbDisponibles = biensLocation.filter((b) => b.disponible).length;
  const nbLoues = biensLocation.length - nbDisponibles;

  async function envoyerPhoto(fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) { alert("Photo trop lourde (max 5 Mo)."); return; }
    setEnvoiPhotoEnCours(true);
    const extension = (fichier.name.split(".").pop() || "jpg").toLowerCase();
    const chemin = `${workspaceId}-bien-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("boutique").upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
    if (!error) {
      const { data } = supabase.storage.from("boutique").getPublicUrl(chemin);
      setForm((f) => ({ ...f, photo_url: data.publicUrl }));
    }
    setEnvoiPhotoEnCours(false);
  }

  function reinitialiserForm() {
    setForm({ nom: "", categorie: form.categorie, prix_jour: "", caution_suggeree: "", description: "", mode_location: true, mode_commander: false, mode_payer_maintenant: false, prix_vente_direct: "", delai_commande_estime: "", photo_url: "", couleurs_texte: "" });
  }

  const auMoinsUneOption = form.mode_location || form.mode_commander || form.mode_payer_maintenant;

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>Véhicules & Matériel</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16 }}>
        {nbDisponibles} disponible{nbDisponibles > 1 ? "s" : ""} · {nbLoues} actuellement loué{nbLoues > 1 ? "s" : ""}
      </div>

      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>+ Ajouter un bien</div>
        <input placeholder="Nom (ex: Toyota Land Cruiser, Groupe électrogène 10kVA)" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder="Catégorie (ex: Voiture de luxe, Engin de chantier, Benne, Maison préfabriquée)" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <textarea placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }} />

        {form.photo_url && <img src={form.photo_url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 8, border: "1px solid #ECE8DC" }} />}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#FAFAF7", border: "1px dashed #DDD8CC", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#6B7168", cursor: "pointer", marginBottom: 14 }}>
          {envoiPhotoEnCours ? "Envoi..." : "📷 " + (form.photo_url ? "Changer la photo" : "Ajouter une photo")}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => envoyerPhoto(e.target.files?.[0])} />
        </label>

        {estLucirica ? (
        <>
        <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Couleurs disponibles (séparées par des virgules, optionnel)</div>
        <input placeholder="Ex: Noir, Blanc, Gris" value={form.couleurs_texte} onChange={(e) => setForm({ ...form, couleurs_texte: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />

        <div style={{ fontSize: 12, fontWeight: 700, color: "#344239", marginBottom: 8 }}>Quelles options proposer pour ce bien précis ?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: form.mode_location ? "#EAF3DE" : "#FAFAF7", border: "1px solid " + (form.mode_location ? "#C7DDA3" : "#ECE8DC"), borderRadius: 8, padding: "9px 12px" }}>
            <input type="checkbox" checked={form.mode_location} onChange={(e) => setForm({ ...form, mode_location: e.target.checked })} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>🔑 Location — le client loue pour une période</span>
          </label>
          {form.mode_location && (
            <div style={{ display: "flex", gap: 8, paddingLeft: 26 }}>
              <input placeholder={`Prix / jour (${currency})`} type="number" value={form.prix_jour} onChange={(e) => setForm({ ...form, prix_jour: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
              <input placeholder={`Caution suggérée (${currency})`} type="number" value={form.caution_suggeree} onChange={(e) => setForm({ ...form, caution_suggeree: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: form.mode_commander ? "#EAF0FB" : "#FAFAF7", border: "1px solid " + (form.mode_commander ? "#C3D4F0" : "#ECE8DC"), borderRadius: 8, padding: "9px 12px" }}>
            <input type="checkbox" checked={form.mode_commander} onChange={(e) => setForm({ ...form, mode_commander: e.target.checked })} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>📦 Commander — pas encore sur place, on le fait venir (ex: Chine)</span>
          </label>
          {form.mode_commander && (
            <div style={{ display: "flex", gap: 8, paddingLeft: 26 }}>
              <input placeholder={`Prix (${currency})`} type="number" value={form.prix_vente_direct} onChange={(e) => setForm({ ...form, prix_vente_direct: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
              <input placeholder="Délai estimé (ex: 45-60 jours)" value={form.delai_commande_estime} onChange={(e) => setForm({ ...form, delai_commande_estime: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: form.mode_payer_maintenant ? "#FBF3E3" : "#FAFAF7", border: "1px solid " + (form.mode_payer_maintenant ? "#F0DDA8" : "#ECE8DC"), borderRadius: 8, padding: "9px 12px" }}>
            <input type="checkbox" checked={form.mode_payer_maintenant} onChange={(e) => setForm({ ...form, mode_payer_maintenant: e.target.checked })} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>💵 Payer maintenant — déjà disponible, achat direct</span>
          </label>
          {form.mode_payer_maintenant && !form.mode_commander && (
            <div style={{ paddingLeft: 26 }}>
              <input placeholder={`Prix (${currency})`} type="number" value={form.prix_vente_direct} onChange={(e) => setForm({ ...form, prix_vente_direct: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          )}
        </div>

        {!auMoinsUneOption && <div style={{ color: "#D64933", fontSize: 11.5, marginBottom: 8 }}>Coche au moins une option.</div>}

        <button
          onClick={() => { if (!form.nom.trim() || !auMoinsUneOption) return; onAdd(form); reinitialiserForm(); }}
          disabled={!form.nom.trim() || !auMoinsUneOption}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (!form.nom.trim() || !auMoinsUneOption) ? 0.5 : 1 }}
        >
          Ajouter au catalogue
        </button>
        </>
        ) : (
        <>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input placeholder={`Prix / jour (${currency})`} type="number" value={form.prix_jour} onChange={(e) => setForm({ ...form, prix_jour: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
          <input placeholder={`Caution suggérée (${currency})`} type="number" value={form.caution_suggeree} onChange={(e) => setForm({ ...form, caution_suggeree: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <button
          onClick={() => { if (!form.nom.trim() || !form.prix_jour) return; onAdd(form); reinitialiserForm(); }}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Ajouter au catalogue
        </button>
        </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {biensLocation.map((b) => (
          <div key={b.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {b.photo_url && <img src={b.photo_url} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{b.nom}</div>
                  <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>{b.categorie}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {b.mode_location && <span style={{ fontSize: 10, fontWeight: 700, color: "#3B6D11", background: "#EAF3DE", padding: "2px 8px", borderRadius: 999 }}>🔑 {Number(b.prix_jour).toLocaleString("fr-FR")}/j</span>}
                    {b.mode_commander && <span style={{ fontSize: 10, fontWeight: 700, color: "#1E4B8C", background: "#EAF0FB", padding: "2px 8px", borderRadius: 999 }}>📦 Commander</span>}
                    {b.mode_payer_maintenant && <span style={{ fontSize: 10, fontWeight: 700, color: "#8A6412", background: "#FBF3E3", padding: "2px 8px", borderRadius: 999 }}>💵 Direct</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => onDelete(b.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>🗑️</button>
            </div>
            <button
              onClick={() => onToggleDisponibilite(b.id, b.disponible)}
              style={{ width: "100%", marginTop: 10, background: b.disponible ? "#EAF3DE" : "#FBEAE6", color: b.disponible ? "#3B6D11" : "#D64933", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {b.disponible ? "✅ Disponible" : "🚫 Actuellement indisponible"}
            </button>
          </div>
        ))}
        {biensLocation.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucun bien pour l'instant.</div>}
      </div>
    </div>
  );
}

function LogementsView({ logements, currency, onAdd, onToggleDisponibilite, onDelete }) {
  const [form, setForm] = useState({ nom: "", adresse: "", loyer_mensuel: "", caution_suggeree: "", description: "" });

  const nbDisponibles = logements.filter((l) => l.disponible).length;
  const nbLoues = logements.length - nbDisponibles;

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>Mes Logements</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16 }}>
        {nbDisponibles} disponible{nbDisponibles > 1 ? "s" : ""} · {nbLoues} actuellement loué{nbLoues > 1 ? "s" : ""}
      </div>

      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>+ Ajouter un logement</div>
        <input placeholder="Nom (ex: Appartement 2, Villa Cocody)" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder="Adresse" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder={`Loyer mensuel (${currency})`} type="number" value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder={`Caution suggérée (${currency}, optionnel)`} type="number" value={form.caution_suggeree} onChange={(e) => setForm({ ...form, caution_suggeree: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
        <button
          onClick={() => { if (!form.nom.trim() || !form.loyer_mensuel) return; onAdd(form); setForm({ nom: "", adresse: "", loyer_mensuel: "", caution_suggeree: "", description: "" }); }}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Ajouter à mes logements
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {logements.map((l) => (
          <div key={l.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{l.nom}</div>
                {l.adresse && <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>{l.adresse}</div>}
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: "#1a7a3c", marginTop: 6 }}>
                  {Number(l.loyer_mensuel).toLocaleString("fr-FR")} {currency} / mois
                </div>
              </div>
              <button onClick={() => onDelete(l.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
            </div>
            <button
              onClick={() => onToggleDisponibilite(l.id, l.disponible)}
              style={{ width: "100%", marginTop: 10, background: l.disponible ? "#EAF3DE" : "#FBEAE6", color: l.disponible ? "#3B6D11" : "#D64933", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {l.disponible ? "✅ Disponible" : "🚫 Actuellement loué"}
            </button>
          </div>
        ))}
        {logements.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucun logement pour l'instant.</div>}
      </div>
    </div>
  );
}

function MenuRestaurantView({ plats, currency, onAdd, onToggleDisponibilite, onDelete, tablesRestaurant, onAddTable, onToggleStatutTable }) {
  const [form, setForm] = useState({ nom: "", categorie: "Plats", prix: "", description: "" });
  const [nouvelleTable, setNouvelleTable] = useState("");
  const [ongletActif, setOngletActif] = useState("menu");

  const categories = [...new Set(plats.map((p) => p.categorie))];

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>Menu & Tables</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button onClick={() => setOngletActif("menu")} style={{ flex: 1, background: ongletActif === "menu" ? "#1a7a3c" : "white", color: ongletActif === "menu" ? "white" : "#16231F", border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          📋 Menu
        </button>
        <button onClick={() => setOngletActif("tables")} style={{ flex: 1, background: ongletActif === "tables" ? "#1a7a3c" : "white", color: ongletActif === "tables" ? "white" : "#16231F", border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          🪑 Tables
        </button>
      </div>

      {ongletActif === "menu" ? (
        <>
          <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>+ Ajouter un plat</div>
            <input placeholder="Nom du plat" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder="Catégorie (ex: Plats, Boissons)" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
              <input placeholder={`Prix (${currency})`} type="number" value={form.prix} onChange={(e) => setForm({ ...form, prix: e.target.value })} style={{ width: 120, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <button
              onClick={() => { if (!form.nom.trim() || !form.prix) return; onAdd(form); setForm({ nom: "", categorie: form.categorie, prix: "", description: "" }); }}
              style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Ajouter au menu
            </button>
          </div>

          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: "#8A9089", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>{cat}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plats.filter((p) => p.categorie === cat).map((p) => (
                  <div key={p.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: p.disponible ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.nom}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: "#1a7a3c" }}>{Number(p.prix).toLocaleString("fr-FR")} {currency}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => onToggleDisponibilite(p.id, p.disponible)} style={{ background: p.disponible ? "#EAF3DE" : "#F0EEE6", color: p.disponible ? "#3B6D11" : "#8A9089", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        {p.disponible ? "Disponible" : "Épuisé"}
                      </button>
                      <button onClick={() => onDelete(p.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {plats.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucun plat pour l'instant.</div>}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Numéro de table (ex: 5, Terrasse 2)" value={nouvelleTable} onChange={(e) => setNouvelleTable(e.target.value)} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
            <button
              onClick={() => { if (!nouvelleTable.trim()) return; onAddTable(nouvelleTable.trim()); setNouvelleTable(""); }}
              style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              + Ajouter
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 10 }}>
            {tablesRestaurant.map((t) => (
              <button
                key={t.id}
                onClick={() => onToggleStatutTable(t.id, t.statut)}
                style={{ background: t.statut === "occupee" ? "#FBEAE6" : "#EAF3DE", border: `1px solid ${t.statut === "occupee" ? "#F0B8AC" : "#C7DDA3"}`, borderRadius: 10, padding: "14px 8px", textAlign: "center", cursor: "pointer" }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#16231F" }}>{t.numero}</div>
                <div style={{ fontSize: 10.5, color: t.statut === "occupee" ? "#D64933" : "#3B6D11", marginTop: 2 }}>{t.statut === "occupee" ? "Occupée" : "Libre"}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 8 }}>Clique sur une table pour changer son statut manuellement si besoin.</div>
          {tablesRestaurant.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucune table pour l'instant.</div>}
        </>
      )}
    </div>
  );
}

function CuisineView({ commandes, onChangerStatutCuisine, currency }) {
  const colonnes = [
    { statut: "nouvelle", titre: "🆕 Nouvelle", couleur: "#8A6412", suivant: "en_preparation", labelBouton: "Démarrer" },
    { statut: "en_preparation", titre: "🔥 En préparation", couleur: "#D64933", suivant: "prete", labelBouton: "Marquer prête" },
    { statut: "prete", titre: "✅ Prête", couleur: "#1a7a3c", suivant: "servie", labelBouton: "Servie" },
  ];

  const commandesParStatut = (statut) => commandes.filter((c) => (c.statut_cuisine || "nouvelle") === statut);

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>🍽️ Cuisine</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {colonnes.map((col) => (
          <div key={col.statut}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: col.couleur, marginBottom: 10 }}>
              {col.titre} ({commandesParStatut(col.statut).length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commandesParStatut(col.statut).map((c) => (
                <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${col.couleur}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.client}</div>
                  <div style={{ fontSize: 12, color: "#6B7168", marginTop: 2 }}>{c.produit}</div>
                  <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>
                    {c.type_commande === "sur_place" ? "🍽️ Sur place" : c.type_commande === "emporter" ? "🥡 À emporter" : "🚚 Livraison"}
                  </div>
                  <button
                    onClick={() => onChangerStatutCuisine(c.id, col.suivant)}
                    style={{ width: "100%", marginTop: 8, background: col.couleur, color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    {col.labelBouton}
                  </button>
                </div>
              ))}
              {commandesParStatut(col.statut).length === 0 && (
                <div style={{ fontSize: 12, color: "#8A9089", textAlign: "center", padding: "16px 0" }}>Rien ici</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RapprochementView({ workspace, commandes, onValide }) {
  const [texteColle, setTexteColle] = useState("");
  const [propositions, setPropositions] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [historique, setHistorique] = useState(null);
  const [afficherHistorique, setAfficherHistorique] = useState(false);
  const [scanEnCours, setScanEnCours] = useState(false);
  const [dernierScan, setDernierScan] = useState(null);

  async function scannerRecu(fichier) {
    if (!fichier) return;
    if (!window.Tesseract) {
      alert("Le lecteur de reçu n'est pas encore chargé, réessaie dans quelques secondes.");
      return;
    }
    setScanEnCours(true);
    setDernierScan(null);
    try {
      const { data } = await window.Tesseract.recognize(fichier, "fra");
      const texteOCR = data.text || "";

      // Cherche le plus gros montant (souvent le montant de la transaction),
      // en ignorant les nombres trop courts (probablement une date/heure).
      const montantsTrouves = (texteOCR.match(/\d[\d\s.,]{3,}/g) || [])
        .map((m) => Number(m.replace(/[\s.,](?=\d{3}\b)/g, "").replace(",", ".")))
        .filter((n) => !isNaN(n) && n >= 100 && n <= 100000000);
      const montant = montantsTrouves.length ? Math.max(...montantsTrouves) : null;

      // Cherche un numéro de téléphone ivoirien (10 chiffres, ou +225/00225 suivi de 10 chiffres)
      const telMatch = texteOCR.match(/(?:\+?225|00225)?[\s.]?0?[0-9]{1,2}(?:[\s.]?[0-9]{2}){4,5}/);
      const telephone = telMatch ? telMatch[0].replace(/\s/g, "") : "";

      // Cherche une référence de transaction (souvent après "Réf", "ID", ou une suite alphanumérique)
      const refMatch = texteOCR.match(/(?:réf|ref|id|transaction)[\s:.]*([A-Z0-9]{5,})/i);
      const reference = refMatch ? refMatch[1] : "";

      if (!montant) {
        setDernierScan({ succes: false, message: "Aucun montant clair détecté sur cette image. Ajoute la ligne manuellement." });
        setScanEnCours(false);
        return;
      }

      const nouvelleLigne = `${montant},${telephone},${reference}`;
      setTexteColle((t) => (t.trim() ? t.trim() + "\n" + nouvelleLigne : nouvelleLigne));
      setDernierScan({ succes: true, montant, telephone, reference });
    } catch (e) {
      setDernierScan({ succes: false, message: "Erreur de lecture : " + e.message });
    }
    setScanEnCours(false);
  }

  function normaliserTel(tel) {
    return String(tel || "").replace(/\D/g, "").replace(/^225/, "").replace(/^0/, "");
  }

  function analyserCSV() {
    const lignes = texteColle.trim().split("\n").filter((l) => l.trim());
    const paiements = lignes.map((ligne) => {
      // Accepte séparateur virgule, point-virgule, ou tabulation (copié depuis Excel)
      const parties = ligne.split(/[,;\t]/).map((p) => p.trim());
      const montant = parties.find((p) => /^\d+([.,]\d+)?$/.test(p.replace(/\s/g, "")));
      const tel = parties.find((p) => /^(\+?225)?[\s.]?0?[0-9]{8,10}$/.test(p.replace(/\s/g, "")));
      const reference = parties.find((p) => p !== montant && p !== tel && p.length > 2) || "";
      return {
        montant: montant ? Number(montant.replace(/\s/g, "").replace(",", ".")) : null,
        telephone: tel || "",
        reference,
        ligneOriginale: ligne,
      };
    }).filter((p) => p.montant);

    const candidats = commandes.filter((c) => c.statut === "en_cours" || c.statut === "echouee");

    const resultats = paiements.map((p) => {
      const telNorm = normaliserTel(p.telephone);
      let meilleureCorrespondance = null;
      let meilleurScore = 0;

      candidats.forEach((c) => {
        const memeTel = telNorm && normaliserTel(c.tel) === telNorm;
        const memeMontant = Math.abs(Number(c.montant) - p.montant) < 1;
        let score = 0;
        if (memeMontant && memeTel) score = 98;
        else if (memeMontant) score = 70;
        else if (memeTel) score = 50;
        if (score > meilleurScore) {
          meilleurScore = score;
          meilleureCorrespondance = c;
        }
      });

      return { ...p, commande: meilleureCorrespondance, score: meilleurScore };
    });

    setPropositions(resultats);
  }

  async function valider(prop) {
    setEnCours(true);
    if (prop.commande) {
      await supabase.from("rapprochements").insert([{
        workspace_id: workspace.id,
        commande_id: prop.commande.id,
        montant_paiement: prop.montant,
        reference_paiement: prop.reference,
        telephone_paiement: prop.telephone,
        score_correspondance: prop.score,
        statut: "valide",
      }]);
      const soldeDejaPaye = Number(prop.commande.montant_paye || 0) + prop.montant;
      const soldeComplet = soldeDejaPaye >= Number(prop.commande.montant);
      await supabase.from("commandes").update({
        montant_paye: soldeDejaPaye,
        ...(soldeComplet ? { statut: "confirmee", confirmed_at: new Date().toISOString(), confirmed_by: "Rapprochement automatique" } : {}),
      }).eq("id", prop.commande.id);
    }
    setPropositions((prev) => prev.filter((p) => p !== prop));
    setEnCours(false);
    await onValide();
  }

  async function rejeter(prop) {
    await supabase.from("rapprochements").insert([{
      workspace_id: workspace.id,
      commande_id: prop.commande?.id || null,
      montant_paiement: prop.montant,
      reference_paiement: prop.reference,
      telephone_paiement: prop.telephone,
      score_correspondance: prop.score,
      statut: "rejete",
    }]);
    setPropositions((prev) => prev.filter((p) => p !== prop));
  }

  async function chargerHistorique() {
    const { data } = await supabase.from("rapprochements").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(30);
    setHistorique(data || []);
    setAfficherHistorique(true);
  }

  function couleurScore(score) {
    if (score >= 90) return { label: "Correspondance très probable", couleur: "#1F9D6E", bg: "#EAF3DE" };
    if (score >= 60) return { label: "Correspondance possible", couleur: "#8A6412", bg: "#FBF3E3" };
    if (score > 0) return { label: "Correspondance faible", couleur: "#D64933", bg: "#FBEAE6" };
    return { label: "Aucune commande correspondante trouvée", couleur: "#8A9089", bg: "#F0EEE6" };
  }

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>🔗 Rapprochement des paiements</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16 }}>
        Colle ta liste de paiements Mobile Money (copiée depuis Excel ou ton relevé) — une ligne par paiement, avec le montant et le numéro de téléphone.
      </div>

      {!propositions && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13, color: "#3B6D11", cursor: scanEnCours ? "default" : "pointer", marginBottom: 12, boxSizing: "border-box" }}>
            {scanEnCours ? "🔍 Lecture du reçu en cours..." : "📸 Scanner un reçu (photo)"}
            <input type="file" accept="image/*" capture="environment" disabled={scanEnCours} style={{ display: "none" }} onChange={(e) => scannerRecu(e.target.files?.[0])} />
          </label>
          {dernierScan && (
            <div style={{ background: dernierScan.succes ? "#EAF3DE" : "#FBEAE6", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11.5, color: dernierScan.succes ? "#3B6D11" : "#D64933" }}>
              {dernierScan.succes
                ? `✅ Détecté : ${Number(dernierScan.montant).toLocaleString("fr-FR")} FCFA${dernierScan.telephone ? " · " + dernierScan.telephone : ""}${dernierScan.reference ? " · " + dernierScan.reference : ""} — vérifie la ligne ajoutée ci-dessous avant d'analyser.`
                : "⚠️ " + dernierScan.message}
            </div>
          )}
          <textarea
            value={texteColle}
            onChange={(e) => setTexteColle(e.target.value)}
            placeholder={"Exemple, une ligne par paiement :\n15000, 0708090910, TXN4521\n25000, 0102030405, TXN4522"}
            rows={8}
            style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box", marginBottom: 12, resize: "vertical" }}
          />
          <button
            onClick={analyserCSV}
            disabled={!texteColle.trim()}
            style={{ width: "100%", background: texteColle.trim() ? "#1a7a3c" : "#DDD8CC", color: "white", border: "none", borderRadius: 9, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: texteColle.trim() ? "pointer" : "default" }}
          >
            Analyser et proposer les correspondances
          </button>
        </div>
      )}

      {propositions && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{propositions.length} paiement{propositions.length > 1 ? "s" : ""} à traiter</div>
            <button onClick={() => setPropositions(null)} style={{ background: "none", border: "none", color: "#1a7a3c", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>← Nouvel import</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {propositions.map((prop, i) => {
              const niveau = couleurScore(prop.score);
              return (
                <div key={i} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${niveau.couleur}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15 }}>{prop.montant.toLocaleString("fr-FR")} {workspace.currency}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{prop.telephone || "Numéro non détecté"} {prop.reference && `· Réf: ${prop.reference}`}</div>
                    </div>
                    {prop.score > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: niveau.couleur, background: niveau.bg, padding: "2px 8px", borderRadius: 999, height: "fit-content" }}>
                        {prop.score}%
                      </div>
                    )}
                  </div>

                  <div style={{ background: niveau.bg, borderRadius: 8, padding: "8px 10px", marginTop: 8, fontSize: 12 }}>
                    {prop.commande ? (
                      <>
                        <span style={{ color: niveau.couleur, fontWeight: 700 }}>{niveau.label}</span>
                        <div style={{ color: "#16231F", marginTop: 2 }}>{prop.commande.client} — {prop.commande.produit} ({Number(prop.commande.montant).toLocaleString("fr-FR")} {workspace.currency})</div>
                      </>
                    ) : (
                      <span style={{ color: niveau.couleur }}>{niveau.label}</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {prop.commande && (
                      <button onClick={() => valider(prop)} disabled={enCours} style={{ flex: 1, background: "#1F9D6E", color: "white", border: "none", borderRadius: 7, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        ✅ Valider
                      </button>
                    )}
                    <button onClick={() => rejeter(prop)} disabled={enCours} style={{ flex: 1, background: "white", border: "1px solid #DDD8CC", color: "#8A9089", borderRadius: 7, padding: "8px 0", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                      {prop.commande ? "Rejeter" : "Ignorer"}
                    </button>
                  </div>
                </div>
              );
            })}
            {propositions.length === 0 && (
              <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Tout est traité ✅</div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 24, borderTop: "1px solid #ECE8DC", paddingTop: 16 }}>
        <button onClick={chargerHistorique} style={{ background: "white", border: "1px solid #DDD8CC", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {afficherHistorique ? "Actualiser" : "Voir"} l'historique des rapprochements
        </button>
        {afficherHistorique && historique && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {historique.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Aucun rapprochement pour l'instant.</div>}
            {historique.map((h) => (
              <div key={h.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 8, padding: "8px 12px", fontSize: 11.5, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: h.statut === "valide" ? "#1F9D6E" : "#D64933", fontWeight: 700 }}>
                  {h.statut === "valide" ? "✅" : "❌"} {Number(h.montant_paiement).toLocaleString("fr-FR")} {workspace.currency}
                </span>
                <span style={{ color: "#8A9089" }}>{new Date(h.created_at).toLocaleDateString("fr-FR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SimulateurCampagneView({ currency }) {
  const [form, setForm] = useState({
    prixVente: "",
    coutProduit: "",
    coutLivraison: "1500",
    commissionCloser: "",
    budgetPub: "",
    tauxConfirmation: "60",
    tauxLivraison: "80",
    coutParCommande: "",
  });

  function champ(cle, val) {
    setForm({ ...form, [cle]: val });
  }

  const resultats = useMemo(() => {
    const prixVente = Number(form.prixVente) || 0;
    const coutProduit = Number(form.coutProduit) || 0;
    const coutLivraison = Number(form.coutLivraison) || 0;
    const commission = Number(form.commissionCloser) || 0;
    const budgetPub = Number(form.budgetPub) || 0;
    const coutParCommande = Number(form.coutParCommande) || 0;
    const tauxConfirmation = Number(form.tauxConfirmation) || 0;
    const tauxLivraisonPct = Number(form.tauxLivraison) || 0;

    if (!prixVente || !budgetPub || !coutParCommande) return null;

    const commandesEstimees = Math.round(budgetPub / coutParCommande);
    const commandesConfirmees = Math.round(commandesEstimees * (tauxConfirmation / 100));
    const livraisons = Math.round(commandesConfirmees * (tauxLivraisonPct / 100));

    const chiffreAffaires = livraisons * prixVente;
    const coutsProduits = livraisons * coutProduit;
    const coutsLivraisons = livraisons * coutLivraison;
    const coutsCommissions = livraisons * commission;
    const coutsTotaux = coutsProduits + coutsLivraisons + coutsCommissions + budgetPub;
    const beneficeEstime = chiffreAffaires - coutsTotaux;

    const margeParLivraison = prixVente - coutProduit - coutLivraison - commission;
    const seuilRentabilite = margeParLivraison > 0 ? Math.ceil(budgetPub / margeParLivraison) : null;

    return { commandesEstimees, commandesConfirmees, livraisons, chiffreAffaires, coutsTotaux, beneficeEstime, seuilRentabilite, margeParLivraison };
  }, [form]);

  const champStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", marginBottom: 10 };
  const labelStyle = { fontSize: 11, color: "#8A9089", marginBottom: 3, display: "block" };

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>📊 Simulateur de campagne</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
        Avant de dépenser en publicité, sais combien de commandes livrées il te faut pour être rentable.
      </div>

      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>Ton produit</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Prix de vente ({currency})</label>
            <input type="number" value={form.prixVente} onChange={(e) => champ("prixVente", e.target.value)} style={champStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Coût produit ({currency})</label>
            <input type="number" value={form.coutProduit} onChange={(e) => champ("coutProduit", e.target.value)} style={champStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Coût livraison ({currency})</label>
            <input type="number" value={form.coutLivraison} onChange={(e) => champ("coutLivraison", e.target.value)} style={champStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Commission closer ({currency})</label>
            <input type="number" value={form.commissionCloser} onChange={(e) => champ("commissionCloser", e.target.value)} style={champStyle} />
          </div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 10, marginBottom: 14 }}>Ta publicité</div>
        <label style={labelStyle}>Budget publicitaire total ({currency})</label>
        <input type="number" value={form.budgetPub} onChange={(e) => champ("budgetPub", e.target.value)} style={champStyle} />
        <label style={labelStyle}>Coût estimé par commande générée ({currency}) — ce que ta pub coûte pour obtenir une commande</label>
        <input type="number" value={form.coutParCommande} onChange={(e) => champ("coutParCommande", e.target.value)} style={champStyle} />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Taux de confirmation estimé (%)</label>
            <input type="number" value={form.tauxConfirmation} onChange={(e) => champ("tauxConfirmation", e.target.value)} style={champStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Taux de livraison estimé (%)</label>
            <input type="number" value={form.tauxLivraison} onChange={(e) => champ("tauxLivraison", e.target.value)} style={{ ...champStyle, marginBottom: 0 }} />
          </div>
        </div>
      </div>

      {resultats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Commandes estimées</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 3 }}>{resultats.commandesEstimees}</div>
            </div>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Confirmées</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 3 }}>{resultats.commandesConfirmees}</div>
            </div>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Livraisons</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 3 }}>{resultats.livraisons}</div>
            </div>
            <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Chiffre d'affaires</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, marginTop: 3 }}>{resultats.chiffreAffaires.toLocaleString("fr-FR")}</div>
            </div>
          </div>

          <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💰 Bénéfice estimé</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 26, color: resultats.beneficeEstime >= 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 3 }}>
              {resultats.beneficeEstime.toLocaleString("fr-FR")} {currency}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Coûts totaux (produits + livraisons + commissions + pub) : {resultats.coutsTotaux.toLocaleString("fr-FR")} {currency}
            </div>
          </div>

          {resultats.margeParLivraison <= 0 ? (
            <div style={{ background: "#FBEAE6", border: "1px solid #F0B8AC", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "#D64933", fontWeight: 600 }}>
              🔴 Ta marge par livraison ({resultats.margeParLivraison.toLocaleString("fr-FR")} {currency}) est négative ou nulle — cette campagne ne peut pas devenir rentable avec ces chiffres, quel que soit le volume.
            </div>
          ) : (
            <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "#3B6D11", fontWeight: 600 }}>
              🟢 À partir de <strong>{resultats.seuilRentabilite} commande{resultats.seuilRentabilite > 1 ? "s" : ""} livrée{resultats.seuilRentabilite > 1 ? "s" : ""}</strong>, cette campagne devient rentable.
            </div>
          )}
        </>
      )}

      {!resultats && (
        <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "20px 0" }}>
          Remplis au moins le prix de vente, le budget publicitaire et le coût par commande pour voir la simulation.
        </div>
      )}
    </div>
  );
}

function ScoreBusinessView({ toutesCommandes, beneficeReel, caConfirme, currency, depotsParLivreur, rentabiliteParCloser = [], rentabiliteParZone = [], rentabiliteParCampagne = [], workspaceId }) {
  const [depensesParCampagne, setDepensesParCampagne] = useState({});
  const [saisieDepense, setSaisieDepense] = useState({});
  const [enregistrementCampagne, setEnregistrementCampagne] = useState(null);

  useEffect(() => {
    if (!workspaceId) return;
    supabase.from("depenses_publicitaires").select("nom_campagne, montant").eq("workspace_id", workspaceId).then(({ data }) => {
      if (!data) return;
      const totaux = {};
      data.forEach((d) => { totaux[d.nom_campagne] = (totaux[d.nom_campagne] || 0) + Number(d.montant); });
      setDepensesParCampagne(totaux);
    });
  }, [workspaceId]);

  async function ajouterDepenseCampagne(nomCampagne) {
    const montant = Number(saisieDepense[nomCampagne]);
    if (!montant || montant <= 0) return;
    setEnregistrementCampagne(nomCampagne);
    await supabase.from("depenses_publicitaires").insert([{ workspace_id: workspaceId, nom_campagne: nomCampagne, montant }]);
    setDepensesParCampagne((v) => ({ ...v, [nomCampagne]: (v[nomCampagne] || 0) + montant }));
    setSaisieDepense((v) => ({ ...v, [nomCampagne]: "" }));
    setEnregistrementCampagne(null);
  }

  const composantes = useMemo(() => {
    const now = new Date();
    const debutMoisActuel = new Date(now.getFullYear(), now.getMonth(), 1);
    const debutMoisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const commandesMoisActuel = toutesCommandes.filter((c) => new Date(c.created_at) >= debutMoisActuel);
    const commandesMoisPrecedent = toutesCommandes.filter((c) => new Date(c.created_at) >= debutMoisPrecedent && new Date(c.created_at) < debutMoisActuel);

    // 1. Taux de livraison réussie
    const traitees = toutesCommandes.filter((c) => c.statut === "confirmee" || c.statut === "echouee");
    const tauxLivraison = traitees.length > 0 ? Math.round((toutesCommandes.filter((c) => c.statut === "confirmee").length / traitees.length) * 100) : 100;

    // 2. Taux de récupération (commandes traitées qui finissent confirmées)
    const echoueesTotal = toutesCommandes.filter((c) => c.statut === "echouee").length;
    const confirmeesTotal = toutesCommandes.filter((c) => c.statut === "confirmee").length;
    const totalTraitees2 = echoueesTotal + confirmeesTotal;
    const tauxRecuperation = totalTraitees2 > 0 ? Math.round((confirmeesTotal / totalTraitees2) * 100) : 100;

    // 3. Santé financière (bénéfice positif par rapport au CA)
    const margeSante = caConfirme > 0 ? Math.max(0, Math.min(100, Math.round((beneficeReel / caConfirme) * 100 + 50))) : 50;

    // 4. Croissance mois sur mois
    const croissance = commandesMoisPrecedent.length > 0
      ? Math.max(0, Math.min(100, Math.round(50 + ((commandesMoisActuel.length - commandesMoisPrecedent.length) / commandesMoisPrecedent.length) * 100)))
      : (commandesMoisActuel.length > 0 ? 70 : 50);

    // 5. Fiabilité de l'équipe livreurs (moyenne des dépôts positifs = équipe saine financièrement)
    const fiabiliteEquipe = depotsParLivreur.length > 0
      ? Math.round((depotsParLivreur.filter((l) => l.aDeposer >= 0).length / depotsParLivreur.length) * 100)
      : 100;

    // 6. Discipline de suivi (peu de commandes bloquées longtemps en_cours)
    const enCoursAnciennes = toutesCommandes.filter((c) => c.statut === "en_cours" && (Date.now() - new Date(c.created_at).getTime()) / 86400000 > 3).length;
    const enCoursTotal = toutesCommandes.filter((c) => c.statut === "en_cours").length;
    const disciplineSuivi = enCoursTotal > 0 ? Math.round(100 - (enCoursAnciennes / enCoursTotal) * 100) : 100;

    return [
      { label: "Taux de livraison", valeur: tauxLivraison, icone: "🚚" },
      { label: "Taux de récupération", valeur: tauxRecuperation, icone: "🎯" },
      { label: "Santé financière", valeur: margeSante, icone: "💰" },
      { label: "Croissance", valeur: croissance, icone: "📈" },
      { label: "Fiabilité équipe", valeur: fiabiliteEquipe, icone: "🤝" },
      { label: "Discipline de suivi", valeur: disciplineSuivi, icone: "📋" },
    ];
  }, [toutesCommandes, beneficeReel, caConfirme, depotsParLivreur]);

  const scoreGlobal = Math.round(composantes.reduce((s, c) => s + c.valeur, 0) / composantes.length);

  function niveauScore(score) {
    if (score >= 75) return { label: "Excellent", couleur: "#1F9D6E" };
    if (score >= 55) return { label: "Correct", couleur: "#8A6412" };
    return { label: "À surveiller", couleur: "#D64933" };
  }

  const niveauGlobal = niveauScore(scoreGlobal);

  const recommandations = useMemo(() => {
    const conseils = {
      "Taux de livraison": "Regarde tes anomalies produit/zone dans Commandes — un même produit qui échoue souvent dans une zone précise cache souvent un souci d'adresse ou de livreur.",
      "Taux de récupération": "Va dans Récupération — chaque commande à risque a un bouton direct pour relancer le client sur WhatsApp.",
      "Santé financière": "Vérifie que tous tes produits ont un coût d'achat ET des frais de transport renseignés dans le catalogue — sinon ton bénéfice réel est sous-estimé, ou tu vends à perte sans le savoir.",
      "Croissance": "Regarde tes clients à relancer dans l'écran Clients — relancer un ancien client coûte moins cher que d'en trouver un nouveau.",
      "Fiabilité équipe": "Va dans Compta, section \"Détail par livreur\" — identifie qui a un solde à déposer négatif ou en retard.",
      "Discipline de suivi": "Des commandes restent \"en cours\" depuis plus de 3 jours — reprogramme-les ou marque-les échouées pour garder ta liste à jour.",
    };
    return [...composantes]
      .sort((a, b) => a.valeur - b.valeur)
      .slice(0, 3)
      .filter((c) => c.valeur < 90)
      .map((c) => ({ ...c, conseil: conseils[c.label] }));
  }, [composantes]);

  const totalVentesConfirmees = useMemo(() => toutesCommandes.filter((c) => c.statut === "confirmee").reduce((s, c) => s + Number(c.montant), 0), [toutesCommandes]);
  function calculerBadgeVendeur(total) {
    if (total >= 10000000) return { nom: "Diamant", icone: "💎", couleur: "#5EC8F2", seuilSuivant: null };
    if (total >= 3000000) return { nom: "Or", icone: "🥇", couleur: "#e8920a", seuilSuivant: 10000000 };
    if (total >= 500000) return { nom: "Argent", icone: "🥈", couleur: "#B0B8BE", seuilSuivant: 3000000 };
    return { nom: "Bronze", icone: "🥉", couleur: "#C08552", seuilSuivant: 500000 };
  }
  const badgeVendeur = calculerBadgeVendeur(totalVentesConfirmees);
  const progressionBadge = badgeVendeur.seuilSuivant ? Math.min(100, Math.round((totalVentesConfirmees / badgeVendeur.seuilSuivant) * 100)) : 100;

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>🧭 Score Business</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
        Le résumé exécutif de ton activité — 6 indicateurs combinés en un seul chiffre.
      </div>

      <div style={{ background: "white", border: `1.5px solid ${badgeVendeur.couleur}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontSize: 36, flexShrink: 0 }}>{badgeVendeur.icone}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.04em" }}>Statut vendeur</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: badgeVendeur.couleur }}>{badgeVendeur.nom}</div>
          {badgeVendeur.seuilSuivant ? (
            <>
              <div style={{ background: "#ECE8DC", borderRadius: 999, height: 6, overflow: "hidden", marginTop: 6 }}>
                <div style={{ width: `${progressionBadge}%`, background: badgeVendeur.couleur, height: "100%", borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 4 }}>
                {(badgeVendeur.seuilSuivant - totalVentesConfirmees).toLocaleString("fr-FR")} {currency} avant le niveau suivant
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 4 }}>Niveau maximum atteint 🎉</div>
          )}
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 18, padding: "28px 24px", marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Score global</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 56, color: niveauGlobal.couleur, lineHeight: 1 }}>
          {scoreGlobal}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: niveauGlobal.couleur, marginTop: 6 }}>{niveauGlobal.label}</div>
      </div>

      {recommandations.length > 0 && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#8A6412", marginBottom: 10 }}>
            💡 Les {recommandations.length} choses qui te feraient le plus progresser
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recommandations.map((r, i) => (
              <div key={r.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#8A6412", color: "white", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8A6412" }}>{r.icone} {r.label} ({r.valeur}/100)</div>
                  <div style={{ fontSize: 12, color: "#6B7168", marginTop: 2, lineHeight: 1.45 }}>{r.conseil}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {composantes.map((c) => {
          const niveau = niveauScore(c.valeur);
          return (
            <div key={c.label} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.icone} {c.label}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: niveau.couleur }}>{c.valeur}</span>
              </div>
              <div style={{ background: "#ECE8DC", borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${c.valeur}%`, background: niveau.couleur, height: "100%", borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "#8A9089", marginTop: 16, lineHeight: 1.6 }}>
        Calculé à partir de tes 30 derniers jours de commandes, ton bénéfice réel, et la fiabilité de ton équipe. Un score qui remonte reflète une activité qui se solidifie.
      </div>

      {rentabiliteParCloser.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>💼 Rentabilité par closer</div>
          <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 12 }}>Bénéfice réel généré, pas juste le nombre de ventes.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rentabiliteParCloser.map((r) => (
              <div key={r.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.nom}</div>
                  <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>{r.nbCommandes} commande{r.nbCommandes > 1 ? "s" : ""} confirmée{r.nbCommandes > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: r.benefice >= 0 ? "#1F9D6E" : "#D64933" }}>
                    {r.benefice.toLocaleString("fr-FR")} {currency}
                  </div>
                  <div style={{ fontSize: 10, color: "#8A9089" }}>bénéfice réel</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rentabiliteParZone.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>📍 Rentabilité par zone</div>
          <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 12 }}>Certaines zones coûtent plus cher à livrer qu'elles ne rapportent.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rentabiliteParZone.slice(0, 10).map((r) => (
              <div key={r.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</div>
                  <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>{r.nbCommandes} commande{r.nbCommandes > 1 ? "s" : ""} confirmée{r.nbCommandes > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: r.benefice >= 0 ? "#1F9D6E" : "#D64933" }}>
                    {r.benefice.toLocaleString("fr-FR")} {currency}
                  </div>
                  <div style={{ fontSize: 10, color: "#8A9089" }}>bénéfice réel</div>
                </div>
              </div>
            ))}
          </div>
          {rentabiliteParZone.length > 10 && (
            <div style={{ fontSize: 11, color: "#8A9089", marginTop: 8, textAlign: "center" }}>+ {rentabiliteParZone.length - 10} autre{rentabiliteParZone.length - 10 > 1 ? "s" : ""} zone{rentabiliteParZone.length - 10 > 1 ? "s" : ""}</div>
          )}
        </div>
      )}

      {rentabiliteParCampagne.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>🎯 Rentabilité par campagne publicitaire</div>
          <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 12 }}>Uniquement les commandes arrivées via un lien avec suivi (utm_source/utm_campaign, ou pub Facebook/TikTok détectée). Ajoute ce que tu as réellement dépensé pour voir ton vrai ROAS.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rentabiliteParCampagne.map((r) => {
              const depensePub = depensesParCampagne[r.nom] || 0;
              const beneficeApresPub = r.benefice - depensePub;
              return (
                <div key={r.nom} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: depensePub > 0 ? 10 : 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nom}</div>
                      <div style={{ fontSize: 11, color: "#8A9089", marginTop: 2 }}>{r.nbCommandes} commande{r.nbCommandes > 1 ? "s" : ""} confirmée{r.nbCommandes > 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: beneficeApresPub >= 0 ? "#1F9D6E" : "#D64933" }}>
                        {beneficeApresPub.toLocaleString("fr-FR")} {currency}
                      </div>
                      <div style={{ fontSize: 10, color: "#8A9089" }}>{depensePub > 0 ? "bénéfice après pub" : "bénéfice (sans dépense pub renseignée)"}</div>
                    </div>
                  </div>
                  {depensePub > 0 && (
                    <div style={{ fontSize: 10.5, color: "#8A9089", borderTop: "1px solid #F0EEE6", paddingTop: 8, marginBottom: 8 }}>
                      {r.benefice.toLocaleString("fr-FR")} {currency} de bénéfice avant pub − {depensePub.toLocaleString("fr-FR")} {currency} dépensés = ROAS {depensePub > 0 ? (r.ca / depensePub).toFixed(1) : "—"}x
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      placeholder={`Ajouter une dépense pub (${currency})`}
                      value={saisieDepense[r.nom] || ""}
                      onChange={(e) => setSaisieDepense((v) => ({ ...v, [r.nom]: e.target.value }))}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid #DDD8CC", fontSize: 12 }}
                    />
                    <button
                      onClick={() => ajouterDepenseCampagne(r.nom)}
                      disabled={enregistrementCampagne === r.nom}
                      style={{ background: "#1E4B8C", color: "white", border: "none", borderRadius: 7, padding: "0 12px", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}
                    >
                      {enregistrementCampagne === r.nom ? "..." : "＋ Ajouter"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryCenterView({ commandes, toutesCommandes = [], currency, nomEntreprise }) {
  const totalARisque = commandes.reduce((s, c) => s + Number(c.montant), 0);
  const risqueEleve = commandes.filter((c) => c.scoreRisque >= 61);
  const aSurveiller = commandes.filter((c) => c.scoreRisque >= 31 && c.scoreRisque < 61);
  const recuperable = commandes.filter((c) => c.scoreRisque < 31);

  const kpis = useMemo(() => {
    // Une commande "à risque" au sens large : a connu au moins un échec avant confirmation, ou a été confirmée après un long délai
    const commandesAvecHistoriqueRisque = toutesCommandes.filter((c) => c.statut === "confirmee" || c.statut === "echouee");
    const echoueesTotal = toutesCommandes.filter((c) => c.statut === "echouee").length;
    const confirmeesApresRisque = toutesCommandes.filter((c) => c.statut === "confirmee").length;
    const totalRisqueHistorique = echoueesTotal + confirmeesApresRisque;
    const recoveryRate = totalRisqueHistorique > 0 ? Math.round((confirmeesApresRisque / totalRisqueHistorique) * 100) : 0;

    const revenueRecovered = toutesCommandes
      .filter((c) => c.statut === "confirmee")
      .reduce((s, c) => s + Number(c.montant), 0);

    const outstandingRevenue = toutesCommandes
      .filter((c) => c.statut === "en_cours")
      .reduce((s, c) => s + Number(c.montant), 0);

    const commandesAvecDelai = toutesCommandes.filter((c) => c.statut === "confirmee" && c.confirmed_at && c.created_at);
    const totalJours = commandesAvecDelai.reduce((s, c) => s + (new Date(c.confirmed_at) - new Date(c.created_at)) / 86400000, 0);
    const daysToPayment = commandesAvecDelai.length > 0 ? (totalJours / commandesAvecDelai.length).toFixed(1) : "—";

    return { recoveryRate, revenueRecovered, outstandingRevenue, daysToPayment };
  }, [toutesCommandes]);

  function niveauScore(score) {
    if (score >= 61) return { label: "Risque élevé", couleur: "#D64933", bg: "#FBEAE6" };
    if (score >= 31) return { label: "À surveiller", couleur: "#8A6412", bg: "#FBF3E3" };
    return { label: "Très récupérable", couleur: "#1F9D6E", bg: "#EAF3DE" };
  }

  function lienRecuperation(c) {
    const texte = `Bonjour ${c.client}, nous n'avons pas encore pu finaliser votre commande "${c.produit}" (${Number(c.montant).toLocaleString("fr-FR")} ${currency}) chez ${nomEntreprise}. Êtes-vous toujours disponible pour la recevoir ?`;
    const telPropre = cleanPhoneForWhatsApp(c.tel || "");
    return `https://wa.me/${telPropre}?text=${encodeURIComponent(texte)}`;
  }

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>🎯 Centre de récupération</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16 }}>
        Chaque vente non encore encaissée, classée par urgence — pas juste une liste, un plan d'action.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Taux de récupération</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#1a7a3c", marginTop: 3 }}>{kpis.recoveryRate}%</div>
        </div>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Revenue Recovered</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: "#16231F", marginTop: 3 }}>{kpis.revenueRecovered.toLocaleString("fr-FR")}</div>
        </div>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Outstanding</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: "#8A6412", marginTop: 3 }}>{kpis.outstandingRevenue.toLocaleString("fr-FR")}</div>
        </div>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#8A9089", textTransform: "uppercase" }}>Days to Payment</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#16231F", marginTop: 3 }}>{kpis.daysToPayment}{kpis.daysToPayment !== "—" && "j"}</div>
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase" }}>💰 Total à récupérer</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 26, color: "#f0a0a0", marginTop: 3 }}>
          {totalARisque.toLocaleString("fr-FR")} {currency}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {commandes.length} commande{commandes.length > 1 ? "s" : ""} à traiter
        </div>
      </div>

      {commandes.length === 0 && (
        <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "40px 0" }}>
          Rien à récupérer pour l'instant — toutes tes commandes en cours sont sous contrôle. 🎉
        </div>
      )}

      {[
        { titre: "🔴 Risque élevé", liste: risqueEleve },
        { titre: "🟠 À surveiller", liste: aSurveiller },
        { titre: "🟢 Très récupérable", liste: recuperable },
      ].map((groupe) => groupe.liste.length > 0 && (
        <div key={groupe.titre} style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>{groupe.titre} ({groupe.liste.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groupe.liste.map((c) => {
              const niveau = niveauScore(c.scoreRisque);
              return (
                <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${niveau.couleur}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.client}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{c.produit}</div>
                      {c.nbRelances > 0 && <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 2 }}>{c.nbRelances} relance{c.nbRelances > 1 ? "s" : ""} déjà envoyée{c.nbRelances > 1 ? "s" : ""}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: niveau.couleur, background: niveau.bg, padding: "1px 7px", borderRadius: 999, marginTop: 3, display: "inline-block" }}>
                        Score {c.scoreRisque}
                      </div>
                    </div>
                  </div>
                  <a
                    href={lienRecuperation(c)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", textAlign: "center", marginTop: 10, background: "#1F9D6E", color: "white", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, textDecoration: "none" }}
                  >
                    💬 Récupérer maintenant
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProduitsViewSaas({ produitsAvecBenefice, currency, onGererCatalogue }) {
  const totalBenefice = produitsAvecBenefice.reduce((s, p) => s + p.beneficeRealise, 0);
  const maxBenefice = Math.max(...produitsAvecBenefice.map((p) => p.beneficeRealise), 1);
  const produitsSansCout = produitsAvecBenefice.filter((p) => !p.cout_achat || Number(p.cout_achat) === 0);
  const produitsSansPrix = produitsAvecBenefice.filter((p) => !p.prix_vente || Number(p.prix_vente) === 0);

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>Produits</div>
        <button
          onClick={onGererCatalogue}
          style={{ background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          ⚙️ Gérer le catalogue
        </button>
      </div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 18 }}>
        {produitsAvecBenefice.length} produit{produitsAvecBenefice.length > 1 ? "s" : ""} · classés par bénéfice réalisé
      </div>

      <div style={{ background: "linear-gradient(135deg, #16231F, #1e2f28)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.03em" }}>💰 Bénéfice total réalisé (toutes commandes livrées)</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 26, color: totalBenefice >= 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 4 }}>
          {totalBenefice.toLocaleString("fr-FR")} {currency}
        </div>
      </div>

      {(produitsSansCout.length > 0 || produitsSansPrix.length > 0) && (
        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#8A6412", lineHeight: 1.6 }}>
          {produitsSansCout.length > 0 && <div>⚠️ {produitsSansCout.length} produit{produitsSansCout.length > 1 ? "s" : ""} sans coût d'achat renseigné — bénéfice sous-estimé pour eux.</div>}
          {produitsSansPrix.length > 0 && <div>⚠️ {produitsSansPrix.length} produit{produitsSansPrix.length > 1 ? "s" : ""} sans prix de vente renseigné — invisible sur ta boutique publique.</div>}
        </div>
      )}

      {produitsAvecBenefice.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#8A9089", fontSize: 14 }}>
          Aucun produit dans ton catalogue.
          <button onClick={onGererCatalogue} style={{ display: "block", margin: "14px auto 0", background: "#1a7a3c", color: "white", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Ajouter mon premier produit
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {produitsAvecBenefice.map((p, i) => (
          <div key={p.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 6 }}>
                  {i < 3 && p.beneficeRealise > 0 && ["🥇", "🥈", "🥉"][i]}
                  {p.nom}
                </div>
                <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>
                  {p.commandees} commandée{p.commandees > 1 ? "s" : ""} · {p.livrees} livrée{p.livrees > 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: p.beneficeRealise >= 0 ? "#1a7a3c" : "#D64933" }}>
                  {p.beneficeRealise.toLocaleString("fr-FR")} {currency}
                </div>
                <div style={{ fontSize: 10.5, color: "#8A9089" }}>bénéfice réalisé</div>
              </div>
            </div>

            <div style={{ background: "#ECE8DC", borderRadius: 999, height: 6, overflow: "hidden", margin: "10px 0" }}>
              <div style={{ width: `${Math.max(0, (p.beneficeRealise / maxBenefice) * 100)}%`, background: p.beneficeRealise >= 0 ? "#1a7a3c" : "#D64933", height: "100%", borderRadius: 999 }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "#FBEAE6", borderRadius: 8, padding: "7px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "#B23A22", textTransform: "uppercase" }}>Coût réel</div>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#B23A22" }}>
                  {p.coutReel ? Number(p.coutReel).toLocaleString("fr-FR") : "—"}
                </div>
                {Number(p.frais_import_unitaire) > 0 && (
                  <div style={{ fontSize: 8.5, color: "#B23A22", opacity: 0.75, marginTop: 1 }}>
                    dont 🚢 {Number(p.frais_import_unitaire).toLocaleString("fr-FR")}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, background: "#EAF3DE", borderRadius: 8, padding: "7px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "#3B6D11", textTransform: "uppercase" }}>Prix de vente</div>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#3B6D11" }}>
                  {p.prix_vente ? Number(p.prix_vente).toLocaleString("fr-FR") : "—"}
                </div>
              </div>
              <div style={{ flex: 1, background: "#EAF0FB", borderRadius: 8, padding: "7px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: "#1E4B8C", textTransform: "uppercase" }}>Marge / pièce</div>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#1E4B8C" }}>
                  {p.margeUnitaire.toLocaleString("fr-FR")}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationsViewSaas({ commandes, currency }) {
  const [tab, setTab] = useState("validees");
  const [datePreset, setDatePreset] = useState("semaine");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateRange = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start, end;
    if (datePreset === "aujourdhui") {
      start = startOfToday;
      end = new Date(startOfToday.getTime() + 86400000);
    } else if (datePreset === "hier") {
      start = new Date(startOfToday.getTime() - 86400000);
      end = startOfToday;
    } else if (datePreset === "avanthier") {
      start = new Date(startOfToday.getTime() - 2 * 86400000);
      end = new Date(startOfToday.getTime() - 86400000);
    } else if (datePreset === "semaine") {
      const day = startOfToday.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(startOfToday.getTime() - diff * 86400000);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "mois") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getTime() + 60000);
    } else if (datePreset === "personnalise" && customStart && customEnd) {
      start = new Date(customStart + "T00:00:00");
      end = new Date(customEnd + "T23:59:59");
    } else {
      start = new Date(0);
      end = new Date(now.getTime() + 60000);
    }
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  const validationsParJour = useMemo(() => {
    const confirmeesAvecDate = commandes.filter((c) => {
      if (c.statut !== "confirmee" || !c.confirmed_at) return false;
      const d = new Date(c.confirmed_at);
      return d >= dateRange.start && d < dateRange.end;
    });
    const map = {};
    confirmeesAvecDate.forEach((c) => {
      const dValidation = new Date(c.confirmed_at);
      const keyValidation = dValidation.toISOString().slice(0, 10);
      const dCreation = new Date(c.created_at);
      const keyCreation = dCreation.toISOString().slice(0, 10);
      const memeJour = keyValidation === keyCreation;
      if (!map[keyValidation]) map[keyValidation] = { date: keyValidation, label: dValidation.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), orders: [] };
      map[keyValidation].orders.push({ ...c, memeJour, labelCreation: dCreation.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) });
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [commandes, dateRange]);

  const nonValideesParJour = useMemo(() => {
    const nonValidees = commandes.filter((c) => {
      if (c.statut !== "en_cours" && c.statut !== "echouee") return false;
      const d = new Date(c.created_at);
      return d >= dateRange.start && d < dateRange.end;
    });
    const map = {};
    nonValidees.forEach((c) => {
      const d = new Date(c.created_at);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { date: key, label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }), orders: [] };
      map[key].orders.push(c);
    });
    return Object.values(map).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [commandes, dateRange]);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Validations</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 14 }}>
        Ce qui a été confirmé, jour par jour — et ce qui attend encore.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {[
          { key: "aujourdhui", label: "Aujourd'hui" },
          { key: "hier", label: "Hier" },
          { key: "avanthier", label: "Avant-hier" },
          { key: "semaine", label: "Cette semaine" },
          { key: "mois", label: "Ce mois" },
          { key: "personnalise", label: "Personnalisé" },
        ].map((d) => (
          <button
            key={d.key}
            onClick={() => setDatePreset(d.key)}
            style={{ padding: "6px 13px", borderRadius: 999, border: `1px solid ${datePreset === d.key ? "#1a7a3c" : "#DDD8CC"}`, background: datePreset === d.key ? "#1a7a3c" : "white", color: datePreset === d.key ? "white" : "#16231F", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer" }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {datePreset === "personnalise" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
          <span style={{ color: "#8A9089", fontSize: 12 }}>à</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button
          onClick={() => setTab("validees")}
          style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${tab === "validees" ? "#1a7a3c" : "#DDD8CC"}`, background: tab === "validees" ? "#1a7a3c" : "white", color: tab === "validees" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          ✅ Validées ({validationsParJour.reduce((s, g) => s + g.orders.length, 0)})
        </button>
        <button
          onClick={() => setTab("nonvalidees")}
          style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${tab === "nonvalidees" ? "#D64933" : "#DDD8CC"}`, background: tab === "nonvalidees" ? "#D64933" : "white", color: tab === "nonvalidees" ? "white" : "#16231F", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          ⏳ Non validées ({nonValideesParJour.reduce((s, g) => s + g.orders.length, 0)})
        </button>
      </div>

      {tab === "validees" && (
        <>
          {validationsParJour.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9089" }}>
              <div style={{ fontSize: 14 }}>Aucune validation enregistrée pour l'instant.</div>
            </div>
          )}
          {validationsParJour.map((group) => (
            <div key={group.date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a7a3c", textTransform: "capitalize", marginBottom: 8 }}>
                Validé {group.label} ({group.orders.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.orders.map((c) => (
                  <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.client}</div>
                        <div style={{ fontSize: 12, color: "#6B7168" }}>{c.produit}</div>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14 }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {!c.memeJour && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A6412", background: "#FBF3E3", padding: "2px 8px", borderRadius: 999 }}>
                          📅 commandée le {c.labelCreation}
                        </span>
                      )}
                      {c.confirmed_by && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#1a7a3c", background: "#EAF3DE", padding: "2px 8px", borderRadius: 999 }}>
                          ✅ validé par {c.confirmed_by}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "nonvalidees" && (
        <>
          {nonValideesParJour.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9089" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 14 }}>Tout est validé, rien en attente.</div>
            </div>
          )}
          {nonValideesParJour.map((group) => (
            <div key={group.date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#D64933", textTransform: "capitalize", marginBottom: 8 }}>
                Commandée {group.label} ({group.orders.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.orders.map((c) => (
                  <div key={c.id} style={{ background: "white", border: "1px solid #ECE8DC", borderLeft: `4px solid ${c.statut === "echouee" ? "#D64933" : "#E8A93D"}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.client}</div>
                        <div style={{ fontSize: 12, color: "#6B7168" }}>{c.produit} · {c.statut === "echouee" ? "Échouée" : "En cours"}</div>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14 }}>{Number(c.montant).toLocaleString("fr-FR")} {currency}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CelebrationOverlaySaas({ montant, client, currency }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const confettiColors = ["#e8920a", "#1F9D6E", "#1a7a3c", "#f0b94a"];

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, pointerEvents: "none" }}>
      <div
        className={leaving ? "rv-saas-celebrate-out" : "rv-saas-celebrate-in"}
        style={{ background: "#16231F", borderRadius: 20, padding: "28px 36px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", position: "relative", overflow: "visible" }}
      >
        <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
          {confettiColors.map((c, i) => (
            <span key={i} className="rv-saas-confetti" style={{ width: 6, height: 6, borderRadius: i % 2 === 0 ? "50%" : 2, background: c, display: "inline-block", animationDelay: `${i * 0.06}s` }} />
          ))}
        </div>
        <div style={{ fontSize: 32, marginBottom: 6 }}>🎉</div>
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, marginBottom: 4 }}>
          Vente récupérée{client ? ` — ${client.split(" ")[0]}` : ""}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 34, color: "#e8920a" }}>
          +{Number(montant).toLocaleString("fr-FR")} {currency}
        </div>
      </div>
    </div>
  );
}

function CarteLivreursSaas({ livreurs }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const enTourneeAvecPosition = livreurs.filter((l) => l.en_tournee && l.position_lat && l.position_lng);

  useEffect(() => {
    if (!window.L || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapRef.current, { zoomControl: true, attributionControl: true }).setView([5.359952, -4.008256], 12);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapInstanceRef.current);
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const icon = window.L.divIcon({
      html: `<div style="background:#1a7a3c;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      className: "",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    enTourneeAvecPosition.forEach((l) => {
      const marker = window.L.marker([l.position_lat, l.position_lng], { icon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`<strong>${l.nom}</strong><br/>En tournée`);
      markersRef.current.push(marker);
    });

    if (enTourneeAvecPosition.length > 0) {
      const bounds = window.L.latLngBounds(enTourneeAvecPosition.map((l) => [l.position_lat, l.position_lng]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

    setTimeout(() => mapInstanceRef.current && mapInstanceRef.current.invalidateSize(), 100);
  }, [JSON.stringify(enTourneeAvecPosition.map((l) => [l.id, l.position_lat, l.position_lng]))]);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", letterSpacing: "0.03em" }}>
          Livreurs en tournée en direct
        </div>
        {enTourneeAvecPosition.length > 0 && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F9D6E", display: "inline-block", animation: "rvPulseDot 2s ease-in-out infinite" }} />
        )}
      </div>
      <div ref={mapRef} style={{ width: "100%", height: 220, borderRadius: 12, overflow: "hidden", border: "1px solid #ECE8DC", background: "#EEF0EA" }} />
      {enTourneeAvecPosition.length === 0 && (
        <div style={{ fontSize: 12, color: "#8A9089", marginTop: 6 }}>Aucun livreur en tournée pour le moment.</div>
      )}
    </div>
  );
}
function RapportHebdomadaireModal({ commandes, currency, workspaceName, onFermer }) {
  const rapport = useMemo(() => {
    const maintenant = new Date();
    const debutSemaine = new Date(maintenant);
    debutSemaine.setDate(maintenant.getDate() - 7);
    const debutSemainePrecedente = new Date(maintenant);
    debutSemainePrecedente.setDate(maintenant.getDate() - 14);

    const semaineActuelle = commandes.filter((c) => new Date(c.created_at) >= debutSemaine);
    const semainePrecedente = commandes.filter((c) => new Date(c.created_at) >= debutSemainePrecedente && new Date(c.created_at) < debutSemaine);

    const confirmeesActuelle = semaineActuelle.filter((c) => c.statut === "confirmee");
    const confirmeesPrecedente = semainePrecedente.filter((c) => c.statut === "confirmee");

    const caActuel = confirmeesActuelle.reduce((s, c) => s + Number(c.montant), 0);
    const caPrecedent = confirmeesPrecedente.reduce((s, c) => s + Number(c.montant), 0);
    const evolutionCA = caPrecedent > 0 ? Math.round(((caActuel - caPrecedent) / caPrecedent) * 100) : (caActuel > 0 ? 100 : 0);

    const recuperees = semaineActuelle.filter((c) => c.statut === "confirmee" && c.confirmed_by).length;

    const parProduit = {};
    confirmeesActuelle.forEach((c) => {
      const nom = (c.produit || "Autre").split(" x")[0].trim();
      parProduit[nom] = (parProduit[nom] || 0) + 1;
    });
    const meilleurProduit = Object.entries(parProduit).sort((a, b) => b[1] - a[1])[0];

    return {
      caActuel, evolutionCA,
      nbConfirmees: confirmeesActuelle.length,
      nbTotal: semaineActuelle.length,
      recuperees,
      meilleurProduit: meilleurProduit ? meilleurProduit[0] : null,
    };
  }, [commandes]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 90 }} onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(160deg, #0F1B16 0%, #16231F 50%, #1a7a3c 200%)", borderRadius: 22, padding: "30px 26px", width: "100%", maxWidth: 380, color: "white", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <button onClick={onFermer} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 20, cursor: "pointer" }}>×</button>

        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.65, marginBottom: 4 }}>Ta semaine</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, marginBottom: 22 }}>{workspaceName}</div>

        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Chiffre d'affaires encaissé</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 34, color: "#e8920a" }}>
          {rapport.caActuel.toLocaleString("fr-FR")} {currency}
        </div>
        {rapport.evolutionCA !== 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: rapport.evolutionCA > 0 ? "#7fd6a3" : "#f0a0a0", marginTop: 4 }}>
            {rapport.evolutionCA > 0 ? "▲" : "▼"} {Math.abs(rapport.evolutionCA)}% vs semaine dernière
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "24px 0" }}>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{rapport.nbConfirmees}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3 }}>commandes confirmées</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 10px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#7fd6a3" }}>{rapport.recuperees}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3 }}>clients récupérés</div>
          </div>
        </div>

        {rapport.meilleurProduit && (
          <div style={{ background: "rgba(232,146,10,0.15)", border: "1px solid rgba(232,146,10,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12.5 }}>
            🏆 Ton produit vedette cette semaine : <strong>{rapport.meilleurProduit}</strong>
          </div>
        )}

        {rapport.nbTotal === 0 && (
          <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 20 }}>Aucune commande cette semaine — c'est le moment de relancer tes clients 👀</div>
        )}

        <button onClick={onFermer} style={{ width: "100%", background: "white", color: "#16231F", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Continuer
        </button>
      </div>
    </div>
  );
}

function BienvenueModal({ workspace, onFermer, onOuvrirAide }) {
  const [etape, setEtape] = useState(0);

  const estLocation = workspace.activity_type === "location_immobiliere";
  const estRetail = workspace.activity_type === "retail";
  const motCommande = estLocation ? "loyer" : "commande";
  const motClient = estLocation ? "locataire" : "client";

  const etapes = [
    {
      icone: "👋",
      titre: `Bienvenue sur RecuVente, ${workspace.name} !`,
      texte: `On te fait découvrir toutes les fonctionnalités en quelques secondes. Tu peux fermer à tout moment — tout reste accessible plus tard dans "Comment utiliser RecuVente".`,
    },
    {
      icone: "📋",
      titre: "Aujourd'hui",
      texte: `Le premier écran que tu vois chaque jour. Il te montre uniquement ce qui compte vraiment — les ${motCommande}s à traiter en priorité — avec des boutons d'action directs (📞 appeler, ✅ confirmer, ❌ échoué).`,
    },
    {
      icone: estLocation ? "🏠" : "📦",
      titre: estLocation ? "Loyers" : (estRetail ? "Ventes" : "Commandes"),
      texte: `Le bouton "+ Ajouter" crée un nouveau ${motCommande}. Chaque couleur a un sens : orange = en cours, vert = confirmé, rouge = échoué, gris = annulé. L'app détecte aussi les doublons pour éviter d'envoyer deux livreurs chez le même ${motClient}.`,
    },
    {
      icone: "💵",
      titre: "Mode de paiement et journal d'appels",
      texte: `En confirmant, choisis comment le ${motClient} a payé (Cash, Orange Money, Wave, MTN Money, Moov Money). Et à tout moment, enregistre un appel passé avec un motif précis (confirmé, pas de réponse, refusé...) — tout reste dans l'historique.`,
    },
    {
      icone: "🚚",
      titre: "Ton équipe",
      texte: `Ajoute tes livreurs et closers avec juste leur nom et leur numéro. Pour un livreur qui lit difficilement, active le "Mode simplifié" — de gros boutons colorés, presque sans texte.`,
    },
    {
      icone: "📈",
      titre: "Produits et bénéfice réel",
      texte: `L'écran "Produits" classe tout du plus rentable au moins rentable. Renseigne le coût d'achat ET les frais de transport/douane par pièce — ton bénéfice affiché devient enfin exact, pas juste une estimation.`,
    },
    {
      icone: "🧮",
      titre: "La comptabilité",
      texte: `Vision complète : chiffre d'affaires confirmé, bénéfice réel, montants que chaque livreur doit encore te déposer. Sur mobile, les détails sont repliés par défaut pour aller plus vite.`,
    },
    {
      icone: "🛍️",
      titre: "Ta boutique en ligne",
      texte: `Chaque espace a sa propre boutique publique, personnalisable dans "Ma Boutique" — logo, couleurs, collections, avis clients, marque blanche. Partage le lien sur WhatsApp ou Facebook.`,
    },
    {
      icone: "🔀",
      titre: "Plusieurs espaces",
      texte: `Tu gères une autre activité en plus de celle-ci ? Clique sur le nom de ton espace en haut, puis "+ Ajouter un autre espace" — bascule entre eux en un clic, sans nouveau compte.`,
    },
    {
      icone: "📖",
      titre: "Une question plus tard ?",
      texte: `Le bouton vert "Comment utiliser RecuVente" (en bas du menu, ou en haut sur mobile) contient le guide complet, et un accès direct à WhatsApp pour une explication en direct.`,
    },
  ];

  const e = etapes[etape];
  const dernierEtape = etape === etapes.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 80 }}>
      <div style={{ background: "white", borderRadius: 18, padding: 28, width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 14 }}>{e.icone}</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10, color: "#16231F" }}>{e.titre}</div>
        <div style={{ fontSize: 13.5, color: "#6B7168", lineHeight: 1.6, marginBottom: 22 }}>{e.texte}</div>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 22 }}>
          {etapes.map((_, i) => (
            <span key={i} style={{ width: i === etape ? 20 : 7, height: 7, borderRadius: 999, background: i === etape ? "#1a7a3c" : "#DDD8CC", transition: "all 0.2s" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onFermer}
            style={{ flex: 1, background: "white", border: "1px solid #DDD8CC", color: "#8A9089", borderRadius: 10, padding: "12px 0", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}
          >
            Passer
          </button>
          <button
            onClick={() => (dernierEtape ? onOuvrirAide() : setEtape(etape + 1))}
            style={{ flex: 2, background: "#1a7a3c", border: "none", color: "white", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            {dernierEtape ? "Ouvrir le guide complet" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AideModal({ onClose }) {
  const lienWhatsapp = "https://wa.me/message/XHYI5VOMCUFGM1";
  const lienGuidePdf = "https://jlrvtwnbtvpurhjdtzly.supabase.co/storage/v1/object/public/boutique/guide-recuvente.pdf";
  const lienQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lienWhatsapp)}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>📖 Comment utiliser RecuVente</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20, lineHeight: 1.5 }}>
          Toutes les fonctionnalités expliquées en détail, avec des schémas — commandes, équipe, boutique, comptabilité, et plus. Une question, un blocage ? Contacte directement le support.
        </div>

        <a
          href={lienGuidePdf}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 12, padding: "16px 0", fontWeight: 700, fontSize: 14.5, textDecoration: "none", boxSizing: "border-box", marginBottom: 16 }}
        >
          📄 Ouvrir le guide complet (PDF)
        </a>

        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 14, padding: 20, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#3B6D11", marginBottom: 14 }}>
            📲 Besoin d'une explication en direct ou d'une vidéo ?
          </div>
          <img
            src={lienQrCode}
            alt="QR Code WhatsApp"
            style={{ width: 160, height: 160, borderRadius: 10, border: "1px solid #C7DDA3", marginBottom: 14 }}
          />
          <div style={{ fontSize: 11.5, color: "#3B6D11", marginBottom: 14 }}>
            Scanne ce code, ou clique sur le bouton ci-dessous
          </div>
          <a
            href={lienWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", background: "#1a7a3c", color: "white", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          >
            💬 Ouvrir WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

function IntegrationsModal({ workspace, onClose }) {
  const [copie, setCopie] = useState(false);
  const [journalAudit, setJournalAudit] = useState(null);
  const [afficherJournalAudit, setAfficherJournalAudit] = useState(false);

  const [erreurJournalAudit, setErreurJournalAudit] = useState(null);
  useEffect(() => {
    if (!afficherJournalAudit || journalAudit) return;
    supabase.from("journal_audit").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(200).then(({ data, error }) => {
      if (error) setErreurJournalAudit(error.message);
      setJournalAudit(data || []);
    });
  }, [afficherJournalAudit]);

  function echapperCSVAudit(valeur) {
    const texte = String(valeur ?? "");
    return /[",\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  }

  function exporterJournalAuditCSV() {
    if (!journalAudit || journalAudit.length === 0) { alert("Aucune action à exporter."); return; }
    const entetes = ["Date", "Action", "Détails", "Effectué par"];
    const lignes = journalAudit.map((e) => [
      new Date(e.created_at).toLocaleString("fr-FR"),
      e.action,
      e.details || "",
      e.effectue_par,
    ].map(echapperCSVAudit).join(","));
    const csv = "\uFEFF" + [entetes.join(","), ...lignes].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-audit-${workspace.name.replace(/[^a-z0-9]+/gi, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const [personnalisation, setPersonnalisation] = useState({
    logo_url: workspace.logo_url || "",
    banniere_url: workspace.banniere_url || "",
    couleur_marque: workspace.couleur_marque || "#1a7a3c",
    description_boutique: workspace.description_boutique || "",
    politique_livraison: workspace.politique_livraison || "",
    politique_retours: workspace.politique_retours || "",
    politique_confidentialite: workspace.politique_confidentialite || "",
    facebook_url: workspace.facebook_url || "",
    instagram_url: workspace.instagram_url || "",
    tiktok_url: workspace.tiktok_url || "",
    frais_livraison: workspace.frais_livraison ?? 0,
    frais_expedition: workspace.frais_expedition ?? 0,
    label_livraison_locale: workspace.label_livraison_locale || "Livraison locale",
    label_livraison_expedition: workspace.label_livraison_expedition || "Autre ville",
    depot_requis: workspace.depot_requis || false,
    depot_montant: workspace.depot_montant ?? "",
    depot_message: workspace.depot_message || "",
  });
  const [envoiEnCoursType, setEnvoiEnCoursType] = useState(null);
  const [pixelId, setPixelId] = useState(workspace.facebook_pixel_id || "");
  const [tiktokPixelId, setTiktokPixelId] = useState(workspace.tiktok_pixel_id || "");
  const [savingTiktokPixel, setSavingTiktokPixel] = useState(false);
  const [tiktokPixelSaved, setTiktokPixelSaved] = useState(false);
  const [savingPolitiqueLivraison, setSavingPolitiqueLivraison] = useState(false);
  const [savedPolitiqueLivraison, setSavedPolitiqueLivraison] = useState(false);
  const [savingPolitiqueRetours, setSavingPolitiqueRetours] = useState(false);
  const [savedPolitiqueRetours, setSavedPolitiqueRetours] = useState(false);
  const [savingPolitiqueConfidentialite, setSavingPolitiqueConfidentialite] = useState(false);
  const [savedPolitiqueConfidentialite, setSavedPolitiqueConfidentialite] = useState(false);
  const [savingPixel, setSavingPixel] = useState(false);
  const [pixelSaved, setPixelSaved] = useState(false);
  const [capiToken, setCapiToken] = useState(workspace.facebook_capi_token || "");
  const [savingCapiToken, setSavingCapiToken] = useState(false);
  const [capiTokenSaved, setCapiTokenSaved] = useState(false);
  const [domaineMeta, setDomaineMeta] = useState(workspace.facebook_domain_verification || "");
  const [domainePerso, setDomainePerso] = useState(workspace.domaine_personnalise || "");
  const [savingDomainePerso, setSavingDomainePerso] = useState(false);
  const [domainePersoSaved, setDomainePersoSaved] = useState(false);
  const [erreurDomainePerso, setErreurDomainePerso] = useState("");
  const [instructionsDomaine, setInstructionsDomaine] = useState(null);

  async function sauvegarderDomainePerso() {
    setSavingDomainePerso(true);
    setErreurDomainePerso("");
    setInstructionsDomaine(null);
    const valeur = domainePerso.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") || null;

    if (!valeur) {
      await supabase.from("workspaces").update({ domaine_personnalise: null }).eq("id", workspace.id);
      setSavingDomainePerso(false);
      setDomainePersoSaved(true);
      setTimeout(() => setDomainePersoSaved(false), 2000);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ workspaceId: workspace.id, domaine: valeur, action: "add" }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        setErreurDomainePerso(result.error || "Erreur lors de la connexion à Vercel.");
        setSavingDomainePerso(false);
        return;
      }
      const { error } = await supabase.from("workspaces").update({ domaine_personnalise: valeur }).eq("id", workspace.id);
      if (error) {
        setErreurDomainePerso(error.message.includes("duplicate") || error.message.includes("unique") ? "Ce domaine est déjà utilisé par une autre boutique." : "Erreur : " + error.message);
        setSavingDomainePerso(false);
        return;
      }
      setInstructionsDomaine(result.instructions);
      setDomainePersoSaved(true);
      setTimeout(() => setDomainePersoSaved(false), 2000);
    } catch (e) {
      setErreurDomainePerso("Erreur de connexion : " + e.message);
    }
    setSavingDomainePerso(false);
  }
  const [savingDomaineMeta, setSavingDomaineMeta] = useState(false);
  const [domaineMetaSaved, setDomaineMetaSaved] = useState(false);
  const [devise, setDevise] = useState(workspace.currency || "XOF");
  const [savingDevise, setSavingDevise] = useState(false);
  const [deviseSaved, setDeviseSaved] = useState(false);
  const [paysListe, setPaysListe] = useState(workspace.countries_livraison || (workspace.country ? [workspace.country] : []));
  const [savingPays, setSavingPays] = useState(false);
  const [paysSaved, setPaysSaved] = useState(false);
  const [langueBoutique, setLangueBoutique] = useState(workspace.langue || "fr");
  const [savingLangue, setSavingLangue] = useState(false);
  const [langueSaved, setLangueSaved] = useState(false);

  async function tracerAuditLocal(action, details) {
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("journal_audit").insert([{
      workspace_id: workspace.id,
      action,
      details,
      effectue_par: sessionData.session?.user?.email || "Inconnu",
    }]);
  }

  async function sauvegarderLangue() {
    setSavingLangue(true);
    await supabase.from("workspaces").update({ langue: langueBoutique }).eq("id", workspace.id);
    if (langueBoutique !== (workspace.langue || "fr")) tracerAuditLocal("Langue boutique modifiée", `${workspace.langue || "fr"} → ${langueBoutique}`);
    setSavingLangue(false);
    setLangueSaved(true);
    setTimeout(() => setLangueSaved(false), 2000);
  }

  async function sauvegarderDevise() {
    setSavingDevise(true);
    await supabase.from("workspaces").update({ currency: devise }).eq("id", workspace.id);
    if (devise !== workspace.currency) tracerAuditLocal("Devise modifiée", `${workspace.currency} → ${devise}`);
    setSavingDevise(false);
    setDeviseSaved(true);
    setTimeout(() => setDeviseSaved(false), 2000);
  }

  function togglePays(code) {
    setPaysListe((liste) => (liste.includes(code) ? liste.filter((c) => c !== code) : [...liste, code]));
  }

  async function sauvegarderPays() {
    setSavingPays(true);
    await supabase.from("workspaces").update({ countries_livraison: paysListe, country: paysListe[0] || workspace.country }).eq("id", workspace.id);
    tracerAuditLocal("Pays de livraison modifiés", paysListe.join(", ") || "aucun");
    setSavingPays(false);
    setPaysSaved(true);
    setTimeout(() => setPaysSaved(false), 2000);
  }

  async function sauvegarderDomaineMeta() {
    setSavingDomaineMeta(true);
    await supabase.from("workspaces").update({ facebook_domain_verification: domaineMeta.trim() || null }).eq("id", workspace.id);
    setSavingDomaineMeta(false);
    setDomaineMetaSaved(true);
    setTimeout(() => setDomaineMetaSaved(false), 2000);
  }

  async function sauvegarderPixel() {
    setSavingPixel(true);
    await supabase.from("workspaces").update({ facebook_pixel_id: pixelId.trim() || null }).eq("id", workspace.id);
    setSavingPixel(false);
    setPixelSaved(true);
    setTimeout(() => setPixelSaved(false), 2000);
  }

  async function sauvegarderTiktokPixel() {
    setSavingTiktokPixel(true);
    await supabase.from("workspaces").update({ tiktok_pixel_id: tiktokPixelId.trim() || null }).eq("id", workspace.id);
    setSavingTiktokPixel(false);
    setTiktokPixelSaved(true);
    setTimeout(() => setTiktokPixelSaved(false), 2000);
  }

  async function sauvegarderCapiToken() {
    setSavingCapiToken(true);
    await supabase.from("workspaces").update({ facebook_capi_token: capiToken.trim() || null }).eq("id", workspace.id);
    setSavingCapiToken(false);
    setCapiTokenSaved(true);
    setTimeout(() => setCapiTokenSaved(false), 2000);
  }

  async function envoyerImage(type, fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) {
      alert("L'image est trop lourde (max 5 Mo). Choisis une image plus légère.");
      return;
    }
    setEnvoiEnCoursType(type);
    const fichierCompresse = await compresserImage(fichier);
    const extension = fichierCompresse.name.split(".").pop();
    const chemin = `${workspace.id}-${type}-${Date.now()}.${extension}`;
    const { error: erreurUpload } = await supabase.storage.from("boutique").upload(chemin, fichierCompresse, { upsert: true });
    if (erreurUpload) {
      alert("Erreur lors de l'envoi : " + erreurUpload.message);
      setEnvoiEnCoursType(null);
      return;
    }
    const { data } = supabase.storage.from("boutique").getPublicUrl(chemin);
    const champ = type === "logo" ? "logo_url" : "banniere_url";
    await supabase.from("workspaces").update({ [champ]: data.publicUrl }).eq("id", workspace.id);
    setPersonnalisation((p) => ({ ...p, [champ]: data.publicUrl }));
    setEnvoiEnCoursType(null);
  }

  async function sauvegarderCouleur(couleur) {
    setPersonnalisation((p) => ({ ...p, couleur_marque: couleur }));
    await supabase.from("workspaces").update({ couleur_marque: couleur }).eq("id", workspace.id);
  }

  async function sauvegarderDescription() {
    await supabase.from("workspaces").update({ description_boutique: personnalisation.description_boutique }).eq("id", workspace.id);
  }

  const [copieCommande, setCopieCommande] = useState(false);
  const [copieCatalogue, setCopieCatalogue] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState(workspace.whatsapp_number || "");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const webhookUrl = `${window.location.origin}/api/shopify-webhook?secret=${workspace.webhook_secret}`;
  const lienCommande = `${window.location.origin}/?commander=${workspace.id}`;
  const lienCatalogue = workspace.slug ? `${window.location.origin}/?boutique=${workspace.slug}` : `${window.location.origin}/?catalogue=${workspace.id}`;

  function copier() {
    navigator.clipboard.writeText(webhookUrl);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  function copierLienCommande() {
    navigator.clipboard.writeText(lienCommande);
    setCopieCommande(true);
    setTimeout(() => setCopieCommande(false), 2000);
  }

  function copierLienCatalogue() {
    navigator.clipboard.writeText(lienCatalogue);
    setCopieCatalogue(true);
    setTimeout(() => setCopieCatalogue(false), 2000);
  }

  async function sauvegarderWhatsapp() {
    setSavingWhatsapp(true);
    await supabase.from("workspaces").update({ whatsapp_number: whatsappNumber.trim() }).eq("id", workspace.id);
    setSavingWhatsapp(false);
    setWhatsappSaved(true);
    setTimeout(() => setWhatsappSaved(false), 2000);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🛍️ Ma Boutique</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            🔐 Journal d'audit
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14, lineHeight: 1.5 }}>
            Qui a fait quoi, et quand — les 200 dernières actions importantes.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setAfficherJournalAudit(!afficherJournalAudit)}
              style={{ background: "#8A6412", border: "none", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "white" }}
            >
              {afficherJournalAudit ? "Masquer ▲" : "Voir le journal ▼"}
            </button>
            {afficherJournalAudit && journalAudit && journalAudit.length > 0 && (
              <button
                onClick={exporterJournalAuditCSV}
                style={{ background: "white", border: "1px solid #F0DDA8", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#8A6412" }}
              >
                ⬇️ Export CSV
              </button>
            )}
          </div>

          {afficherJournalAudit && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
              {erreurJournalAudit && <div style={{ fontSize: 12, color: "#D64933", background: "#FBEAE6", borderRadius: 8, padding: "8px 12px" }}>Erreur : {erreurJournalAudit}</div>}
              {journalAudit === null && <SkeletonListe nombre={4} />}
              {journalAudit && journalAudit.length === 0 && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Aucune action enregistrée pour l'instant.</div>}
              {journalAudit && journalAudit.map((entree) => (
                <div key={entree.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#16231F" }}>{entree.action}</span>
                    <span style={{ fontSize: 10.5, color: "#8A9089", flexShrink: 0 }}>{new Date(entree.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {entree.details && <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 2 }}>{entree.details}</div>}
                  <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 2 }}>par {entree.effectue_par}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <a
          href={lienCatalogue}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "linear-gradient(135deg, #1a7a3c, #1F9D6E)", color: "white", border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 700, fontSize: 14.5, textDecoration: "none", marginBottom: 20, boxSizing: "border-box" }}
        >
          👁️ Voir ma boutique en ligne
        </a>

        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#3B6D11", marginBottom: 4 }}>
            📲 Tu vends via WhatsApp, sans boutique en ligne ?
          </div>
          <div style={{ fontSize: 12.5, color: "#3B6D11", marginBottom: 12, lineHeight: 1.5 }}>
            Partage ce lien à tes clients sur WhatsApp — ils remplissent eux-mêmes leur commande, tu n'as plus rien à taper.
          </div>
          <div style={{ background: "white", border: "1px solid #C7DDA3", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
            {lienCommande}
          </div>
          <button
            onClick={copierLienCommande}
            style={{ width: "100%", background: copieCommande ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {copieCommande ? "✅ Copié !" : "📋 Copier mon lien de commande"}
          </button>
        </div>

        <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#3B6D11", marginBottom: 4 }}>
            🛍️ Ta mini-boutique en ligne
          </div>
          <div style={{ fontSize: 12.5, color: "#3B6D11", marginBottom: 12, lineHeight: 1.5 }}>
            Une page avec tes produits, prix et photos — mets-la en bio Facebook/WhatsApp. Un clic sur un produit ouvre WhatsApp avec un message déjà rempli.
          </div>

          <div style={{ fontSize: 11.5, color: "#3B6D11", marginBottom: 4 }}>Ton numéro WhatsApp (pour recevoir les commandes)</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="Ex: 07 00 00 00 00"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C7DDA3", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderWhatsapp}
              disabled={savingWhatsapp}
              style={{ background: whatsappSaved ? "#1F9D6E" : "#3B6D11", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {whatsappSaved ? "✅" : savingWhatsapp ? "..." : "Enregistrer"}
            </button>
          </div>

          <div style={{ background: "white", border: "1px solid #C7DDA3", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
            {lienCatalogue}
          </div>
          <button
            onClick={copierLienCatalogue}
            disabled={!workspace.whatsapp_number && !whatsappSaved}
            style={{ width: "100%", background: copieCatalogue ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (!workspace.whatsapp_number && !whatsappSaved) ? 0.5 : 1 }}
          >
            {copieCatalogue ? "✅ Copié !" : "📋 Copier le lien de ma boutique"}
          </button>
          {(!workspace.whatsapp_number && !whatsappSaved) && (
            <div style={{ fontSize: 11, color: "#3B6D11", marginTop: 6 }}>Enregistre ton numéro WhatsApp d'abord ⬆️</div>
          )}
        </div>

        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#8A6412", marginBottom: 4 }}>
            🎨 Personnalise ta boutique
          </div>
          <div style={{ fontSize: 12.5, color: "#8A6412", marginBottom: 14, lineHeight: 1.5 }}>
            Logo, bannière et couleur — pour que ta boutique publique te ressemble vraiment.
          </div>

          <div style={{ fontSize: 11.5, color: "#8A6412", marginBottom: 4 }}>Logo</div>
          {personnalisation.logo_url && (
            <img src={personnalisation.logo_url} alt="Logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", marginBottom: 8, border: "1px solid #F0DDA8" }} />
          )}
          <label style={{ display: "inline-block", background: "white", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#8A6412", cursor: "pointer", marginBottom: 14 }}>
            {envoiEnCoursType === "logo" ? "Envoi..." : personnalisation.logo_url ? "Changer le logo" : "Ajouter un logo"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => envoyerImage("logo", e.target.files?.[0])} />
          </label>

          <div style={{ fontSize: 11.5, color: "#8A6412", marginBottom: 4 }}>Bannière (image large en haut de la boutique)</div>
          {personnalisation.banniere_url && (
            <img src={personnalisation.banniere_url} alt="Bannière" style={{ width: "100%", height: 70, borderRadius: 10, objectFit: "cover", marginBottom: 8, border: "1px solid #F0DDA8" }} />
          )}
          <label style={{ display: "inline-block", background: "white", border: "1px solid #F0DDA8", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#8A6412", cursor: "pointer", marginBottom: 14 }}>
            {envoiEnCoursType === "banniere" ? "Envoi..." : personnalisation.banniere_url ? "Changer la bannière" : "Ajouter une bannière"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => envoyerImage("banniere", e.target.files?.[0])} />
          </label>

          <div style={{ fontSize: 11.5, color: "#8A6412", marginBottom: 4 }}>Couleur de ta marque</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {["#1a7a3c", "#e8920a", "#D64933", "#2452E8", "#8A2BE2", "#16231F"].map((coul) => (
              <button
                key={coul}
                onClick={() => sauvegarderCouleur(coul)}
                style={{ width: 30, height: 30, borderRadius: "50%", background: coul, border: personnalisation.couleur_marque === coul ? "3px solid #16231F" : "1px solid #DDD8CC", cursor: "pointer" }}
              />
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: "#8A6412", marginBottom: 4 }}>Description courte (optionnel)</div>
          <textarea
            value={personnalisation.description_boutique || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, description_boutique: e.target.value })}
            onBlur={sauvegarderDescription}
            placeholder="Ex: Vêtements et accessoires de qualité, livraison rapide à Abidjan"
            rows={2}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #F0DDA8", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            📄 Politiques de ta boutique
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14, lineHeight: 1.5 }}>
            Elles apparaîtront dans le pied de page de ta boutique publique, pour rassurer tes clients.
          </div>

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>Politique de livraison</div>
          <textarea
            value={personnalisation.politique_livraison || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, politique_livraison: e.target.value })}
            placeholder="Ex: Livraison en 24-48h à Abidjan, paiement à la réception."
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 6 }}
          />
          <button
            onClick={async () => {
              setSavingPolitiqueLivraison(true);
              await supabase.from("workspaces").update({ politique_livraison: personnalisation.politique_livraison }).eq("id", workspace.id);
              setSavingPolitiqueLivraison(false);
              setSavedPolitiqueLivraison(true);
              setTimeout(() => setSavedPolitiqueLivraison(false), 2000);
            }}
            disabled={savingPolitiqueLivraison}
            style={{ background: savedPolitiqueLivraison ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}
          >
            {savedPolitiqueLivraison ? "✅ Enregistré" : savingPolitiqueLivraison ? "..." : "Enregistrer"}
          </button>

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>Politique de retours</div>
          <textarea
            value={personnalisation.politique_retours || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, politique_retours: e.target.value })}
            placeholder="Ex: Retour possible sous 48h si le produit est défectueux."
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 6 }}
          />
          <button
            onClick={async () => {
              setSavingPolitiqueRetours(true);
              await supabase.from("workspaces").update({ politique_retours: personnalisation.politique_retours }).eq("id", workspace.id);
              setSavingPolitiqueRetours(false);
              setSavedPolitiqueRetours(true);
              setTimeout(() => setSavedPolitiqueRetours(false), 2000);
            }}
            disabled={savingPolitiqueRetours}
            style={{ background: savedPolitiqueRetours ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}
          >
            {savedPolitiqueRetours ? "✅ Enregistré" : savingPolitiqueRetours ? "..." : "Enregistrer"}
          </button>

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>Politique de confidentialité</div>
          <textarea
            value={personnalisation.politique_confidentialite || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, politique_confidentialite: e.target.value })}
            placeholder="Ex: Tes informations ne sont utilisées que pour te livrer, jamais partagées."
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 6 }}
          />
          <button
            onClick={async () => {
              setSavingPolitiqueConfidentialite(true);
              await supabase.from("workspaces").update({ politique_confidentialite: personnalisation.politique_confidentialite }).eq("id", workspace.id);
              setSavingPolitiqueConfidentialite(false);
              setSavedPolitiqueConfidentialite(true);
              setTimeout(() => setSavedPolitiqueConfidentialite(false), 2000);
            }}
            disabled={savingPolitiqueConfidentialite}
            style={{ background: savedPolitiqueConfidentialite ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {savedPolitiqueConfidentialite ? "✅ Enregistré" : savingPolitiqueConfidentialite ? "..." : "Enregistrer"}
          </button>
        </div>

        <div style={{ background: "#EAF0FB", border: "1px solid #C3D4F0", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, color: "#1E4B8C", marginBottom: 4 }}>
            📊 Pixel Facebook — suis tes publicités
          </div>
          <div style={{ fontSize: 12.5, color: "#1E4B8C", marginBottom: 12, lineHeight: 1.5 }}>
            Colle ton identifiant de Pixel Facebook pour voir combien de ventes viennent réellement de tes publicités.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="Ex: 1761789765001953"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderPixel}
              disabled={savingPixel}
              style={{ background: pixelSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {pixelSaved ? "✅" : savingPixel ? "..." : "Enregistrer"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#1E4B8C", marginTop: 8, opacity: 0.8 }}>
            Trouve-le sur business.facebook.com → Gestionnaire d'événements. Suit automatiquement : visite, vue produit, ajout panier, et achat.
          </div>

          <div style={{ height: 1, background: "#C3D4F0", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            🔒 Token Conversions API (recommandé, pour du COD)
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            Permet d'envoyer le vrai signal "Achat" à Facebook uniquement quand une livraison est réellement confirmée — bien plus fiable que de suivre chaque simple commande.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={capiToken}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder="Colle ton token ici"
              type="password"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderCapiToken}
              disabled={savingCapiToken}
              style={{ background: capiTokenSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {capiTokenSaved ? "✅" : savingCapiToken ? "..." : "Enregistrer"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#1E4B8C", marginTop: 8, opacity: 0.8 }}>
            Trouve-le sur business.facebook.com → Gestionnaire d'événements → ton pixel → onglet "API Conversions" → "Générer un token d'accès".
          </div>

          <div style={{ height: 1, background: "#C3D4F0", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            🎵 Pixel TikTok — suis tes publicités TikTok
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            Colle ton identifiant de Pixel TikTok pour suivre les ventes venant de tes publicités TikTok Ads.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={tiktokPixelId}
              onChange={(e) => setTiktokPixelId(e.target.value)}
              placeholder="Ex: C4A1B2C3D4E5F6G7H8I9"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderTiktokPixel}
              disabled={savingTiktokPixel}
              style={{ background: tiktokPixelSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {tiktokPixelSaved ? "✅" : savingTiktokPixel ? "..." : "Enregistrer"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#1E4B8C", marginTop: 8, opacity: 0.8 }}>
            Trouve-le sur ads.tiktok.com → Actifs → Événements → Gérer. Suit automatiquement : visite, vue produit, et lancement de commande.
          </div>

          <div style={{ height: 1, background: "#C3D4F0", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            🌐 Vérification de domaine Meta
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            Si Meta te demande de vérifier ton domaine (Gestionnaire de marque → Domaines), colle ici le code fourni — il sera automatiquement ajouté sur ta boutique.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={domaineMeta}
              onChange={(e) => setDomaineMeta(e.target.value)}
              placeholder="Ex: a1b2c3d4e5f6..."
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderDomaineMeta}
              disabled={savingDomaineMeta}
              style={{ background: domaineMetaSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {domaineMetaSaved ? "✅" : savingDomaineMeta ? "..." : "Enregistrer"}
            </button>
          </div>

          <div style={{ height: 1, background: "#C3D4F0", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            💱 Devise de la boutique
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            S'applique à tous les prix affichés (nouveaux montants uniquement — les commandes déjà enregistrées gardent leur devise d'origine).
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={devise} onChange={(e) => setDevise(e.target.value)} style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13, background: "white" }}>
              {[["XOF", "Franc CFA (XOF) — Afrique de l'Ouest"], ["XAF", "Franc CFA (XAF) — Afrique Centrale"], ["GNF", "Franc guinéen (GNF)"], ["MAD", "Dirham marocain (MAD)"], ["DZD", "Dinar algérien (DZD)"], ["TND", "Dinar tunisien (TND)"], ["EUR", "Euro (EUR)"], ["USD", "Dollar américain (USD)"], ["GHS", "Cedi ghanéen (GHS)"], ["NGN", "Naira nigérian (NGN)"], ["CDF", "Franc congolais (CDF)"]].map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <button
              onClick={sauvegarderDevise}
              disabled={savingDevise}
              style={{ background: deviseSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {deviseSaved ? "✅" : savingDevise ? "..." : "Enregistrer"}
            </button>
          </div>

          <div style={{ height: 1, background: "#C3D4F0", margin: "14px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            🌍 Pays où tu livres
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            Coche un ou plusieurs pays. Le premier coché devient le pays principal de ta boutique.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 6, marginBottom: 10 }}>
            {[["CI", "🇨🇮 Côte d'Ivoire"], ["SN", "🇸🇳 Sénégal"], ["ML", "🇲🇱 Mali"], ["BF", "🇧🇫 Burkina Faso"], ["TG", "🇹🇬 Togo"], ["BJ", "🇧🇯 Bénin"], ["GN", "🇬🇳 Guinée"], ["CM", "🇨🇲 Cameroun"], ["GA", "🇬🇦 Gabon"], ["CD", "🇨🇩 RD Congo"], ["MA", "🇲🇦 Maroc"], ["DZ", "🇩🇿 Algérie"], ["TN", "🇹🇳 Tunisie"], ["GH", "🇬🇭 Ghana"], ["NG", "🇳🇬 Nigeria"], ["FR", "🇫🇷 France"]].map(([code, label]) => {
              const coche = paysListe.includes(code);
              return (
                <label key={code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 8px", borderRadius: 7, background: coche ? "#DCEBFF" : "white", border: "1px solid " + (coche ? "#1E4B8C" : "#C3D4F0"), cursor: "pointer" }}>
                  <input type="checkbox" checked={coche} onChange={() => togglePays(code)} /> {label}
                </label>
              );
            })}
          </div>
          <button
            onClick={sauvegarderPays}
            disabled={savingPays}
            style={{ background: paysSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            {paysSaved ? "✅ Enregistré" : savingPays ? "..." : "Enregistrer les pays"}
          </button>

          <div style={{ height: 1, background: "#C3D4F0", margin: "16px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 13, color: "#1E4B8C", marginBottom: 4 }}>
            🌐 Langue de la boutique publique
          </div>
          <div style={{ fontSize: 12, color: "#1E4B8C", marginBottom: 10, lineHeight: 1.5 }}>
            La boutique que voient tes clients (pas ce tableau de bord) s'affichera dans cette langue.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={langueBoutique} onChange={(e) => setLangueBoutique(e.target.value)} style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #C3D4F0", fontSize: 13, background: "white" }}>
              <option value="fr">🇫🇷 Français</option>
              <option value="en">🇬🇧 English</option>
            </select>
            <button
              onClick={sauvegarderLangue}
              disabled={savingLangue}
              style={{ background: langueSaved ? "#1F9D6E" : "#1E4B8C", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {langueSaved ? "✅" : savingLangue ? "..." : "Enregistrer"}
            </button>
          </div>
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            🚚 Frais de livraison
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14, lineHeight: 1.5 }}>
            Deux frais distincts, affichés sur chaque page produit et ajoutés automatiquement selon le choix du client. Laisse à 0 si gratuit.
          </div>

          <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>🏍️ Nom de cette zone (ex: Livraison locale, Abidjan...)</div>
          <input
            value={personnalisation.label_livraison_locale}
            onChange={(e) => setPersonnalisation({ ...personnalisation, label_livraison_locale: e.target.value })}
            placeholder="Livraison locale"
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Frais pour cette zone</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input
              type="number"
              value={personnalisation.frais_livraison ?? ""}
              onChange={(e) => setPersonnalisation({ ...personnalisation, frais_livraison: e.target.value })}
              placeholder="0"
              style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }}
            />
            <span style={{ fontSize: 12.5, color: "#8A9089" }}>{workspace.currency}</span>
          </div>

          <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>🚛 Nom de cette zone (ex: Autre ville, Expédition, Hors Abidjan...)</div>
          <input
            value={personnalisation.label_livraison_expedition}
            onChange={(e) => setPersonnalisation({ ...personnalisation, label_livraison_expedition: e.target.value })}
            placeholder="Autre ville"
            style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Frais pour cette zone</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <input
              type="number"
              value={personnalisation.frais_expedition ?? ""}
              onChange={(e) => setPersonnalisation({ ...personnalisation, frais_expedition: e.target.value })}
              placeholder="0"
              style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }}
            />
            <span style={{ fontSize: 12.5, color: "#8A9089" }}>{workspace.currency}</span>
          </div>

          <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 14, marginTop: 4, marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={personnalisation.depot_requis}
                onChange={(e) => setPersonnalisation({ ...personnalisation, depot_requis: e.target.checked })}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <span style={{ fontWeight: 700, fontSize: 13 }}>💰 Exiger un dépôt avant expédition (livraison "{personnalisation.label_livraison_expedition || "Autre ville"}" uniquement)</span>
            </label>
            {personnalisation.depot_requis && (
              <>
                <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 11.5, color: "#3B6D11", lineHeight: 1.5 }}>
                  💡 Le montant du dépôt se calcule maintenant automatiquement pour chaque commande (prix du produit + frais d'expédition) — plus besoin de le fixer toi-même, ça s'adapte à chaque produit.
                </div>
                <div style={{ fontSize: 11, color: "#6B7168", marginBottom: 4 }}>Message affiché au client (personnalisable — utilise {"{montant}"} pour insérer la somme exacte calculée)</div>
                <textarea
                  value={personnalisation.depot_message}
                  onChange={(e) => setPersonnalisation({ ...personnalisation, depot_message: e.target.value })}
                  placeholder={`Livraison hors zone : un dépôt de {montant} par Mobile Money est exigé avant l'expédition. Notre équipe te contactera pour l'organiser.`}
                  rows={3}
                  style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 12.5, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                />
                <div style={{ fontSize: 10.5, color: "#8A9089", marginTop: 6, lineHeight: 1.5 }}>
                  Ce dépôt n'est pas encaissé automatiquement dans l'app — c'est une information affichée au client avant qu'il commande, à toi de l'organiser par Mobile Money une fois la commande confirmée.
                </div>
              </>
            )}
          </div>

          <button
            onClick={async () => {
              await supabase.from("workspaces").update({
                frais_livraison: Number(personnalisation.frais_livraison) || 0,
                frais_expedition: Number(personnalisation.frais_expedition) || 0,
                label_livraison_locale: personnalisation.label_livraison_locale.trim() || "Livraison locale",
                label_livraison_expedition: personnalisation.label_livraison_expedition.trim() || "Autre ville",
                depot_requis: personnalisation.depot_requis,
                depot_montant: personnalisation.depot_montant === "" ? null : Number(personnalisation.depot_montant),
                depot_message: personnalisation.depot_message.trim() || null,
              }).eq("id", workspace.id);
            }}
            style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
          >
            Enregistrer
          </button>
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            🏷️ Marque blanche
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14, lineHeight: 1.5 }}>
            Retire la mention "Propulsé par RecuVente" du pied de page de ta boutique publique.
          </div>
          <button
            onClick={async () => {
              const nouvelleValeur = !workspace.marque_blanche;
              await supabase.from("workspaces").update({ marque_blanche: nouvelleValeur }).eq("id", workspace.id);
              setPersonnalisation({ ...personnalisation, marque_blanche: nouvelleValeur });
              window.location.reload();
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #DDD8CC", borderRadius: 9, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#16231F" }}
          >
            <span style={{ width: 34, height: 19, borderRadius: 999, background: workspace.marque_blanche ? "#1a7a3c" : "#DDD8CC", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 2, left: workspace.marque_blanche ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "white", transition: "left 0.15s" }} />
            </span>
            {workspace.marque_blanche ? "Activée — mention masquée" : "Désactivée — mention affichée"}
          </button>
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            🌍 Domaine personnalisé
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 12, lineHeight: 1.5 }}>
            Affiche ta boutique directement sur ton propre nom de domaine (ex: boutique.tonentreprise.com), sans le lien "?catalogue=...".
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={domainePerso}
              onChange={(e) => setDomainePerso(e.target.value)}
              placeholder="boutique.tonentreprise.com"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13 }}
            />
            <button
              onClick={sauvegarderDomainePerso}
              disabled={savingDomainePerso}
              style={{ background: domainePersoSaved ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {domainePersoSaved ? "✅" : savingDomainePerso ? "..." : "Enregistrer"}
            </button>
          </div>
          {erreurDomainePerso && <div style={{ color: "#D64933", fontSize: 11.5, marginTop: 6 }}>{erreurDomainePerso}</div>}
          {instructionsDomaine && (
            <div style={{ background: "#FFF8E7", border: "1px solid #F0DDA8", borderRadius: 10, padding: 12, marginTop: 10, fontSize: 11.5, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: "#8A6412", marginBottom: 4 }}>✅ Domaine enregistré côté Vercel — dernière étape pour ton client</div>
              <div>Ton client doit ajouter cet enregistrement chez <b>son</b> registrar (là où il a acheté le domaine) :</div>
              {instructionsDomaine.a && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", background: "white", borderRadius: 6, padding: "4px 8px", marginTop: 4 }}>
                  Type: A — Nom: @ — Valeur: {instructionsDomaine.a.value}
                </div>
              )}
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", background: "white", borderRadius: 6, padding: "4px 8px", marginTop: 4 }}>
                Type: CNAME — Nom: {instructionsDomaine.cname.name} — Valeur: {instructionsDomaine.cname.value}
              </div>
              <div style={{ marginTop: 6, opacity: 0.8 }}>Le certificat SSL se met en place automatiquement une fois ces enregistrements détectés (quelques minutes à quelques heures selon son registrar).</div>
            </div>
          )}
          <div style={{ fontSize: 11, color: "#8A9089", marginTop: 8, lineHeight: 1.5 }}>
            Écris juste le domaine (sans https://). L'ajout côté Vercel se fait automatiquement en cliquant "Enregistrer".
          </div>
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>
            🔗 Réseaux sociaux
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7168", marginBottom: 14, lineHeight: 1.5 }}>
            Affichés dans le pied de page de ta boutique publique.
          </div>

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>Facebook</div>
          <input
            value={personnalisation.facebook_url || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, facebook_url: e.target.value })}
            onBlur={() => supabase.from("workspaces").update({ facebook_url: personnalisation.facebook_url || null }).eq("id", workspace.id)}
            placeholder="https://facebook.com/tapage"
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>Instagram</div>
          <input
            value={personnalisation.instagram_url || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, instagram_url: e.target.value })}
            onBlur={() => supabase.from("workspaces").update({ instagram_url: personnalisation.instagram_url || null }).eq("id", workspace.id)}
            placeholder="https://instagram.com/toncompte"
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          <div style={{ fontSize: 11.5, color: "#6B7168", marginBottom: 4 }}>TikTok</div>
          <input
            value={personnalisation.tiktok_url || ""}
            onChange={(e) => setPersonnalisation({ ...personnalisation, tiktok_url: e.target.value })}
            onBlur={() => supabase.from("workspaces").update({ tiktok_url: personnalisation.tiktok_url || null }).eq("id", workspace.id)}
            placeholder="https://tiktok.com/@toncompte"
            style={{ ...inputStyle, marginBottom: 0 }}
          />
        </div>

        <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16, lineHeight: 1.5 }}>
          Connecte ta boutique Shopify pour que chaque nouvelle commande arrive **automatiquement** ici, sans rien taper à la main.
        </div>

        <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#8A9089", textTransform: "uppercase", marginBottom: 8 }}>Ton lien unique — ne le partage à personne</div>
          <div style={{ background: "white", border: "1px solid #DDD8CC", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, fontFamily: "monospace", wordBreak: "break-all", marginBottom: 10 }}>
            {webhookUrl}
          </div>
          <button
            onClick={copier}
            style={{ width: "100%", background: copie ? "#1F9D6E" : "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {copie ? "✅ Copié !" : "📋 Copier le lien"}
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Comment l'installer sur Shopify</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { n: 1, texte: "Sur ta boutique Shopify, va dans Paramètres → Notifications" },
            { n: 2, texte: "Descends jusqu'à \"Webhooks\", clique \"Créer un webhook\"" },
            { n: 3, texte: "Événement : \"Création de commande\" (Order creation)" },
            { n: 4, texte: "Format : JSON" },
            { n: 5, texte: "URL : colle le lien copié ci-dessus" },
            { n: 6, texte: "Enregistre — chaque nouvelle commande Shopify apparaîtra automatiquement dans RecuVente" },
          ].map((etape) => (
            <div key={etape.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#EAF3DE", color: "#1a7a3c", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {etape.n}
              </div>
              <div style={{ fontSize: 12.5, color: "#16231F", lineHeight: 1.4 }}>{etape.texte}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 10, padding: "10px 12px", marginTop: 16, fontSize: 12, color: "#8A6412" }}>
          ⚠️ Ce lien est unique à ton entreprise — les commandes créées via ce lien arrivent uniquement dans ton espace, jamais chez une autre entreprise.
        </div>
      </div>
    </div>
  );
}
