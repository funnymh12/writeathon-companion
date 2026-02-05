import JSZip from 'jszip';

export const sanitizeFilename = (filename: string): string => {
    // Replace invalid characters with underscores
    return filename.replace(/[<>:"/\\|?*]/g, '_').trim();
};

export const convertBlobToJpg = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            // Fill white background for transparency
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((jpgBlob) => {
                if (jpgBlob) {
                    resolve(jpgBlob);
                } else {
                    reject(new Error('Canvas to Blob failed'));
                }
            }, 'image/jpeg', 0.9); // Quality 0.9
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image load failed'));
        };

        img.src = url;
    });
};

export const saveImagesAsZip = async (
    images: { src: string; filename?: string }[],
    zipFilename: string,
    onProgress?: (percent: number) => void
) => {
    const zip = new JSZip();
    const folder = zip.folder('images');
    if (!folder) throw new Error('Failed to create zip folder');

    let processed = 0;
    const total = images.length;

    // Concurrently fetch images
    const promises = images.map(async (img, index) => {
        try {
            const response = await fetch(img.src);
            if (!response.ok) throw new Error(`Failed to fetch ${img.src}`);
            let blob = await response.blob();

            // Convert to JPG
            try {
                blob = await convertBlobToJpg(blob);
            } catch (e) {
                console.warn(`JPG conversion failed for ${img.src}, keeping original`, e);
            }

            // Force .jpg extension
            const ext = 'jpg';

            // Generate filename
            let name = '';
            if (img.filename) {
                // If filename already has an extension, strip it and append .jpg
                // or just append .jpg if meaningful
                const cleanName = img.filename.replace(/\.[^/.]+$/, ""); // strip extension
                name = `${cleanName}.${ext}`;
            } else {
                name = `image_${index + 1}.${ext}`;
            }

            folder.file(name, blob);
        } catch (err) {
            console.error(`Failed to process image ${img.src}`, err);
            folder.file(`error_${index + 1}.txt`, `Failed to fetch: ${img.src}\n${err}`);
        } finally {
            processed++;
            if (onProgress) onProgress(Math.round((processed / total) * 100));
        }
    });

    await Promise.all(promises);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);

    const safeFilename = sanitizeFilename(zipFilename);
    const finalName = safeFilename.endsWith('.zip') ? safeFilename : `${safeFilename}.zip`;

    await chrome.downloads.download({
        url: url,
        filename: finalName,
        saveAs: false,
        conflictAction: 'uniquify'
    });
};


export const saveMarkdown = async (content: string, filename: string, frontmatter?: Record<string, any>) => {
    let finalContent = content;

    if (frontmatter) {
        const yaml = Object.entries(frontmatter)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        finalContent = `---\n${yaml}\n---\n\n${content}`;
    }

    // Create a blob
    const blob = new Blob([finalContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const safeFilename = sanitizeFilename(filename);
    // Ensure .md extension
    const name = safeFilename.endsWith('.md') ? safeFilename : `${safeFilename}.md`;

    try {
        await chrome.downloads.download({
            url: url,
            filename: name, // Chrome handles the path (usually logic puts it in Downloads)
            saveAs: false,   // Set to true if you want to force the "Save As" dialog
            conflictAction: 'uniquify'
        });
    } catch (err) {
        console.error('Download failed', err);
        throw err;
    } finally {
        // Cleanup not strictly necessary right away as chrome consumes the URL, 
        // but good practice might be to revoke later if reusing heavily. 
        // For extension downloads, usually fine.
        // setTimeout(() => URL.revokeObjectURL(url), 10000); 
    }
};
