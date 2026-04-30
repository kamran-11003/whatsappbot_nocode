import "./globals.css";
import "reactflow/dist/style.css";

export const metadata = {
  title: "WhatsApp Mate",
  description: "Build WhatsApp bots visually",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
