# Lexicard

Swipe to learn words, idioms and phrases. Tap a card to see what it means, how to use it
at work, with friends and in writing, and where it comes from — with an honest
"Well recorded / Likely / Myth check" tag on every origin story.

Built with Expo (React Native + React Native Web), Expo Router, Reanimated and
Gesture Handler. Ships as an installable, offline-capable PWA on GitHub Pages.

## Run it

```sh
npm install
npm run web            # dev server
```

Keyboard on web: `←` still learning · `→` know it · `Space` flip · `Enter` details · `Z` undo.

## Content

All cards live in JSON under `src/data/decks/` — one file per deck. The schema is
`src/lib/types.ts`. To add a deck, drop a JSON file there and add it to
`src/data/index.ts`, then run:

```sh
npm run check:decks    # validates every card (ids, 3 uses, highlights, origin)
```

Card ids are the slug of the term, so review history survives edits to a card.

## Spaced repetition

Leitner boxes 1–5 with intervals of 1, 2, 4, 8 and 16 days. Swipe right moves a card
up a box; swipe left sends it back to box 1 and replays it once at the end of the
session. Progress is stored on the device (localStorage on web).

## Build & deploy

```sh
BASE_URL=/lexicard npm run build:web   # expo export + PWA post-processing into dist/
BASE_URL=/lexicard npm run preview:web # serve dist like GitHub Pages at localhost:4173/lexicard/
```

`scripts/pwa.mjs` adds the web manifest, a service worker that precaches the whole
build, `404.html` for deep links, and `.nojekyll`.

GitHub Pages: push to `main`, then in **Settings → Pages** set **Source** to
**GitHub Actions**. `.github/workflows/deploy.yml` builds with
`BASE_URL=/<repo-name>` and publishes `dist/`. The site appears at
`https://<user>.github.io/<repo-name>/`.
