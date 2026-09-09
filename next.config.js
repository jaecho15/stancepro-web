/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['ryiitcblrrqvjvxkobpf.supabase.co'],
  },
  // The 3D terrain route assembles resort3d.html + vendored libs at request
  // time via fs — make sure Vercel's function bundle includes them.
  outputFileTracingIncludes: {
    '/resort-3d/[resortId]/view': ['./resort3d-assets/**'],
  },
  // Partner mockups are standalone static documents under public/partners (kept
  // out of every function bundle on purpose). The rewrite gives them a clean,
  // extensionless URL; public/ is matched first, so /partners/camp3.html still
  // resolves directly and never re-enters this rule.
  async rewrites() {
    return [
      { source: '/partners/camp3', destination: '/partners/camp3.html' },
    ];
  },
  // Partner decks are shared by link only — never index them.
  async headers() {
    return [
      {
        source: '/partners/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;







