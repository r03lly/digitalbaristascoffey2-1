import { createFileRoute } from "@tanstack/react-router";

// Dipanggil terjadwal setiap 00:00 (UTC+8) untuk backup otomatis ke Google Drive.
export const Route = createFileRoute("/api/public/cron/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("internal_tokens" as never)
          .select("token")
          .eq("name", "daily_backup")
          .maybeSingle();
        const expected = (data as { token?: string } | null)?.token;
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const h = (v: string) => createHash("sha256").update(v).digest();
        if (!expected || !timingSafeEqual(h(token), h(expected))) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { createBackup } = await import("@/lib/develop.server");
          const r = await createBackup("auto");
          return Response.json({ ok: true, file: r.name });
        } catch (e) {
          console.error("daily backup failed", e);
          return Response.json({ ok: false, error: "backup failed" }, { status: 500 });
        }
      },
    },
  },
});
