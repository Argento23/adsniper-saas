import type { Metadata } from "next";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";

export const metadata: Metadata = {
  title: "AdSíntesis AI - Marketing Warfare",
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
      console.error("ðŸš¨ CLERK ERROR: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from client bundle!");
    } else {
      console.log("ðŸŒ Clerk initialized with key type:", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live') ? 'LIVE' : 'TEST');
    }
  }

  return (
    <ClerkProvider signInFallbackRedirectUrl="/dashboard">
      <html lang="en" suppressHydrationWarning>
        <body
          className={`antialiased bg-background text-foreground`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

