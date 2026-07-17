# today

A minimalist progressive web app for planning daily tasks on iPhone and in the browser.

## Features

- a dedicated `welcome to today` entry screen;
- two views: today's tasks and all tasks;
- task creation, editing, completion, and deletion;
- date, time, and priority fields;
- filters for active and completed tasks;
- light and dark themes;
- local persistence with `localStorage`;
- installation on the iPhone Home Screen;
- basic offline support through a service worker.

The interface intentionally uses a restrained visual system, Apple system fonts, and mostly lowercase typography.

## Run locally

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## Current architecture

The application is currently frontend-only. Tasks are stored locally in the browser, which keeps the prototype simple and makes it suitable for the next development stage: replacing the local storage layer with an HTTP client connected to a backend and database.

## Repository structure

- `start.html` — welcome screen and PWA entry point;
- `index.html` — complete task-tracker interface and client-side logic;
- `manifest.webmanifest` — PWA metadata;
- `sw.js` — offline cache;
- `icon.svg` — application icon.

© 2026 Dmitrii Shchukin
