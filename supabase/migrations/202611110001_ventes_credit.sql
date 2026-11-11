-- ============================================================================
--  Ventes à crédit (acompte + mensualités) et échéancier, avec rappels.
--  Nouvelles tables uniquement : aucune table existante n'est modifiée.
-- ============================================================================

create table if not exists public.ventes_credit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_nom text not null,
  client_tel text,
  client_adresse text,
  article text not null,
  prix_total numeric not null check (prix_total > 0),
  acompte numeric not null default 0 check (acompte >= 0),
  date_vente date not null default current_date,
  notes text,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'solde', 'annule')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ventes_credit_ws_idx on public.ventes_credit(workspace_id, statut);

create table if not exists public.echeances_credit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credit_id uuid not null references public.ventes_credit(id) on delete cascade,
  numero int not null,
  date_echeance date not null,
  montant_du numeric not null check (montant_du >= 0),
  montant_paye numeric not null default 0 check (montant_paye >= 0),
  dernier_rappel_le date,
  created_at timestamptz not null default now()
);
create index if not exists echeances_credit_ws_date_idx on public.echeances_credit(workspace_id, date_echeance);
create index if not exists echeances_credit_credit_idx on public.echeances_credit(credit_id);

create table if not exists public.paiements_credit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credit_id uuid not null references public.ventes_credit(id) on delete cascade,
  montant numeric not null check (montant > 0),
  date_paiement date not null default current_date,
  mode text,
  note text,
  type text not null default 'mensualite' check (type in ('acompte', 'mensualite')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists paiements_credit_credit_idx on public.paiements_credit(credit_id);

alter table public.ventes_credit enable row level security;
alter table public.echeances_credit enable row level security;
alter table public.paiements_credit enable row level security;

-- Même règle d'accès que les loyers : propriétaire, admin et comptable de la boutique.
create or replace function public.peut_gerer_credits(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'comptable')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array['ventes_credit', 'echeances_credit', 'paiements_credit'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ajout', t);
    execute format('drop policy if exists %I on public.%I', t || '_maj', t);
    execute format('drop policy if exists %I on public.%I', t || '_suppr', t);
    execute format('create policy %I on public.%I for select using (public.peut_gerer_credits(workspace_id))', t || '_lecture', t);
    execute format('create policy %I on public.%I for insert with check (public.peut_gerer_credits(workspace_id))', t || '_ajout', t);
    execute format('create policy %I on public.%I for update using (public.peut_gerer_credits(workspace_id)) with check (public.peut_gerer_credits(workspace_id))', t || '_maj', t);
    execute format('create policy %I on public.%I for delete using (public.peut_gerer_credits(workspace_id))', t || '_suppr', t);
  end loop;
end $$;

-- Une échéance doit appartenir au même espace que son crédit (empêche tout mélange entre boutiques).
create or replace function public.verifier_coherence_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ventes_credit v where v.id = new.credit_id and v.workspace_id = new.workspace_id) then
    raise exception 'Crédit introuvable dans cette boutique';
  end if;
  return new;
end $$;

drop trigger if exists echeances_credit_coherence on public.echeances_credit;
create trigger echeances_credit_coherence before insert or update on public.echeances_credit
  for each row execute function public.verifier_coherence_credit();
drop trigger if exists paiements_credit_coherence on public.paiements_credit;
create trigger paiements_credit_coherence before insert or update on public.paiements_credit
  for each row execute function public.verifier_coherence_credit();

-- Activité dédiée « Vente au comptant & à crédit » + ventes au comptant dans le même registre.
alter table public.workspaces drop constraint activity_type_valid;
alter table public.workspaces add constraint activity_type_valid check (activity_type = any (array['cod_ecommerce','retail','location_immobiliere','restaurant','location_vehicule','personnalise','network_marketing','vente_credit']));
alter table public.ventes_credit add column if not exists type_vente text not null default 'credit' check (type_vente in ('comptant','credit'));
alter table public.paiements_credit drop constraint if exists paiements_credit_type_check;
alter table public.paiements_credit add constraint paiements_credit_type_check check (type in ('acompte','mensualite','comptant'));

-- Répartition d'un paiement sur les mensualités (permet d'annuler un paiement saisi par erreur).
alter table public.paiements_credit add column if not exists repartition jsonb;
