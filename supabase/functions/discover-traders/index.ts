// Minimal placeholder to unblock deployment.
// Replace with real logic (enqueue trader discovery) once recovered.

Deno.serve(async () => {
  return new Response(
    JSON.stringify({
      ok: false,
      status: 501,
      error: "discover-traders function missing in repo; placeholder deployed to unblock",
      next_step: "Recover/implement discover-traders to enqueue sync jobs for traders",
    }),
    { headers: { "Content-Type": "application/json" }, status: 501 }
  );
});
