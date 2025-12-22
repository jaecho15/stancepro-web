# StancePro Website

The official website for StancePro - The Ultimate Snowboard & Ski Stance Calculator.

**Live URL:** https://stance-pro.com

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/stancepro-web.git
cd stancepro-web

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Project Structure

```
stancepro-web/
├── app/
│   ├── page.tsx           # Landing page
│   ├── features/          # Features showcase
│   ├── download/          # Download page with pricing
│   ├── support/           # FAQ and contact
│   ├── privacy/           # Privacy policy
│   └── terms/             # Terms of service
├── components/
│   ├── Header.tsx         # Navigation header
│   ├── Footer.tsx         # Site footer
│   ├── AppStoreButtons.tsx
│   ├── FeatureCard.tsx
│   ├── TestimonialCard.tsx
│   └── StatsSection.tsx
└── public/
    └── (images, icons)
```

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create stancepro-web --public --push
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Click Deploy

### 3. Connect Domain (Squarespace DNS)

In Vercel Dashboard → Settings → Domains, add `stance-pro.com`.

In Squarespace DNS, add:
- **A Record:** `@` → `76.76.21.21`
- **CNAME:** `www` → `cname.vercel-dns.com`

## Customization

### Update App Store Links

Edit `components/AppStoreButtons.tsx` and replace the placeholder URLs:

```tsx
href="https://apps.apple.com/app/stancepro/YOUR_APP_ID"
href="https://play.google.com/store/apps/details?id=com.stancepro"
```

### Add App Screenshots

1. Export screenshots from your app (1290x2796px for iPhone)
2. Place in `public/screenshots/`
3. Update the hero section in `app/page.tsx`

### Update Social Links

Edit `components/Footer.tsx` with your actual social media URLs.

### Customize Colors

Edit `tailwind.config.ts` to modify the brand colors:

```ts
colors: {
  brand: {
    500: '#0ea5e9', // Primary blue
    // ...
  }
}
```

## SEO

Metadata is configured in `app/layout.tsx`. Update:
- Title and description
- Open Graph image (`public/og-image.png`)
- Twitter card

## License

© StancePro. All rights reserved.







