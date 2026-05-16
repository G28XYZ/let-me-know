import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn Helper",
  description: "Сервис для подготовки учебных материалов через Markdown и mdBook",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        {children}
      </body>
    </html>
  );
}
