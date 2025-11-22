import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'HK Mobility Data',
  description: 'Insights on Hong Kong cross-boundary and transport flows'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900">
        <header className="border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-semibold">HK Mobility Data</h1>
              <p className="text-sm text-slate-600">Cross-boundary and city transport insights</p>
            </div>
            <nav className="flex gap-3 text-sm text-slate-700">
              <a className="rounded px-3 py-1 hover:bg-slate-100 hover:text-slate-900" href="/dashboard">
                Cross-border
              </a>
              <a className="rounded px-3 py-1 hover:bg-slate-100 hover:text-slate-900" href="/transport">
                Transport
              </a>
              <a className="rounded px-3 py-1 hover:bg-slate-100 hover:text-slate-900" href="/parking">
                Parking
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
