import { DEBUG, withDebugLog } from "./src/middlewares";
import { varRoutes } from "./src/routes/var.routes";
import { authRoutes } from "./src/routes/auth.routes";
import { dmRoutes } from "./src/routes/dm.routes";

const allRoutes = {
    ...varRoutes,
    ...authRoutes,
    ...dmRoutes,
};

Bun.serve({
    port: 8080,
    routes: allRoutes,
    fetch(req) {
        return withDebugLog(() => new Response("Not Found", { status: 404 }))(req as Bun.BunRequest);
    },
});

console.log(`🚀 Server running at http://localhost:8080 (DEBUG=${DEBUG})`);
