import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn Helper MVP",
  description: "Сервис для изучающего чтения",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
      </head>
      <body>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" defer></script>
        {children}
      </body>
    </html>
  );
}
