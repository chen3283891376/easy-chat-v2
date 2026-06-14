import { useState, useEffect, useMemo } from 'react';
import { generateKeyPair } from '@/lib/ed25519';
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/aes';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from './ui/field';
import { Progress } from './ui/progress';
import { useFileUpload } from '@/hooks/useFileUpload';

interface AuthModalProps {
    onLoginSuccess: (user: { username: string; publicKey: string }, privateKey: string) => void;
}

export function AuthModal({ onLoginSuccess }: AuthModalProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [avatar, setAvatar] = useState<string>('');
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const { upload, cancel, isUploading, uploadProgress } = useFileUpload();

    useEffect(() => {
        const localUser = localStorage.getItem('chat-user');
        const localPub = localStorage.getItem('chat-public-key');
        const encryptedPriv = localStorage.getItem('chat-encrypted-private');

        if (localUser && localPub && encryptedPriv) {
            const savedPwd = localStorage.getItem('chat-unlock-pwd');
            if (savedPwd) {
                try {
                    const privateKey = decryptPrivateKey(encryptedPriv, savedPwd);
                    if (privateKey) {
                        onLoginSuccess({ username: localUser, publicKey: localPub }, privateKey);
                    } else {
                        localStorage.removeItem('chat-unlock-pwd');
                        localStorage.removeItem('chat-key-unlocked');
                    }
                } catch {
                    localStorage.removeItem('chat-unlock-pwd');
                }
            }
        }
    }, [onLoginSuccess]);

    const passwordError = useMemo(
        () => (password.length > 0 && password.length < 8 ? '密码长度至少 8 位' : ''),
        [password],
    );

    // ====================== 注册 ======================
    const handleRegister = async () => {
        if (!username || !password) {
            toast.info('请输入用户名和密码');
            return;
        }
        if (username.includes('|')) {
            toast.error('用户名不能包含 | 字符');
            return;
        }
        if (password.length < 8) {
            toast.error('密码长度至少 8 位');
            return;
        }

        setLoading(true);

        try {
            const { privateKey: privateHex, publicKey: publicHex } = await generateKeyPair();
            const encryptedPrivate = encryptPrivateKey(privateHex, password);

            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    publicKey: publicHex,
                    encryptedPrivate,
                    avatarUrl: avatar,
                }),
            });

            const data = await res.json();
            if (data.status === 'success') {
                localStorage.setItem('chat-user', username);
                localStorage.setItem('chat-public-key', publicHex);
                localStorage.setItem('chat-encrypted-private', encryptedPrivate);

                localStorage.setItem('chat-key-unlocked', username);
                localStorage.setItem('chat-unlock-pwd', password);

                toast.success('注册成功');
                onLoginSuccess({ username, publicKey: publicHex }, privateHex);
            } else {
                toast.error(data.message);
            }
        } catch (err) {
            toast.error('注册失败');
            console.error(err);
        }

        setLoading(false);
    };

    // ====================== 登录 ======================
    const handleLogin = async () => {
        if (!username || !password) {
            toast.info('请输入用户名和密码');
            return;
        }
        setLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });

            const data = await res.json();
            if (data.status === 'success') {
                const { publicKey, encryptedPrivate } = data.data;

                const privateKey = decryptPrivateKey(encryptedPrivate, password);
                if (!privateKey) {
                    toast.error('密码错误');
                    setLoading(false);
                    return;
                }

                localStorage.setItem('chat-user', username);
                localStorage.setItem('chat-public-key', publicKey);
                localStorage.setItem('chat-encrypted-private', encryptedPrivate);

                localStorage.setItem('chat-key-unlocked', username);
                localStorage.setItem('chat-unlock-pwd', password);

                toast.success('登录成功');
                onLoginSuccess({ username, publicKey }, privateKey);
            } else {
                toast.error(data.message);
            }
        } catch {
            toast.error('登录失败');
        }

        setLoading(false);
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setErrorMessage('请上传图片文件');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setErrorMessage('图片大小不能超过 5MB');
            return;
        }

        setErrorMessage(null);

        try {
            const fileData = await upload(file);
            setAvatar(fileData.link);
        } catch (error) {
            console.error('上传失败:', error);
            setErrorMessage('头像上传失败，请稍后重试');
        }
    };

    return (
        <Dialog open={true} modal={true}>
            <DialogContent className="sm:max-w-100">
                <DialogHeader>
                    <DialogTitle>{isRegister ? '注册账号' : '登录账号'}</DialogTitle>
                    <DialogDescription>
                        {isRegister ? '创建你的账号，系统将生成安全密钥对' : '登录你的账号，继续聊天'}
                    </DialogDescription>
                </DialogHeader>

                <form method="post" autoComplete="on" onSubmit={e => e.preventDefault()}>
                    <div className="space-y-4 py-4">
                        <Field>
                            <FieldLabel>用户名</FieldLabel>
                            <Input
                                name="username"
                                type="text"
                                placeholder="请输入用户名"
                                autoComplete="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </Field>

                        <Field data-invalid={!!passwordError}>
                            <FieldLabel>密码</FieldLabel>
                            <Input
                                name="password"
                                type="password"
                                placeholder="请输入密码（至少8位）"
                                autoComplete={isRegister ? 'new-password' : 'current-password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                            <FieldError>{passwordError}</FieldError>
                        </Field>

                        {isRegister && (
                            <Field data-invalid={!!errorMessage}>
                                <FieldLabel>头像</FieldLabel>
                                <div className="flex items-center gap-4">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAvatarUpload}
                                        className="flex-1"
                                        disabled={isUploading}
                                    />
                                    {avatar && !isUploading && (
                                        <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-300">
                                            <img src={avatar} alt="预览" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                                {isUploading && (
                                    <div className="mt-2">
                                        <div className="flex items-center gap-2">
                                            <Progress value={uploadProgress} className="flex-1 h-2" />
                                            <span className="text-xs font-medium">{uploadProgress}%</span>
                                            <Button size="icon-sm" variant="ghost" onClick={cancel}>
                                                取消
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <FieldError>{errorMessage}</FieldError>
                            </Field>
                        )}

                        <Button
                            className="w-full"
                            onClick={isRegister ? handleRegister : handleLogin}
                            disabled={loading}
                        >
                            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
                        </Button>

                        <Button variant="ghost" className="w-full text-sm" onClick={() => setIsRegister(!isRegister)}>
                            {isRegister ? '已有账号？去登录' : '没有账号？注册'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
