import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Split Bill - Easy Receipt Splitting",
  description: "Split bills easily with friends using OCR receipt scanning. Upload a receipt, add participants, and calculate everyone's share automatically.",
  keywords: ["split bill", "receipt scanner", "OCR", "bill splitting", "expense sharing"],
  authors: [{ name: "Split Bill App" }],
  openGraph: {
    title: "Split Bill - Easy Receipt Splitting",
    description: "Split bills easily with friends using OCR receipt scanning.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Split Bill - Easy Receipt Splitting",
    description: "Split bills easily with friends using OCR receipt scanning.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
