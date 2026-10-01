-- RecuVente — commerce numérique (couche additive, aucun changement aux tables existantes)
create extension if not exists pgcrypto;

create table if not exists public.digital_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  product_type text not null default 'file' check (product_type in ('file','ebook','course','video','audio','bundle','license','coaching','subscription')),
  price numeric(14,2) not null default 0 check (price >= 0),
  currency text not null default 'XOF',
  cover_url text,
  published boolean not null default false,
  access_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, slug)
);

create table if not exists public.digital_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  description text not null default '',
  video_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.digital_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  amount numeric(14,2) not null,
  currency text not null default 'XOF',
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  payment_method text,
  payment_reference text,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_digital_products_workspace on public.digital_products(workspace_id);
create index if not exists idx_digital_products_published on public.digital_products(workspace_id, published);
create index if not exists idx_digital_files_product on public.digital_files(product_id);
create index if not exists idx_digital_lessons_product on public.digital_lessons(product_id, position);
create index if not exists idx_digital_orders_workspace on public.digital_orders(workspace_id, created_at desc);
create index if not exists idx_digital_orders_token on public.digital_orders(access_token);

alter table public.digital_products enable row level security;
alter table public.digital_files enable row level security;
alter table public.digital_lessons enable row level security;
alter table public.digital_orders enable row level security;

drop policy if exists digital_products_public_read on public.digital_products;
create policy digital_products_public_read on public.digital_products
for select using (published = true);

drop policy if exists digital_products_owner_all on public.digital_products;
create policy digital_products_owner_all on public.digital_products
for all using (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
);

drop policy if exists digital_files_owner_all on public.digital_files;
create policy digital_files_owner_all on public.digital_files
for all using (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
);

drop policy if exists digital_lessons_public_read on public.digital_lessons;
create policy digital_lessons_public_read on public.digital_lessons
for select using (
  exists (select 1 from public.digital_products p where p.id = product_id and p.published = true)
);

drop policy if exists digital_lessons_owner_all on public.digital_lessons;
create policy digital_lessons_owner_all on public.digital_lessons
for all using (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
);

drop policy if exists digital_orders_public_insert on public.digital_orders;
create policy digital_orders_public_insert on public.digital_orders
for insert with check (
  exists (select 1 from public.digital_products p where p.id = product_id and p.workspace_id = workspace_id and p.published = true)
  and amount = (select p.price from public.digital_products p where p.id = product_id)
  and currency = (select p.currency from public.digital_products p where p.id = product_id)
);

drop policy if exists digital_orders_owner_read on public.digital_orders;
create policy digital_orders_owner_read on public.digital_orders
for select using (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
);

drop policy if exists digital_orders_owner_update on public.digital_orders;
create policy digital_orders_owner_update on public.digital_orders
for update using (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('digital-products', 'digital-products', false)
on conflict (id) do nothing;

drop policy if exists digital_storage_owner_insert on storage.objects;
create policy digital_storage_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'digital-products'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = split_part(name, '/', 1)
    and w.owner_id = auth.uid()
  )
);

drop policy if exists digital_storage_owner_select on storage.objects;
create policy digital_storage_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'digital-products'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = split_part(name, '/', 1)
    and w.owner_id = auth.uid()
  )
);

drop policy if exists digital_storage_owner_delete on storage.objects;
create policy digital_storage_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'digital-products'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = split_part(name, '/', 1)
    and w.owner_id = auth.uid()
  )
);

-- Important : les fichiers numériques restent privés. Les clients passent par l'Edge Function
-- digital-download qui vérifie access_token + statut payé avant de créer une URL signée.
