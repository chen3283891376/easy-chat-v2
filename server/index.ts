import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

function fromHex(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

type Data = { key: string; value: string; username: string; time: number; sig: string; nonce: string };

type DBData = {
    variables: Record<string, string>;
    user_data: Record<
        string,
        {
            publicKey: string;
            encryptedPrivate: string;
            rooms: string;
        }
    >;
};

const db = new Low<DBData>(new JSONFile("db.json"), {
    variables: {},
    user_data: {},
});
await db.read();

const usedNonce = new Set<string>();
setInterval(() => {
    usedNonce.clear();
}, 60 * 1000);

const DEBUG = Bun.argv.includes("--debug");

function debugLog(req: Bun.BunRequest, status: number, startTime: bigint) {
    if (!DEBUG) return;
    const method = req.method;
    const url = new URL(req.url);
    const path = url.pathname;
    const ip = "127.0.0.1";
    const duration = parseFloat((Number(process.hrtime.bigint() - startTime) / 1e6).toFixed(3));
    const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : status >= 300 ? "\x1b[36m" : "\x1b[32m";
    console.log(
        `[DEBUG] ${color}%s\x1b[0m | \x1b[90m%s\x1b[0m | %s | \x1b[94m%s\x1b[0m | ${duration.toFixed(3)} ms`,
        status,
        ip,
        method.padEnd(6),
        path,
    );
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
                const { key, value, username, time, sig, nonce } = (await req.json()) as Data;

                if (!nonce || usedNonce.has(nonce)) {
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                }

                if (username && time && sig) {
                    const user = db.data.user_data[username];
                    if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 401 });
                    const now = Math.floor(Date.now() / 1000);
                    if (Math.abs(now - time) > 10)
                        return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                    const payload = `${username}|${key}|${JSON.stringify(value)}|${time}|${nonce}`;
                    const ok = await ed.verifyAsync(
                        fromHex(sig),
                        new TextEncoder().encode(payload),
                        fromHex(user.publicKey),
                    );
                    if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                    usedNonce.add(nonce);
                } else {
                    return Response.json({ status: "error", message: "缺少签名认证" }, { status: 401 });
                }

                if (db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量已存在", data: [] });
                }
                db.data.variables[key] = value;
                await db.write();
                return Response.json({ status: "success", message: `云变量 ${key} 成功创建`, data: [] });
            }),
        },

        "/set": {
            POST: withDebugLog(async (req) => {
                const { key, value, username, time, sig, nonce } = (await req.json()) as Data;

                if (!nonce || usedNonce.has(nonce)) {
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                }

                if (!db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量不存在", data: [] }, { status: 404 });
                }
                if (!username || !time || !sig)
                    return Response.json({ status: "error", message: "缺少签名认证" }, { status: 401 });
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 401 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 10)
                    return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                const payload = `${username}|${key}|${JSON.stringify(value)}|${time}|${nonce}`;
                const ok = await ed.verifyAsync(
                    fromHex(sig),
                    new TextEncoder().encode(payload),
                    fromHex(user.publicKey),
                );
                if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                usedNonce.add(nonce);

                db.data.variables[key] = value;
                await db.write();
                return Response.json({ status: "success", message: `云变量 ${key} 已更新`, data: [] });
            }),
        },

        "/get": {
            GET: withDebugLog((req) => {
                const key = new URL(req.url).searchParams.get("key");
                if (!key || !db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量未找到", data: [] }, { status: 404 });
                }
                return Response.json({ status: "success", message: "操作成功", data: db.data.variables[key] });
            }),
        },

        "/append": {
            POST: withDebugLog(async (req) => {
                const { key, value, username, time, sig, nonce } = (await req.json()) as Data;

                if (!nonce || usedNonce.has(nonce)) {
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                }

                if (!db.data.variables[key]) {
                    return Response.json({ status: "error", message: "云变量不存在", data: [] }, { status: 404 });
                }
                if (!username || !time || !sig)
                    return Response.json({ status: "error", message: "缺少签名认证" }, { status: 401 });
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 401 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 10)
                    return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                const payload = `${username}|${key}|${value}|${time}|${nonce}`;
                const ok = await ed.verifyAsync(
                    fromHex(sig),
                    new TextEncoder().encode(payload),
                    fromHex(user.publicKey),
                );
                if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                usedNonce.add(nonce);

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
            }),
        },

        "/auth/register": {
            POST: withDebugLog(async (req) => {
                const { username, publicKey, encryptedPrivate } = (await req.json()) as {
                    username: string;
                    publicKey: string;
                    encryptedPrivate: string;
                };
                if (!username || !publicKey)
                    return Response.json({ status: "error", message: "参数不全" }, { status: 400 });
                if (username.includes("|"))
                    return Response.json({ status: "error", message: "用户名不能包含 | 字符" }, { status: 400 });
                if (db.data.user_data[username])
                    return Response.json({ status: "error", message: "用户名已被注册" }, { status: 400 });
                db.data.user_data[username] = {
                    publicKey,
                    encryptedPrivate,
                    rooms: '[{"id":"room_default","name":"默认房间"}]',
                };
                await db.write();
                return Response.json({ status: "success", message: "注册完成" }, { status: 200 });
            }),
        },

        "/auth/login": {
            POST: withDebugLog(async (req) => {
                const { username } = (await req.json()) as { username: string };
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "用户不存在" });
                return Response.json({ status: "success", data: user });
            }),
        },

        "/user/publickey/:username": {
            GET: withDebugLog((req) => {
                const username = req.params.username;
                if (!username) return Response.json({ status: "error", message: "用户名不能为空" });
                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" });
                return Response.json({ status: "success", message: "操作成功", data: user.publicKey });
            }),
        },

        "/user/public-keys": {
            GET: withDebugLog(() => {
                const result: Record<string, string> = {};
                for (const uname in db.data.user_data) {
                    if (db.data.user_data[uname]?.publicKey) result[uname] = db.data.user_data[uname].publicKey;
                }
                return Response.json({ status: "success", data: result });
            }),
        },

        "/user/name": {
            POST: withDebugLog(async (req) => {
                const { oldUsername, newUsername, sig, time, nonce } = (await req.json()) as {
                    oldUsername: string;
                    newUsername: string;
                    sig: string;
                    time: number;
                    nonce: string;
                };
                if (!oldUsername || !newUsername || !sig || !time || !nonce)
                    return Response.json({ status: "error", message: "缺少认证参数" }, { status: 401 });
                if (usedNonce.has(nonce))
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                usedNonce.add(nonce);

                const user = db.data.user_data[oldUsername];
                if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 10)
                    return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });
                const payload = `${oldUsername}|${newUsername}|${time}|${nonce}`;
                const ok = await ed.verifyAsync(
                    fromHex(sig),
                    new TextEncoder().encode(payload),
                    fromHex(user.publicKey),
                );
                if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                if (db.data.user_data[newUsername])
                    return Response.json({ status: "error", message: "新用户名已被占用" }, { status: 400 });
                db.data.user_data[newUsername] = user;
                delete db.data.user_data[oldUsername];
                await db.write();
                return Response.json({ status: "success", message: "用户名修改成功" }, { status: 200 });
            }),
        },

        "/auth/rooms/:username": {
            GET: withDebugLog(async (req) => {
                // Accept sig/timestamp/nonce from either route params or query string for robustness
                const username = req.params.username;
                if (!username) return Response.json({ status: "error", message: "用户名不能为空" });

                const url = new URL(req.url);
                const sig = req.params.sig || url.searchParams.get("sig");
                const timestamp = req.params.timestamp || url.searchParams.get("timestamp");
                const nonce = req.params.nonce || url.searchParams.get("nonce");

                const pubKey = db.data.user_data[username]?.publicKey;
                if (!pubKey) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                if (!sig || !timestamp || !nonce)
                    return Response.json({ status: "error", message: "缺少认证参数" }, { status: 401 });
                if (usedNonce.has(nonce))
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                usedNonce.add(nonce);
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - parseInt(timestamp)) > 10)
                    return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });
                const payload = `${timestamp}|${nonce}`;
                const isValid = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey));
                if (!isValid) {
                    if (DEBUG)
                        console.error("[AUTH] rooms GET signature mismatch", {
                            username,
                            sig,
                            timestamp,
                            nonce,
                            payload,
                        });
                    return Response.json({ status: "error", message: "认证失败" }, { status: 401 });
                }

                if (!db.data.user_data[username])
                    return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                const rooms = db.data.user_data[username]?.rooms;
                return Response.json({ status: "success", data: rooms });
            }),
            POST: withDebugLog(async (req) => {
                const { username, sig, timestamp, nonce, newRooms } = (await req.json()) as {
                    username: string;
                    sig: string;
                    timestamp: string;
                    nonce: string;
                    newRooms: string;
                };
                if (!username) return Response.json({ status: "error", message: "用户名不能为空" });
                if (!newRooms) return Response.json({ status: "error", message: "房间名不能为空" });

                const pubKey = db.data.user_data[username]?.publicKey;
                if (!pubKey) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                if (!sig || !timestamp || !nonce)
                    return Response.json({ status: "error", message: "缺少认证参数" }, { status: 401 });
                if (usedNonce.has(nonce))
                    return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                usedNonce.add(nonce);
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - parseInt(timestamp)) > 10)
                    return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });
                const payload = `${newRooms}|${timestamp}|${nonce}`;
                const isValid = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey));
                if (!isValid) return Response.json({ status: "error", message: "认证失败" }, { status: 401 });

                if (!db.data.user_data[username])
                    return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                db.data.user_data[username].rooms = newRooms;
                return Response.json({ status: "success", message: "操作成功" });
            }),
        },
    },

    fetch(req) {
        return withDebugLog(() => new Response("Not Found", { status: 404 }))(req as Bun.BunRequest);
    },
});

console.log(`🚀 Server running at http://localhost:8080 (DEBUG=${DEBUG})`);
