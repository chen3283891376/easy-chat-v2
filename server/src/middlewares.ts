export const DEBUG = Bun.argv.includes("--debug");

// 单条请求日志打印
export function debugLog(req: Bun.BunRequest, status: number, startTime: bigint) {
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

// 包装路由处理器，自动捕获异常+打印日志
export function withDebugLog(handler: (req: Bun.BunRequest) => Promise<Response> | Response) {
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
