import { MessagesWorkspace } from "@/components/account/MessagesWorkspace";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <MessagesWorkspace>{children}</MessagesWorkspace>;
}
