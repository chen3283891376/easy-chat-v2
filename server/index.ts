import { serve } from "bun";
import { generateUID } from "./src/ws/channel";
import { wsOpen, wsMessage, wsClose } from "./src/ws/handler";
import { DEBUG, withDebugLog } from "./src/middlewares";
import { varRoutes } from "./src/routes/var.routes";
import { authRoutes } from "./src/routes/auth.routes";
import { dmRoutes } from "./src/routes/dm.routes";

const allRoutes = {
    ...varRoutes,
    ...authRoutes,
    ...dmRoutes,
};

const PORT = 8080;

serve({
    port: PORT,
    routes: allRoutes,

    fetch(req, server) {
        const url = new URL(req.url);
        const wsMatch = url.pathname.match(/^\/c\/([^/]+)$/);
        if (wsMatch && wsMatch[1]) {
            const channelId = decodeURIComponent(wsMatch[1]);
            const params = url.searchParams;

            const alias = params.get("as") ?? params.get("alias") ?? undefined;
            const echo = params.get("echo") === "true";
            const announce = params.get("announce") !== "false";
            const list = params.get("list") !== "false";

            const ok = server.upgrade(req, {
                data: {
                    uid: generateUID(),
                    alias,
                    channelId,
                    echo,
                    announce,
                    list,
                },
            });
            if (ok) return undefined;
            return new Response("WS Upgrade failed", { status: 500 });
        }

        return withDebugLog(() => new Response("Not Found", { status: 404 }))(req as Bun.BunRequest);
    },

    websocket: {
        open: wsOpen,
        message: wsMessage,
        close: wsClose,
    },
});

console.log(`Server running on http://localhost:${PORT} (DEBUG=${DEBUG})`);
console.log(`WebSocket chat: ws://localhost:${PORT}/c/{channelId}`);
