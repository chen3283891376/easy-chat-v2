import { db } from "../db";
import { fromHex, usedNonce, checkTimeWindow } from "../crypto";
import { withDebugLog, DEBUG } from "../middlewares";
import * as ed from "@noble/ed25519";

export const authRoutes = {
    "/auth/register": {
        POST: withDebugLog(async (req) => {
            const { username, publicKey, encryptedPrivate, avatarUrl } = (await req.json()) as {
                username: string;
                publicKey: string;
                encryptedPrivate: string;
                avatarUrl: string;
            };
            if (!username || !publicKey || !avatarUrl)
                return Response.json({ status: "error", message: "参数不全" }, { status: 400 });
            if (username.includes("|"))
                return Response.json({ status: "error", message: "用户名不能包含 | 字符" }, { status: 400 });
            if (db.data.user_data[username])
                return Response.json({ status: "error", message: "用户名已被注册" }, { status: 400 });
            db.data.user_data[username] = {
                publicKey,
                encryptedPrivate,
                rooms: '[{"id":"room_default","name":"默认房间"}]',
                avatarUrl,
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
    "/user/avatars": {
        GET: withDebugLog(() => {
            const result: Record<string, string> = {};
            for (const uname in db.data.user_data) {
                if (db.data.user_data[uname]?.avatarUrl) result[uname] = db.data.user_data[uname].avatarUrl;
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

            const user = db.data.user_data[oldUsername];
            if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
            if (!checkTimeWindow(time))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${oldUsername}|${newUsername}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(user.publicKey));
            if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });

            if (db.data.user_data[newUsername])
                return Response.json({ status: "error", message: "新用户名已被占用" }, { status: 400 });
            db.data.user_data[newUsername] = user;
            delete db.data.user_data[oldUsername];
            usedNonce.add(nonce);
            await db.write();
            return Response.json({ status: "success", message: "用户名修改成功" }, { status: 200 });
        }),
    },
    "/auth/rooms/:username": {
        GET: withDebugLog(async (req) => {
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
            if (!checkTimeWindow(timestamp))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${timestamp}|${nonce}`;
            const isValid = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey));
            if (!isValid) {
                if (DEBUG)
                    console.error("[AUTH] rooms GET signature mismatch", { username, sig, timestamp, nonce, payload });
                return Response.json({ status: "error", message: "认证失败" }, { status: 401 });
            }
            usedNonce.add(nonce);
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
            if (!checkTimeWindow(timestamp))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${newRooms}|${timestamp}|${nonce}`;
            const isValid = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey));
            if (!isValid) return Response.json({ status: "error", message: "认证失败" }, { status: 401 });
            usedNonce.add(nonce);

            if (!db.data.user_data[username])
                return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
            db.data.user_data[username].rooms = newRooms;
            await db.write();
            return Response.json({ status: "success", message: "操作成功" });
        }),
    },
};
