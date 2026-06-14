import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.tsx';
import { Input } from '@/components/ui/input.tsx';

interface UploadFileProps {
    setSelectedFile: (value: File | null) => void;
    disabled?: boolean;
}

export default function UploadFile({ setSelectedFile, disabled }: UploadFileProps) {
    return (
        <div>
            <Field>
                <FieldLabel htmlFor="file">文件</FieldLabel>
                <Input
                    id="file"
                    type="file"
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file !== undefined && file.size > 0) {
                            setSelectedFile(file);
                        }
                    }}
                    disabled={disabled}
                />
                <FieldDescription>选择一个文件以供上传</FieldDescription>
            </Field>
        </div>
    );
}
