create or replace function public.soumettre_candidature_reseau_public(
  p_recruteur_code text,
  p_nom text,
  p_telephone text,
  p_email text default null,
  p_motivation text default null,
  p_pack_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_f public.filleuls%rowtype;
  v_pack public.recrutement_packs%rowtype;
  v_prospect_id uuid; v_candidature_id uuid; v_commande_id uuid;
  v_clean_nom text := nullif(trim(p_nom), '');
  v_clean_tel text := nullif(trim(p_telephone), '');
  v_clean_email text := nullif(lower(trim(coalesce(p_email,''))), '');
  v_clean_motivation text := nullif(trim(coalesce(p_motivation,'')), '');
begin
  if length(coalesce(p_recruteur_code,'')) < 3 or length(p_recruteur_code) > 64 then raise exception 'Code de recrutement invalide'; end if;
  if v_clean_nom is null or length(v_clean_nom) < 2 or length(v_clean_nom) > 160 then raise exception 'Nom invalide'; end if;
  if v_clean_tel is null or length(v_clean_tel) < 6 or length(v_clean_tel) > 40 then raise exception 'Téléphone invalide'; end if;
  if v_clean_email is not null and (length(v_clean_email) > 254 or v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Email invalide'; end if;
  if v_clean_motivation is not null and length(v_clean_motivation) > 3000 then raise exception 'Motivation trop longue'; end if;
  select * into v_f from public.filleuls where upper(code)=upper(trim(p_recruteur_code)) and coalesce(statut,'actif') not in ('suspendu','inactif') limit 1;
  if not found then raise exception 'Lien de recrutement invalide'; end if;
  if p_pack_id is not null then
    select * into v_pack from public.recrutement_packs where id=p_pack_id and actif=true;
    if not found then raise exception 'Pack indisponible'; end if;
  end if;
  select id into v_prospect_id from public.filleuls_prospects where workspace_id=v_f.workspace_id and regexp_replace(coalesce(telephone,''),'\D','','g') = regexp_replace(v_clean_tel,'\D','','g') and created_at > now() - interval '24 hours' order by created_at desc limit 1;
  if v_prospect_id is null then
    insert into public.filleuls_prospects(workspace_id,prospecte_par_filleul_id,nom,telephone,source,statut,note,parcours_statut,candidature_le_at,recruteur_filleul_id)
    values(v_f.workspace_id,v_f.id,v_clean_nom,v_clean_tel,'tunnel_recrutement','nouveau',v_clean_motivation,'candidature',now(),v_f.id) returning id into v_prospect_id;
  else
    update public.filleuls_prospects set nom=v_clean_nom,telephone=v_clean_tel,note=coalesce(v_clean_motivation,note),candidature_le_at=coalesce(candidature_le_at,now()),recruteur_filleul_id=v_f.id,prospecte_par_filleul_id=coalesce(prospecte_par_filleul_id,v_f.id),parcours_statut='candidature',updated_at=now() where id=v_prospect_id;
  end if;
  insert into public.recrutement_candidatures(prospect_id,workspace_id,nom,telephone,email,motivation,statut)
  values(v_prospect_id,v_f.workspace_id,v_clean_nom,v_clean_tel,v_clean_email,v_clean_motivation,'soumise') returning id into v_candidature_id;
  if v_pack.id is not null then
    update public.filleuls_prospects set pack_choisi_at=now(),updated_at=now() where id=v_prospect_id;
    insert into public.recrutement_commandes_pack(prospect_id,candidature_id,pack_id,workspace_id,pack_nom_snapshot,pack_prix_snapshot,pack_devise_snapshot,statut_commande,statut_paiement,statut_partenaire,statut_activation)
    values(v_prospect_id,v_candidature_id,v_pack.id,v_f.workspace_id,v_pack.nom,v_pack.prix,v_pack.devise,'creee','non_declare','non_cree','non_active') returning id into v_commande_id;
    update public.filleuls_prospects set commande_pack_id=v_commande_id,updated_at=now() where id=v_prospect_id;
  end if;
  return jsonb_build_object('candidature_id',v_candidature_id,'prospect_id',v_prospect_id,'commande_id',v_commande_id,'workspace_id',v_f.workspace_id,'recruteur_id',v_f.id,'recruteur_code',v_f.code);
end;
$$;
revoke execute on function public.soumettre_candidature_reseau_public(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.soumettre_candidature_reseau_public(text,text,text,text,text,uuid) to anon, authenticated;
