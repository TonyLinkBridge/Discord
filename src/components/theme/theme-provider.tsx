"use client";

import { ThemeProvider } from "next-themes";

export function RayNameThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey="rayname-theme"
    >
      {children}
    </ThemeProvider>
  );
}
