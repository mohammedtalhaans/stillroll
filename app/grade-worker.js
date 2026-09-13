import { processPixels } from './grading.js';
self.onmessage = (event) => {
    const { id, buffer, width, height, settings } = event.data;
    try {
        const pixels = new Uint8ClampedArray(buffer);
        processPixels(pixels, width, height, settings);
        self.postMessage({ id, buffer: pixels.buffer }, [pixels.buffer]);
    }
    catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};
