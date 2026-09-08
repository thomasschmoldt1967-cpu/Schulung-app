-- VORBEREITET, NICHT AUSGEFÜHRT.
-- Mandatory training documentation, immutable completion records and BL counter-signatures.

create table if not exists public.schulung_bl_counter_signatures (
  id text primary key,
  formular_id text not null references public.formulare(id),
  bl_user_id text not null,
  bl_name text not null,
  signature_data text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_schulung_bl_counter_formular on public.schulung_bl_counter_signatures(formular_id, signed_at desc);

-- Counter-signatures are append-only: no update/delete, including for service-role callers
create or replace function public.reject_bl_counter_mutation() returns trigger language plpgsql as $$
begin raise exception 'BL-Gegenzeichnungen sind append-only und dürfen nicht geändert/gelöscht werden'; end;
$$;
drop trigger if exists trg_bl_counter_no_update on public.schulung_bl_counter_signatures;
create trigger trg_bl_counter_no_update before update or delete on public.schulung_bl_counter_signatures
for each row execute function public.reject_bl_counter_mutation();

-- Completed form data is immutable. Only backup metadata may be changed after completion.
create or replace function public.guard_completed_form_immutability() returns trigger language plpgsql as $$
begin
  if old.abgeschlossen is true and (
    new.felder is distinct from old.felder or new.abgeschlossen is distinct from old.abgeschlossen or
    new.abgeschlossen_am is distinct from old.abgeschlossen_am or new.abgeschlossen_von is distinct from old.abgeschlossen_von
  ) then raise exception 'Abgeschlossene Schulungsformulare sind unveränderlich'; end if;
  return new;
end;
$$;
drop trigger if exists trg_formulare_completed_immutable on public.formulare;
create trigger trg_formulare_completed_immutable before update on public.formulare
for each row execute function public.guard_completed_form_immutability();

-- Append-only snapshot of every completed form and every later metadata update.
create table if not exists public.schulung_form_backup_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  formular_id text not null,
  snapshot_kind text not null check (snapshot_kind in ('completion','backup_metadata')),
  felder jsonb not null,
  abgeschlossen_am timestamptz,
  abgeschlossen_von text,
  pdf_path text,
  pdf_backup_status text,
  pdf_backup_filename text,
  captured_at timestamptz not null default now()
);
create index if not exists idx_training_backup_snapshots_formular on public.schulung_form_backup_snapshots(formular_id, captured_at desc);

create or replace function public.snapshot_completed_training() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.abgeschlossen is true) or
     (tg_op = 'UPDATE' and old.abgeschlossen is distinct from new.abgeschlossen and new.abgeschlossen is true) then
    insert into public.schulung_form_backup_snapshots(formular_id,snapshot_kind,felder,abgeschlossen_am,abgeschlossen_von,pdf_path,pdf_backup_status,pdf_backup_filename)
    values (new.id,'completion',new.felder,new.abgeschlossen_am,new.abgeschlossen_von,new.pdf_path,new.pdf_backup_status,new.pdf_backup_filename);
  elsif tg_op = 'UPDATE' and old.abgeschlossen is true and (
    old.pdf_path is distinct from new.pdf_path or old.pdf_backup_status is distinct from new.pdf_backup_status or old.pdf_backup_filename is distinct from new.pdf_backup_filename
  ) then
    insert into public.schulung_form_backup_snapshots(formular_id,snapshot_kind,felder,abgeschlossen_am,abgeschlossen_von,pdf_path,pdf_backup_status,pdf_backup_filename)
    values (new.id,'backup_metadata',new.felder,new.abgeschlossen_am,new.abgeschlossen_von,new.pdf_path,new.pdf_backup_status,new.pdf_backup_filename);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_snapshot_completed_training on public.formulare;
create trigger trg_snapshot_completed_training after insert or update on public.formulare
for each row execute function public.snapshot_completed_training();

-- Snapshot rows are append-only too.
create or replace function public.reject_snapshot_mutation() returns trigger language plpgsql as $$
begin raise exception 'Backup-Snapshots sind append-only'; end;
$$;
drop trigger if exists trg_snapshot_no_update on public.schulung_form_backup_snapshots;
create trigger trg_snapshot_no_update before update or delete on public.schulung_form_backup_snapshots
for each row execute function public.reject_snapshot_mutation();

-- Run this migration in the Supabase SQL editor after review; this file intentionally does not execute it.
