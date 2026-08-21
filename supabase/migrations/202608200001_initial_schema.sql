create extension if not exists pgcrypto;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_name text,
  source_type text not null default 'text',
  source_file_path text,
  original_text text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  sentence_id integer not null,
  word text not null,
  meaning text not null,
  source_sentence text not null,
  translation text not null,
  note text not null default '',
  status text not null default 'learning' check (status in ('learning', 'mastered')),
  review_count integer not null default 0,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  understood_sentence_ids integer[] not null default '{}',
  bookmarked_sentence_ids integer[] not null default '{}',
  sentence_notes jsonb not null default '{}',
  last_studied_at timestamptz not null default now(),
  unique (user_id, document_id)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  mode text not null,
  score integer not null,
  question_count integer not null,
  created_at timestamptz not null default now()
);

create index documents_user_created_idx on public.documents(user_id, created_at desc);
create index vocabulary_user_document_idx on public.vocabulary(user_id, document_id);

alter table public.documents enable row level security;
alter table public.vocabulary enable row level security;
alter table public.study_progress enable row level security;
alter table public.quiz_attempts enable row level security;

create policy "Users own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own vocabulary" on public.vocabulary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own progress" on public.study_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users own attempts" on public.quiz_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('source-files', 'source-files', false, 26214400)
on conflict (id) do nothing;

create policy "Users upload own source files" on storage.objects for insert to authenticated
with check (bucket_id = 'source-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users read own source files" on storage.objects for select to authenticated
using (bucket_id = 'source-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own source files" on storage.objects for delete to authenticated
using (bucket_id = 'source-files' and (storage.foldername(name))[1] = auth.uid()::text);
