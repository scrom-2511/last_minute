import fs from "node:fs/promises";
import yauzl from "yauzl-promise";

import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";

// Persist buffer to disk for external tools or child processes that require file path inputs
export const createFileFromBuffer = async (
    fileBuffer: Buffer,
    fileName: string,
    fileExtension: string,
) => {
    const filePath = path.join(`${fileName}.${fileExtension}`);

    await fs.writeFile(filePath, fileBuffer);
};

export type FileValidationResult = { ok: true } | { ok: false; reason: string };

// -------------------- ZIP File Handling --------------------
export const processZipFile = async (
    filePath: string,
    fileId: number,
): Promise<FileValidationResult> => {
    // Defense limits against decompression bombs and resource exhaustion attacks
    const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;
    const MAX_ENTRIES = 10_000;
    const MAX_README_SIZE = 2 * 1024 * 1024;
    // Pattern to detect archive files to prevent recursive decompression bomb attacks
    const NESTED_ARCHIVE_PATTERN = /\.(zip|jar|war|apk|7z|rar|tar|gz)$/i;

    const fail = (reason: string): FileValidationResult => ({ ok: false, reason });
    let zip;

    try {
        // Opens the ZIP file without decompressing the entire archive.
        zip = await yauzl.open(filePath);
    } catch {
        return fail("not a valid zip");
    }

    try {
        let count = 0; // counts entries in the zip
        let totalDecompressedBytes = 0; // stores total decompressed bytes in the zip
        let readme: Buffer | undefined; // stores the readme file's buffer

        for await (const entry of zip) {
            // Guard against zip bombs containing millions of tiny files to exhaust memory
            if (++count > MAX_ENTRIES) return fail("too many entries");

            const name = entry.filename;

            // Disallow nested archives to prevent recursive decompression bomb attacks
            if (NESTED_ARCHIVE_PATTERN.test(name)) return fail("nested archives are not allowed");

            // Guard against Zip Slip directory traversal vulnerability
            if (name.startsWith("/") || name.split("/").includes("..")) return fail("unsafe path");

            // Encrypted archives cannot be scanned or inspected
            if (entry.isEncrypted()) return fail("encrypted entry");

            // Fast pre-check: zip header metadata could already exceed our limit
            if (entry.uncompressedSize > MAX_UNCOMPRESSED_SIZE)
                return fail("archive too large when extracted");

            // Directories do not have content streams, skip them
            if (name.endsWith("/")) continue;

            // Only extract the first README found for the project preview
            const isReadme = name.toLowerCase() === "readme.md" && readme === undefined;
            const readmeChunks: Buffer[] = [];
            let readmeBytes = 0;

            // Header uncompressed size can be fake, therefore track actual stream bytes to guard against
            // zip bombs
            const stream = await entry.openReadStream();
            for await (const chunk of stream) {
                totalDecompressedBytes += chunk.length;
                if (totalDecompressedBytes > MAX_UNCOMPRESSED_SIZE) {
                    // If decompressed bytes is greater than the cap, destroy the stream and return fail
                    stream.destroy();
                    return fail("archive too large when extracted");
                }

                // Cap README preview extraction to prevent memory bloat
                if (isReadme) {
                    readmeBytes += chunk.length;
                    if (readmeBytes > MAX_README_SIZE) {
                        stream.destroy();
                        return fail("readme too large");
                    }
                    readmeChunks.push(chunk);
                }
            }

            // If readme exists, concat all the chunks
            if (isReadme) readme = Buffer.concat(readmeChunks);
        }

        // Save preview file locally to be uploaded to S3 by the worker
        await createFileFromBuffer(readme!, `${fileId}-preview`, "md");

        return count === 0 ? fail("empty archive") : { ok: true };
    } catch {
        return fail("corrupt zip");
    } finally {
        // Release file handle to avoid leaking file descriptors
        await zip.close();
    }
};

// -------------------- PDF File Handling --------------------
const MAX_PAGES = 500;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // matches your upload cap
const RENDER_TIMEOUT_MS = 10_000;

export const processPdfFile = async (
    filePath: string,
    fileId: string,
): Promise<FileValidationResult> => {
    let buf: Buffer;
    try {
        buf = await readFile(filePath);
    } catch {
        return { ok: false, reason: "could not read file" };
    }

    if (buf.length > MAX_FILE_BYTES) return { ok: false, reason: "file too large" };

    // Magic bytes check: every valid PDF must begin with %PDF-
    if (!buf.subarray(0, 5).equals(Buffer.from("%PDF-"))) return { ok: false, reason: "not a pdf" };

    // PDF requires %%EOF near the end, scan the last 2KB using 1-byte encoding for early failure on
    // truncated uploads
    const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
    if (!tail.includes("%%EOF")) return { ok: false, reason: "truncated or malformed pdf" };

    let doc: PDFDocument;
    try {
        // Throw immediately on malformed pdf's
        doc = await PDFDocument.load(buf, {
            updateMetadata: false,
            throwOnInvalidObject: true,
        });
    } catch {
        return { ok: false, reason: "corrupt or malformed pdf" };
    }

    // Encrypted pdf's cannot be inspected
    if (doc.isEncrypted) return { ok: false, reason: "encrypted pdf" };

    const pageCount = doc.getPageCount();
    if (pageCount === 0) return { ok: false, reason: "pdf has no pages" };

    // Bound page count to prevent heavy resource usage on massive documents
    if (pageCount > MAX_PAGES) return { ok: false, reason: "too many pages" };

    try {
        // Some pdf's can have font bombs, etc which has to be decompressed while converting to png.
        // By running it in a separate process we can terminate it if it exceeds the time or memory limit,
        // and hence protect the main process from crashing.
        await renderFirstPageIsolated(filePath, `${fileId}-preview.png`);
    } catch (err) {
        const reason =
            err instanceof Error && err.message === "render timeout"
                ? "render timed out (possible pdf bomb)"
                : "render failed";
        return { ok: false, reason };
    }

    return { ok: true };
};

// Renders the PDF page in a separate child process with hard memory and time caps
const renderFirstPageIsolated = (filePath: string, outPath: string) =>
    new Promise<void>((resolve, reject) => {
        let child: ChildProcess;
        // Kill runaway renders with SIGKILL if they exceed the timeout threshold (e.g. PDF bomb)
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("render timeout"));
        }, RENDER_TIMEOUT_MS);

        // Limit V8 heap to 512MB to kill memory explosion attacks before they exhaust host RAM
        child = fork(path.join(__dirname, "pdf_page_renderer.js"), [filePath, outPath], {
            execArgv: ["--max-old-space-size=512"],
        });

        child.on("exit", (code) => {
            clearTimeout(timer);
            if (code === 0)
                resolve(); // Conversion was successfull
            else reject(new Error(`render failed, exit code ${code}`));
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
