// ============================================================================
//  PAIEMENT EN LIGNE — 100 % OPTIONNEL, branché par le commerçant lui-même.
//
//  Le commerçant garde le paiement à la livraison comme avant. S'il le souhaite, il branche SON compte
//  CinetPay ou PayDunya (Réglages → Paiement en ligne) : l'argent va directement sur SON compte, RecuVente
//  ne touche jamais l'argent des clients.
//
//  Sécurité (règles de ce fichier) :
//   - Les clés du commerçant vivent dans une table privée (workspace_options) : jamais renvoyées en clair.
//   - On ne fait JAMAIS confiance à la notification reçue (elle peut être forgée par n'importe qui) :
//     on redemande toujours le vrai statut au fournisseur avec les clés du commerçant, puis on compare
//     le montant et la monnaie avant de créditer quoi que ce soit.
//   - Un paiement n'est crédité qu'une seule fois (verrou atomique), même si le fournisseur notifie
//     plusieurs fois ou si le client recharge la page.
//   - Une commande payée en ligne n'est PAS marquée « livrée » : elle reste à livrer.
// ============================================================================
import crypto from "crypto";
import { supabaseAdmin, UUID, urlApp, lireOption, ecrireOption, tropDeRequetes, ipDe, roleMembre } from "./options.js";

const CLE_OPTION = "paiement_en_ligne";
export const DEVISES_PAR_FOURNISSEUR = {
  cinetpay: ["XOF", "XAF", "CDF", "GNF", "USD"],
  paydunya: ["XOF"],
};
const FOURNISSEURS = Object.keys(DEVISES_PAR_FOURNISSEUR);
const REF = /^RV[0-9A-F]{16}$/;

// ---------- Configuration du commerçant ----------
function nettoyer(v) {
  return typeof v === "string" ? v.replace(/\s+/g, "").slice(0, 200) : "";
}

function cleCompletes(cfg) {
  if (!cfg) return false;
  if (cfg.provider === "cinetpay") return !!(cfg.cinetpay?.apikey && cfg.cinetpay?.site_id);
  if (cfg.provider === "paydunya") return !!(cfg.paydunya?.master_key && cfg.paydunya?.private_key && cfg.paydunya?.token);
  return false;
}

async function lireConfigActive(workspaceId) {
  const cfg = await lireOption(workspaceId, CLE_OPTION);
  if (!cfg || !cfg.actif || !FOURNISSEURS.includes(cfg.provider) || !cleCompletes(cfg)) return null;
  return cfg;
}

function masquer(v) {
  const s = String(v || "");
  return s ? "••••" + s.slice(-4) : "";
}

export async function lireConfigMarchand(workspaceId) {
  const cfg = (await lireOption(workspaceId, CLE_OPTION)) || {};
  const { data: ws } = await supabaseAdmin.from("workspaces").select("currency").eq("id", workspaceId).maybeSingle();
  return {
    provider: FOURNISSEURS.includes(cfg.provider) ? cfg.provider : "cinetpay",
    actif: !!cfg.actif && cleCompletes(cfg),
    mode_test: !!cfg.mode_test,
    canaux: cfg.canaux === "ALL" ? "ALL" : "MOBILE_MONEY",
    devise: ws?.currency || null,
    devises_ok: DEVISES_PAR_FOURNISSEUR,
    cles: {
      cinetpay: { apikey: masquer(cfg.cinetpay?.apikey), site_id: masquer(cfg.cinetpay?.site_id) },
      paydunya: { master_key: masquer(cfg.paydunya?.master_key), private_key: masquer(cfg.paydunya?.private_key), token: masquer(cfg.paydunya?.token) },
    },
  };
}

export async function enregistrerConfigMarchand(workspaceId, corps) {
  const ancienne = (await lireOption(workspaceId, CLE_OPTION)) || {};
  const provider = FOURNISSEURS.includes(corps.provider) ? corps.provider : ancienne.provider || "cinetpay";
  const fusion = (nouveau, ancien) => {
    const v = nettoyer(nouveau);
    return v && !v.startsWith("•") ? v : ancien || "";
  };
  const c = corps.cles || {};
  const cfg = {
    provider,
    mode_test: !!corps.mode_test,
    canaux: corps.canaux === "ALL" ? "ALL" : "MOBILE_MONEY",
    cinetpay: { apikey: fusion(c.cinetpay?.apikey, ancienne.cinetpay?.apikey), site_id: fusion(c.cinetpay?.site_id, ancienne.cinetpay?.site_id) },
    paydunya: {
      master_key: fusion(c.paydunya?.master_key, ancienne.paydunya?.master_key),
      private_key: fusion(c.paydunya?.private_key, ancienne.paydunya?.private_key),
      token: fusion(c.paydunya?.token, ancienne.paydunya?.token),
    },
  };
  cfg.actif = !!corps.actif;
  if (cfg.actif && !cleCompletes(cfg)) throw new Error("Renseigne toutes les clés avant d'activer le paiement en ligne.");
  if (cfg.actif) {
    const { data: ws } = await supabaseAdmin.from("workspaces").select("currency").eq("id", workspaceId).maybeSingle();
    const devise = String(ws?.currency || "XOF").toUpperCase();
    if (!DEVISES_PAR_FOURNISSEUR[provider].includes(devise)) {
      throw new Error(`${provider === "cinetpay" ? "CinetPay" : "PayDunya"} ne gère pas la monnaie de ta boutique (${devise}). Monnaies possibles : ${DEVISES_PAR_FOURNISSEUR[provider].join(", ")}.`);
    }
  }
  await ecrireOption(workspaceId, CLE_OPTION, cfg);
  return lireConfigMarchand(workspaceId);
}

// ---------- Appels aux fournisseurs ----------
async function appel(url, options = {}, delaiMs = 12000) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    const r = await fetch(url, { ...options, signal: controleur.signal });
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch (_) {}
    return { ok: r.ok, statut: r.status, json, texte };
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Le service de paiement ne répond pas." : "Impossible de joindre le service de paiement.");
  } finally {
    clearTimeout(minuteur);
  }
}

function descriptionPropre(s) {
  return String(s || "Commande").replace(/[#/$_&<>"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Commande";
}

// Montant réellement demandé au fournisseur (CinetPay exige un multiple de 5).
export function montantADemander(fournisseur, montant, devise) {
  const m = Number(montant);
  if (fournisseur === "cinetpay") return String(devise).toUpperCase() === "USD" ? Math.ceil(m) : Math.ceil(m / 5) * 5;
  return Math.ceil(m);
}

const adaptateurs = {
  cinetpay: {
    async creer(cfg, p) {
      const c = cfg.cinetpay;
      const corps = {
        apikey: c.apikey,
        site_id: c.site_id,
        transaction_id: p.reference,
        amount: p.montant,
        currency: p.devise,
        description: descriptionPropre(p.description),
        notify_url: p.urlNotif,
        return_url: p.urlRetour,
        channels: cfg.canaux === "ALL" ? "ALL" : "MOBILE_MONEY",
        lang: "fr",
      };
      if (cfg.canaux === "ALL") {
        // La carte bancaire exige ces champs chez CinetPay ; à défaut de mieux, des valeurs neutres.
        const [prenom, ...reste] = String(p.client || "Client").trim().split(/\s+/);
        Object.assign(corps, {
          customer_name: prenom || "Client",
          customer_surname: reste.join(" ") || prenom || "Client",
          customer_email: "client@recuvente.com",
          customer_phone_number: String(p.tel || "").replace(/[^\d+]/g, "").slice(0, 20) || "0000000000",
          customer_address: "Adresse",
          customer_city: "Ville",
          customer_country: "CI",
          customer_state: "CI",
          customer_zip_code: "00000",
        });
      }
      const r = await appel("https://api-checkout.cinetpay.com/v2/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const j = r.json || {};
      const url = j.data?.payment_url;
      if (String(j.code) !== "201" || !url) {
        throw new Error(`CinetPay a refusé la demande : ${j.description || j.message || "vérifie tes clés (identifiant du site et clé API)."}`);
      }
      return { url, jeton: j.data?.payment_token || null };
    },
    async verifier(cfg, p) {
      const c = cfg.cinetpay;
      const r = await appel("https://api-checkout.cinetpay.com/v2/payment/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: c.apikey, site_id: c.site_id, transaction_id: p.reference }),
      });
      const j = r.json;
      if (!j) throw new Error("Réponse illisible de CinetPay.");
      const etat = String(j.data?.status || "").toUpperCase();
      if (String(j.code) === "00" && etat === "ACCEPTED") return { statut: "paye", montant: Number(j.data?.amount), devise: j.data?.currency || null };
      if (etat === "REFUSED") return { statut: "echec" };
      return { statut: "attente" };
    },
  },

  paydunya: {
    base(cfg) {
      return cfg.mode_test ? "https://app.paydunya.com/sandbox-api/v1" : "https://app.paydunya.com/api/v1";
    },
    entetes(cfg) {
      const c = cfg.paydunya;
      return {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": c.master_key,
        "PAYDUNYA-PRIVATE-KEY": c.private_key,
        "PAYDUNYA-TOKEN": c.token,
      };
    },
    async creer(cfg, p) {
      const r = await appel(`${this.base(cfg)}/checkout-invoice/create`, {
        method: "POST",
        headers: this.entetes(cfg),
        body: JSON.stringify({
          invoice: { total_amount: p.montant, description: descriptionPropre(p.description) },
          store: { name: String(p.boutique || "Boutique").slice(0, 60) },
          custom_data: { reference: p.reference },
          actions: { callback_url: p.urlNotif, return_url: p.urlRetour, cancel_url: p.urlAnnule || p.urlRetour },
        }),
      });
      const j = r.json || {};
      if (String(j.response_code) !== "00" || !/^https?:\/\//.test(String(j.response_text || ""))) {
        throw new Error(`PayDunya a refusé la demande : ${j.response_text || "vérifie tes clés (clé principale, clé privée et jeton)."}`);
      }
      return { url: j.response_text, jeton: j.token || null };
    },
    async verifier(cfg, p) {
      if (!p.jeton) throw new Error("Jeton PayDunya manquant.");
      const r = await appel(`${this.base(cfg)}/checkout-invoice/confirm/${encodeURIComponent(p.jeton)}`, { method: "GET", headers: this.entetes(cfg) });
      const j = r.json;
      if (!j) throw new Error("Réponse illisible de PayDunya.");
      const etat = String(j.status || "").toLowerCase();
      if (etat === "completed") return { statut: "paye", montant: Number(j.invoice?.total_amount ?? j.total_amount), devise: "XOF" };
      if (etat === "cancelled" || etat === "failed") return { statut: "echec" };
      return { statut: "attente" };
    },
  },
};

// « Tester mes clés » : demande un lien de 100 unités sans rien enregistrer ni débiter personne.
export async function testerConfig(workspaceId) {
  const cfg = await lireOption(workspaceId, CLE_OPTION);
  if (!cfg || !FOURNISSEURS.includes(cfg.provider) || !cleCompletes(cfg)) return { ok: false, message: "Enregistre d'abord toutes tes clés." };
  const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency").eq("id", workspaceId).maybeSingle();
  const devise = String(ws?.currency || "XOF").toUpperCase();
  if (!DEVISES_PAR_FOURNISSEUR[cfg.provider].includes(devise)) return { ok: false, message: `Ce service ne gère pas la monnaie de ta boutique (${devise}).` };
  try {
    await adaptateurs[cfg.provider].creer(cfg, {
      reference: "RV" + crypto.randomBytes(8).toString("hex").toUpperCase(),
      montant: montantADemander(cfg.provider, 100, devise),
      devise,
      description: "Test de connexion",
      boutique: ws?.name,
      client: "Test",
      urlNotif: `${urlApp()}/api/chariow?ipn=${cfg.provider}&ref=TEST`,
      urlRetour: urlApp(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ---------- Côté boutique publique ----------
const cacheDispo = new Map();
export async function disponibilite(workspaceId) {
  const c = cacheDispo.get(workspaceId);
  if (c && Date.now() - c.t < 30000) return c.v;
  let v = { actif: false };
  try {
    const cfg = await lireConfigActive(workspaceId);
    if (cfg) {
      const { data: ws } = await supabaseAdmin.from("workspaces").select("currency").eq("id", workspaceId).maybeSingle();
      const devise = String(ws?.currency || "XOF").toUpperCase();
      if (DEVISES_PAR_FOURNISSEUR[cfg.provider].includes(devise)) v = { actif: true, provider: cfg.provider, canaux: cfg.canaux };
    }
  } catch (_) {}
  cacheDispo.set(workspaceId, { t: Date.now(), v });
  if (cacheDispo.size > 500) cacheDispo.clear();
  return v;
}

export async function repondreDisponibilite(req, res) {
  const id = String(req.query.paiement || "");
  if (!UUID.test(id)) return res.status(400).json({ error: "Boutique invalide" });
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  return res.status(200).json(await disponibilite(id));
}

const STATUTS_NON_PAYABLES = new Set(["annulee", "echouee", "retournee"]);

export async function creerPaiementPublic(req, res) {
  const commandeId = req.body?.commandeId;
  if (typeof commandeId !== "string" || !UUID.test(commandeId)) return res.status(400).json({ error: "Commande invalide" });
  const ip = ipDe(req);
  if (tropDeRequetes(ip, "payer", 12)) return res.status(429).json({ error: "Trop de tentatives, réessaie dans une minute." });

  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, tel, montant, montant_paye, statut, created_at")
    .eq("id", commandeId)
    .maybeSingle();
  if (!cmd) return res.status(404).json({ error: "Commande introuvable" });
  if (STATUTS_NON_PAYABLES.has(cmd.statut)) return res.status(400).json({ error: "Cette commande n'est plus payable." });
  if (Date.now() - new Date(cmd.created_at).getTime() > 30 * 24 * 3600 * 1000) return res.status(400).json({ error: "Cette commande est trop ancienne pour être payée en ligne." });

  const reste = Number(cmd.montant) - Number(cmd.montant_paye || 0);
  if (!(reste > 0)) return res.status(400).json({ error: "Cette commande est déjà entièrement payée.", deja_paye: true });

  const cfg = await lireConfigActive(cmd.workspace_id);
  if (!cfg) return res.status(400).json({ error: "Le paiement en ligne n'est pas disponible pour cette boutique." });
  const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency").eq("id", cmd.workspace_id).maybeSingle();
  const devise = String(ws?.currency || "XOF").toUpperCase();
  if (!DEVISES_PAR_FOURNISSEUR[cfg.provider].includes(devise)) return res.status(400).json({ error: "Monnaie non prise en charge par ce moyen de paiement." });

  const montant = montantADemander(cfg.provider, reste, devise);

  // Lien déjà créé il y a moins de 20 minutes pour le même montant : on le réutilise (évite les doublons).
  const depuis20 = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: recents } = await supabaseAdmin
    .from("paiements_en_ligne")
    .select("reference, montant, lien, statut, created_at")
    .eq("commande_id", cmd.id)
    .eq("statut", "en_attente")
    .gte("created_at", depuis20)
    .order("created_at", { ascending: false })
    .limit(6);
  const reutilisable = (recents || []).find((r) => r.lien && Number(r.montant) === montant);
  if (reutilisable) return res.status(200).json({ url: reutilisable.lien, reference: reutilisable.reference });
  const depuis10 = Date.now() - 10 * 60 * 1000;
  if ((recents || []).filter((r) => new Date(r.created_at).getTime() >= depuis10).length >= 5) return res.status(429).json({ error: "Trop de liens créés pour cette commande, réessaie dans quelques minutes." });

  const reference = "RV" + crypto.randomBytes(8).toString("hex").toUpperCase();
  const base = urlApp();
  try {
    const { url, jeton } = await adaptateurs[cfg.provider].creer(cfg, {
      reference,
      montant,
      devise,
      description: `Commande ${ws?.name || ""}`.trim(),
      boutique: ws?.name,
      client: cmd.client,
      tel: cmd.tel,
      urlNotif: `${base}/api/chariow?ipn=${cfg.provider}&ref=${reference}`,
      urlRetour: `${base}/?suivi=${cmd.id}&paye=1`,
      urlAnnule: `${base}/?suivi=${cmd.id}`,
    });
    const { error } = await supabaseAdmin.from("paiements_en_ligne").insert([{
      reference, workspace_id: cmd.workspace_id, commande_id: cmd.id, provider: cfg.provider, montant, devise, jeton, lien: url,
    }]);
    if (error) return res.status(500).json({ error: "Paiement en ligne pas encore installé (table manquante)." });
    return res.status(200).json({ url, reference });
  } catch (e) {
    return res.status(502).json({ error: "Le paiement en ligne est momentanément indisponible. Tu peux payer à la livraison." , detail: e.message });
  }
}

// ---------- Vérification + crédit du paiement ----------
async function appliquerPaiement(p, montantRecu) {
  const { data: cmd } = await supabaseAdmin
    .from("commandes")
    .select("id, workspace_id, client, montant, montant_paye, statut")
    .eq("id", p.commande_id)
    .maybeSingle();
  if (!cmd) throw new Error("commande introuvable");
  const reste = Math.max(0, Number(cmd.montant) - Number(cmd.montant_paye || 0));
  const credit = Math.min(Number(montantRecu), reste);
  if (credit > 0) {
    // Déjà inscrit lors d'un essai précédent interrompu ? Alors on ne l'inscrit pas deux fois.
    const { data: deja } = await supabaseAdmin
      .from("paiements_commande")
      .select("id")
      .eq("commande_id", cmd.id)
      .like("enregistre_par", `%${p.reference}%`)
      .limit(1);
    if (!deja || deja.length === 0) {
      const ligne = {
        workspace_id: cmd.workspace_id,
        commande_id: cmd.id,
        montant: credit,
        mode_paiement: "en_ligne",
        enregistre_par: `En ligne (${p.provider === "cinetpay" ? "CinetPay" : "PayDunya"}) ${p.reference}`,
      };
      let { error } = await supabaseAdmin.from("paiements_commande").insert([ligne]);
      // Si la base n'accepte pas ce mode de paiement (règle plus ancienne), on l'inscrit en « cash » : la trace
      // « En ligne » reste dans le nom de celui qui l'a enregistré, et le suivi des livreurs s'appuie sur paiements_en_ligne.
      if (error) ({ error } = await supabaseAdmin.from("paiements_commande").insert([{ ...ligne, mode_paiement: "cash" }]));
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabaseAdmin.from("commandes").update({ montant_paye: Number(cmd.montant_paye || 0) + credit }).eq("id", cmd.id);
      if (e2) throw new Error(e2.message);
    }
  }
  try {
    const notifs = await import("../api/notifications.js");
    await Promise.race([notifs.pousserPaiementRecu({ commande: cmd, montant: montantRecu, devise: p.devise }), new Promise((r) => setTimeout(r, 5000))]);
  } catch (_) {}
  return { credit };
}

const derniereVerif = new Map();

export async function verifierEtAppliquer(reference, { forcer = true } = {}) {
  if (!REF.test(String(reference || ""))) return { statut: "inconnu" };
  const { data: p } = await supabaseAdmin.from("paiements_en_ligne").select("*").eq("reference", reference).maybeSingle();
  if (!p) return { statut: "inconnu" };
  if (p.statut === "paye") return { statut: "paye", applique: false };
  if (!forcer) {
    const t = derniereVerif.get(reference) || 0;
    if (Date.now() - t < 15000) return { statut: "attente", applique: false };
    derniereVerif.set(reference, Date.now());
    if (derniereVerif.size > 2000) derniereVerif.clear();
  }
  const cfg = await lireOption(p.workspace_id, CLE_OPTION);
  if (!cfg || !FOURNISSEURS.includes(p.provider) || !cleCompletes({ ...cfg, provider: p.provider })) return { statut: "erreur" };
  const r = await adaptateurs[p.provider].verifier({ ...cfg, provider: p.provider }, p); // peut lever une erreur : l'appelant décide
  if (r.statut !== "paye") return { statut: r.statut, applique: false };

  // Le fournisseur affirme « payé » : on contrôle que le montant et la monnaie correspondent bien.
  const attendu = Number(p.montant);
  const memeMonnaie = !r.devise || String(r.devise).toUpperCase() === String(p.devise || "").toUpperCase();
  if (!(Number.isFinite(r.montant) && r.montant + 0.0001 >= attendu) || !memeMonnaie) {
    return { statut: "incoherent", applique: false };
  }

  // Verrou atomique : un seul appel peut faire passer le paiement à « payé » ; les autres s'arrêtent là.
  const { data: gagne } = await supabaseAdmin
    .from("paiements_en_ligne")
    .update({ statut: "paye", paid_at: new Date().toISOString(), montant_paye: r.montant })
    .eq("id", p.id)
    .neq("statut", "paye")
    .select("id");
  if (!gagne || gagne.length === 0) return { statut: "paye", applique: false };
  try {
    await appliquerPaiement(p, r.montant);
  } catch (e) {
    // Le crédit n'a pas pu s'inscrire : on relâche le verrou pour que le prochain contrôle réessaie.
    await supabaseAdmin.from("paiements_en_ligne").update({ statut: "en_attente", paid_at: null, montant_paye: null }).eq("id", p.id);
    throw e;
  }
  return { statut: "paye", applique: true };
}

// Notification (IPN) envoyée par le fournisseur : appelée sur /api/chariow?ipn=cinetpay|paydunya&ref=…
// Le contenu reçu est ignoré ; seule la référence de l'URL sert, puis on vérifie auprès du fournisseur.
export async function traiterIPN(req, res) {
  const fournisseur = String(req.query?.ipn || "");
  const ref = String(req.query?.ref || "").toUpperCase();
  if (!FOURNISSEURS.includes(fournisseur)) return res.status(400).json({ error: "Fournisseur inconnu" });
  if (req.method === "GET" || req.method === "HEAD") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  if (tropDeRequetes(ipDe(req), "ipn", 120)) return res.status(429).json({ error: "Trop de requêtes" });
  if (!REF.test(ref)) return res.status(200).json({ ok: true, ignore: "référence non reconnue" });
  try {
    const r = await verifierEtAppliquer(ref);
    return res.status(200).json({ ok: true, statut: r.statut });
  } catch (e) {
    return res.status(500).json({ error: "Vérification impossible pour l'instant" }); // le fournisseur renverra la notification
  }
}

export async function statutPublic(req, res) {
  const id = String(req.query?.paiement_statut || "");
  if (!UUID.test(id)) return res.status(400).json({ error: "Commande invalide" });
  if (tropDeRequetes(ipDe(req), "statut", 60)) return res.status(429).json({ error: "Trop de requêtes" });
  const { data: cmd } = await supabaseAdmin.from("commandes").select("id, workspace_id, montant, montant_paye, statut").eq("id", id).maybeSingle();
  if (!cmd) return res.status(404).json({ error: "Commande introuvable" });

  // Si le client revient de la page de paiement avant que la notification n'arrive, on vérifie nous-mêmes.
  const depuis = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: attentes } = await supabaseAdmin
    .from("paiements_en_ligne").select("reference").eq("commande_id", id).eq("statut", "en_attente").gte("created_at", depuis).limit(3);
  let en_attente = (attentes || []).length > 0;
  for (const a of attentes || []) {
    try {
      const r = await verifierEtAppliquer(a.reference, { forcer: false });
      if (r.statut === "paye") en_attente = false;
    } catch (_) {}
  }
  const { data: apres } = await supabaseAdmin.from("commandes").select("montant, montant_paye").eq("id", id).maybeSingle();
  const montant = Number(apres?.montant ?? cmd.montant);
  const paye = Number(apres?.montant_paye ?? cmd.montant_paye ?? 0);
  const { data: enLigne } = await supabaseAdmin.from("paiements_en_ligne").select("id").eq("commande_id", id).eq("statut", "paye").limit(1);
  const dispo = await disponibilite(cmd.workspace_id);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    montant,
    montant_paye: paye,
    reste: Math.max(0, montant - paye),
    paye_en_ligne: (enLigne || []).length > 0,
    en_attente,
    paiement_possible: !!dispo.actif && !STATUTS_NON_PAYABLES.has(cmd.statut) && montant - paye > 0,
  });
}

// ---------- Actions du commerçant (depuis l'application) ----------
export async function actionMarchand(action, corps, user) {
  const wsId = corps.workspace_id;
  const role = await roleMembre(user.id, wsId);
  if (role !== "owner" && role !== "admin") return { statut: 403, corps: { error: "Réservé au propriétaire de la boutique." } };
  try {
    if (action === "paiement_config_lire") return { statut: 200, corps: await lireConfigMarchand(wsId) };
    if (action === "paiement_config_enregistrer") return { statut: 200, corps: await enregistrerConfigMarchand(wsId, corps) };
    if (action === "paiement_config_tester") return { statut: 200, corps: await testerConfig(wsId) };
  } catch (e) {
    return { statut: 400, corps: { error: e.message } };
  }
  return { statut: 400, corps: { error: "Action inconnue" } };
}

export const ACTIONS_MARCHAND_PAIEMENT = new Set(["paiement_config_lire", "paiement_config_enregistrer", "paiement_config_tester"]);

// Filet de sécurité (appelé par le contrôle quotidien) : vérifie les paiements restés « en attente » depuis
// moins de 3 jours, au cas où une notification du fournisseur ne serait jamais arrivée.
export async function rattraperPaiementsEnAttente() {
  const depuis = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const avant = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("paiements_en_ligne").select("reference").eq("statut", "en_attente").gte("created_at", depuis).lte("created_at", avant).limit(100);
  let valides = 0;
  for (const p of data || []) {
    try { const r = await verifierEtAppliquer(p.reference); if (r.applique) valides += 1; } catch (_) {}
  }
  return { verifies: (data || []).length, valides };
}
