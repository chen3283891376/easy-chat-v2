import { createMD5 } from 'hash-wasm';
import { toast } from 'sonner';

// 上传时所使用的UA
export const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.61';
// 上传时所用的身份验证
const AUTHORIZATION = 'e7e380401dc9a31fce2117a60c99ba04';
// 上传参数
export interface UploadParam {
    host: string;
    vpc_host: string;
    headers: Record<string, string>;
    cdn: string;
    key: string;
    url: string;
}

// 此函数实现参考https://github.com/chen3283891376/new-xes-pan/blob/main/src/pages/upload.vue
// 此函数用于计算指定文件的MD5
export async function calcFileMD5(file: File): Promise<string> {
    const md5 = await createMD5();
    // 这里为了提示性能，使用了ReadableStream
    // 关于ReadableStrean的详细介绍及用法：https://developer.mozilla.org/zh-CN/docs/Web/API/ReadableStream
    const reader = file.stream().getReader();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        md5.update(value);
    }

    return md5.digest();
}

// 此函数用于获取上传OSS的参数
export async function getOSSUploadParams(filename: string, md5: string): Promise<UploadParam> {
    try {
        const response = await fetch(
            `/xes/api/assets/get_oss_upload_params?scene=offline_python_assets&md5=${md5}&filename=${encodeURIComponent(filename)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: AUTHORIZATION,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.ok) {
            const data = (await response.json()) as { data: UploadParam };
            return data.data;
        }
    } catch (error) {
        toast.error('获取上传参数失败，请稍后再试');
        console.error('获取上传参数失败', error);
    }

    throw new Error('获取上传参数失败');
}

// 此函数用于将bytes转换成size
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return String(Math.round((bytes / Math.pow(k, i)) * 100) / 100) + ' ' + sizes[i];
}
