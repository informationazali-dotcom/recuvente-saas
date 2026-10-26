// =====================================================================
// RecuVente — Module « Réseau national » : éléments communs
// (styles, formats, libellés, petits composants partagés)
// =====================================================================
import React, { useEffect, useState } from "react";

export const fmt = (n) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0)) + " FCFA";
export const fmtNombre = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));
export const fmtDate = (d, heure = true) =>
  d
    ? new Date(d).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "short",
        ...(heure ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
        timeZone: "Africa/Abidjan",
      })
    : "";

export const STATUTS = {
  en_attente_confirmation: { label: "Reçue", ton: "neutre" },
  en_attente_paiement: { label: "En attente de paiement", ton: "alerte" },
  confirmee: { label: "Confirmée", ton: "info" },
  en_attente_attribution: { label: "En attente d'un livreur", ton: "alerte" },
  representant_notifie: { label: "Livreur sollicité", ton: "info" },
  livraison_acceptee: { label: "Livraison acceptée", ton: "info" },
  en_preparation: { label: "En préparation", ton: "info" },
  en_cours_livraison: { label: "En cours de livraison", ton: "info" },
  livree: { label: "Livrée", ton: "ok" },
  echec_livraison: { label: "Échec de livraison", ton: "danger" },
  annulee: { label: "Annulée", ton: "neutre" },
  retour_demande: { label: "Retour demandé", ton: "alerte" },
  remboursee: { label: "Remboursée", ton: "neutre" },
};

// Étapes montrées au client (la frise de suivi)
export const ETAPES_CLIENT = [
  { cle: "recue", label: "Commande reçue", statuts: ["en_attente_confirmation", "en_attente_paiement"] },
  { cle: "confirmee", label: "Confirmée", statuts: ["confirmee", "en_attente_attribution", "representant_notifie"] },
  { cle: "preparation", label: "En préparation", statuts: ["livraison_acceptee", "en_preparation"] },
  { cle: "route", label: "En route", statuts: ["en_cours_livraison"] },
  { cle: "livree", label: "Livrée", statuts: ["livree", "retour_demande", "remboursee"] },
];

export const STATUTS_MISSION = {
  proposee: { label: "À accepter", ton: "alerte" },
  acceptee: { label: "Acceptée", ton: "info" },
  en_preparation: { label: "En préparation", ton: "info" },
  en_cours: { label: "En route", ton: "info" },
  terminee: { label: "Livrée", ton: "ok" },
  refusee: { label: "Refusée", ton: "neutre" },
  expiree: { label: "Sans réponse", ton: "neutre" },
  annulee: { label: "Annulée", ton: "neutre" },
  echec: { label: "Échec", ton: "danger" },
};

export const ETATS = {
  neuf_etiquette: "Neuf avec étiquette",
  tres_bon: "Très bon état",
  bon: "Bon état",
  correct: "État correct",
};

export const STATUTS_ARTICLE = {
  en_attente: { label: "À valider", ton: "alerte" },
  disponible: { label: "En vente", ton: "ok" },
  reserve: { label: "Réservé", ton: "info" },
  vendu: { label: "Vendu", ton: "neutre" },
  retire: { label: "Retiré", ton: "neutre" },
  refuse: { label: "Refusé", ton: "danger" },
};

export const MODES_PAIEMENT = {
  cod: { label: "Paiement à la livraison", court: "À la livraison" },
  wave: { label: "Wave", court: "Wave" },
  orange_money: { label: "Orange Money", court: "Orange Money" },
  mtn_momo: { label: "MTN Mobile Money", court: "MTN MoMo" },
  carte: { label: "Carte bancaire", court: "Carte" },
};

export const CATEGORIES_DEFAUT = [
  "Vêtements femmes",
  "Vêtements hommes",
  "Vêtements enfants",
  "Chaussures",
  "Sacs et bagages",
  "Accessoires de mode",
];

// Message d'erreur Supabase lisible par un humain
export const erreurTexte = (e) => {
  if (!e) return "";
  const m = e.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Connexion internet instable. Vérifiez votre réseau puis réessayez.";
  if (/JWT|not authenticated|permission denied/i.test(m)) return "Session expirée. Reconnectez-vous.";
  return m.replace(/^.*?ERROR:\s*/i, "");
};

export async function rpc(supabase, nom, args) {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw error;
  return data;
}

export const lienWhatsApp = (tel, texte = "") => {
  let n = String(tel || "").replace(/[^0-9]/g, "");
  if (n.length === 10) n = "225" + n; // numéro ivoirien local
  return `https://wa.me/${n}${texte ? "?text=" + encodeURIComponent(texte) : ""}`;
};

export const telLien = (tel) => "tel:" + String(tel || "").replace(/[^0-9+]/g, "");

// Compression des photos côté téléphone avant envoi (connexions mobiles)
export async function compresserImage(fichier, max = 1400, qualite = 0.82) {
  const img = await new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = ko;
    i.src = URL.createObjectURL(fichier);
  });
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * r);
  c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((ok) => c.toBlob(ok, "image/jpeg", qualite));
}

export async function envoyerPhotos(supabase, workspaceId, fichiers) {
  const urls = [];
  for (const f of fichiers) {
    const blob = await compresserImage(f);
    const chemin = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from("reseau-articles").upload(chemin, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) throw error;
    urls.push(supabase.storage.from("reseau-articles").getPublicUrl(chemin).data.publicUrl);
  }
  return urls;
}

// Export Excel (CSV avec BOM UTF-8 et « ; » : s'ouvre directement dans Excel en français)
export function exporterExcel(nomFichier, colonnes, lignes) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenu =
    "﻿" +
    [colonnes.map((c) => esc(c.label)).join(";"), ...lignes.map((l) => colonnes.map((c) => esc(c.val(l))).join(";"))].join(
      "\n"
    );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
  a.download = nomFichier.endsWith(".csv") ? nomFichier : nomFichier + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Export PDF : ouvre une page de rapport propre et lance l'impression (« Enregistrer en PDF »)
export function exporterPDF(titre, html) {
  const w = window.open("", "_blank");
  if (!w) return alert("Autorisez les fenêtres pop-up pour exporter en PDF.");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
  <style>body{font:12px/1.45 Manrope,Arial,sans-serif;color:#22161F;margin:28px}h1{font:600 22px Georgia,serif;margin:0 0 4px}
  h2{font:600 15px Georgia,serif;margin:22px 0 8px}table{width:100%;border-collapse:collapse;margin:6px 0}
  th,td{border-bottom:1px solid #e6dce1;padding:5px 6px;text-align:left}th{background:#f6eff2}td.n,th.n{text-align:right}
  .meta{color:#6e5a66;margin-bottom:18px}@page{margin:14mm}</style></head><body>${html}
  <script>setTimeout(function(){window.print()},300)</script></body></html>`);
  w.document.close();
}

export function useCompteARebours(fin) {
  const [reste, setReste] = useState(() => (fin ? new Date(fin) - Date.now() : 0));
  useEffect(() => {
    if (!fin) return;
    const t = setInterval(() => setReste(new Date(fin) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [fin]);
  return reste;
}
export const formatDuree = (ms) => {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m}:${ss}`;
};

// ------------------------------------------------------------------ composants
export function Pastille({ ton = "neutre", children }) {
  return <span className={`rn-pastille rn-ton-${ton}`}>{children}</span>;
}
export function StatutCommande({ statut }) {
  const s = STATUTS[statut] || { label: statut, ton: "neutre" };
  return <Pastille ton={s.ton}>{s.label}</Pastille>;
}

export function Bouton({ variante = "plein", petit, chargement, children, className = "", ...p }) {
  return (
    <button
      className={`rn-btn rn-btn-${variante}${petit ? " rn-btn-petit" : ""} ${className}`}
      disabled={chargement || p.disabled}
      {...p}
    >
      {chargement ? <span className="rn-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Champ({ label, aide, erreur, children }) {
  return (
    <label className="rn-champ">
      <span className="rn-champ-label">{label}</span>
      {children}
      {aide && !erreur ? <span className="rn-champ-aide">{aide}</span> : null}
      {erreur ? <span className="rn-champ-erreur">{erreur}</span> : null}
    </label>
  );
}

export function Modale({ titre, onFermer, children, large }) {
  useEffect(() => {
    const f = (e) => e.key === "Escape" && onFermer?.();
    window.addEventListener("keydown", f);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", f);
      document.body.style.overflow = "";
    };
  }, [onFermer]);
  return (
    <div className="rn-voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}>
      <div className={`rn-modale${large ? " rn-modale-large" : ""}`} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="rn-modale-tete">
          <h3>{titre}</h3>
          <button className="rn-x" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="rn-modale-corps">{children}</div>
      </div>
    </div>
  );
}

export function Message({ ton = "info", children, onFermer }) {
  if (!children) return null;
  return (
    <div className={`rn-message rn-ton-${ton}`} role={ton === "danger" ? "alert" : "status"}>
      <span>{children}</span>
      {onFermer ? (
        <button className="rn-x" onClick={onFermer} aria-label="Fermer">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Vide({ titre, children, action }) {
  return (
    <div className="rn-vide">
      <p className="rn-vide-titre">{titre}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Barres({ donnees, valeur, label, format = fmtNombre, max }) {
  const m = max ?? Math.max(1, ...donnees.map((d) => Number(valeur(d)) || 0));
  return (
    <div className="rn-barres">
      {donnees.map((d, i) => (
        <div className="rn-barre-ligne" key={i}>
          <span className="rn-barre-label">{label(d)}</span>
          <span className="rn-barre-piste">
            <span className="rn-barre" style={{ width: `${((Number(valeur(d)) || 0) / m) * 100}%` }} />
          </span>
          <span className="rn-barre-val">{format(valeur(d))}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ styles
let stylesInjectes = false;
export function useStylesReseau(couleur = "#4A1238", or = "#C9A24A") {
  useEffect(() => {
    if (!stylesInjectes) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href =
        "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
      const s = document.createElement("style");
      s.id = "rn-styles";
      s.textContent = CSS;
      document.head.appendChild(s);
      stylesInjectes = true;
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--rn-prune", couleur || "#4A1238");
    document.documentElement.style.setProperty("--rn-or", or || "#C9A24A");
  }, [couleur, or]);
}

const CSS = `
.rn{--rn-perle:#FBF8F6;--rn-rose:#F3EAEE;--rn-rose-2:#E9DCE2;--rn-encre:#22161F;--rn-gris:#6E5A66;--rn-trait:#E3D6DC;
  --rn-vert:#1F7A4D;--rn-rouge:#B4232F;--rn-ambre:#A8620B;--rn-bleu:#2D5B8A;
  --rn-titre:'Cormorant Garamond',Georgia,serif;--rn-texte:'Manrope',system-ui,-apple-system,sans-serif;
  font-family:var(--rn-texte);color:var(--rn-encre);background:var(--rn-perle);font-size:15px;line-height:1.5;
  -webkit-font-smoothing:antialiased;min-height:100vh}
.rn *{box-sizing:border-box}
.rn h1,.rn h2,.rn h3{font-family:var(--rn-titre);font-weight:600;line-height:1.15;margin:0;letter-spacing:-.01em}
.rn h1{font-size:clamp(30px,6vw,52px)}.rn h2{font-size:clamp(24px,4.4vw,34px)}.rn h3{font-size:22px}
.rn p{margin:0}
.rn a{color:var(--rn-prune)}
.rn button,.rn input,.rn select,.rn textarea{font:inherit;color:inherit}
.rn :focus-visible{outline:2px solid var(--rn-or);outline-offset:2px}
.rn-conteneur{max-width:1180px;margin:0 auto;padding:0 16px}
.rn-muet{color:var(--rn-gris)}
.rn-petit{font-size:13px}
.rn-ligne{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rn-entre{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
.rn-pile{display:grid;gap:12px;align-content:start}
.rn-grille-2{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}

/* boutons */
.rn-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:12px 20px;
  font-weight:600;cursor:pointer;border:1.5px solid transparent;transition:background .15s,transform .1s;min-height:46px;text-decoration:none}
.rn-btn:active{transform:scale(.98)}
.rn-btn:disabled{opacity:.55;cursor:not-allowed}
.rn .rn-btn-plein{background:var(--rn-prune);color:#fff}
.rn .rn-btn-plein:hover:not(:disabled){filter:brightness(1.12)}
.rn .rn-btn-or{background:var(--rn-or);color:#2a1a07}
.rn .rn-btn-contour{background:transparent;border-color:var(--rn-prune);color:var(--rn-prune)}
.rn .rn-btn-discret{background:var(--rn-rose);color:var(--rn-encre)}
.rn .rn-btn-danger{background:#fff;border-color:var(--rn-rouge);color:var(--rn-rouge)}
.rn .rn-btn-vert{background:var(--rn-vert);color:#fff}
.rn-btn-petit{padding:7px 14px;min-height:36px;font-size:14px}
.rn-btn-bloc{width:100%}
.rn-spin{width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:rn-tour .7s linear infinite}
@keyframes rn-tour{to{transform:rotate(360deg)}}
.rn-x{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:var(--rn-gris);padding:4px 8px}

/* champs */
.rn-champ{display:grid;gap:6px}
.rn-champ-label{font-weight:600;font-size:14px}
.rn-champ-aide{font-size:13px;color:var(--rn-gris)}
.rn-champ-erreur{font-size:13px;color:var(--rn-rouge)}
.rn input:not([type=checkbox]):not([type=radio]),.rn select,.rn textarea{width:100%;border:1.5px solid var(--rn-trait);
  background:#fff;border-radius:12px;padding:11px 13px;min-height:46px;font-size:16px}
.rn textarea{min-height:90px;resize:vertical}
.rn input:focus,.rn select:focus,.rn textarea:focus{border-color:var(--rn-prune);outline:none}

/* pastilles */
.rn-pastille{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.rn-ton-neutre{background:#EFE9EC;color:#5b4a54}
.rn-ton-info{background:#E7EEF6;color:var(--rn-bleu)}
.rn-ton-ok{background:#E3F2EA;color:var(--rn-vert)}
.rn-ton-alerte{background:#FBEFD9;color:var(--rn-ambre)}
.rn-ton-danger{background:#FBE6E8;color:var(--rn-rouge)}

.rn-message{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;font-size:14px}
.rn-carte{background:#fff;border:1px solid var(--rn-trait);border-radius:18px;padding:16px}
.rn-vide{text-align:center;padding:40px 16px;color:var(--rn-gris);display:grid;gap:10px;justify-items:center}
.rn-vide-titre{font-family:var(--rn-titre);font-size:24px;color:var(--rn-encre)}

/* modale */
.rn-voile{position:fixed;inset:0;background:rgba(34,22,31,.55);display:flex;align-items:flex-end;justify-content:center;z-index:1000}
.rn-modale{background:var(--rn-perle);width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;
  border-radius:22px 22px 0 0;animation:rn-monte .22s ease-out}
.rn-modale-large{max-width:900px}
@media(min-width:720px){.rn-voile{align-items:center}.rn-modale{border-radius:22px}}
@keyframes rn-monte{from{transform:translateY(30px);opacity:.6}}
@media(prefers-reduced-motion:reduce){.rn-modale{animation:none}.rn-spin{animation-duration:2s}}
.rn-modale-tete{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 8px}
.rn-modale-corps{padding:6px 18px 22px;overflow:auto;display:grid;gap:14px}

/* barres */
.rn-barres{display:grid;gap:8px}
.rn-barre-ligne{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:10px;align-items:center;font-size:13.5px}
.rn-barre-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rn-barre-piste{background:var(--rn-rose);height:10px;border-radius:6px;overflow:hidden}
.rn-barre{display:block;height:100%;background:var(--rn-prune);border-radius:6px}
.rn-barre-val{font-variant-numeric:tabular-nums;font-weight:600}

/* tableaux */
.rn-table-boite{overflow-x:auto;border:1px solid var(--rn-trait);border-radius:16px;background:#fff}
.rn-table{width:100%;border-collapse:collapse;font-size:14px}
.rn-table th{text-align:left;font-weight:600;color:var(--rn-gris);background:#FAF5F7;padding:10px 12px;white-space:nowrap}
.rn-table td{padding:10px 12px;border-top:1px solid var(--rn-trait);vertical-align:top}
.rn-table tr.rn-cliquable{cursor:pointer}
.rn-table tr.rn-cliquable:hover td{background:#FCF8FA}
.rn-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ========== BOUTIQUE ========== */
.rn-entete{position:sticky;top:0;z-index:50;background:rgba(251,248,246,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--rn-trait)}
.rn-entete-in{display:flex;align-items:center;justify-content:space-between;gap:10px;height:62px}
.rn-marque{display:flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;padding:0;text-align:left}
.rn-marque img{width:38px;height:38px;object-fit:contain;border-radius:50%}
.rn-marque-nom{font-family:var(--rn-titre);font-size:19px;font-weight:700;line-height:1.05;color:var(--rn-prune);max-width:52vw}
.rn-entete-actions{display:flex;gap:6px;align-items:center}
.rn-icone-btn{position:relative;background:none;border:0;cursor:pointer;padding:9px;border-radius:12px;display:inline-flex;color:var(--rn-encre)}
.rn-icone-btn:hover{background:var(--rn-rose)}
.rn-compteur{position:absolute;top:2px;right:0;background:var(--rn-or);color:#2a1a07;font-size:11px;font-weight:700;
  min-width:18px;height:18px;border-radius:9px;display:grid;place-items:center;padding:0 4px}

.rn-heros{position:relative;overflow:hidden;background:var(--rn-prune);color:#fff}
.rn-heros-in{position:relative;z-index:2;padding:44px 16px 92px;max-width:1180px;margin:0 auto;display:grid;gap:14px}
.rn-heros h1{color:#fff;max-width:13ch}
.rn-heros p{max-width:46ch;color:rgba(255,255,255,.84);font-size:16px}
.rn-heros .rn-btn-or{justify-self:start;margin-top:6px}
.rn-echarpe{position:absolute;z-index:1;left:-10%;right:-10%;bottom:34px;transform:rotate(-6deg);background:var(--rn-or);
  color:#2a1a07;font-family:var(--rn-titre);font-style:italic;font-weight:600;font-size:clamp(16px,3.6vw,24px);
  padding:9px 0;white-space:nowrap;overflow:hidden;box-shadow:0 6px 0 rgba(0,0,0,.12)}
.rn-echarpe span{display:inline-block;padding-left:10%}
.rn-heros-couronne{position:absolute;right:6%;top:26px;width:min(34vw,240px);opacity:.14;z-index:1}

.rn-reassurance{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;padding:26px 16px 6px;max-width:1180px;margin:0 auto}
.rn-reassurance div{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:start;font-size:14px}
.rn-reassurance b{display:block;font-size:15px}
.rn-reassurance svg{color:var(--rn-prune)}

.rn-cats{display:flex;gap:8px;overflow-x:auto;padding:16px 16px 8px;max-width:1180px;margin:0 auto;scrollbar-width:none}
.rn-cats::-webkit-scrollbar{display:none}
.rn-cat{flex:none;border:1.5px solid var(--rn-trait);background:#fff;border-radius:999px;padding:8px 15px;cursor:pointer;font-weight:600;font-size:14px}
.rn-cat[aria-pressed=true]{background:var(--rn-prune);border-color:var(--rn-prune);color:#fff}

.rn-barre-outils{display:flex;gap:8px;padding:8px 16px 4px;max-width:1180px;margin:0 auto;align-items:center}
.rn-recherche{flex:1;position:relative}
.rn-recherche input{padding-left:40px!important;border-radius:999px!important}
.rn-recherche svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--rn-gris)}

.rn-grille{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 12px;padding:12px 16px 40px;max-width:1180px;margin:0 auto}
@media(min-width:720px){.rn-grille{grid-template-columns:repeat(3,1fr);gap:22px 18px}}
@media(min-width:1040px){.rn-grille{grid-template-columns:repeat(4,1fr)}}
.rn-produit{background:none;border:0;padding:0;text-align:left;cursor:pointer;display:grid;gap:7px}
.rn-produit-photo{position:relative;aspect-ratio:4/5;background:var(--rn-rose);border-radius:16px;overflow:hidden}
.rn-produit-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
@media(hover:hover){.rn-produit:hover .rn-produit-photo img{transform:scale(1.03)}}
.rn-produit-badge{position:absolute;left:8px;top:8px}
.rn-produit-badge .rn-pastille{background:rgba(255,255,255,.94);color:var(--rn-encre)}
.rn-produit-titre{font-weight:600;font-size:14.5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rn-produit-meta{font-size:13px;color:var(--rn-gris)}
.rn-prix{font-weight:700;font-size:16px;color:var(--rn-prune);font-variant-numeric:tabular-nums}
.rn-prix s{white-space:nowrap;color:var(--rn-gris);font-weight:500;font-size:13px;margin-left:6px}

.rn-fiche{display:grid;gap:22px;padding:16px 16px 120px;max-width:1080px;margin:0 auto}
@media(min-width:860px){.rn-fiche{grid-template-columns:1.1fr 1fr;padding-bottom:60px}}
.rn-galerie{display:grid;gap:8px}
.rn-galerie-princ{aspect-ratio:4/5;border-radius:20px;overflow:hidden;background:var(--rn-rose)}
.rn-galerie-princ img{width:100%;height:100%;object-fit:cover}
.rn-vignettes{display:flex;gap:8px;overflow-x:auto}
.rn-vignettes button{flex:none;width:64px;height:78px;border-radius:10px;overflow:hidden;border:2px solid transparent;padding:0;cursor:pointer;background:var(--rn-rose)}
.rn-vignettes button[aria-current=true]{border-color:var(--rn-prune)}
.rn-vignettes img{width:100%;height:100%;object-fit:cover}
.rn-details{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;font-size:14.5px}
.rn-details dt{color:var(--rn-gris)}
.rn-details dd{margin:0;font-weight:600}
.rn-defauts{border-left:3px solid var(--rn-or);background:#FBF5E8;padding:12px 14px;border-radius:0 12px 12px 0;font-size:14px}
.rn-barre-achat{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--rn-trait);padding:12px 16px calc(12px + env(safe-area-inset-bottom));z-index:40;display:flex;gap:12px;align-items:center}
@media(min-width:860px){.rn-barre-achat{position:static;border:0;padding:0;background:none}}

.rn-panneau{max-width:720px;margin:0 auto;padding:18px 16px 120px;display:grid;gap:18px}
.rn-ligne-panier{display:grid;grid-template-columns:72px 1fr auto;gap:12px;align-items:center}
.rn-ligne-panier img{width:72px;height:88px;object-fit:cover;border-radius:10px;background:var(--rn-rose)}
.rn-qte{display:inline-flex;align-items:center;border:1.5px solid var(--rn-trait);border-radius:999px}
.rn-qte button{background:none;border:0;width:34px;height:34px;cursor:pointer;font-size:18px}
.rn-totaux{display:grid;gap:6px;font-size:15px}
.rn-totaux div{display:flex;justify-content:space-between;gap:12px}
.rn-totaux .rn-total{font-weight:700;font-size:18px;border-top:1px solid var(--rn-trait);padding-top:10px;margin-top:4px}
.rn-choix{display:grid;gap:8px}
.rn-choix label{display:flex;gap:12px;align-items:center;border:1.5px solid var(--rn-trait);background:#fff;border-radius:14px;padding:12px 14px;cursor:pointer}
.rn-choix label:has(input:checked){border-color:var(--rn-prune);background:#FBF4F8}
.rn-choix input{accent-color:var(--rn-prune);width:20px;height:20px}

.rn-code{font-family:var(--rn-titre);font-size:46px;font-weight:700;letter-spacing:.18em;color:var(--rn-prune);text-align:center;
  background:#fff;border:2px dashed var(--rn-or);border-radius:18px;padding:10px 0 6px}
.rn-frise{list-style:none;margin:0;padding:0;display:grid;gap:0}
.rn-frise li{display:grid;grid-template-columns:26px 1fr;gap:12px;position:relative;padding-bottom:18px}
.rn-frise li:not(:last-child)::before{content:"";position:absolute;left:12px;top:24px;bottom:0;width:2px;background:var(--rn-trait)}
.rn-frise li.rn-fait:not(:last-child)::before{background:var(--rn-prune)}
.rn-frise-point{width:26px;height:26px;border-radius:50%;border:2px solid var(--rn-trait);background:#fff;display:grid;place-items:center;font-size:13px;font-weight:700;color:#fff}
.rn-frise li.rn-fait .rn-frise-point{background:var(--rn-prune);border-color:var(--rn-prune)}
.rn-frise li.rn-actuel .rn-frise-point{border-color:var(--rn-or);box-shadow:0 0 0 4px rgba(201,162,74,.25)}

.rn-pied{background:var(--rn-encre);color:rgba(255,255,255,.78);padding:34px 16px 90px;font-size:14px}
.rn-pied a,.rn-pied button{justify-self:start;text-align:left;color:#fff;background:none;border:0;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px;font:inherit}
.rn-pied-in{max-width:1180px;margin:0 auto;display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.rn-pied h3{color:#fff;font-size:20px;margin-bottom:6px}

.rn-feuille{position:fixed;inset:0;z-index:900;background:rgba(34,22,31,.45);display:flex;align-items:flex-end}
.rn-feuille-in{background:var(--rn-perle);width:100%;max-height:86vh;overflow:auto;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));display:grid;gap:14px}
@media(min-width:720px){.rn-feuille{justify-content:flex-end;align-items:stretch}.rn-feuille-in{max-width:400px;max-height:none;border-radius:0}}

/* ========== ESPACES CONNECTÉS (admin / représentant) ========== */
.rn-app{display:grid;min-height:100vh;grid-template-rows:auto 1fr;grid-template-columns:minmax(0,1fr)}
.rn-app > *{min-width:0}
.rn-app-tete{background:var(--rn-prune);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.rn-app-tete h1{font-size:22px;color:#fff}
.rn-onglets{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px;background:#fff;border-bottom:1px solid var(--rn-trait);scrollbar-width:none;position:sticky;top:0;z-index:30}
.rn-onglets::-webkit-scrollbar{display:none}
.rn-onglet{flex:none;border:0;background:none;padding:9px 14px;border-radius:10px;cursor:pointer;font-weight:600;color:var(--rn-gris);display:inline-flex;gap:6px;align-items:center}
.rn-onglet[aria-current=page]{background:var(--rn-rose);color:var(--rn-prune)}
.rn-onglet .rn-compteur{position:static}
.rn-zone-travail{padding:16px;max-width:1240px;width:100%;margin:0 auto;display:grid;gap:16px;align-content:start}
.rn-kpis{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.rn-kpi{background:#fff;border:1px solid var(--rn-trait);border-radius:16px;padding:14px}
.rn-kpi-val{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--rn-encre);margin-top:4px}
.rn-kpi-lab{font-size:13px;color:var(--rn-gris)}
.rn-kpi.rn-kpi-alerte{border-color:#EBC77F;background:#FFFBF2}
.rn-section-titre{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.rn-section-titre h2{font-size:26px}
.rn-filtres{display:flex;gap:8px;flex-wrap:wrap}
.rn-filtres > *{flex:1 1 160px;max-width:260px}
.rn-mission{display:grid;gap:12px}
.rn-mission-tete{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.rn-chrono{font-variant-numeric:tabular-nums;font-weight:700;color:var(--rn-ambre)}
.rn-mini-article{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;font-size:14px}
.rn-mini-article img{width:52px;height:64px;object-fit:cover;border-radius:8px;background:var(--rn-rose)}
.rn-photos-saisie{display:flex;gap:8px;flex-wrap:wrap}
.rn-photos-saisie > div{position:relative;width:78px;height:96px;border-radius:10px;overflow:hidden;background:var(--rn-rose)}
.rn-photos-saisie img{width:100%;height:100%;object-fit:cover}
.rn-photos-saisie button.rn-x{position:absolute;top:0;right:0;background:rgba(255,255,255,.9);font-size:18px;padding:0 6px;border-radius:0 0 0 8px}
.rn-ajout-photo{position:relative;overflow:hidden;width:78px;height:96px;border:2px dashed var(--rn-trait);border-radius:10px;display:grid;place-items:center;cursor:pointer;color:var(--rn-gris);font-size:13px;text-align:center}
.rn-panneau-lateral{position:fixed;top:0;right:0;bottom:0;width:min(560px,100%);background:var(--rn-perle);z-index:800;box-shadow:-10px 0 40px rgba(34,22,31,.18);display:flex;flex-direction:column}
.rn-panneau-lateral-corps{overflow:auto;padding:16px;display:grid;gap:14px;align-content:start}
.rn-chronologie{display:grid;gap:8px;font-size:13.5px}
.rn-chronologie div{display:grid;grid-template-columns:110px 1fr;gap:10px}
.rn-interrupteur{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-weight:600}
.rn-interrupteur input{width:44px;height:26px;appearance:none;background:#cbbcc4;border-radius:13px;position:relative;cursor:pointer;transition:background .15s}
.rn-interrupteur input::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.rn-interrupteur input:checked{background:var(--rn-vert)}
.rn-interrupteur input:checked::after{left:21px}
`;

export const Icone = {
  panier: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 7h12l-1 13H7L6 7Z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  ),
  loupe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  filtres: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  ),
  colis: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </svg>
  ),
  oeil: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  bouclier: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  camion: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  cloche: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  couronne: (
    <svg viewBox="0 0 120 80" fill="currentColor" aria-hidden className="rn-heros-couronne">
      <path d="M10 70 4 18l30 24L60 4l26 38 30-24-6 52H10Z" />
      <rect x="10" y="72" width="100" height="6" rx="2" />
    </svg>
  ),
};
