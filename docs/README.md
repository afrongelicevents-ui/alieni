# Alieni documentation

| File | What it is |
|---|---|
| `REBUILD.md` | Rebuild the whole platform from scratch on new accounts (GitHub, Vercel, Supabase, Resend, Mollie). |
| `BACKUP.md` | What to back up, how, and how to restore. Includes the (switched-off) weekly backup workflow. |
| `ARCHITECTURE.md` | Map of the code and the database, so a new developer can find things. |
| `DECISIONS.md` | Decisions that shape the product and why. |
| `briefs/` | The planning documents the build follows. |
| `../DEVELOPMENT_STATUS.md` | What is built, what is verified, what is open, and DECISIONS FOR THE OWNER. |
| `../SECURITY.md` | Security model and review notes. |
| `../TEST_SUPABASE_SETUP.md` | Setting up a separate, empty test Supabase project. |
| `../e2e/README.md` | How the automatic tests run. |

The source code mentions "brief §…" in comments. That refers to the original product brief. It is not in the repository
yet: add it to `docs/briefs/` (see DECISIONS FOR ME in `DEVELOPMENT_STATUS.md`).
