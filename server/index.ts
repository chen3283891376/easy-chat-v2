/* eslint-disable @typescript-eslint/no-explicit-any */
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
    // key is canonical conversation id (sorted "alice|bob"), value is JSON string array of messages
    private_messages: Record<string, string>;
    // invitations per recipient username: array of JSON string { from, payload(encrypted), time, nonce }
    dm_invitations: Record<string, string[]>;
};

const db = new Low<DBData>(new JSONFile("db.json"), {
    variables: {},
    user_data: {},
    private_messages: {},
    dm_invitations: {},
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

        "/dm/invite": {
            POST: withDebugLog(async (req) => {
                const { username, recipient, payload, ephemeral, time, sig, nonce } = (await req.json()) as {
                    username: string;
                    recipient: string;
                    payload: string; // encrypted payload
                    ephemeral?: string;
                    time: number;
                    sig: string;
                    nonce: string;
                };

                if (!nonce || usedNonce.has(nonce)) return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                if (!username || !recipient || !payload || !time || !sig) return Response.json({ status: "error", message: "参数不全" }, { status: 400 });

                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 60) return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                const payloadToVerify = `${username}|${recipient}|${payload}|${time}|${nonce}`;
                const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payloadToVerify), fromHex(user.publicKey));
                if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                usedNonce.add(nonce);

                if (!db.data.dm_invitations[recipient]) db.data.dm_invitations[recipient] = [];
                // store ephemeral public key (if present)
                db.data.dm_invitations[recipient].push(JSON.stringify({ from: username, payload, ephemeral, time, nonce }));
                await db.write();
                return Response.json({ status: "success", message: "邀请已发送" });
            }),
        },

        "/dm/invites/:username": {
            GET: withDebugLog((req) => {
                const username = req.params.username;
                if (!username) return Response.json({ status: "error", message: "用户名不能为空" }, { status: 400 });

                const url = new URL(req.url);
                const sig = req.params.sig || url.searchParams.get("sig");
                const timestamp = req.params.timestamp || url.searchParams.get("timestamp");
                const nonce = req.params.nonce || url.searchParams.get("nonce");

                const pubKey = db.data.user_data[username]?.publicKey;
                if (!pubKey) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                if (!sig || !timestamp || !nonce) return Response.json({ status: "error", message: "缺少认证参数" }, { status: 401 });
                if (usedNonce.has(nonce)) return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - parseInt(timestamp)) > 60) return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                const payload = `${timestamp}|${nonce}`;
                return ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey)).then(valid => {
                    if (!valid) return Response.json({ status: "error", message: "认证失败" }, { status: 401 });
                    usedNonce.add(nonce);
                    const invites = db.data.dm_invitations[username] || [];
                    // return parsed invites
                    const parsed = invites.map(v => JSON.parse(v));
                    return Response.json({ status: "success", data: parsed });
                });
            }),
        },

        "/dm/invite/respond": {
            POST: withDebugLog(async (req) => {
                const { username, inviter, response, roomId, time, sig, nonce } = (await req.json()) as {
                    username: string; // responder (recipient)
                    inviter: string;
                    response: 'accept' | 'decline';
                    roomId?: string; // required when accept
                    time: number;
                    sig: string;
                    nonce: string;
                };

                if (!nonce || usedNonce.has(nonce)) return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
                if (!username || !inviter || !response || !time || !sig) return Response.json({ status: "error", message: "参数不全" }, { status: 400 });

                const user = db.data.user_data[username];
                if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
                const now = Math.floor(Date.now() / 1000);
                if (Math.abs(now - time) > 60) return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

                const payloadToVerify = `${username}|${inviter}|${response}|${roomId || ''}|${time}|${nonce}`;
                const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payloadToVerify), fromHex(user.publicKey));
                if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

                usedNonce.add(nonce);

                // remove invite from list
                const list = db.data.dm_invitations[username] || [];
                db.data.dm_invitations[username] = list.filter(item => {
                    try {
                        const parsed = JSON.parse(item);
                        return !(parsed.from === inviter);
                    } catch {
                        return true;
                    }
                });

                if (response === 'accept') {
                    if (!roomId) return Response.json({ status: "error", message: "缺少 roomId" }, { status: 400 });
                    const inviterData = db.data.user_data[inviter];
                    if (!inviterData) return Response.json({ status: "error", message: "邀请方不存在" }, { status: 404 });
                    try {
                        const r1 = JSON.parse(inviterData.rooms || '[]');
                        const r2 = JSON.parse(user.rooms || '[]');
                        const roomObj = { id: roomId, name: `私聊：${username}` };
                        if (!r1.some((r: any) => r.id === roomId)) r1.push(roomObj);
                        const roomObj2 = { id: roomId, name: `私聊：${inviter}` };
                        if (!r2.some((r: any) => r.id === roomId)) r2.push(roomObj2);
                        inviterData.rooms = JSON.stringify(r1);
                        user.rooms = JSON.stringify(r2);
                        const notifyKey = `dm_notify_${inviter}`;
                        const existing = db.data.variables[notifyKey] ? JSON.parse(db.data.variables[notifyKey]) : [];
                        existing.push({ type: 'invite_accepted', from: username, roomId, time: Math.floor(Date.now() / 1000) });
                        db.data.variables[notifyKey] = JSON.stringify(existing);
                        await db.write();
                        return Response.json({ status: "success", message: "已接受邀请", roomId });
                    } catch {
                        return Response.json({ status: "error", message: "更新房间失败" }, { status: 500 });
                    }
                }

                await db.write();
                return Response.json({ status: "success", message: "已拒绝邀请" });
            }),
        },
    },

    fetch(req) {
        return withDebugLog(() => new Response("Not Found", { status: 404 }))(req as Bun.BunRequest);
    },
});

console.log(`🚀 Server running at http://localhost:8080 (DEBUG=${DEBUG})`);
