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

// ===== POST "cfo_ask" : agent CFO IA (§6) — trésorerie réelle d'Azali Express =====
async function gererCfoAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question manquante" });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });
  }

  // On retrouve l'espace par son slug plutôt que d'exiger un ID technique.
  const { data: workspace, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, currency")
    .eq("slug", "azaliexpress")
    .maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable (slug différent ?)" });

  const { data: commandes, error: cmdError } = await supabaseAdmin
    .from("commandes")
    .select("montant, statut, created_at")
    .eq("workspace_id", workspace.id);
  if (cmdError) return res.status(400).json({ error: cmdError.message });

  const sommeParStatut = (statut) => commandes.filter((c) => c.statut === statut).reduce((s, c) => s + Number(c.montant || 0), 0);
  const septJours = Date.now() - 7 * 24 * 3600 * 1000;

  const contexteReel = {
    entreprise: workspace.name,
    devise: workspace.currency,
    ca_confirme: sommeParStatut("confirmee"),
    montant_en_cours: sommeParStatut("en_cours"),
    montant_echoue: sommeParStatut("echouee"),
    montant_retourne: sommeParStatut("retournee"),
    total_commandes: commandes.length,
    commandes_7_derniers_jours: commandes.filter((c) => new Date(c.created_at).getTime() > septJours).length,
    ca_confirme_7_derniers_jours: commandes.filter((c) => c.statut === "confirmee" && new Date(c.created_at).getTime() > septJours).reduce((s, c) => s + Number(c.montant || 0), 0),
  };

  const prompt = `Tu es le CFO IA de ${workspace.name} (l'activité e-commerce de Koffi). Voici les VRAIES données actuelles de trésorerie, extraites à l'instant de sa base de commandes :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, de façon directe et actionnable, UNIQUEMENT à partir des chiffres ci-dessus. IMPORTANT : ces chiffres ne déduisent PAS les coûts produits ni les frais de livraison — c'est une vue encaissement/risque, pas un vrai bénéfice net. Si la question porte sur la rentabilité réelle, les marges, ou autre chose que ces données ne couvrent pas, dis clairement "Information non disponible — cette donnée n'est pas encore connectée à l'agent CFO" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });

  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  await supabaseAdmin.from("ai_action_logs").insert([{
    agent_key: "cfo",
    action: "cfo_ask",
    reason: question,
    input_data: contexteReel,
    result_data: { reponse: reponseTexte },
    validation_required: false,
    approved_by: user.email,
  }]);

  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "gm_ask" : Directeur Général IA (§5) — opérations du jour, Azali Express =====
async function gererGmAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable" });

  const { data: commandes, error: cmdError } = await supabaseAdmin
    .from("commandes")
    .select("client, statut, date_relivraison, livreur, created_at")
    .eq("workspace_id", workspace.id);
  if (cmdError) return res.status(400).json({ error: cmdError.message });

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const contexteReel = {
    entreprise: workspace.name,
    commandes_en_cours: commandes.filter((c) => c.statut === "en_cours").length,
    commandes_en_retard: commandes.filter((c) => c.statut === "en_cours" && c.date_relivraison && c.date_relivraison < aujourdhui).length,
    commandes_sans_livreur_assigne: commandes.filter((c) => c.statut === "en_cours" && !c.livreur).length,
    total_commandes: commandes.length,
  };

  const prompt = `Tu es le Directeur Général IA (COO) de ${workspace.name}. Voici l'état réel des opérations aujourd'hui, extrait à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces chiffres. Priorise les commandes en retard et sans livreur assigné si pertinent. Si la question dépasse ces données, dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent Directeur Général" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "general_manager", action: "gm_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "data_ask" : Data / Analytics IA (§16) — détection d'anomalies réelles =====
async function gererDataAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable" });

  const { data: commandes } = await supabaseAdmin.from("commandes").select("montant, statut, created_at").eq("workspace_id", workspace.id);
  const { data: prospects } = await supabaseAdmin.from("prospects_business").select("created_at").eq("proprietaire_email", "oulipaiexpress@gmail.com");

  const maintenant = Date.now(), j = 24 * 3600 * 1000;
  const compter = (arr, debut, fin) => arr.filter((x) => { const t = new Date(x.created_at).getTime(); return t >= debut && t < fin; }).length;
  const commandes7jActuel = compter(commandes || [], maintenant - 7 * j, maintenant);
  const commandes7jPrecedent = compter(commandes || [], maintenant - 14 * j, maintenant - 7 * j);
  const prospects7jActuel = compter(prospects || [], maintenant - 7 * j, maintenant);
  const prospects7jPrecedent = compter(prospects || [], maintenant - 14 * j, maintenant - 7 * j);
  const variation = (actuel, precedent) => precedent === 0 ? (actuel > 0 ? "nouveau (aucune donnée précédente)" : "0%") : `${Math.round(((actuel - precedent) / precedent) * 100)}%`;

  const contexteReel = {
    commandes_7j_actuel: commandes7jActuel,
    commandes_7j_precedent: commandes7jPrecedent,
    variation_commandes: variation(commandes7jActuel, commandes7jPrecedent),
    prospects_7j_actuel: prospects7jActuel,
    prospects_7j_precedent: prospects7jPrecedent,
    variation_prospects: variation(prospects7jActuel, prospects7jPrecedent),
  };

  const prompt = `Tu es l'agent Data/Analytics IA. Voici une comparaison réelle semaine actuelle vs semaine précédente, extraite à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct, UNIQUEMENT à partir de ces chiffres. Signale toute variation de plus de 30% comme potentiellement anormale. Si la question dépasse ces données, dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent Data" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "data", action: "data_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "cs_ask" : Customer Success IA (§14) — clients à risque, à partir des vraies commandes =====
async function gererCsAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable" });

  const { data: commandes, error: cmdError } = await supabaseAdmin.from("commandes").select("client, statut, created_at").eq("workspace_id", workspace.id).eq("statut", "confirmee");
  if (cmdError) return res.status(400).json({ error: cmdError.message });

  const parClient = {};
  (commandes || []).forEach((c) => {
    const nom = (c.client || "").trim();
    if (!nom) return;
    if (!parClient[nom]) parClient[nom] = { nom, nbCommandes: 0, derniereCommande: c.created_at };
    parClient[nom].nbCommandes += 1;
    if (new Date(c.created_at) > new Date(parClient[nom].derniereCommande)) parClient[nom].derniereCommande = c.created_at;
  });
  const trenteJours = Date.now() - 30 * 24 * 3600 * 1000;
  const clientsFideles = Object.values(parClient).filter((c) => c.nbCommandes >= 2);
  const clientsARisque = clientsFideles.filter((c) => new Date(c.derniereCommande).getTime() < trenteJours);

  const contexteReel = {
    total_clients_ayant_commande: Object.keys(parClient).length,
    clients_fideles_2_commandes_plus: clientsFideles.length,
    clients_a_risque_30j_sans_achat: clientsARisque.map((c) => ({ nom: c.nom, nb_commandes: c.nbCommandes, derniere_commande: c.derniereCommande })).slice(0, 10),
  };

  const prompt = `Tu es l'agent Customer Success IA de ${workspace.name}. Voici les vraies données clients extraites à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces chiffres. Un client fidèle (2+ commandes) qui n'a rien acheté depuis 30+ jours est un risque de perte à signaler. Si la question dépasse ces données, dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent Customer Success" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "customer_success", action: "cs_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "copywriter_ask" : Copywriter IA (§11) — rédige un brouillon, n'envoie jamais rien =====
async function gererCopywriterAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Décris ce que tu veux faire rédiger" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const prompt = `Tu es le Copywriter IA de RecuVente Business / Azali Express. On te donne un brief, tu rédiges UNIQUEMENT le texte demandé (publicité, email, message WhatsApp, page de vente...), prêt à copier-coller. Pas de méta-commentaire, pas d'explication — juste le texte final. Ton commercial ivoirien, direct, chaleureux.

Brief du dirigeant : "${question}"`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "copywriter", action: "copywriter_ask", reason: question, input_data: { brief: question }, result_data: { brouillon: reponseTexte }, validation_required: true, approved_by: null }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: { note: "Brouillon uniquement — DRAFT. Rien n'est envoyé automatiquement (§29)." } });
}

// ===== POST "pm_ask" : Project Manager IA (§15) — transforme chaque prospect "Gagné" en
// tâche de projet suivie. Création de tâches = action AUTOMATIQUE selon ta propre matrice
// d'autorisation (§26), donc aucune validation requise ici : c'est purement interne
// (table ai_tasks), rien n'est envoyé à qui que ce soit.
async function gererPmAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: prospectsGagnes, error: pError } = await supabaseAdmin
    .from("prospects_business")
    .select("id, nom, entreprise")
    .eq("proprietaire_email", "oulipaiexpress@gmail.com")
    .eq("statut", "gagne");
  if (pError) return res.status(400).json({ error: pError.message });

  const { data: tachesExistantes, error: tError } = await supabaseAdmin
    .from("ai_tasks")
    .select("related_id")
    .eq("agent_key", "project_manager")
    .eq("related_type", "prospect");
  if (tError) return res.status(400).json({ error: tError.message });
  const idsAvecTache = new Set((tachesExistantes || []).map((t) => t.related_id));

  const nouveauxProspects = (prospectsGagnes || []).filter((p) => !idsAvecTache.has(p.id));
  let tachesCreees = 0;
  if (nouveauxProspects.length > 0) {
    await supabaseAdmin.from("ai_tasks").insert(
      nouveauxProspects.map((p) => ({
        agent_key: "project_manager",
        title: `Lancer le projet — ${p.nom}${p.entreprise ? ` (${p.entreprise})` : ""}`,
        description: "Prospect gagné, projet à démarrer : brief, tâches, échéances.",
        status: "pending",
        priority: "MEDIUM",
        related_type: "prospect",
        related_id: p.id,
      }))
    );
    tachesCreees = nouveauxProspects.length;
  }

  const { data: toutesLesTaches } = await supabaseAdmin
    .from("ai_tasks")
    .select("title, status, priority, created_at")
    .eq("agent_key", "project_manager");

  const contexteReel = {
    nouvelles_taches_creees_maintenant: tachesCreees,
    taches_en_attente: (toutesLesTaches || []).filter((t) => t.status === "pending").map((t) => t.title),
    taches_en_cours: (toutesLesTaches || []).filter((t) => t.status === "in_progress").map((t) => t.title),
    taches_terminees_count: (toutesLesTaches || []).filter((t) => t.status === "done").length,
  };

  const prompt = `Tu es le Project Manager IA de RecuVente Business. Chaque prospect qui passe au statut "Gagné" devient automatiquement un projet à suivre. Voici l'état réel des projets/tâches, extrait à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces données. Si la question dépasse ces données (détail d'avancement fin, livrables précis), dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent Project Manager" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "project_manager", action: "pm_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "cto_ask" : CTO IA (§13) — détection de vrais problèmes de données, jamais de
// correction automatique du code. Lecture seule, zéro risque pour la production.
async function gererCtoAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable" });

  const { data: produits, error: pError } = await supabaseAdmin.from("produits").select("nom, cout_achat, photo_url, stock_initial").eq("workspace_id", workspace.id);
  if (pError) return res.status(400).json({ error: pError.message });
  const { data: prospects } = await supabaseAdmin.from("prospects_business").select("nom, whatsapp").eq("proprietaire_email", "oulipaiexpress@gmail.com");

  const contexteReel = {
    produits_sans_cout_connu: (produits || []).filter((p) => !p.cout_achat || Number(p.cout_achat) === 0).map((p) => p.nom),
    produits_sans_photo: (produits || []).filter((p) => !p.photo_url).map((p) => p.nom),
    produits_en_rupture: (produits || []).filter((p) => Number(p.stock_initial || 0) <= 0).map((p) => p.nom),
    prospects_sans_whatsapp: (prospects || []).filter((p) => !p.whatsapp).map((p) => p.nom),
  };

  const prompt = `Tu es le CTO IA de RecuVente Business. Tu détectes des problèmes de QUALITÉ DE DONNÉES réels — tu ne modifies jamais de code, tu ne corriges rien automatiquement, tu signales seulement. Voici les problèmes réels détectés à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct, UNIQUEMENT à partir de ces données. Priorise par impact business (un produit sans coût fausse le calcul de bénéfice, sans photo réduit les ventes). Si la question dépasse ces données, dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent CTO" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "cto", action: "cto_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "azali_leads_ask" : Chasseur d'opportunités Azali — cherche des DEMANDES
// publiques réelles (pas du démarchage à froid). Renvoie un rapport à lire, ne contacte
// jamais personne lui-même.
async function gererAzaliLeadsAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Décris ce que tu cherches" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  const { data: produits } = await supabaseAdmin.from("produits").select("nom").eq("workspace_id", workspace?.id || "").limit(15);
  const catalogue = (produits || []).map((p) => p.nom).filter(Boolean);

  const prompt = `Tu es un agent de veille commerciale pour Azali Express (boutique e-commerce COD à Abidjan, Côte d'Ivoire). Voici un extrait réel de son catalogue : ${catalogue.join(", ") || "(catalogue non trouvé)"}.

Cherche sur le web des PERSONNES QUI DEMANDENT DÉJÀ PUBLIQUEMENT à acheter un produit correspondant à ce catalogue en Côte d'Ivoire (groupes Facebook publics, forums, posts publics) — PAS des comptes d'entreprises à démarcher à froid, uniquement de vraies demandes explicites et récentes.

Demande du dirigeant : "${question}"

Réponds en français avec un rapport d'opportunités réelles trouvées (avec lien si possible), ou dis clairement qu'aucune demande explicite n'a été trouvée. N'invente jamais une opportunité. Ce rapport est pour lecture humaine seulement — tu ne contactes personne, tu ne rédiges pas de message d'approche non plus ici.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }], tools: [{ type: "web_search_20250305", name: "web_search" }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "azali_leads", action: "azali_leads_ask", reason: question, input_data: { catalogue }, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: { catalogue_utilise: catalogue, note: "Rapport de veille uniquement — aucun contact automatique." } });
}

export default async function handler(req, res) {
  const user = await verifierAdmin(req, res);
  if (!user) return; // verifierAdmin a déjà renvoyé la bonne erreur

  if (req.method === "POST" && req.body?.action === "ceo_ask") return gererCeoAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "sales_ask") return gererSalesAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "cfo_ask") return gererCfoAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "gm_ask") return gererGmAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "data_ask") return gererDataAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "cs_ask") return gererCsAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "copywriter_ask") return gererCopywriterAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "pm_ask") return gererPmAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "cto_ask") return gererCtoAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "azali_leads_ask") return gererAzaliLeadsAsk(req, res, user);
  if (req.method === "POST") return gererPOST(req, res);
  return gererGET(req, res);
}
