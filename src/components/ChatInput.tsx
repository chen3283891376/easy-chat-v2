import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { useChat } from '../context/ChatContext';
import { FileUpIcon, SendIcon, XIcon } from 'lucide-react';
import {
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
    Dialog,
} from './ui/dialog';
import UploadFile from './UploadFile';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useState } from 'react';
import { Progress } from './ui/progress';
import { FileDisplay } from './FileDisplay';

export function ChatInput() {
    const { input, setInput, handleSend, quoteMsgId, setQuoteMsgId, messages, sendFile } = useChat();
    const quoteMessage = quoteMsgId ? messages.find(m => m.id === quoteMsgId) : null;
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { upload, isUploading, uploadProgress } = useFileUpload();
    const [open, setOpen] = useState(false);

    const handleUpload = async () => {
        if (selectedFile === null) return;

        try {
            const data = await upload(selectedFile);
            sendFile(data);

            setOpen(false);
        } catch {
            // 忽略
        } finally {
            setSelectedFile(null);
            setOpen(false);
        }
    };

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) setSelectedFile(null);
    };

    return (
        <div className="p-3 flex flex-col bg-white border-t shrink-0 max-h-45 overflow-y-auto">
            {quoteMsgId && (
                <div className="relative text-xs p-2 mb-2 rounded border-l-4 bg-slate-50 border-slate-400 text-slate-800">
                    <p className="font-bold mb-0.5">@{quoteMessage?.username}</p>
                    <div className="prose prose-sm max-w-none max-h-24 overflow-y-auto prose-p:my-0 prose-headings:my-1 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-pre:my-1">
                        {quoteMessage?.type !== 'share' ? (
                            quoteMessage?.msg
                        ) : (
                            <FileDisplay fileData={JSON.parse(quoteMessage.msg)} isCurrentUser={false} />
                        )}
                    </div>
                    <Button
                        size="icon-xs"
                        className="absolute top-1 right-1"
                        onClick={() => {
                            setQuoteMsgId(null);
                        }}
                    >
                        <XIcon />
                    </Button>
                </div>
            )}

            <div className="flex gap-2 items-center shrink-0">
                <Dialog open={open} onOpenChange={handleOpenChange}>
                    <DialogTrigger asChild>
                        <Button size="icon">
                            <FileUpIcon />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>分享文件</DialogTitle>
                        </DialogHeader>
                        <UploadFile setSelectedFile={setSelectedFile} disabled={isUploading} />
                        {isUploading && (
                            <div className="flex items-center gap-2 mt-2">
                                <Progress value={uploadProgress} className="flex-1 h-2" />
                                <span className="text-sm font-medium">{uploadProgress}%</span>
                            </div>
                        )}
                        <DialogFooter className="mt-4">
                            <DialogClose asChild>
                                <Button variant="secondary" className="cursor-pointer" disabled={isUploading}>
                                    取消
                                </Button>
                            </DialogClose>
                            <Button
                                disabled={selectedFile === null || isUploading}
                                onClick={handleUpload}
                                className="cursor-pointer"
                            >
                                {isUploading ? '上传中' : '分享'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="输入消息..."
                    className="flex-1"
                />
                <Button size={'icon'} onClick={handleSend}>
                    <SendIcon />
                </Button>
            </div>
        </div>
    );
}
