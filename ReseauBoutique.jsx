// =====================================================================
// RecuVente — Réseau national : BOUTIQUE PUBLIQUE (espace client)
// Accueil, catalogue filtrable, fiche article, panier, commande, suivi
// =====================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fmt, fmtDate, rpc, erreurTexte, lienWhatsApp, useStylesReseau, useCompteARebours, formatDuree,
  ETATS, MODES_PAIEMENT, ETAPES_CLIENT, STATUTS, Bouton, Champ, Message, Vide, Pastille, StatutCommande, Icone,
} from "./ReseauCommun.jsx";
import AccueilLivres from "./ReseauVitrineLivres.jsx";

const lirePanier = (slug) => {
  try { return JSON.parse(localStorage.getItem("rn_panier_" + slug) || "[]"); } catch { return []; }
};
const ecrirePanier = (slug, p) => {
  try { localStorage.setItem("rn_panier_" + slug, JSON.stringify(p)); } catch { /* stockage indisponible */ }
};
// « univers » de la boutique : mode de seconde main (par défaut) ou livres / guides
let LIVRES = false;
const etatLibelle = (e) => (LIVRES && e === "neuf_etiquette" ? "Neuf" : ETATS[e] || e);

const nouvelleCle = () =>
  (crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));

// Navigation simple par paramètres d'URL (compatible avec n'importe quel routeur)
function useVue() {
  const lire = () => {
    const q = new URLSearchParams(window.location.search);
    return { vue: q.get("rn_vue") || (q.get("rn_suivi") ? "suivi" : "accueil"), id: q.get("rn_article"), suivi: q.get("rn_suivi"), page: q.get("rn_page") };
  };
  const [etat, setEtat] = useState(lire);
  useEffect(() => {
    const f = () => setEtat(lire());
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const aller = useCallback((params) => {
    // on garde « ?reseau=<slug> » (la route RecuVente) et on préfixe nos paramètres par rn_
    const actuel = new URLSearchParams(window.location.search);
    const q = new URLSearchParams();
    if (actuel.get("reseau")) q.set("reseau", actuel.get("reseau"));
    Object.entries(params).forEach(([k, v]) => v && q.set("rn_" + k, v));
    const s = q.toString();
    window.history.pushState({}, "", window.location.pathname + (s ? "?" + s : ""));
    setEtat(lire());
    window.scrollTo({ top: 0 });
  }, []);
  return [etat, aller];
}

export default function BoutiqueReseau({ supabase, slug }) {
  const [boutique, setBoutique] = useState(null);
  const [articles, setArticles] = useState(null);
  const [erreur, setErreur] = useState("");
  const [panier, setPanier] = useState(() => lirePanier(slug));
  const [nav, aller] = useVue();
  const p = boutique?.parametres || {};
  LIVRES = p.textes?.univers === "livres";
  useStylesReseau(p.couleur_principale, p.couleur_or);

  const charger = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([rpc(supabase, "rn_boutique", { p_slug: slug }), rpc(supabase, "rn_catalogue", { p_slug: slug })]);
      if (!b) { setErreur("Cette boutique n'est pas encore ouverte."); return; }
      setBoutique(b);
      setArticles(a || []);
      document.title = b.parametres?.nom_plateforme || b.nom;
    } catch (e) { setErreur(erreurTexte(e)); }
  }, [supabase, slug]);
  useEffect(() => { charger(); }, [charger]);

  // le panier ne garde que les articles encore en vente, avec la quantité disponible
  const panierValide = useMemo(() => {
    if (!articles) return panier;
    return panier
      .map((l) => {
        const a = articles.find((x) => x.id === l.id);
        return a ? { ...l, article: a, quantite: Math.min(l.quantite, a.disponible) } : null;
      })
      .filter(Boolean);
  }, [panier, articles]);
  const majPanier = (n) => { setPanier(n); ecrirePanier(slug, n); };
  const ajouter = (a, q = 1) => {
    const ex = panier.find((l) => l.id === a.id);
    majPanier(ex ? panier.map((l) => (l.id === a.id ? { ...l, quantite: Math.min(a.disponible, l.quantite + q) } : l)) : [...panier, { id: a.id, quantite: q }]);
  };
  const nbPanier = panierValide.reduce((s, l) => s + l.quantite, 0);

  if (erreur)
    return (
      <div className="rn">
        <Vide titre="Boutique indisponible">{erreur}</Vide>
      </div>
    );
  if (!boutique || !articles)
    return (
      <div className="rn" style={{ display: "grid", placeItems: "center" }}>
        <span className="rn-spin" style={{ color: "var(--rn-prune)", width: 28, height: 28 }} aria-label="Chargement" />
      </div>
    );

  const nom = p.nom_plateforme || boutique.nom;
  return (
    <div className="rn">
      <header className="rn-entete">
        <div className="rn-conteneur rn-entete-in">
          <button className="rn-marque" onClick={() => aller({})} aria-label="Accueil">
            {boutique.logo_url ? <img src={boutique.logo_url} alt="" /> : null}
            <span className="rn-marque-nom">{nom}</span>
          </button>
          <div className="rn-entete-actions">
            <button className="rn-icone-btn" onClick={() => aller({ vue: "mes-commandes" })} aria-label="Suivre ma commande">
              {Icone.colis}
            </button>
            <button className="rn-icone-btn" onClick={() => aller({ vue: "panier" })} aria-label={`Panier (${nbPanier})`}>
              {Icone.panier}
              {nbPanier ? <span className="rn-compteur">{nbPanier}</span> : null}
            </button>
          </div>
        </div>
      </header>

      <main>
        {nav.vue === "accueil" && LIVRES ? (
          <AccueilLivres supabase={supabase} slug={slug} boutique={boutique} articles={articles}
            ouvrir={(id) => aller({ vue: "article", article: id })}
            ajouter={(a, q) => { ajouter(a, q); aller({ vue: "panier" }); }}
            voirCatalogue={() => aller({ vue: "catalogue" })} />
        ) : null}
        {(nav.vue === "accueil" && !LIVRES) || nav.vue === "catalogue" ? (
          <Catalogue boutique={boutique} articles={articles} accueil={nav.vue === "accueil"} ouvrir={(id) => aller({ vue: "article", article: id })} />
        ) : null}
        {nav.vue === "article" ? (
          <FicheArticle
            article={articles.find((a) => a.id === nav.id)}
            dansPanier={panier.some((l) => l.id === nav.id)}
            ajouter={(a) => { ajouter(a); aller({ vue: "panier" }); }}
            retour={() => window.history.back()}
          />
        ) : null}
        {nav.vue === "panier" ? (
          <Panier
            supabase={supabase} slug={slug} boutique={boutique} lignes={panierValide}
            changer={(id, q) => majPanier(q <= 0 ? panier.filter((l) => l.id !== id) : panier.map((l) => (l.id === id ? { ...l, quantite: q } : l)))}
            vider={() => majPanier([])}
            continuer={() => aller({ vue: "catalogue" })}
            commandeCreee={(r) => { majPanier([]); charger(); aller({ suivi: r.suivi_token, vue: "suivi" }); }}
          />
        ) : null}
        {nav.vue === "suivi" && nav.suivi ? <Suivi supabase={supabase} token={nav.suivi} boutique={boutique} /> : null}
        {nav.vue === "mes-commandes" ? <MesCommandes supabase={supabase} slug={slug} ouvrir={(t) => aller({ suivi: t, vue: "suivi" })} /> : null}
        {nav.vue === "page" && nav.page === "contact" ? <Contact supabase={supabase} slug={slug} boutique={boutique} /> : null}
        {nav.vue === "page" && nav.page !== "contact" ? <PageInfo boutique={boutique} page={nav.page} /> : null}
      </main>

      <footer className="rn-pied">
        <div className="rn-pied-in">
          <div>
            <h3>{nom}</h3>
            <p>{LIVRES ? "Les publications officielles Miss & Mister Excellence, livrées partout en Côte d'Ivoire par notre réseau de représentants." : "Mode de seconde main sélectionnée, livrée partout en Côte d'Ivoire par notre réseau de représentants."}</p>
          </div>
          <div className="rn-pile" style={{ gap: 8 }}>
            <button onClick={() => aller({ vue: "page", page: "livraison" })}>Livraison</button>
            <button onClick={() => aller({ vue: "page", page: "retours" })}>Retours et réclamations</button>
            <button onClick={() => aller({ vue: "page", page: "conditions" })}>Conditions générales de vente</button>
            <button onClick={() => aller({ vue: "page", page: "confidentialite" })}>Données personnelles</button>
          </div>
          <div className="rn-pile" style={{ gap: 8 }}>
            <button onClick={() => aller({ vue: "mes-commandes" })}>Suivre ma commande</button>
            <button onClick={() => aller({ vue: "page", page: "contact" })}>Nous contacter</button>
            {p.vendeurs_actifs ? <a href={`?reseau=${encodeURIComponent(slug)}&espace=vendeur`}>Devenir vendeur partenaire</a> : null}
            {boutique.whatsapp ? <a href={lienWhatsApp(boutique.whatsapp, "Bonjour, j'ai une question sur la boutique " + nom)} target="_blank" rel="noreferrer">Nous écrire sur WhatsApp</a> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ catalogue
function Catalogue({ boutique, articles, accueil, ouvrir }) {
  const p = boutique.parametres || {};
  const t = p.textes || {};
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [filtres, setFiltres] = useState({ taille: "", marque: "", etat: "", ville: "", min: "", max: "", tri: "recent" });
  const [feuille, setFeuille] = useState(false);
  const grilleRef = useRef(null);
  const cats = boutique.categories?.length ? boutique.categories.filter((c) => !c.parent_id).map((c) => c.nom) : [];
  const valeurs = (cle) => [...new Set(articles.map((a) => a[cle]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "fr", { numeric: true }));
  const villes = [...new Set(articles.flatMap((a) => a.villes || []))].sort();
  const nbFiltres = ["taille", "marque", "etat", "ville", "min", "max"].filter((k) => filtres[k]).length;

  const liste = useMemo(() => {
    const txt = q.trim().toLowerCase();
    let r = articles.filter(
      (a) =>
        (!cat || a.categorie === cat) &&
        (!txt || [a.titre, a.marque, a.couleur, a.description, a.reference].some((v) => v && String(v).toLowerCase().includes(txt))) &&
        (!filtres.taille || a.taille === filtres.taille) &&
        (!filtres.marque || a.marque === filtres.marque) &&
        (!filtres.etat || a.etat === filtres.etat) &&
        (!filtres.ville || (a.villes || []).includes(filtres.ville)) &&
        (!filtres.min || a.prix >= Number(filtres.min)) &&
        (!filtres.max || a.prix <= Number(filtres.max))
    );
    if (filtres.tri === "prix_asc") r = [...r].sort((a, b) => a.prix - b.prix);
    if (filtres.tri === "prix_desc") r = [...r].sort((a, b) => b.prix - a.prix);
    return r;
  }, [articles, cat, q, filtres]);

  return (
    <>
      {accueil ? (
        <>
          {LIVRES ? (
            <section className="rn-vitrine">
              <div className="rn-vitrine-in">
                <div className="rn-vitrine-texte">
                  {boutique.logo_url ? <img className="rn-vitrine-logo" src={boutique.logo_url} alt={p.nom_plateforme || boutique.nom} /> : null}
                  <span className="rn-vitrine-sur">Éditions officielles · Beauté · Leadership · Excellence</span>
                  <h1>{t.titre_accueil || "Les guides officiels Miss & Mister Excellence"}</h1>
                  <p>{t.sous_titre_accueil || "Livrés partout en Côte d'Ivoire par notre réseau de représentants."}</p>
                  <div className="rn-ligne">
                    <Bouton variante="or" onClick={() => grilleRef.current?.scrollIntoView({ behavior: "smooth" })}>Commander mon guide</Bouton>
                  </div>
                  <ul className="rn-vitrine-atouts">
                    <li>Paiement à la livraison ou Mobile Money</li>
                    <li>Livré dans toute la Côte d'Ivoire</li>
                  </ul>
                </div>
                <div className="rn-vitrine-livres">
                  {articles.slice(0, 2).map((a, i) => (
                    <button key={a.id} className={"rn-livre rn-livre-" + i} onClick={() => ouvrir(a.id)} aria-label={`${a.titre}, ${fmt(a.prix)}`}>
                      {a.photos?.[0] ? <img src={a.photos[0]} alt="" /> : null}
                      <span className="rn-livre-prix">{fmt(a.prix)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rn-echarpe" aria-hidden>
                <span>{Array.from({ length: 6 }, () => p.nom_plateforme || boutique.nom).join("   ✦   ")}</span>
              </div>
            </section>
          ) : (
          <section className="rn-heros">
            {boutique.logo_url ? <img className="rn-heros-logo" src={boutique.logo_url} alt="" /> : Icone.couronne}
            <div className="rn-heros-in">
              <h1>{t.titre_accueil || "La mode qui a déjà du style, à petit prix"}</h1>
              <p>
                {t.sous_titre_accueil ||
                  "Vêtements, chaussures, sacs et accessoires de seconde main, vérifiés pièce par pièce et livrés près de chez vous."}
              </p>
              <Bouton variante="or" onClick={() => grilleRef.current?.scrollIntoView({ behavior: "smooth" })}>
                Voir les {articles.length} {LIVRES ? (articles.length > 1 ? "guides" : "guide") : "articles"}
              </Bouton>
            </div>
            <div className="rn-echarpe" aria-hidden>
              <span>
                {Array.from({ length: 6 }, () => p.nom_plateforme || boutique.nom).join("   ✦   ")}
              </span>
            </div>
          </section>
          )}
          <section className="rn-reassurance">
            {LIVRES ? <div>{Icone.oeil}<p><b>Éditions officielles</b>Les guides du Concours Miss & Mister Excellence, neufs.</p></div>
              : <div>{Icone.oeil}<p><b>De vraies photos</b>Chaque défaut visible est indiqué sur la fiche.</p></div>}
            <div>{Icone.camion}<p><b>Livré par un représentant proche</b>Le stock est réparti dans tout le pays.</p></div>
            <div>{Icone.bouclier}<p><b>Code de remise</b>Vous ne remettez le code qu'en recevant votre article.</p></div>
          </section>
          {cats.length ? (
            <section className="rn-univers" aria-label="Rayons">
              {cats.map((c, i) => {
                const n = articles.filter((x) => x.categorie === c).length;
                const ph = articles.find((x) => x.categorie === c && x.photos?.[0])?.photos[0];
                return (
                  <button key={c} className="rn-univers-carte" onClick={() => { setCat(c); grilleRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                    style={ph ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.65)),url("${ph}")` } : { background: i % 2 ? "var(--rn-prune)" : "var(--rn-or)" }}>
                    <b>{c}</b><span>{n ? (LIVRES ? `${n} guide${n > 1 ? "s" : ""}` : `${n} pièce${n > 1 ? "s" : ""}`) : "Bientôt"}</span>
                  </button>
                );
              })}
            </section>
          ) : null}
          <section className="rn-etapes">
            <h2>Comment ça marche</h2>
            <ol>
              <li><b>Choisissez</b><span>{LIVRES ? "Votre guide : réussite scolaire ou préparation au concours." : "Des pièces de seconde main photographiées en vrai, avec leurs défauts indiqués."}</span></li>
              <li><b>Commandez</b><span>Payez à la livraison ou par Wave, Orange Money, MTN. L'article est réservé pour vous.</span></li>
              <li><b>Recevez</b><span>Le représentant le plus proche vous livre. Vous donnez votre code de remise à la réception.</span></li>
            </ol>
          </section>
        </>
      ) : null}

      <div ref={grilleRef} style={{ scrollMarginTop: 70 }}>
        <nav className="rn-cats" aria-label="Catégories">
          <button className="rn-cat" aria-pressed={!cat} onClick={() => setCat("")}>Tout</button>
          {cats.map((c) => (
            <button key={c} className="rn-cat" aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>
          ))}
        </nav>
        <div className="rn-barre-outils">
          <label className="rn-recherche">
            {Icone.loupe}
            <input type="search" placeholder={LIVRES ? "Rechercher un guide…" : "Robe, baskets, Zara…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un article" />
          </label>
          <Bouton variante="discret" onClick={() => setFeuille(true)} aria-label="Filtres">
            {Icone.filtres}
            {nbFiltres ? <span className="rn-compteur" style={{ position: "static" }}>{nbFiltres}</span> : null}
          </Bouton>
        </div>

        {liste.length ? (
          <div className="rn-grille">
            {liste.map((a) => (
              <CarteArticle key={a.id} a={a} ouvrir={() => ouvrir(a.id)} />
            ))}
          </div>
        ) : (
          <Vide
            titre={articles.length ? "Aucun article ne correspond" : "Les premiers articles arrivent bientôt"}
            action={articles.length ? <Bouton variante="contour" onClick={() => { setQ(""); setCat(""); setFiltres({ taille: "", marque: "", etat: "", ville: "", min: "", max: "", tri: "recent" }); }}>Effacer les filtres</Bouton> : null}
          >
            {articles.length ? "Élargissez la recherche ou retirez un filtre." : null}
          </Vide>
        )}
      </div>

      {feuille ? (
        <div className="rn-feuille" onMouseDown={(e) => e.target === e.currentTarget && setFeuille(false)}>
          <div className="rn-feuille-in" role="dialog" aria-label="Filtres">
            <div className="rn-entre"><h3>Filtres</h3><button className="rn-x" onClick={() => setFeuille(false)} aria-label="Fermer">×</button></div>
            <Champ label="Trier par">
              <select value={filtres.tri} onChange={(e) => setFiltres({ ...filtres, tri: e.target.value })}>
                <option value="recent">Nouveautés</option>
                <option value="prix_asc">Prix croissant</option>
                <option value="prix_desc">Prix décroissant</option>
              </select>
            </Champ>
            <Champ label="Disponible à">
              <select value={filtres.ville} onChange={(e) => setFiltres({ ...filtres, ville: e.target.value })}>
                <option value="">Toutes les villes</option>
                {villes.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Champ>
            <Champ label="Taille">
              <select value={filtres.taille} onChange={(e) => setFiltres({ ...filtres, taille: e.target.value })}>
                <option value="">Toutes</option>
                {valeurs("taille").map((v) => <option key={v}>{v}</option>)}
              </select>
            </Champ>
            <Champ label={LIVRES ? "Édition" : "Marque"}>
              <select value={filtres.marque} onChange={(e) => setFiltres({ ...filtres, marque: e.target.value })}>
                <option value="">Toutes</option>
                {valeurs("marque").map((v) => <option key={v}>{v}</option>)}
              </select>
            </Champ>
            <Champ label="État">
              <select value={filtres.etat} onChange={(e) => setFiltres({ ...filtres, etat: e.target.value })}>
                <option value="">Tous</option>
                {Object.entries(ETATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Champ>
            <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
              <Champ label="Prix min"><input inputMode="numeric" value={filtres.min} onChange={(e) => setFiltres({ ...filtres, min: e.target.value.replace(/\D/g, "") })} /></Champ>
              <Champ label="Prix max"><input inputMode="numeric" value={filtres.max} onChange={(e) => setFiltres({ ...filtres, max: e.target.value.replace(/\D/g, "") })} /></Champ>
            </div>
            <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
              <Bouton variante="discret" className="rn-btn-bloc" onClick={() => setFiltres({ taille: "", marque: "", etat: "", ville: "", min: "", max: "", tri: "recent" })}>Effacer</Bouton>
              <Bouton className="rn-btn-bloc" onClick={() => setFeuille(false)}>Voir {liste.length} article{liste.length > 1 ? "s" : ""}</Bouton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CarteArticle({ a, ouvrir }) {
  return (
    <button className="rn-produit" onClick={ouvrir}>
      <div className="rn-produit-photo">
        {a.photos?.[0] ? <img src={a.photos[0]} alt={a.titre} loading="lazy" /> : null}
        <span className="rn-produit-badge"><Pastille>{etatLibelle(a.etat)}</Pastille></span>
      </div>
      <span className="rn-produit-titre">{a.titre}</span>
      <span className="rn-produit-meta">
        {[a.taille && "Taille " + a.taille, a.marque].filter(Boolean).join(", ") || a.categorie}
      </span>
      <span className="rn-prix">
        {fmt(a.prix)}
        {a.prix_barre > a.prix ? <s>{fmt(a.prix_barre)}</s> : null}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ fiche article
function FicheArticle({ article: a, dansPanier, ajouter, retour }) {
  const [photo, setPhoto] = useState(0);
  if (!a)
    return (
      <Vide titre="Cet article vient d'être vendu" action={<Bouton variante="contour" onClick={retour}>Retour aux articles</Bouton>}>
        {LIVRES ? "Ce guide n'est plus disponible pour le moment. Revenez bientôt." : "Les pièces de seconde main sont souvent uniques. D'autres trouvailles vous attendent."}
      </Vide>
    );
  const details = [
    ["Catégorie", [a.categorie, a.sous_categorie].filter(Boolean).join(" / ")],
    ["Taille", a.taille],
    [LIVRES ? "Édition" : "Marque", a.marque],
    ["Couleur", a.couleur],
    ["État", etatLibelle(a.etat)],
    ["Disponible à", (a.villes || []).join(", ")],
    ["Référence", a.reference],
  ].filter(([, v]) => v);
  return (
    <article className="rn-fiche">
      <div className="rn-galerie">
        <div className="rn-galerie-princ">{a.photos?.[photo] ? <img src={a.photos[photo]} alt={a.titre} /> : null}</div>
        {a.photos?.length > 1 ? (
          <div className="rn-vignettes">
            {a.photos.map((u, i) => (
              <button key={u} aria-current={i === photo} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}>
                <img src={u} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="rn-pile" style={{ alignContent: "start", gap: 16 }}>
        <h2>{a.titre}</h2>
        <p className="rn-prix" style={{ fontSize: 24 }}>
          {fmt(a.prix)}
          {a.prix_barre > a.prix ? <s>{fmt(a.prix_barre)}</s> : null}
        </p>
        {a.disponible === 1 && !LIVRES ? <p className="rn-muet rn-petit">Pièce unique : dès qu'elle est commandée, elle est réservée pour vous.</p> : null}
        {a.defauts ? (
          <div className="rn-defauts"><b>Défauts signalés.</b> {a.defauts}</div>
        ) : null}
        {a.description ? <p style={{ whiteSpace: "pre-line" }}>{a.description}</p> : null}
        <dl className="rn-details">
          {details.map(([k, v]) => (
            <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
          ))}
        </dl>
        <div className="rn-barre-achat">
          <span className="rn-prix" style={{ minWidth: 110 }}>{fmt(a.prix)}</span>
          <Bouton className="rn-btn-bloc" onClick={() => ajouter(a)}>
            {dansPanier ? "Voir mon panier" : "Ajouter au panier"}
          </Bouton>
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ panier + commande
function Panier({ supabase, slug, boutique, lignes, changer, vider, continuer, commandeCreee }) {
  const p = boutique.parametres || {};
  const modes = (p.modes_paiement || ["cod"]).filter((m) => MODES_PAIEMENT[m]);
  const [etape, setEtape] = useState("panier");
  const [f, setF] = useState(() => {
    try { return { mode_paiement: modes[0], ...JSON.parse(localStorage.getItem("rn_client") || "{}") }; } catch { return { mode_paiement: modes[0] }; }
  });
  const [devis, setDevis] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const cle = useRef(nouvelleCle());
  const sousTotal = lignes.reduce((s, l) => s + l.article.prix * l.quantite, 0);

  // zones proposées : villes et communes, regroupées par région
  const zones = boutique.zones || [];
  const groupes = useMemo(() => {
    const parId = Object.fromEntries(zones.map((z) => [z.id, z]));
    const region = (z) => { let c = z; for (let i = 0; i < 4 && c?.parent_id; i++) c = parId[c.parent_id]; return c?.type === "region" ? c.nom : "Autres"; };
    const g = {};
    zones.filter((z) => z.type !== "region").forEach((z) => { (g[region(z)] = g[region(z)] || []).push(z); });
    Object.values(g).forEach((l) => l.sort((a, b) => (a.type === b.type ? a.nom.localeCompare(b.nom, "fr") : a.type === "ville" ? -1 : 1)));
    return g;
  }, [zones]);

  const lignesRpc = useMemo(() => lignes.map((l) => ({ article_id: l.id, quantite: l.quantite })), [lignes]);
  const [codeSaisi, setCodeSaisi] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!f.zone_id || !lignesRpc.length) { setDevis(null); return; }
    let actif = true;
    rpc(supabase, "rn_devis_v2", { p_slug: slug, p_lignes: lignesRpc, p_zone: f.zone_id, p_code: code || null, p_express: !!f.express })
      .then((d) => actif && setDevis(d))
      .catch((e) => actif && setErreur(erreurTexte(e)));
    return () => { actif = false; };
  }, [supabase, slug, f.zone_id, lignesRpc, code, f.express]);
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const position = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => setF((x) => ({ ...x, lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => setErreur("Position non partagée. Ce n'est pas grave : indiquez un point de repère."),
      { enableHighAccuracy: true, timeout: 10000 }
    );

  const valider = async (e) => {
    e.preventDefault();
    setErreur("");
    if (!f.client_nom?.trim()) return setErreur("Indiquez votre nom.");
    if ((f.client_tel || "").replace(/\D/g, "").length < 8) return setErreur("Indiquez un numéro de téléphone joignable.");
    if (!f.zone_id) return setErreur("Choisissez votre ville ou commune.");
    if (devis && !devis.livrable) return setErreur("La livraison n'est pas encore possible vers cette zone pour ce panier.");
    setEnvoi(true);
    try {
      localStorage.setItem("rn_client", JSON.stringify({ client_nom: f.client_nom, client_tel: f.client_tel, client_email: f.client_email, zone_id: f.zone_id, adresse: f.adresse, repere: f.repere }));
    } catch { /* ignore */ }
    try {
      if (code && devis && devis.code_valide === false) { setEnvoi(false); return setErreur(devis.message_code || "Code promo invalide."); }
      const r = await rpc(supabase, "rn_creer_commande", {
        p_slug: slug,
        p: { ...f, express: !!(f.express && devis?.express_possible), code_promo: code && devis?.code_valide ? code : null, idempotency_key: cle.current, lignes: lignesRpc },
      });
      commandeCreee(r);
    } catch (e2) {
      setErreur(erreurTexte(e2));
      cle.current = nouvelleCle();
    } finally { setEnvoi(false); }
  };

  if (!lignes.length)
    return (
      <Vide titre="Votre panier est vide" action={<Bouton onClick={continuer}>Découvrir les articles</Bouton>}>
        Ajoutez une pièce pour commencer votre commande.
      </Vide>
    );

  const total = devis ? devis.total : sousTotal;
  return (
    <form className="rn-panneau" onSubmit={valider}>
      <h2>{etape === "panier" ? "Mon panier" : "Livraison et paiement"}</h2>
      {lignes.map((l) => (
        <div className="rn-ligne-panier" key={l.id}>
          {l.article.photos?.[0] ? <img src={l.article.photos[0]} alt="" /> : <span />}
          <div>
            <p style={{ fontWeight: 600 }}>{l.article.titre}</p>
            <p className="rn-muet rn-petit">{[l.article.taille && "Taille " + l.article.taille, LIVRES ? l.article.marque : etatLibelle(l.article.etat)].filter(Boolean).join(", ")}</p>
            {l.article.disponible > 1 && etape === "panier" ? (
              <span className="rn-qte" style={{ marginTop: 6 }}>
                <button type="button" onClick={() => changer(l.id, l.quantite - 1)} aria-label="Retirer un">−</button>
                <span>{l.quantite}</span>
                <button type="button" onClick={() => changer(l.id, Math.min(l.article.disponible, l.quantite + 1))} aria-label="Ajouter un">+</button>
              </span>
            ) : etape === "panier" ? (
              <button type="button" className="rn-btn rn-btn-discret rn-btn-petit" style={{ marginTop: 6 }} onClick={() => changer(l.id, 0)}>Retirer</button>
            ) : null}
          </div>
          <span className="rn-prix" style={{ fontSize: 15 }}>{fmt(l.article.prix * l.quantite)}</span>
        </div>
      ))}

      {etape === "commande" ? (
        <div className="rn-pile" style={{ gap: 14 }}>
          <Champ label="Nom et prénom"><input autoComplete="name" value={f.client_nom || ""} onChange={maj("client_nom")} required /></Champ>
          <Champ label="Téléphone (WhatsApp de préférence)" aide="Le livreur vous appellera sur ce numéro.">
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={f.client_tel || ""} onChange={maj("client_tel")} required />
          </Champ>
          <Champ label="Ville ou commune de livraison">
            <select value={f.zone_id || ""} onChange={maj("zone_id")} required>
              <option value="">Choisir…</option>
              {Object.entries(groupes).map(([r, zs]) => (
                <optgroup key={r} label={r}>
                  {zs.map((z) => <option key={z.id} value={z.id}>{z.type === "commune" ? "— " : ""}{z.nom}</option>)}
                </optgroup>
              ))}
            </select>
          </Champ>
          {p.express_actif && devis?.express_possible ? (
            <fieldset className="rn-choix" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="rn-champ-label" style={{ marginBottom: 8 }}>Type de livraison</legend>
              <label>
                <input type="radio" name="livraison" checked={!f.express} onChange={() => setF({ ...f, express: false })} />
                <span><b>Standard</b><br /><span className="rn-muet rn-petit">{devis.delai_jours <= 1 ? "Sous 24 h" : `Sous ${devis.delai_jours} jours`}</span></span>
              </label>
              <label>
                <input type="radio" name="livraison" checked={!!f.express} onChange={() => setF({ ...f, express: true })} />
                <span><b>Express (+{fmt(p.frais_express)})</b><br /><span className="rn-muet rn-petit">Livré dans les {p.delai_express_heures || 4} heures environ, aux heures ouvrables.</span></span>
              </label>
            </fieldset>
          ) : null}
          <Champ label="Quartier et adresse"><input autoComplete="street-address" placeholder="Ex. Riviera 3, rue des Jardins" value={f.adresse || ""} onChange={maj("adresse")} /></Champ>
          <Champ label="Point de repère" aide="Pharmacie, école, carrefour… ce qui aide le livreur à vous trouver.">
            <input value={f.repere || ""} onChange={maj("repere")} />
          </Champ>
          <div className="rn-ligne">
            <Bouton type="button" variante="discret" petit onClick={position}>
              {f.lat ? "Position enregistrée" : "Partager ma position"}
            </Bouton>
            <span className="rn-muet rn-petit">Facultatif, pour une livraison plus rapide.</span>
          </div>
          <Champ label="E-mail (facultatif)" aide="Pour recevoir la confirmation et le suivi de votre commande par e-mail."><input type="email" autoComplete="email" value={f.client_email || ""} onChange={maj("client_email")} /></Champ>

          <fieldset className="rn-choix" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="rn-champ-label" style={{ marginBottom: 8 }}>Paiement</legend>
            {modes.map((m) => (
              <label key={m}>
                <input type="radio" name="mode" value={m} checked={f.mode_paiement === m} onChange={maj("mode_paiement")} />
                <span>
                  <b>{MODES_PAIEMENT[m].label}</b>
                  <br />
                  <span className="rn-muet rn-petit">
                    {m === "cod" ? "Vous payez en espèces quand l'article vous est remis." : `Article réservé ${p.duree_reservation_min || 30} min le temps de payer.`}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Champ label="Date de livraison souhaitée (facultatif)" aide="Nous faisons au mieux pour respecter cette date.">
            <input type="date" min={demain} value={f.date_livraison_souhaitee || ""} onChange={maj("date_livraison_souhaitee")} />
          </Champ>
          <Champ label="Message pour le livreur (facultatif)"><textarea value={f.note || ""} onChange={maj("note")} /></Champ>
          {p.codes_promo_actifs ? (
            <Champ label="Code promo" erreur={code && devis?.code_valide === false ? devis.message_code : null} aide={code && devis?.code_valide ? devis.message_code : (!f.zone_id && codeSaisi ? "Choisissez d'abord votre ville pour appliquer le code." : null)}>
              <div className="rn-ligne" style={{ flexWrap: "nowrap" }}>
                <input value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value.toUpperCase())} placeholder="Ex. MISS10" style={{ flex: 1 }} />
                {code ? <Bouton type="button" variante="discret" petit onClick={() => { setCode(""); setCodeSaisi(""); }}>Retirer</Bouton>
                  : <Bouton type="button" variante="contour" petit disabled={!codeSaisi.trim()} onClick={() => setCode(codeSaisi.trim())}>Appliquer</Bouton>}
              </div>
            </Champ>
          ) : null}
        </div>
      ) : null}

      <div className="rn-carte rn-totaux">
        <div><span>Articles</span><span>{fmt(sousTotal)}</span></div>
        <div>
          <span>Livraison{devis ? (devis.express ? " express" : devis.type_livraison === "interurbaine" ? " (depuis une autre ville)" : "") : ""}</span>
          <span>{devis ? (Number(devis.frais_livraison) === 0 ? "Offerte" : fmt(devis.frais_livraison)) : "Selon votre ville"}</span>
        </div>
        {devis && Number(devis.reduction) > 0 ? (
          <div style={{ color: "var(--rn-vert)" }}><span>Réduction{code ? ` (${code})` : ""}</span><span>− {fmt(devis.reduction)}</span></div>
        ) : null}
        {p.livraison_offerte_des && sousTotal < p.livraison_offerte_des ? (
          <div className="rn-muet rn-petit"><span>Encore {fmt(p.livraison_offerte_des - sousTotal)} d'achat pour la livraison offerte</span><span /></div>
        ) : null}
        {devis ? (
          <div className="rn-muet rn-petit"><span>Délai estimé</span><span>{devis.express ? `${p.delai_express_heures || 4} h environ` : devis.delai_jours <= 1 ? "24 h" : `${devis.delai_jours} jours`}</span></div>
        ) : null}
        <div className="rn-total"><span>Total</span><span>{fmt(total)}</span></div>
      </div>
      {devis && !devis.livrable ? (
        <Message ton="alerte">
          {devis.indisponibles?.length
            ? "Un article de votre panier vient d'être réservé par un autre client. Retirez-le pour continuer."
            : "Nous ne livrons pas encore cette zone pour ce panier. Écrivez-nous sur WhatsApp, nous cherchons une solution."}
        </Message>
      ) : null}
      <Message ton="danger" onFermer={() => setErreur("")}>{erreur}</Message>

      <div className="rn-barre-achat">
        {etape === "panier" ? (
          <>
            <Bouton type="button" variante="discret" onClick={continuer}>Continuer</Bouton>
            <Bouton type="button" className="rn-btn-bloc" onClick={() => setEtape("commande")}>Commander</Bouton>
          </>
        ) : (
          <>
            <Bouton type="button" variante="discret" onClick={() => setEtape("panier")}>Retour</Bouton>
            <Bouton type="submit" className="rn-btn-bloc" chargement={envoi} disabled={devis && !devis.livrable}>
              Confirmer la commande{devis ? ` · ${fmt(total)}` : ""}
            </Bouton>
          </>
        )}
      </div>
      {etape === "panier" ? (
        <button type="button" className="rn-btn rn-btn-discret rn-btn-petit" style={{ justifySelf: "start" }} onClick={vider}>Vider le panier</button>
      ) : null}
    </form>
  );
}

// ------------------------------------------------------------------ suivi de commande
function Suivi({ supabase, token, boutique }) {
  const [c, setC] = useState(null);
  const [erreur, setErreur] = useState("");
  const [ref, setRef] = useState("");
  const [rec, setRec] = useState({ type: "probleme", message: "" });
  const [msg, setMsg] = useState("");
  const [ouvrirRec, setOuvrirRec] = useState(false);
  const charger = useCallback(async () => {
    try {
      const r = await rpc(supabase, "rn_suivi", { p_token: token });
      if (!r) setErreur("Commande introuvable. Vérifiez le lien reçu.");
      setC(r);
    } catch (e) { setErreur(erreurTexte(e)); }
  }, [supabase, token]);
  useEffect(() => {
    charger();
    const t = setInterval(charger, 20000);
    return () => clearInterval(t);
  }, [charger]);
  const reste = useCompteARebours(c?.statut === "en_attente_paiement" ? c?.reservation_expire_at : null);

  if (erreur) return <Vide titre="Suivi indisponible">{erreur}</Vide>;
  if (!c) return <div style={{ padding: 40, textAlign: "center" }}><span className="rn-spin" style={{ color: "var(--rn-prune)" }} /></div>;

  const idx = ETAPES_CLIENT.findIndex((e) => e.statuts.includes(c.statut));
  const termineMal = ["annulee", "echec_livraison"].includes(c.statut);
  const lien = window.location.href;
  const nums = c.numeros_paiement || {};
  const numero = nums[c.mode_paiement];

  const declarer = async () => {
    try { await rpc(supabase, "rn_declarer_paiement", { p_token: token, p_reference: ref }); setMsg("Merci ! Nous vérifions votre paiement et vous confirmons la commande."); setRef(""); charger(); }
    catch (e) { setMsg(erreurTexte(e)); }
  };
  const reclamer = async () => {
    try { await rpc(supabase, "rn_reclamer", { p_token: token, p_type: rec.type, p_message: rec.message }); setMsg("Votre demande est enregistrée. Nous vous recontactons rapidement."); setOuvrirRec(false); setRec({ type: "probleme", message: "" }); charger(); }
    catch (e) { setMsg(erreurTexte(e)); }
  };

  return (
    <div className="rn-panneau">
      <div className="rn-entre">
        <div>
          <p className="rn-muet rn-petit">Commande du {fmtDate(c.created_at)}</p>
          <h2>{c.numero}</h2>
        </div>
        <StatutCommande statut={c.statut} />
      </div>
      {c.express ? <Pastille ton="info">Livraison express</Pastille> : null}
      {boutique.whatsapp && !["livree", "annulee", "remboursee"].includes(c.statut) ? (
        <a className="rn-btn rn-btn-vert rn-btn-bloc" href={lienWhatsApp(boutique.whatsapp, `Bonjour, je viens de passer la commande ${c.numero} (${fmt(c.total)}). Pouvez-vous me la confirmer ? Mon suivi : ${window.location.href}`)} target="_blank" rel="noreferrer">
          Recevoir ma confirmation sur WhatsApp
        </a>
      ) : null}

      {c.statut === "en_attente_paiement" ? (
        <div className="rn-carte rn-pile">
          <h3>Finalisez votre paiement</h3>
          <p>
            Envoyez <b>{fmt(c.total)}</b> par <b>{MODES_PAIEMENT[c.mode_paiement]?.label}</b>
            {numero ? <> au <b>{numero}</b></> : null}. Votre article reste réservé encore <b className="rn-chrono">{formatDuree(reste)}</b>.
          </p>
          <Champ label="Référence de la transaction" aide="Elle figure dans le SMS de confirmation de votre opérateur.">
            <input value={ref} onChange={(e) => setRef(e.target.value)} />
          </Champ>
          <Bouton onClick={declarer} disabled={ref.trim().length < 4}>J'ai payé</Bouton>
        </div>
      ) : null}

      {!termineMal && c.code_livraison && c.statut !== "en_attente_paiement" ? (
        <div className="rn-pile">
          <p style={{ fontWeight: 600 }}>Votre code de remise</p>
          <div className="rn-code" aria-label={`Code ${c.code_livraison.split("").join(" ")}`}>{c.code_livraison}</div>
          <p className="rn-muet rn-petit">Donnez ce code au livreur uniquement quand vous avez l'article en main. Il confirme la livraison.</p>
        </div>
      ) : null}

      {(c.expeditions || []).map((x, i) => (
        <Message key={i} ton="info">Votre colis voyage avec <b>{x.transporteur}</b>{x.numero_colis ? <>, colis n° <b>{x.numero_colis}</b></> : null}. Un représentant vous le remettra à l'arrivée.</Message>
      ))}
      {termineMal ? (
        <Message ton={c.statut === "annulee" ? "neutre" : "alerte"}>
          {c.statut === "annulee"
            ? "Cette commande a été annulée."
            : "La livraison n'a pas pu avoir lieu. Notre équipe vous contacte pour convenir d'un nouveau passage."}
        </Message>
      ) : (
        <ol className="rn-frise">
          {ETAPES_CLIENT.map((e, i) => {
            const h = (c.historique || []).filter((x) => e.statuts.includes(x.statut)).slice(-1)[0];
            return (
              <li key={e.cle} className={i < idx ? "rn-fait" : i === idx ? "rn-fait rn-actuel" : ""}>
                <span className="rn-frise-point">{i <= idx ? "✓" : ""}</span>
                <div>
                  <b>{e.label}</b>
                  {h ? <p className="rn-muet rn-petit">{fmtDate(h.date)}{h.note && e.cle !== "recue" ? ` · ${h.note.replace(/^Colis \d+ /, "")}` : ""}</p> : null}
                  {e.cle === "route" && i === idx && c.livreurs?.length ? <p className="rn-petit">Votre livreur : {c.livreurs.join(", ")}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rn-carte rn-pile">
        {(c.lignes || []).map((l, i) => (
          <div className="rn-mini-article" key={i}>
            {l.photo ? <img src={l.photo} alt="" /> : <span />}
            <span>{l.titre}{l.quantite > 1 ? ` × ${l.quantite}` : ""}</span>
            <span className="rn-num">{fmt(l.prix * l.quantite)}</span>
          </div>
        ))}
        <div className="rn-totaux">
          <div><span>Livraison {c.zone ? `à ${c.zone}` : ""}</span><span>{Number(c.frais_livraison) === 0 ? "Offerte" : fmt(c.frais_livraison)}</span></div>
          {Number(c.reduction) > 0 ? <div style={{ color: "var(--rn-vert)" }}><span>Réduction{c.code_promo ? ` (${c.code_promo})` : ""}</span><span>− {fmt(c.reduction)}</span></div> : null}
          {c.date_livraison_souhaitee ? <div className="rn-muet rn-petit"><span>Date souhaitée</span><span>{new Date(c.date_livraison_souhaitee + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span></div> : null}
          <div className="rn-total"><span>Total</span><span>{fmt(c.total)}</span></div>
          <div className="rn-muet rn-petit"><span>Paiement</span><span>{MODES_PAIEMENT[c.mode_paiement]?.court}{c.statut_paiement === "verifie" ? ", réglé" : ""}</span></div>
        </div>
      </div>

      <Message ton="info" onFermer={() => setMsg("")}>{msg}</Message>
      <div className="rn-ligne">
        <a className="rn-btn rn-btn-contour rn-btn-petit" href={"https://wa.me/?text=" + encodeURIComponent(`Suivi de ma commande ${c.numero} : ${lien}`)} target="_blank" rel="noreferrer">
          Garder le lien sur WhatsApp
        </a>
        {boutique.whatsapp ? (
          <a className="rn-btn rn-btn-discret rn-btn-petit" href={lienWhatsApp(boutique.whatsapp, `Bonjour, je vous écris au sujet de ma commande ${c.numero}.`)} target="_blank" rel="noreferrer">Contacter la boutique</a>
        ) : null}
        <Bouton variante="discret" petit onClick={() => setOuvrirRec(!ouvrirRec)}>Signaler un problème</Bouton>
      </div>
      {ouvrirRec ? (
        <div className="rn-carte rn-pile">
          <Champ label="Votre demande">
            <select value={rec.type} onChange={(e) => setRec({ ...rec, type: e.target.value })}>
              <option value="probleme">Un problème avec ma commande</option>
              <option value="retour">Je souhaite retourner un article</option>
              <option value="autre">Autre question</option>
            </select>
          </Champ>
          <Champ label="Expliquez-nous"><textarea value={rec.message} onChange={(e) => setRec({ ...rec, message: e.target.value })} /></Champ>
          <Bouton onClick={reclamer} disabled={rec.message.trim().length < 5}>Envoyer</Bouton>
        </div>
      ) : null}
      {(c.reclamations || []).map((r, i) => (
        <div className="rn-carte" key={i}>
          <div className="rn-entre"><b>Votre demande du {fmtDate(r.date)}</b><Pastille ton={r.statut === "resolue" ? "ok" : "info"}>{{ ouverte: "Reçue", en_cours: "En traitement", resolue: "Traitée", refusee: "Clôturée" }[r.statut]}</Pastille></div>
          {r.reponse ? <p style={{ marginTop: 8 }}>{r.reponse}</p> : null}
        </div>
      ))}
    </div>
  );
}

function MesCommandes({ supabase, slug, ouvrir }) {
  const [tel, setTel] = useState(() => { try { return JSON.parse(localStorage.getItem("rn_client") || "{}").client_tel || ""; } catch { return ""; } });
  const [numero, setNumero] = useState("");
  const [liste, setListe] = useState(null);
  const [charge, setCharge] = useState(false);
  const chercher = async (e) => {
    e.preventDefault();
    setCharge(true);
    try { setListe(await rpc(supabase, "rn_mes_commandes", { p_slug: slug, p_tel: tel, p_numero: numero })); }
    catch { setListe([]); } finally { setCharge(false); }
  };
  return (
    <form className="rn-panneau" onSubmit={chercher}>
      <h2>Suivre ma commande</h2>
      <p className="rn-muet">Indiquez le téléphone utilisé et le numéro d'une de vos commandes pour retrouver tout votre historique.</p>
      <Champ label="Téléphone"><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} required /></Champ>
      <Champ label="Numéro de commande"><input placeholder="MME-261026-1001" value={numero} onChange={(e) => setNumero(e.target.value)} required /></Champ>
      <Bouton type="submit" chargement={charge}>Retrouver mes commandes</Bouton>
      {liste && !liste.length ? <Message ton="alerte">Aucune commande trouvée avec ces informations.</Message> : null}
      {liste?.map((c) => (
        <button type="button" key={c.numero} className="rn-carte rn-entre" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => ouvrir(c.suivi_token)}>
          <span><b>{c.numero}</b><br /><span className="rn-muet rn-petit">{fmtDate(c.created_at)} · {fmt(c.total)}</span></span>
          <StatutCommande statut={c.statut} />
        </button>
      ))}
    </form>
  );
}

function PageInfo({ boutique, page }) {
  const p = boutique.parametres || {};
  const t = p.textes || {};
  const pol = boutique.politiques || {};
  const nom = p.nom_plateforme || boutique.nom;
  const contenus = {
    livraison: {
      titre: "Livraison",
      texte: t.page_livraison || pol.livraison ||
        `Nos articles sont conservés chez des représentants dans plusieurs villes de Côte d'Ivoire. À chaque commande, le représentant le plus proche de chez vous qui détient l'article est sollicité.\n\nLivraison locale : le représentant vous livre lui-même, généralement sous 24 à 48 h.\nLivraison depuis une autre ville : l'article est confié à un transporteur partenaire, puis remis par un représentant. Comptez 2 à 4 jours.\n\nLes frais exacts et le délai s'affichent avant que vous confirmiez la commande. À la remise, donnez votre code à 6 chiffres au livreur.`,
    },
    retours: {
      titre: "Retours et réclamations",
      texte: t.page_retours || pol.retours ||
        `${LIVRES ? "Chaque guide est livré neuf." : "Chaque fiche indique l'état réel de l'article et ses défauts visibles."} Si l'article reçu ne correspond pas à sa description, signalez-le depuis votre page de suivi dans les 48 h suivant la livraison. Notre équipe vous recontacte pour un échange ou un remboursement selon le cas.`,
    },
    conditions: {
      titre: "Conditions générales de vente",
      texte: t.page_conditions ||
        `${nom} vend ${LIVRES ? "des guides et publications" : "des articles de seconde main"}. Les prix sont indiqués en francs CFA, toutes taxes comprises. La commande est ferme après confirmation. Pour un paiement mobile, l'article est réservé pendant la durée indiquée ; sans paiement vérifié dans ce délai, la commande est annulée et l'article remis en vente. Un paiement n'est considéré comme reçu qu'après vérification par nos soins.`,
    },
    confidentialite: {
      titre: "Données personnelles",
      texte: t.page_confidentialite || pol.confidentialite ||
        `Vos coordonnées servent uniquement à traiter et livrer votre commande. Le représentant chargé de la livraison ne voit votre nom, votre téléphone et votre adresse qu'après avoir accepté la mission. Vous pouvez demander la suppression de vos données en nous écrivant.`,
    },
  };
  const c = contenus[page] || contenus.livraison;
  return (
    <div className="rn-panneau">
      <h2>{c.titre}</h2>
      <p style={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>{c.texte}</p>
    </div>
  );
}

function Contact({ supabase, slug, boutique }) {
  const p = boutique.parametres || {};
  const [f, setF] = useState(() => { try { const c = JSON.parse(localStorage.getItem("rn_client") || "{}"); return { nom: c.client_nom || "", tel: c.client_tel || "", message: "" }; } catch { return { nom: "", tel: "", message: "" }; } });
  const [msg, setMsg] = useState({});
  const [charge, setCharge] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault(); setCharge(true); setMsg({});
    try { await rpc(supabase, "rn_contacter", { p_slug: slug, p_nom: f.nom, p_tel: f.tel, p_message: f.message }); setMsg({ ton: "ok", texte: "Message envoyé. Nous vous répondons rapidement." }); setF({ ...f, message: "" }); }
    catch (e2) { setMsg({ ton: "danger", texte: erreurTexte(e2) }); } finally { setCharge(false); }
  };
  return (
    <form className="rn-panneau" onSubmit={envoyer}>
      <h2>Nous contacter</h2>
      <div className="rn-carte rn-pile" style={{ gap: 6 }}>
        {p.contact_telephone ? <span>Téléphone : <a href={"tel:" + p.contact_telephone.replace(/[^0-9+]/g, "")}>{p.contact_telephone}</a></span> : null}
        {boutique.whatsapp ? <span>WhatsApp : <a href={lienWhatsApp(boutique.whatsapp, "Bonjour")} target="_blank" rel="noreferrer">nous écrire</a></span> : null}
        {p.contact_email ? <span>E-mail : <a href={"mailto:" + p.contact_email}>{p.contact_email}</a></span> : null}
        {p.contact_adresse ? <span>Adresse : {p.contact_adresse}</span> : null}
        {!p.contact_telephone && !boutique.whatsapp && !p.contact_email ? <span className="rn-muet">Laissez-nous un message, nous vous rappelons.</span> : null}
      </div>
      <Champ label="Nom"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required /></Champ>
      <Champ label="Téléphone"><input type="tel" inputMode="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} required /></Champ>
      <Champ label="Votre message"><textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required /></Champ>
      <Message ton={msg.ton}>{msg.texte}</Message>
      <Bouton type="submit" chargement={charge}>Envoyer</Bouton>
    </form>
  );
}
