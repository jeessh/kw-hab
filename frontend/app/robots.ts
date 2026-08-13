import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/serverApi";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Staff console and the sign-up wizard have nothing to index, and a
      // crawler following them just burns budget.
      disallow: ["/host", "/host/", "/signup"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
