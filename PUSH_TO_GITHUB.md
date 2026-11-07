# 🚀 Push this repo to GitHub (3 commands) + go live

This folder already contains a clean git history. You only need to create an
empty repo on github.com and point this copy at it.

> Time: ~5 minutes. You need a free GitHub account and git installed
> (`git --version` should print something).

---

## 1. Create the empty repo on github.com

1. Go to **https://github.com/new** (make sure you are logged in).
2. Repository name: `check-in` (or anything you like).
3. Leave it **Public** (required for free GitHub Pages) — or Private if you
   prefer, and upgrade Pages later.
4. **Do NOT** tick "Add a README", ".gitignore" or "license" — this repo
   already has all three. An empty repo avoids push conflicts.
5. Click **Create repository**.

## 2. Push (the 3 commands)

From inside this `check-in/` folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/check-in.git
git branch -M main
git push -u origin main
```

(Replace `YOUR_USERNAME`.) GitHub will pop up a login window the first time —
sign in with your browser. Done: your full commit history is on GitHub.

## 3. Publish the playable web demo (GitHub Pages)

1. On the repo page: **Settings → Pages** (left sidebar).
2. "Build and deployment" → **Source: Deploy from a branch**.
3. Branch: **main** / folder: **/ (root)** → **Save**.
4. Wait 1–2 minutes, then open `https://YOUR_USERNAME.github.io/check-in/`
   — the game runs exactly like the local double-click version.

That link is what you paste into the proposal and share with judges.

## 4. Invite your developer friend

Repo page → **Settings → Collaborators → Add people** → enter their GitHub
username → they accept the email invite. They then clone with:

```bash
git clone https://github.com/YOUR_USERNAME/check-in.git
```

## Optional: put your own name on the commits

The history was authored as `Check In <check-in-game@users.noreply.github.com>`.
To stamp your team's identity instead, run this from the repo root **before**
pushing:

```bash
git filter-branch -f --env-filter '
  export GIT_AUTHOR_NAME="Your Name"
  export GIT_AUTHOR_EMAIL="you@example.com"
  export GIT_COMMITTER_NAME="Your Name"
  export GIT_COMMITTER_EMAIL="you@example.com"
' -- --all
```

(Or just leave it — nobody minds, and it is one command to change later.)

## Troubleshooting

| Problem | Fix |
|---|---|
| `remote origin already exists` | `git remote set-url origin https://github.com/YOUR_USERNAME/check-in.git` |
| Push asks for a password | That is normal — GitHub needs browser auth. If it fails, install **GitHub CLI** (`gh auth login`) or use a Personal Access Token (Settings → Developer settings → Tokens). |
| Pages shows 404 | Wait 2 minutes, hard-refresh. Check Settings → Pages shows the green "Your site is live" banner. |
| Emojis look plain on Windows | Install/enable a colour emoji font (Segoe UI Emoji ships with Windows 10+ and works in Edge/Chrome). |
| Changed something, want to update the site | `git add -A && git commit -m "describe change" && git push` — Pages redeploys automatically. |

---

**Checklist before the proposal deadline (17 Nov 2026):**

- [ ] Repo pushed (step 2)
- [ ] Pages live (step 3) — test the link in an incognito window
- [ ] Collaborator invited (step 4)
- [ ] Paste the live link into the 300–500-word proposal
