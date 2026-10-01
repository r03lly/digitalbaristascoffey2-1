import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/seed-staff")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const accounts = [
          { email: "admin@scoffey.id", password: "ScoffeyAdmin2026!", role: "admin" as const, name: "Admin" },
          { email: "barista@scoffey.id", password: "ScoffeyBarista2026!", role: "barista" as const, name: "Barista" },
        ];
        const out: string[] = [];
        for (const a of accounts) {
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: a.email, password: a.password, email_confirm: true,
            user_metadata: { display_name: a.name },
          });
          if (error || !data.user) { out.push(`${a.email}: ${error?.message}`); continue; }
          const { error: rErr } = await supabaseAdmin.from("user_roles")
            .upsert({ user_id: data.user.id, role: a.role }, { onConflict: "user_id,role" });
          out.push(`${a.email}: ok ${rErr?.message ?? ""}`);
        }
        return Response.json(out);
      },
    },
  },
});
