-- MoonWords document folders
create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.documents
  add column if not exists folder_id uuid references public.document_folders(id) on delete set null;

create index if not exists document_folders_user_created_idx
  on public.document_folders(user_id, created_at asc);
create index if not exists documents_user_folder_idx
  on public.documents(user_id, folder_id, created_at desc);

alter table public.document_folders enable row level security;

drop policy if exists "Users own document folders" on public.document_folders;
create policy "Users own document folders"
  on public.document_folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
