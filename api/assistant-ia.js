import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { question, workspaceId } = req.body;
  if (!question || !workspaceId) return res.status(400).json({ error: "Question et workspaceId requis" });

  // Vérifie que l'utilisateur appartient bien à cet espace
  const { data: membre } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membre) return res.status(403).json({ error: "Accès refusé à cet espace" });

  // ===== Rassemble un résumé des données réelles de l'entreprise =====
  const trenteJoursAvant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("name, currency, activity_type")
    .eq("id", workspaceId)
    .single();

  const { data: commandes } = await supabaseAdmin
    .from("commandes")
    .select("client, produit, montant, statut, livreur, closer, zone, created_at, confirmed_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", trenteJoursAvant)
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: livreurs } = await supabaseAdmin
    .from("livreurs")
    .select("nom")
    .eq("workspace_id", workspaceId);

  const { data: produits } = await supabaseAdmin
    .from("produits")
    .select("nom, cout_achat, frais_import_unitaire, prix_vente")
    .eq("workspace_id", workspaceId);

  const liste = commandes || [];
  const confirmees = liste.filter((c) => c.statut === "confirmee");
  const echouees = liste.filter((c) => c.statut === "echouee");
  const enCours = liste.filter((c) => c.statut === "en_cours");
  const caTotal = confirmees.reduce((s, c) => s + Number(c.montant), 0);

  const parLivreur = {};
  confirmees.forEach((c) => {
    if (!c.livreur) return;
    parLivreur[c.livreur] = (parLivreur[c.livreur] || 0) + 1;
  });

  const parProduit = {};
  confirmees.forEach((c) => {
    parProduit[c.produit] = (parProduit[c.produit] || 0) + 1;
  });

  const parZone = {};
  liste.forEach((c) => {
    if (!c.zone) return;
    if (!parZone[c.zone]) parZone[c.zone] = { total: 0, echouees: 0 };
    parZone[c.zone].total += 1;
    if (c.statut === "echouee") parZone[c.zone].echouees += 1;
  });

  const resume = {
    entreprise: workspace?.name,
    devise: workspace?.currency,
    periode: "30 derniers jours",
    nb_commandes_total: liste.length,
    nb_confirmees: confirmees.length,
    nb_echouees: echouees.length,
    nb_en_cours: enCours.length,
    chiffre_affaires_confirme: caTotal,
    commandes_confirmees_par_livreur: parLivreur,
    ventes_par_produit: parProduit,
    echecs_par_zone: parZone,
    catalogue_produits: (produits || []).map((p) => ({
      nom: p.nom,
      cout_reel: Number(p.cout_achat || 0) + Number(p.frais_import_unitaire || 0),
      prix_vente: p.prix_vente,
    })),
    nombre_livreurs: (livreurs || []).length,
  };

  try {
    const reponseClaude = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: `Tu es l'assistant intégré de RecuVente, une application de gestion pour les commerçants africains. Tu réponds aux questions du propriétaire de l'entreprise "${resume.entreprise}" en te basant UNIQUEMENT sur les données ci-dessous (30 derniers jours). Réponds en français, de façon directe, chiffrée et actionnable, en 2-4 phrases maximum. Si une information n'est pas dans les données, dis-le clairement plutôt que d'inventer.

Données de l'entreprise :
${JSON.stringify(resume, null, 2)}`,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!reponseClaude.ok) {
      const erreurTexte = await reponseClaude.text();
      console.error("Erreur API Claude:", erreurTexte);
      return res.status(500).json({ error: "L'assistant n'a pas pu répondre pour le moment." });
    }

    const data = await reponseClaude.json();
    const texteReponse = data.content?.find((bloc) => bloc.type === "text")?.text || "Je n'ai pas pu formuler de réponse.";

    return res.status(200).json({ reponse: texteReponse });
  } catch (e) {
    console.error("Erreur assistant IA:", e);
    return res.status(500).json({ error: "Erreur technique de l'assistant." });
  }
}
