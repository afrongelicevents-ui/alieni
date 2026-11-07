# Backups and restore

## What holds what
| Thing | Where | Backed up by |
|---|---|---|
| Code and history | GitHub | every clone; also `git bundle` (below) |
| Database (accounts, ads, chats, jobs …) | Supabase Postgres | Supabase's own daily backups (check the plan) **and** the weekly dump below |
| Uploaded files (photos, VOG documents, site media) | Supabase Storage | **not** in the dump: download them from Supabase → Storage when needed |
| Secrets (keys) | Vercel / password manager | keep a copy of the list in `REBUILD.md` §4 in a password manager |
| Text and settings edited in Admin | the database | the dump |

Check Supabase → Database → Backups to see what your plan includes; free plans have no point-in-time restore.

## Weekly backup workflow (switched OFF)
`.github/workflows/backup.yml` is ready but does nothing until you switch it on. It makes an **encrypted** dump of the
`public` and `auth` schemas and keeps it for 30 days as a workflow artifact.

**Important:** this repository is public today. Artifacts of public repositories can be downloaded by anyone signed in to
GitHub, so the dump is encrypted with a passphrase, and the workflow refuses to run on a public repository unless
`BACKUP_ALLOW_PUBLIC_REPO=yes` is set. Make the repository private first (recommended).

To switch it on (do this from a computer, it takes 10 minutes):
1. Make the repository private (Settings → General → Danger zone → Change visibility).
2. Settings → Secrets and variables → Actions → **Secrets**:
   - `SUPABASE_DB_URL`: Supabase → Project settings → Database → Connection string → *Session pooler* (URI, with the password filled in).
   - `BACKUP_PASSPHRASE`: a long random passphrase. Store it in a password manager. **Without it a backup cannot be opened.**
3. Settings → Secrets and variables → Actions → **Variables**: add `BACKUP_ENABLED` = `true`.
4. In `.github/workflows/backup.yml`, remove the `#` in front of the `schedule:` lines and commit.
5. Run it once by hand: Actions → "Weekly database backup" → Run workflow. Download the artifact and test the restore below.

To switch it off again: delete the variable `BACKUP_ENABLED`.

## Restore
*The dump → encrypt → decrypt → load steps were rehearsed on a scratch Postgres (all rows came back). They have not yet been run against a real Supabase project: rehearse once on a test project before relying on them. `pg_dump` prints a warning about circular foreign keys between `jobs` and `job_responses`; it is harmless because the load uses `session_replication_role=replica`.*

1. Create a new empty Supabase project and run the migrations (`REBUILD.md` §2). 
2. Download the artifact, unzip, then decrypt:
   `gpg --batch --pinentry-mode loopback --passphrase 'YOUR-PASSPHRASE' -d alieni-YYYY-MM-DD.sql.gz.gpg | gunzip > backup.sql`
3. The dump contains data only. Load it into the **new** project with the connection string of the new project:
   `PGOPTIONS='-c session_replication_role=replica' psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f backup.sql`
   (`session_replication_role=replica` stops sign-up triggers from creating duplicate profiles while the data loads.)
   Load into an empty project: the dump replaces nothing and will refuse rows that already exist.
4. Upload the storage files again if you downloaded them.
5. Sign in as the admin and check `/admin`.

## Code bundle
From a clone: `git bundle create alieni.bundle --all` makes one file with the whole history. Store it with the other backups.
