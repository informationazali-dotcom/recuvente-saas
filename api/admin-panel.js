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

// Contrairement à verifierAdmin (réservé au seul compte propriétaire de RecuVente, pour l'AI
// Company OS), cette vérification sert les fonctionnalités IA destinées à TOUS les abonnés —
// n'importe quel marchand connecté et membre de SA PROPRE boutique peut les utiliser.
async function verifierMembreWorkspace(req, res) {
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
  const workspaceId = req.body?.workspace_id;
  if (!workspaceId) {
    res.status(400).json({ error: "Espace de travail manquant" });
    return null;
  }
  const { data: membership } = await supabaseAdmin
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: "Accès refusé à cet espace de travail" });
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

// ===== POST "subscriber_growth_ask" : analyse du tunnel d'abonnés RecuVente (objectif n°1)
// à partir de la table "prospects" (celle de l'agent Prospection / Golden IA).
async function gererSubscriberGrowthAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: prospects, error } = await supabaseAdmin.from("prospects").select("nom, statut, score, secteur, ville, created_at");
  if (error) return res.status(400).json({ error: error.message });

  const STATUTS = ["NEW", "CONTACTED", "RESPONDED", "HOT", "CUSTOMER", "LOST", "DO_NOT_CONTACT"];
  const parStatut = {};
  STATUTS.forEach((s) => { parStatut[s] = (prospects || []).filter((p) => p.statut === s).length; });

  const troisJours = Date.now() - 3 * 24 * 3600 * 1000;
  const nonContactesEnAttente = (prospects || [])
    .filter((p) => p.statut === "NEW" && new Date(p.created_at).getTime() < troisJours)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)
    .map((p) => ({ nom: p.nom, score: p.score, secteur: p.secteur, ville: p.ville }));

  const contexteReel = {
    total_prospects_trouves: (prospects || []).length,
    repartition_tunnel: parStatut,
    taux_conversion_contacte_vers_abonne: parStatut.CONTACTED > 0 ? `${Math.round((parStatut.CUSTOMER / (parStatut.CONTACTED + parStatut.CUSTOMER)) * 100)}%` : "pas assez de données",
    prospects_non_contactes_depuis_3j_plus: nonContactesEnAttente,
  };

  const prompt = `Tu es l'agent de croissance des abonnés RecuVente (l'objectif n°1 de Koffi : trouver et convertir plus de personnes en abonnés RecuVente). Voici l'état réel du tunnel, extrait à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces chiffres. Priorise les prospects "NEW" non contactés depuis 3 jours ou plus (score élevé d'abord) — chaque jour sans contact est une opportunité perdue. Si la question dépasse ces données, dis "Information non disponible" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "prospecting", action: "subscriber_growth_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "hr_ask" : RH IA (§12) — charge de travail réelle de l'équipe Azali
// (livreurs/closers), à partir des vraies commandes qui leur sont assignées.
async function gererHrAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const { data: workspace, error: wsError } = await supabaseAdmin.from("workspaces").select("id, name").eq("slug", "azaliexpress").maybeSingle();
  if (wsError) return res.status(400).json({ error: wsError.message });
  if (!workspace) return res.status(400).json({ error: "Intégration requise : espace 'azaliexpress' introuvable" });

  const { data: livreurs } = await supabaseAdmin.from("livreurs").select("nom").eq("workspace_id", workspace.id);
  const { data: closers } = await supabaseAdmin.from("closers").select("nom").eq("workspace_id", workspace.id);
  const septJours = Date.now() - 7 * 24 * 3600 * 1000;
  const { data: commandes7j } = await supabaseAdmin.from("commandes").select("livreur, closer, statut, created_at").eq("workspace_id", workspace.id).gte("created_at", new Date(septJours).toISOString());

  const chargeLivreurs = (livreurs || []).map((l) => ({
    nom: l.nom,
    commandes_7j: (commandes7j || []).filter((c) => c.livreur === l.nom).length,
    echouees_7j: (commandes7j || []).filter((c) => c.livreur === l.nom && c.statut === "echouee").length,
  }));
  const chargeClosers = (closers || []).map((c) => ({
    nom: c.nom,
    commandes_7j: (commandes7j || []).filter((cmd) => cmd.closer === c.nom).length,
  }));
  const commandesSansLivreur = (commandes7j || []).filter((c) => c.statut === "en_cours" && !c.livreur).length;

  const contexteReel = {
    entreprise: workspace.name,
    equipe_livreurs: chargeLivreurs,
    equipe_closers: chargeClosers,
    commandes_en_cours_sans_livreur_assigne: commandesSansLivreur,
  };

  const prompt = `Tu es l'agent RH IA de ${workspace.name}. Voici la charge de travail réelle de l'équipe sur les 7 derniers jours, extraite à l'instant :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces chiffres. Signale tout déséquilibre de charge important entre membres de l'équipe. Si la question dépasse ces données (recrutement, évaluations, compétences), dis "Information non disponible — cette donnée n'est pas encore connectée à l'agent RH" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "hr", action: "hr_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "ads_ask" : CMO/Ads IA (§7/§8) — lit le VRAI compte publicitaire Meta (RecuVente).
// Lecture seule pour l'instant : pas de création/modification de campagne tant qu'aucun moyen
// de paiement n'est configuré sur le compte — coder une action de dépense non testable serait
// exactement le genre de "fausse intégration" que le cahier des charges interdit (§35/§43).
async function gererAdsAsk(req, res, user) {
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: "Question manquante" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const metaToken = process.env.META_ADS_ACCESS_TOKEN;
  const metaAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });
  if (!metaToken || !metaAccountId) return res.status(500).json({ error: "Intégration requise : META_ADS_ACCESS_TOKEN / META_AD_ACCOUNT_ID non configurés" });

  const GRAPH = "https://graph.facebook.com/v25.0";

  const respCompte = await fetch(`${GRAPH}/${metaAccountId}?fields=name,currency,account_status,amount_spent,balance&access_token=${metaToken}`);
  const compte = await respCompte.json();
  if (!respCompte.ok) return res.status(400).json({ error: compte?.error?.message || "Erreur API Meta (compte)" });

  const respCampagnes = await fetch(`${GRAPH}/${metaAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&limit=50&access_token=${metaToken}`);
  const campagnesData = await respCampagnes.json();
  if (!respCampagnes.ok) return res.status(400).json({ error: campagnesData?.error?.message || "Erreur API Meta (campagnes)" });

  const contexteReel = {
    compte: { nom: compte.name, devise: compte.currency, statut: compte.account_status, deja_depense: compte.amount_spent },
    moyen_de_paiement_configure: compte.account_status !== undefined ? "à vérifier manuellement dans Business Manager" : "inconnu",
    campagnes: (campagnesData.data || []).map((c) => ({ nom: c.name, statut: c.status, objectif: c.objective, budget_jour: c.daily_budget, budget_total: c.lifetime_budget })),
    total_campagnes: (campagnesData.data || []).length,
  };

  const prompt = `Tu es l'agent CMO/Ads IA de RecuVente. Voici les VRAIES données de son compte publicitaire Meta, extraites à l'instant via l'API :

${JSON.stringify(contexteReel, null, 2)}

Question du dirigeant : "${question}"

Réponds en français, direct et actionnable, UNIQUEMENT à partir de ces données. IMPORTANT : tu ne peux pas encore créer ni modifier de campagne (lecture seule pour l'instant) — si le dirigeant demande de lancer/modifier une campagne, dis-le clairement plutôt que de prétendre l'avoir fait. Si la question dépasse ces données, dis "Information non disponible" plutôt que d'inventer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const reponseTexte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  await supabaseAdmin.from("ai_action_logs").insert([{ agent_key: "ads", action: "ads_ask", reason: question, input_data: contexteReel, result_data: { reponse: reponseTexte }, validation_required: false, approved_by: user.email }]);
  return res.status(200).json({ reponse: reponseTexte, contexte: contexteReel });
}

// ===== POST "generer_fiche_produit_ia" : à partir d'un simple nom de produit, l'IA rédige un
// titre accrocheur, une description complète et des arguments de vente — pour qu'une fiche
// produit ait l'air professionnelle immédiatement, même sans savoir rédiger soi-même.
// Ne génère JAMAIS de prix ni de chiffres inventés — uniquement du texte de présentation.
async function gererGenererFicheProduitIA(req, res, user) {
  const { nom_produit, contexte } = req.body;
  if (!nom_produit || !nom_produit.trim()) return res.status(400).json({ error: "Nom du produit manquant" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const contexteComplementaire = [
    contexte?.pourQui ? `Public cible précisé par le marchand : ${contexte.pourQui.trim()}.` : "",
    contexte?.difference ? `Ce qui différencie ce produit selon le marchand : ${contexte.difference.trim()}.` : "",
  ].filter(Boolean).join(" ");

  const prompt = `Tu es un rédacteur e-commerce expérimenté, spécialisé dans les pages produits qui donnent envie d'acheter en Afrique de l'Ouest (paiement à la livraison) — le genre de page qu'on voit chez les vraies marques, pas un simple paragraphe.

Nom ou courte description du produit donnée par le marchand : "${nom_produit.trim()}"
${contexteComplementaire ? `\n${contexteComplementaire} Utilise vraiment ces précisions pour orienter le ton et les arguments — c'est ce qui rend une fiche pertinente plutôt que générique.\n` : ""}

Rédige une page produit complète, structurée en plusieurs sections, en français. Réponds UNIQUEMENT avec un objet JSON, dans ce format exact :
{
  "titre_ameliore": "un titre de produit clair et vendeur, à partir du nom donné",
  "description_html": "la page produit complète, en HTML, structurée en 3 à 4 sections",
  "categorie_suggeree": "une catégorie e-commerce simple (ex: Mode, Électronique, Beauté, Maison, Auto...)"
}

Pour "description_html", construis une vraie page produit, avec cette logique :
1. Une section d'accroche qui parle du besoin ou du problème que le produit résout (un <h3> + un <p>).
2. Juste après cette première section, insère un <h4> commençant par "📸 Astuce photo :" qui suggère PRÉCISÉMENT quelle photo ajouterait de l'impact ici (ex: "le produit tenu en main", "avant/après", "en situation d'usage réelle") — c'est un repère pour le marchand, pas une vraie image.
3. Une section "Pourquoi ce produit" avec 3-4 arguments de vente concrets, en <ul><li>.
4. Une section "Comment l'utiliser" ou "Pour qui" selon ce qui est le plus pertinent pour ce produit (<h3> + <p>).
5. Avant la toute dernière section, insère un <h4> commençant par "🎥 Astuce vidéo :" suggérant ce qu'une courte vidéo de démonstration pourrait montrer.

Utilise UNIQUEMENT ces balises HTML, rien d'autre : <h3>, <h4>, <p>, <ul>, <li>, <strong>. N'utilise jamais de balise <img> ou <video> toi-même — tu ne fais QUE suggérer où le marchand doit ajouter les siennes via les repères "Astuce photo"/"Astuce vidéo".

IMPORTANT : n'invente jamais de prix, de certification, de marque, de chiffre de vente, ou de caractéristique technique précise (comme une capacité en mAh, un poids exact) que tu ne peux pas connaître à partir du seul nom — reste sur des bénéfices et usages généraux et honnêtes. Réponds uniquement le JSON, sans texte autour, sans les balises \`\`\`json.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const texteBrut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  let ficheGeneree;
  try {
    const jsonMatch = texteBrut.match(/\{[\s\S]*\}/);
    ficheGeneree = JSON.parse(jsonMatch ? jsonMatch[0] : texteBrut);
  } catch (e) {
    return res.status(400).json({ error: "Réponse IA non exploitable, réessaie." });
  }

  return res.status(200).json({ fiche: ficheGeneree });
}

// ===== POST "generer_configuration_boutique_ia" : à la place d'une boutique vide à remplir
// soi-même, l'IA propose une description, une politique de livraison et une politique de
// retours de départ, à partir du seul nom de l'entreprise et de son type d'activité. Le
// marchand reste libre de tout modifier avant d'enregistrer — rien n'est sauvegardé sans lui.
async function gererGenererConfigurationBoutiqueIA(req, res, user) {
  const { nom_entreprise, type_activite } = req.body;
  if (!nom_entreprise || !nom_entreprise.trim()) return res.status(400).json({ error: "Nom de l'entreprise manquant" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const typesLisibles = { retail: "vente de produits en ligne (paiement à la livraison)", restaurant: "restaurant", biens_location: "location de biens/véhicules", logements: "location de logements" };
  const typeTexte = typesLisibles[type_activite] || "vente en ligne";

  const prompt = `Tu configures les premiers textes d'une boutique en ligne pour une entreprise africaine (paiement à la livraison, Afrique de l'Ouest principalement).

Nom de l'entreprise : "${nom_entreprise.trim()}"
Type d'activité : ${typeTexte}

Réponds UNIQUEMENT avec un objet JSON dans ce format exact :
{
  "description_boutique": "une description courte (1-2 phrases) qui présente l'activité de façon engageante",
  "politique_livraison": "un texte de politique de livraison générique mais professionnel, adapté à ce type d'activité, à revoir par le marchand",
  "politique_retours": "un texte de politique de retours générique mais professionnel, à revoir par le marchand"
}

IMPORTANT : n'invente aucun délai précis, aucune ville, aucun tarif de livraison — utilise des formulations génériques que le marchand pourra ajuster ("selon votre zone", "sous quelques jours") plutôt que des chiffres inventés. Réponds uniquement le JSON, sans texte autour, sans balises \`\`\`json.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const texteBrut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  let configGeneree;
  try {
    const jsonMatch = texteBrut.match(/\{[\s\S]*\}/);
    configGeneree = JSON.parse(jsonMatch ? jsonMatch[0] : texteBrut);
  } catch (e) {
    return res.status(400).json({ error: "Réponse IA non exploitable, réessaie." });
  }

  return res.status(200).json({ config: configGeneree });
}

// ===== POST "generer_boutique_complete_ia" : contrairement à generer_configuration_boutique_ia
// (3 champs de texte seulement), celle-ci génère un vrai design de départ compatible avec le
// Store Builder existant (RVStoreBuilder / sectionCatalog dans App.jsx) : couleur, titre héros,
// réassurance, chiffres clés, etc. On ne touche PAS à l'ordre des sections (config.sections) —
// une valeur inventée par l'IA pourrait ne pas exister dans sectionCatalog et casser l'affichage ;
// l'ordre par défaut, déjà adapté au secteur d'activité, reste inchangé.
async function gererGenererBoutiqueCompleteIA(req, res, user) {
  const { nom_entreprise, type_activite, produit_nom, produit_description } = req.body;
  if (!nom_entreprise || !nom_entreprise.trim()) return res.status(400).json({ error: "Nom de l'entreprise manquant" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const typesLisibles = {
    cod_ecommerce: "vente en ligne (paiement à la livraison)", retail: "commerce physique", restaurant: "restaurant",
    location_immobiliere: "location immobilière", location_vehicule: "location de véhicules/matériel",
    network_marketing: "marketing de réseau (boutique + vendeurs affiliés)", personnalise: "activité de services",
  };
  const typeTexte = typesLisibles[type_activite] || "vente en ligne";

  const prompt = `Tu es à la fois designer e-commerce (30 ans d'expérience) et copywriter (30 ans d'expérience). Tu conçois les textes et les couleurs de la page d'accueil d'une boutique en ligne professionnelle pour une entreprise africaine (paiement à la livraison, Afrique de l'Ouest principalement).

Nom de l'entreprise : "${nom_entreprise.trim()}"
Type d'activité : ${typeTexte}
${produit_nom ? `Produit phare : "${produit_nom.trim()}"` : ""}
${produit_description ? `Description donnée par le marchand : "${produit_description.trim().slice(0, 300)}"` : ""}

Réponds UNIQUEMENT avec un objet JSON dans ce format exact (respecte les noms de champs à la lettre) :
{
  "couleur": "#RRGGBB (une couleur de marque sobre et professionnelle, adaptée au secteur — jamais une couleur criarde)",
  "description_boutique": "1-2 phrases qui présentent l'activité de façon engageante",
  "politique_livraison": "texte générique mais professionnel, sans délai/ville/tarif précis inventé",
  "politique_retours": "texte générique mais professionnel",
  "announcement": "une courte phrase d'accroche pour la barre d'annonce en haut de la boutique (avec 1-2 emojis, style rassurant : livraison, paiement à la livraison, etc.)",
  "heroTitle": "un titre d'accroche court et percutant pour la bannière principale (5-8 mots)",
  "heroSubtitle": "une phrase qui complète le titre et donne envie de parcourir la boutique",
  "buttonText": "texte du bouton d'action principal (2-4 mots, ex: Découvrir la collection)",
  "imageTexteTitre": "titre de la section \\"pourquoi nous choisir\\"",
  "imageTexteTexte": "un paragraphe qui explique ce qui rend cette boutique unique",
  "richTextTitre": "titre de la section \\"à propos\\"",
  "richTextTexte": "un paragraphe qui raconte l'histoire ou l'engagement de la marque",
  "brandsCtaTitre": "titre court pour la section contact/WhatsApp",
  "brandsCtaTexte": "1 phrase qui invite à contacter la boutique sur WhatsApp",
  "statsItems": [
    {"valeur": "ex: 500+", "label": "ex: Clients satisfaits"},
    {"valeur": "...", "label": "..."},
    {"valeur": "...", "label": "..."},
    {"valeur": "...", "label": "..."}
  ],
  "scrollingAlertTexte": "un texte court qui défile en boucle (séparé par des •), reprenant les points forts (livraison, paiement, sécurité)"
}

IMPORTANT :
- N'invente aucun chiffre, délai, ville ou tarif précis qui pourrait être faux — reste sur des formulations crédibles et génériques que le marchand pourra ajuster.
- Les statsItems doivent rester plausibles pour une boutique qui démarre (pas de "10 000 clients" pour une nouvelle boutique).
- Réponds uniquement le JSON, sans texte autour, sans balises \`\`\`json.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1400, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const texteBrut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  let configGeneree;
  try {
    const jsonMatch = texteBrut.match(/\{[\s\S]*\}/);
    configGeneree = JSON.parse(jsonMatch ? jsonMatch[0] : texteBrut);
  } catch (e) {
    return res.status(400).json({ error: "Réponse IA non exploitable, réessaie." });
  }

  return res.status(200).json({ config: configGeneree });
}

// ===== POST "extraire_produit_depuis_lien" : à partir d'un vrai lien produit (AliExpress et
// similaires), récupère le nom, la photo et le prix quand ils sont publiquement disponibles sur
// la page — jamais inventés. La photo est re-téléchargée et hébergée chez nous (pas de lien
// direct vers un site externe, qui pourrait casser plus tard).
async function gererExtraireProduitDepuisLien(req, res, user) {
  const { url, workspace_id } = req.body;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Lien invalide" });
  if (!workspace_id) return res.status(400).json({ error: "Espace de travail manquant" });

  // Beaucoup de sites (AliExpress en tête) bloquent une requête serveur trop nue. On imite un
  // vrai navigateur avec des en-têtes complets, et si la version normale échoue, on retente sur
  // la version mobile du site (m.aliexpress.com) — souvent moins protégée que la version desktop.
  const entetesNavigateur = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.google.com/",
  };

  async function tenterRecuperation(cible) {
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 12000);
    try {
      const reponsePage = await fetch(cible, { headers: entetesNavigateur, signal: controleur.signal });
      clearTimeout(delai);
      if (!reponsePage.ok) return null;
      return await reponsePage.text();
    } catch (e) {
      clearTimeout(delai);
      return null;
    }
  }

  let html = await tenterRecuperation(url);
  if (!html && /aliexpress\.com/i.test(url) && !/^https?:\/\/m\./i.test(url)) {
    const urlMobile = url.replace(/^https?:\/\/(www\.)?/i, "https://m.");
    html = await tenterRecuperation(urlMobile);
  }
  if (!html) {
    return res.status(400).json({
      error: "Ce site bloque la récupération automatique (protection anti-robot). Utilise plutôt \"Identifier depuis une photo\" — colle une capture d'écran du produit, ça fonctionne dans ce cas.",
    });
  }

  let nom = null, imageUrl = null, prix = null, devisePrix = null;

  // 1) Priorité aux données structurées (JSON-LD "Product") — la source la plus fiable quand
  // elle existe, car conçue justement pour décrire un produit sans ambiguïté.
  const blocsJsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const bloc of blocsJsonLd) {
    try {
      const contenu = JSON.parse(bloc[1].trim());
      const candidats = Array.isArray(contenu) ? contenu : [contenu];
      for (const c of candidats) {
        const items = c["@graph"] ? c["@graph"] : [c];
        for (const item of items) {
          if (item && (item["@type"] === "Product" || (Array.isArray(item["@type"]) && item["@type"].includes("Product")))) {
            nom = nom || item.name || null;
            const img = item.image;
            imageUrl = imageUrl || (Array.isArray(img) ? img[0] : img) || null;
            const offre = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offre && offre.price) {
              prix = Number(offre.price) || null;
              devisePrix = offre.priceCurrency || null;
            }
          }
        }
      }
    } catch (e) { /* bloc JSON-LD mal formé, on l'ignore simplement */ }
  }

  // 2) À défaut, repli sur les balises Open Graph (titre/image seulement — jamais de prix
  // deviné depuis de simples balises génériques, trop peu fiable).
  if (!nom) {
    const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (m) nom = m[1];
  }
  if (!imageUrl) {
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (m) imageUrl = m[1];
  }

  if (!nom && !imageUrl) {
    return res.status(400).json({ error: "Aucune information exploitable trouvée sur cette page. Utilise plutôt \"Identifier depuis une photo\" — colle une capture d'écran du produit." });
  }

  // Rapatrie la photo chez nous plutôt que de garder un lien direct vers le site d'origine —
  // plus fiable dans le temps, et cohérent avec le reste du catalogue.
  let photoHebergeeUrl = null;
  if (imageUrl) {
    try {
      const reponseImage = await fetch(imageUrl);
      if (reponseImage.ok) {
        const buffer = Buffer.from(await reponseImage.arrayBuffer());
        const typeContenu = reponseImage.headers.get("content-type") || "image/jpeg";
        const extension = typeContenu.includes("png") ? "png" : typeContenu.includes("webp") ? "webp" : "jpg";
        const chemin = `${workspace_id}-lien-${Date.now()}.${extension}`;
        const { error: erreurUpload } = await supabaseAdmin.storage.from("produits").upload(chemin, buffer, { contentType: typeContenu, upsert: true });
        if (!erreurUpload) {
          const { data: dataUrl } = supabaseAdmin.storage.from("produits").getPublicUrl(chemin);
          photoHebergeeUrl = dataUrl.publicUrl;
        }
      }
    } catch (e) { /* pas grave si la photo échoue à être rapatriée, le nom reste utile seul */ }
  }

  return res.status(200).json({
    nom: nom ? nom.trim().slice(0, 150) : null,
    photo_url: photoHebergeeUrl,
    prix_trouve: prix,
    devise_prix_trouve: devisePrix,
  });
}

// ===== POST "identifier_produit_depuis_photo" : quand le marchand n'a ni lien ni nom à donner
// — juste une photo — Claude regarde l'image (compréhension d'image, pas génération) et
// identifie lui-même de quoi il s'agit, puis rédige la même fiche en sections que les deux
// autres méthodes. Honnête sur les limites : si la photo est floue ou ambiguë, l'IA le dit
// plutôt que d'inventer un produit qu'elle ne reconnaît pas clairement.
async function gererIdentifierProduitDepuisPhoto(req, res, user) {
  const { image_base64, media_type, description_sommaire } = req.body;
  if (!image_base64) return res.status(400).json({ error: "Aucune image reçue" });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "Intégration requise : ANTHROPIC_API_KEY non configurée côté serveur" });

  const contexteComplementaire = description_sommaire && description_sommaire.trim()
    ? `\n\nLe marchand a aussi donné cette précision en quelques mots : "${description_sommaire.trim()}".`
    : "";

  const prompt = `Tu es un rédacteur e-commerce expérimenté, spécialisé dans les pages produits qui donnent envie d'acheter en Afrique de l'Ouest (paiement à la livraison).

Regarde attentivement cette photo et identifie précisément de quel produit il s'agit.${contexteComplementaire}

Réponds UNIQUEMENT avec un objet JSON, dans ce format exact :
{
  "produit_reconnu": true ou false — mets false si tu n'arrives pas à identifier clairement un produit vendable sur cette image,
  "titre_ameliore": "un titre de produit clair et vendeur, basé sur ce que tu vois réellement sur la photo",
  "description_html": "la page produit complète, en HTML, structurée en 3 à 4 sections (voir consignes ci-dessous)",
  "categorie_suggeree": "une catégorie e-commerce simple (ex: Mode, Électronique, Beauté, Maison, Auto...)"
}

Pour "description_html", construis une vraie page produit, avec cette logique :
1. Une section d'accroche qui parle du besoin ou du problème que le produit résout, basée sur ce que tu observes réellement sur la photo (<h3> + <p>).
2. Une section "Pourquoi ce produit" avec 3-4 arguments de vente concrets, en <ul><li>, basés sur ce qui est visible.
3. Une section "Comment l'utiliser" ou "Pour qui" selon ce qui est le plus pertinent (<h3> + <p>).
4. Avant la dernière section, insère un <h4> commençant par "🎥 Astuce vidéo :" suggérant ce qu'une courte vidéo de démonstration pourrait montrer.

Utilise UNIQUEMENT ces balises HTML : <h3>, <h4>, <p>, <ul>, <li>, <strong>. Jamais de <img> ni <video>.

IMPORTANT : ne décris QUE ce que tu vois réellement sur la photo. N'invente jamais de marque, de prix, de certification, ou de caractéristique technique précise que tu ne peux pas voir. Si l'image est trop floue, trop sombre, ou ne montre pas clairement un produit vendable, mets "produit_reconnu": false et laisse les autres champs vides plutôt que d'inventer. Réponds uniquement le JSON, sans texte autour, sans balises \`\`\`json.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5", max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image_base64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(400).json({ error: data?.error?.message || "Erreur API Claude" });
  const texteBrut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

  let ficheGeneree;
  try {
    const jsonMatch = texteBrut.match(/\{[\s\S]*\}/);
    ficheGeneree = JSON.parse(jsonMatch ? jsonMatch[0] : texteBrut);
  } catch (e) {
    return res.status(400).json({ error: "Réponse IA non exploitable, réessaie." });
  }

  if (ficheGeneree.produit_reconnu === false) {
    return res.status(200).json({ fiche: null, non_reconnu: true });
  }

  return res.status(200).json({ fiche: ficheGeneree });
}

export default async function handler(req, res) {
  // Ces 3 actions servent à tous les abonnés RecuVente (pas seulement le compte propriétaire) —
  // vérifiées différemment, avant le contrôle admin qui, lui, reste réservé à l'AI Company OS.
  if (req.method === "POST" && req.body?.action === "generer_fiche_produit_ia") {
    const userMembre = await verifierMembreWorkspace(req, res);
    if (!userMembre) return;
    return gererGenererFicheProduitIA(req, res, userMembre);
  }
  if (req.method === "POST" && req.body?.action === "generer_configuration_boutique_ia") {
    const userMembre = await verifierMembreWorkspace(req, res);
    if (!userMembre) return;
    return gererGenererConfigurationBoutiqueIA(req, res, userMembre);
  }
  if (req.method === "POST" && req.body?.action === "generer_boutique_complete_ia") {
    const userMembre = await verifierMembreWorkspace(req, res);
    if (!userMembre) return;
    return gererGenererBoutiqueCompleteIA(req, res, userMembre);
  }
  if (req.method === "POST" && req.body?.action === "extraire_produit_depuis_lien") {
    const userMembre = await verifierMembreWorkspace(req, res);
    if (!userMembre) return;
    return gererExtraireProduitDepuisLien(req, res, userMembre);
  }
  if (req.method === "POST" && req.body?.action === "identifier_produit_depuis_photo") {
    const userMembre = await verifierMembreWorkspace(req, res);
    if (!userMembre) return;
    return gererIdentifierProduitDepuisPhoto(req, res, userMembre);
  }

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
  if (req.method === "POST" && req.body?.action === "subscriber_growth_ask") return gererSubscriberGrowthAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "hr_ask") return gererHrAsk(req, res, user);
  if (req.method === "POST" && req.body?.action === "ads_ask") return gererAdsAsk(req, res, user);
  if (req.method === "POST") return gererPOST(req, res);
  return gererGET(req, res);
}
