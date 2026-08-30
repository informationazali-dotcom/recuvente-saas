import React, { useState, useEffect, useMemo, useRef } from "react";
import { Package, ListChecks, CheckCheck, Users, Truck, Headset, Calculator, Boxes, Target, Compass } from "lucide-react";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";

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
  const [workspace, setWorkspace] = useState(undefined);
  const [workspacesDisponibles, setWorkspacesDisponibles] = useState([]);
  const [workspaceActifId, setWorkspaceActifId] = useState(() => {
    try { return localStorage.getItem("rv_workspace_actif") || null; } catch { return null; }
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [showAjouterEspace, setShowAjouterEspace] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
      .select("workspace_id, role, workspaces(id, name, country, currency, created_at, webhook_secret, activity_type, whatsapp_number, logo_url, banniere_url, couleur_marque, description_boutique, politique_livraison, politique_retours, politique_confidentialite, facebook_pixel_id, facebook_capi_token, facebook_url, instagram_url, tiktok_url, marque_blanche, frais_livraison, frais_expedition)")
      .eq("user_id", userId);
    if (!error && data && data.length > 0) {
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

  if (session === undefined) return <Centered>Chargement…</Centered>;

  const resetPwParam = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("resetpw") === "1";
  if (resetPwParam && session) return <NouveauMotDePasseScreen />;

  const pageParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("page") : null;
  if (pageParam === "cgu" || pageParam === "confidentialite") return <PageLegale page={pageParam} />;
  if (pageParam === "impact") return <PageImpact />;

  if (!session) {
    const wantsAuth = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("auth") === "1";
    const wantsLogin = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("login") === "1";
    if (wantsLogin) return <AuthScreen modeInitial="login" />;
    if (!wantsAuth) return <LandingPage />;
    return <AuthScreen />;
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

function LandingPage() {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState(null);
  const [profil, setProfil] = useState("cod");
  const [active, setActive] = useState("01");
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    supabase.from("subscription_plans").select("*").order("prix").then(({ data }) => setPlans(data || []));
    const pixelId = import.meta.env.VITE_RECUVENTE_PIXEL_ID;
    if (pixelId && !window.fbq) {
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
    }
    supabase.rpc("statistiques_plateforme_publiques").then(({ data }) => {
      if (data && data[0]) setStats(data[0]);
    });
  }, []);

  function trackLead() {
    if (window.fbq) window.fbq("track", "Lead");
  }

  const modules = [
    { id:"01", icon:"🛍️", name:"VENDRE", title:"Ta boutique devient ton point de départ.", text:"Crée rapidement ta boutique en ligne, ajoute tes produits, tes collections et tes avis. Connecte Shopify et ajoute tes pixels pour relier acquisition et ventes.", items:["Boutique publique personnalisable","Produits, collections, galerie et avis","Import de catalogue CSV","Connexion Shopify et commandes automatiques","Pixels et suivi publicitaire","Stock et rentabilité produit"] },
    { id:"02", icon:"🎯", name:"CONVERTIR", title:"Chaque commande raconte une histoire.", text:"Ton équipe sait qui appeler, quoi faire et pourquoi. Les commandes en double, les numéros invalides et les appels sans réponse ne restent plus invisibles.", items:["Interface dédiée aux closers","Historique des appels et statuts","Doublons et commandes suspectes","Client confirmé, refusé ou injoignable","WhatsApp directement depuis le client","Centre de récupération des ventes à risque"] },
    { id:"03", icon:"🚚", name:"LIVRER", title:"Le dernier kilomètre, sous contrôle.", text:"Attribue les commandes, suis les tournées, mesure les performances et reprogramme les clients qui souhaitent être livrés plus tard.", items:["Interface dédiée aux livreurs","Suivi GPS des livreurs en tournée","Commande attribuée à chaque livreur","Livrée, échouée, à reprogrammer","Priorités et urgences du jour","Lien/code de suivi pour le client"] },
    { id:"04", icon:"💵", name:"ENCAISSER", title:"Enfin, tu sais où va ton argent.", text:"Relie les ventes, les paiements, les acomptes, les dépôts livreurs, les commissions, les coûts et le bénéfice réel.", items:["Cash et Mobile Money","Orange Money, Wave, MTN, Moov","Rapprochement des paiements","Factures PDF et reçus","Dépôts et commissions des livreurs","Bénéfice réel après coûts et frais"] },
    { id:"05", icon:"🔁", name:"RÉACTIVER", title:"Tes anciens clients sont un actif.", text:"Segmente ta base, retrouve les habitudes d'achat et relance les clients qui connaissent déjà ta marque. La prochaine vente peut être dans ton historique.", items:["Nouveaux et anciens clients","Clients 1 fois, 2 fois ou plus","Historique d'achat","Campagnes et retargeting","Relances WhatsApp","Récupération des clients dormants"] },
    { id:"06", icon:"🧭", name:"PILOTER", title:"Une équipe. Une vision. Une vérité.", text:"Chaque rôle dispose de son interface et la direction conserve une vision globale des opérations, des produits, des équipes et de l'argent.", items:["Closer, livreur, comptable, responsable","Rôles et permissions","Plusieurs activités / espaces","Statistiques globales et détaillées","Traçabilité des opérations","Exports et journal d'audit"] }
  ];

  const activeModule = modules.find((m) => m.id === active) || modules[0];

  const metiers = [
    ["🛒", "E-commerce COD", "Vente, closing, livraison, récupération et retargeting."],
    ["🏪", "Commerce physique", "Stock, ventes, acomptes, paiements et bénéfice."],
    ["🏠", "Immobilier", "Locataires, loyers, paiements et reçus."],
    ["🍽️", "Restaurant", "Tables, menus, préparation, service et livraison."],
    ["🚗", "Location", "Véhicules ou matériel, dates, disponibilité et cautions."]
  ];

  const faqs = [
    ["RecuVente est-il uniquement destiné au e-commerce ?", "Non. Le système prévoit plusieurs univers : e-commerce COD, commerce physique, immobilier, restaurant et location de véhicules ou matériel."],
    ["Puis-je créer ma propre boutique ?", "Oui. Tu peux créer un espace boutique avec produits, collections, galerie et avis clients, puis le partager à tes clients."],
    ["Puis-je connecter Shopify ?", "Oui. RecuVente prévoit l'import de catalogue et la réception automatique des commandes Shopify via webhook."],
    ["Mes livreurs et mes closers ont-ils leur propre espace ?", "Oui. L'application prévoit des interfaces adaptées aux différents rôles de l'équipe : closer, livreur, comptable et responsable."],
    ["Puis-je suivre mes livreurs ?", "Oui. Le système prévoit le suivi des livreurs en tournée et l'analyse de leurs performances et de leurs commandes."],
    ["Puis-je gérer plusieurs activités ?", "Oui. Tu peux créer plusieurs espaces d'activité et passer de l'un à l'autre selon ton organisation."],
    ["Est-ce que RecuVente gère les paiements ?", "Oui. Le code prévoit notamment le cash, plusieurs Mobile Money, les acomptes, les dépôts livreurs, les factures et l'analyse de rentabilité."],
    ["Est-ce que je peux relancer mes anciens clients ?", "Oui. L'historique client permet de travailler sur les nouveaux clients, les anciens clients et les clients ayant acheté plusieurs fois."]
  ];

  return (
    <div className="rvx">
      <style>{`
        .rvx{--g:#1a7a3c;--g2:#2e8b57;--o:#ff7a00;--ink:#07100b;--muted:#718078;--cream:#f7f8f4;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:#fff}.rvx *{box-sizing:border-box}.rvx a{text-decoration:none}.rvx .wrap{width:min(1160px,calc(100% - 32px));margin:auto}.rvx .serif{font-family:Georgia,"Times New Roman",serif;letter-spacing:-.055em}
        .rvx-nav{height:72px;background:#06100b;color:#fff;display:flex;align-items:center;position:sticky;top:0;z-index:30;border-bottom:1px solid rgba(255,255,255,.08)}.rvx-navin{display:flex;justify-content:space-between;align-items:center}.rvx-brand{font:800 23px Georgia,serif;color:#fff}.rvx-brand em{color:var(--o);font-style:normal}.rvx-navlinks{display:flex;gap:22px;align-items:center}.rvx-navlinks a{color:#9ba89f;font-size:11px;font-weight:700}.rvx-navlinks .cta{background:#fff;color:#07100b;padding:11px 15px;border-radius:9px}
        .rvx-hero{background:radial-gradient(circle at 12% 0,rgba(46,139,87,.5),transparent 28%),radial-gradient(circle at 95% 5%,rgba(255,122,0,.18),transparent 23%),linear-gradient(135deg,#030705,#08130d 48%,#10251a);color:#fff;padding:82px 0 105px;overflow:hidden}.rvx-hero-grid{display:grid;grid-template-columns:1.04fr .96fr;gap:55px;align-items:center}.rvx-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,122,0,.35);background:rgba(255,122,0,.08);border-radius:999px;padding:8px 12px;font-size:9px;font-weight:800;letter-spacing:.1em;color:#ffd3aa}.rvx-dot{width:7px;height:7px;border-radius:50%;background:var(--o);box-shadow:0 0 0 5px rgba(255,122,0,.12)}.rvx-h1{font:900 clamp(48px,6.5vw,78px) Georgia,serif;line-height:.9;margin:22px 0;letter-spacing:-.065em}.rvx-h1 span{color:#84d89f}.rvx-lead{font-size:16px;line-height:1.72;color:#a9b4ad;max-width:650px}.rvx-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}.rvx-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:11px;padding:15px 20px;font-size:12px;font-weight:800}.rvx-primary{background:var(--o);color:#0c150f;box-shadow:0 18px 50px rgba(255,122,0,.22)}.rvx-secondary{color:#fff;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04)}.rvx-trust{display:flex;gap:17px;flex-wrap:wrap;margin-top:15px;color:#718078;font-size:9px}.rvx-trust b{color:#dfe8e2}
        .rvx-map{min-height:450px;position:relative}.rvx-map:before{content:"";position:absolute;inset:9%;border:1px solid rgba(132,216,159,.13);border-radius:50%;box-shadow:0 0 0 38px rgba(132,216,159,.025),0 0 0 90px rgba(132,216,159,.018)}.rvx-hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:225px;height:225px;border-radius:50%;background:radial-gradient(circle at 35% 25%,#1d5532,#07130c 65%);border:1px solid rgba(255,255,255,.17);display:flex;align-items:center;justify-content:center;text-align:center;box-shadow:0 30px 100px rgba(0,0,0,.5)}.rvx-hub strong{font:900 31px Georgia,serif}.rvx-hub strong em{font-style:normal;color:var(--o)}.rvx-hub small{display:block;color:#8d9a92;font-size:8px;letter-spacing:.12em;margin-top:7px}.rvx-node{position:absolute;width:157px;padding:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);backdrop-filter:blur(12px);border-radius:13px;box-shadow:0 16px 40px rgba(0,0,0,.2)}.rvx-node b{font-size:10px}.rvx-node span{display:block;color:#7e8c83;font-size:8px;line-height:1.45;margin-top:4px}.n1{left:0;top:7%}.n2{right:0;top:4%}.n3{left:-3%;bottom:11%}.n4{right:-2%;bottom:10%}.n5{left:50%;top:0;transform:translateX(-50%)}.n6{left:50%;bottom:0;transform:translateX(-50%)}
        .rvx-proof{margin-top:-35px;position:relative;z-index:4}.rvx-proofbox{background:#fff;border:1px solid #e0e7e0;border-radius:17px;padding:17px 22px;box-shadow:0 24px 65px rgba(15,23,42,.1);display:flex;justify-content:space-between;align-items:center;gap:20px}.rvx-proofstats{display:flex;gap:25px}.rvx-proofstats strong{display:block;color:var(--g);font:800 17px monospace}.rvx-proofstats small{color:#8b958f;font-size:8px}
        .rvx-section{padding:94px 0}.rvx-cream{background:var(--cream)}.rvx-dark{background:#07110b;color:#fff}.rvx-center{text-align:center}.rvx-kicker{text-transform:uppercase;color:var(--g);font-size:9px;font-weight:900;letter-spacing:.13em;margin-bottom:10px}.rvx-dark .rvx-kicker{color:#82d89f}.rvx-title{font:900 clamp(37px,5vw,60px) Georgia,serif;line-height:.98;margin:0;letter-spacing:-.06em}.rvx-title span{color:var(--g)}.rvx-dark .rvx-title span{color:#82d89f}.rvx-desc{max-width:700px;margin:15px auto 0;color:var(--muted);font-size:13px;line-height:1.7}.rvx-dark .rvx-desc{color:#89968e}
        .rvx-profile{display:inline-flex;padding:4px;background:#101b15;border-radius:999px;margin:28px 0 10px}.rvx-profile button{border:0;background:transparent;color:#b4c0b8;padding:10px 17px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer}.rvx-profile button.active{background:#fff;color:#102017}.rvx-profile-note{font-size:9px;color:#87948c}
        .rvx-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:38px 0 12px}.rvx-tab{cursor:pointer;border:1px solid #dfe6df;background:#fff;border-radius:11px;padding:12px 5px;color:#647069;font-size:8px;font-weight:900}.rvx-tab.active{background:var(--g);border-color:var(--g);color:#fff;box-shadow:0 13px 30px rgba(26,122,60,.2)}.rvx-tab i{display:block;font-style:normal;font-size:20px;margin-bottom:5px}.rvx-module{background:#fff;border:1px solid #e1e7e1;border-radius:20px;padding:28px;box-shadow:0 25px 70px rgba(15,23,42,.06)}.rvx-module-head{display:flex;justify-content:space-between;gap:35px;align-items:end}.rvx-module-head h3{font:900 31px Georgia,serif;margin:5px 0}.rvx-module-head p{max-width:560px;color:var(--muted);font-size:11.5px;line-height:1.65}.rvx-items{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:22px}.rvx-item{padding:15px;border:1px solid #e7ece7;border-radius:12px;background:#fbfcfa;font-size:10px;font-weight:700}.rvx-item:before{content:"✓";color:var(--g);font-weight:900;margin-right:7px}
        .rvx-chain{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:42px}.rvx-step{padding:14px 7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);border-radius:12px;text-align:center}.rvx-step b{font:800 15px monospace;color:var(--o)}.rvx-step strong{display:block;font-size:8.5px;margin-top:6px}.rvx-step span{display:block;color:#74827a;font-size:7.5px;line-height:1.4;margin-top:4px}
        .rvx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:40px}.rvx-card{border-radius:18px;padding:25px;border:1px solid #dfe6df;background:#fff;color:var(--ink)}.rvx-card.dark{background:#102017;color:#fff;border-color:rgba(255,255,255,.08)}.rvx-card h3{font:900 25px Georgia,serif;margin:0 0 9px;color:inherit}.rvx-card p{font-size:11px;line-height:1.65;color:var(--muted)}.rvx-card.dark p{color:#89968e}.rvx-list{display:grid;gap:8px;margin-top:16px}.rvx-list div{font-size:10px;color:inherit}.rvx-list b{color:var(--g);margin-right:7px}
        .rvx-industries{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:40px}.rvx-ind{background:#fff;border:1px solid #e1e7e1;border-radius:15px;padding:18px 13px;transition:.2s}.rvx-ind:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(15,23,42,.08)}.rvx-ind .icon{font-size:26px}.rvx-ind strong{display:block;font:900 16px Georgia,serif;margin-top:9px}.rvx-ind p{font-size:9.5px;line-height:1.5;color:var(--muted);margin:5px 0 0}
        .rvx-pricing{background:linear-gradient(#f7f8f4,#fff)}.rvx-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:42px}.rvx-plan{background:#fff;border:1px solid #dfe6df;border-radius:17px;padding:24px}.rvx-plan.featured{border:2px solid var(--g);box-shadow:0 25px 60px rgba(26,122,60,.14);transform:translateY(-6px)}.rvx-plan h3{font:900 21px Georgia,serif;margin:0}.rvx-price{font:800 26px monospace;color:var(--g);margin-top:8px}.rvx-price small{font:9px Inter;color:#8a958e;font-weight:500}.rvx-plan ul{list-style:none;padding:0;margin:18px 0;display:grid;gap:7px}.rvx-plan li{font-size:10px;color:#59645e}.rvx-plan li:before{content:"✓";color:var(--g);font-weight:900;margin-right:6px}.rvx-plan a{display:block;text-align:center;background:var(--g);color:#fff;border-radius:9px;padding:11px;font-size:10.5px;font-weight:900}
        .rvx-faq{max-width:820px;margin:38px auto 0;display:grid;gap:7px}.rvx-faqrow{border:1px solid #dfe6df;border-radius:11px;background:#fff;overflow:hidden}.rvx-faqrow button{width:100%;border:0;background:#fff;padding:15px;display:flex;justify-content:space-between;text-align:left;font-size:11px;font-weight:800;cursor:pointer}.rvx-answer{padding:0 15px 15px;color:var(--muted);font-size:10px;line-height:1.6}
        .rvx-final{background:radial-gradient(circle at 50% 0,rgba(46,139,87,.38),transparent 43%),linear-gradient(135deg,#030705,#10251a);color:#fff;text-align:center;padding:100px 0}.rvx-final h2{font:900 clamp(40px,6vw,70px) Georgia,serif;line-height:.92;letter-spacing:-.065em;max-width:900px;margin:0 auto 18px}.rvx-final h2 span{color:#82d89f}.rvx-final p{max-width:620px;margin:auto;color:#89968e;font-size:12px;line-height:1.7}.rvx-footer{text-align:center;color:#8b958f;font-size:9px;padding:28px 0 85px}.rvx-mobile{display:none}
        @media(max-width:900px){.rvx-hero-grid{grid-template-columns:1fr}.rvx-hero{text-align:center}.rvx-lead{margin:auto}.rvx-actions,.rvx-trust{justify-content:center}.rvx-map{max-width:600px;width:100%;margin:auto}.rvx-navlinks a:not(.cta){display:none}.rvx-chain{grid-template-columns:repeat(4,1fr)}.rvx-industries{grid-template-columns:repeat(3,1fr)}.rvx-tabs{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:650px){.rvx .wrap{width:calc(100% - 24px)}.rvx-hero{padding:52px 0 76px}.rvx-h1{font-size:45px}.rvx-actions{flex-direction:column}.rvx-btn{width:100%}.rvx-map{min-height:400px;transform:scale(.9);margin:-15px auto}.rvx-proofbox{display:block;text-align:center}.rvx-proofstats{justify-content:center;flex-wrap:wrap;margin-top:13px}.rvx-section{padding:65px 0}.rvx-module-head{display:block}.rvx-items,.rvx-grid2,.rvx-plans{grid-template-columns:1fr}.rvx-industries{grid-template-columns:1fr 1fr}.rvx-chain{grid-template-columns:repeat(2,1fr)}.rvx-plan.featured{transform:none}.rvx-profile{flex-direction:column;width:100%;border-radius:14px}.rvx-profile button{width:100%}.rvx-mobile{display:block;position:fixed;bottom:8px;left:8px;right:8px;z-index:40;background:rgba(255,255,255,.96);border:1px solid #dce5dd;padding:7px;border-radius:12px;box-shadow:0 16px 35px rgba(0,0,0,.18)}.rvx-mobile a{display:block;text-align:center;background:var(--g);color:#fff;border-radius:8px;padding:13px;font-size:11px;font-weight:900}.rvx-footer{padding-bottom:85px}}
      `}</style>

      <header className="rvx-nav"><div className="wrap rvx-navin"><a href="?" className="rvx-brand">RECU<em>VENTE</em></a><nav className="rvx-navlinks"><a href="#systeme">Système</a><a href="#metiers">Métiers</a><a href="#tarifs">Tarifs</a><a href="?login=1">Connexion</a><a href="?auth=1" className="cta">Créer mon espace →</a></nav></div></header>

      <section className="rvx-hero"><div className="wrap rvx-hero-grid"><div><div className="rvx-pill"><span className="rvx-dot"/> L'INFRASTRUCTURE DE TON BUSINESS</div><h1 className="rvx-h1">Ne gère plus<br/>des morceaux.<br/><span>Pilote tout.</span></h1><p className="rvx-lead">RecuVente relie ta boutique, tes commandes, tes closers, tes livreurs, tes clients, tes paiements, ta comptabilité, tes campagnes et ton équipe dans un seul système.</p><div className="rvx-actions"><a href="?auth=1" onClick={trackLead} className="rvx-btn rvx-primary">🚀 Créer mon espace RecuVente</a><a href="#systeme" className="rvx-btn rvx-secondary">Découvrir le système ↓</a></div><div className="rvx-trust"><span>✓ <b>Boutique</b></span><span>✓ <b>Closing</b></span><span>✓ <b>GPS livreurs</b></span><span>✓ <b>Comptabilité</b></span><span>✓ <b>Retargeting</b></span></div></div><div className="rvx-map"><div className="rvx-hub"><div><strong>RECU<em>VENTE</em></strong><small>BUSINESS OPERATING SYSTEM</small></div></div><div className="rvx-node n1"><b>🛍️ VENDRE</b><span>Boutique · Shopify · produits · pixels</span></div><div className="rvx-node n2"><b>🎯 CONVERTIR</b><span>Closing · appels · qualification</span></div><div className="rvx-node n3"><b>🚚 LIVRER</b><span>GPS · attribution · reprogrammation</span></div><div className="rvx-node n4"><b>💵 ENCAISSER</b><span>Paiements · dépôts · bénéfice</span></div><div className="rvx-node n5"><b>🔁 RÉACTIVER</b><span>Clients · WhatsApp · campagnes</span></div><div className="rvx-node n6"><b>🧭 PILOTER</b><span>Équipe · statistiques · audit</span></div></div></div></section>

      <div className="wrap rvx-proof"><div className="rvx-proofbox"><div><b style={{fontSize:13}}>Une seule vérité opérationnelle.</b><div style={{fontSize:9,color:"#8b958f",marginTop:4}}>Du premier clic jusqu'à l'argent réellement encaissé.</div></div><div className="rvx-proofstats"><div><strong>{stats?.nb_commandes_confirmees ? Number(stats.nb_commandes_confirmees).toLocaleString("fr-FR") : "360°"}</strong><small>vision commandes</small></div><div><strong>1</strong><small>écosystème</small></div><div><strong>24/7</strong><small>accès</small></div></div></div></div>

      <section id="systeme" className="rvx-section"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">Le système complet</div><h2 className="rvx-title">Six moteurs.<br/><span>Une seule machine.</span></h2><p className="rvx-desc">RecuVente ne t'oblige plus à assembler plusieurs outils. Chaque étape de ton activité nourrit la suivante.</p><div className="rvx-profile"><button className={profil === "cod" ? "active" : ""} onClick={() => setProfil("cod")}>🏍️ Je vends en ligne / COD</button><button className={profil === "retail" ? "active" : ""} onClick={() => setProfil("retail")}>🏪 J'ai un commerce physique</button></div><div className="rvx-profile-note">Tu peux combiner vente en ligne et vente physique dans ton organisation.</div></div>
        <div className="rvx-tabs">{modules.map((m) => <button key={m.id} className={`rvx-tab ${active === m.id ? "active" : ""}`} onClick={() => setActive(m.id)}><i>{m.icon}</i>{m.name}</button>)}</div>
        <div className="rvx-module"><div className="rvx-module-head"><div><div className="rvx-kicker">Moteur {activeModule.id}</div><h3>{activeModule.title}</h3></div><p>{activeModule.text}</p></div><div className="rvx-items">{activeModule.items.map((item) => <div className="rvx-item" key={item}>{item}</div>)}</div></div>
      </div></section>

      <section className="rvx-section rvx-dark"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">De bout en bout</div><h2 className="rvx-title">Du <span>clic publicitaire</span><br/>au dernier franc.</h2><p className="rvx-desc">Voici la chaîne que RecuVente transforme en données, actions et décisions.</p></div><div className="rvx-chain">{[["01","PUBLICITÉ","Pixel · campagne"],["02","BOUTIQUE","Produit · commande"],["03","CLOSING","Appel · confirmation"],["04","ATTRIBUTION","Closer · livreur"],["05","LIVRAISON","GPS · résultat"],["06","ENCAISSEMENT","Paiement · dépôt"],["07","RÉACTIVATION","Client · relance"]].map((x) => <div className="rvx-step" key={x[0]}><b>{x[0]}</b><strong>{x[1]}</strong><span>{x[2]}</span></div>)}</div><div className="rvx-grid2"><div className="rvx-card"><h3>Tu veux retrouver une commande ?</h3><p>Tu peux descendre jusqu'au détail d'une commande, d'un client, d'un produit ou d'un membre de ton équipe.</p><div className="rvx-list">{["Quel client a été appelé ?","Quel closer a confirmé ?","Quel produit a été remis ?","Quel livreur l'a reçu ?","Livré, échoué ou reprogrammé ?"].map((x) => <div key={x}><b>✓</b>{x}</div>)}</div></div><div className="rvx-card dark"><h3>Tu veux comprendre ton argent ?</h3><p>Relie commandes, paiements, coûts, commissions, dépôts et bénéfices au même endroit.</p><div className="rvx-list">{["Montant encaissé","À récupérer","Dépôt attendu","Coût produit","Bénéfice réel"].map((x) => <div key={x}><b style={{color:"#ff7a00"}}>→</b>{x}</div>)}</div></div></div></div></section>

      <section id="metiers" className="rvx-section rvx-cream"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">Plus qu'un outil e-commerce</div><h2 className="rvx-title">Une plateforme qui <span>comprend ton métier.</span></h2><p className="rvx-desc">Ton activité peut évoluer. Ton système de gestion ne devrait pas t'obliger à repartir de zéro.</p></div><div className="rvx-industries">{metiers.map((m) => <div className="rvx-ind" key={m[1]}><div className="icon">{m[0]}</div><strong>{m[1]}</strong><p>{m[2]}</p></div>)}</div></div></section>

      <section className="rvx-section"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">Le vrai changement</div><h2 className="rvx-title">Avant : des outils.<br/><span>Après : un système.</span></h2></div><div className="rvx-grid2"><div className="rvx-card" style={{background:"#fff7f5",borderColor:"#f0ddd7"}}><h3>❌ Le chaos coûte cher.</h3><p>WhatsApp, cahiers, Excel, captures, appels et calculs dispersés.</p><div className="rvx-list">{["Commandes perdues","Doublons non détectés","Livreurs difficiles à contrôler","Paiements oubliés","Clients jamais relancés","Bénéfice réel inconnu"].map((x) => <div key={x}><b style={{color:"#d34a37"}}>×</b>{x}</div>)}</div></div><div className="rvx-card" style={{background:"#f1faf4",borderColor:"#d5e8da"}}><h3>✓ RecuVente relie les points.</h3><p>Une information saisie devient exploitable par les autres étapes de ton activité.</p><div className="rvx-list">{["Commandes traçables","Doublons repérables","Livreurs suivis","Paiements rapprochables","Clients réactivables","Rentabilité lisible"].map((x) => <div key={x}><b>✓</b>{x}</div>)}</div></div></div></div></section>

      <section id="tarifs" className="rvx-section rvx-pricing"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">Choisis ton niveau</div><h2 className="rvx-title">Commence maintenant.<br/><span>Structure pour grandir.</span></h2><p className="rvx-desc">Les plans disponibles sur ton compte apparaissent automatiquement ci-dessous.</p></div><div className="rvx-plans">{plans.map((p,i) => <div className={`rvx-plan ${i === 1 ? "featured" : ""}`} key={p.id}><h3>{p.nom}</h3><div className="rvx-price">{Number(p.prix).toLocaleString("fr-FR")} <small>{p.devise}/mois</small></div><ul><li>{p.max_commandes_mois ? `${p.max_commandes_mois} commandes/mois` : "Commandes selon le plan"}</li><li>{p.max_membres ? `${p.max_membres} membres max` : "Membres selon le plan"}</li><li>Commandes & clients</li><li>Produits & activités</li><li>Tableau de bord</li></ul><a href="?auth=1" onClick={trackLead}>Commencer maintenant →</a></div>)}</div></div></section>

      <section className="rvx-section rvx-cream"><div className="wrap"><div className="rvx-center"><div className="rvx-kicker">Questions fréquentes</div><h2 className="rvx-title">Tu hésites encore ?<br/><span>Regarde ce que le système fait.</span></h2></div><div className="rvx-faq">{faqs.map((f,i) => <div className="rvx-faqrow" key={f[0]}><button onClick={() => setOpenFaq(openFaq === i ? null : i)}><span>{f[0]}</span><span>{openFaq === i ? "−" : "+"}</span></button>{openFaq === i && <div className="rvx-answer">{f[1]}</div>}</div>)}</div></div></section>

      <section className="rvx-final"><div className="wrap"><div className="rvx-kicker">Le prochain niveau commence ici</div><h2>Arrête de courir derrière ton activité.<br/><span>Fais-la travailler comme un système.</span></h2><p>Crée ton espace RecuVente et connecte progressivement tes ventes, tes clients, ton équipe, tes livraisons, tes paiements et ta croissance.</p><div style={{marginTop:28}}><a href="?auth=1" onClick={trackLead} className="rvx-btn rvx-primary">🚀 Créer mon espace RecuVente →</a></div></div></section>

      <footer className="rvx-footer">RecuVente — Un système pour vendre, convertir, livrer, encaisser, réactiver et piloter.<div style={{marginTop:8,display:"flex",gap:15,justifyContent:"center",flexWrap:"wrap"}}><a href="?page=impact" style={{color:"#8b958f",textDecoration:"underline"}}>Rapport d'impact</a><a href="?page=cgu" style={{color:"#8b958f",textDecoration:"underline"}}>Conditions</a><a href="?page=confidentialite" style={{color:"#8b958f",textDecoration:"underline"}}>Confidentialité</a></div></footer>
      <div className="rvx-mobile"><a href="?auth=1" onClick={trackLead}>🚀 Commencer avec RecuVente</a></div>
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>

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
  ];

  return (
    <Centered>
      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 30, width: 360 }}>
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

function RadarDesFuitesEtActions({ todoAujourdhui, clientsARelancer, depotsParLivreur, currency, onVoirRecovery, onVoirCompta, onVoirClients }) {
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
    actions.push({ num: "01", titre: "RAPPELER", desc: `${jamaisRappeles} client${jamaisRappeles > 1 ? "s n'ont" : " n'a"} jamais répondu`, potentiel: todoAujourdhui.jamaisContactees.reduce((s, c) => s + Number(c.montant), 0), bouton: "RAPPELER", action: onVoirRecovery, couleur: "#D64933" });
  }
  if (echouees > 0) {
    actions.push({ num: "02", titre: "RÉCUPÉRER", desc: `${echouees} commande${echouees > 1 ? "s" : ""} échouée${echouees > 1 ? "s" : ""} peuvent être reprogrammées`, potentiel: todoAujourdhui.argentRecuperable, bouton: "RÉCUPÉRER", action: onVoirRecovery, couleur: "#8A6412" });
  }
  if (livreurAControler && livreurAControler.aDeposer > 0) {
    actions.push({ num: "03", titre: "CONTRÔLER", desc: `${livreurAControler.nom} doit déposer ${livreurAControler.aDeposer.toLocaleString("fr-FR")} ${currency}`, potentiel: null, bouton: "VÉRIFIER", action: onVoirCompta, couleur: "#1E4B8C" });
  }
  if (clientsARelancer.length > 0) {
    actions.push({ num: "04", titre: "RELANCER", desc: `${clientsARelancer.length} ancien${clientsARelancer.length > 1 ? "s clients correspondent" : " client correspond"} à leur rythme d'achat habituel`, potentiel: null, bouton: "RELANCER", action: onVoirClients, couleur: "#1a7a3c" });
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
    </div>
  );
}

function ResumeIntelligent({ todoAujourdhui, clientsARelancer, produitStockCritique, meilleurLivreur, beneficeReel, currency, onVoirAujourdhui }) {
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

  if (lignes.length === 0) return null;

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "16px 18px", margin: "14px 20px 0" }}>
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
  const activityType = workspace?.activity_type || 'cod_ecommerce';
  const activityLabel = ({cod_ecommerce:'E-commerce',retail:'Commerce physique',restaurant:'Restaurant',location_immobiliere:'Location immobilière',location_vehicule:'Location de voitures'})[activityType] || 'E-commerce';
  const sectionCatalog = {
    announcement:{icon:'📣',label:'Barre d’annonce',description:'Message promotionnel ou information importante.'},
    hero:{icon:'✨',label:'Hero / couverture',description:'Grande image, titre, sous-titre et bouton.'},
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
    selectedProductIds:[], selectedCollectionIds:[], gallery:[],
    sections:activityType==='restaurant'?['announcement','hero','collections','products','bestsellers','bundles','benefits','testimonials','gallery','faq','cod_form','whatsapp','contact','footer']:['announcement','hero','collections','bestsellers','products','bundles','benefits','promo','testimonials','gallery','faq','delivery','cod_form','whatsapp','contact','footer'],
    bundles:[{id:'b1',qty:1,label:'1 unité',discount:0,badge:'Prix normal'},{id:'b2',qty:2,label:'Pack x2',discount:10,badge:'Économise 10%'},{id:'b3',qty:3,label:'Pack x3',discount:15,badge:'Meilleure offre'}]
  };
  const [config,setConfig]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');return saved?{...defaults,...saved}:defaults}catch(_){return defaults}});
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
  function remove(i){setConfig(c=>({...c,sections:c.sections.filter((_,j)=>j!==i)}))}
  function addSection(type){setConfig(c=>({...c,sections:[...c.sections,type]}));setSelected(type);setShowAdd(false)}
  async function uploadImage(kind,file){
    if(!file)return; if(file.size>8*1024*1024){alert('Image trop lourde (maximum 8 Mo).');return;} setUploading(kind);
    const fichierCompresse=await compresserImage(file);
    const ext=(fichierCompresse.name.split('.').pop()||'jpg').toLowerCase(); const path=`${workspace.id}/builder-${kind}-${Date.now()}.${ext}`;
    const {error}=await supabase.storage.from('boutique').upload(path,fichierCompresse,{upsert:true,contentType:fichierCompresse.type||undefined});
    if(error){alert('Impossible d’envoyer l’image : '+error.message);setUploading(null);return;}
    const {data}=supabase.storage.from('boutique').getPublicUrl(path); const url=data.publicUrl;
    if(kind==='hero') update('banniere',url); else if(kind==='logo') update('logo',url); else if(kind==='gallery') setConfig(c=>({...c,gallery:[...(c.gallery||[]),url]}));
    setUploading(null);
  }
  async function save(){
    setSaving(true);setSaved(false);
    try{localStorage.setItem(storageKey,JSON.stringify(config));}catch(_){}
    if(workspace?.id){
      const patch={name:config.nom,couleur_marque:config.couleur,description_boutique:config.description,politique_livraison:config.livraison,logo_url:config.logo||null,banniere_url:config.banniere||null,frais_livraison:Number(config.fraisLivraison)||0,frais_expedition:Number(config.fraisExpedition)||0,store_config:config};
      const {error}=await supabase.from('workspaces').update(patch).eq('id',workspace.id);
      if(error){setSaving(false);alert('Enregistrement impossible : '+error.message);return false;}
    }
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
    const common={padding:'28px 22px',borderBottom:'1px solid #edf1ee'};
    if(type==='announcement')return <div style={{...common,padding:'9px 14px',background:config.couleur,color:'#fff',fontSize:10.5,fontWeight:800,textAlign:'center'}}>{config.announcement}</div>;
    if(type==='hero')return <div style={{...common,padding:0,textAlign:'center'}}><div style={{position:'relative'}}>{config.banniere?<img src={config.banniere} alt="Couverture" style={{width:'100%',height:device==='mobile'?155:220,objectFit:'cover',display:'block'}}/>:<div style={{height:device==='mobile'?155:220,background:`linear-gradient(135deg,${config.couleur},#0b2416)`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',padding:20}}><div style={{fontSize:device==='mobile'?25:36,fontWeight:950,maxWidth:620,lineHeight:1.04}}>{config.heroTitle}</div></div>}</div><div style={{padding:'22px 20px 28px'}}><div style={{fontSize:device==='mobile'?24:32,fontWeight:950,color:'#132019',lineHeight:1.08}}>{config.heroTitle}</div><div style={{fontSize:12.5,color:'#68756d',lineHeight:1.6,margin:'10px auto 16px',maxWidth:600}}>{config.heroSubtitle}</div><button style={{border:0,borderRadius:10,padding:'12px 19px',background:config.couleur,color:'#fff',fontWeight:900}}>{config.buttonText}</button></div></div>;
    if(type==='collections')return <div style={common}><h3 style={{margin:'0 0 15px',fontSize:20,color:'#14221b'}}>Explorer les collections</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:3},1fr)`,gap:10}}>{derivedCollections.filter(c=>!config.selectedCollectionIds?.length||config.selectedCollectionIds.includes(c.id)).slice(0,6).map(c=><div key={c.id} style={{padding:'18px 10px',borderRadius:12,background:'#f5f8f5',textAlign:'center'}}><div style={{fontSize:20}}>🗂️</div><div style={{fontWeight:850,fontSize:11.5,marginTop:6}}>{c.nom||c.name}</div><div style={{fontSize:10,color:'#7c877f',marginTop:3}}>{c.count||0} article(s)</div></div>)}</div></div>;
    if(type==='bestsellers'||type==='products')return <div style={common}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><h3 style={{margin:0,fontSize:20,color:'#14221b'}}>{type==='bestsellers'?'🔥 Meilleures ventes':'Nos produits'}</h3><span style={{fontSize:10.5,color:'#758078'}}>Voir tout →</span></div><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},minmax(0,1fr))`,gap:10}}>{(type==='bestsellers'?bestsellers:fallbackProducts).slice(0,8).map((p,i)=><div key={p.id||i} style={{border:'1px solid #e7ece8',borderRadius:12,overflow:'hidden',background:'#fff'}}>{p.image?<img src={p.image} alt="" style={{width:'100%',height:device==='mobile'?115:150,objectFit:'cover'}}/>:<div style={{height:device==='mobile'?115:150,background:'#eef3ee',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>🛍️</div>}<div style={{padding:9,textAlign:'left'}}><div style={{fontWeight:850,fontSize:11.5,color:'#17241d'}}>{p.name}</div><div style={{fontWeight:900,fontSize:12.5,color:config.couleur,marginTop:4}}>{p.price?p.price.toLocaleString('fr-FR')+' '+(workspace?.currency||'XOF'):'Prix sur demande'}</div><button style={{marginTop:8,width:'100%',border:0,borderRadius:8,padding:'7px 6px',background:config.couleur,color:'#fff',fontSize:10,fontWeight:900}}>{activityType==='restaurant'?'Commander':activityType.includes('location')?'Réserver':'Ajouter'}</button></div></div>)}</div>{!products.length&&<div style={{padding:16,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#728078',fontSize:11}}>Ton catalogue est vide. Utilise « Produits → Importer un catalogue CSV » pour ajouter tes produits.</div>}</div>;
    if(type==='bundles'){const base=bestsellers[0]?.price||products[0]?.price||0;return <div style={{...common,background:'#fffdf7'}}><div style={{textAlign:'center',marginBottom:15}}><div style={{fontSize:10,fontWeight:950,color:'#b16b00',letterSpacing:'.08em'}}>🔥 OFFRES QUANTITÉ</div><h3 style={{margin:'5px 0',fontSize:21,color:'#14221b'}}>Plus tu prends, plus tu économises</h3></div><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:9}}>{(config.bundles||[]).map((b,i)=>{const total=base*b.qty*(1-(Number(b.discount)||0)/100);return <div key={b.id||i} style={{position:'relative',border:i===2?'2px solid '+config.couleur:'1px solid #e4e9e5',borderRadius:14,padding:14,background:'#fff'}}><div style={{fontSize:12,fontWeight:950,color:'#16231c'}}>{b.label}</div><div style={{fontSize:10.5,color:'#7b857e',marginTop:4}}>{b.qty} produit(s) · {b.discount||0}% de remise</div><div style={{fontSize:20,fontWeight:950,color:config.couleur,marginTop:10}}>{base?total.toLocaleString('fr-FR')+' '+(workspace?.currency||'XOF'):'Prix calculé à la commande'}</div><button style={{marginTop:10,width:'100%',border:0,borderRadius:9,padding:'9px',background:config.couleur,color:'#fff',fontWeight:900,fontSize:10}}>Choisir ce pack</button></div>})}</div></div>}
    if(type==='gallery')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>Notre univers</h3>{config.gallery?.length?<div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?2:4},1fr)`,gap:8}}>{config.gallery.map((u,i)=><img key={i} src={u} alt="" style={{width:'100%',height:device==='mobile'?100:130,objectFit:'cover',borderRadius:10}}/>)}</div>:<div style={{padding:30,textAlign:'center',background:'#f6f9f6',borderRadius:10,color:'#7a857e',fontSize:11}}>Ajoute tes images depuis le panneau de droite.</div>}</div>;
    if(type==='cod_form')return <div style={{...common,background:'#f7faf7'}}><div style={{maxWidth:520,margin:'0 auto'}}><div style={{textAlign:'center',marginBottom:15}}><div style={{fontSize:10,fontWeight:950,color:config.couleur}}>COMMANDE SIMPLE & RAPIDE</div><h3 style={{margin:'5px 0',fontSize:21,color:'#14221b'}}>📝 Bon de commande — Paiement à la livraison</h3></div><div style={{background:'#fff',border:'1px solid #e1e8e2',borderRadius:14,padding:14}}><div style={{display:'grid',gridTemplateColumns:device==='mobile'?'1fr':'1fr 1fr',gap:8}}>{['Nom complet','Téléphone WhatsApp','Ville / commune','Adresse de livraison'].map(x=><div key={x} style={{border:'1px solid #e0e6e1',borderRadius:9,padding:11,fontSize:10.5,color:'#8a948d'}}>{x}</div>)}</div><div style={{marginTop:10,padding:11,borderRadius:10,background:'#f5f8f5',fontSize:11.5,color:'#435047'}}>🚚 Livraison : <b>{Number(config.fraisLivraison||0).toLocaleString('fr-FR')} {workspace?.currency||'XOF'}</b> · 🚛 Expédition : <b>{Number(config.fraisExpedition||0).toLocaleString('fr-FR')} {workspace?.currency||'XOF'}</b></div><button style={{marginTop:10,width:'100%',border:0,borderRadius:10,padding:12,background:config.couleur,color:'#fff',fontWeight:950}}>Confirmer ma commande — paiement à la livraison</button></div></div></div>;
    if(type==='benefits')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>Pourquoi acheter chez nous ?</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:9}}>{[['🛡️','Paiement à la livraison'],['🚚','Livraison suivie'],['💬','Support rapide']].map(x=><div key={x[1]} style={{padding:14,borderRadius:11,background:'#f6f9f6'}}><div style={{fontSize:20}}>{x[0]}</div><div style={{fontWeight:850,fontSize:11.5,marginTop:7}}>{x[1]}</div></div>)}</div></div>;
    if(type==='promo')return <div style={{...common,background:'#f7f2e7',textAlign:'center'}}><div style={{fontSize:10,fontWeight:900,color:'#b16b00'}}>OFFRE LIMITÉE</div><h3 style={{fontSize:24,margin:'7px 0',color:'#162119'}}>{config.promoTitle}</h3><p style={{fontSize:12,color:'#6f776f'}}>{config.promoText}</p><button style={{border:0,borderRadius:9,padding:'10px 18px',background:'#e8920a',fontWeight:900}}>Profiter de l'offre</button></div>;
    if(type==='testimonials')return <div style={common}><h3 style={{margin:'0 0 14px',fontSize:19,color:'#14221b'}}>⭐ Ils nous font confiance</h3><div style={{display:'grid',gridTemplateColumns:`repeat(${device==='mobile'?1:3},1fr)`,gap:10}}>{['Une expérience simple et rapide.','La commande a été parfaitement suivie.','Je recommande sans hésiter.'].map((t,i)=><div key={i} style={{padding:15,border:'1px solid #e6ece7',borderRadius:12}}><div style={{color:'#e8920a'}}>★★★★★</div><div style={{fontSize:11.5,lineHeight:1.55,color:'#435047',marginTop:7}}>“{t}”</div><div style={{fontSize:10,fontWeight:800,marginTop:9}}>Client</div></div>)}</div></div>;
    if(type==='faq')return <div style={common}><h3 style={{margin:'0 0 12px',fontSize:19,color:'#14221b'}}>Questions fréquentes</h3>{['Comment commander ?','Quels sont les délais ?','Comment suivre ma commande ?'].map(q=><div key={q} style={{padding:'12px 2px',borderBottom:'1px solid #e7ece8',fontSize:11.5,fontWeight:800,display:'flex',justifyContent:'space-between'}}>{q}<span>＋</span></div>)}</div>;
    if(type==='whatsapp')return <div style={{...common,textAlign:'center',background:'#f4faf5'}}><div style={{fontSize:26}}>💬</div><h3 style={{margin:'7px 0',fontSize:19,color:'#14221b'}}>Besoin d'aide ?</h3><p style={{fontSize:11.5,color:'#68756d'}}>Écris-nous directement sur WhatsApp.</p><button style={{border:0,borderRadius:10,padding:'10px 18px',background:'#168a45',color:'#fff',fontWeight:900}}>Ouvrir WhatsApp</button></div>;
    if(type==='delivery')return <div style={common}><h3 style={{margin:'0 0 9px',fontSize:19,color:'#14221b'}}>🚚 Livraison</h3><p style={{fontSize:11.5,color:'#68756d',lineHeight:1.6}}>{config.livraison}</p></div>;
    if(type==='contact')return <div style={{...common,textAlign:'center',background:'#0d2417',color:'#fff'}}><h3 style={{margin:'0 0 8px',fontSize:24}}>Prêt à passer à l'action ?</h3><p style={{fontSize:11.5,color:'rgba(255,255,255,.68)'}}>Commandez, réservez ou contactez-nous maintenant.</p><button style={{border:0,borderRadius:10,padding:'11px 20px',background:config.couleur,color:'#fff',fontWeight:900}}>{config.buttonText}</button></div>;
    if(type==='footer')return <div style={{padding:'24px 20px',background:'#101b15',color:'#fff',fontSize:10.5}}><div style={{fontWeight:900,fontSize:14}}>{config.nom}</div><div style={{opacity:.65,marginTop:6}}>{config.description}</div><div style={{opacity:.45,marginTop:14}}>© {new Date().getFullYear()} • Tous droits réservés</div></div>;
    return <div style={common}/>;
  }
  function Editor(){
    const type=selected;
    if(type==='hero')return <><label style={labelStyle}>Titre principal<input style={fieldStyle} value={config.heroTitle} onChange={e=>update('heroTitle',e.target.value)}/></label><label style={labelStyle}>Sous-titre<textarea style={{...fieldStyle,resize:'vertical'}} rows={4} value={config.heroSubtitle} onChange={e=>update('heroSubtitle',e.target.value)}/></label><label style={labelStyle}>Texte du bouton<input style={fieldStyle} value={config.buttonText} onChange={e=>update('buttonText',e.target.value)}/></label>{config.banniere&&<img src={config.banniere} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:10,marginBottom:8}}/>}<FileButton kind="hero" label="Télécharger / changer la couverture"/><label style={{...labelStyle,marginTop:8}}>Ou URL de couverture<input style={fieldStyle} placeholder="https://..." value={config.banniere} onChange={e=>update('banniere',e.target.value)}/></label></>;
    if(type==='announcement')return <label style={labelStyle}>Message<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.announcement} onChange={e=>update('announcement',e.target.value)}/></label>;
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
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:13}}><div><div style={{fontSize:20,fontWeight:950,color:'#122019'}}>🛍️ Store Builder <span style={{fontSize:10,background:'#eaf5eb',color:'#1a7a3c',padding:'5px 7px',borderRadius:999}}>{activityLabel}</span></div><button onClick={onClose} style={{marginLeft:'auto',border:'1px solid #dce5de',background:'#fff',color:'#526057',borderRadius:10,padding:'9px 11px',fontSize:11,fontWeight:850,cursor:'pointer'}}>✕ Fermer</button><div style={{fontSize:11.5,color:'#748078',marginTop:4}}>Construis ta boutique visuellement. Chaque section est éditable et reliée à ton catalogue.</div></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{workspace?.id && <a href={`${window.location.origin}/?catalogue=${workspace.id}`} target="_blank" rel="noopener noreferrer" style={{border:'1px solid #dce5de',background:'#fff',color:'#1c2b22',borderRadius:10,padding:'10px 12px',fontSize:11,fontWeight:850,cursor:'pointer',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}>👁️ Voir ma boutique</a>}{onOuvrirParametresAvances && <button onClick={onOuvrirParametresAvances} style={{border:'1px solid #dce5de',background:'#fff',color:'#1c2b22',borderRadius:10,padding:'10px 12px',fontSize:11,fontWeight:850,cursor:'pointer'}}>⚙️ Paramètres avancés</button>}<button onClick={save} disabled={saving} style={{border:'1px solid #dce5de',background:'#fff',color:'#1c2b22',borderRadius:10,padding:'10px 12px',fontSize:11,fontWeight:850,cursor:'pointer'}}>{saving?'Enregistrement…':saved?'✓ Enregistré':'Enregistrer'}</button><button onClick={publish} style={{border:0,background:config.couleur,color:'#fff',borderRadius:10,padding:'10px 13px',fontSize:11,fontWeight:900,cursor:'pointer'}}>{published?'✓ Publiée':'🚀 Publier'}</button></div></div>
    {published && workspace?.id && <div style={{background:'#eaf5eb',border:'1px solid #c7dda3',borderRadius:10,padding:'10px 14px',marginBottom:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:800,color:'#3B6D11'}}>✅ Ta boutique est en ligne !</span><a href={`${window.location.origin}/?catalogue=${workspace.id}`} target="_blank" rel="noopener noreferrer" style={{background:'#1a7a3c',color:'#fff',borderRadius:8,padding:'7px 14px',fontSize:11.5,fontWeight:800,textDecoration:'none'}}>👁️ Voir ma boutique →</a></div>}
    <div className="rv-builder-mobile-tabs">{[['structure','📋 Structure'],['apercu','👁️ Aperçu'],['reglages','⚙️ Réglages']].map(([k,l])=><button key={k} onClick={()=>setOngletBuilder(k)} style={{flex:1,border:0,borderRadius:9,padding:'9px 4px',fontSize:11,fontWeight:850,cursor:'pointer',background:ongletBuilder===k?config.couleur:'#eef2ee',color:ongletBuilder===k?'#fff':'#435047'}}>{l}</button>)}</div>
    <div className="rv-builder-grid" style={{display:'grid',gridTemplateColumns:device==='mobile'?'1fr':device==='tablet'?'190px minmax(0,1fr)':'220px minmax(0,1fr) 290px',gap:12,alignItems:'start'}}>
      <div className={`rv-builder-panel ${ongletBuilder==='structure'?'active':''}`} style={{...cardStyle,padding:12,boxShadow:'none'}}><div style={{fontSize:12.5,fontWeight:950,color:'#17241d',marginBottom:9}}>Structure de la page</div>{config.sections.map((s,i)=><div key={`${s}-${i}`} onClick={()=>setSelected(s)} style={{display:'flex',alignItems:'center',gap:4,padding:'8px 5px',borderBottom:'1px solid #edf1ee',background:selected===s?'#f0f7f1':'transparent',borderRadius:8,cursor:'pointer'}}><span>{sectionCatalog[s]?.icon||'▦'}</span><span style={{flex:1,fontSize:10.8,fontWeight:800,color:'#24332a'}}>{sectionCatalog[s]?.label||s}</span><button onClick={e=>{e.stopPropagation();move(i,-1)}} style={{border:0,background:'transparent',cursor:'pointer'}}>↑</button><button onClick={e=>{e.stopPropagation();move(i,1)}} style={{border:0,background:'transparent',cursor:'pointer'}}>↓</button><button onClick={e=>{e.stopPropagation();remove(i)}} style={{border:0,background:'transparent',cursor:'pointer',color:'#bd4b38'}}>×</button></div>)}<button onClick={()=>setShowAdd(!showAdd)} style={{width:'100%',marginTop:10,border:'1px dashed #b9c8bd',background:'#f8fbf8',borderRadius:9,padding:9,fontSize:10.5,fontWeight:900,color:'#1a7a3c',cursor:'pointer'}}>＋ Ajouter une section</button>{showAdd&&<div style={{marginTop:7,display:'grid',gap:4,maxHeight:280,overflow:'auto'}}>{Object.entries(sectionCatalog).map(([k,v])=><button key={k} onClick={()=>addSection(k)} style={{textAlign:'left',border:'1px solid #e7ece8',background:'#fff',borderRadius:8,padding:8,fontSize:10.5,cursor:'pointer'}}>{v.icon} {v.label}</button>)}</div>}</div>
      <div className={`rv-builder-panel ${ongletBuilder==='apercu'?'active':''}`} style={{background:'#e9efea',borderRadius:16,padding:12,minHeight:720,overflow:'auto'}}><div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:10,flexWrap:'wrap'}}>{[['desktop','🖥️ Desktop'],['tablet','▣ Tablette'],['mobile','📱 Mobile']].map(([k,l])=><button key={k} onClick={()=>setDevice(k)} style={{border:0,borderRadius:9,padding:'7px 10px',background:device===k?config.couleur:'#fff',color:device===k?'#fff':'#435047',fontSize:10.5,fontWeight:850,cursor:'pointer'}}>{l}</button>)}</div><div style={{margin:'0 auto',width:device==='mobile'?375:device==='tablet'?680:'100%',maxWidth:'100%',background:'#fff',borderRadius:15,overflow:'hidden',boxShadow:'0 20px 55px rgba(15,37,24,.14)'}}><div style={{height:4,background:config.couleur}}/><div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,borderBottom:'1px solid #edf1ee'}}><div style={{display:'flex',alignItems:'center',gap:8,fontWeight:950,color:'#14221b'}}>{config.logo?<img src={config.logo} alt="" style={{width:30,height:30,objectFit:'contain',borderRadius:8}}/>:<span style={{width:30,height:30,borderRadius:8,background:config.couleur,color:'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>R</span>}{config.nom}</div><div style={{display:'flex',gap:12,fontSize:10,color:'#68756d'}}><span>Accueil</span><span>Catalogue</span><span>Contact</span><span>🛒</span></div></div>{config.sections.map((s,i)=><div key={`${s}-${i}`} onClick={()=>setSelected(s)} style={{outline:selected===s?'2px solid '+config.couleur:'none',outlineOffset:'-2px',cursor:'pointer'}}><PreviewSection type={s}/></div>)}</div></div>
      <div className={`rv-builder-panel ${ongletBuilder==='reglages'?'active':''}`} style={{...cardStyle,padding:14,boxShadow:'none'}}><div style={{fontSize:12.5,fontWeight:950,color:'#17241d',marginBottom:12}}>⚙️ Réglages</div><label style={labelStyle}>Nom de la boutique<input style={fieldStyle} value={config.nom} onChange={e=>update('nom',e.target.value)}/></label><label style={labelStyle}>Couleur<div style={{display:'flex',gap:7}}><input type="color" value={config.couleur} onChange={e=>update('couleur',e.target.value)} style={{width:42,height:38,border:0,padding:0}}/><input style={{...fieldStyle,flex:1}} value={config.couleur} onChange={e=>update('couleur',e.target.value)}/></div></label><label style={labelStyle}>Description<textarea style={{...fieldStyle,resize:'vertical'}} rows={3} value={config.description} onChange={e=>update('description',e.target.value)}/></label>{config.logo&&<img src={config.logo} alt="" style={{width:54,height:54,objectFit:'contain',borderRadius:9,border:'1px solid #e2e9e3',marginBottom:8}}/>}<FileButton kind="logo" label="Télécharger / changer le logo"/><div style={{borderTop:'1px solid #edf1ee',margin:'13px 0',paddingTop:13}}><div style={{fontSize:11,fontWeight:900,color:'#344239',marginBottom:9}}>Section sélectionnée</div><div style={{fontSize:12,fontWeight:900,color:'#16231c'}}>{sectionCatalog[selected]?.icon} {sectionCatalog[selected]?.label||selected}</div><div style={{fontSize:10.5,color:'#7b867f',lineHeight:1.45,margin:'4px 0 11px'}}>{sectionCatalog[selected]?.description}</div><Editor/></div><div style={{borderTop:'1px solid #edf1ee',paddingTop:12,marginTop:12,fontSize:10.5,color:'#748078',lineHeight:1.5}}>💡 Les produits et collections viennent de ton espace RecuVente. L’import CSV Shopify reste disponible dans « Produits ». Les images du Store Builder sont envoyées dans le stockage boutique. Pour le Journal d'audit, le Pixel Facebook, la Marque blanche et les réseaux sociaux, utilise "⚙️ Paramètres avancés" en haut.</div></div>
    </div>
  </div>;
}

function WorkspaceDashboard({ workspace, session, subscription, workspacesDisponibles = [], onChangerEspace, onDemanderAjoutEspace }) {
  const estEcommerce = workspace.activity_type === "cod_ecommerce" || workspace.activity_type === "retail";
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
  const [showCollections, setShowCollections] = useState(false);
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
    await supabase.from("biens_location").insert([{ ...form, workspace_id: workspace.id, prix_jour: Number(form.prix_jour) || 0, caution_suggeree: Number(form.caution_suggeree) || 0 }]);
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
    await supabase.from("logements").insert([{ ...form, workspace_id: workspace.id, loyer_mensuel: Number(form.loyer_mensuel) || 0 }]);
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
    const { error } = await supabase.from("produits").insert([{ nom: form.nom, cout_achat: Number(form.cout_achat) || 0, workspace_id: workspace.id }]);
    if (error) alert("Erreur: " + error.message);
    else await loadProduits();
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
      });
    }

    if (produitsAImporter.length === 0) {
      return { succes: false, importes: 0, ignores, message: "Aucun nouveau produit à importer — tous existent déjà dans ton catalogue." };
    }

    const { error } = await supabase
      .from("produits")
      .upsert(produitsAImporter, { onConflict: "workspace_id,nom", ignoreDuplicates: true });
    if (error) {
      return { succes: false, importes: 0, ignores: 0, message: "Erreur : " + error.message };
    }
    await loadProduits();
    return { succes: true, importes: produitsAImporter.length, ignores };
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
    await supabase.from("produits").update({ prix_vente: Number(prix) || 0 }).eq("id", id);
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
    if (subscription === undefined || subscription === null) return false;
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

  async function activerNotificationsPush() {
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission !== "granted") return;

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("Notifications Push non supportées sur ce navigateur");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const raw = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        [{ workspace_id: workspace.id, user_email: session.user.email, endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth }],
        { onConflict: "endpoint" }
      );
      alert("🔔 Notifications activées, même app fermée !");
    } catch (e) {
      alert("Erreur activation notifications: " + e.message);
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
      .order("created_at", { ascending: false });
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

  const [vue, setVue] = useState("commandes");
  const [datePreset, setDatePreset] = useState("aujourdhui");
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
    }

    const montantDejaPaye = workspace.activity_type === "retail" ? (form.montant_paye === "" ? montantTotal : Number(form.montant_paye)) : 0;
    const payeEnEntier = workspace.activity_type === "retail" ? montantDejaPaye >= montantTotal : false;
    const statutInitial = workspace.activity_type === "retail" ? (payeEnEntier ? "confirmee" : "en_cours") : "en_cours";
    const { error } = await supabase.from("commandes").insert([
      { ...form, montant: montantTotal, montant_paye: montantDejaPaye, workspace_id: workspace.id, statut: statutInitial, confirmed_at: statutInitial === "confirmee" ? new Date().toISOString() : null, confirmed_by: statutInitial === "confirmee" ? session.user.email.split("@")[0] : null },
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

        {(workspace.role === "owner" || workspace.role === "admin") && (
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
        {estEcommerce && (workspace.role === "owner" || workspace.role === "admin") && (
          <button
            onClick={() => setShowCollections(true)}
            style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, textAlign: "left", marginBottom: 3, cursor: "pointer" }}
          >
            📁 Collections
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

      <div style={{ background: "linear-gradient(160deg, #050807 0%, #0A130F 35%, #0F1B16 70%, #1a7a3c 160%)", color: "white", padding: "20px 20px 34px", position: "relative", overflow: "hidden" }}>
        <div className="rv-mesh-blob rv-mesh-1" />
        <div className="rv-mesh-blob rv-mesh-2" />
        <div className="rv-mesh-blob rv-mesh-3" />

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 55, overflow: "hidden", pointerEvents: "none" }}>
          <svg className="rv-wave-1" viewBox="0 0 400 60" preserveAspectRatio="none" style={{ position: "absolute", bottom: -5, width: "200%", height: 45 }}>
            <path d="M0,30 C40,10 80,50 120,30 C160,10 200,50 240,30 C280,10 320,50 360,30 C380,20 390,25 400,30 L400,60 L0,60 Z" fill="rgba(232,146,10,0.4)" />
          </svg>
          <svg className="rv-wave-2" viewBox="0 0 400 60" preserveAspectRatio="none" style={{ position: "absolute", bottom: -8, width: "200%", height: 38 }}>
            <path d="M0,25 C50,45 90,5 140,25 C190,45 230,5 280,25 C330,45 370,5 400,20 L400,60 L0,60 Z" fill="rgba(255,255,255,0.28)" />
          </svg>
          <svg className="rv-wave-3" viewBox="0 0 400 60" preserveAspectRatio="none" style={{ position: "absolute", bottom: -3, width: "200%", height: 32 }}>
            <path d="M0,35 C60,15 100,45 160,25 C220,5 260,45 320,25 C360,10 380,30 400,25 L400,60 L0,60 Z" fill="rgba(248,180,60,0.28)" />
          </svg>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>Espace de</span>
            <span className="rv-livedot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7fd6a3", display: "inline-block", marginLeft: 4 }} />
            <span style={{ fontSize: 9.5, fontWeight: 500, opacity: 0.65 }}>EN DIRECT</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {workspace.role === "owner" && (
                <>
                  <button onClick={() => setShowTeam(true)} className="rv-saas-tabs-mobile" aria-label="Gérer l'équipe" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                    👥
                  </button>
                  <button onClick={() => setShowAbonnement(true)} className="rv-saas-tabs-mobile" aria-label="Mon abonnement" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                    💳
                  </button>
                  {estEcommerce && (
                    <button onClick={() => setShowStoreBuilder(true)} className="rv-saas-tabs-mobile" aria-label="Ma Boutique" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                      🛍️
                    </button>
                  )}
                </>
              )}
              {(workspace.role === "owner" || workspace.role === "admin") && (
                <>
                  {estEcommerce && (
                    <button onClick={() => setShowProduits(true)} className="rv-saas-tabs-mobile" aria-label="Catalogue" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                      📦
                    </button>
                  )}
                  <button onClick={() => setVue("rapprochement")} className="rv-saas-tabs-mobile" aria-label="Rapprochement" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                    🔗
                  </button>
                  <button onClick={() => setVue("score_business")} className="rv-saas-tabs-mobile" aria-label="Score business" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                    🧭
                  </button>
                  {estEcommerce && (
                    <button onClick={() => setVue("simulateur")} className="rv-saas-tabs-mobile" aria-label="Simulateur pub" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                      📊
                    </button>
                  )}
                  <button onClick={() => setVue("validations")} className="rv-saas-tabs-mobile" aria-label="Validations" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                    ✅
                  </button>
                  {workspace.activity_type === "restaurant" && (
                    <button onClick={() => setVue("menu_restaurant")} className="rv-saas-tabs-mobile" aria-label="Menu" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 8px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
                      📋
                    </button>
                  )}
                </>
              )}
              <button onClick={() => supabase.auth.signOut()} aria-label="Déconnexion" style={{ background: "rgba(255,255,255,0.14)", border: "none", color: "white", padding: "6px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                ⏻ Déconnexion
              </button>
            </div>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700 }}>{workspace.name}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
            {workspace.country} · {workspace.currency} · rôle : {workspace.role}
          </div>

          {(workspace.role === "owner" || workspace.role === "admin") && (
            <button
              onClick={onDemanderAjoutEspace}
              className="rv-saas-tabs-mobile"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px dashed rgba(255,255,255,0.4)", borderRadius: 999, padding: "6px 12px", color: "white", fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginTop: 10 }}
            >
              + Ajouter un autre espace
            </button>
          )}

          <button
            onClick={() => setShowAide(true)}
            className="rv-saas-tabs-mobile"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(31,157,110,0.22)", border: "1px solid rgba(154,230,180,0.4)", borderRadius: 999, padding: "6px 12px", color: "#7fd6a3", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginTop: 10, marginLeft: 8 }}
          >
            📖 Comment utiliser RecuVente
          </button>

          {(workspace.role === "owner" || workspace.role === "admin") && workspacesDisponibles.length > 1 && (
            <div className="rv-saas-tabs-mobile" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {workspacesDisponibles.map((w) => (
                <button
                  key={w.id}
                  onClick={() => onChangerEspace(w.id)}
                  style={{ background: w.id === workspace.id ? "white" : "rgba(255,255,255,0.14)", color: w.id === workspace.id ? "#16231F" : "white", border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  {{ cod_ecommerce: "📦", retail: "🏪", location_immobiliere: "🏠" }[w.activity_type] || "🏢"} {w.name}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, perspective: "800px" }}>
            <div className="rv-3d-card" style={{ position: "relative", padding: "14px 16px", borderRadius: 14, background: "linear-gradient(155deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 70%)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 10px 24px rgba(0,0,0,0.2)" }}>
              <div className="rv-glow" style={{ position: "absolute", top: -16, left: -16, width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,146,10,0.35) 0%, rgba(232,146,10,0) 70%)", pointerEvents: "none" }} />
              <div style={{ fontSize: 12, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.04em", position: "relative" }}>Argent récupéré</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 700, color: "#e8920a", marginTop: 4, position: "relative" }}>{caConfirme.toLocaleString("fr-FR")} {workspace.currency}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <div className="rv-glass-card" style={{ flex: 1, minWidth: 0 }}>
              <div className="rv-glass-shine" />
              <div style={{ fontSize: 10.5, opacity: 0.75, position: "relative", minHeight: 28, display: "flex", alignItems: "center" }}>À risque</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, position: "relative" }}>{aRisqueCount}</div>
            </div>
            <div className="rv-glass-card" style={{ flex: 1, minWidth: 0 }}>
              <div className="rv-glass-shine" />
              <div style={{ fontSize: 10.5, opacity: 0.75, position: "relative", minHeight: 28, display: "flex", alignItems: "center" }}>Taux livraison</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, position: "relative" }}>{tauxLivraison}%</div>
            </div>
            <div className="rv-glass-card" style={{ flex: 1, minWidth: 0 }}>
              <div className="rv-glass-shine" />
              <div style={{ fontSize: 10.5, opacity: 0.75, position: "relative", minHeight: 28, display: "flex", alignItems: "center" }}>Total</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, position: "relative" }}>{commandesInRange.length}</div>
            </div>
          </div>

          {(workspace.role === "owner" || workspace.role === "admin") && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => setShowLivreurs(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                🚚 Livreurs
              </button>
              <button onClick={() => setShowClosers(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                🎧 Closers
              </button>
              <button onClick={() => setShowCampagne(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                📣 Campagne
              </button>
            </div>
          )}
        </div>
      </div>

      {(workspace.role === "owner" || workspace.role === "admin") && (
        <ResumeIntelligent
          todoAujourdhui={todoAujourdhui}
          clientsARelancer={clientsARelancer}
          produitStockCritique={produitStockCritique}
          meilleurLivreur={meilleurLivreur}
          beneficeReel={beneficeReel}
          currency={workspace.currency}
          onVoirAujourdhui={() => setVue("aujourdhui")}
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

      {(vue === "commandes" || vue === "compta") && (
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

      {vue === "aujourdhui" && (
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

          {(todoAujourdhui.total > 0 || clientsARelancer.length > 0 || depotsParLivreur.some((l) => l.aDeposer > 0)) && (
            <RadarDesFuitesEtActions
              todoAujourdhui={todoAujourdhui}
              clientsARelancer={clientsARelancer}
              depotsParLivreur={depotsParLivreur}
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

      {!loaded && <div style={{ color: "#8A9089", fontSize: 13 }}>Chargement...</div>}
      {loaded && commandes.length === 0 && (
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 20, textAlign: "center", color: "#8A9089", fontSize: 13 }}>
          Aucune commande. Ajoute la première pour tester.
        </div>
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
              <CommandeCard key={c.id} commande={c} currency={workspace.currency} onStatusChanged={loadCommandes} livreurs={livreurs} closers={closers} onAssignLivreur={assignLivreur} onAssignCloser={assignCloser} onReschedule={reprogrammerCommande} workspace={workspace} confirmateurNom={session.user.email.split("@")[0]} onCelebrate={(montant, client) => { setCelebration({ montant, client }); playCelebrationSound(); setTimeout(() => setCelebration(null), 2600); }} />
            ))}
          </div>
        </div>
      ))}
      </>
      )}

      {vue === "validations" && (
        <ValidationsViewSaas commandes={commandes} currency={workspace.currency} />
      )}

      {vue === "biens_location" && (
        <BiensLocationView
          biensLocation={biensLocation}
          currency={workspace.currency}
          onAdd={addBienLocation}
          onToggleDisponibilite={toggleDisponibiliteBien}
          onDelete={deleteBienLocation}
        />
      )}

      {vue === "logements" && (
        <LogementsView
          logements={logements}
          currency={workspace.currency}
          onAdd={addLogement}
          onToggleDisponibilite={toggleDisponibiliteLogement}
          onDelete={deleteLogement}
        />
      )}

      {vue === "menu_restaurant" && (
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

      {vue === "cuisine" && (
        <CuisineView
          commandes={commandes.filter((c) => c.statut !== "annulee" && c.statut !== "echouee")}
          onChangerStatutCuisine={changerStatutCuisine}
          currency={workspace.currency}
        />
      )}

      {vue === "produits_vue" && (
        <ProduitsViewSaas
          produitsAvecBenefice={produitsAvecBenefice}
          currency={workspace.currency}
          onGererCatalogue={() => setShowProduits(true)}
        />
      )}

      {vue === "clients" && (
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
            {clients.length === 0 && <div style={{ color: "#8A9089", fontSize: 13, textAlign: "center", padding: "30px 0" }}>Aucun client pour l'instant.</div>}
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

      {vue === "recovery" && (
        <RecoveryCenterView
          commandes={commandesRecuperables}
          toutesCommandes={commandes}
          currency={workspace.currency}
          nomEntreprise={workspace.name}
        />
      )}

      {vue === "score_business" && (
        <ScoreBusinessView
          toutesCommandes={commandes}
          beneficeReel={beneficeReel}
          caConfirme={caConfirme}
          currency={workspace.currency}
          depotsParLivreur={depotsParLivreur}
        />
      )}

      {vue === "simulateur" && (
        <SimulateurCampagneView currency={workspace.currency} />
      )}

      {vue === "rapprochement" && (
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
              onClick={() => setVue(t.key)}
              style={{
                flex: 1,
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
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 500 }}>{t.label}</span>
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
      {showTeam && <TeamModal workspace={workspace} onClose={() => setShowTeam(false)} />}
      {showAbonnement && <AbonnementModal workspace={workspace} subscription={subscription} onClose={() => setShowAbonnement(false)} />}
      {showCampagne && <CampagneModalSaas clients={clients} workspace={workspace} onClose={() => setShowCampagne(false)} />}
      {showIntegrations && <IntegrationsModal workspace={workspace} onClose={() => setShowIntegrations(false)} />}
      {showStoreBuilder && (
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
      {showLivreurs && <EquipeModal titre="Livreurs" items={livreurs} onAdd={addLivreur} onDelete={deleteLivreur} onClose={() => setShowLivreurs(false)} avecEmail />}
      {showClosers && <EquipeModal titre="Closers" items={closers} onAdd={addCloser} onDelete={deleteCloser} onClose={() => setShowClosers(false)} avecEmail />}
      {showProduits && <ProduitsModal produits={produits} onAdd={addProduit} onUpdateCout={updateProduitCout} onUpdateFraisImport={updateProduitFraisImport} onUpdateStock={updateProduitStock} onUpdatePrixVente={updateProduitPrixVente} onUpdatePhoto={updateProduitPhoto} onUpdateDescription={updateProduitDescription} onUpdateGalerie={updateProduitGalerie} onUpdateLivraisonBundles={updateProduitLivraisonBundles} quantitesParProduit={quantitesParProduit} onDelete={deleteProduit} currency={workspace.currency} workspaceId={workspace.id} onImportCSV={importerProduitsCSV} onClose={() => setShowProduits(false)} />}
      {showAvis && <AvisModal workspaceId={workspace.id} onClose={() => setShowAvis(false)} />}
      {showCollections && <CollectionsModal workspaceId={workspace.id} produits={produits} onClose={() => setShowCollections(false)} />}
    </div>
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
  const [form, setForm] = useState({ client: "", tel: "", produit: "", montant: "", zone: "", mode_vente: estRetail ? "sur_place" : "livraison", montant_paye: "", ville_expedition: "" });
  const [modeRapide, setModeRapide] = useState(false);
  const [logementId, setLogementId] = useState("");
  function selectionnerLogement(id) {
    setLogementId(id);
    const l = logements.find((x) => x.id === id);
    if (l) setForm((f) => ({ ...f, produit: l.nom, zone: l.adresse || "", montant: String(l.loyer_mensuel) }));
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
              <input
                placeholder="Ville de destination"
                value={form.ville_expedition}
                onChange={(e) => setForm({ ...form, ville_expedition: e.target.value })}
                style={inputStyle}
              />
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

        {champs.map((f) => (
          <input
            key={f}
            placeholder={f === "montant" ? (estLocation ? `Loyer mensuel (${currency})` : `Montant total (${currency})`) : f === "produit" ? (estLocation ? "Logement (ex: Appartement 2)" : estRetail ? "Produit vendu" : "Produit") : f === "zone" ? (estLocation ? "Adresse du logement" : f) : f === "client" ? (estLocation ? "Nom du locataire" : "Nom du client") : f}
            value={form[f]}
            onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            type={f === "montant" ? "number" : "text"}
            min={f === "montant" ? "1" : undefined}
            style={inputStyle}
          />
        ))}
        {form.montant && !montantValide && (
          <div style={{ color: "#D64933", fontSize: 12, marginTop: -6, marginBottom: 10 }}>Le montant doit être supérieur à 0.</div>
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

        <button onClick={() => canSubmit && montantPayeValide && onAdd(form)} disabled={!canSubmit || !montantPayeValide} style={btnStyle}>
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

function TeamModal({ workspace, onClose }) {
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

  const roleLabels = { owner: "Propriétaire", admin: "Admin", closer: "Closer", livreur: "Livreur", comptable: "Comptable" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
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
              <div key={m.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                  <div style={{ fontSize: 11.5, color: "#6B7168" }}>{roleLabels[m.role] || m.role}</div>
                </div>
                {m.role !== "owner" && (
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
    { key: "admin", label: "Admin — gestion opérationnelle" },
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
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ action: "invite", workspaceId: workspace.id, email, password, role }),
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
    const res = await fetch("/api/admin-workspaces", {
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
    const res = await fetch("/api/toggle-workspace-status", {
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
                      href={`https://wa.me/${String(ws.whatsappNumber).replace(/\D/g, "").replace(/^0/, "225")}`}
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
};

function CommandeCard({ commande, currency, onStatusChanged, livreurs = [], closers = [], onAssignLivreur, onAssignCloser, onReschedule, workspace, confirmateurNom, onCelebrate }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAppel, setShowAppel] = useState(false);
  const [dateRappelChoisie, setDateRappelChoisie] = useState("");
  const [showPaiement, setShowPaiement] = useState(false);
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

          {workspace?.activity_type === "retail" && Number(commande.montant_paye || 0) < Number(commande.montant) && (
            <button
              onClick={enregistrerPaiement}
              disabled={loading}
              style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10 }}
            >
              💰 Enregistrer un paiement (solde : {(Number(commande.montant) - Number(commande.montant_paye || 0)).toLocaleString("fr-FR")} {currency})
            </button>
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

function EquipeModal({ titre, items, onAdd, onDelete, onClose, avecEmail }) {
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
  const [initialise, setInitialise] = useState(false);

  useEffect(() => {
    if (editeurRef.current && !initialise) {
      editeurRef.current.innerHTML = valeur || "";
      setInitialise(true);
    }
  }, [valeur, initialise]);

  function appliquer(commande, arg) {
    editeurRef.current.focus();
    document.execCommand(commande, false, arg);
    onChange(editeurRef.current.innerHTML);
  }

  async function inserer_image(fichier) {
    if (!fichier) return;
    if (fichier.size > 5 * 1024 * 1024) {
      alert("L'image est trop lourde (max 5 Mo). Choisis une image plus légère.");
      return;
    }
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
    editeurRef.current.focus();
    document.execCommand("insertHTML", false, `<img src="${data.publicUrl}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" />`);
    onChange(editeurRef.current.innerHTML);
    setEnvoiImage(false);
  }

  return (
    <div style={{ border: "1px solid #DDD8CC", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 4, padding: "6px 8px", background: "#FAFAF7", borderBottom: "1px solid #ECE8DC", flexWrap: "wrap" }}>
        <button type="button" onClick={() => appliquer("bold")} style={boutonEditeurStyle}><b>G</b></button>
        <button type="button" onClick={() => appliquer("italic")} style={boutonEditeurStyle}><i>I</i></button>
        <button type="button" onClick={() => appliquer("insertUnorderedList")} style={boutonEditeurStyle}>• Liste</button>
        <label style={{ ...boutonEditeurStyle, cursor: "pointer" }}>
          {envoiImage ? "Envoi..." : "🖼️ Image"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => inserer_image(e.target.files?.[0])} />
        </label>
      </div>
      <div
        ref={editeurRef}
        contentEditable
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        data-placeholder={placeholder}
        style={{ minHeight: 90, padding: "10px 12px", fontSize: 13, lineHeight: 1.5, outline: "none" }}
        className="rv-editeur-riche"
      />
      <style>{`.rv-editeur-riche:empty:before { content: attr(data-placeholder); color: #8A9089; }`}</style>
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
    });
  }
  return resultat;
}

function CollectionsModal({ workspaceId, produits, onClose }) {
  const [collections, setCollections] = useState(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [collectionOuverte, setCollectionOuverte] = useState(null);
  const [produitsDeLaCollection, setProduitsDeLaCollection] = useState(new Set());

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

            {collections === null && <div style={{ color: "#8A9089", fontSize: 13 }}>Chargement...</div>}
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

function AvisModal({ workspaceId, onClose }) {
  const [avis, setAvis] = useState(null);
  const [produitsMap, setProduitsMap] = useState({});

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

  async function approuver(id) {
    await supabase.from("avis_produits").update({ approuve: true }).eq("id", id);
    await charger();
  }

  async function supprimer(id) {
    await supabase.from("avis_produits").delete().eq("id", id);
    await charger();
  }

  const enAttente = (avis || []).filter((a) => !a.approuve);
  const approuves = (avis || []).filter((a) => a.approuve);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>⭐ Avis clients</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {avis === null && <div style={{ color: "#8A9089", fontSize: 13 }}>Chargement...</div>}

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
              <button onClick={() => supprimer(a.id)} style={{ marginTop: 6, background: "none", border: "none", color: "#D64933", fontSize: 11.5, cursor: "pointer", padding: 0 }}>🗑️ Retirer</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProduitsModal({ produits, onAdd, onUpdateCout, onUpdateFraisImport, onUpdateStock, onUpdatePrixVente, onUpdatePhoto, onUpdateDescription, onUpdateGalerie, onUpdateLivraisonBundles, quantitesParProduit, onDelete, currency, workspaceId, onClose, onImportCSV }) {
  const [nom, setNom] = useState("");
  const [cout, setCout] = useState("");
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editFraisImportId, setEditFraisImportId] = useState(null);
  const [editFraisImportValue, setEditFraisImportValue] = useState("");
  const [editStockId, setEditStockId] = useState(null);
  const [editStockValue, setEditStockValue] = useState("");
  const [editPrixId, setEditPrixId] = useState(null);
  const [editPrixValue, setEditPrixValue] = useState("");
  const [editPhotoId, setEditPhotoId] = useState(null);
  const [editPhotoValue, setEditPhotoValue] = useState("");
  const [editDescId, setEditDescId] = useState(null);
  const [editLivraisonId, setEditLivraisonId] = useState(null);
  const [editLivraisonValeurs, setEditLivraisonValeurs] = useState({ livraison_gratuite: false, frais_livraison_produit: "", frais_expedition_produit: "", bundles: [] });
  const [editDescValue, setEditDescValue] = useState("");
  const [photoEnvoiId, setPhotoEnvoiId] = useState(null);
  const [galerieEnvoiId, setGalerieEnvoiId] = useState(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [resultatImport, setResultatImport] = useState(null);

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
    if (!nom.trim()) return;
    await onAdd({ nom: nom.trim(), cout_achat: cout });
    setNom("");
    setCout("");
  }

  const totalStock = produits.reduce((s, p) => s + Number(p.stock_initial || 0), 0);
  const totalVendu = produits.reduce((s, p) => s + (quantitesParProduit[p.nom]?.commandees || 0), 0);
  const totalLivre = produits.reduce((s, p) => s + (quantitesParProduit[p.nom]?.livrees || 0), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Catalogue & Stock</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#6B7168", marginBottom: 14 }}>
          Le nom doit correspondre exactement à celui utilisé dans tes commandes. Renseigne le stock acheté pour suivre ce qu'il reste.
        </div>

        {produits.length > 0 && (
          <div style={{ background: "#16231F", borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>En stock</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "white" }}>{totalStock}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Engagé</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#e8920a" }}>{totalVendu}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Livré</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "#7fd6a3" }}>{totalLivre}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Restant</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: "white" }}>{totalStock - totalVendu}</div>
            </div>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13, color: "#3B6D11", cursor: importEnCours ? "default" : "pointer", marginBottom: 8, boxSizing: "border-box" }}>
          {importEnCours ? "Import en cours..." : "📥 Importer un catalogue (CSV Shopify ou autre)"}
          <input
            type="file"
            accept=".csv"
            style={{ display: "none" }}
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
                  setResultatImport({ succes: false, message: "Aucun produit reconnu dans ce fichier. Vérifie qu'il contient bien une colonne \"Title\" (Shopify) ou \"nom\"." });
                } else {
                  const resultat = await onImportCSV(mappe);
                  if (resultat.succes) {
                    setResultatImport({ succes: true, message: `${resultat.importes} produit${resultat.importes > 1 ? "s" : ""} importé${resultat.importes > 1 ? "s" : ""}.${resultat.ignores > 0 ? ` ${resultat.ignores} ignoré${resultat.ignores > 1 ? "s" : ""} (déjà présents dans ton catalogue).` : ""}` });
                  } else {
                    setResultatImport({ succes: false, message: resultat.message || "Erreur lors de l'import, réessaie." });
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
          <div style={{ background: resultatImport.succes ? "#EAF3DE" : "#FBEAE6", border: `1px solid ${resultatImport.succes ? "#C7DDA3" : "#F0B8AC"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: resultatImport.succes ? "#3B6D11" : "#D64933" }}>
            {resultatImport.succes ? "✅ " : "⚠️ "}{resultatImport.message}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#8A9089", marginTop: -4, marginBottom: 14 }}>
          Le coût d'achat sera à 0 par défaut après import — pense à le renseigner ensuite pour chaque produit.
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input placeholder="Nom du produit" value={nom} onChange={(e) => setNom(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 2 }} />
          <input placeholder="Coût" type="number" value={cout} onChange={(e) => setCout(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
          <button onClick={ajouter} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>+</button>
        </div>

        {produits.length === 0 && <div style={{ color: "#8A9089", fontSize: 13 }}>Aucun produit dans le catalogue.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {produits.map((p) => {
            const q = quantitesParProduit[p.nom] || { commandees: 0, livrees: 0 };
            const stock = Number(p.stock_initial || 0);
            const restant = stock - q.commandees;
            return (
              <div key={p.id} style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
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

                    {editFraisImportId === p.id ? (
                      <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                        <input type="number" value={editFraisImportValue} onChange={(e) => setEditFraisImportValue(e.target.value)} autoFocus style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                        <button onClick={() => { onUpdateFraisImport(p.id, editFraisImportValue); setEditFraisImportId(null); }} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "0 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>OK</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditFraisImportId(p.id); setEditFraisImportValue(String(p.frais_import_unitaire || 0)); }} style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 12, color: "#8A6412", textDecoration: "underline", cursor: "pointer" }}>
                        🚢 Transport + douane : {Number(p.frais_import_unitaire || 0).toLocaleString("fr-FR")} {currency} / pièce
                      </button>
                    )}
                    {editPrixId === p.id ? (
                      <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                        <input type="number" value={editPrixValue} onChange={(e) => setEditPrixValue(e.target.value)} autoFocus placeholder="Prix de vente" style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                        <button onClick={() => { onUpdatePrixVente(p.id, editPrixValue); setEditPrixId(null); }} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "0 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>OK</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditPrixId(p.id); setEditPrixValue(String(p.prix_vente || "")); }} style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 12, color: p.prix_vente ? "#1a7a3c" : "#D64933", textDecoration: "underline", cursor: "pointer" }}>
                        {p.prix_vente ? `Prix de vente : ${Number(p.prix_vente).toLocaleString("fr-FR")} ${currency}` : "⚠️ Ajouter un prix de vente (pour le catalogue)"}
                      </button>
                    )}
                    {photoEnvoiId === p.id ? (
                      <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 4 }}>Envoi de la photo...</div>
                    ) : (
                      <label style={{ display: "inline-block", marginTop: 2, fontSize: 12, color: "#6B7168", textDecoration: "underline", cursor: "pointer" }}>
                        {p.photo_url ? "📷 Changer la photo principale" : "📷 Ajouter une photo principale (optionnel)"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => envoyerPhoto(p.id, e.target.files?.[0])}
                        />
                      </label>
                    )}

                    <div style={{ marginTop: 8 }}>
                      {(p.photos_galerie || []).length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          {p.photos_galerie.map((url) => (
                            <div key={url} style={{ position: "relative" }}>
                              <img src={url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", border: "1px solid #DDD8CC" }} />
                              <button
                                onClick={() => retirerPhotoGalerie(p, url)}
                                style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: "#D64933", color: "white", border: "none", fontSize: 10, lineHeight: 1, cursor: "pointer" }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label style={{ display: "inline-block", fontSize: 11.5, color: "#6B7168", textDecoration: "underline", cursor: "pointer" }}>
                        {galerieEnvoiId === p.id ? "Envoi..." : `🖼️ Ajouter une photo à la galerie (${(p.photos_galerie || []).length}/6)`}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          disabled={(p.photos_galerie || []).length >= 6}
                          onChange={(e) => ajouterPhotoGalerie(p, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {editDescId === p.id ? (
                      <div style={{ marginTop: 6 }}>
                        <EditeurRiche
                          valeur={editDescValue}
                          onChange={setEditDescValue}
                          workspaceId={workspaceId}
                          placeholder="Description visible par les clients en boutique"
                        />
                        <button onClick={() => { onUpdateDescription(p.id, editDescValue); setEditDescId(null); }} style={{ marginTop: 6, background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Enregistrer</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditDescId(p.id); setEditDescValue(p.description || ""); }} style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 4, fontSize: 12, color: p.description ? "#6B7168" : "#D64933", textDecoration: "underline", cursor: "pointer", textAlign: "left" }}>
                        {p.description ? "📝 " + p.description.replace(/<[^>]*>/g, " ").trim().slice(0, 40) + "..." : "📝 Ajouter une description (pour la boutique)"}
                      </button>
                    )}
                    <button onClick={() => { setEditLivraisonId(editLivraisonId === p.id ? null : p.id); setEditLivraisonValeurs({ livraison_gratuite: !!p.livraison_gratuite, frais_livraison_produit: p.frais_livraison_produit ?? "", frais_expedition_produit: p.frais_expedition_produit ?? "", bundles: Array.isArray(p.bundles) ? p.bundles : [] }); }} style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 6, fontSize: 12, color: (p.livraison_gratuite || p.frais_livraison_produit != null || (p.bundles || []).length > 0) ? "#1a7a3c" : "#6B7168", textDecoration: "underline", cursor: "pointer", textAlign: "left" }}>
                      🚚 Livraison & 🎁 Bundles{p.livraison_gratuite ? " — Gratuite" : ""}{(p.bundles || []).length > 0 ? ` — ${p.bundles.length} bundle(s)` : ""}
                    </button>
                  </div>
                  <button onClick={() => onDelete(p.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>🗑️</button>
                </div>

                {editLivraisonId === p.id && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ECE8DC" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                      <input type="checkbox" checked={editLivraisonValeurs.livraison_gratuite} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, livraison_gratuite: e.target.checked }))} />
                      🎁 Livraison gratuite pour ce produit
                    </label>
                    {!editLivraisonValeurs.livraison_gratuite && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Frais livraison locale ({currency})
                          <input type="number" placeholder="Frais boutique par défaut" value={editLivraisonValeurs.frais_livraison_produit} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, frais_livraison_produit: e.target.value }))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, marginTop: 3, boxSizing: "border-box" }} />
                        </label>
                        <label style={{ fontSize: 10.5, color: "#8A9089" }}>Frais expédition ({currency})
                          <input type="number" placeholder="Frais boutique par défaut" value={editLivraisonValeurs.frais_expedition_produit} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, frais_expedition_produit: e.target.value }))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12, marginTop: 3, boxSizing: "border-box" }} />
                        </label>
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: "#8A9089", marginBottom: 8 }}>Laisse vide pour utiliser les frais généraux de la boutique.</div>

                    <div style={{ fontSize: 11, fontWeight: 700, color: "#16231F", marginBottom: 6 }}>🎁 Bundles de ce produit</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                      {editLivraisonValeurs.bundles.map((b, i) => (
                        <div key={b.id || i} style={{ border: "1px solid #ECE8DC", borderRadius: 8, padding: 8 }}>
                          <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                            <input placeholder="Nom (ex: Pack x2)" value={b.label} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                            <button onClick={() => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer" }}>×</button>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                            <input type="number" min="1" placeholder="Qté" value={b.qty} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x) }))} style={{ width: 60, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                            <select value={b.mode || "pourcentage"} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.map((x, j) => j === i ? { ...x, mode: e.target.value } : x) }))} style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 11.5, background: "white" }}>
                              <option value="pourcentage">Remise %</option>
                              <option value="prix_fixe">Prix fixe</option>
                            </select>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {(b.mode || "pourcentage") === "prix_fixe" ? (
                              <input type="number" min="0" placeholder={`Prix total pour ${b.qty} pièce(s) (${currency})`} value={b.prix_fixe ?? ""} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.map((x, j) => j === i ? { ...x, prix_fixe: e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0) } : x) }))} style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                            ) : (
                              <input type="number" min="0" max="90" placeholder="Remise %" value={b.discount ?? ""} onChange={(e) => setEditLivraisonValeurs((v) => ({ ...v, bundles: v.bundles.map((x, j) => j === i ? { ...x, discount: Math.min(90, Math.max(0, Number(e.target.value) || 0)) } : x) }))} style={{ flex: 1, padding: "5px 7px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 11.5 }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setEditLivraisonValeurs((v) => ({ ...v, bundles: [...v.bundles, { id: "b" + Date.now(), qty: (v.bundles.length || 0) + 2, label: "Pack x" + ((v.bundles.length || 0) + 2), mode: "pourcentage", discount: 10 }] }))} style={{ width: "100%", border: "1px dashed #9fb5a5", background: "#f7faf7", borderRadius: 8, padding: 7, fontSize: 11, fontWeight: 700, color: "#1a7a3c", cursor: "pointer", marginBottom: 8 }}>＋ Ajouter un bundle</button>

                    <button onClick={() => { onUpdateLivraisonBundles(p.id, { livraison_gratuite: editLivraisonValeurs.livraison_gratuite, frais_livraison_produit: editLivraisonValeurs.frais_livraison_produit === "" ? null : Number(editLivraisonValeurs.frais_livraison_produit), frais_expedition_produit: editLivraisonValeurs.frais_expedition_produit === "" ? null : Number(editLivraisonValeurs.frais_expedition_produit), bundles: editLivraisonValeurs.bundles }); setEditLivraisonId(null); }} style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Enregistrer
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ECE8DC" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, color: "#8A9089", textTransform: "uppercase" }}>Stock acheté</span>
                    {editStockId === p.id ? (
                      <div style={{ display: "flex", gap: 5 }}>
                        <input type="number" value={editStockValue} onChange={(e) => setEditStockValue(e.target.value)} autoFocus style={{ width: 65, padding: "4px 6px", borderRadius: 6, border: "1px solid #DDD8CC", fontSize: 12 }} />
                        <button onClick={() => { onUpdateStock(p.id, editStockValue); setEditStockId(null); }} style={{ background: "#1a7a3c", color: "white", border: "none", borderRadius: 6, padding: "0 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>OK</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditStockId(p.id); setEditStockValue(String(p.stock_initial || 0)); }} style={{ background: "none", border: "none", padding: 0, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: "#16231F", textDecoration: "underline", cursor: "pointer" }}>
                        {stock} pièces
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <div style={{ flex: 1, background: "#FBF3E3", borderRadius: 7, padding: "5px 7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "#8A6412" }}>Engagé</div>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: "#8A6412" }}>{q.commandees}</div>
                    </div>
                    <div style={{ flex: 1, background: "#EAF7F1", borderRadius: 7, padding: "5px 7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: "#1F9D6E" }}>Livré</div>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: "#1F9D6E" }}>{q.livrees}</div>
                    </div>
                    <div style={{ flex: 1, background: restant <= 5 && stock > 0 ? "#FBEAE6" : "#EAF3DE", borderRadius: 7, padding: "5px 7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9.5, color: restant <= 5 && stock > 0 ? "#D64933" : "#3B6D11" }}>Restant</div>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: restant <= 5 && stock > 0 ? "#D64933" : "#3B6D11" }}>{stock > 0 ? restant : "—"}</div>
                    </div>
                  </div>
                  {stock > 0 && restant <= 5 && restant > 0 && (
                    <div style={{ fontSize: 10, color: "#D64933", marginTop: 4, fontWeight: 600 }}>⚠️ Stock bientôt épuisé</div>
                  )}
                  {stock > 0 && restant <= 0 && (
                    <div style={{ fontSize: 10, color: "#D64933", marginTop: 4, fontWeight: 600 }}>🔴 Stock épuisé</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

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

function BiensLocationView({ biensLocation, currency, onAdd, onToggleDisponibilite, onDelete }) {
  const [form, setForm] = useState({ nom: "", categorie: "Véhicule", prix_jour: "", caution_suggeree: "", description: "" });

  const nbDisponibles = biensLocation.filter((b) => b.disponible).length;
  const nbLoues = biensLocation.length - nbDisponibles;

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>Véhicules & Matériel</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 16 }}>
        {nbDisponibles} disponible{nbDisponibles > 1 ? "s" : ""} · {nbLoues} actuellement loué{nbLoues > 1 ? "s" : ""}
      </div>

      <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>+ Ajouter un bien</div>
        <input placeholder="Nom (ex: Toyota Hilux, Perceuse Bosch)" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <input placeholder="Catégorie (ex: Véhicule, Moto, Matériel BTP)" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input placeholder={`Prix / jour (${currency})`} type="number" value={form.prix_jour} onChange={(e) => setForm({ ...form, prix_jour: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
          <input placeholder={`Caution suggérée (${currency})`} type="number" value={form.caution_suggeree} onChange={(e) => setForm({ ...form, caution_suggeree: e.target.value })} style={{ flex: 1, padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <button
          onClick={() => { if (!form.nom.trim() || !form.prix_jour) return; onAdd(form); setForm({ nom: "", categorie: form.categorie, prix_jour: "", caution_suggeree: "", description: "" }); }}
          style={{ width: "100%", background: "#1a7a3c", color: "white", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Ajouter au catalogue
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {biensLocation.map((b) => (
          <div key={b.id} style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.nom}</div>
                <div style={{ fontSize: 11.5, color: "#8A9089", marginTop: 2 }}>{b.categorie}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: "#1a7a3c", marginTop: 6 }}>
                  {Number(b.prix_jour).toLocaleString("fr-FR")} {currency} / jour
                </div>
                {Number(b.caution_suggeree) > 0 && (
                  <div style={{ fontSize: 11, color: "#8A6412", marginTop: 2 }}>Caution suggérée : {Number(b.caution_suggeree).toLocaleString("fr-FR")} {currency}</div>
                )}
              </div>
              <button onClick={() => onDelete(b.id)} style={{ background: "none", border: "none", color: "#D64933", cursor: "pointer", fontSize: 13 }}>🗑️</button>
            </div>
            <button
              onClick={() => onToggleDisponibilite(b.id, b.disponible)}
              style={{ width: "100%", marginTop: 10, background: b.disponible ? "#EAF3DE" : "#FBEAE6", color: b.disponible ? "#3B6D11" : "#D64933", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {b.disponible ? "✅ Disponible" : "🚫 Actuellement loué / indisponible"}
            </button>
          </div>
        ))}
        {biensLocation.length === 0 && <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13, padding: "30px 0" }}>Aucun bien pour l'instant.</div>}
      </div>
    </div>
  );
}

function LogementsView({ logements, currency, onAdd, onToggleDisponibilite, onDelete }) {
  const [form, setForm] = useState({ nom: "", adresse: "", loyer_mensuel: "", description: "" });

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
        <input placeholder={`Loyer mensuel (${currency})`} type="number" value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #DDD8CC", fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />
        <button
          onClick={() => { if (!form.nom.trim() || !form.loyer_mensuel) return; onAdd(form); setForm({ nom: "", adresse: "", loyer_mensuel: "", description: "" }); }}
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

function ScoreBusinessView({ toutesCommandes, beneficeReel, caConfirme, currency, depotsParLivreur }) {
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

  return (
    <div style={{ padding: "20px 20px 8px" }}>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4 }}>🧭 Score Business</div>
      <div style={{ fontSize: 13, color: "#6B7168", marginBottom: 20 }}>
        Le résumé exécutif de ton activité — 6 indicateurs combinés en un seul chiffre.
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
    const telPropre = String(c.tel || "").replace(/\D/g, "").replace(/^0/, "225");
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
    supabase.from("journal_audit").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(30).then(({ data, error }) => {
      if (error) setErreurJournalAudit(error.message);
      setJournalAudit(data || []);
    });
  }, [afficherJournalAudit]);

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
  });
  const [envoiEnCoursType, setEnvoiEnCoursType] = useState(null);
  const [pixelId, setPixelId] = useState(workspace.facebook_pixel_id || "");
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
  const [savingDomaineMeta, setSavingDomaineMeta] = useState(false);
  const [domaineMetaSaved, setDomaineMetaSaved] = useState(false);

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
  const lienCatalogue = `${window.location.origin}/?catalogue=${workspace.id}`;

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
            Qui a fait quoi, et quand — les 30 dernières actions importantes.
          </div>
          <button
            onClick={() => setAfficherJournalAudit(!afficherJournalAudit)}
            style={{ background: "#8A6412", border: "none", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "white" }}
          >
            {afficherJournalAudit ? "Masquer ▲" : "Voir le journal ▼"}
          </button>

          {afficherJournalAudit && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
              {erreurJournalAudit && <div style={{ fontSize: 12, color: "#D64933", background: "#FBEAE6", borderRadius: 8, padding: "8px 12px" }}>Erreur : {erreurJournalAudit}</div>}
              {journalAudit === null && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
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

          <button
            onClick={async () => {
              await supabase.from("workspaces").update({
                frais_livraison: Number(personnalisation.frais_livraison) || 0,
                frais_expedition: Number(personnalisation.frais_expedition) || 0,
                label_livraison_locale: personnalisation.label_livraison_locale.trim() || "Livraison locale",
                label_livraison_expedition: personnalisation.label_livraison_expedition.trim() || "Autre ville",
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
