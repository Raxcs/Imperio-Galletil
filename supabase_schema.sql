-- DATABASE SCHEMA IN ENGLISH FOR SUPABASE
-- Project: Imperio Galletil

-- Drop old spanish tables if they exist
drop table if exists insumos cascade;
drop table if exists deudas cascade;
drop table if exists produccion cascade;

-- 1. Table: ingredients
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  presentation text not null,
  category text[] not null,
  price_usd numeric(10,2) not null,
  price_ves numeric(10,2) not null,
  created_at timestamp with time zone default now()
);

-- 2. Table: debts (accounts receivable)
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(10,2) not null,
  debt_date date not null default current_date,
  note text,
  paid boolean not null default false,
  paid_date date,
  created_at timestamp with time zone default now()
);

-- 3. Table: production_logs
create table if not exists production_logs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty integer not null,
  price_ves numeric(10,2) not null,
  cost_ves numeric(10,2) not null,
  created_at timestamp with time zone default now()
);

-- 4. Table: recipes
create table if not exists recipes (
  id text primary key,
  title text not null,
  subtitle text,
  batch_yield integer not null,
  batch_cost_usd numeric(10,2) not null,
  pack_cost_usd numeric(10,2) not null,
  process text not null,
  ingredients jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now()
);

-- 5. Seed initial ingredients
insert into ingredients (name, presentation, category, price_usd, price_ves) values
('Harina de trigo', 'Paquete de 1 kg', array['cookies', 'brownies'], 1.06, 928.24),
('Mantequilla', 'Empaque de 200g', array['cookies', 'brownies'], 1.50, 1313.55),
('Huevos', 'Medio carton de 15 unidades', array['cookies', 'brownies'], 3.54, 3100.00),
('Chispas de chocolate', 'Bolsa para 2 tandas', array['cookies'], 5.00, 4378.51),
('Crema de chocolate', 'Envase comercial', array['cookies', 'brownies'], 6.00, 5254.21),
('Vainilla', 'Frasco de esencia', array['cookies', 'brownies'], 2.50, 2189.25),
('Azucar', 'Paquete de 1 kg', array['cookies', 'brownies'], 1.50, 1313.55),
('Bolsas de empaque', 'Paquete de 100 bolsas', array['packaging'], 3.00, 2627.10);

-- 6. Seed initial debts
insert into debts (name, amount, debt_date, note, paid) values
('Maria Fernandez', 1700.00, current_date - interval '4 days', '2 packs de galletas clasicas (paga por pago movil)', false),
('Carlos Mendoza', 2500.00, current_date - interval '2 days', '1 pack de brownie con galleta, dijo que el lunes', false),
('Alejandro Ruiz', 500.00, current_date - interval '1 day', 'Le faltaban 500 Bs en efectivo del pack', false),
('Pedro Ramirez', 1200.00, current_date - interval '9 days', 'Cobrado completo por transferencia', true);

-- 7. Seed initial recipes
insert into recipes (id, title, subtitle, batch_yield, batch_cost_usd, pack_cost_usd, process, ingredients) values
('cookies', 'Galletas Clasicas', 'Receta tradicional y costeo exacto por tanda', 23, 7.54, 0.33,
'1. Batir la mantequilla con el azucar hasta obtener una consistencia cremosa y suave.
2. Incorporar el huevo y la esencia de vainilla, integrando bien a velocidad media.
3. Tamizar la harina de trigo e integrarla con movimientos suaves sin amasar en exceso.
4. Añadir las chispas de chocolate y formar bolitas uniformes para cada galleta.
5. Colocar en bandeja y hornear a 180 grados durante 12 a 15 minutos hasta dorar bordes.
6. Dejar reposar en rejilla hasta enfriar por completo y colocar en bolsas de empaque.',
'[
  {"name": "Harina de trigo", "amount": "1 kg", "price_ves": 928.24, "price_usd": 1.06},
  {"name": "Mantequilla", "amount": "1 empaque", "price_ves": 1313.55, "price_usd": 1.50},
  {"name": "Chispas de chocolate", "amount": "Mitad paquete", "price_ves": 2189.25, "price_usd": 2.50},
  {"name": "Crema de chocolate", "amount": "1 porcion", "price_ves": 525.42, "price_usd": 0.60},
  {"name": "Vainilla", "amount": "1 porcion", "price_ves": 218.93, "price_usd": 0.25},
  {"name": "Azucar", "amount": "1 tercio paquete", "price_ves": 437.85, "price_usd": 0.50},
  {"name": "Huevos", "amount": "1 unidad", "price_ves": 206.67, "price_usd": 0.24},
  {"name": "Bolsas de empaque", "amount": "23 bolsas", "price_ves": 604.23, "price_usd": 0.69}
]'::jsonb),
('brownies', 'Brownie con Galleta', 'Receta especial y costeo exacto por tanda', 8, 9.11, 1.14,
'1. Derretir la mantequilla y mezclarla en tibio con el cacao en polvo y el azucar.
2. Incorporar los huevos uno a uno batiendo suavemente para conservar la densidad.
3. Agregar la mezcla base con espatula y verter en el molde preparado.
4. Colocar la capa de masa de galleta en la superficie de manera uniforme.
5. Hornear a 175 grados durante 25 minutos manteniendo el centro suave y humedo.
6. Dejar enfriar a temperatura ambiente, cortar en porciones y guardar en empaques individuales con cuchara.',
'[
  {"name": "Masa base de galleta", "amount": "Mezcla base", "price_ves": 0, "price_usd": 0},
  {"name": "Cacao en polvo", "amount": "100 gramos", "price_ves": 2189.25, "price_usd": 2.50},
  {"name": "Mantequilla extra", "amount": "1 empaque", "price_ves": 1313.55, "price_usd": 1.50},
  {"name": "Azucar", "amount": "1 tercio paquete", "price_ves": 437.85, "price_usd": 0.50},
  {"name": "Huevos frescos", "amount": "6 unidades", "price_ves": 1240.00, "price_usd": 1.42},
  {"name": "Empaques individuales", "amount": "8 empaques", "price_ves": 1795.65, "price_usd": 2.05},
  {"name": "Cucharas plasticas", "amount": "8 unidades", "price_ves": 1000.00, "price_usd": 1.14}
]'::jsonb);

-- 8. Enable Row Level Security (RLS) and public access policies
alter table ingredients enable row level security;
alter table debts enable row level security;
alter table production_logs enable row level security;
alter table recipes enable row level security;

create policy "Allow all on ingredients" on ingredients for all using (true) with check (true);
create policy "Allow all on debts" on debts for all using (true) with check (true);
create policy "Allow all on production_logs" on production_logs for all using (true) with check (true);
create policy "Allow all on recipes" on recipes for all using (true) with check (true);
