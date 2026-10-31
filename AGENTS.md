<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep admin-managed attendance identities in `public.barista_names`, separate from login accounts; attendance stores the identity ID plus a name snapshot to support shared barista accounts without changing historical names.
- Attendance captures device-local dates and device timestamps on click; use the pure helpers in `src/lib/attendance.ts` and preserve overnight checkout.
