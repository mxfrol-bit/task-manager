import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Task Manager',
  description: 'Умный менеджер задач с Telegram ботом',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
