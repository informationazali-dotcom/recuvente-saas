import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Éditeur de tunnel (§14-16 de la mission) — vidéo de présentation, images,
// témoignages, FAQ, textes libres. Affiché dans l'ordre choisi sur
// /tunnel/CODE, avant même la candidature.
export default function TunnelAdmin({ workspace }) {
  const [etapes, setEtapes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [showAjout, setShowAjout] = useState(false);
  const [etapeEnEdition, setEtapeEnEdition] = useState(null);

  async function charger() {
    setChargement(true);
    const { data } = await supabase.from("tunnel_etapes").select("*").eq("workspace_id", workspace.id).order("ordre");
    setEtapes(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, [workspace.id]);

  async function basculerActif(etape) {
    await supabase.from("tunnel_etapes").update({ actif: !etape.actif, updated_at: new Date().toISOString() }).eq("id", etape.id);
    await charger();
  }

  async function supprimer(etape) {
    if (!window.confirm(`Supprimer cette étape ("${etape.titre || etape.type}") ?`)) return;
    await supabase.from("tunnel_etapes").delete().eq("id", etape.id);
    await charger();
  }

  async function deplacer(index, direction) {
    const cible = etapes[index + direction];
    const courant = etapes[index];
    if (!cible) return;
    await Promise.all([
      supabase.from("tunnel_etapes").update({ ordre: cible.ordre }).eq("id", courant.id),
      supabase.from("tunnel_etapes").update({ ordre: courant.ordre }).eq("id", cible.id),
    ]);
    await charger();
  }

  const carte = { background: "white", border: "1px solid #ECE8DC", borderRadius: 14, padding: "14px 16px" };
  const iconeType = { video: "🎥", image: "🖼️", texte: "📄", temoignage: "💬", faq: "❓" };
  const labelType = { video: "Vidéo", image: "Image", texte: "Texte", temoignage: "Témoignage", faq: "Question / Réponse" };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: "#16231F" }}>🎬 Tunnel de recrutement</div>
        <button onClick={() => setShowAjout(true)} style={{ background: "#6b3fd4", color: "white", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          + Ajouter une étape
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: "#8A9089", marginBottom: 14, lineHeight: 1.5 }}>
        Ces étapes s'affichent, dans cet ordre, sur la page /tunnel de tes filleuls — avant même que le visiteur ne remplisse sa candidature. Une vidéo de présentation, tes témoignages, tes réponses aux questions fréquentes.
      </div>

      {chargement && <div style={{ fontSize: 12.5, color: "#8A9089" }}>Chargement...</div>}
      {!chargement && etapes.length === 0 && (
        <div style={{ ...carte, textAlign: "center", color: "#8A9089", fontSize: 12.5 }}>
          Aucune étape pour l'instant — le tunnel affiche uniquement le contenu de base. Ajoute ta vidéo de présentation pour commencer.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {etapes.map((e, i) => (
          <div key={e.id} style={{ ...carte, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button onClick={() => deplacer(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", fontSize: 12, cursor: i === 0 ? "not-allowed" : "pointer", opacity: i === 0 ? 0.3 : 1, lineHeight: 1, padding: 0 }}>▲</button>
              <button onClick={() => deplacer(i, 1)} disabled={i === etapes.length - 1} style={{ background: "none", border: "none", fontSize: 12, cursor: i === etapes.length - 1 ? "not-allowed" : "pointer", opacity: i === etapes.length - 1 ? 0.3 : 1, lineHeight: 1, padding: 0 }}>▼</button>
            </div>
            <div onClick={() => setEtapeEnEdition(e)} style={{ flex: 1, cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#16231F" }}>{iconeType[e.type]} {e.titre || labelType[e.type]} {!e.actif && <span style={{ color: "#8A9089", fontWeight: 500 }}>(masqué)</span>}</div>
              <div style={{ fontSize: 11, color: "#8A9089" }}>{labelType[e.type]}</div>
            </div>
            <button onClick={() => basculerActif(e)} style={{ background: e.actif ? "#EAF3DE" : "#F3F1EA", color: e.actif ? "#1a7a3c" : "#8A9089", border: "none", borderRadius: 7, padding: "7px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {e.actif ? "Visible" : "Masqué"}
            </button>
            <button onClick={() => supprimer(e)} style={{ background: "none", border: "none", color: "#D64933", fontSize: 14, cursor: "pointer" }}>🗑️</button>
          </div>
        ))}
      </div>

      {showAjout && <FormulaireEtapeModal workspace={workspace} onClose={() => setShowAjout(false)} onEnregistre={async () => { setShowAjout(false); await charger(); }} />}
      {etapeEnEdition && <FormulaireEtapeModal workspace={workspace} etape={etapeEnEdition} onClose={() => setEtapeEnEdition(null)} onEnregistre={async () => { setEtapeEnEdition(null); await charger(); }} />}
    </div>
  );
}

function FormulaireEtapeModal({ workspace, etape, onClose, onEnregistre }) {
  const [type, setType] = useState(etape?.type || "video");
  const [titre, setTitre] = useState(etape?.titre || "");
  const [contenu, setContenu] = useState(etape?.contenu || "");
  const [reponse, setReponse] = useState(etape?.reponse || "");
  const [auteurNom, setAuteurNom] = useState(etape?.auteur_nom || "");
  const [mediaUrl, setMediaUrl] = useState(etape?.media_url || "");
  const [fichier, setFichier] = useState(null);
  const [uploadEnCours, setUploadEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  async function enregistrer() {
    setErreur("");
    let urlFinale = mediaUrl;

    if (fichier) {
      setUploadEnCours(true);
      const chemin = `${workspace.id}/${crypto.randomUUID()}-${fichier.name}`;
      const { error: erreurUpload } = await supabase.storage.from("tunnel-media").upload(chemin, fichier);
      setUploadEnCours(false);
      if (erreurUpload) { setErreur("Échec de l'envoi du fichier : " + erreurUpload.message); return; }
      const { data: urlPublique } = supabase.storage.from("tunnel-media").getPublicUrl(chemin);
      urlFinale = urlPublique.publicUrl;
    }

    if ((type === "video" || type === "image") && !urlFinale) { setErreur("Ajoute un fichier ou une URL."); return; }
    if (type === "faq" && (!contenu.trim() || !reponse.trim())) { setErreur("La question et la réponse sont obligatoires."); return; }
    if (type === "temoignage" && !contenu.trim()) { setErreur("Le témoignage ne peut pas être vide."); return; }
    if (type === "texte" && !contenu.trim()) { setErreur("Le texte ne peut pas être vide."); return; }

    setEnCours(true);
    const payload = {
      workspace_id: workspace.id, type, titre: titre.trim() || null,
      contenu: contenu.trim() || null, reponse: type === "faq" ? reponse.trim() || null : null,
      auteur_nom: type === "temoignage" ? auteurNom.trim() || null : null,
      media_url: (type === "video" || type === "image") ? urlFinale || null : null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (etape) {
      ({ error } = await supabase.from("tunnel_etapes").update(payload).eq("id", etape.id));
    } else {
      const { count } = await supabase.from("tunnel_etapes").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
      ({ error } = await supabase.from("tunnel_etapes").insert([{ ...payload, ordre: count || 0, actif: true }]));
    }
    setEnCours(false);
    if (error) { setErreur(error.message); return; }
    onEnregistre();
  }

  const champ = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: "1px solid #DDD8CC", fontSize: 12.5, marginBottom: 8 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(9,20,15,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100, overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>{etape ? "Modifier l'étape" : "Nouvelle étape du tunnel"}</div>

        <select value={type} onChange={(e) => setType(e.target.value)} disabled={!!etape} style={{ ...champ, opacity: etape ? 0.6 : 1 }}>
          <option value="video">🎥 Vidéo de présentation</option>
          <option value="image">🖼️ Image</option>
          <option value="texte">📄 Texte libre</option>
          <option value="temoignage">💬 Témoignage</option>
          <option value="faq">❓ Question / Réponse (FAQ)</option>
        </select>

        <input placeholder="Titre (optionnel)" value={titre} onChange={(e) => setTitre(e.target.value)} style={champ} />

        {(type === "video" || type === "image") && (
          <>
            <label style={{ fontSize: 10.5, color: "#8A9089" }}>Uploader un fichier {type === "video" ? "vidéo" : "image"}</label>
            <input type="file" accept={type === "video" ? "video/*" : "image/*"} onChange={(e) => setFichier(e.target.files?.[0] || null)} style={{ ...champ, padding: "8px 0" }} />
            <div style={{ fontSize: 10, color: "#8A9089", margin: "-4px 0 8px" }}>— ou —</div>
            <input placeholder="URL directe (YouTube, Vimeo, lien image...)" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} style={champ} />
          </>
        )}

        {type === "texte" && <textarea placeholder="Contenu du texte" value={contenu} onChange={(e) => setContenu(e.target.value)} rows={4} style={{ ...champ, resize: "vertical" }} />}

        {type === "temoignage" && (
          <>
            <textarea placeholder="Le témoignage" value={contenu} onChange={(e) => setContenu(e.target.value)} rows={3} style={{ ...champ, resize: "vertical" }} />
            <input placeholder="Nom de la personne (ex: Awa K., partenaire depuis 2025)" value={auteurNom} onChange={(e) => setAuteurNom(e.target.value)} style={champ} />
          </>
        )}

        {type === "faq" && (
          <>
            <input placeholder="Question" value={contenu} onChange={(e) => setContenu(e.target.value)} style={champ} />
            <textarea placeholder="Réponse" value={reponse} onChange={(e) => setReponse(e.target.value)} rows={3} style={{ ...champ, resize: "vertical" }} />
          </>
        )}

        {erreur && <div style={{ fontSize: 11.5, color: "#D64933", marginBottom: 10 }}>{erreur}</div>}

        <button onClick={enregistrer} disabled={enCours || uploadEnCours} style={{ width: "100%", background: "#6b3fd4", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          {uploadEnCours ? "Envoi du fichier..." : enCours ? "Enregistrement..." : etape ? "Enregistrer les modifications" : "Ajouter au tunnel"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: "#8A9089", fontSize: 12, padding: "6px 0", cursor: "pointer" }}>Annuler</button>
      </div>
    </div>
  );
}
