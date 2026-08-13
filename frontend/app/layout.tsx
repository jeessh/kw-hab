import type { Metadata } from "next";
import { Lexend_Deca } from "next/font/google";
import { siteUrl } from "@/lib/serverApi";
import "./globals.css";

const lexend = Lexend_Deca({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // metadataBase is what makes per-page canonical and OG URLs resolve; without
  // it Next emits relative og:url, which link previews ignore.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "KW Community Compass",
    // Program pages supply their own name; this keeps the source visible in
    // search results and browser tabs without each page repeating it.
    template: "%s · KW Community Compass",
  },
  description: "Find community programs that fit you, all in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={lexend.variable}>
      <body>{children}</body>
    </html>
  );
}
