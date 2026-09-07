// Registre des agents de l'AI Company OS (§33).
// Miroir JS de la table ai_agents — utile côté frontend pour afficher l'organigramme (§20)
// sans requêter Supabase à chaque fois pour des métadonnées statiques.
//
// IMPORTANT : "status: active" signifie que l'agent est réellement connecté à une vraie
// logique testée (voir /api/admin-panel.js, action "ceo_ask" pour "ceo", ou le cron existant
// pour "prospecting"). "status: inactive" signifie que la fiche existe mais qu'aucune logique
// réelle ne tourne derrière — jamais l'inverse (§48 : ne jamais déclarer opérationnel ce qui
// ne l'est pas). Mets à jour ce statut toi-même au fur et à mesure des phases suivantes.

export const AGENTS = {
  ceo: {
    id: "ceo",
    name: "CEO IA",
    role: "Chef d'orchestre, synthèse et délégation",
    department: "Direction",
    status: "active", // Phase A : répond aux questions sur les prospects, en lecture seule
    endpoint: "/api/admin-panel", // { action: "ceo_ask", question: "..." }
  },
  generalManager: {
    id: "general_manager",
    name: "Directeur Général IA",
    role: "Opérations et exécution quotidienne",
    department: "Opérations",
    status: "active", // opérations du jour, Azali Express, à partir des vraies commandes
    endpoint: "/api/admin-panel", // { action: "gm_ask", question: "..." }
  },
  cfo: {
    id: "cfo",
    name: "CFO IA",
    role: "Finance, trésorerie, rentabilité",
    department: "Finance",
    status: "active", // Phase C : trésorerie réelle d'Azali Express (encaissement/risque, pas encore la marge nette)
    endpoint: "/api/admin-panel", // { action: "cfo_ask", question: "..." }
  },
  cmo: {
    id: "cmo",
    name: "CMO IA",
    role: "Stratégie marketing et acquisition",
    department: "Marketing",
    status: "inactive",
    endpoint: null,
  },
  sales: {
    id: "sales",
    name: "CRO / Sales IA",
    role: "Pipeline commercial et closing",
    department: "Ventes",
    status: "active", // Phase C : analyse le pipeline réel, détecte goulot + prospects oubliés
    endpoint: "/api/admin-panel", // { action: "sales_ask", question: "..." }
  },
  prospecting: {
    id: "prospecting",
    name: "Prospection IA",
    role: "Recherche et qualification de prospects",
    department: "Ventes",
    status: "active", // c'est "Golden IA" : le bouton 🤖 existant dans l'app, testé et fonctionnel
    endpoint: "/api/domains", // { action: "prospection", secteur, ville } → table "prospects"
  },
  ads: {
    id: "ads",
    name: "Ads IA",
    role: "Publicité Meta / Google / TikTok",
    department: "Marketing",
    status: "inactive", // bloqué : aucune intégration Meta/Google/TikTok Ads connectée
    endpoint: null,
  },
  copywriter: {
    id: "copywriter",
    name: "Copywriter IA",
    role: "Rédaction commerciale",
    department: "Marketing",
    status: "active", // rédige de vrais brouillons (pub, email, WhatsApp) — jamais d'envoi automatique
    endpoint: "/api/admin-panel", // { action: "copywriter_ask", question: "<brief>" }
  },
  hr: {
    id: "hr",
    name: "RH IA",
    role: "Équipe, charge de travail, recrutement",
    department: "RH",
    status: "active", // charge de travail réelle livreurs/closers (Azali) sur 7 jours
    endpoint: "/api/admin-panel", // { action: "hr_ask", question: "..." }
  },
  cto: {
    id: "cto",
    name: "CTO IA",
    role: "Architecture, bugs, sécurité",
    department: "Tech",
    status: "active", // détecte de vrais problèmes de données (produits sans coût/photo...) — ne corrige jamais le code lui-même
    endpoint: "/api/admin-panel", // { action: "cto_ask", question: "..." }
  },
  customerSuccess: {
    id: "customer_success",
    name: "Customer Success IA",
    role: "Satisfaction et rétention client",
    department: "Support",
    status: "active", // détecte les clients fidèles sans achat depuis 30j+, à partir des vraies commandes
    endpoint: "/api/admin-panel", // { action: "cs_ask", question: "..." }
  },
  projectManager: {
    id: "project_manager",
    name: "Project Manager IA",
    role: "Suivi de projets et livraison",
    department: "Opérations",
    status: "active", // crée une vraie tâche pour chaque prospect "Gagné" (table ai_tasks)
    endpoint: "/api/admin-panel", // { action: "pm_ask", question: "..." }
  },
  data: {
    id: "data",
    name: "Data / Analytics IA",
    role: "Analyse et détection d'anomalies",
    department: "Data",
    status: "active", // compare semaine actuelle vs précédente sur des données réelles (commandes, prospects)
    endpoint: "/api/admin-panel", // { action: "data_ask", question: "..." }
  },
  automation: {
    id: "automation",
    name: "Automation IA",
    role: "Règles et workflows",
    department: "Opérations",
    status: "active", // une vraie règle tourne déjà : score ≥ 81 → strategic_priority (voir diagnostic_vitrine_publique.sql)
    endpoint: null, // pas d'interface dédiée pour l'instant, c'est une règle SQL, pas un agent conversationnel
  },
  azaliLeads: {
    id: "azali_leads",
    name: "Chasseur d'opportunités Azali",
    role: "Trouve de vraies demandes publiques de clients (pas du démarchage à froid)",
    department: "Ventes",
    status: "active", // recherche web réelle + catalogue réel Azali, rapport à lire — ne contacte jamais personne
    endpoint: "/api/admin-panel", // { action: "azali_leads_ask", question: "..." }
  },
};

export function listerAgentsActifs() {
  return Object.values(AGENTS).filter((a) => a.status === "active");
}
