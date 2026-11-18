# 脱稿 Offbook

Phone-first PWA for listening and speaking practice. Chinese UI, no account. Scene text and pre-rendered audio live in `public/content/`.

**Live:** https://jay-12201018.github.io/offbook/

The site is a GitHub Pages project site, so Vite `base` is `/offbook/`. Content fetches, icons, iOS splash images, the web manifest (`start_url` / `scope`), and the service worker all use that path. Audio and splash images stay out of the precache; heard audio is cached at runtime.

## Develop

```bash
npm ci
npm run dev
```

Open http://localhost:5173/offbook/ . `npm run build` then `npm run preview` serves the production build at http://localhost:4173/offbook/ .

## Deploy

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml): `npm ci && npm run build`, then `actions/upload-pages-artifact` and `actions/deploy-pages`. Pages must use **GitHub Actions** as the build source.
