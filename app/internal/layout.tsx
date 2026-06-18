import { InternalAuthProvider } from "@/components/internal/InternalAuthProvider";

export default function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <InternalAuthProvider>{children}</InternalAuthProvider>;
}
