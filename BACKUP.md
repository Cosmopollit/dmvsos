# Offline backup workflow

Why: GitHub/Supabase/Stripe/Vercel can lock your account, suffer outages, or be hijacked. An offline encrypted copy means worst case is a slow restore, not total loss.

## Run a backup

From the repo root:

```bash
node scripts/backup-all.js                # full: tables + auth + storage (~2.5 GB)
node scripts/backup-all.js --skip-storage # fast: just data, no PDFs (~220 MB)
```

Output lives in `backups/<timestamp>/`:
- `auth-users.json` — full auth.users dump
- `tables/<name>.json` — one file per public table
- `manuals/<state>/<file>.pdf` — official handbook PDFs
- `manifest.json` — backup metadata + row counts

Run from anywhere by setting `--out=/path`:
```bash
node scripts/backup-all.js --out=/Volumes/MyExternalDrive/dmvsos-backups
```

## Encrypt + ship to safety

After backup completes:

```bash
cd backups
tar czf 2026-05-15T2204.tar.gz 2026-05-15T2204
gpg --symmetric --cipher-algo AES256 2026-05-15T2204.tar.gz
```

You'll be prompted for a passphrase. Write it down somewhere physical (1Password, paper safe). If you lose it, the backup is unrecoverable.

After encryption you'll have `2026-05-15T2204.tar.gz.gpg`. The `.tar.gz` (unencrypted) can be deleted.

## Store in 3 places (3-2-1 rule)

1. **Local external drive** — physical drive, in a drawer
2. **Cloud archive** — Backblaze B2 ($6/year per TB), or iCloud Drive (5GB free), or rsync.net
3. **Optional: a second physical location** — second drive at home/office

The point: any one of these failing must not be catastrophic.

## Decrypt + restore

```bash
gpg --decrypt 2026-05-15T2204.tar.gz.gpg > 2026-05-15T2204.tar.gz
tar xzf 2026-05-15T2204.tar.gz
```

Files are now back to plain `backups/<timestamp>/`.

To restore into a fresh Supabase:
1. Create new Supabase project
2. Run all migrations from `/migrations`
3. Use `psql` or Supabase REST to import JSON files into tables
4. Upload PDFs from `manuals/` back into Supabase Storage `manuals/` bucket

Restore is not one-command — you'd be configuring a new project from scratch. That's fine as a disaster-recovery posture; you're not restoring daily.

## Cadence

- **Daily** if you want zero data loss tolerance (automate via cron)
- **Weekly** is enough if you can tolerate a week of lost user data
- **Before any risky DB migration** — always

Automated cron example (every day at 3am):

```cron
0 3 * * * cd /Users/cosmopollit/dmvsos && /usr/local/bin/node scripts/backup-all.js >> /tmp/dmvsos-backup.log 2>&1
```

Then a separate script that compresses + encrypts the new folder, ships to Backblaze, and deletes anything older than 14 days locally.

## What's NOT in the backup

- Stripe data (customers, payments, refunds). Stripe Dashboard has its own export; download monthly to CSV.
- Vercel deploy history (Vercel keeps these themselves; if account dies you have the source code which is the same as repo).
- GitHub repo — the script doesn't clone the repo into the backup because it's already in your local `~/dmvsos`. If you want belt-and-suspenders, add a step to clone the repo into the backup folder.

## Threat model this covers

- ✅ Supabase project deleted (you have full data dump)
- ✅ Stripe account closed (you have customer emails from auth.users + purchases.json)
- ✅ GitHub account suspended (you have source on your laptop)
- ✅ Your laptop dies (encrypted backup on external drive + cloud)
- ✅ Cloud storage compromised (encrypted, attacker needs passphrase)
- ✅ Ransomware on laptop (offline external drive copy)

## Threat model this does NOT cover

- Stolen Stripe API key being abused before you notice (rotate keys regularly)
- Compromised laptop with active sessions (separate problem, needs 2FA + key rotation)
- Domain name expiration (auto-renew + multi-year registration)
- Schema rollback (a destructive ALTER TABLE — keep migrations versioned in git, which we do)
