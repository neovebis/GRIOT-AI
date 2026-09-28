import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-user";
import { bootstrapWorkspace } from "@/lib/bootstrap";
import { TabBar } from "@/components/griot/tab-bar";
import { TermsDialog, checkTermsAccepted } from "@/components/griot/terms-dialog";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useCurrentUser();
  const navigate = useNavigate();
  const [termsAccepted, setTermsAccepted] = useState(() => checkTermsAccepted());

  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/auth", replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user?.id && user.id !== "anonymous") {
      void bootstrapWorkspace(user.id).catch(() => null);
    }
  }, [user?.id]);

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {!termsAccepted && (
        <TermsDialog
          forceOpen
          allowDismiss={false}
          onClose={() => setTermsAccepted(true)}
        />
      )}
      <Outlet />
      <TabBar />
    </>
  );
}
