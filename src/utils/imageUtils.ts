import { storage } from './storage';
import CryptoJS from 'crypto-js';

// Base64 Encode (URL Safe)
const urlSafeBase64Encode = (str: string) => {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_');
};

const generateQiniuToken = (accessKey: string, secretKey: string, bucket: string) => {
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const putPolicy = {
        scope: bucket,
        deadline: deadline,
    };
    const putPolicyJson = JSON.stringify(putPolicy);
    const encodedPutPolicy = urlSafeBase64Encode(putPolicyJson);

    const sign = CryptoJS.HmacSHA1(encodedPutPolicy, secretKey).toString(CryptoJS.enc.Base64);
    const encodedSign = sign.replace(/\+/g, '-').replace(/\//g, '_');

    return `${accessKey}:${encodedSign}:${encodedPutPolicy}`;
};

export const uploadImage = async (file: File | Blob | string): Promise<string> => {
    const data = await storage.get();
    const config = data.imageConfig || { provider: 'imgbb', imgbb: { apiKey: '75816997103875323284534720101905' } };

    if (config.provider === 'qiniu' && config.qiniu) {
        return uploadToQiniu(file, config.qiniu);
    } else {
        // Default to ImgBB
        const apiKey = config.imgbb?.apiKey || data.imgbbApiKey || '75816997103875323284534720101905';
        return uploadToImgbb(file, apiKey);
    }
};

const uploadToQiniu = async (file: File | Blob | string, config: { accessKey: string, secretKey: string, bucket: string, domain: string, region: string }): Promise<string> => {
    const token = generateQiniuToken(config.accessKey, config.secretKey, config.bucket);
    const formData = new FormData();
    const fileName = `wa_${Date.now()}_${Math.random().toString(36).substring(7)}.png`; // Simple naming

    formData.append('token', token);
    formData.append('key', fileName);

    if (typeof file === 'string') {
        // Base64 string
        const base64Clean = file.replace(/^data:image\/\w+;base64,/, '');
        // Qiniu supports base64 upload via specific endpoint found in docs, but formData file upload is standard.
        // Convert base64 to Blob
        const byteCharacters = atob(base64Clean);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        formData.append('file', blob, fileName);
    } else {
        formData.append('file', file);
    }

    // Determine upload URL based on region (simplified mapping)
    // Common regions: z0 (华东), z1 (华北), z2 (华南), na0 (北美), as0 (东南亚)
    // https://developer.qiniu.com/kodo/1671/region-endpoint-is
    let uploadUrl = 'https://upload.qiniup.com'; // Default
    if (config.region === 'z0') uploadUrl = 'https://upload.qiniup.com';
    if (config.region === 'z1') uploadUrl = 'https://upload-z1.qiniup.com';
    if (config.region === 'z2') uploadUrl = 'https://upload-z2.qiniup.com';
    if (config.region === 'na0') uploadUrl = 'https://upload-na0.qiniup.com';
    if (config.region === 'as0') uploadUrl = 'https://upload-as0.qiniup.com';

    const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        throw new Error(`Qiniu Upload Failed: ${res.statusText}`);
    }

    const json = await res.json();
    // Construct URL
    let domain = config.domain.replace(/\/+$/, '');
    if (!domain.startsWith('http')) domain = 'http://' + domain;
    return `${domain}/${json.key}`;
};

const uploadToImgbb = async (file: File | Blob | string, apiKey: string): Promise<string> => {
    const formData = new FormData();
    if (typeof file === 'string') {
        const base64Clean = file.replace(/^data:image\/\w+;base64,/, '');
        formData.append('image', base64Clean);
    } else {
        formData.append('image', file);
    }

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) throw new Error('ImgBB Upload Failed');
    const data = await res.json();
    return data.data.url;
};

// Deprecated: use uploadImage instead
export const uploadToImgbbUtil = uploadImage;

export const handlePasteImage = async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    onUploadStart: () => void,
    onUploadSuccess: (url: string) => void,
    onUploadError: (err: string) => void
) => {
    const items = e.clipboardData.items;
    let imageItem = null;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            imageItem = items[i];
            break;
        }
    }

    if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) {
            onUploadStart();
            try {
                const url = await uploadImage(file);
                onUploadSuccess(url);
            } catch (err: any) {
                console.error("Upload error:", err);
                onUploadError('图片上传失败，请重试');
            }
            return true;
        }
    }
    return false;
};
