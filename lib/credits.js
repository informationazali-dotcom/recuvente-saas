// ============================================================================
//  Ventes à crédit : rappel quotidien au marchand (cron api/cron-daily.js, 8 h).
//  Pour chaque boutique : les clients dont une mensualité tombe dans 3 jours ou
//  moins, et ceux qui sont en retard. Une seule notification push (+ un e-mail
//  au propriétaire) par boutique et par jour, jamais s'il n'y a personne.
//  Les heures sont en UTC, soit l'heure d'Abidjan.
// ============================================================================
import { Resend } from "resend";
import { supabaseAdmin, urlApp } from "./options.js";

const JOURS_ALERTE = 3;

function isoUTC(d) { return d.toISOString().slice(0, 10); }
function nb(x) { return Math.round(Number(x || 0)).toLocaleString("fr-FR").replace(/[  ]/g, " "); }
function libelleDevise(code) {
  const c = String(code || "").toUpperCase();
  return c === "XOF" || c === "XAF" || !c ? "F CFA" : c;
}
function echapper(t) { return String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

export async function rappelsVentesCredit() {
  const auj = new Date();
  const aujISO = isoUTC(auj);
  const limite = new Date(auj);
  limite.setUTCDate(limite.getUTCDate() + JOURS_ALERTE);

  const { data: lignes, error } = await supabaseAdmin
    .from("echeances_credit")
    .select("workspace_id, credit_id, date_echeance, montant_du, montant_paye, ventes_credit!inner(client_nom, article, statut)")
    .eq("ventes_credit.statut", "en_cours")
    .lte("date_echeance", isoUTC(limite))
    .order("date_echeance", { ascending: true });
  if (error) return { erreur: error.message, boutiques: 0 };

  // Regroupe par boutique, puis par client (un client = la plus ancienne échéance impayée).
  const parBoutique = {};
  for (const l of lignes || []) {
    const reste = Number(l.montant_du) - Number(l.montant_paye || 0);
    if (reste <= 0) continue;
    const b = (parBoutique[l.workspace_id] ||= { clients: new Map() });
    const enRetard = l.date_echeance < aujISO;
    const c = b.clients.get(l.credit_id) || { nom: l.ventes_credit.client_nom, article: l.ventes_credit.article, date: l.date_echeance, montant: 0, enRetard: false };
    c.montant += reste;
    c.enRetard = c.enRetard || enRetard;
    b.clients.set(l.credit_id, c);
  }

  const ids = Object.keys(parBoutique);
  if (ids.length === 0) return { boutiques: 0, notifications: 0 };

  let pousserRappelCredits = null;
  try { ({ pousserRappelCredits } = await import("../api/notifications.js")); } catch (_) {}
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  let notifications = 0;
  let emails = 0;
  for (const workspaceId of ids) {
    const cle = `credits_rappel_${aujISO}`;
    const { data: deja } = await supabaseAdmin.from("workspace_options").select("valeur").eq("workspace_id", workspaceId).eq("cle", cle).maybeSingle();
    if (deja) continue;

    const clients = [...parBoutique[workspaceId].clients.values()];
    const retard = clients.filter((c) => c.enRetard);
    const bientot = clients.filter((c) => !c.enRetard);
    const total = clients.reduce((s, c) => s + c.montant, 0);
    const { data: ws } = await supabaseAdmin.from("workspaces").select("name, currency, owner_id").eq("id", workspaceId).maybeSingle();
    const cur = libelleDevise(ws?.currency);

    try {
      if (typeof pousserRappelCredits === "function") {
        const r = await pousserRappelCredits({ workspaceId, nbRetard: retard.length, nbBientot: bientot.length, total, noms: clients.map((c) => c.nom) });
        if (r?.envoyes) notifications++;
      }
    } catch (_) {}

    try {
      if (resend && ws?.owner_id) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(ws.owner_id);
        const email = u?.user?.email;
        if (email) {
          const ligne = (c) => `<li style="margin-bottom:6px"><b>${echapper(c.nom)}</b> — ${echapper(c.article)} : ${nb(c.montant)} ${cur} ${c.enRetard ? `<span style="color:#D64933">(en retard depuis le ${c.date})</span>` : `(le ${c.date})`}</li>`;
          await resend.emails.send({
            from: "RecuVente <onboarding@resend.dev>",
            to: email,
            subject: `🔔 ${clients.length} client${clients.length > 1 ? "s" : ""} à relancer — ventes à crédit${ws?.name ? " — " + ws.name : ""}`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#16231F">
              <h1 style="font-size:19px">🔔 Clients à relancer aujourd'hui</h1>
              ${retard.length ? `<p style="font-weight:700;color:#D64933">En retard (${retard.length})</p><ul>${retard.map(ligne).join("")}</ul>` : ""}
              ${bientot.length ? `<p style="font-weight:700;color:#e8920a">Paiement dans ${JOURS_ALERTE} jours ou moins (${bientot.length})</p><ul>${bientot.map(ligne).join("")}</ul>` : ""}
              <p>Total attendu : <b>${nb(total)} ${cur}</b></p>
              <a href="${urlApp()}/admin/?credits=1" style="display:inline-block;background:#1a7a3c;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Ouvrir les ventes à crédit</a>
            </div>`,
          });
          emails++;
        }
      }
    } catch (_) {}

    await supabaseAdmin.from("workspace_options").upsert(
      [{ workspace_id: workspaceId, cle, valeur: { envoye_le: new Date().toISOString(), clients: clients.length, total }, updated_at: new Date().toISOString() }],
      { onConflict: "workspace_id,cle" }
    );
  }

  return { boutiques: ids.length, notifications, emails };
}
