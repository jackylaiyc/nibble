-- Nibble (寶貝小口) — initial schema
-- Owner-scoped tables gated by RLS (auth.uid() = owner_id).
-- Child-nested tables additionally restrict by child ownership.
-- Apply once against a fresh Supabase project named "nibble".

--
-- extensions & helpers
--
create extension if not exists "pgcrypto";

-- Generic "updated_at" trigger so tables keep timestamps fresh on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- children: one row per baby/toddler a caregiver is tracking
--
create table public.children (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dob date not null,
  sex text check (sex in ('male','female','other','prefer_not_to_say')),
  avatar text,
  feeding_style text not null default 'mixed' check (feeding_style in ('blw','puree','mixed')),
  allergens text[] not null default '{}',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index children_owner_idx on public.children(owner_id) where archived_at is null;
create trigger children_set_updated_at before update on public.children
  for each row execute function public.set_updated_at();

--
-- meals: plate-scan results, each linked to a child
-- items/totals stored as jsonb so Gemini output shape can evolve without migrations
--
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  eaten_at timestamptz not null default now(),
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snack','milk','other')),
  age_bucket_at_meal text not null check (age_bucket_at_meal in ('6-8mo','9-11mo','12-23mo','24-47mo','48mo+')),
  photo_url text,
  items jsonb not null default '[]'::jsonb,    -- FoodItem[]
  totals jsonb not null default '{}'::jsonb,   -- cached NutrientVector
  refused boolean not null default false,
  new_foods text[] not null default '{}',
  allergens_present text[] not null default '{}',
  notes text,
  source text not null default 'plate_scan' check (source in ('plate_scan','manual','chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_child_eaten_idx on public.meals(child_id, eaten_at desc);
create index meals_owner_idx on public.meals(owner_id);
create trigger meals_set_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

--
-- poops: Bristol-style stool log with color + red-flag surfacing in app code
--
create table public.poops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  bristol_type smallint check (bristol_type between 1 and 7),
  color text check (color in ('yellow','green','brown','black','red','white','other')),
  consistency text,
  notes text,
  photo_url text,
  created_at timestamptz not null default now()
);
create index poops_child_time_idx on public.poops(child_id, occurred_at desc);

--
-- sleeps: start/end with a wake-count tally for quick nights/naps overview
--
create table public.sleeps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  kind text not null default 'nap' check (kind in ('night','nap')),
  wake_count smallint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sleeps_child_started_idx on public.sleeps(child_id, started_at desc);
create trigger sleeps_set_updated_at before update on public.sleeps
  for each row execute function public.set_updated_at();

--
-- milestones: unlocks drive confetti + shareable cards
--
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  key text not null,              -- canonical slug, e.g. first_tooth
  achieved_on date not null,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (child_id, key)          -- a milestone is unlocked once per child
);
create index milestones_child_idx on public.milestones(child_id, achieved_on desc);

--
-- reactions: write-only audit log for suspected allergic reactions
--
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  food text not null,                     -- free-text food name
  allergen_key text,                      -- canonical allergen (maps to allergenRegistry)
  symptoms text[] not null default '{}',
  severity text not null check (severity in ('mild','moderate','severe')),
  notes text,
  created_at timestamptz not null default now()
);
create index reactions_child_idx on public.reactions(child_id, occurred_at desc);

--
-- growth_measurements: weight/height/head for WHO percentile plots
--
create table public.growth_measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2) check (weight_kg >= 0 and weight_kg < 80),
  height_cm numeric(5,2) check (height_cm >= 0 and height_cm < 200),
  head_circumference_cm numeric(5,2) check (head_circumference_cm >= 0 and head_circumference_cm < 70),
  notes text,
  created_at timestamptz not null default now()
);
create index growth_child_idx on public.growth_measurements(child_id, measured_on desc);

--
-- subscriptions: one active row per owner (Stripe-sourced)
--
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'free' check (status in (
    'free','trialing','active','past_due','canceled','incomplete','paused'
  )),
  tier text not null default 'free' check (tier in ('free','premium','family','founding')),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

--
-- affiliate_referrals: Rewardful attribution snapshots (owner paid us because of X)
--
create table public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  rewardful_referral_id text unique,
  affiliate_code text not null,
  affiliate_email text,
  first_touch_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now()
);
create index affiliate_referrals_owner_idx on public.affiliate_referrals(owner_id);

--
-- RLS: enable on every table and lock to owner_id = auth.uid().
-- Child-nested tables additionally require child ownership so a compromised
-- child_id can't reach another caregiver's data.
--
alter table public.children enable row level security;
alter table public.meals enable row level security;
alter table public.poops enable row level security;
alter table public.sleeps enable row level security;
alter table public.milestones enable row level security;
alter table public.reactions enable row level security;
alter table public.growth_measurements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.affiliate_referrals enable row level security;

-- children: straightforward owner check
create policy "children: owner can select" on public.children
  for select using (auth.uid() = owner_id);
create policy "children: owner can insert" on public.children
  for insert with check (auth.uid() = owner_id);
create policy "children: owner can update" on public.children
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "children: owner can delete" on public.children
  for delete using (auth.uid() = owner_id);

-- reusable macro body for child-nested tables: both owner_id match AND
-- child_id must be one this user owns.
-- (Policies are copy-pasted per table because Postgres has no policy templates.)

-- meals
create policy "meals: owner can select own child meals" on public.meals
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "meals: owner can insert own child meals" on public.meals
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "meals: owner can update own child meals" on public.meals
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "meals: owner can delete own child meals" on public.meals
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- poops
create policy "poops: owner can select own child poops" on public.poops
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "poops: owner can insert own child poops" on public.poops
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "poops: owner can update own child poops" on public.poops
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "poops: owner can delete own child poops" on public.poops
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- sleeps
create policy "sleeps: owner can select own child sleeps" on public.sleeps
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "sleeps: owner can insert own child sleeps" on public.sleeps
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "sleeps: owner can update own child sleeps" on public.sleeps
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "sleeps: owner can delete own child sleeps" on public.sleeps
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- milestones
create policy "milestones: owner can select own child milestones" on public.milestones
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "milestones: owner can insert own child milestones" on public.milestones
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "milestones: owner can update own child milestones" on public.milestones
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "milestones: owner can delete own child milestones" on public.milestones
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- reactions
create policy "reactions: owner can select own child reactions" on public.reactions
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "reactions: owner can insert own child reactions" on public.reactions
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "reactions: owner can update own child reactions" on public.reactions
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "reactions: owner can delete own child reactions" on public.reactions
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- growth_measurements
create policy "growth: owner can select own child growth" on public.growth_measurements
  for select using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "growth: owner can insert own child growth" on public.growth_measurements
  for insert with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "growth: owner can update own child growth" on public.growth_measurements
  for update using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  ) with check (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );
create policy "growth: owner can delete own child growth" on public.growth_measurements
  for delete using (
    auth.uid() = owner_id
    and child_id in (select id from public.children where owner_id = auth.uid())
  );

-- subscriptions: user can only read their own row; writes happen in webhook
-- with service role (bypasses RLS), so no insert/update/delete policies here.
create policy "subscriptions: owner can select own row" on public.subscriptions
  for select using (auth.uid() = owner_id);

-- affiliate_referrals: user can only read their own attribution; writes from
-- the webhook flow use service role.
create policy "affiliate_referrals: owner can select own rows" on public.affiliate_referrals
  for select using (auth.uid() = owner_id);
