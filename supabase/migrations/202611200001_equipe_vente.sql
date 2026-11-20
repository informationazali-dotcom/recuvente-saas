-- ============================================================================
--  Espace Équipe de vente (activité « Vente au comptant & à crédit »).
--  Trois profils : le responsable (owner/admin), le conseiller (rencontres,
--  visites du dépôt, négociation) et le représentant au bureau (fiches,
--  factures, crédits). Suivi des clients par étapes, missions attribuées,
--  comptes rendus, journal. Nouvelles tables uniquement.
-- ============================================================================

-- Le représentant au bureau (rôle « bureau ») gère les ventes et crédits au bureau.
create or replace function public.peut_gerer_credits(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'comptable', 'bureau')
  );
$$;

create or replace function public.est_membre_equipe(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.est_responsable_equipe(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- Fiche de chaque membre : nom affiché, fonction, numéro WhatsApp.
create table if not exists public.equipe_profils (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null,
  fonction text,
  tel text,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- Clients suivis par l'équipe, du premier message à la livraison.
create table if not exists public.equipe_prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  nom text not null,
  tel text,
  ville text,
  besoin text,
  groupe text,
  prix_annonce numeric check (prix_annonce is null or prix_annonce >= 0),
  prix_minimum numeric check (prix_minimum is null or prix_minimum >= 0),
  etape text not null default 'nouveau' check (etape in ('nouveau', 'visite', 'accord', 'paye', 'livre', 'perdu')),
  assigne_a uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists equipe_prospects_ws_idx on public.equipe_prospects(workspace_id, etape);

-- Missions confiées à un membre (visite du dépôt, rencontre, passage au bureau…).
create table if not exists public.equipe_missions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  prospect_id uuid references public.equipe_prospects(id) on delete set null,
  assigne_a uuid not null references auth.users(id) on delete cascade,
  type text not null default 'autre' check (type in ('visite', 'rencontre', 'bureau', 'appel', 'livraison', 'autre')),
  titre text not null,
  date_prevue timestamptz,
  lieu text,
  consignes text,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'faite', 'annulee')),
  resultat text check (resultat is null or resultat in ('decide', 'reflexion', 'perdu')),
  compte_rendu text,
  fait_le timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists equipe_missions_ws_idx on public.equipe_missions(workspace_id, statut, date_prevue);
create index if not exists equipe_missions_assigne_idx on public.equipe_missions(assigne_a, statut);

-- Journal : qui a fait quoi et quand.
create table if not exists public.equipe_journal (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  action text not null,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists equipe_journal_ws_idx on public.equipe_journal(workspace_id, created_at desc);

alter table public.equipe_profils enable row level security;
alter table public.equipe_prospects enable row level security;
alter table public.equipe_missions enable row level security;
alter table public.equipe_journal enable row level security;

drop policy if exists equipe_profils_lecture on public.equipe_profils;
drop policy if exists equipe_profils_ecriture on public.equipe_profils;
create policy equipe_profils_lecture on public.equipe_profils for select using (public.est_membre_equipe(workspace_id));
create policy equipe_profils_ecriture on public.equipe_profils for all
  using (public.est_responsable_equipe(workspace_id) or user_id = auth.uid())
  with check (public.est_membre_equipe(workspace_id) and (public.est_responsable_equipe(workspace_id) or user_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['equipe_prospects', 'equipe_missions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ajout', t);
    execute format('drop policy if exists %I on public.%I', t || '_maj', t);
    execute format('drop policy if exists %I on public.%I', t || '_suppr', t);
    execute format('create policy %I on public.%I for select using (public.est_responsable_equipe(workspace_id) or (assigne_a = auth.uid() and public.est_membre_equipe(workspace_id)))', t || '_lecture', t);
    execute format('create policy %I on public.%I for insert with check (public.est_responsable_equipe(workspace_id))', t || '_ajout', t);
    execute format('create policy %I on public.%I for update using (public.est_responsable_equipe(workspace_id) or (assigne_a = auth.uid() and public.est_membre_equipe(workspace_id))) with check (public.est_membre_equipe(workspace_id))', t || '_maj', t);
    execute format('create policy %I on public.%I for delete using (public.est_responsable_equipe(workspace_id))', t || '_suppr', t);
  end loop;
end $$;

drop policy if exists equipe_journal_lecture on public.equipe_journal;
drop policy if exists equipe_journal_ajout on public.equipe_journal;
create policy equipe_journal_lecture on public.equipe_journal for select using (public.est_responsable_equipe(workspace_id));
create policy equipe_journal_ajout on public.equipe_journal for insert with check (user_id = auth.uid() and public.est_membre_equipe(workspace_id));

-- Un membre qui n'est pas responsable ne peut changer que l'avancement et ses notes :
-- jamais les prix, l'attribution, ni la boutique.
create or replace function public.proteger_equipe_prospect()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.est_responsable_equipe(old.workspace_id) then
    new.workspace_id := old.workspace_id;
    new.nom := old.nom;
    new.tel := old.tel;
    new.prix_annonce := old.prix_annonce;
    new.prix_minimum := old.prix_minimum;
    new.assigne_a := old.assigne_a;
    new.created_by := old.created_by;
    if new.etape not in ('visite', 'accord', 'paye', 'livre', 'perdu', old.etape) then new.etape := old.etape; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists equipe_prospects_protection on public.equipe_prospects;
create trigger equipe_prospects_protection before update on public.equipe_prospects
  for each row execute function public.proteger_equipe_prospect();

create or replace function public.proteger_equipe_mission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.est_responsable_equipe(old.workspace_id) then
    new.workspace_id := old.workspace_id;
    new.prospect_id := old.prospect_id;
    new.assigne_a := old.assigne_a;
    new.type := old.type;
    new.titre := old.titre;
    new.date_prevue := old.date_prevue;
    new.lieu := old.lieu;
    new.consignes := old.consignes;
    new.created_by := old.created_by;
  end if;
  if new.statut = 'faite' and old.statut <> 'faite' then new.fait_le := now(); end if;
  return new;
end $$;
drop trigger if exists equipe_missions_protection on public.equipe_missions;
create trigger equipe_missions_protection before update on public.equipe_missions
  for each row execute function public.proteger_equipe_mission();

-- Une mission doit porter sur un client de la même boutique.
create or replace function public.verifier_coherence_mission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.prospect_id is not null and not exists (
    select 1 from public.equipe_prospects p where p.id = new.prospect_id and p.workspace_id = new.workspace_id
  ) then
    raise exception 'Client introuvable dans cette boutique';
  end if;
  return new;
end $$;
drop trigger if exists equipe_missions_coherence on public.equipe_missions;
create trigger equipe_missions_coherence before insert or update on public.equipe_missions
  for each row execute function public.verifier_coherence_mission();

-- Rôles des membres de l'équipe (visibles par tous les membres de la boutique).
create or replace function public.equipe_roles(ws uuid)
returns table (user_id uuid, role text) language sql stable security definer set search_path = public as $$
  select m.user_id, m.role from public.workspace_members m
  where m.workspace_id = ws and public.est_membre_equipe(ws);
$$;
grant execute on function public.equipe_roles(uuid) to authenticated;
