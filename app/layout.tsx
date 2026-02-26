import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AdSniper AI - Marketing Warfare",
  description: "Create Winning Ad Campaigns in Seconds with ROI-Focused AI.",
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Client-side debug for Clerk configuration
  if (typeof window !== 'undefined') {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      console.error("🚨 CLERK ERROR: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from client bundle!");
    } else {
      console.log("🌐 Clerk initialized with key type:", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live') ? 'LIVE' : 'TEST');
    }
  }

  return (
    <ClerkProvider fallbackRedirectUrl="/dashboard">
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
