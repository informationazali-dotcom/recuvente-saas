create or replace function public.activer_filleul_apres_paiement(p_commande_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_cmd public.recrutement_commandes_pack; v_filleul uuid;
begin
  select * into v_cmd from public.recrutement_commandes_pack where id=p_commande_id for update;
  if not found then raise exception 'Commande de pack introuvable'; end if;
  if not public.rv_recrutement_owner_ou_admin(v_cmd.workspace_id) then raise exception 'Accès refusé'; end if;
  if v_cmd.statut_paiement <> 'confirme' then raise exception 'Le paiement doit être confirmé avant activation'; end if;
  if v_cmd.statut_partenaire <> 'cree' then raise exception 'Le partenaire externe doit être créé avant activation'; end if;
  if v_cmd.statut_activation = 'activee' then
    select fp.devenu_filleul_id into v_filleul from public.filleuls_prospects fp where fp.id=v_cmd.prospect_id;
    return jsonb_build_object('success',true,'filleul_id',v_filleul,'commande_id',v_cmd.id,'activation','activee');
  end if;
  if v_cmd.statut_activation <> 'prete' then raise exception 'Le recrutement n’est pas prêt pour activation'; end if;
  v_filleul := public.convertir_prospect_en_filleul(v_cmd.prospect_id);
  update public.filleuls set pack_id=v_cmd.pack_id, pack_commande_id=v_cmd.id, pack_active_at=coalesce(pack_active_at,now()), est_pro=true, statut='actif' where id=v_filleul;
  update public.recrutement_commandes_pack set statut_activation='activee', activation_at=coalesce(activation_at,now()), activation_par=coalesce(activation_par,auth.uid()), updated_at=now() where id=v_cmd.id;
  update public.filleuls_prospects set parcours_statut='active', active_at=coalesce(active_at,now()), updated_at=now() where id=v_cmd.prospect_id;
  perform public.appliquer_parrain_pack(v_cmd.id);
  return jsonb_build_object('success',true,'filleul_id',v_filleul,'commande_id',v_cmd.id,'activation','activee');
end;
$$;

create or replace function public.activer_filleul_pack(p_commande_id uuid)
returns public.recrutement_commandes_pack
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_cmd public.recrutement_commandes_pack; v_filleul_id uuid;
begin
  select * into v_cmd from public.recrutement_commandes_pack where id=p_commande_id for update;
  if not found then raise exception 'Commande pack introuvable'; end if;
  if not public.rv_recrutement_owner_ou_admin(v_cmd.workspace_id) then raise exception 'Accès refusé'; end if;
  if v_cmd.statut_paiement <> 'confirme' then raise exception 'Le paiement doit être confirmé'; end if;
  if v_cmd.statut_partenaire <> 'cree' then raise exception 'Le partenaire externe doit être créé avant activation'; end if;
  if v_cmd.statut_activation = 'activee' then return v_cmd; end if;
  if v_cmd.statut_activation <> 'prete' then raise exception 'Le recrutement n’est pas prêt pour activation'; end if;
  v_filleul_id := public.convertir_prospect_en_filleul(v_cmd.prospect_id);
  update public.filleuls set pack_id=v_cmd.pack_id, pack_commande_id=v_cmd.id, pack_active_at=coalesce(pack_active_at,now()), est_pro=true, statut='actif' where id=v_filleul_id;
  update public.recrutement_commandes_pack set statut_activation='activee', active_at=coalesce(active_at,now()), active_par=coalesce(active_par,auth.uid()), updated_at=now() where id=p_commande_id returning * into v_cmd;
  update public.filleuls_prospects set parcours_statut='active', active_at=coalesce(active_at,now()), updated_at=now() where id=v_cmd.prospect_id;
  perform public.appliquer_parrain_pack(v_cmd.id);
  return v_cmd;
end;
$$;

revoke all on function public.activer_filleul_apres_paiement(uuid) from public;
revoke all on function public.activer_filleul_apres_paiement(uuid) from anon;
revoke all on function public.activer_filleul_apres_paiement(uuid) from authenticated;
grant execute on function public.activer_filleul_apres_paiement(uuid) to authenticated;

revoke all on function public.activer_filleul_pack(uuid) from public;
revoke all on function public.activer_filleul_pack(uuid) from anon;
grant execute on function public.activer_filleul_pack(uuid) to authenticated;
