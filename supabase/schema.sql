-- Ejecuta este archivo en el SQL Editor de tu proyecto Supabase.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price integer not null check (price >= 0),
  image_url text,
  status text not null default 'active' check (status in ('draft', 'active', 'sold_out')),
  inventory integer not null default 0 check (inventory >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price integer,
  inventory integer not null default 0 check (inventory >= 0)
);

-- Base para los módulos del panel de administración.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  total integer not null default 0 check (total >= 0),
  payment_method text,
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0)
);
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text not null default '',
  seo_title text,
  seo_description text,
  published boolean not null default false
);
create table if not exists public.store_settings (
  id boolean primary key default true check (id),
  name text not null default 'Tienda Base',
  contact_email text,
  contact_phone text,
  hero_title text,
  hero_description text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.pages enable row level security;
alter table public.store_settings enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create policy "profiles can be read by their owner" on public.profiles for select using (auth.uid() = id);
create policy "catalog is public" on public.categories for select using (true);
create policy "products are public" on public.products for select using (status = 'active');
create policy "variants are public" on public.product_variants for select using (true);
create policy "admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage variants" on public.product_variants for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read their orders" on public.orders for select using (auth.uid() = customer_id);
create policy "customers read their order items" on public.order_items for select using (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.customer_id = auth.uid()));
create policy "published pages are public" on public.pages for select using (published);
create policy "admins manage orders" on public.orders for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage order items" on public.order_items for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage pages" on public.pages for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage store settings" on public.store_settings for all using (public.is_admin()) with check (public.is_admin());

-- Tras crear el primer usuario, asígnale la función de administración:
-- insert into public.profiles (id, role) values ('UUID_DEL_USUARIO', 'admin') on conflict (id) do update set role = 'admin';
