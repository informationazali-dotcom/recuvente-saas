import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function CataloguePublic({ workspaceId }) {
  const [entreprise, setEntreprise] = useState(undefined);
  const [produits, setProduits] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [produitOuvert, setProduitOuvert] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [form, setForm] = useState({ client: "", tel: "", zone: "" });
  const [quantite, setQuantite] = useState(1);
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
      });
      chargerPixelFacebook(data[0].facebook_pixel_id);
      const listeProduits = data.filter((p) => p.produit_nom);
      setProduits(listeProduits);

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

  async function envoyerCommande() {
    if (!form.client.trim() || !form.tel.trim() || !form.zone.trim()) {
      setErreurEnvoi("Merci de renseigner ton nom, ton téléphone et ta ville/quartier.");
      return;
    }
    setEnvoi(true);
    setErreurEnvoi("");
    const items = [{
      produit_id: produitOuvert.produit_id,
      produit_nom: produitOuvert.produit_nom,
      quantite: quantite,
      prix_unitaire: Number(produitOuvert.prix_vente),
    }];
    const { data, error } = await supabase.rpc("creer_commande_multi_publique", {
      p_workspace_id: workspaceId,
      p_client: form.client,
      p_tel: form.tel,
      p_zone: form.zone,
      p_items: items,
    });
    setEnvoi(false);
    const resultat = data && data[0];
    if (error || !resultat?.succes) {
      setErreurEnvoi(resultat?.message || "Une erreur est survenue, réessaie.");
      return;
    }
    trackEvenement("Lead", {
      content_ids: [produitOuvert.produit_id],
      value: Number(produitOuvert.prix_vente) * quantite,
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
    return (
      <div style={{ minHeight: "100vh", background: "white", fontFamily: "sans-serif" }}>
        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={fermerProduit} />

        <style>{`
          .rv-shop-produit-wrap { max-width: 480px; margin: 0 auto; }
          .rv-shop-produit-photo { height: 260px; }
          @media (min-width: 900px) {
            .rv-shop-produit-wrap { max-width: 1000px; padding: 0 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; margin-top: 24px; }
            .rv-shop-produit-photo-col { position: sticky; top: 24px; }
            .rv-shop-produit-photo { height: 460px; border-radius: 16px; }
            .rv-shop-produit-back { display: none !important; }
            .rv-shop-produit-info { padding: 0 0 100px !important; }
            .rv-shop-cta-bar-inner { max-width: 1000px; margin: 0 auto; padding: 0 32px; box-sizing: border-box; }
          }
        `}</style>

        <div className="rv-shop-produit-wrap">
          <div className="rv-shop-produit-photo-col" style={{ position: "relative" }}>
            {(() => {
              const toutesLesPhotos = [produitOuvert.photo_url, ...(produitOuvert.photos_galerie || [])].filter(Boolean);
              const photoAffichee = toutesLesPhotos[photoActive] || toutesLesPhotos[0];
              return (
                <>
                  {photoAffichee ? (
                    <img
                      className="rv-shop-produit-photo"
                      src={photoAffichee}
                      alt={produitOuvert.produit_nom}
                      style={{ width: "100%", objectFit: "contain", background: "#EEF0EA", display: "block" }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div className="rv-shop-produit-photo" style={{ width: "100%", background: "#EEF0EA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>📦</div>
                  )}
                  {toutesLesPhotos.length > 1 && (
                    <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto" }}>
                      {toutesLesPhotos.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoActive(i)}
                          style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: "hidden", padding: 0, border: i === photoActive ? `2px solid ${couleur}` : "1px solid #ECE8DC", cursor: "pointer", background: "none" }}
                        >
                          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
                navigator.clipboard.writeText(window.location.href);
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

            <div style={{ fontWeight: 700, fontSize: 24, color: couleur, marginTop: 10, marginBottom: 8 }}>
              {Number(produitOuvert.prix_vente).toLocaleString("fr-FR")} {entreprise.devise}
            </div>

            {produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5 && (
              <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#D64933", background: "#FBEAE6", padding: "4px 10px", borderRadius: 999, marginBottom: 18 }}>
                ⚡ Plus que {produitOuvert.stock_initial} en stock
              </div>
            )}
            {!(produitOuvert.stock_initial > 0 && produitOuvert.stock_initial <= 5) && <div style={{ marginBottom: 10 }} />}

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
                      <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>{(Number(produitOuvert.prix_vente) * quantite).toLocaleString("fr-FR")} {entreprise.devise}</div>
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

            {!envoye && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3B6D11" }}>
                  <span style={{ fontSize: 15 }}>💵</span> Paiement à la livraison — sans risque
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3B6D11" }}>
                  <span style={{ fontSize: 15 }}>🚚</span> Livraison rapide, où que tu sois
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#3B6D11" }}>
                  <span style={{ fontSize: 15 }}>✅</span> Tu vérifies ton colis avant de payer
                </div>
              </div>
            )}

            {!envoye && (
              <div className="rv-shop-cta-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ECE8DC", padding: "14px 18px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)", zIndex: 20 }}>
                <div className="rv-shop-cta-bar-inner">
                  <button
                    onClick={() => {
                      trackEvenement("InitiateCheckout", {
                        content_ids: [produitOuvert.produit_id],
                        value: Number(produitOuvert.prix_vente) * quantite,
                        currency: entreprise?.devise || "XOF",
                      });
                      setAfficherFormulaire(true);
                    }}
                    style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                  >
                    {`Commander — ${(Number(produitOuvert.prix_vente) * quantite).toLocaleString("fr-FR")} ${entreprise.devise}`}
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
                    onClick={() => setQuantite((q) => Math.max(1, q - 1))}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    −
                  </button>
                  <div style={{ fontWeight: 700, fontSize: 16, minWidth: 20, textAlign: "center" }}>{quantite}</div>
                  <button
                    onClick={() => setQuantite((q) => q + 1)}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #DDD8CC", background: "white", fontSize: 17, fontWeight: 700, color: "#16231F", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
              </div>

              {erreurEnvoi && <div style={{ color: "#D64933", fontSize: 12.5, marginBottom: 10 }}>{erreurEnvoi}</div>}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF7", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                <span style={{ color: "#6B7168" }}>{quantite} × {produitOuvert.produit_nom}</span>
                <span style={{ fontWeight: 700, color: couleur }}>{(Number(produitOuvert.prix_vente) * quantite).toLocaleString("fr-FR")} {entreprise.devise}</span>
              </div>

              <button
                onClick={envoyerCommande}
                disabled={envoi || !form.client.trim() || !form.tel.trim() || !form.zone.trim()}
                style={{ width: "100%", background: couleur, color: "white", border: "none", borderRadius: 12, padding: "15px 0", fontWeight: 700, fontSize: 15, cursor: envoi ? "default" : "pointer", opacity: (envoi || !form.client.trim() || !form.tel.trim() || !form.zone.trim()) ? 0.5 : 1, marginTop: 4 }}
              >
                {envoi ? "Envoi..." : "Confirmer la commande"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ÉCRAN COLLECTION COMPLÈTE =====
  if (collectionOuverte) {
    const listeCollection = collectionOuverte === "bestseller"
      ? [...produits].filter((p) => p.nb_ventes > 0).sort((a, b) => b.nb_ventes - a.nb_ventes)
      : collectionOuverte === "nouveautes"
        ? produits.filter((p) => p.est_nouveau)
        : produits;
    const titreCollection = collectionOuverte === "bestseller" ? "🔥 Meilleures ventes" : collectionOuverte === "nouveautes" ? "✨ Nouveautés" : "Tous les produits";

    return (
      <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <style>{`
          .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
          .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          @media (min-width: 640px) { .rv-shop-content { max-width: 720px; padding: 0 24px; } .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
          @media (min-width: 960px) { .rv-shop-content { max-width: 1100px; padding: 0 32px; } .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; } }
          @media (min-width: 1280px) { .rv-shop-grid { grid-template-columns: repeat(5, 1fr); } }
        `}</style>

        <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} onLogoClick={() => setCollectionOuverte(null)} />

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

        <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} />
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

  return (
    <div style={{ background: "#FAFAF7", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <style>{`
        .rv-shop-content { max-width: 480px; margin: 0 auto; padding: 0 16px; }
        .rv-shop-banner { height: 90px; }
        .rv-shop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .rv-shop-collection-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
        .rv-shop-collection-scroll::-webkit-scrollbar { height: 5px; }
        .rv-shop-collection-scroll::-webkit-scrollbar-thumb { background: #DDD8CC; border-radius: 999px; }
        .rv-shop-collection-card { flex: 0 0 140px; min-width: 0; max-width: 140px; }
        @media (min-width: 640px) {
          .rv-shop-content { max-width: 720px; padding: 0 24px; }
          .rv-shop-banner { height: 160px; }
          .rv-shop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .rv-shop-collection-scroll { display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible; gap: 16px; }
          .rv-shop-collection-card { flex: none; width: auto; min-width: 0; max-width: none; }
        }
        @media (min-width: 960px) {
          .rv-shop-content { max-width: 1100px; padding: 0 32px; }
          .rv-shop-banner { height: 220px; }
          .rv-shop-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .rv-shop-collection-scroll { grid-template-columns: repeat(4, 1fr); gap: 20px; }
        }
        @media (min-width: 1280px) {
          .rv-shop-grid { grid-template-columns: repeat(5, 1fr); }
          .rv-shop-collection-scroll { grid-template-columns: repeat(5, 1fr); }
        }
      `}</style>

      <EnteteBoutique entreprise={entreprise} couleur={couleur} recherche={recherche} setRecherche={setRecherche} />

      {entreprise.banniere ? (
        <div className="rv-shop-banner" style={{ width: "100%", position: "relative", overflow: "hidden" }}>
          <img src={entreprise.banniere} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.35))" }} />
        </div>
      ) : (
        <div className="rv-shop-banner" style={{ width: "100%", background: `linear-gradient(135deg, ${couleur}, ${couleur}dd)` }} />
      )}

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

      <PiedDePage entreprise={entreprise} onOuvrirPolitique={setPolitiqueOuverte} />

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

function EnteteBoutique({ entreprise, couleur, recherche, setRecherche, onLogoClick }) {
  return (
    <div style={{ background: "white", borderBottom: "1px solid #ECE8DC", position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={onLogoClick}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: onLogoClick ? "pointer" : "default", padding: 0 }}
        >
          {entreprise.logo ? (
            <img src={entreprise.logo} alt={entreprise.nom} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
          ) : null}
          <span style={{ fontWeight: 700, fontSize: 15, color: "#16231F" }}>{entreprise.nom}</span>
        </button>

        <div style={{ flex: 1, minWidth: 140, order: 3 }}>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un produit..."
            style={{ width: "100%", padding: "8px 12px", borderRadius: 999, border: "1px solid #DDD8CC", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        {entreprise.whatsapp && (
          <a
            href={`https://wa.me/${String(entreprise.whatsapp).replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#EAF3DE", color: "#3B6D11", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", order: 2, marginLeft: "auto" }}
          >
            💬 Nous contacter
          </a>
        )}
      </div>
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
      style={{ display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left" }}
    >
      <div style={{ position: "relative", width: "100%", paddingTop: "100%", background: "#EEF0EA", overflow: "hidden" }}>
        {p.photo_url ? (
          <img
            src={p.photo_url}
            alt={p.produit_nom}
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
      </div>
      <div style={{ padding: "10px 12px 14px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.produit_nom}</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: couleur }}>
          {Number(p.prix_vente).toLocaleString("fr-FR")} {devise}
        </div>
      </div>
    </button>
  );
}

function PiedDePage({ entreprise, onOuvrirPolitique }) {
  const anneeEnCours = new Date().getFullYear();
  return (
    <div style={{ background: "#16231F", color: "rgba(255,255,255,0.75)", marginTop: 30 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 26 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "white", marginBottom: 10 }}>{entreprise.nom}</div>
          {entreprise.description && <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{entreprise.description}</div>}
        </div>

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

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "16px 20px", textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.45)" }}>
        © {anneeEnCours} {entreprise.nom} — Propulsé par RecuVente
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #DDD8CC", fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" };
