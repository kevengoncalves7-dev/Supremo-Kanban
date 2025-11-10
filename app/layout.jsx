export const metadata = {
  title: "Supremo Kanban",
  description: "Loja Supremo Açaí e Sorvetes - Kanban",
};

import '../globals.css';

/**
 * RootLayout injeta as variáveis públicas do Firebase (NEXT_PUBLIC_) no window.
 * Isso permite que o código do cliente inicialize o Firebase em tempo de execução.
 */
export default function RootLayout({ children }) {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID || "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  };
  return (
    <html lang="pt-BR">
      <body>
        {/* Exponha a configuração Firebase no objeto global */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__FIREBASE_CONFIG__ = ${JSON.stringify(cfg)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
