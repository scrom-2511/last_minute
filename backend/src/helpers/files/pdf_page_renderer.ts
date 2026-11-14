import fs from "node:fs/promises";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { createFileFromBuffer } from "./file_processor.js";

// Browser APIs pdf.js expects in Node.
const g = globalThis as unknown as Record<string, unknown>;
g.DOMMatrix ??= DOMMatrix;
g.ImageData ??= ImageData;
g.Path2D ??= Path2D;

const TARGET_WIDTH = 1024;
const MAX_HEIGHT = 2048;
const MAX_SCALE = 2;
const MAX_PNG_SIZE = 2 * 1024 * 1024;

const EXIT_FAILED = 1;
const EXIT_ENCRYPTED = 2;

const renderFirstPage = async (filePath: string, outPath: string): Promise<void> => {
    // Dynamically load legacy pdfjs build designed for Node.js environments
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data = new Uint8Array(await fs.readFile(filePath));

    const pdf = await pdfjs.getDocument({
        data,
        disableFontFace: true, // no DOM font loading in Node
        // Avoid system font lookups to prevent environment discrepancies and unnecessary disk reads
        useSystemFonts: false,
        // Disable XML Forms Architecture parsing to reduce attack surface and parsing overhead
        enableXfa: false,
    }).promise;

    try {
        if (pdf.numPages < 1) throw new Error("no pages");

        const page = await pdf.getPage(1);

        // Bound the bitmap regardless of MediaBox size.
        const base = page.getViewport({ scale: 1 });
        // Clamp scale so arbitrarily large MediaBoxes do not allocate massive bitmaps
        let scale = Math.min(TARGET_WIDTH / base.width, MAX_HEIGHT / base.height, MAX_SCALE);

        let buffer: Buffer | undefined;

        // Progressively downscale if the rendered PNG exceeds size limit
        while (scale >= 0.25) {
            const viewport = page.getViewport({ scale });

            // Ensure dimensions are positive integers to prevent canvas allocation failure
            const canvas = createCanvas(
                Math.max(1, Math.ceil(viewport.width)),
                Math.max(1, Math.ceil(viewport.height)),
            );

            await page.render({
                canvas: canvas as unknown as HTMLCanvasElement,
                viewport,
            }).promise;

            buffer = canvas.toBuffer("image/png");

            // Exit early once the image fits within our byte budget
            if (buffer.length <= MAX_PNG_SIZE) break;

            scale *= 0.75;
        }

        if (!buffer || buffer.length > MAX_PNG_SIZE)
            throw new Error("Unable to generate thumbnail within size limit");

        await createFileFromBuffer(buffer, outPath, "png");
    } catch (err) {
        throw err;
    } finally {
        // Release page resources, fonts, and internal caches allocated by pdfjs
        await pdf.cleanup();
    }
};

const main = async (): Promise<void> => {
    const [filePath, outPath] = process.argv.slice(2);
    if (!filePath || !outPath) throw new Error("Missing filePath or outPath");

    await renderFirstPage(filePath, outPath);
    process.exit(0); // don't linger on open handles
};

main().catch((error: unknown) => {
    const name = (error as { name?: string } | null)?.name;
    console.error("PDF rendering failed:", error);
    // Exit code 2 lets the parent process identify password protection vs generic render failure
    process.exit(name === "PasswordException" ? EXIT_ENCRYPTED : EXIT_FAILED);
});
