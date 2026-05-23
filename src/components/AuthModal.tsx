import { useState, useEffect, useRef } from 'react';
import { generateKeyPair } from '@/lib/ed25519';
import { encryptPrivateKey, decryptPrivateKey } from '@/lib/aes';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from './ui/field';

interface AuthModalProps {
    onLoginSuccess: (user: { username: string; publicKey: string }, privateKey: string) => void;
}

export function AuthModal({ onLoginSuccess }: AuthModalProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);
    const isPwdValid = useRef(false);

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
                } catch (e) {
                    localStorage.removeItem('chat-unlock-pwd');
                }
            }
        }
    }, [onLoginSuccess]);

    useEffect(() => {
        isPwdValid.current = password.length >= 8;
    }, [password]);

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
        } catch (err) {
            toast.error('登录失败');
        }

        setLoading(false);
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
                        <div className="space-y-2">
                            <Input
                                name="username"
                                type="text"
                                placeholder="用户名"
                                autoComplete="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                            {/* <Input
                                name="password"
                                type="password"
                                placeholder="密码"
                                autoComplete={isRegister ? 'new-password' : 'current-password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            /> */}
                            <Field data-invalid={isPwdValid.current}>
                                <FieldLabel>密码</FieldLabel>
                                <Input
                                    name="password"
                                    type="password"
                                    placeholder="密码"
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                                <FieldError style={{ display: isPwdValid.current ? 'none' : 'block' }}>
                                    {password.length < 8 ? '密码长度至少 8 位' : ''}
                                </FieldError>
                            </Field>
                        </div>

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
