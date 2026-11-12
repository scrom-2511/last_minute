export const hashesToBytes = (hashes: string[]): Uint8Array[] => {
    return hashes.map(hash => Buffer.from(hash, "hex"));
}

export const bytesToHashes = (bytes: Uint8Array[]): string[] => {
    return bytes.map(byte => Buffer.from(byte).toString("hex"));
}