/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().split('T')[0],
  },
  async redirects() {
    return [
      {
        source: '/write',
        destination: '/refine',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
