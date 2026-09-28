import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser } from "@/hooks/use-user";
import { ChatSurface } from "@/components/griot/chat-surface";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — GRIOT Mobile" },
      {
        name: "description",
        content: "A mesma conversa do Desktop, contigo no telemóvel. Voz, câmara e anexos.",
      },
      { property: "og:title", content: "Chat — GRIOT Mobile" },
      { property: "og:description", content: "A mesma conversa do Desktop, contigo no telemóvel." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { user } = useCurrentUser();
  const userId = user?.id || "anonymous";
  return <ChatSurface userId={userId} />;
}
