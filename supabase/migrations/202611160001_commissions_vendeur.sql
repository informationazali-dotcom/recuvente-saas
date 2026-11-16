-- ============================================================================
--  Commissions du vendeur sur les ventes (crédit ou comptant).
--  Commission = prix de vente au client − prix du propriétaire.
--  Le propriétaire reverse la commission en plusieurs fois : on garde chaque
--  versement reçu et on calcule ce qui reste à recevoir.
--  Privé : chaque vendeur ne voit que SES commissions (user_id = auth.uid()).
-- ============================================================================

create table if not exists public.commissions_vendeur (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credit_id uuid not null references public.ventes_credit(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  prix_proprietaire numeric not null check (prix_proprietaire >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (credit_id, user_id)
);
create index if not exists commissions_vendeur_user_idx on public.commissions_vendeur(workspace_id, user_id);

create table if not exists public.versements_commission (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  commission_id uuid not null references public.commissions_vendeur(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  montant numeric not null check (montant > 0),
  date_versement date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists versements_commission_idx on public.versements_commission(commission_id);

alter table public.commissions_vendeur enable row level security;
alter table public.versements_commission enable row level security;

do $$
declare t text;
begin
  foreach t in array array['commissions_vendeur', 'versements_commission'] loop
    execute format('drop policy if exists %I on public.%I', t || '_proprio', t);
    execute format('create policy %I on public.%I for all using (user_id = auth.uid() and public.peut_gerer_credits(workspace_id)) with check (user_id = auth.uid() and public.peut_gerer_credits(workspace_id))', t || '_proprio', t);
  end loop;
end $$;

-- La commission doit porter sur une vente de la même boutique, et un versement sur une commission du même vendeur.
create or replace function public.verifier_coherence_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'commissions_vendeur' then
    if not exists (select 1 from public.ventes_credit v where v.id = new.credit_id and v.workspace_id = new.workspace_id) then
      raise exception 'Vente introuvable dans cette boutique';
    end if;
  else
    if not exists (select 1 from public.commissions_vendeur c where c.id = new.commission_id and c.workspace_id = new.workspace_id and c.user_id = new.user_id) then
      raise exception 'Commission introuvable';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists commissions_vendeur_coherence on public.commissions_vendeur;
create trigger commissions_vendeur_coherence before insert or update on public.commissions_vendeur
  for each row execute function public.verifier_coherence_commission();
drop trigger if exists versements_commission_coherence on public.versements_commission;
create trigger versements_commission_coherence before insert or update on public.versements_commission
  for each row execute function public.verifier_coherence_commission();
