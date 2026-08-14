-- Pagamentos PIX via MisticPay
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto capivaraonline).

create table if not exists public.purchases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  sku              text not null,
  credits          integer not null check (credits > 0),
  amount           numeric(10,2) not null check (amount > 0),
  status           text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'expired')),
  provider         text not null default 'misticpay',
  provider_state   text,
  payer_name       text,
  payer_document   text,
  copy_paste       text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);
create index if not exists purchases_pending_idx on public.purchases (status) where status = 'pending';

alter table public.purchases enable row level security;

-- O usuário enxerga as próprias compras; escrita é só via service key (backend).
drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select using (auth.uid() = user_id);

-- Credita uma compra de forma atômica e idempotente.
-- Retorna o saldo final, ou -1 (compra inexistente) / -2 (já creditada antes).
create or replace function public.credit_purchase(p_purchase_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_credits integer;
  v_status  text;
  v_saldo   integer;
begin
  select user_id, credits, status
    into v_user, v_credits, v_status
    from public.purchases
   where id = p_purchase_id
     for update;

  if not found then
    return -1;
  end if;

  -- Webhook pode chegar duplicado: crédito só acontece na primeira vez.
  if v_status = 'paid' then
    return -2;
  end if;

  update public.purchases
     set status = 'paid', paid_at = now()
   where id = p_purchase_id;

  insert into public.user_credits (user_id, credits_remaining, total_purchased)
       values (v_user, v_credits, v_credits)
  on conflict (user_id) do update
       set credits_remaining = public.user_credits.credits_remaining + v_credits,
           total_purchased   = coalesce(public.user_credits.total_purchased, 0) + v_credits,
           updated_at        = now();

  select credits_remaining into v_saldo
    from public.user_credits where user_id = v_user;

  return v_saldo;
end;
$$;

revoke all on function public.credit_purchase(uuid) from public, anon, authenticated;
