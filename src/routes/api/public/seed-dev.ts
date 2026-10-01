import { createFileRoute } from "@tanstack/react-router";

// Temporary one-time developer setup. Removed after use.
export const Route = createFileRoute("/api/public/seed-dev")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: "mantapimo@gmail.com",
          password: "banjarbaru123",
          email_confirm: true,
          user_metadata: { display_name: "Developer" },
        });
        if (error || !data.user) return Response.json({ error: error?.message });
        const { error: e2 } = await supabaseAdmin.from("user_roles").upsert(
          [
            { user_id: data.user.id, role: "admin" },
            { user_id: data.user.id, role: "developer" as never },
          ],
          { onConflict: "user_id,role" },
        );
        return Response.json({ ok: true, e2: e2?.message });
      },
    },
  },
});
