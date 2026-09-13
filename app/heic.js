export function isHEIC(file) { return /\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type); }
function aborted() { return new DOMException('Photo import cancelled.', 'AbortError'); }
/** Retain the original HEIC and create a lossless working PNG, entirely on the device. */
export async function decodeHEIC(blob, signal) {
    if (signal?.aborted)
        throw aborted();
    if (typeof Worker === 'undefined')
        throw new Error('HEIC decoding is unavailable. Export a JPEG or PNG from Photos and add that copy.');
    const buffer = await blob.arrayBuffer();
    if (signal?.aborted)
        throw aborted();
    const frame = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./heic-worker.js', import.meta.url), { type: 'module' });
        let settled = false;
        const finish = (error, data) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            worker.terminate();
            if (error)
                reject(error);
            else
                resolve(data);
        };
        const cancel = () => finish(aborted());
        const timer = setTimeout(() => finish(new Error('HEIC decoding took too long. Try a JPEG or PNG copy.')), 45000);
        worker.onmessage = event => { const data = event.data; finish(data.error ? new Error(data.error) : undefined, data); };
        worker.onerror = () => finish(new Error('The local HEIC decoder could not start. Keep the complete site folder together, or use a JPEG/PNG copy.'));
        signal?.addEventListener('abort', cancel, { once: true });
        worker.postMessage({ buffer }, [buffer]);
    });
    if (signal?.aborted)
        throw aborted();
    if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width * frame.height > 64000000 || frame.buffer.byteLength !== frame.width * frame.height * 4)
        throw new Error('The HEIC decoder returned invalid pixels.');
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    try {
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.buffer), frame.width, frame.height), 0, 0);
        const renderBlob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The HEIC working image could not be created.')), 'image/png'));
        if (signal?.aborted)
            throw aborted();
        return { width: frame.width, height: frame.height, renderBlob };
    }
    finally {
        canvas.width = canvas.height = 0;
    }
}
