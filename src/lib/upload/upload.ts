// 实现参考https://github.com/chen3283891376/new-xes-pan/blob/main/src/pages/upload.vue
import { type UploadParam } from './utils';

interface UploadOptions {
    onProgress?: (percent: number) => void;
    onAbort?: () => void;
}

export function UploadFile(
    file: File,
    params: UploadParam,
    options?: UploadOptions,
): { promise: Promise<void>; abort: () => void } {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', params.host, true);

    Object.entries(params.headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
    });

    const promise = new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`HTTP ${String(xhr.status)}`));
            }
        };
        xhr.onerror = () => {
            reject(new Error('网络错误'));
        };
        xhr.onabort = () => {
            reject(new Error('上传已取消'));
        };
        xhr.send(file);
    });

    return {
        promise,
        abort: () => {
            options?.onAbort?.();
            xhr.abort();
        },
    };
}
