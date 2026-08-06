# today

A minimalist progressive web app for planning daily tasks on iPhone and in the browser.

## Features

- a dedicated lowercase `welcome to today` entry screen;
- local `log in` and `register` flows using name and password;
- salted password hashes for the local prototype, never plaintext passwords;
- isolated task storage for every local user;
- two views: today's tasks and all tasks;
- task creation, editing, completion, and deletion;
- date, time, and priority fields;
- filters for active and completed tasks;
- light and dark themes;
- installation on the iPhone Home Screen;
- basic offline support through a service worker.

The interface intentionally uses a restrained visual system, Apple system fonts, and lowercase typography.

## Run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## Current architecture

The deployed prototype is frontend-only. Local test accounts are stored in `localStorage`, passwords are salted and hashed with SHA-256 when Web Crypto is available, and tasks are stored under a user-specific key.

This is deliberately an intermediate architecture. It proves the account flow and user data separation without pretending that browser storage is a production authentication server.

## Planned Supabase architecture

- Supabase Auth will own credentials and sessions.
- `public.profiles` will store the visible username.
- `public.tasks` will store each user's tasks.
- PostgreSQL Row Level Security will prevent users from reading or changing another user's rows.

Detailed request examples and the data flow are documented in [`docs/supabase-architecture.md`](docs/supabase-architecture.md). The executable SQL schema is in [`supabase/schema.sql`](supabase/schema.sql).

## Repository structure

- `index.html` — welcome, login, and registration screen;
- `shell.html` — authenticated application shell;
- `app.html` — task tracker interface and client-side logic;
- `manifest.webmanifest` — PWA metadata;
- `sw.js` — offline cache;
- `supabase/schema.sql` — future PostgreSQL schema, triggers, and RLS policies;
- `docs/supabase-architecture.md` — future authentication and CRUD flow.

© 2026 Dmitrii Shchukin
