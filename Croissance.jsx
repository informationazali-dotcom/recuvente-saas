import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
//  « Croissance » : paiement en ligne (optionnel), réseau anti-refus, annuaire, programme ambassadeur.
//  Tout passe par /api/admin-panel (le serveur vérifie la session et l'appartenance à la boutique).
// ============================================================================
async function appeler(action, corps) {
  const { data } = await supabase.auth.getSession();
  try {
    const r = await fetch("/api/admin-panel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify({ action, ...corps }),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, data: j };
  } catch (e) {
    return { status: 0, data: { error: "Connexion impossible. Vérifie ton réseau." } };
  }
}

const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");
const devise = (d) => (!d || d === "XOF" || d === "XAF" ? "F CFA" : d);
const somme = (obj) => Object.entries(obj || {}).filter(([, v]) => v > 0).map(([d, v]) => `${nombre(v)} ${devise(d)}`).join(" + ") || "0";

const S = {
  carte: { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, marginBottom: 14 },
  titre: { fontWeight: 700, fontSize: 15, color: "#16231F", marginBottom: 4 },
  aide: { fontSize: 12.5, color: "#6B7168", lineHeight: 1.55 },
  label: { fontSize: 11.5, color: "#8A9089", margin: "10px 0 4px", display: "block" },
  champ: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14, boxSizing: "border-box", background: "white" },
  bouton: { background: "#1a7a3c", color: "white", border: "none", padding: "11px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  boutonClair: { background: "#F4F1E8", color: "#16231F", border: "1px solid #DDD8CC", padding: "10px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13.5, cursor: "pointer" },
};

function Pastille({ ok, children }) {
  return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: ok ? "#EAF3DE" : "#F1EFE8", color: ok ? "#3B6D11" : "#6B7168" }}>{children}</span>;
}

function Message({ m }) {
  if (!m) return null;
  return <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, fontSize: 13, background: m.ok ? "#EAF3DE" : "#FBEAE6", color: m.ok ? "#3B6D11" : "#B23A26", border: `1px solid ${m.ok ? "#C7DDA3" : "#F0B8AC"}` }}>{m.texte}</div>;
}

// ---------------------------------------------------------------- Paiement en ligne
function OngletPaiement({ workspace }) {
  const [cfg, setCfg] = useState(null);
  const [provider, setProvider] = useState("cinetpay");
  const [actif, setActif] = useState(false);
  const [modeTest, setModeTest] = useState(false);
  const [canaux, setCanaux] = useState("MOBILE_MONEY");
  const [cles, setCles] = useState({ cinetpay: { apikey: "", site_id: "" }, paydunya: { master_key: "", private_key: "", token: "" } });
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState(null);

  function appliquer(c) {
    setCfg(c); setProvider(c.provider); setActif(!!c.actif); setModeTest(!!c.mode_test); setCanaux(c.canaux);
    setCles({ cinetpay: { apikey: "", site_id: "" }, paydunya: { master_key: "", private_key: "", token: "" } });
  }
  useEffect(() => {
    appeler("paiement_config_lire", { workspace_id: workspace.id }).then(({ status, data }) => {
      if (status === 200) appliquer(data); else setMsg({ ok: false, texte: data.error || "Impossible de charger les réglages." });
    });
  }, [workspace.id]);

  const majCle = (fournisseur, nom, v) => setCles((c) => ({ ...c, [fournisseur]: { ...c[fournisseur], [nom]: v } }));
  const marque = (fournisseur, nom) => cfg?.cles?.[fournisseur]?.[nom] || "";

  async function enregistrer() {
    setEnCours(true); setMsg(null);
    const { status, data } = await appeler("paiement_config_enregistrer", { workspace_id: workspace.id, provider, actif, mode_test: modeTest, canaux, cles });
    setEnCours(false);
    if (status === 200) { appliquer(data); setMsg({ ok: true, texte: data.actif ? "Enregistré : le paiement en ligne est ACTIF sur ta boutique." : "Enregistré. Le paiement en ligne est désactivé : tes clients paient à la livraison." }); }
    else setMsg({ ok: false, texte: data.error || "Erreur" });
  }
  async function tester() {
    setEnCours(true); setMsg(null);
    // On enregistre d'abord les clés saisies (sans changer l'état actif/inactif actuel), puis on les teste.
    const e = await appeler("paiement_config_enregistrer", { workspace_id: workspace.id, provider, actif: !!cfg.actif, mode_test: modeTest, canaux, cles });
    if (e.status !== 200) { setEnCours(false); setMsg({ ok: false, texte: e.data.error || "Erreur" }); return; }
    const t = await appeler("paiement_config_tester", { workspace_id: workspace.id });
    setEnCours(false);
    appliquer({ ...e.data, actif: e.data.actif });
    setMsg(t.data.ok ? { ok: true, texte: "✅ Tes clés fonctionnent. Tu peux activer le paiement en ligne." } : { ok: false, texte: t.data.message || t.data.error || "Test échoué" });
  }

  if (!cfg) return <div style={{ ...S.aide, padding: 20 }}>{msg ? msg.texte : "Chargement…"}</div>;
  const devisesOk = cfg.devises_ok?.[provider] || [];
  const monnaieOk = !cfg.devise || devisesOk.includes(String(cfg.devise).toUpperCase());

  const carteFournisseur = (id, nom, detail) => (
    <button onClick={() => setProvider(id)} style={{ flex: 1, textAlign: "left", padding: 12, borderRadius: 12, cursor: "pointer", border: provider === id ? "2px solid #1a7a3c" : "1px solid #DDD8CC", background: provider === id ? "#F1F8EC" : "white" }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{nom}</div>
      <div style={{ fontSize: 11.5, color: "#6B7168", marginTop: 3 }}>{detail}</div>
    </button>
  );

  return (
    <div>
      <div style={{ ...S.carte, background: "#F1F8EC", borderColor: "#C7DDA3" }}>
        <div style={S.titre}>Paiement en ligne — <span style={{ color: "#1a7a3c" }}>c'est toi qui décides</span></div>
        <div style={S.aide}>
          Par défaut, tes clients <b>paient à la livraison</b> et rien ne change. Si tu veux, tu peux ajouter la possibilité de payer tout de suite par <b>Mobile Money</b> (Orange, MTN, Moov, Wave…) : tu branches <b>ton propre compte</b> CinetPay ou PayDunya, et l'argent arrive <b>directement chez toi</b>. RecuVente ne touche jamais l'argent de tes clients.
        </div>
        <div style={{ marginTop: 8 }}><Pastille ok={cfg.actif}>{cfg.actif ? "✅ Actif sur ta boutique" : "⚪ Non activé (paiement à la livraison seulement)"}</Pastille></div>
      </div>

      <div style={S.carte}>
        <div style={S.titre}>1. Choisis ton service de paiement</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {carteFournisseur("cinetpay", "CinetPay", "Mobile Money + carte · XOF, XAF, GNF, CDF, USD")}
          {carteFournisseur("paydunya", "PayDunya", "Mobile Money + carte · francs CFA (XOF)")}
        </div>
        {!monnaieOk && <div style={{ ...S.aide, color: "#B23A26", marginTop: 10 }}>⚠️ Ce service ne gère pas la monnaie de ta boutique ({cfg.devise}). Choisis l'autre, ou garde le paiement à la livraison.</div>}
      </div>

      <div style={S.carte}>
        <div style={S.titre}>2. Colle tes clés</div>
        {provider === "cinetpay" ? (
          <>
            <div style={S.aide}>Dans ton compte CinetPay : <b>Intégration</b> → copie l'<b>identifiant du site</b> et la <b>clé API</b>. Crée ton compte gratuitement sur cinetpay.com si tu n'en as pas.</div>
            <label style={S.label}>Identifiant du site (site_id)</label>
            <input style={S.champ} value={cles.cinetpay.site_id} onChange={(e) => majCle("cinetpay", "site_id", e.target.value)} placeholder={marque("cinetpay", "site_id") || "ex : 105888888"} autoComplete="off" />
            <label style={S.label}>Clé API</label>
            <input style={S.champ} type="password" value={cles.cinetpay.apikey} onChange={(e) => majCle("cinetpay", "apikey", e.target.value)} placeholder={marque("cinetpay", "apikey") || "ta clé API"} autoComplete="new-password" />
            <label style={S.label}>Moyens de paiement proposés à tes clients</label>
            <select style={S.champ} value={canaux} onChange={(e) => setCanaux(e.target.value)}>
              <option value="MOBILE_MONEY">Mobile Money seulement (le plus simple)</option>
              <option value="ALL">Mobile Money + carte bancaire</option>
            </select>
          </>
        ) : (
          <>
            <div style={S.aide}>Dans ton compte PayDunya : <b>Intégrer</b> → crée une application → copie la <b>clé principale</b>, la <b>clé privée</b> et le <b>jeton (token)</b>. Crée ton compte sur paydunya.com si besoin.</div>
            <label style={S.label}>Clé principale (Master key)</label>
            <input style={S.champ} type="password" value={cles.paydunya.master_key} onChange={(e) => majCle("paydunya", "master_key", e.target.value)} placeholder={marque("paydunya", "master_key") || "clé principale"} autoComplete="new-password" />
            <label style={S.label}>Clé privée (Private key)</label>
            <input style={S.champ} type="password" value={cles.paydunya.private_key} onChange={(e) => majCle("paydunya", "private_key", e.target.value)} placeholder={marque("paydunya", "private_key") || "clé privée"} autoComplete="new-password" />
            <label style={S.label}>Jeton (Token)</label>
            <input style={S.champ} type="password" value={cles.paydunya.token} onChange={(e) => majCle("paydunya", "token", e.target.value)} placeholder={marque("paydunya", "token") || "jeton"} autoComplete="new-password" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}>
              <input type="checkbox" checked={modeTest} onChange={(e) => setModeTest(e.target.checked)} /> Mode test (avec tes clés de test : aucun vrai argent ne circule)
            </label>
          </>
        )}
        <div style={{ ...S.aide, marginTop: 10 }}>🔒 Tes clés sont gardées en lieu sûr sur le serveur. Elles ne sont jamais affichées en entier ni envoyées à tes clients.</div>
        <div style={{ marginTop: 12 }}><button style={S.boutonClair} onClick={tester} disabled={enCours}>🧪 Tester mes clés</button></div>
      </div>

      <div style={S.carte}>
        <div style={S.titre}>3. Active</div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6, fontSize: 13.5 }}>
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} style={{ marginTop: 3 }} />
          <span><b>Proposer « Payer maintenant »</b> à mes clients après leur commande (ils peuvent toujours choisir de payer à la livraison).</span>
        </label>
        <div style={{ ...S.aide, marginTop: 8 }}>Quand un client paie, tu reçois une <b>notification « 💳 Paiement reçu »</b>, la commande est marquée « payé en ligne » et reste à livrer. Le livreur ne réclamera que le reste éventuel.</div>
        <div style={{ marginTop: 12 }}><button style={S.bouton} onClick={enregistrer} disabled={enCours}>{enCours ? "…" : "Enregistrer"}</button></div>
        <Message m={msg} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Réseau anti-refus + annuaire
function OngletReseau({ workspace }) {
  const [opt, setOpt] = useState(null);
  const [reseau, setReseau] = useState(true);
  const [an, setAn] = useState({ actif: false, categorie: "Autre", description: "" });
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState(null);
  const appliquer = (d) => { setOpt(d); setReseau(!!d.reseau?.actif); setAn({ actif: !!d.annuaire.actif, categorie: d.annuaire.categorie, description: d.annuaire.description || "" }); };
  useEffect(() => {
    appeler("options_lire", { workspace_id: workspace.id }).then(({ status, data }) => (status === 200 ? appliquer(data) : setMsg({ ok: false, texte: data.error || "Chargement impossible" })));
  }, [workspace.id]);
  async function enregistrer() {
    setEnCours(true); setMsg(null);
    const { status, data } = await appeler("options_enregistrer", { workspace_id: workspace.id, reseau_actif: reseau, annuaire: an });
    setEnCours(false);
    if (status === 200) { appliquer(data); setMsg({ ok: true, texte: "Enregistré." }); } else setMsg({ ok: false, texte: data.error || "Erreur" });
  }
  if (!opt) return <div style={{ ...S.aide, padding: 20 }}>{msg ? msg.texte : "Chargement…"}</div>;
  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>🛡️ Réseau anti-refus</div>
        <div style={S.aide}>
          Un client qui refuse ses colis dans une boutique le refait souvent ailleurs. Avec le réseau, RecuVente te prévient sur tes commandes en cours : <b>« ⚠️ ce numéro a eu des refus dans N autres boutiques »</b>. Tu décides ensuite d'appeler, de demander un acompte ou de ne pas expédier.
        </div>
        <div style={{ ...S.aide, marginTop: 8 }}>
          <b>Ce qui est partagé :</b> uniquement des <b>chiffres</b> (combien de boutiques, combien de refus) sur un numéro de téléphone. <b>Jamais</b> de nom de client, de nom de boutique, de produit ni de montant. En échange, tes propres refus comptent pour les autres. Tu peux te retirer quand tu veux : tu ne reçois alors plus d'alertes non plus.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5 }}>
          <input type="checkbox" checked={reseau} onChange={(e) => setReseau(e.target.checked)} /> <b>Participer au réseau anti-refus</b>
        </label>
      </div>

      <div style={S.carte}>
        <div style={S.titre}>📒 Annuaire des boutiques RecuVente</div>
        <div style={S.aide}>Une page publique qui liste les boutiques qui le souhaitent, pour que les acheteurs les découvrent. C'est gratuit et <b>facultatif</b>.</div>
        {!opt.annuaire.eligible && <div style={{ ...S.aide, color: "#B23A26", marginTop: 8 }}>⚠️ Ta boutique doit d'abord être <b>publiée</b> (Ma Boutique → Publier) pour apparaître dans l'annuaire.</div>}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5 }}>
          <input type="checkbox" checked={an.actif} onChange={(e) => setAn({ ...an, actif: e.target.checked })} /> <b>Afficher ma boutique dans l'annuaire</b>
        </label>
        {an.actif && (
          <>
            <label style={S.label}>Catégorie</label>
            <select style={S.champ} value={an.categorie} onChange={(e) => setAn({ ...an, categorie: e.target.value })}>
              {(opt.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={S.label}>Une phrase pour donner envie (160 caractères max)</label>
            <input style={S.champ} maxLength={160} value={an.description} onChange={(e) => setAn({ ...an, description: e.target.value })} placeholder="ex : Soins naturels du visage, livrés partout à Abidjan" />
          </>
        )}
        <div style={{ ...S.aide, marginTop: 10 }}>Voir l'annuaire : <a href="/?annuaire=1" target="_blank" rel="noreferrer" style={{ color: "#1a7a3c", fontWeight: 600 }}>/?annuaire=1</a></div>
      </div>
      <button style={S.bouton} onClick={enregistrer} disabled={enCours}>{enCours ? "…" : "Enregistrer"}</button>
      <Message m={msg} />
    </div>
  );
}

// ---------------------------------------------------------------- Ambassadeur
function OngletAmbassadeur() {
  const [d, setD] = useState(null);
  const [contact, setContact] = useState("");
  const [msg, setMsg] = useState(null);
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    appeler("amb_moi", {}).then(({ status, data }) => { if (status === 200) { setD(data); setContact(data.contact_paiement || ""); } else setMsg({ ok: false, texte: data.error || "Chargement impossible" }); });
  }, []);
  if (!d) return <div style={{ ...S.aide, padding: 20 }}>{msg ? msg.texte : "Chargement…"}</div>;
  const texteWA = `Je gère mes ventes et mes livraisons avec RecuVente : c'est simple et ça marche très bien pour le paiement à la livraison. Essaie gratuitement ici 👉 ${d.lien}`;
  async function copier() { try { await navigator.clipboard.writeText(d.lien); setCopie(true); setTimeout(() => setCopie(false), 1800); } catch (_) { window.prompt("Copie ton lien :", d.lien); } }
  async function enregistrerContact() {
    const { status, data } = await appeler("amb_infos", { nom: d.nom, contact_paiement: contact });
    if (status === 200) { setD(data); setMsg({ ok: true, texte: "Enregistré." }); } else setMsg({ ok: false, texte: data.error || "Erreur" });
  }
  return (
    <div>
      <div style={{ ...S.carte, background: "#FFF8E7", borderColor: "#F5E2A9" }}>
        <div style={S.titre}>🤝 Deviens ambassadeur RecuVente</div>
        <div style={S.aide}>Tu connais d'autres vendeurs ? Partage ton lien : <b>chaque fois qu'une boutique que tu as amenée paie son abonnement, tu gagnes {d.taux} %</b> du prix, pendant {d.mois} mois. Sans limite de nombre de boutiques.</div>
      </div>
      <div style={S.carte}>
        <div style={S.titre}>Ton lien personnel</div>
        <input readOnly value={d.lien} onFocus={(e) => e.target.select()} style={{ ...S.champ, fontFamily: "monospace", fontSize: 13 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button style={S.bouton} onClick={copier}>{copie ? "✅ Copié" : "📋 Copier le lien"}</button>
          <a style={{ ...S.boutonClair, textDecoration: "none", display: "inline-block" }} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(texteWA)}`}>💬 Envoyer sur WhatsApp</a>
        </div>
        <div style={{ ...S.aide, marginTop: 10 }}>Ton code : <b style={{ fontFamily: "monospace" }}>{d.code}</b> · Calculateur pour convaincre : <a href="/?outils=1" target="_blank" rel="noreferrer" style={{ color: "#1a7a3c", fontWeight: 600 }}>/?outils=1</a></div>
      </div>
      <div style={S.carte}>
        <div style={S.titre}>Tes gains</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1, background: "#F1F8EC", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11.5, color: "#6B7168" }}>À recevoir</div><div style={{ fontWeight: 800, fontSize: 18, color: "#1a7a3c" }}>{somme(d.totaux.due)}</div></div>
          <div style={{ flex: 1, background: "#F4F1E8", borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11.5, color: "#6B7168" }}>Déjà reçu</div><div style={{ fontWeight: 800, fontSize: 18 }}>{somme(d.totaux.payee)}</div></div>
        </div>
        <label style={S.label}>Où veux-tu recevoir ton argent ? (ex : Wave 07 00 00 00 00)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={S.champ} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Wave / Orange Money / MTN + ton numéro" />
          <button style={S.boutonClair} onClick={enregistrerContact}>OK</button>
        </div>
        <div style={{ ...S.aide, marginTop: 8 }}>Les commissions sont versées par RecuVente sur ce moyen de paiement.</div>
        <Message m={msg} />
      </div>
      <div style={S.carte}>
        <div style={S.titre}>Tes boutiques parrainées ({d.filleuls.length})</div>
        {d.filleuls.length === 0 ? <div style={{ ...S.aide, marginTop: 6 }}>Personne pour l'instant. Partage ton lien pour commencer.</div> : d.filleuls.map((f, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i ? "1px solid #F1EFE8" : "none", fontSize: 13.5 }}>
            <span>{f.nom}</span><Pastille ok={f.etat === "abonné"}>{f.etat}</Pastille>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Propriétaire RecuVente
function OngletAdmin({ donnees, recharger }) {
  const [boutiques, setBoutiques] = useState([]);
  const [msg, setMsg] = useState(null);
  useEffect(() => { appeler("annuaire_admin_liste", {}).then(({ status, data }) => status === 200 && setBoutiques(data.boutiques || [])); }, []);
  async function payer(a) {
    if (!window.confirm(`Confirmer que tu as payé ${somme(a.totaux.due)} à ${a.nom || a.email} ?`)) return;
    const { status, data } = await appeler("amb_admin_payer", { ambassadeur_id: a.id });
    setMsg(status === 200 ? { ok: true, texte: `${data.commissions_payees} commission(s) marquée(s) payée(s).` } : { ok: false, texte: data.error || "Erreur" });
    recharger();
  }
  async function une(b, jours) {
    await appeler("annuaire_une", { cible_id: b.id, jours });
    const r = await appeler("annuaire_admin_liste", {}); if (r.status === 200) setBoutiques(r.data.boutiques || []);
  }
  const total = donnees.ambassadeurs.reduce((s, a) => s + Object.values(a.totaux.due).reduce((x, n) => x + n, 0), 0);
  return (
    <div>
      <div style={S.carte}>
        <div style={S.titre}>👑 Ambassadeurs — ce que tu leur dois</div>
        <div style={S.aide}>Commission : {donnees.taux} % pendant {donnees.mois} mois (réglable avec AMBASSADEUR_TAUX et AMBASSADEUR_MOIS dans Vercel). Total dû : <b>{nombre(total)}</b>.</div>
        {donnees.ambassadeurs.length === 0 && <div style={{ ...S.aide, marginTop: 8 }}>Aucun ambassadeur pour l'instant.</div>}
        {donnees.ambassadeurs.map((a) => (
          <div key={a.id} style={{ borderTop: "1px solid #F1EFE8", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{a.nom || a.email}</div><div style={S.aide}>{a.email} · code {a.code} · {a.filleuls} boutique(s)</div>{a.contact_paiement && <div style={{ ...S.aide, color: "#16231F" }}>💸 {a.contact_paiement}</div>}</div>
              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, color: "#1a7a3c" }}>{somme(a.totaux.due)}</div><div style={S.aide}>déjà payé : {somme(a.totaux.payee)}</div>
                {Object.values(a.totaux.due).some((v) => v > 0) && <button style={{ ...S.bouton, padding: "6px 10px", fontSize: 12.5, marginTop: 6 }} onClick={() => payer(a)}>Marquer payé</button>}</div>
            </div>
          </div>
        ))}
        <Message m={msg} />
      </div>
      <div style={S.carte}>
        <div style={S.titre}>⭐ Annuaire — « à la une » (offre payante possible)</div>
        <div style={S.aide}>Une boutique « à la une » passe en tête de l'annuaire. Tu peux le vendre à tes clients puis l'activer ici.</div>
        {boutiques.length === 0 && <div style={{ ...S.aide, marginTop: 8 }}>Aucune boutique inscrite à l'annuaire.</div>}
        {boutiques.map((b) => {
          const actif = b.a_la_une_jusqua && new Date(b.a_la_une_jusqua) > new Date();
          return (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #F1EFE8", padding: "8px 0", fontSize: 13.5 }}>
              <span>{b.nom} {actif && <Pastille ok>⭐ jusqu'au {new Date(b.a_la_une_jusqua).toLocaleDateString("fr-FR")}</Pastille>}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button style={{ ...S.boutonClair, padding: "5px 9px", fontSize: 12 }} onClick={() => une(b, 30)}>+30 j</button>
                {actif && <button style={{ ...S.boutonClair, padding: "5px 9px", fontSize: 12 }} onClick={() => une(b, 0)}>Retirer</button>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Fenêtre
export default function CroissanceModal({ workspace, onClose, ongletInitial }) {
  const [onglet, setOnglet] = useState(ongletInitial || "paiement");
  const [admin, setAdmin] = useState(null);
  const charger = () => appeler("amb_admin_liste", {}).then(({ status, data }) => setAdmin(status === 200 ? data : false));
  useEffect(() => { charger(); }, []);
  const onglets = [
    { id: "paiement", label: "💳 Paiement en ligne" },
    { id: "reseau", label: "🛡️ Réseau & annuaire" },
    { id: "ambassadeur", label: "🤝 Ambassadeur" },
    ...(admin ? [{ id: "admin", label: "👑 Propriétaire" }] : []),
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FAFAF7", width: "100%", maxWidth: 640, maxHeight: "94vh", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
        <div style={{ padding: "16px 18px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🚀 Croissance</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7168" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", overflowX: "auto" }}>
          {onglets.map((o) => (
            <button key={o.id} onClick={() => setOnglet(o.id)} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer", border: onglet === o.id ? "1px solid #1a7a3c" : "1px solid #DDD8CC", background: onglet === o.id ? "#1a7a3c" : "white", color: onglet === o.id ? "white" : "#16231F" }}>{o.label}</button>
          ))}
        </div>
        <div style={{ padding: "4px 18px 26px", overflowY: "auto" }}>
          {onglet === "paiement" && <OngletPaiement workspace={workspace} />}
          {onglet === "reseau" && <OngletReseau workspace={workspace} />}
          {onglet === "ambassadeur" && <OngletAmbassadeur />}
          {onglet === "admin" && admin && <OngletAdmin donnees={admin} recharger={charger} />}
        </div>
      </div>
    </div>
  );
}
