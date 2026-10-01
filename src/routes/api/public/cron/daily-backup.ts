import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Dipanggil terjadwal setiap 00:00 WIB/WITA untuk backup otomatis ke Google Drive.
export const Route = createFileRoute("/api/public/cron/daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const { createBackup } = await import("@/lib/develop.server");
          const r = await createBackup("auto");
          return Response.json({ ok: true, file: r.name });
        } catch (e) {
          console.error("daily backup failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
