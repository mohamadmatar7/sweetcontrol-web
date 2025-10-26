import "./globals.css";

export const metadata = {
  title: "SweetControl",
  description: "Real-time sugar control dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning={true}
        className="min-h-screen bg-gray-50 text-gray-900 font-sans"
      >
        <main className="mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
