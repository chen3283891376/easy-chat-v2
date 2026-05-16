export const storage = {
    get: async (key: string) => {
        const response = await fetch(`/api/get?key=${key}`);
        if (response.ok) {
            const data = await response.json();
            return data.data;
        } else {
            throw new Error('Failed to get value from storage');
        }
    },
    new: async (key: string, value: any) => {
        const response = await fetch('/api/new', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key, value }),
        });
        if (!response.ok) {
            throw new Error('Failed to create new variable');
        }
    },
    set: async (key: string, value: any) => {
        const response = await fetch('/api/set', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key, value }),
        });
        if (!response.ok) {
            throw new Error('Failed to set value in storage');
        }
    },
};
