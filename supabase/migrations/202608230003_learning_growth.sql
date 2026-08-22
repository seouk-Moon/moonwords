-- MoonWords learning growth / streak / XP history
-- Safe for existing documents and vocabulary. No existing rows are deleted.

create extension if not exists pgcrypto;

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  word_id uuid references public.vocabulary(id) on delete set null,
  sentence_id integer,
  event_type text not null check (event_type in ('quiz_answer', 'sentence_studied', 'word_saved', 'document_completed')),
  quiz_mode text check (quiz_mode is null or quiz_mode in ('comprehension', 'meaning', 'flashcard', 'cloze', 'ordering')),
  is_correct boolean,
  xp integer not null default 0 check (xp >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  view text not null check (view in ('study', 'words', 'quiz')),
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0 check (active_seconds >= 0)
);

create index if not exists learning_events_user_created_idx
  on public.learning_events(user_id, created_at desc);
create index if not exists learning_events_user_type_created_idx
  on public.learning_events(user_id, event_type, created_at desc);
create index if not exists learning_sessions_user_started_idx
  on public.learning_sessions(user_id, started_at desc);

alter table public.learning_events enable row level security;
alter table public.learning_sessions enable row level security;

drop policy if exists "Users own learning events" on public.learning_events;
create policy "Users own learning events"
  on public.learning_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own learning sessions" on public.learning_sessions;
create policy "Users own learning sessions"
  on public.learning_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
