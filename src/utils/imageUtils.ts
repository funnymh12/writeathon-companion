import { storage } from './storage';

export const uploadToImgbb = async (file: File | Blob | string): Promise<string> => {
    const data = await storage.get();
    const apiKey = data.imgbbApiKey || '75816997103875323284534720101905'; // Default or User Key

    const formData = new FormData();

    if (typeof file === 'string') {
        // Base64 string
        const base64Clean = file.replace(/^data:image\/\w+;base64,/, '');
        formData.append('image', base64Clean);
    } else {
        // File object
        formData.append('image', file);
    }

    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            throw new Error('Image upload failed');
        }

        const json = await res.json();
        if (json.success) {
            return json.data.url;
        } else {
            throw new Error(json.error?.message || 'Unknown upload error');
        }
    } catch (error) {
        console.error('ImgBB Upload Error:', error);
        throw error;
    }
};

export const handlePasteImage = async (
    e: React.ClipboardEvent,
    onUploadStart: () => void,
    onUploadSuccess: (url: string) => void,
    onUploadError: (err: string) => void
) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (!file) continue;

            onUploadStart();
            try {
                const url = await uploadToImgbb(file);
                onUploadSuccess(url);
            } catch (err: any) {
                onUploadError(err.message);
            }
            return true; // Handled image
        }
    }
    return false; // No image handled
};
