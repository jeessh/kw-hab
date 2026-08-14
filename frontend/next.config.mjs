/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    return [
      // The feed moved to /. Links the agencies have already shared, and the
      // ?save= round trip through sign-in, still point at /events — a shared
      // link that 404s is worse than a redirect that outlives its usefulness.
      // Only the exact path: /events/{id} is still a real page.
      { source: "/events", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
