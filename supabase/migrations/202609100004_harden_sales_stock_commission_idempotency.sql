-- Harden sales/stock/commission idempotency without replacing existing business flows.

create unique index if not exists idx_filleuls_comm_commande_filleul_produit
on public.filleuls_commissions (workspace_id, commande_id, filleul_id, produit_id)
where commande_id is not null;

create or replace function public.enregistrer_vente_stock_filleul(
  p_workspace_id uuid,
  p_filleul_id uuid,
  p_produit_id uuid,
  p_quantite integer,
  p_prix_vente_unitaire numeric,
  p_note text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_est_le_filleul boolean;
  v_parrain_id uuid;
  v_prix_acquisition_moyen numeric;
  v_commission_leader_type text;
  v_commission_leader_valeur numeric;
  v_montant_vente numeric;
  v_marge numeric;
  v_montant_leader numeric := 0;
  v_commission_id uuid;
  v_cle_mouvement text;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Une clé d''idempotence est obligatoire pour enregistrer une vente';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'Quantité invalide';
  end if;
  if p_prix_vente_unitaire is null or p_prix_vente_unitaire < 0 then
    raise exception 'Prix de vente invalide';
  end if;

  select id into v_commission_id
  from filleuls_commissions
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key
  limit 1;
  if v_commission_id is not null then return v_commission_id; end if;

  select wm.role into v_role from workspace_members wm
  where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid();

  select exists(select 1 from filleuls f where f.id = p_filleul_id and f.workspace_id = p_workspace_id
    and (f.user_id = auth.uid() or lower(f.email) = lower(auth.jwt() ->> 'email'))) into v_est_le_filleul;

  if v_role not in ('owner','admin') and not v_est_le_filleul then
    raise exception 'Action non autorisée';
  end if;

  perform 1 from filleuls f where f.id = p_filleul_id and f.workspace_id = p_workspace_id
    and coalesce(f.statut, 'actif') not in ('suspendu','inactive','inactif');
  if not found then raise exception 'Filleul invalide ou suspendu'; end if;

  select parrain_id into v_parrain_id from filleuls where id = p_filleul_id and workspace_id = p_workspace_id;
  select prix_acquisition_moyen into v_prix_acquisition_moyen
  from filleuls_stock where workspace_id = p_workspace_id and filleul_id = p_filleul_id and produit_id = p_produit_id for update;
  select commission_leader_type, commission_leader_valeur into v_commission_leader_type, v_commission_leader_valeur
  from produits where id = p_produit_id;

  v_cle_mouvement := p_idempotency_key || ':mouvement';
  perform public.enregistrer_mouvement_stock_filleul(p_workspace_id,p_filleul_id,p_produit_id,'vente',p_quantite,p_prix_vente_unitaire,null,p_note,v_cle_mouvement);

  v_montant_vente := p_prix_vente_unitaire * p_quantite;
  v_marge := v_montant_vente - (coalesce(v_prix_acquisition_moyen,0) * p_quantite);

  if v_parrain_id is not null and v_commission_leader_type is not null and v_commission_leader_valeur is not null then
    v_montant_leader := case when v_commission_leader_type = 'pourcentage'
      then round(v_montant_vente * v_commission_leader_valeur / 100,2)
      else v_commission_leader_valeur * p_quantite end;
  end if;

  insert into filleuls_commissions (workspace_id,filleul_id,commande_id,produit_id,montant_base,type_commission,
    taux_ou_montant,montant_commission,statut,eligible_at,source,leader_id,montant_commission_leader,
    prix_acquisition_snapshot,marge_snapshot,idempotency_key)
  values (p_workspace_id,p_filleul_id,null,p_produit_id,v_montant_vente,'montant_fixe',v_marge,v_marge,
    'validated',now(),'vente_stock',v_parrain_id,v_montant_leader,v_prix_acquisition_moyen,v_marge,p_idempotency_key)
  on conflict (workspace_id,idempotency_key) where idempotency_key is not null do nothing
  returning id into v_commission_id;

  if v_commission_id is null then
    select id into v_commission_id from filleuls_commissions
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key limit 1;
  end if;
  return v_commission_id;
end;
$function$;

revoke all on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) from public;
revoke all on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) from anon;
grant execute on function public.enregistrer_vente_stock_filleul(uuid,uuid,uuid,integer,numeric,text,text) to authenticated;
