# Noir

Noir is a public anime discovery site built with Next.js and powered by AniList.

## Features

- Trending-first homepage
- URL-based anime search
- Dedicated anime detail pages
- Server-side AniList integration
- Null-safe metadata normalization
- Production-ready Vercel deployment target
- Supabase auth/database scaffolding for saved anime and profiles

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` and add your Supabase keys when you are ready to enable auth and persistence.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Notes

- The app does not require authentication or a database yet.
- AniList requests are made server-side only.
- A custom domain can be attached later in Vercel without changing the app code.
