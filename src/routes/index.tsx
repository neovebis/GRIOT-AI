import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkTermsAccepted } from "@/components/griot/terms-dialog";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function checkAuthAndRedirect() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        // Se não houver sessão ativa, vai obrigatoriamente para o login real
        if (!data.session?.user) {
          void navigate({ to: "/auth", replace: true });
          return;
        }

        // Se autenticado mas ainda não aceitou termos, vai para /auth (onde os termos são requeridos)
        if (!checkTermsAccepted()) {
          void navigate({ to: "/auth", replace: true });
          return;
        }

        // Autenticado e termos aceites: entra na aplicação
        void navigate({ to: "/home", replace: true });
      } catch {
        if (active) {
          void navigate({ to: "/auth", replace: true });
        }
      }
    }

    void checkAuthAndRedirect();

    return () => {
      active = false;
    };
  }, [navigate]);

  return null;
}
