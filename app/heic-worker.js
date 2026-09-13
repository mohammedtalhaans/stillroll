const scope = globalThis;
scope.onmessage = async (event) => {
    let images = [];
    try {
        const path = '../vendor/libheif/libheif-bundle.mjs';
        const { default: factory } = await import(path);
        const lib = await factory({ print: () => { }, printErr: () => { } });
        const decoder = new lib.HeifDecoder();
        images = decoder.decode(new Uint8Array(event.data.buffer));
        if (!images.length || images.length > 64)
            throw new Error('No usable primary image was found in this HEIC.');
        const image = images.find(im => lib.heif_image_handle_is_primary_image(im.handle)) || images[0];
        const width = image.get_width(), height = image.get_height();
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 64000000)
            throw new Error('This HEIC exceeds the 64-megapixel limit.');
        const frame = { data: new Uint8ClampedArray(width * height * 4), width, height };
        const decoded = await new Promise((resolve, reject) => image.display(frame, (result) => result ? resolve(result) : reject(new Error('HEIC decoding failed.'))));
        scope.postMessage({ width, height, buffer: decoded.data.buffer }, [decoded.data.buffer]);
    }
    catch (error) {
        scope.postMessage({ error: error.message || 'This HEIC cannot be decoded.' });
    }
    finally {
        for (const image of images)
            try {
                image.free?.();
            }
            catch { /* Worker termination also releases the decoder heap. */ }
    }
};
export {};
