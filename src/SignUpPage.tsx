import { useState } from 'react';
import { Button } from './components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './components/ui/card';
import { Input } from './components/ui/input';
import { toast } from 'sonner';

export default function SignUpPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState('');

    const handleClick = () => {
        setIsLoading(true);
        localStorage.setItem('username', username);
        // TODO: 以后可能会加入更多账号设置
        setTimeout(() => {
            setIsLoading(false);
            toast.success('登录成功！');
            window.location.href = '/';
        }, 2000);
    };

    return (
        <Card className="w-md max-w-md m-auto mt-10">
            <CardHeader>
                <CardTitle>EasyChat Community Edition v2</CardTitle>
                <CardDescription>请先登录</CardDescription>
            </CardHeader>

            <CardContent>
                <Input
                    placeholder="请输入用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                ></Input>
            </CardContent>

            <CardFooter>
                <Button onClick={handleClick} className="cursor-pointer w-full">
                    {isLoading ? '处理中...' : '登录'}
                </Button>
            </CardFooter>
        </Card>
    );
}
