import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Veyro Live — Your agent, your limits", description: "Tell it what you want. Set the limits. Let it work.", icons: { icon: "/icon.svg" } };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
