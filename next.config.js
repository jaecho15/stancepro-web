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
};

module.exports = nextConfig;







