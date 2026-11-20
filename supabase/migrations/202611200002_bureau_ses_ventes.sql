-- Le représentant au bureau (rôle « bureau ») ne voit que les ventes et crédits
-- qu'il a lui-même enregistrés. Le responsable (owner/admin) et le comptable voient tout.
-- Le conseiller (rôle « conseiller ») n'a toujours aucun accès aux ventes et crédits.

create or replace function public.voit_toutes_ventes(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'comptable')
  );
$$;

create or replace function public.voit_vente(ws uuid, auteur uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.voit_toutes_ventes(ws) or (public.peut_gerer_credits(ws) and auteur = auth.uid());
$$;

create or replace function public.voit_vente_id(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ventes_credit v where v.id = cid and public.voit_vente(v.workspace_id, v.created_by));
$$;

drop policy if exists ventes_credit_lecture on public.ventes_credit;
drop policy if exists ventes_credit_maj on public.ventes_credit;
drop policy if exists ventes_credit_suppr on public.ventes_credit;
create policy ventes_credit_lecture on public.ventes_credit for select using (public.voit_vente(workspace_id, created_by));
create policy ventes_credit_maj on public.ventes_credit for update using (public.voit_vente(workspace_id, created_by)) with check (public.peut_gerer_credits(workspace_id));
create policy ventes_credit_suppr on public.ventes_credit for delete using (public.voit_toutes_ventes(workspace_id));

do $$
declare t text;
begin
  foreach t in array array['echeances_credit', 'paiements_credit'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ajout', t);
    execute format('drop policy if exists %I on public.%I', t || '_maj', t);
    execute format('drop policy if exists %I on public.%I', t || '_suppr', t);
    execute format('create policy %I on public.%I for select using (public.peut_gerer_credits(workspace_id) and public.voit_vente_id(credit_id))', t || '_lecture', t);
    execute format('create policy %I on public.%I for insert with check (public.peut_gerer_credits(workspace_id) and public.voit_vente_id(credit_id))', t || '_ajout', t);
    execute format('create policy %I on public.%I for update using (public.peut_gerer_credits(workspace_id) and public.voit_vente_id(credit_id)) with check (public.peut_gerer_credits(workspace_id))', t || '_maj', t);
    execute format('create policy %I on public.%I for delete using (public.voit_toutes_ventes(workspace_id))', t || '_suppr', t);
  end loop;
end $$;

-- L'auteur d'une vente ne peut pas être changé, et il est toujours la personne connectée à la création.
create or replace function public.auteur_vente_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists ventes_credit_auteur on public.ventes_credit;
create trigger ventes_credit_auteur before insert or update on public.ventes_credit
  for each row execute function public.auteur_vente_credit();
