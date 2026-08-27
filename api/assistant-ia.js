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

  const { data: membre } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membre) return res.status(403).json({ error: "Accès refusé à cet espace" });

  const trenteJoursAvant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: workspace }, { data: commandes }, { data: livreurs }, { data: produits }] = await Promise.all([
    supabaseAdmin.from("workspaces").select("name, currency, activity_type").eq("id", workspaceId).single(),
    supabaseAdmin
      .from("commandes")
      .select("client, produit, montant, statut, livreur, closer, zone, created_at, confirmed_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", trenteJoursAvant)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin.from("livreurs").select("nom").eq("workspace_id", workspaceId),
    supabaseAdmin.from("produits").select("nom, cout_achat, frais_import_unitaire, prix_vente").eq("workspace_id", workspaceId),
  ]);

  const liste = commandes || [];
  const confirmees = liste.filter((c) => c.statut === "confirmee");

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

  function calculerPeriode(nbJours) {
    const debut = new Date(Date.now() - nbJours * 24 * 60 * 60 * 1000);
    const sousListe = liste.filter((c) => new Date(c.created_at) >= debut);
    const sousConfirmees = sousListe.filter((c) => c.statut === "confirmee");
    return {
      nb_commandes: sousListe.length,
      nb_confirmees: sousConfirmees.length,
      nb_echouees: sousListe.filter((c) => c.statut === "echouee").length,
      chiffre_affaires: sousConfirmees.reduce((s, c) => s + Number(c.montant), 0),
    };
  }

  const resume = {
    entreprise: workspace?.name,
    devise: workspace?.currency,
    date_du_jour: new Date().toISOString().slice(0, 10),
    aujourdhui: calculerPeriode(1),
    sept_derniers_jours: calculerPeriode(7),
    trente_derniers_jours: calculerPeriode(30),
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

  const promptSysteme = `Tu es l'assistant intégré de RecuVente, une application de gestion pour les commerçants africains. Tu réponds aux questions du propriétaire de l'entreprise "${resume.entreprise}" en te basant UNIQUEMENT sur les données ci-dessous, déjà calculées pour toi (aujourd'hui, 7 derniers jours, 30 derniers jours — utilise "sept_derniers_jours" pour toute question sur "cette semaine"). Réponds en français, de façon directe, chiffrée et actionnable, en 2-4 phrases maximum. Si une information n'est vraiment pas dans les données, dis-le clairement plutôt que d'inventer.

Données de l'entreprise :
${JSON.stringify(resume, null, 2)}

Question du propriétaire : ${question}`;

  try {
    const controleurDelai = new AbortController();
    const delaiId = setTimeout(() => controleurDelai.abort(), 9000);

    const reponseGemini = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptSysteme }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.2 },
        }),
        signal: controleurDelai.signal,
      }
    );
    clearTimeout(delaiId);

    if (!reponseGemini.ok) {
      const erreurTexte = await reponseGemini.text();
      console.error("Erreur API Gemini:", erreurTexte);
      return res.status(500).json({ error: "Erreur Gemini (code " + reponseGemini.status + ") : " + erreurTexte.slice(0, 300) });
    }

    const data = await reponseGemini.json();
    const texteReponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Je n'ai pas pu formuler de réponse.";

    return res.status(200).json({ reponse: texteReponse.trim() });
  } catch (e) {
    console.error("Erreur assistant IA:", e);
    if (e.name === "AbortError") {
      return res.status(500).json({ error: "Gemini a mis trop de temps à répondre. Réessaie." });
    }
    return res.status(500).json({ error: "Erreur technique de l'assistant : " + e.message });
  }
}
