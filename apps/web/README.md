This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Stitch MCP Integration

This workspace includes a Stitch pull script to import generated HTML from your Stitch project.

1. Add Stitch credentials in `apps/web/.env.local`:

```bash
STITCH_API_KEY=your_stitch_api_key
STITCH_PROJECT_ID=your_project_id
STITCH_SCREEN_ID=your_screen_id
```

The pull script automatically loads `.env.local` when present.

If you only have `STITCH_API_KEY`, discover IDs first:

```bash
npm run stitch:discover
```

This prints all accessible project and screen IDs so you can copy values into:
`STITCH_PROJECT_ID` and `STITCH_SCREEN_ID`.

2. Pull the screen HTML into the dashboard folder:

```bash
npm run stitch:pull
```

By default this writes to `src/app/dashboard/stitch-generated.html`.

Optional output override:

```bash
STITCH_OUTPUT_PATH=src/app/dashboard/landing-v2.html npm run stitch:pull
```

After pulling, map the exported markup into React components under `src/components` and keep only layout/content patterns from Stitch (do not ship raw generated HTML directly).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
