/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "../db";
import { fromHex, usedNonce, checkTimeWindow } from "../crypto";
import { withDebugLog } from "../middlewares";
import * as ed from "@noble/ed25519";

export const dmRoutes = {
    "/dm/invite": {
        POST: withDebugLog(async (req) => {
            const { username, recipient, payload, ephemeral, time, sig, nonce } = (await req.json()) as {
                username: string;
                recipient: string;
                payload: string;
                ephemeral?: string;
                time: number;
                sig: string;
                nonce: string;
            };
            if (!nonce || usedNonce.has(nonce))
                return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
            if (!username || !recipient || !payload || !time || !sig)
                return Response.json({ status: "error", message: "参数不全" }, { status: 400 });

            const user = db.data.user_data[username];
            if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
            if (!checkTimeWindow(time, 60))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payloadToVerify = `${username}|${recipient}|${payload}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(
                fromHex(sig),
                new TextEncoder().encode(payloadToVerify),
                fromHex(user.publicKey),
            );
            if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });
            usedNonce.add(nonce);

            if (!db.data.dm_invitations[recipient]) db.data.dm_invitations[recipient] = [];
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
            if (!sig || !timestamp || !nonce)
                return Response.json({ status: "error", message: "缺少认证参数" }, { status: 401 });
            if (usedNonce.has(nonce))
                return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
            if (!checkTimeWindow(timestamp, 60))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payload = `${timestamp}|${nonce}`;
            return ed.verifyAsync(fromHex(sig), new TextEncoder().encode(payload), fromHex(pubKey)).then((valid) => {
                if (!valid) return Response.json({ status: "error", message: "认证失败" }, { status: 401 });
                usedNonce.add(nonce);
                const invites = db.data.dm_invitations[username] || [];
                const parsed = invites.map((v) => JSON.parse(v));
                return Response.json({ status: "success", data: parsed });
            });
        }),
    },
    "/dm/invite/respond": {
        POST: withDebugLog(async (req) => {
            const { username, inviter, response, roomId, time, sig, nonce } = (await req.json()) as {
                username: string;
                inviter: string;
                response: "accept" | "decline";
                roomId?: string;
                time: number;
                sig: string;
                nonce: string;
            };
            if (!nonce || usedNonce.has(nonce))
                return Response.json({ status: "error", message: "请求重复或已过期" }, { status: 400 });
            if (!username || !inviter || !response || !time || !sig)
                return Response.json({ status: "error", message: "参数不全" }, { status: 400 });

            const user = db.data.user_data[username];
            if (!user) return Response.json({ status: "error", message: "无此用户" }, { status: 404 });
            if (!checkTimeWindow(time, 60))
                return Response.json({ status: "error", message: "签名时间不在允许范围" }, { status: 400 });

            const payloadToVerify = `${username}|${inviter}|${response}|${roomId || ""}|${time}|${nonce}`;
            const ok = await ed.verifyAsync(
                fromHex(sig),
                new TextEncoder().encode(payloadToVerify),
                fromHex(user.publicKey),
            );
            if (!ok) return Response.json({ status: "error", message: "签名验证失败" }, { status: 401 });
            usedNonce.add(nonce);

            // 清理邀请
            const list = db.data.dm_invitations[username] || [];
            db.data.dm_invitations[username] = list.filter((item) => {
                try {
                    const parsed = JSON.parse(item);
                    return !(parsed.from === inviter);
                } catch {
                    return true;
                }
            });

            if (response === "accept") {
                if (!roomId) return Response.json({ status: "error", message: "缺少 roomId" }, { status: 400 });
                const inviterData = db.data.user_data[inviter];
                if (!inviterData) return Response.json({ status: "error", message: "邀请方不存在" }, { status: 404 });
                try {
                    const r1 = JSON.parse(inviterData.rooms || "[]");
                    const r2 = JSON.parse(user.rooms || "[]");
                    const roomObj = { id: roomId, name: `私聊: ${username}` };
                    if (!r1.some((r: any) => r.id === roomId)) r1.push(roomObj);
                    const roomObj2 = { id: roomId, name: `私聊: ${inviter}` };
                    if (!r2.some((r: any) => r.id === roomObj2.id)) r2.push(roomObj2);
                    inviterData.rooms = JSON.stringify(r1);
                    user.rooms = JSON.stringify(r2);

                    const notifyKey = `dm_notify_${inviter}`;
                    const existing = db.data.variables[notifyKey] ? JSON.parse(db.data.variables[notifyKey]) : [];
                    existing.push({
                        type: "invite_accepted",
                        from: username,
                        roomId,
                        time: Math.floor(Date.now() / 1000),
                    });
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
};
