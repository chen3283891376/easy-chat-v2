import { db, type Data } from "../db";
import { fromHex, usedNonce, checkTimeWindow } from "../crypto";
import { withDebugLog } from "../middlewares";
import * as ed from "@noble/ed25519";

export const varRoutes = {
    "/new": {
        POST: withDebugLog(async (req) => {
            const { key, value, username, time, sig, nonce } = (await req.json()) as Data;

            if (!nonce || usedNonce.has(nonce)) {
                return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
            }
            if (!username || !time || !sig)
                return Response.json({ status: "error", message: "缺少签名认证" }, { status: 401 });

            const user = db.data.user_data[username];
            if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 401 });
            if (!checkTimeWindow(time))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${username}|${key}|${JSON.stringify(value)}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(user.publicKey));
            if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });
            usedNonce.add(nonce);

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
            if (!checkTimeWindow(time))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${username}|${key}|${JSON.stringify(value)}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(user.publicKey));
            if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });
            usedNonce.add(nonce);

            db.data.variables[key] = value;
            await db.write();
            return Response.json({ status: "success", message: `云变量 ${key} 已更新`, data: [] });
        }),
    },
    "/get": {
        GET: withDebugLog(async (req) => {
            const key = new URL(req.url).searchParams.get("key");
            const username = new URL(req.url).searchParams.get("username");
            if (!username) return Response.json({ status: "error", message: "缺少用户名", data: [] }, { status: 400 });
            const time = new URL(req.url).searchParams.get("time");
            const sig = new URL(req.url).searchParams.get("sig");
            const nonce = new URL(req.url).searchParams.get("nonce");
            if (!time || !sig || !nonce)
                return Response.json({ status: "error", message: "缺少签名认证", data: [] }, { status: 401 });

            const user = db.data.user_data[username];
            if (!user) return Response.json({ status: "error", message: "无此用户", data: [] }, { status: 401 });
            if (usedNonce.has(nonce))
                return Response.json({ status: "error", message: "请求重复或已过期", data: [] }, { status: 400 });
            if (!checkTimeWindow(time))
                return Response.json({ status: "error", message: "签名时间不在允许范围", data: [] }, { status: 400 });
            const payload = `${key}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(user.publicKey));
            if (!ok) return Response.json({ status: "error", message: "签名验证失败", data: [] }, { status: 401 });
            usedNonce.add(nonce);

            await db.read();
            if (!key || !db.data.variables[key]) {
                return Response.json({ status: "error", message: "云变量未找到", data: [] }, { status: 404 });
            }
            return Response.json({ status: "success", message: "操作成功", data: db.data.variables[key] });
        }),
    },
};
