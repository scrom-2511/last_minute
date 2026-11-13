import fs from "node:fs/promises";
import yauzl from "yauzl-promise";

import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";

export const createFileFromBuffer = async (
    fileBuffer: Buffer,
    fileName: string,
    fileExtension: string,
) => {
    const filePath = path.join("/tmp", `${fileName}.${fileExtension}`);

    await fs.writeFile(filePath, fileBuffer);
};

export type FileValidationResult = { ok: true } | { ok: false; reason: string };
export const processZipFile = async (
    filePath: string,
    fileId: number,
): Promise<FileValidationResult> => {
    const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;
    const MAX_ENTRIES = 10_000;
    const MAX_README_SIZE = 1024 * 1024;
    const NESTED_ARCHIVE_PATTERN = /\.(zip|jar|war|apk|7z|rar|tar|gz)$/i;

    const fail = (reason: string): FileValidationResult => ({ ok: false, reason });
    let zip;

    try {
        zip = await yauzl.open(filePath);
    } catch {
        return fail("not a valid zip");
    }

    try {
        let count = 0;
        let totalDecompressedBytes = 0;
        let readme: Buffer | undefined;

        for await (const entry of zip) {
            if (++count > MAX_ENTRIES) return fail("too many entries");

            const name = entry.filename;

            if (NESTED_ARCHIVE_PATTERN.test(name)) return fail("nested archives are not allowed");

            if (name.startsWith("/") || name.split("/").includes("..")) return fail("unsafe path");

            if (entry.isEncrypted()) return fail("encrypted entry");

            if (entry.uncompressedSize > MAX_UNCOMPRESSED_SIZE) return fail("archive too large when extracted");

            if (name.endsWith("/")) continue;

            const isReadme = name.toLowerCase() === "readme.md" && readme === undefined;
            const readmeChunks: Buffer[] = [];
            let readmeBytes = 0;

            const stream = await entry.openReadStream();
            for await (const chunk of stream) {
                totalDecompressedBytes += chunk.length;
                if (totalDecompressedBytes > MAX_UNCOMPRESSED_SIZE) {
                    stream.destroy();
                    return fail("archive too large when extracted");
                }

                if (isReadme) {
                    readmeBytes += chunk.length;
                    if (readmeBytes > MAX_README_SIZE) {
                        stream.destroy();
                        return fail("readme too large");
                    }
                    readmeChunks.push(chunk);
                }
            }

            if (isReadme) readme = Buffer.concat(readmeChunks);
        }

        await createFileFromBuffer(readme!, `${fileId}-preview`, "md");

        return count === 0 ? fail("empty archive") : { ok: true };
    } catch {
        return fail("corrupt zip");
    } finally {
        await zip.close();
    }
};

const MAX_PAGES = 500;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // matches your upload cap
const RENDER_TIMEOUT_MS = 10_000;
const HEADER = Buffer.from("%PDF-");

export const processPdfFile = async (
    filePath: string,
    fileId: string,
): Promise<FileValidationResult> => {
    const previewOutPath = `${fileId}-preview.png`;

    let buf: Buffer;
    try {
        buf = await readFile(filePath);
    } catch {
        return { ok: false, reason: "could not read file" };
    }

    if (buf.length > MAX_FILE_BYTES) return { ok: false, reason: "file too large" };

    if (!hasPdfHeader(buf)) return { ok: false, reason: "not a pdf" };

    if (!hasEof(buf)) return { ok: false, reason: "truncated or malformed pdf" };

    let doc: PDFDocument;
    try {
        doc = await PDFDocument.load(buf, {
            updateMetadata: false,
            throwOnInvalidObject: true,
        });
    } catch {
        return { ok: false, reason: "corrupt or malformed pdf" };
    }

    if (doc.isEncrypted) return { ok: false, reason: "encrypted pdf" };

    const pageCount = doc.getPageCount();
    if (pageCount === 0) return { ok: false, reason: "pdf has no pages" };

    if (pageCount > MAX_PAGES) return { ok: false, reason: "too many pages" };

    try {
        await renderFirstPageIsolated(filePath, previewOutPath);
    } catch (err) {
        const reason =
            err instanceof Error && err.message === "render timeout"
                ? "render timed out (possible pdf bomb)"
                : "render failed";
        return { ok: false, reason };
    }

    return { ok: true };
};

const hasPdfHeader = (buf: Buffer) => buf.subarray(0, 5).equals(HEADER);

const hasEof = (buf: Buffer) => {
    const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1");
    return tail.includes("%%EOF");
};

const renderFirstPageIsolated = (filePath: string, outPath: string) =>
    new Promise<void>((resolve, reject) => {
        let child: ChildProcess;
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("render timeout"));
        }, RENDER_TIMEOUT_MS);

        child = fork(path.join(__dirname, "render-pdf-page.js"), [filePath, outPath], {
            execArgv: ["--max-old-space-size=512"],
        });

        child.on("exit", (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`render failed, exit code ${code}`));
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
