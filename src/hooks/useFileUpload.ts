import { useState } from 'react';
import { toast } from 'sonner';
import { calcFileMD5, getOSSUploadParams, formatFileSize, type UploadParam } from '@/lib/upload/utils';
import { UploadFile } from '@/lib/upload/upload';

export interface IFile {
    name: string;
    link: string;
    size: string;
    time: string;
}

/**
 * 文件上传自定义 Hook
 * @description 封装了文件上传的完整流程
 * @returns {Object} 上传相关的状态与方法
 * @returns {Function} returns.upload - 执行文件上传的异步函数
 * @returns {Function} returns.cancel - 取消当前正在进行的上传
 * @returns {boolean} returns.isUploading - 是否正在上传中
 * @returns {number} returns.uploadProgress - 当前上传进度 (0-100)
 * @example
 * const { upload, cancel, isUploading, uploadProgress } = useFileUpload();
 *
 * // 选择文件后调用
 * async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
 *   const file = e.target.files?.[0];
 *   if (file) {
 *     const fileData = await upload(file);
 *     console.log('上传成功:', fileData.link);
 *   }
 * }
 *
 * // 取消上传
 * <button onClick={cancel} disabled={!isUploading}>取消上传</button>
 */
export function useFileUpload() {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [abortUpload, setAbortUpload] = useState<(() => void) | null>(null);

    /**
     * 执行文件上传
     * @async
     * @param {File} file - 待上传的文件对象，来自用户选择的 input[type="file"]
     * @returns {Promise<IFile>} 上传成功后返回文件元数据对象，包含名称、链接、大小和时间
     * @throws {Error} 当上传失败时抛出错误，外部可捕获进行额外处理
     * @example
     * try {
     *   const fileInfo = await upload(selectedFile);
     *   // 使用 fileInfo.link 展示或发送消息
     * } catch (e) {
     *   // 处理错误（Hook 内部已 toast 提示，此处可做额外逻辑）
     * }
     */
    async function upload(file: File): Promise<IFile> {
        try {
            setIsUploading(true);
            setUploadProgress(0);

            // 计算文件 MD5，用于唯一标识和去重
            const md5 = await calcFileMD5(file);
            // 获取 OSS 上传所需的签名参数
            const params = await getOSSUploadParams(file.name, md5);
            const uploadParam: UploadParam = params as unknown as UploadParam;

            // 监听进度和取消事件
            const { promise, abort } = UploadFile(file, uploadParam, {
                onProgress: setUploadProgress,
                onAbort: () => toast.info('上传已取消'),
            });

            // 保存取消函数
            setAbortUpload(() => abort);
            await promise;

            // 提取扩展名并拼接访问链接
            const ext = file.name.split('.').pop();
            const link = `https://livefile.xesimg.com/programme/python_assets/${md5}${ext?.length ? `.${ext}` : ''}`;

            toast.success('上传成功');
            return {
                name: file.name,
                link,
                size: formatFileSize(file.size),
                time: new Date().toLocaleString(),
            } as IFile;
        } catch (error) {
            toast.error((error as Error)?.message ?? '上传失败');
            throw error;
        } finally {
            // 重置上传状态
            setIsUploading(false);
            setUploadProgress(0);
            setAbortUpload(null);
        }
    }

    /**
     * 取消当前正在进行的上传
     * @description 调用此方法会触发 abort 回调，显示“上传已取消”提示，
     *              并中断正在进行的上传请求。
     */
    function cancel() {
        if (abortUpload) {
            abortUpload();
        }
    }

    return {
        upload,
        cancel,
        isUploading,
        uploadProgress,
    };
}
