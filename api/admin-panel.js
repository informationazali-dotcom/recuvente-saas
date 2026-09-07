import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const RECUVENTE_ADMIN_EMAIL = process.env.RECUVENTE_ADMIN_EMAIL;

async function verifierAdmin(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Non authentifié" });
    return null;
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Session invalide" });
    return null;
  }
  if (!RECUVENTE_ADMIN_EMAIL || userData.user.email.trim().toLowerCase() !== RECUVENTE_ADMIN_EMAIL.trim().toLowerCase()) {
    res.status(403).json({
      error: "Accès réservé à l'administrateur RecuVente",
      debug: `Connecté avec: "${userData.user.email}" — Admin attendu: "${RECUVENTE_ADMIN_EMAIL || "(non configuré)"}"`,
    });
    return null;
  }
  return userData.user;
}

// ===== GET : données du panneau admin (fusion de admin-workspaces.js) =====
async function gererGET(req, res) {
  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, country, currency, owner_id, created_at, whatsapp_number")
    .order("created_at", { ascending: false });
  if (wsError) return res.status(400).json({ error: wsError.message });

  const { data: subscriptions } = await supabaseAdmin
    .from("subscriptions")
    .select("workspace_id, status, trial_ends_at, plan_id, subscription_plans(nom, prix, devise)");
  const { data: allMembers } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id");

  const enrichis = await Promise.all(
    workspaces.map(async (ws) => {
      const sub = subscriptions?.find((s) => s.workspace_id === ws.id) || null;
      const nbMembres = allMembers?.filter((m) => m.workspace_id === ws.id).length || 0;
      const { data: owner } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
      return {
        ...ws,
        ownerEmail: owner?.user?.email || "?",
        whatsappNumber: ws.whatsapp_number || null,
        subscription: sub,
        nbMembres,
      };
    })
  );

  const mrr = enrichis.reduce((sum, ws) => {
    if (ws.subscription?.status === "active" && ws.subscription.subscription_plans) {
      return sum + Number(ws.subscription.subscription_plans.prix);
    }
    return sum;
  }, 0);
  const enEssai = enrichis.filter((w) => w.subscription?.status === "trial").length;
  const actifs = enrichis.filter((w) => w.subscription?.status === "active").length;

  const { data: demandes } = await supabaseAdmin
    .from("upgrade_requests")
    .select("id, workspace_id, plan_id, statut, created_at, subscription_plans(nom, prix, devise)")
    .eq("statut", "en_attente")
    .order("created_at", { ascending: true });
  const demandesEnrichies = (demandes || []).map((d) => ({
    ...d,
    workspaceName: enrichis.find((w) => w.id === d.workspace_id)?.name || "?",
  }));

  return res.status(200).json({ workspaces: enrichis, mrr, enEssai, actifs, total: enrichis.length, demandes: demandesEnrichies });
}

// ===== POST : suspendre / réactiver / supprimer (fusion de toggle-workspace-status.js) =====
async function gererPOST(req, res) {
  const { workspaceId, action } = req.body;
  if (!workspaceId || !["suspendre", "reactiver", "supprimer"].includes(action)) {
    return res.status(400).json({ error: "Paramètres invalides" });
  }

  if (action === "supprimer") {
    const { data: commandesIds } = await supabaseAdmin.from("commandes").select("id").eq("workspace_id", workspaceId);
    const ids = (commandesIds || []).map((c) => c.id);
    if (ids.length > 0) {
      await supabaseAdmin.from("relances").delete().in("commande_id", ids);
    }
    await supabaseAdmin.from("commandes").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("livreurs").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("closers").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("produits").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("push_subscriptions").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("upgrade_requests").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("subscriptions").delete().eq("workspace_id", workspaceId);
    await supabaseAdmin.from("workspace_members").delete().eq("workspace_id", workspaceId);
    const { error: deleteError } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });
    return res.status(200).json({ success: true, supprime: true });
  }

  const nouveauStatut = action === "suspendre" ? "suspended" : "active";
  const { data: existant } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (existant) {
    await supabaseAdmin.from("subscriptions").update({ status: nouveauStatut }).eq("workspace_id", workspaceId);
  } else {
    await supabaseAdmin.from("subscriptions").insert([{ workspace_id: workspaceId, status: nouveauStatut }]);
  }
  return res.status(200).json({ success: true, status: nouveauStatut });
}

// ===== POST "ceo_ask" : premier agent réel du AI Company OS (Phase A) =====
// Volontairement scope étroit et honnête : lit UNIQUEMENT prospects_business (ta donnée,
// sans ambiguïté de propriétaire — contrairement à "commandes" qui est multi-tenant SaaS et
// nécessiterait de connaître ton workspace_id précis, que je n'ai pas). Toute réponse est
// bâtie sur des chiffres réels requêtés à l'instant, jamais inventés par le modèle.
async function gererCeoAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question manquante" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });
  }

  const { data: prospects, error: prospectsError } = await supabaseAdmin
    .from("prospects_business")
    .select("statut, score, strategic_priority, source, lead_type, created_at")
    .eq("proprietaire_email", "oulipaiexpress@gmail.com");
  if (prospectsError) return res.status(400).json({ error: prospectsError.message });

  const total = prospects.length;
  const parStatut = {};
  prospects.forEach((p) => { parStatut[p.statut] = (parStatut[p.statut] || 0) + 1; });
  const strategiques = prospects.filter((p) => p.strategic_priority).length;
  const scoreMoyen = total > 0 ? Math.round(prospects.reduce((s, p) => s + (p.score || 0), 0) / total) : 0;
  const septDerniersJours = prospects.filter((p) => new Date(p.created_at) > new Date(Date.now() - 7 * 24 * 3600 * 1000)).length;

  const contexteReel = {
    total_prospects: total,
    repartition_par_statut: parStatut,
    prospects_strategiques: strategiques,
    score_moyen: scoreMoyen,
    nouveaux_7_derniers_jours: septDerniersJours,
  };

  const prompt = `Tu es le CEO IA de RecuVente Business (l'activité de services de Koffi, pas le SaaS RecuVente lui-même). Voici les VRAIES données actuelles de son pipeline de prospects, extraites à l'instant de sa base :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, de façon directe et actionnable, UNIQUEMENT à partir des chiffres ci-dessus. Si la question porte sur quelque chose que ces données ne couvrent pas (finances, publicité, projets...), dis clairement "Information non disponible — cette donnée n'est pas encore connectée à l'agent CEO" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });

  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  // Journal des actions (§27) — traçabilité, pas d'exécution ici donc validation_required=false
  await supabaseAdmin.from("ai_action_logs").insert([{
    agent_key: "ceo",
    action: "ceo_ask",
    reason: question,
    input_data: contexteReel,
    result_data: { reponse: reponseTexte },
    validation_required: false,
    approved_by: user.email,
  }]);

  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "sales_ask" : agent Sales/CRO IA (§9) — analyse le pipeline réel =====
async function gererSalesAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question manquante" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });
  }

  const { data: prospects, error: prospectsError } = await supabaseAdmin
    .from("prospects_business")
    .select("nom, entreprise, statut, score, strategic_priority, created_at")
    .eq("proprietaire_email", "oulipaiexpress@gmail.com");
  if (prospectsError) return res.status(400).json({ error: prospectsError.message });

  const ETAPES = ["nouveau", "contacte", "qualifie", "proposition", "gagne", "perdu"];
  const parEtape = {};
  ETAPES.forEach((e) => { parEtape[e] = prospects.filter((p) => p.statut === e).length; });

  // Goulot d'étranglement : la plus grosse chute en % entre deux étapes actives consécutives
  const etapesActives = ["nouveau", "contacte", "qualifie", "proposition", "gagne"];
  let goulot = null, pireChute = -1;
  for (let i = 0; i < etapesActives.length - 1; i++) {
    const avant = parEtape[etapesActives[i]];
    const apres = parEtape[etapesActives[i + 1]];
    if (avant > 0) {
      const chute = 1 - apres / avant;
      if (chute > pireChute) { pireChute = chute; goulot = `${etapesActives[i]} → ${etapesActives[i + 1]}`; }
    }
  }

  const cinqJours = Date.now() - 5 * 24 * 3600 * 1000;
  const prospectsChauds = prospects
    .filter((p) => p.score >= 70 && !["gagne", "perdu"].includes(p.statut))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p) => ({ nom: p.nom, entreprise: p.entreprise, score: p.score, statut: p.statut }));
  const prospectsOublies = prospects
    .filter((p) => ["nouveau", "contacte"].includes(p.statut) && new Date(p.created_at).getTime() < cinqJours)
    .map((p) => ({ nom: p.nom, entreprise: p.entreprise, statut: p.statut, depuis_le: p.created_at }));

  const contexteReel = {
    total_prospects: prospects.length,
    repartition_pipeline: parEtape,
    goulot_etranglement_probable: goulot,
    prospects_chauds_non_conclus: prospectsChauds,
    prospects_oublies_5j_plus: prospectsOublies,
  };

  const prompt = `Tu es l'agent Sales/CRO IA de RecuVente Business (l'activité de services de Koffi). Voici les VRAIES données actuelles de son pipeline commercial, extraites à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, de façon directe et actionnable, UNIQUEMENT à partir des chiffres ci-dessus. Priorité : signaler les prospects oubliés et le goulot d'étranglement s'ils sont pertinents pour la question. Si la question porte sur quelque chose que ces données ne couvrent pas, dis clairement "Information non disponible — cette donnée n'est pas encore connectée à l'agent Sales" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });

  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  await supabaseAdmin.from("ai_action_logs").insert([{
    agent_key: "sales",
    action: "sales_ask",
    reason: question,
    input_data: contexteReel,
    result_data: { reponse: reponseTexte },
    validation_required: false,
    approved_by: user.email,
  }]);

  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

export default async function handler(req, res) {
  const user = await verifierAdmin(req, res);
  if (!user) return; // verifierAdmin a déjà renvoyé la bonne erreur

  if (req.method === "POST" && req.body?.action === "ceo_ask") return gererCeoAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "sales_ask") return gererSalesAsk(req, res, user);
  if (req.method === "POST") return gererPOST(req, res);
  return gererGET(req, res);
}
