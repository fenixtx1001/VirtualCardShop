import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import Providers from "./providers";
import { imageDeliveryPreconnectOrigin } from "@/lib/images/r2-cdn";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Virtual Card Shop",
  description: "Open packs. Build sets. Run your shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const imageOrigin = imageDeliveryPreconnectOrigin({
    originBaseUrl: process.env.NEXT_PUBLIC_VCS_R2_ORIGIN_BASE_URL,
    cdnBaseUrl: process.env.NEXT_PUBLIC_VCS_R2_CDN_BASE_URL,
  }, process.env.R2_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);

  return (
    <html lang="en">
      {imageOrigin ? <head><link rel="preconnect" href={imageOrigin} /></head> : null}
      <body
        className={`${geistSans.className} ${geistSans.variable} ${geistMono.variable}`}
      >
        <Providers>
          <AppHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}