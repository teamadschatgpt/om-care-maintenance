import type { Metadata } from "next";
import "./globals.css";
import "./corporate.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "O&M CARE — ระบบบริหารงานแจ้งซ่อม",
  description: "ระบบแจ้งซ่อม อนุมัติ จัดซื้อ คลังอะไหล่ และรายงาน O&M ครบวงจร",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "O&M CARE — ระบบบริหารงานแจ้งซ่อม",
    description: "แจ้ง • อนุมัติ • ซ่อม • รายงาน ครบวงจร",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "O&M CARE" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
