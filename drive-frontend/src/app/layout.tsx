import type { Metadata } from "next";
import { ToastProvider } from "../components/Toast"; // Import ToastProvider
import "./globals.css";

export const metadata: Metadata = {
  title: "BenzDrive - Secure Cloud Storage",
  description: "A premium, secure cloud storage platform featuring custom directories, soft-delete recovery, and 2FA protection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
