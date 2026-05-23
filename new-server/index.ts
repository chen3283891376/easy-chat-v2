import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

type DBData = {
    variables: Record<string, any>;
    user_data: Record<string, {
        publicKey: string;
        encryptedPrivate: string;
    }>;
};

const db = new Low<DBData>(new JSONFile("db.json"), {
    variables: {},
    user_data: {},
});
await db.read();

const DEBUG = Bun.argv.includes("--debug");

function debugLog(req: Request, status: number, startTime: bigint) {
    if (!DEBUG) return;
    const method = req.method;
    const url = new URL(req.url);
    const path = url.pathname;
    const ip = (req as any).serverRequest?.socket?.remoteAddress || "127.0.0.1";
    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : status >= 300 ? "\x1b[36m" : "\x1b[32m";
    console.log(`[DEBUG] ${color}%s\x1b[0m | \x1b[90m%s\x1b[0m | %s | \x1b[94m%s\x1b[0m | %.2f ms`, status, ip, method.padEnd(6), path, duration);
}

function withDebugLog(handler: (req: Bun.BunRequest) => Promise<Response> | Response) {
    return async (req: Bun.BunRequest) => {
        const start = process.hrtime.bigint();
        let res: Response;
        try {
            res = await handler(req);
        } catch (err) {
            console.error("\x1b[31m[ERROR]\x1b[0m", err);
            res = new Response("Server Error", { status: 500 });
        }
        debugLog(req, res.status, start);
        return res;
    };
}

Bun.serve({
    port: 8080,
    routes: {
        "/new": {
            POST: withDebugLog(async (req) => {
                const { key, value } = await req.json() as { key: string; value: any };
                if (db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量已存在", data: [] });
                }
                db.data.variables[key] = value;
                await db.write();
                return Response.json({ status: "success", message: `云变量 ${key} 成功创建`, data: [] });
            })
        },

        "/set": {
            POST: withDebugLog(async (req) => {
                const { key, value } = await req.json() as { key: string; value: any };
                if (!db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量不存在", data: [] }, { status: 404 });
                }
                db.data.variables[key] = value;
                await db.write();
                return Response.json({ status: "success", message: `云变量 ${key} 已更新`, data: [] });
            })
        },

        "/get": {
            GET: withDebugLog((req) => {
                const key = new URL(req.url).searchParams.get("key");
                if (!key || !db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量未找到", data: [] }, { status: 404 });
                }
                return Response.json({ status: "success", message: "操作成功", data: db.data.variables[key] });
            })
        },

        "/append": {
            POST: withDebugLog(async (req) => {
                const { key, value } = await req.json() as { key: string; value: string };
                if (!db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量不存在", data: [] }, { status: 404 });
                }
                try {
                    const current = JSON.parse(db.data.variables[key] || "[]");
                    const append = JSON.parse(value || "[]");
                    const merged = [...current, ...append];
                    db.data.variables[key] = JSON.stringify(merged);
                    await db.write();
                    return Response.json({ status: "success", message: "增量追加完成" });
                } catch {
                    return Response.json({ status: "error", message: "数据格式错误" }, { status: 400 });
                }
            })
        },

        "/auth/register": {
            POST: withDebugLog(async (req) => {
                const { username, publicKey, encryptedPrivate } = await req.json() as { username: string; publicKey: string; encryptedPrivate: string };
                if (!username || !publicKey) return Response.json({ status: "error", message: "参数不全" });
                if (db.data.user_data[username]) return Response.json({ status: "error", message: "用户名已被注册" });
                db.data.user_data[username] = { publicKey, encryptedPrivate };
                await db.write();
                return Response.json({ status: "success", message: "注册完成" });
            })
        },

        "/auth/login": {
            POST: withDebugLog(async (req) => {
                const { username } = await req.json() as { username: string };
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "用户不存在" });
                return Response.json({ status: "success", data: user });
            })
        },

        "/user/publickey/:username": {
            GET: withDebugLog((req) => {
                const username = req.params.username;
                if (!username) return Response.json({ status: "error", message: "用户名不能为空" });
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" });
                return Response.json({ status: "success", message: "操作成功", data: user.publicKey });
            })
        },

        "/user/public-keys": {
            GET: withDebugLog(() => {
                const result: Record<string, string> = {};
                for (const uname in db.data.user_data) {
                    if (db.data.user_data[uname]?.publicKey) result[uname] = db.data.user_data[uname].publicKey;
                }
                return Response.json({ status: "success", data: result });
            })
        },
    },

    fetch(req) {
        return withDebugLog(() => new Response("Not Found", { status: 404 }))(req as Bun.BunRequest);
    }
});

console.log(`🚀 Server running at http://localhost:8080 (DEBUG=${DEBUG})`);
