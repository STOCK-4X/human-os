-- Apple Health inbox: short-lived, encrypted deliveries from the iOS Shortcut.
-- Payloads are AES-256-GCM encrypted by the server before insert; the database
-- never sees plaintext health data. Rows are deleted when the app imports them
-- (and after 30 days regardless).
--
-- RLS is enabled with NO policies: anon/authenticated clients can't touch it;
-- only the server (service role) can.

create extension if not exists "pgcrypto";

create table if not exists health_inbox (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  payload_encrypted text not null
);

alter table health_inbox enable row level security;
create index if not exists health_inbox_received_at on health_inbox (received_at);
