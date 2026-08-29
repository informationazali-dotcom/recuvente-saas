import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function prixUnitairePourBundle(prixVente, bundle) {
  if (!bundle) return Number(prixVente);
  if ((bundle.mode || "pourcentage") === "prix_fixe") {
    const total = Number(bundle.prix_fixe);
    return total > 0 && bundle.qty > 0 ? total / bundle.qty : Number(prixVente);
  }
  return Number(prixVente) * (1 - (Number(bundle.discount) || 0) / 100);
}

export default function CataloguePublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [produits, setProduits] = useState([]);
  const [collectionsManuelles, setCollectionsManuelles] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [produitOuvert, setProduitOuvert] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [form, setForm] = useState({ client: "", tel: "", zone: "" });
  const [quantite, setQuantite] = useState(1);
  const [typeLivraisonChoisi, setTypeLivraisonChoisi] = useState(null);
  const [photoActive, setPhotoActive] = useState(0);
  const [avisListe, setAvisListe] = useState([]);
  const [afficherFormAvis, setAfficherFormAvis] = useState(false);
  const [formAvis, setFormAvis] = useState({ nom: "", note: 5, commentaire: "" });
  const [envoiAvis, setEnvoiAvis] = useState(false);
  const [avisEnvoye, setAvisEnvoye] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [lienCopie, setLienCopie] = useState(false);
  const [politiqueOuverte, setPolitiqueOuverte] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [collectionOuverte, setCollectionOuverte] = useState(null);
  const [bundleChoisiId, setBundleChoisiId] = useState(null);

  function chargerPixelFacebook(pixelId) {
    if (!pixelId || window.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
  }

  function trackEvenement(nom, params) {
    if (window.fbq) window.fbq("track", nom, params);
  }

  useEffect(() => {
    supabase.rpc("catalogue_public", { p_workspace_id: workspaceId }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setErreur("Ce catalogue est introuvable ou vide.");
        return;
      }
      setEntreprise({
        nom: data[0].entreprise_nom,
        devise: data[0].devise,
        logo: data[0].logo_url,
        banniere: data[0].banniere_url,
        couleur: data[0].couleur_marque || "#1a7a3c",
        description: data[0].description_boutique,
        whatsapp: data[0].whatsapp_number,
        politiqueLivraison: data[0].politique_livraison,
        politiqueRetours: data[0].politique_retours,
        politiqueConfidentialite: data[0].politique_confidentialite,
        marqueBlanche: data[0].marque_blanche,
        fraisLivraison: Number(data[0].frais_livraison || 0),
        fraisExpedition: Number(data[0].frais_expedition || 0),
        facebookUrl: data[0].facebook_url,
        instagramUrl: data[0].instagram_url,
        tiktokUrl: data[0].tiktok_url,
        storeConfig: data[0].store_config_published || null,
        labelLivraisonLocale: data[0].label_livraison_locale || "Livraison locale",
        labelLivraisonExpedition: data[0].label_livraison_expedition || "Autre ville",
      });
      chargerPixelFacebook(data[0].facebook_pixel_id);
      const listeProduits = data.filter((p) => p.produit_nom);
      setProduits(listeProduits);

      supabase.rpc("collections_publiques", { p_workspace_id: workspaceId }).then(({ data: dataCollections }) => {
        if (!dataCollections || dataCollections.length === 0) return;
        const parCollection = {};
        dataCollections.forEach((ligne) => {
          if (!parCollection[ligne.collection_id]) {
            parCollection[ligne.collection_id] = { id: ligne.collection_id, nom: ligne.collection_nom, ordre: ligne.ordre, produitIds: [] };
          }
          parCollection[ligne.collection_id].produitIds.push(ligne.produit_id);
        });
        setCollectionsManuelles(Object.values(parCollection).sort((a, b) => a.ordre - b.ordre));
      });

      const idProduitDansUrl = new URLSearchParams(window.location.search).get("produit");
      if (idProduitDansUrl) {
        const trouve = listeProduits.find((p) => p.produit_id === idProduitDansUrl);
        if (trouve) {
          setProduitOuvert(trouve);
          setForm({ client: "", tel: "", zone: "" });
        }
      }
    });
  }, [workspaceId]);

  function ouvrirProduit(p) {
    trackEvenement("ViewContent", { content_ids: [p.produit_id], content_name: p.produit_nom, value: Number(p.prix_vente), currency: entreprise?.devise || "XOF" });
    setProduitOuvert(p);
    setAfficherFormulaire(false);
    setForm({ client: "", tel: "", zone: "" });
    setQuantite(1);
    setBundleChoisiId(null);
    setTypeLivraisonChoisi(entreprise?.fraisExpedition > 0 ? null : "livraison");
    setPhotoActive(0);
    setEnvoye(false);
    setErreurEnvoi("");
    setAvisListe([]);
    setAfficherFormAvis(false);
    setFormAvis({ nom: "", note: 5, commentaire: "" });
    setAvisEnvoye(false);
    supabase.rpc("avis_produit_public", { p_produit_id: p.produit_id }).then(({ data }) => {
      setAvisListe(data || []);
    });
    const url = new URL(window.location.href);
    url.searchParams.set("produit", p.produit_id);
    window.history.pushState({}, "", url);
    window.scrollTo(0, 0);
  }

  async function soumettreAvis() {
    if (!formAvis.nom.trim()) return;
    setEnvoiAvis(true);
    const { data, error } = await supabase.rpc("soumettre_avis_public", {
      p_workspace_id: workspaceId,
      p_produit_id: produitOuvert.produit_id,
      p_client_nom: formAvis.nom,
      p_note: formAvis.note,
      p_commentaire: formAvis.commentaire,
    });
    setEnvoiAvis(false);
    if (!error && data?.[0]?.succes) {
      setAvisEnvoye(true);
    }
  }

  function fermerProduit() {
    setProduitOuvert(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
  }

  function naviguerVersCollection(id) {
    setProduitOuvert(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("produit");
    window.history.pushState({}, "", url);
    setCollectionOuverte(id);
    window.scrollTo(0, 0);
  }

  async function envoyerCommande() {
    if (!form.client.trim() || !form.tel.trim() || !form.zone.trim()) {
      setErreurEnvoi("Merci de renseigner ton nom, ton téléphone et ta ville/quartier.");
      return;
    }
    const livraisonGratuiteV = !!produitOuvert.livraison_gratuite;
    const fraisExpeditionV = livraisonGratuiteV ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
    const aChoixLivraisonV = !livraisonGratuiteV && fraisExpeditionV > 0;
    if (aChoixLivraisonV && !typeLivraisonChoisi) {
      setErreurEnvoi("⚠️ Merci de choisir un mode de livraison ci-dessus avant de confirmer.");
      return;
    }
    setEnvoi(true);
    setErreurEnvoi("");
    const bundleActifEnvoi = (Array.isArray(produitOuvert.bundles) ? produitOuvert.bundles : []).find((b) => b.id === bundleChoisiId) || null;
    const prixUnitaireEnvoi = prixUnitairePourBundle(produitOuvert.prix_vente, bundleActifEnvoi);
    const items = [{
      produit_id: produitOuvert.produit_id,
      produit_nom: produitOuvert.produit_nom,
      quantite: quantite,
      prix_unitaire: prixUnitaireEnvoi,
    }];
    const { data, error } = await supabase.rpc("creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: form.zone,
      p_items: items,
      p_type_livraison: (() => {
        const livraisonGratuiteP = !!produitOuvert.livraison_gratuite;
        const fraisExpeditionP = livraisonGratuiteP ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
        return !livraisonGratuiteP && fraisExpeditionP > 0 ? typeLivraisonChoisi : "livraison";
      })(),
    });
    setEnvoi(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoi(resultat?.message || "Une erreur est survenue, réessaie.");
      return;
    }
    trackEvenement("Lead", {
      content_ids: [produitOuvert.produit_id],
      value: prixUnitaireEnvoi * quantite,
      currency: entreprise?.devise || "XOF",
    });
    setEnvoye(true);
  }

  const couleur = entreprise?.couleur || "#1a7a3c";

  if (entreprise === undefined && !erreur) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A9089", fontFamily: "sans-serif" }}>
        Chargement…
      </div>
    );
  }

  if (erreur) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ECE8DC", borderRadius: 16, padding: 26, textAlign: "center", maxWidth: 340 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
          <div style={{ color: "#6B7168", fontSize: 14 }}>{erreur}</div>
        </div>
      </div>
    );
  }

  // ===== ÉCRAN FICHE PRODUIT (commande directe) =====
  if (produitOuvert) {
    const livraisonGratuite = !!produitOuvert.livraison_gratuite;
    const fraisLivraisonEffectif = livraisonGratuite ? 0 : Number(produitOuvert.frais_livraison_produit ?? entreprise.fraisLivraison ?? 0);
    const fraisExpeditionEffectif = livraisonGratuite ? 0 : Number(produitOuvert.frais_expedition_produit ?? entreprise.fraisExpedition ?? 0);
    const aChoixLivraison = !livraisonGratuite && fraisExpeditionEffectif > 0;
    const bundlesProduit = Array.isArray(produitOuvert.bundles) ? produitOuvert.bundles : [];
    const bundleActif = bundlesProduit.find((b) => b.id === bundleChoisiId) || null;
    const prixUnitaireEffectif = prixUnitairePourBundle(produitOuvert.prix_vente, bundleActif);
    const fraisLivraisonActuel = aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionEffectif : fraisLivraisonEffectif) : (fraisLivraisonEffectif || 0);
    return (
      <div style={{ minHeight: "100vh", background: "white", fontFamily: "sans-serif" }}>
        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={fermerProduit} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} />

        <style>{`
          .rv-shop-produit-wrap { max-width: 480px; margin: 0 auto; }
          @media (min-width: 900px) {
            .rv-shop-produit-wrap { max-width: 1000px; padding: 0 32px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start; margin-top: 24px; }
            .rv-shop-produit-photo-col { position: sticky; top: 24px; width: 100%; min-width: 0; }
            .rv-shop-produit-photo { border-radius: 16px; }
            .rv-shop-produit-back { display: none !important; }
            .rv-shop-produit-info { padding: 0 0 100px !important; }
            .rv-shop-cta-bar-inner { max-width: 1000px; margin: 0 auto; padding: 0 32px; box-sizing: border-box; }
          }
        `}</style>

        <div className="rv-shop-produit-wrap">
          <div className="rv-shop-produit-photo-col" style={{ position: "relative", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            {(() => {
              const toutesLesPhotos = [produitOuvert.photo_url, ...(produitOuvert.photos_galerie || [])].filter(Boolean);
              const photoAffichee = toutesLesPhotos[photoActive] || toutesLesPhotos[0];
              return (
                <>
                  <div className="rv-shop-produit-photo" style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden" }}>
                    {photoAffichee ? (
                      <img
                        src={photoAffichee}
                        alt={produitOuvert.produit_nom}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    ) : (
                      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>📦</div>
                    )}
                  </div>
                  {toutesLesPhotos.length > 1 && (
                    <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto" }}>
                      {toutesLesPhotos.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoActive(i)}
                          style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: "hidden", padding: 0, border: i === photoActive ? `2px solid ${couleur}` : "1px solid #ECE8DC", cursor: "pointer", background: "none" }}
                        >
                          <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            <button
              className="rv-shop-produit-back"
              onClick={fermerProduit}
              style={{ position: "absolute", top: 16, left: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
            >
              ←
            </button>
            <button
              onClick={() => {
                const lienAvecApercu = `${window.location.origin}/?catalogue=${workspaceId}&produit=${produitOuvert.produit_id}`;
                navigator.clipboard.writeText(lienAvecApercu);
                setLienCopie(true);
                setTimeout(() => setLienCopie(false), 2000);
              }}
              style={{ position: "absolute", top: 16, right: 16, background: "white", border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 16, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
            >
              {lienCopie ? "✅" : "🔗"}
            </button>
          </div>

          <div className="rv-shop-produit-info" style={{ padding: "22px 18px 140px" }}>
            {produitOuvert.nb_ventes > 0 && (
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: "#8A6412", background: "#FBF3E3", padding: "3px 10px", borderRadius: 999, marginBottom: 10 }}>
                🔥 Best-seller — {produitOuvert.nb_ventes} vente{produitOuvert.nb_ventes > 1 ? "s" : ""}
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 21 }}>{produitOuvert.produit_nom}</div>

            {produitOuvert.note_moyenne && (
              <button
                onClick={() => document.getElementById("rv-shop-avis-section")?.scrollIntoView({ behavior: "smooth" })}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer" }}
              >
                <span style={{ color: "#e8920a", fontSize: 14 }}>{"★".repeat(Math.round(produitOuvert.note_moyenne))}{"☆".repeat(5 - Math.round(produitOuvert.note_moyenne))}</span>
                <span style={{ fontSize: 12.5, color: "#6B7168", textDecoration: "underline" }}>{produitOuvert.note_moyenne}/5 ({produitOuvert.nb_avis} avis)</span>
              </button>
            )}

            <div style={{ fontWeight: 700, fontSize: 24, color: couleur, marginTop: 10, marginBottom: 4 }}>
              {Number(produitOuvert.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
            </div>

            {livraisonGratuite ? (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#1F9D6E", background: "#EAF7F1", padding: "4px 10px", borderRadius: 999, marginBottom: 12 }}>
                🎁 Livraison gratuite
              </div>
            ) : aChoixLivraison ? (
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                🚚 Frais de livraison à choisir à la commande ({entreprise.labelLivraisonLocale} : {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise} — {entreprise.labelLivraisonExpedition} : {fraisExpeditionEffectif.toLocaleString("fr-FR")} {entreprise.devise})
              </div>
            ) : (
              fraisLivraisonEffectif > 0 && (
                <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 12 }}>
                  🚚 + {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise} de frais de livraison
                </div>
              )
            )}

            {produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5 && (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#D64933", background: "#FBEAE6", padding: "4px 10px", borderRadius: 999, marginBottom: 18 }}>
                ⚡ Plus que {produitOuvert.stock_initial} en stock
              </div>
            )}
            {!(produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5) && <div style={{ marginBottom: 10 }} />}

            {bundlesProduit.length > 0 && (
              <div style={{ background: "#fffdf7", border: "1px solid #F0DDA8", borderRadius: 10, padding: "9px 12px", marginBottom: 22, fontSize: 12, color: "#8A6412", fontWeight: 700 }}>
                🔥 Offres quantité disponibles — choisis ton pack dans le formulaire de commande
              </div>
            )}

            {produitOuvert.produit_description ? (
              <>
                <style>{`
                  .rv-description-riche img {
                    max-width: 100% !important;
                    width: 100% !important;
                    height: auto !important;
                    float: none !important;
                    display: block !important;
                    margin: 14px auto !important;
                    border-radius: 8px !important;
                    object-fit: contain !important;
                  }
                  .rv-description-riche * {
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                  }
                  .rv-description-riche table {
                    display: block !important;
                    overflow-x: auto !important;
                  }
                  .rv-description-riche h1, .rv-description-riche h2, .rv-description-riche h3, .rv-description-riche h4 {
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    color: #16231F !important;
                    margin: 22px 0 10px !important;
                    line-height: 1.4 !important;
                  }
                  .rv-description-riche h1:first-child, .rv-description-riche h2:first-child, .rv-description-riche h3:first-child {
                    margin-top: 0 !important;
                  }
                  .rv-description-riche p {
                    margin: 0 0 12px !important;
                    line-height: 1.65 !important;
                  }
                  .rv-description-riche strong, .rv-description-riche b {
                    font-weight: 700 !important;
                    color: #16231F !important;
                  }
                  .rv-description-riche ul, .rv-description-riche ol {
                    margin: 0 0 14px !important;
                    padding-left: 20px !important;
                  }
                  .rv-description-riche li {
                    margin-bottom: 7px !important;
                    line-height: 1.55 !important;
                  }
                  .rv-description-riche a {
                    color: ${couleur} !important;
                  }
                `}</style>
                <div
                  className="rv-description-riche"
                  style={{ fontSize: 14.5, color: "#16231F", lineHeight: 1.65, marginBottom: 26 }}
                  dangerouslySetInnerHTML={{ __html: produitOuvert.produit_description }}
                />
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#8A9089", fontStyle: "italic", marginBottom: 26 }}>Aucune description disponible.</div>
            )}

            <div id="rv-shop-avis-section" style={{ borderTop: "1px solid #ECE8DC", paddingTop: 20, marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Avis clients {avisListe.length > 0 && `(${avisListe.length})`}</div>
                {!afficherFormAvis && !avisEnvoye && (
                  <button onClick={() => setAfficherFormAvis(true)} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    Laisser un avis
                  </button>
                )}
              </div>

              {avisEnvoye && (
                <div style={{ background: "#EAF3DE", border: "1px solid #C7DDA3", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#3B6D11" }}>
                  ✅ Merci pour ton avis ! Il sera visible après vérification.
                </div>
              )}

              {afficherFormAvis && !avisEnvoye && (
                <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setFormAvis({ ...formAvis, note: n })}
                        style={{ background: "none", border: "none", padding: 0, fontSize: 24, cursor: "pointer", color: n <= formAvis.note ? "#e8920a" : "#DDD8CC" }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="Ton nom"
                    value={formAvis.nom}
                    onChange={(e) => setFormAvis({ ...formAvis, nom: e.target.value })}
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                  <textarea
                    placeholder="Ton commentaire (optionnel)"
                    value={formAvis.commentaire}
                    onChange={(e) => setFormAvis({ ...formAvis, commentaire: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 13.5, marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={soumettreAvis}
                    disabled={envoiAvis || !formAvis.nom.trim()}
                    style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", opacity: (envoiAvis || !formAvis.nom.trim()) ? 0.5 : 1 }}
                  >
                    {envoiAvis ? "Envoi..." : "Envoyer mon avis"}
                  </button>
                </div>
              )}

              {avisListe.length === 0 ? (
                <div style={{ fontSize: 13, color: "#8A9089", fontStyle: "italic" }}>Aucun avis pour le moment. Sois le premier !</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {avisListe.map((a, i) => (
                    <div key={i} style={{ background: "#FAFAF7", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{a.client_nom}</span>
                        <span style={{ color: "#e8920a", fontSize: 12 }}>{"★".repeat(a.note)}{"☆".repeat(5 - a.note)}</span>
                      </div>
                      {a.commentaire && <div style={{ fontSize: 13, color: "#16231F", marginTop: 4, lineHeight: 1.5 }}>{a.commentaire}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {envoye && (
              <div style={{ textAlign: "center", padding: "10px 0 30px" }}>
                <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6, color: "#16231F" }}>Commande envoyée !</div>
                <div style={{ fontSize: 13.5, color: "#6B7168", marginBottom: 24, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
                  Merci {form.client.split(" ")[0]} 🙏 — {entreprise.nom} va te contacter au <strong>{form.tel}</strong> pour confirmer ta commande.
                </div>

                <div style={{ background: "#FAFAF7", border: "1px solid #ECE8DC", borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 18 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #ECE8DC" }}>
                    {produitOuvert.photo_url ? (
                      <img src={produitOuvert.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📦</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{quantite} × {produitOuvert.produit_nom}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>{(prixUnitaireEffectif * quantite + (aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionEffectif : fraisLivraisonEffectif) : fraisLivraisonEffectif || 0)).toLocaleString("fr-FR")} {entreprise.devise}</div>
                      {(fraisLivraisonEffectif > 0 || fraisExpeditionEffectif > 0) && (
                        <div style={{ fontSize: 11, color: "#8A9089" }}>
                          dont {(aChoixLivraison ? (typeLivraisonChoisi === "expedition" ? fraisExpeditionEffectif : fraisLivraisonEffectif) : fraisLivraisonEffectif).toLocaleString("fr-FR")} {entreprise.devise} de {typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#6B7168", lineHeight: 1.7 }}>
                    <div><strong style={{ color: "#16231F" }}>Livraison à :</strong> {form.zone}</div>
                    <div><strong style={{ color: "#16231F" }}>Téléphone :</strong> {form.tel}</div>
                  </div>
                </div>

                <div style={{ textAlign: "left", marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Et maintenant ?</div>
                  {[
                    { n: "1", texte: "On te contacte pour confirmer ta commande" },
                    { n: "2", texte: "Ton colis est préparé et remis au livreur" },
                    { n: "3", texte: "Tu payes à la réception, une fois satisfait" },
                  ].map((etape) => (
                    <div key={etape.n} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#EAF3DE", color: "#3B6D11", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{etape.n}</div>
                      <div style={{ fontSize: 12.5, color: "#16231F" }}>{etape.texte}</div>
                    </div>
                  ))}
                </div>

                {entreprise.whatsapp && (
                  <a
                    href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, j'ai une question sur ma commande de "${produitOuvert.produit_nom}".`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", background: "#EAF3DE", color: "#3B6D11", border: "1px solid #C7DDA3", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, textDecoration: "none", marginBottom: 10 }}
                  >
                    💬 Une question ? Contacte-nous
                  </a>
                )}
                <button
                  onClick={fermerProduit}
                  style={{ width: "100%", background: "white", border: "1px solid #DDD8CC", color: "#16231F", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  ← Continuer mes achats
                </button>
              </div>
            )}

            {!envoye && (() => {
              const similaires = produits
                .filter((p) => p.produit_id !== produitOuvert.produit_id)
                .sort((a, b) => (b.nb_ventes || 0) - (a.nb_ventes || 0))
                .slice(0, 6);
              if (similaires.length === 0) return null;
              return (
                <div style={{ borderTop: "1px solid #ECE8DC", paddingTop: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Tu pourrais aussi aimer</div>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    {similaires.map((p) => (
                      <button
                        key={p.produit_id}
                        onClick={() => ouvrirProduit(p)}
                        style={{ flex: "0 0 130px", width: 130, background: "white", border: "1px solid #ECE8DC", borderRadius: 12, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ width: "100%", paddingTop: "100%", position: "relative", background: "#EEF0EA" }}>
                          {p.photo_url ? (
                            <img src={p.photo_url} alt={p.produit_nom} loading="lazy" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
                          ) : (
                            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📦</div>
                          )}
                        </div>
                        <div style={{ padding: "8px 10px 10px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: couleur, marginTop: 2 }}>{Number(p.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {!envoye && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { icone: "💵", texte: "Paiement à la livraison" },
                  { icone: "🚚", texte: "Livraison rapide" },
                  { icone: "✅", texte: "Vérifie avant de payer" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {item.icone}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#3B6D11", fontWeight: 600, lineHeight: 1.3 }}>{item.texte}</div>
                  </div>
                ))}
              </div>
            )}

            {!envoye && (
              <div className="rv-shop-cta-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "14px 18px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)", zIndex: 20 }}>
                <div className="rv-shop-cta-bar-inner">
                  <div style={{ fontSize: 10.5, color: "#8A9089", textAlign: "center", marginBottom: 6 }}>
                    ⚠️ Merci de ne commander que si tu es réellement intéressé(e)
                  </div>
                  <button
                    onClick={() => {
                      trackEvenement("InitiateCheckout", {
                        content_ids: [produitOuvert.produit_id],
                        value: prixUnitaireEffectif * quantite,
                        currency: entreprise?.devise || "XOF",
                      });
                      setAfficherFormulaire(true);
                    }}
                    style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    {`Commander — ${(prixUnitaireEffectif * quantite).toLocaleString("fr-FR")} ${entreprise.devise}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {afficherFormulaire && !envoye && (
          <div
            onClick={() => setAfficherFormulaire(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 24px", maxHeight: "80vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Tes coordonnées</div>
                <button onClick={() => setAfficherFormulaire(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: "#8A9089", marginBottom: 16 }}>
                Pour qu'on puisse te contacter et te livrer.
              </div>

              <input
                placeholder="Ton nom"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                autoFocus
                style={inputStyle}
              />
              <input
                placeholder="Ton numéro de téléphone"
                value={form.tel}
                onChange={(e) => setForm({ ...form, tel: e.target.value })}
                style={inputStyle}
              />
              <input
                placeholder="Ta ville et ton quartier"
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
                style={inputStyle}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: "#6B7168" }}>Quantité</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => { setQuantite((q) => Math.max(1, q - 1)); setBundleChoisiId(null); }}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    −
                  </button>
                  <div style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{quantite}</div>
                  <button
                    onClick={() => { setQuantite((q) => q + 1); setBundleChoisiId(null); }}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {bundlesProduit.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#b16b00", letterSpacing: ".04em", marginBottom: 8 }}>🔥 OFFRES QUANTITÉ</div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bundlesProduit.length, 3)}, 1fr)`, gap: 8 }}>
                    {bundlesProduit.map((b) => {
                      const actif = bundleChoisiId === b.id;
                      const totalBundle = prixUnitairePourBundle(produitOuvert.prix_vente, b) * b.qty;
                      const estPrixFixe = (b.mode || "pourcentage") === "prix_fixe";
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            if (actif) { setBundleChoisiId(null); setQuantite(1); }
                            else { setBundleChoisiId(b.id); setQuantite(b.qty); }
                          }}
                          style={{ textAlign: "left", border: `1.5px solid ${actif ? couleur : "#DDD8CC"}`, background: actif ? "#EAF3DE" : "white", borderRadius: 10, padding: "8px 9px", cursor: "pointer" }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#16231F" }}>{b.label}</div>
                          {!estPrixFixe && b.discount > 0 && <div style={{ fontSize: 9.5, color: "#8A6412" }}>-{b.discount}%</div>}
                          {estPrixFixe && <div style={{ fontSize: 9.5, color: "#8A6412" }}>Prix fixe</div>}
                          <div style={{ fontSize: 12, fontWeight: 800, color: couleur, marginTop: 2 }}>{totalBundle.toLocaleString("fr-FR")} {entreprise.devise}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {livraisonGratuite && (
                <div style={{ background: "#EAF7F1", border: "1px solid #C7E8D6", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#1F9D6E", fontWeight: 700 }}>
                  🎁 Livraison gratuite pour ce produit
                </div>
              )}

              {aChoixLivraison && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#16231F", marginBottom: 6 }}>Mode de livraison <span style={{ color: "#D64933" }}>*</span></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setTypeLivraisonChoisi("livraison")}
                      style={{ flex: 1, textAlign: "left", background: typeLivraisonChoisi === "livraison" ? "#EAF3DE" : "white", border: `1.5px solid ${typeLivraisonChoisi === "livraison" ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>🏍️ {entreprise.labelLivraisonLocale}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {fraisLivraisonEffectif.toLocaleString("fr-FR")} {entreprise.devise}</div>
                    </button>
                    <button
                      onClick={() => setTypeLivraisonChoisi("expedition")}
                      style={{ flex: 1, textAlign: "left", background: typeLivraisonChoisi === "expedition" ? "#EAF3DE" : "white", border: `1.5px solid ${typeLivraisonChoisi === "expedition" ? couleur : "#DDD8CC"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16231F" }}>🚛 {entreprise.labelLivraisonExpedition}</div>
                      <div style={{ fontSize: 11.5, color: "#6B7168" }}>+ {fraisExpeditionEffectif.toLocaleString("fr-FR")} {entreprise.devise}</div>
                    </button>
                  </div>
                  {!typeLivraisonChoisi && <div style={{ fontSize: 11, color: "#8A6412", marginTop: 6 }}>Choisis un mode de livraison pour continuer.</div>}
                </div>
              )}

              {erreurEnvoi && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreurEnvoi}</div>}

              <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7168" }}>{quantite} × {produitOuvert.produit_nom}</span>
                  <span>{(prixUnitaireEffectif * quantite).toLocaleString("fr-FR")} {entreprise.devise}</span>
                </div>
                {fraisLivraisonActuel > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B7168" }}>
                    <span>🚚 {aChoixLivraison && typeLivraisonChoisi === "expedition" ? entreprise.labelLivraisonExpedition : entreprise.labelLivraisonLocale}</span>
                    <span>+ {fraisLivraisonActuel.toLocaleString("fr-FR")} {entreprise.devise}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid #ECE8DC", marginTop: 2 }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 700, color: couleur }}>{(prixUnitaireEffectif * quantite + fraisLivraisonActuel).toLocaleString("fr-FR")} {entreprise.devise}</span>
                </div>
              </div>

              <div style={{ background: "#FBF3E3", border: "1px solid #F0DDA8", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 11.5, color: "#8A6412", lineHeight: 1.5 }}>
                ⚠️ En confirmant, tu t'engages à réceptionner ce colis. Merci de ne pas commander "pour voir" si tu n'es pas certain(e) d'être intéressé(e).
              </div>

              <button
                onClick={envoyerCommande}
                disabled={envoi}
                style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: envoi ? "default" : "pointer", opacity: envoi ? 0.7 : 1, marginTop: 4 }}
              >
                {envoi ? "Envoi..." : `Confirmer — ${(prixUnitaireEffectif * quantite + fraisLivraisonActuel).toLocaleString("fr-FR")} ${entreprise.devise}`}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ÉCRAN COLLECTION COMPLÈTE =====
  if (collectionOuverte) {
    const collectionManuelleActive = collectionOuverte.startsWith("manuelle-")
      ? collectionsManuelles.find((c) => c.id === collectionOuverte.replace("manuelle-", ""))
      : null;
    const listeCollection = collectionManuelleActive
      ? produits.filter((p) => collectionManuelleActive.produitIds.includes(p.produit_id))
      : collectionOuverte === "bestseller"
        ? [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes)
        : collectionOuverte === "nouveautes"
          ? produits.filter((p) => p.est_nouveau)
          : produits;
    const titreCollection = collectionManuelleActive
      ? `📁 ${collectionManuelleActive.nom}`
      : collectionOuverte === "bestseller" ? "🔥 Meilleures ventes" : collectionOuverte === "nouveautes" ? "✨ Nouveautés" : "Tous les produits";

    return (
      <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <style>{`
          .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
          .rv-shop-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
          .rv-shop-card:hover { box-shadow: 0 10px 24px rgba(22,35,31,0.12) !important; transform: translateY(-2px); }
          @media (max-width: 420px) { .rv-shop-header-whatsapp-txt { display: none; } .rv-shop-header-nom { display: none; } }
          .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          @media (min-width: 640px) { .rv-shop-content { max-width: 720px; padding: 0 24px; } .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
          @media (min-width: 960px) { .rv-shop-content { max-width: 1100px; padding: 0 32px; } .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; } }
          @media (min-width: 1280px) { .rv-shop-content, .rv-shop-header-inner { max-width: 1400px; } .rv-shop-grid { grid-template-columns: repeat(5, 1fr); } }
        `}</style>

        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={() => naviguerVersCollection(null)} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={collectionOuverte} />

        <div className="rv-shop-content" style={{ paddingTop: 20 }}>
          <button
            onClick={() => setCollectionOuverte(null)}
            style={{ background: "none", border: "none", color: "#6B7168", fontSize: 13, cursor: "pointer", marginBottom: 10, padding: 0 }}
          >
            ← Retour à l'accueil
          </button>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 18 }}>{titreCollection} ({listeCollection.length})</div>

          <div className="rv-shop-grid" style={{ paddingBottom: 40 }}>
            {listeCollection.map((p) => (
              <CarteProduit key={p.produit_id} p={p} couleur={couleur} devise={entreprise.devise} onOpen={ouvrirProduit} />
            ))}
          </div>
        </div>

        <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} />
      </div>
    );
  }

  // ===== ÉCRAN CATALOGUE (accueil) =====
  const NOMBRE_OPTIMAL_PAR_COLLECTION = 5;
  const NOMBRE_MAX_ACCUEIL = 20;
  const meilleuresVentesToutes = [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes);
  const nouveautesToutes = produits.filter((p) => p.est_nouveau);
  const meilleuresVentes = meilleuresVentesToutes.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION);
  const nouveautes = nouveautesToutes.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION);
  const produitsFiltres = recherche.trim()
    ? produits.filter((p) => p.produit_nom.toLowerCase().includes(recherche.trim().toLowerCase()))
    : produits;

  if (entreprise.storeConfig && Array.isArray(entreprise.storeConfig.sections) && entreprise.storeConfig.sections.length > 0) {
    return (
      <PageAccueilPersonnalisee
        config={entreprise.storeConfig}
        entreprise={entreprise}
        couleur={couleur}
        produits={produits}
        meilleuresVentes={meilleuresVentes}
        meilleuresVentesToutes={meilleuresVentesToutes}
        nouveautes={nouveautes}
        nouveautesToutes={nouveautesToutes}
        collectionsManuelles={collectionsManuelles}
        recherche={recherche}
        setRecherche={setRecherche}
        produitsFiltres={produitsFiltres}
        ouvrirProduit={ouvrirProduit}
        naviguerVersCollection={naviguerVersCollection}
        setCollectionOuverte={setCollectionOuverte}
        setPolitiqueOuverte={setPolitiqueOuverte}
        politiqueOuverte={politiqueOuverte}
        NOMBRE_MAX_ACCUEIL={NOMBRE_MAX_ACCUEIL}
      />
    );
  }

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <style>{`
        .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
        .rv-shop-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .rv-shop-card:hover { box-shadow: 0 10px 24px rgba(22,35,31,0.12) !important; transform: translateY(-2px); }
        @media (max-width: 420px) { .rv-shop-header-whatsapp-txt { display: none; } .rv-shop-header-nom { display: none; } }
        .rv-shop-banner { height: 150px; }
        .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .rv-shop-collection-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
        .rv-shop-collection-scroll::-webkit-scrollbar { height: 5px; }
        .rv-shop-collection-scroll::-webkit-scrollbar-thumb { background: #DDD8CC; border-radius: 999px; }
        .rv-shop-collection-card { flex: 0 0 140px; min-width: 0; max-width: 140px; }
        @media (min-width: 640px) {
          .rv-shop-content { max-width: 720px; padding: 0 24px; }
          .rv-shop-banner { height: 240px; }
          .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .rv-shop-collection-scroll { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; gap: 16px; }
          .rv-shop-collection-card { flex: none; width: auto; min-width: 0; max-width: none; }
        }
        @media (min-width: 960px) {
          .rv-shop-content { max-width: 1100px; padding: 0 32px; }
          .rv-shop-banner { height: 340px; }
          .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .rv-shop-collection-scroll { grid-template-columns: repeat(4, 1fr); gap: 20px; }
        }
        @media (min-width: 1280px) {
          .rv-shop-content, .rv-shop-header-inner { max-width: 1400px; }
          .rv-shop-grid { grid-template-columns: repeat(5, 1fr); }
          .rv-shop-collection-scroll { grid-template-columns: repeat(5, 1fr); }
        }
      `}</style>

      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} />

      <div className="rv-shop-banner" style={{ width: "100%", position: "relative", overflow: "hidden" }}>
        {entreprise.banniere ? (
          <img src={entreprise.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.05) 100%)" }} />
        <div className="rv-shop-hero-content" style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 16px 18px", display: "flex", alignItems: "flex-end", gap: 14 }}>
          {entreprise.logo && (
            <img
              src={entreprise.logo}
              alt={entreprise.nom}
              className="rv-shop-hero-logo"
              style={{ width: 76, height: 76, borderRadius: 16, objectFit: "cover", border: "3px solid white", boxShadow: "0 6px 18px rgba(0,0,0,0.4)", flexShrink: 0, background: "white" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div style={{ minWidth: 0, paddingBottom: 2 }}>
            <div className="rv-shop-hero-nom" style={{ fontWeight: 700, fontSize: 23, color: "white", textShadow: "0 1px 6px rgba(0,0,0,0.4)", lineHeight: 1.2 }}>{entreprise.nom}</div>
            {entreprise.description && (
              <div className="rv-shop-hero-desc" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 3, textShadow: "0 1px 4px rgba(0,0,0,0.4)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {entreprise.description}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rv-shop-content" style={{ paddingTop: 20 }}>
        {produits.length === 0 && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, marginTop: 40, paddingBottom: 40 }}>
            Aucun produit disponible pour le moment.
          </div>
        )}

        {!recherche.trim() && meilleuresVentes.length > 0 && (
          <SectionCollection
            titre="🔥 Meilleures ventes"
            produits={meilleuresVentes}
            couleur={couleur}
            devise={entreprise.devise}
            onOpen={ouvrirProduit}
            voirTout={meilleuresVentesToutes.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte("bestseller") : null}
          />
        )}

        {!recherche.trim() && nouveautes.length > 0 && (
          <SectionCollection
            titre="✨ Nouveautés"
            produits={nouveautes}
            couleur={couleur}
            devise={entreprise.devise}
            onOpen={ouvrirProduit}
            voirTout={nouveautesToutes.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte("nouveautes") : null}
          />
        )}

        {!recherche.trim() && collectionsManuelles.map((col) => {
          const produitsDeLaCollection = produits.filter((p) => col.produitIds.includes(p.produit_id));
          if (produitsDeLaCollection.length === 0) return null;
          return (
            <SectionCollection
              key={col.id}
              titre={`📁 ${col.nom}`}
              produits={produitsDeLaCollection.slice(0, NOMBRE_OPTIMAL_PAR_COLLECTION)}
              couleur={couleur}
              devise={entreprise.devise}
              onOpen={ouvrirProduit}
              voirTout={produitsDeLaCollection.length > NOMBRE_OPTIMAL_PAR_COLLECTION ? () => setCollectionOuverte(`manuelle-${col.id}`) : null}
            />
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {recherche.trim() ? `Résultats pour "${recherche.trim()}"` : "Tous les produits"}
          </div>
          {!recherche.trim() && produitsFiltres.length > NOMBRE_MAX_ACCUEIL && (
            <button onClick={() => setCollectionOuverte("tous")} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Voir tout →
            </button>
          )}
        </div>

        {produitsFiltres.length === 0 && recherche.trim() && (
          <div style={{ textAlign: "center", color: "#8A9089", fontSize: 13.5, padding: "20px 0 40px" }}>
            Aucun produit ne correspond à ta recherche.
          </div>
        )}

        <div className="rv-shop-grid" style={{ paddingBottom: 20 }}>
          {(recherche.trim() ? produitsFiltres : produitsFiltres.slice(0, NOMBRE_MAX_ACCUEIL)).map((p) => (
            <CarteProduit key={p.produit_id} p={p} couleur={couleur} devise={entreprise.devise} onOpen={ouvrirProduit} />
          ))}
        </div>

        {!recherche.trim() && produitsFiltres.length > NOMBRE_MAX_ACCUEIL && (
          <button
            onClick={() => setCollectionOuverte("tous")}
            style={{ display: "block", width: "100%", background: "white", border: `1px solid ${couleur}`, color: couleur, borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 20 }}
          >
            Voir tous les produits ({produitsFiltres.length}) →
          </button>
        )}
      </div>

      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={produits.some((p) => p.nb_ventes > 0)} aDesNouveautes={produits.some((p) => p.est_nouveau)} onNaviguerVersCollection={naviguerVersCollection} />

      {politiqueOuverte && (
        <div
          onClick={() => setPolitiqueOuverte(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {politiqueOuverte === "livraison" ? "Politique de livraison" : politiqueOuverte === "retours" ? "Politique de retours" : "Politique de confidentialité"}
              </div>
              <button onClick={() => setPolitiqueOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {politiqueOuverte === "livraison" ? entreprise.politiqueLivraison : politiqueOuverte === "retours" ? entreprise.politiqueRetours : entreprise.politiqueConfidentialite}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EnteteBoutique({ entreprise, couleur, recherche, setRecherche, onLogoClick, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection, collectionActive }) {
  const aDesLiensNav = aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0;

  return (
    <div style={{ background: "white", borderBottom: "1px solid #ECE8DC", position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ background: couleur, overflow: "hidden" }}>
        <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "6px 16px", display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap" }}>
          {["🚚 Livraison rapide", "💵 Paiement à la livraison", "🛡️ Achat sécurisé"].map((txt, i) => (
            <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: "white", opacity: 0.95, whiteSpace: "nowrap" }}>{txt}</span>
          ))}
        </div>
      </div>

      <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onLogoClick}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: onLogoClick ? "pointer" : "default", padding: 0, flexShrink: 0 }}
          >
            {entreprise.logo ? (
              <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
            ) : null}
            <span className="rv-shop-header-nom" style={{ fontWeight: 700, fontSize: 15, color: "#16231F", whiteSpace: "nowrap" }}>{entreprise.nom}</span>
          </button>

          <div className="rv-shop-header-search" style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#8A9089", pointerEvents: "none" }}>🔍</span>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un produit..."
              style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 999, border: "1.5px solid #DDD8CC", fontSize: 13.5, boxSizing: "border-box" }}
            />
          </div>

          {entreprise.whatsapp && (
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rv-shop-header-whatsapp"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#EAF3DE", color: "#3B6D11", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              💬 <span className="rv-shop-header-whatsapp-txt">Nous contacter</span>
            </a>
          )}
        </div>
      </div>

      {aDesLiensNav && onNaviguerVersCollection && (
        <div style={{ borderTop: "1px solid #F0EEE6", overflowX: "auto" }}>
          <div className="rv-shop-header-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", gap: 4 }}>
            {[
              { id: null, label: "Accueil" },
              ...(aDesBestSellers ? [{ id: "bestseller", label: "🔥 Meilleures ventes" }] : []),
              ...(aDesNouveautes ? [{ id: "nouveautes", label: "✨ Nouveautés" }] : []),
              ...collectionsManuelles.map((col) => ({ id: `manuelle-${col.id}`, label: col.nom })),
            ].map((lien) => {
              const actif = collectionActive === lien.id;
              return (
                <button
                  key={lien.label}
                  onClick={() => onNaviguerVersCollection(lien.id)}
                  style={{ background: "none", border: "none", borderBottom: actif ? `2px solid ${couleur}` : "2px solid transparent", padding: "9px 12px 7px", fontSize: 12.5, fontWeight: actif ? 700 : 600, color: actif ? "#16231F" : "#6B7168", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {lien.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCollection({ titre, produits, couleur, devise, onOpen, voirTout }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{titre}</div>
        {voirTout && (
          <button onClick={voirTout} style={{ background: "none", border: "none", color: couleur, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            Voir tout →
          </button>
        )}
      </div>
      <div className="rv-shop-collection-scroll">
        {produits.map((p) => (
          <div key={p.produit_id} className="rv-shop-collection-card">
            <CarteProduit p={p} couleur={couleur} devise={devise} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CarteProduit({ p, couleur, devise, onOpen }) {
  return (
    <button
      onClick={() => onOpen(p)}
      className="rv-shop-card"
      style={{ display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(22,35,31,0.04)" }}
    >
      <div style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden" }}>
        {p.photo_url ? (
          <img
            src={p.photo_url}
            alt={p.produit_nom}
            loading="lazy"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📦</div>
        )}
        {p.nb_ventes > 0 && (
          <div style={{ position: "absolute", top: 6, left: 6, background: "#8A6412", color: "white", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            🔥 Best-seller
          </div>
        )}
        {p.est_nouveau && (
          <div style={{ position: "absolute", top: 6, right: 6, background: "#1a7a3c", color: "white", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            Nouveau
          </div>
        )}
        {p.stock_initial != null && Number(p.stock_initial) > 0 && Number(p.stock_initial) <= 5 && (
          <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(214,73,51,0.92)", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
            ⚡ {p.stock_initial} restants
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 14px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
        {p.note_moyenne != null && Number(p.nb_avis) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ color: "#e8920a", fontSize: 11.5 }}>{"★".repeat(Math.round(p.note_moyenne))}{"☆".repeat(5 - Math.round(p.note_moyenne))}</span>
            <span style={{ fontSize: 10.5, color: "#8A9089" }}>({p.nb_avis})</span>
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>
          {Number(p.prix_vente).toLocaleString("fr-FR")} {devise}
        </div>
      </div>
    </button>
  );
}

function PiedDePage({ entreprise, onOuvrirPolitique, collectionsManuelles = [], aDesBestSellers, aDesNouveautes, onNaviguerVersCollection }) {
  const anneeEnCours = new Date().getFullYear();
  const reseaux = [
    { url: entreprise.facebookUrl, icone: "📘", nom: "Facebook" },
    { url: entreprise.instagramUrl, icone: "📷", nom: "Instagram" },
    { url: entreprise.tiktokUrl, icone: "🎵", nom: "TikTok" },
  ].filter((r) => r.url);

  return (
    <div style={{ background: "#16231F", color: "rgba(255,255,255,0.75)", marginTop: 30 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {[
          { icone: "🚚", texte: "Livraison rapide" },
          { icone: "💵", texte: "Paiement à la livraison" },
          { icone: "🔄", texte: "Retour facile" },
          { icone: "🛡️", texte: "Achat sécurisé" },
        ].map((badge, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px" }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{badge.icone}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "white" }}>{badge.texte}</span>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 26 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            {entreprise.logo && (
              <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <div style={{ fontWeight: 700, fontSize: 16, color: "white" }}>{entreprise.nom}</div>
          </div>
          {entreprise.description && <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>{entreprise.description}</div>}
          {reseaux.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              {reseaux.map((r) => (
                <a
                  key={r.nom}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={r.nom}
                  style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, textDecoration: "none" }}
                >
                  {r.icone}
                </a>
              ))}
            </div>
          )}
        </div>

        {(aDesBestSellers || aDesNouveautes || collectionsManuelles.length > 0) && onNaviguerVersCollection && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>Boutique</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => onNaviguerVersCollection(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>Accueil</button>
              {aDesBestSellers && (
                <button onClick={() => onNaviguerVersCollection("bestseller")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>🔥 Meilleures ventes</button>
              )}
              {aDesNouveautes && (
                <button onClick={() => onNaviguerVersCollection("nouveautes")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>✨ Nouveautés</button>
              )}
              {collectionsManuelles.map((col) => (
                <button key={col.id} onClick={() => onNaviguerVersCollection(`manuelle-${col.id}`)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>{col.nom}</button>
              ))}
            </div>
          </div>
        )}

        {(entreprise.politiqueLivraison || entreprise.politiqueRetours || entreprise.politiqueConfidentialite) && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>Informations</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entreprise.politiqueLivraison && (
                <button onClick={() => onOuvrirPolitique("livraison")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>Politique de livraison</button>
              )}
              {entreprise.politiqueRetours && (
                <button onClick={() => onOuvrirPolitique("retours")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>Politique de retours</button>
              )}
              {entreprise.politiqueConfidentialite && (
                <button onClick={() => onOuvrirPolitique("confidentialite")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "left", cursor: "pointer", padding: 0 }}>Confidentialité</button>
              )}
            </div>
          </div>
        )}
        {entreprise.whatsapp && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "white", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" }}>Contact</div>
            <a
              href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5, textDecoration: "none" }}
            >
              💬 Discuter sur WhatsApp
            </a>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "4px 0 16px" }}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.75)", borderRadius: 999, padding: "8px 18px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
        >
          ▲ Retour en haut
        </button>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 20px", textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>
        © {anneeEnCours} {entreprise.nom}{!entreprise.marqueBlanche && " — Propulsé par RecuVente"}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" };

function PageAccueilPersonnalisee({ config, entreprise, couleur, produits, meilleuresVentes, meilleuresVentesToutes, nouveautes, nouveautesToutes, collectionsManuelles, recherche, setRecherche, produitsFiltres, ouvrirProduit, naviguerVersCollection, setCollectionOuverte, setPolitiqueOuverte, politiqueOuverte, NOMBRE_MAX_ACCUEIL }) {
  const devise = entreprise.devise;
  const sectionsNormalisees = (config.sections || []).map((s, i) =>
    typeof s === "string" ? { id: `s${i}`, type: s, visible: true } : { id: s.id || `s${i}`, type: s.type, visible: s.visible !== false }
  );
  const selectedProductIds = config.selectedProductIds || [];
  const selectedCollectionIds = config.selectedCollectionIds || [];
  const selectionnes = selectedProductIds.length ? produits.filter((p) => selectedProductIds.includes(p.produit_id)) : [];
  const fallbackProduits = selectionnes.length ? selectionnes : produits.slice(0, 8);
  const bestsellersAffiches = meilleuresVentes.length ? meilleuresVentes : fallbackProduits.slice(0, 4);

  const derivedCollections = collectionsManuelles.length
    ? collectionsManuelles.filter((c) => !selectedCollectionIds.length || selectedCollectionIds.includes(c.id))
    : [];

  function produitsDeCollection(col) {
    return produits.filter((p) => col.produitIds.includes(p.produit_id));
  }

  const commonPad = { padding: "34px 18px", borderBottom: "1px solid #edf1ee" };
  const aDesLiensNav = meilleuresVentesToutes.length > 0 || nouveautesToutes.length > 0 || collectionsManuelles.length > 0;

  function GrilleProduits({ liste, max }) {
    if (!liste.length) return <div style={{ padding: 16, textAlign: "center", background: "#f6f9f6", borderRadius: 10, color: "#728078", fontSize: 12 }}>Aucun produit pour le moment.</div>;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {liste.slice(0, max || 12).map((p) => <CarteProduit key={p.produit_id} p={p} couleur={couleur} devise={devise} onOpen={ouvrirProduit} />)}
      </div>
    );
  }

  function Section({ s }) {
    const type = s.type;
    if (type === "announcement") return <div style={{ padding: "10px 14px", background: couleur, color: "#fff", fontSize: 11, fontWeight: 800, textAlign: "center" }}>{config.announcement}</div>;

    if (type === "hero") return (
      <div style={{ textAlign: "center" }}>
        {entreprise.banniere ? (
          <img src={entreprise.banniere} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ padding: "50px 20px", background: `linear-gradient(135deg,${couleur},#0b2416)`, color: "#fff" }}>
            <div style={{ fontSize: 28, fontWeight: 950 }}>{config.heroTitle}</div>
          </div>
        )}
        <div style={{ padding: "26px 20px 34px" }}>
          <div style={{ fontSize: "clamp(24px,5vw,38px)", fontWeight: 950, color: "#132019", lineHeight: 1.08 }}>{config.heroTitle}</div>
          <div style={{ fontSize: 13, color: "#68756d", lineHeight: 1.6, margin: "12px auto 18px", maxWidth: 600 }}>{config.heroSubtitle}</div>
          <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "13px 22px", background: couleur, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
            {config.buttonText}
          </button>
        </div>
      </div>
    );

    if (type === "collections") {
      if (!derivedCollections.length) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 16px", fontSize: 21, color: "#14221b" }}>Explorer les collections</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
            {derivedCollections.slice(0, 8).map((c) => {
              const cp = produitsDeCollection(c);
              const cover = cp.find((p) => p.photo_url)?.photo_url;
              return (
                <button key={c.id} onClick={() => setCollectionOuverte(`manuelle-${c.id}`)} style={{ border: 0, padding: 0, borderRadius: 12, background: "#f5f8f5", textAlign: "center", overflow: "hidden", cursor: "pointer" }}>
                  {cover ? <img src={cover} alt="" loading="lazy" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} /> : <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "#eef3ee" }}>🗂️</div>}
                  <div style={{ padding: "10px 8px" }}><div style={{ fontWeight: 850, fontSize: 12 }}>{c.nom}</div><div style={{ fontSize: 10, color: "#7c877f", marginTop: 3 }}>{cp.length} article(s)</div></div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (type === "bestsellers" || type === "products") {
      const liste = type === "bestsellers" ? bestsellersAffiches : produitsFiltres;
      return (
        <div id={type === "products" ? "rv-shop-produits" : undefined} style={commonPad}>
          <h3 style={{ margin: "0 0 16px", fontSize: 21, color: "#14221b" }}>{type === "bestsellers" ? "🔥 Meilleures ventes" : "Nos produits"}</h3>
          <GrilleProduits liste={liste} max={type === "products" ? NOMBRE_MAX_ACCUEIL : 8} />
        </div>
      );
    }

    if (type === "bundles") {
      const base = bestsellersAffiches[0]?.prix_vente || produits[0]?.prix_vente || 0;
      return (
        <div style={{ ...commonPad, background: "#fffdf7" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 950, color: "#b16b00", letterSpacing: ".08em" }}>🔥 OFFRES QUANTITÉ</div>
            <h3 style={{ margin: "5px 0", fontSize: 22, color: "#14221b" }}>Plus tu prends, plus tu économises</h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            {(config.bundles || []).map((b, i) => {
              const total = Number(base) * b.qty * (1 - (Number(b.discount) || 0) / 100);
              return (
                <div key={b.id || i} style={{ border: i === 2 ? "2px solid " + couleur : "1px solid #e4e9e5", borderRadius: 14, padding: 15, background: "#fff" }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#16231c" }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: "#7b857e", marginTop: 4 }}>{b.qty} produit(s) · {b.discount || 0}% de remise</div>
                  <div style={{ fontSize: 21, fontWeight: 950, color: couleur, marginTop: 10 }}>{base ? total.toLocaleString("fr-FR") + " " + devise : "Prix sur demande"}</div>
                  <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ marginTop: 10, width: "100%", border: 0, borderRadius: 9, padding: 10, background: couleur, color: "#fff", fontWeight: 900, fontSize: 11, cursor: "pointer" }}>
                    Choisir un produit →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (type === "benefits") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>Pourquoi acheter chez nous ?</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          {[["🛡️", "Paiement à la livraison"], ["🚚", "Livraison suivie"], ["💬", "Support rapide"]].map((x) => (
            <div key={x[1]} style={{ padding: 15, borderRadius: 11, background: "#f6f9f6" }}><div style={{ fontSize: 21 }}>{x[0]}</div><div style={{ fontWeight: 850, fontSize: 12, marginTop: 7 }}>{x[1]}</div></div>
          ))}
        </div>
      </div>
    );

    if (type === "promo") return (
      <div style={{ ...commonPad, background: "#f7f2e7", textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: "#b16b00" }}>OFFRE LIMITÉE</div>
        <h3 style={{ fontSize: 25, margin: "8px 0", color: "#162119" }}>{config.promoTitle}</h3>
        <p style={{ fontSize: 12.5, color: "#6f776f" }}>{config.promoText}</p>
        <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 9, padding: "11px 19px", background: "#e8920a", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Profiter de l'offre</button>
      </div>
    );

    if (type === "testimonials") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>⭐ Ils nous font confiance</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 11 }}>
          {["Une expérience simple et rapide.", "La commande a été parfaitement suivie.", "Je recommande sans hésiter."].map((t, i) => (
            <div key={i} style={{ padding: 16, border: "1px solid #e6ece7", borderRadius: 12 }}><div style={{ color: "#e8920a" }}>★★★★★</div><div style={{ fontSize: 12, lineHeight: 1.55, color: "#435047", marginTop: 8 }}>"{t}"</div><div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 9 }}>Client</div></div>
          ))}
        </div>
      </div>
    );

    if (type === "gallery") {
      if (!config.gallery?.length) return null;
      return (
        <div style={commonPad}>
          <h3 style={{ margin: "0 0 15px", fontSize: 20, color: "#14221b" }}>Notre univers</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 9 }}>
            {config.gallery.map((u, i) => <img key={i} src={u} alt="" loading="lazy" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} />)}
          </div>
        </div>
      );
    }

    if (type === "faq") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 13px", fontSize: 20, color: "#14221b" }}>Questions fréquentes</h3>
        {["Comment commander ?", "Quels sont les délais ?", "Comment suivre ma commande ?"].map((q) => (
          <div key={q} style={{ padding: "13px 2px", borderBottom: "1px solid #e7ece8", fontSize: 12.5, fontWeight: 800 }}>{q}</div>
        ))}
      </div>
    );

    if (type === "delivery") return (
      <div style={commonPad}>
        <h3 style={{ margin: "0 0 9px", fontSize: 20, color: "#14221b" }}>🚚 Livraison</h3>
        <p style={{ fontSize: 12.5, color: "#68756d", lineHeight: 1.6 }}>{config.livraison}</p>
      </div>
    );

    if (type === "cod_form") return (
      <div style={{ ...commonPad, background: "#f7faf7", textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 950, color: couleur }}>COMMANDE SIMPLE & RAPIDE</div>
        <h3 style={{ margin: "5px 0 10px", fontSize: 21, color: "#14221b" }}>📝 Choisis un produit pour commander</h3>
        <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "13px 22px", background: couleur, color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
          Voir les produits
        </button>
      </div>
    );

    if (type === "whatsapp") return (
      <div style={{ ...commonPad, textAlign: "center", background: "#f4faf5" }}>
        <div style={{ fontSize: 27 }}>💬</div>
        <h3 style={{ margin: "8px 0", fontSize: 20, color: "#14221b" }}>Besoin d'aide ?</h3>
        <p style={{ fontSize: 12, color: "#68756d" }}>Écris-nous directement sur WhatsApp.</p>
        {entreprise.whatsapp && (
          <a href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}?text=${encodeURIComponent(config.whatsapp || "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", border: 0, borderRadius: 10, padding: "11px 19px", background: "#168a45", color: "#fff", fontWeight: 900, textDecoration: "none" }}>
            Ouvrir WhatsApp
          </a>
        )}
      </div>
    );

    if (type === "contact") return (
      <div style={{ ...commonPad, textAlign: "center", background: "#0d2417", color: "#fff" }}>
        <h3 style={{ margin: "0 0 9px", fontSize: 25 }}>Prêt à passer à l'action ?</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.68)" }}>Commandez, ou contactez-nous maintenant.</p>
        <button onClick={() => document.getElementById("rv-shop-produits")?.scrollIntoView({ behavior: "smooth" })} style={{ border: 0, borderRadius: 10, padding: "12px 21px", background: couleur, color: "#fff", fontWeight: 900, cursor: "pointer" }}>{config.buttonText}</button>
      </div>
    );

    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "sans-serif" }}>
      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} collectionActive={null} />
      {sectionsNormalisees.filter((s) => s.visible !== false).map((s) => <Section key={s.id} s={s} />)}
      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} collectionsManuelles={collectionsManuelles} aDesBestSellers={meilleuresVentesToutes.length > 0} aDesNouveautes={nouveautesToutes.length > 0} onNaviguerVersCollection={naviguerVersCollection} />
      {politiqueOuverte && (
        <div onClick={() => setPolitiqueOuverte(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,31,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "100%", maxWidth: 480, borderRadius: "18px 18px 0 0", padding: "20px 18px 28px", maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {politiqueOuverte === "livraison" ? "Politique de livraison" : politiqueOuverte === "retours" ? "Politique de retours" : "Politique de confidentialité"}
              </div>
              <button onClick={() => setPolitiqueOuverte(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A9089" }}>×</button>
            </div>
            <div style={{ fontSize: 13.5, color: "#16231F", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {politiqueOuverte === "livraison" ? entreprise.politiqueLivraison : politiqueOuverte === "retours" ? entreprise.politiqueRetours : entreprise.politiqueConfidentialite}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
