import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VERCEL_PROJECT = "recuvente-saas"; // nom exact du projet sur Vercel

export default async function handler(req, res) {
  // ===== PROSPECTION AUTOMATIQUE 24/24 (déclenchée par GitHub Actions) =====
  // Contourne la limite "une fois par jour" des tâches planifiées Vercel gratuites :
  // GitHub Actions appelle cette route toutes les quelques heures, en continu.
  // Appel : POST /api/domains { action: "prospection_auto" }, avec en-tête
  // Authorization: Bearer <PROSPECTION_SECRET>
  if (req.method === "POST" && req.body?.action === "prospection_auto") {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${process.env.PROSPECTION_SECRET}`) {
      return res.status(401).json({ error: "Non autorisé" });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante côté serveur" });

    // Secteurs et villes qui correspondent réellement au profil de client
    // idéal de RecuVente (COD, gestion manuelle par WhatsApp/Instagram, PME africaines).
    const SECTEURS_CIBLES = [
      "boutiques de vêtements sur Instagram",
      "vendeurs de cosmétiques et produits de beauté sur WhatsApp",
      "boutiques d'électronique et téléphones",
      "restaurants avec livraison à domicile",
      "vendeurs de chaussures et accessoires",
      "boutiques de produits pour bébés et enfants",
      "magasins de pièces automobiles",
      "vendeurs de produits capillaires et perruques",
      "boutiques en ligne sans vraie plateforme de vente",
      "entreprises de livraison à domicile",
      "vendeurs de compléments alimentaires et bien-être",
      "boutiques de décoration et maison",
    ];
    const VILLES_CIBLES = ["Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Korhogo", "Daloa"];
    const secteur = SECTEURS_CIBLES[Math.floor(Math.random() * SECTEURS_CIBLES.length)];
    const ville = VILLES_CIBLES[Math.floor(Math.random() * VILLES_CIBLES.length)];

    const prompt = `Tu es un agent de recherche commerciale pour RecuVente, une plateforme de gestion de boutique en ligne et paiement à la livraison pour l'Afrique de l'Ouest (abonnement à 9 500 FCFA/mois : création de boutique en ligne, gestion des commandes, des livreurs, des clients, du stock, marketing WhatsApp).

Cherche sur le web 5 entreprises RÉELLES et VÉRIFIABLES dans le secteur "${secteur}" à ${ville}, Côte d'Ivoire, qui semblent gérer leurs ventes de façon manuelle (WhatsApp, Instagram, sans vraie boutique en ligne) et pourraient bénéficier de RecuVente.

Pour CHAQUE entreprise trouvée, réponds uniquement avec un objet JSON dans un tableau, avec ces champs exacts :
{
  "nom": "nom du compte/entreprise",
  "secteur": "...",
  "ville": "...",
  "site_web_ou_reseau": "URL réelle trouvée",
  "probleme_identifie": "ce qui suggère qu'ils géreraient mieux avec RecuVente",
  "score": nombre de 0 à 100 selon le potentiel,
  "message_suggere": "message court, humain, personnalisé en français ivoirien, présentant RecuVente et son prix, adapté à ce prospect précis"
}

Ne réponds QUE le tableau JSON, sans texte autour. N'invente aucune entreprise — n'utilise que des résultats de recherche réels.`;

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return res.status(500).json({ error: data?.error?.message || "Erreur API Claude" });

      const texteReponse = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const matchJSON = texteReponse.match(/\[[\s\S]*\]/);
      if (!matchJSON) return res.status(200).json({ success: true, inseres: 0, secteur, ville });

      const prospectsTrouves = JSON.parse(matchJSON[0]);
      const lignesAInserer = prospectsTrouves.map((p) => ({
        nom: p.nom || null,
        entreprise: p.nom || null,
        secteur: p.secteur || secteur,
        ville: p.ville || ville,
        pays: "CI",
        source: "agent_ia_auto",
        site_web: p.site_web_ou_reseau || null,
        probleme_identifie: p.probleme_identifie || null,
        score: Number(p.score) || 0,
        message_suggere: p.message_suggere || null,
        statut: "NEW",
      }));
      if (lignesAInserer.length > 0) await supabaseAdmin.from("prospects").insert(lignesAInserer);

      return res.status(200).json({ success: true, inseres: lignesAInserer.length, secteur, ville });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ===== AGENT DE RECHERCHE DE PROSPECTS (IA, déclenché manuellement depuis le tableau de bord) =====
  // Fusionné ici pour ne pas dépasser la limite de fonctions du plan Vercel Hobby.
  // Appel : POST /api/domains { action: "prospection", secteur, ville }
  if (req.method === "POST" && req.body?.action === "prospection") {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY manquante côté serveur" });

    const { secteur, ville } = req.body;
    if (!secteur) return res.status(400).json({ error: "Le secteur est requis (ex: 'boutiques de vêtements Instagram')" });

    const prompt = `Tu es un agent de recherche commerciale pour RecuVente, une plateforme de gestion de boutique en ligne et paiement à la livraison pour l'Afrique de l'Ouest (abonnement à 9 500 FCFA/mois : création de boutique en ligne, gestion des commandes, des livreurs, des clients, du stock, marketing WhatsApp).

Cherche sur le web ${5} entreprises RÉELLES et VÉRIFIABLES dans le secteur "${secteur}"${ville ? ` à ${ville}, Côte d'Ivoire` : " en Côte d'Ivoire"}, qui semblent gérer leurs ventes de façon manuelle (WhatsApp, Instagram, sans vraie boutique en ligne) et pourraient bénéficier de RecuVente.

Pour CHAQUE entreprise trouvée, réponds uniquement avec un objet JSON dans un tableau, avec ces champs exacts :
{
  "nom": "nom du compte/entreprise",
  "secteur": "...",
  "ville": "...",
  "site_web_ou_reseau": "URL réelle trouvée",
  "probleme_identifie": "ce qui suggère qu'ils géreraient mieux avec RecuVente",
  "score": nombre de 0 à 100 selon le potentiel,
  "message_suggere": "message court, humain, personnalisé en français ivoirien, présentant RecuVente et son prix, adapté à ce prospect précis"
}

Ne réponds QUE le tableau JSON, sans texte autour. N'invente aucune entreprise — n'utilise que des résultats de recherche réels.`;

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });

      const data = await resp.json();
      if (!resp.ok) return res.status(500).json({ error: data?.error?.message || "Erreur API Claude" });

      const texteReponse = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const matchJSON = texteReponse.match(/\[[\s\S]*\]/);
      if (!matchJSON) return res.status(200).json({ success: true, prospects: [], brut: texteReponse });

      let prospectsTrouves;
      try {
        prospectsTrouves = JSON.parse(matchJSON[0]);
      } catch {
        return res.status(200).json({ success: true, prospects: [], erreurParsing: true, brut: texteReponse });
      }

      const lignesAInserer = prospectsTrouves.map((p) => ({
        nom: p.nom || null,
        entreprise: p.nom || null,
        secteur: p.secteur || secteur,
        ville: p.ville || ville || null,
        pays: "CI",
        source: "agent_ia",
        site_web: p.site_web_ou_reseau || null,
        probleme_identifie: p.probleme_identifie || null,
        score: Number(p.score) || 0,
        message_suggere: p.message_suggere || null,
        statut: "NEW",
      }));

      if (lignesAInserer.length > 0) {
        await supabaseAdmin.from("prospects").insert(lignesAInserer);
      }

      return res.status(200).json({ success: true, prospects: lignesAInserer });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ===== FLUX PRODUITS (Facebook/Google Shopping) =====
  // Fusionné ici pour ne pas dépasser la limite de fonctions du plan Vercel Hobby.
  // Appel : GET /api/domains?feed=1&workspace=WORKSPACE_ID
  if (req.method === "GET" && req.query.feed) {
    const workspaceId = req.query.workspace;
    if (!workspaceId) return res.status(400).send("Paramètre workspace manquant.");

    const { data: produits, error } = await supabaseAdmin.rpc("flux_produits_public", {
      p_workspace_id: workspaceId,
    });

    if (error) return res.status(500).send("Erreur lors du chargement des produits : " + error.message);
    if (!produits || produits.length === 0) return res.status(404).send("Aucun produit trouvé pour cette boutique.");

    const echapper = (texte) =>
      String(texte || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const nomBoutique = echapper(produits[0].nom_boutique || "Ma boutique");
    const slug = produits[0].slug;
    const urlBoutique = slug ? `https://recuvente-saas.vercel.app/?boutique=${slug}` : `https://recuvente-saas.vercel.app/?catalogue=${workspaceId}`;

    const items = produits
      .map((p) => {
        const urlProduit = `${urlBoutique}&produit=${p.produit_id}`;
        return `
    <item>
      <g:id>${p.produit_id}</g:id>
      <title>${echapper(p.produit_nom)}</title>
      <description>${echapper(p.description || p.produit_nom)}</description>
      <link>${echapper(urlProduit)}</link>
      <g:image_link>${echapper(p.photo_url)}</g:image_link>
      <g:availability>${p.en_stock ? "in stock" : "out of stock"}</g:availability>
      <g:price>${Number(p.prix_vente).toFixed(2)} ${p.devise}</g:price>
      <g:brand>${nomBoutique}</g:brand>
      <g:condition>new</g:condition>
    </item>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${nomBoutique}</title>
  <link>${echapper(urlBoutique)}</link>
  <description>Catalogue produits de ${nomBoutique}</description>${items}
</channel>
</rss>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(xml);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Non authentifié" });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: "Session invalide" });

  const { workspaceId, domaine, action } = req.body;
  if (!workspaceId || !domaine) return res.status(400).json({ error: "Champs manquants" });

  // Seul le propriétaire de l'espace peut gérer son propre domaine
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();
  if (!ws || ws.owner_id !== userData.user.id) {
    return res.status(403).json({ error: "Seul le propriétaire de cet espace peut gérer son domaine" });
  }

  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!vercelToken) return res.status(500).json({ error: "Configuration serveur incomplète (VERCEL_API_TOKEN manquant)" });

  const domainePropre = domaine.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

  // ===== RETIRER =====
  if (action === "remove") {
    const resp = await fetch(`https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/domains/${domainePropre}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!resp.ok && resp.status !== 404) {
      const err = await resp.json().catch(() => ({}));
      return res.status(400).json({ error: err?.error?.message || "Erreur lors du retrait du domaine sur Vercel" });
    }
    return res.status(200).json({ success: true });
  }

  // ===== AJOUTER =====
  const resp = await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT}/domains`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domainePropre }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Vercel renvoie un message clair, on le relaie tel quel
    return res.status(400).json({ error: data?.error?.message || "Erreur lors de l'ajout du domaine sur Vercel" });
  }

  // Vercel indique quels enregistrements DNS le client doit ajouter chez SON registrar.
  // On relaie cette info telle quelle, sans l'inventer.
  const verification = data.verification || [];
  const configureA = !domainePropre.includes(".") ? [] : [{ type: "A", name: "@", value: "76.76.21.21" }];

  return res.status(200).json({
    success: true,
    domaine: domainePropre,
    verified: data.verified === true,
    instructions: {
      cname: { type: "CNAME", name: domainePropre.split(".").length > 2 ? domainePropre.split(".")[0] : "www", value: "cname.vercel-dns.com" },
      a: configureA[0] || null,
      verification,
    },
  });
}
