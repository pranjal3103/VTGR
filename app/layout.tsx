import type { Metadata } from 'next'
import { Inter, PT_Serif } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const ptSerif = PT_Serif({
  variable: '--font-pt-serif',
  subsets: ['latin'],
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: 'Visa Sensei',
  description: 'B1/B2 visa interview coach',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${ptSerif.variable} h-full`}>
      <body className="min-h-full font-sans antialiased" style={{ backgroundColor: '#FAF7F2', color: '#2A2A2A' }}>
        {children}
      </body>
    </html>
  )
}
