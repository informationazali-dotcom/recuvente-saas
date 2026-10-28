// =====================================================================
// RecuVente — Réseau national : ESPACE VENDEUR PARTENAIRE
// Inscription, articles proposés (validés par l'administration puis confiés
// à un représentant), ventes, commission, règlements reçus, alertes.
// =====================================================================
import React, { useCallback, useEffect, useState } from "react";
import {
  fmt, fmtDate, rpc, erreurTexte, useStylesReseau, STATUTS_ARTICLE,
  Bouton, Champ, Message, Vide, Pastille, BoutonAlertes, useMarque, EnteteEspace,
} from "./ReseauCommun.jsx";
import { Connexion, FormulaireArticle } from "./ReseauRepresentant.jsx";

export default function EspaceVendeur({ supabase, slug }) {
  const [session, setSession] = useState(undefined);
  const [info, setInfo] = useState(undefined);
  const [erreur, setErreur] = useState("");
  useStylesReseau(info?.boutique?.couleur_principale, info?.boutique?.couleur_or);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const lier = useCallback(() => {
    rpc(supabase, "rn_vendeur_lier", { p_slug: slug }).then(setInfo).catch((e) => { setErreur(erreurTexte(e)); setInfo(null); });
  }, [supabase, slug]);
  useEffect(() => {
    if (!session) { setInfo(session === null ? null : undefined); return; }
    lier();
  }, [session, lier]);

  if (session === undefined || (session && info === undefined))
    return <div className="rn" style={{ display: "grid", placeItems: "center" }}><span className="rn-spin" style={{ color: "var(--rn-prune)", width: 28, height: 28 }} /></div>;
  if (!session)
    return (
      <Connexion supabase={supabase} slug={slug} titre="Espace vendeur partenaire"
        texte="Déposez vos vêtements de seconde main : nous les vendons et les livrons partout en Côte d'Ivoire."
        texteCreation="Créez votre accès avec votre adresse e-mail, puis remplissez votre demande." />
    );
  if (!info)
    return <div className="rn"><Vide titre="Boutique introuvable" action={<Bouton variante="contour" onClick={() => supabase.auth.signOut()}>Se déconnecter</Bouton>}>{erreur}</Vide></div>;

  const v = info.vendeur;
  if (!v) return <Inscription supabase={supabase} slug={slug} info={info} session={session} fini={lier} />;
  if (v.statut === "en_attente")
    return (
      <div className="rn">
        <Vide titre="Demande en cours d'examen" action={<Bouton variante="contour" onClick={() => supabase.auth.signOut()}>Se déconnecter</Bouton>}>
          Merci {v.nom}. L'administration étudie votre demande et vous contactera. Revenez sur cette page une fois votre compte activé.
        </Vide>
      </div>
    );
  if (v.statut !== "actif")
    return <div className="rn"><Vide titre="Compte vendeur inactif" action={<Bouton variante="contour" onClick={() => supabase.auth.signOut()}>Se déconnecter</Bouton>}>Contactez l'administration.</Vide></div>;
  return <Tableau supabase={supabase} slug={slug} info={info} />;
}

function Inscription({ supabase, slug, info, session, fini }) {
  const [f, setF] = useState({ nom: "", tel: "" });
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  if (!info.actifs)
    return (
      <div className="rn">
        <Vide titre="Inscriptions fermées" action={<Bouton variante="contour" onClick={() => supabase.auth.signOut()}>Se déconnecter</Bouton>}>
          Les inscriptions de vendeurs partenaires ne sont pas encore ouvertes. Revenez bientôt.
        </Vide>
      </div>
    );
  const envoyer = async (e) => {
    e.preventDefault(); setCharge(true); setMsg({});
    try { await rpc(supabase, "rn_vendeur_inscrire", { p_slug: slug, p_nom: f.nom, p_tel: f.tel }); fini(); }
    catch (e2) { setMsg({ ton: "danger", texte: erreurTexte(e2) }); } finally { setCharge(false); }
  };
  return (
    <div className="rn" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <form className="rn-carte rn-pile" style={{ width: "100%", maxWidth: 440, gap: 14 }} onSubmit={envoyer}>
        <h2>Devenir vendeur partenaire</h2>
        <p className="rn-muet">{info.boutique?.nom_plateforme}. Vous proposez vos articles, nous les vendons ; vous touchez le montant de la vente moins la commission de la plateforme.</p>
        <Champ label="Nom ou nom de votre boutique"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required /></Champ>
        <Champ label="Téléphone (WhatsApp de préférence)"><input type="tel" inputMode="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} required /></Champ>
        <p className="rn-petit rn-muet">Compte : {session.user.email}</p>
        <Message ton={msg.ton}>{msg.texte}</Message>
        <Bouton type="submit" chargement={charge}>Envoyer ma demande</Bouton>
        <button type="button" className="rn-lien rn-petit" onClick={() => supabase.auth.signOut()}>Utiliser un autre compte</button>
      </form>
    </div>
  );
}

function Tableau({ supabase, slug, info }) {
  const ws = info.workspace_id;
  const v = info.vendeur;
  const [onglet, setOnglet] = useState("resume");
  const marque = useMarque(supabase, slug);
  const [t, setT] = useState(null);
  const [erreur, setErreur] = useState("");
  const charger = useCallback(async () => {
    try { setT(await rpc(supabase, "rn_vendeur_tableau", { p_ws: ws })); } catch (e) { setErreur(erreurTexte(e)); }
  }, [supabase, ws]);
  useEffect(() => { charger(); const i = setInterval(charger, 60000); return () => clearInterval(i); }, [charger]);

  const aValider = (t?.articles || []).filter((a) => a.statut === "en_attente").length;
  const onglets = [
    ["resume", "Résumé"],
    ["articles", "Mes articles", aValider],
    ["proposer", "Proposer un article"],
    ["argent", "Ventes et règlements"],
    ["alertes", "Alertes"],
  ];
  return (
    <div className="rn rn-app">
      <div>
        <EnteteEspace logo={marque?.logo} plateforme={info.boutique?.nom_plateforme} espace="Espace vendeur partenaire" titre={v.nom}
          droite={<button className="rn-btn rn-btn-petit" style={{ background: "rgba(255,255,255,.14)", color: "#fff" }} onClick={() => supabase.auth.signOut()}>Quitter</button>} />
        <nav className="rn-onglets">
          {onglets.map(([k, l, n]) => (
            <button key={k} className="rn-onglet" aria-current={onglet === k ? "page" : undefined} onClick={() => setOnglet(k)}>
              {l}{n ? <span className="rn-compteur">{n}</span> : null}
            </button>
          ))}
        </nav>
      </div>
      <main className="rn-zone-travail" style={{ maxWidth: 820 }}>
        <Message ton="danger" onFermer={() => setErreur("")}>{erreur}</Message>
        <BoutonAlertes supabase={supabase} workspaceId={ws} role="vendeur" />
        {!t ? <span className="rn-spin" /> : null}
        {t && onglet === "resume" ? <Resume t={t} v={v} aller={setOnglet} /> : null}
        {t && onglet === "articles" ? <Articles t={t} /> : null}
        {onglet === "proposer" ? <Proposer supabase={supabase} slug={slug} ws={ws} fini={() => { charger(); setOnglet("articles"); }} /> : null}
        {t && onglet === "argent" ? <Argent t={t} /> : null}
        {t && onglet === "alertes" ? (
          t.notifications.length ? (
            <div className="rn-pile">
              {t.notifications.map((n, i) => (
                <div key={i} className="rn-carte">
                  <div className="rn-entre"><b>{n.titre}</b><span className="rn-muet rn-petit">{fmtDate(n.date)}</span></div>
                  {n.message ? <p className="rn-petit" style={{ marginTop: 4 }}>{n.message}</p> : null}
                </div>
              ))}
            </div>
          ) : <Vide titre="Aucune alerte">Validation de vos articles, ventes et règlements apparaîtront ici.</Vide>
        ) : null}
      </main>
    </div>
  );
}

function Resume({ t, v, aller }) {
  const x = t.totaux || {};
  const enVente = t.articles.filter((a) => a.statut === "disponible").length;
  const kpis = [
    ["Ventes livrées", fmt(x.ventes)],
    [`Commission plateforme (${x.taux ?? v.taux} %)`, fmt(x.commission)],
    ["Montant qui vous revient", fmt(x.net)],
    ["Déjà réglé", fmt(x.regle)],
    ["Reste à vous régler", fmt(x.reste)],
    ["Articles en vente", enVente],
  ];
  return (
    <>
      <h2>Résumé</h2>
      <div className="rn-kpis">
        {kpis.map(([l, val]) => <div className="rn-kpi" key={l}><div className="rn-kpi-lab">{l}</div><div className="rn-kpi-val">{val}</div></div>)}
      </div>
      {v.gardien ? <p className="rn-petit rn-muet">Vos articles sont confiés à <b>{v.gardien}</b>, représentant chargé de les garder et de les livrer.</p> : null}
      {!t.articles.length ? (
        <Vide titre="Proposez votre premier article" action={<Bouton onClick={() => aller("proposer")}>Proposer un article</Bouton>}>
          Photos réelles, état honnête, prix juste : l'administration valide puis l'article est mis en vente.
        </Vide>
      ) : null}
    </>
  );
}

function Articles({ t }) {
  if (!t.articles.length) return <Vide titre="Aucun article">Vos propositions apparaîtront ici avec leur statut.</Vide>;
  return (
    <>
      <h2>Mes articles</h2>
      {t.articles.map((a) => (
        <div className="rn-carte rn-mini-article" key={a.id} style={{ gridTemplateColumns: "52px 1fr auto" }}>
          {a.photo ? <img src={a.photo} alt="" /> : <span />}
          <span>
            <b>{a.titre}</b><br />
            <span className="rn-muet rn-petit">Réf. {a.reference}, proposé le {fmtDate(a.date, false)}</span><br />
            <Pastille ton={STATUTS_ARTICLE[a.statut]?.ton}>{STATUTS_ARTICLE[a.statut]?.label || a.statut}</Pastille>
            {a.motif_refus ? <><br /><span className="rn-petit" style={{ color: "var(--rn-rouge)" }}>Motif : {a.motif_refus}</span></> : null}
          </span>
          <span style={{ textAlign: "right" }}>
            <b>{fmt(a.prix)}</b><br />
            <span className="rn-petit rn-muet">{a.en_stock} en stock, {a.vendus} vendu(s)</span>
          </span>
        </div>
      ))}
    </>
  );
}

function Proposer({ supabase, slug, ws, fini }) {
  const [cats, setCats] = useState([]);
  const [v, setV] = useState({ etat: "bon", quantite: 1, photos: [] });
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  useEffect(() => {
    rpc(supabase, "rn_boutique", { p_slug: slug }).then((b) => setCats((b?.categories || []).filter((c) => !c.parent_id).map((c) => c.nom))).catch(() => {});
  }, [supabase, slug]);
  const envoyer = async () => {
    setCharge(true); setMsg({});
    try {
      await rpc(supabase, "rn_vendeur_proposer_article", {
        p_ws: ws,
        p: { ...v, categorie: v.categorie || cats[0], prix: Number(v.prix), prix_barre: v.prix_barre ? Number(v.prix_barre) : null, quantite: Number(v.quantite) || 1 },
      });
      setMsg({ ton: "ok", texte: "Article envoyé. Vous serez prévenu dès sa validation." });
      setV({ etat: "bon", quantite: 1, photos: [] });
      setTimeout(fini, 1500);
    } catch (e) { setMsg({ ton: "danger", texte: erreurTexte(e) }); } finally { setCharge(false); }
  };
  return (
    <div className="rn-pile" style={{ gap: 16 }}>
      <h2>Proposer un article</h2>
      <FormulaireArticle supabase={supabase} workspaceId={ws} valeur={v} categories={cats} onChange={setV} />
      <Champ label="Nombre de pièces identiques"><input inputMode="numeric" value={v.quantite} onChange={(e) => setV({ ...v, quantite: e.target.value.replace(/\D/g, "") })} /></Champ>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton chargement={charge} disabled={!v.titre || !v.prix || !v.photos?.length} onClick={envoyer}>Envoyer pour validation</Bouton>
    </div>
  );
}

function Argent({ t }) {
  return (
    <>
      <h2>Ventes</h2>
      {t.ventes.length ? (
        <div className="rn-table-boite">
          <table className="rn-table">
            <thead><tr><th>Date</th><th>Article</th><th className="rn-num">Montant</th></tr></thead>
            <tbody>{t.ventes.map((x, i) => <tr key={i}><td>{fmtDate(x.date, false)}</td><td>{x.titre}{x.quantite > 1 ? ` × ${x.quantite}` : ""}</td><td className="rn-num">{fmt(x.montant)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="rn-muet">Aucune vente livrée pour le moment.</p>}
      <h2>Règlements reçus</h2>
      {t.reglements.length ? (
        <div className="rn-table-boite">
          <table className="rn-table">
            <thead><tr><th>Date</th><th>Mode</th><th>Référence</th><th className="rn-num">Montant</th></tr></thead>
            <tbody>{t.reglements.map((x, i) => <tr key={i}><td>{fmtDate(x.date, false)}</td><td>{x.mode || "—"}</td><td>{x.reference || "—"}</td><td className="rn-num">{fmt(x.montant)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="rn-muet">Aucun règlement pour le moment.</p>}
      <div className="rn-carte rn-entre"><b>Reste à vous régler</b><b style={{ fontSize: 20 }}>{fmt(t.totaux?.reste)}</b></div>
    </>
  );
}
