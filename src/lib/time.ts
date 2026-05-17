export const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};
