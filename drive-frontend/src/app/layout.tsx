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
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
