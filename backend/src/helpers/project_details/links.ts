import axios from "axios";
import { isIP, LookupFunction } from "node:net";
import { BlockList } from "node:net";
import dns from "node:dns";
import validator from "validator";
import https from "https";

export const isLinkProper = async (rawLink: string): Promise<boolean> => {
    try {
        const url = getUrl(rawLink);

        // Reject links which don't use https as protocol
        if (url.protocol !== "https:") return false;

        // Node skips safeLookup for literal IPs, so check them here
        isLiteralIpSafe(url.hostname);

        for (const method of ["HEAD", "GET"] as const) {
            const res = await client.request({
                url: url.toString(),
                method,
                timeout: 5000,
            });

            // We only need the status, so close the connection without downloading the body
            res.data.destroy();

            if (res.status >= 200 && res.status < 300) return true;

            // Only retry with GET when HEAD may have been rejected (405 Method Not Allowed,
            // 403 Forbidden). Any other status is a real failure.
            if (res.status !== 403 && res.status !== 405) return false;
        }

        return false;
    } catch {
        return false;
    }
};

const getUrl = (rawLink: string): URL => {
    const isUrl = validator.isURL(rawLink);

    if (!isUrl) throw new Error("Invalid URL provided");

    // If link doesn't have a protocol, add https as default
    const urlHasProtocol = validator.isURL(rawLink, { require_protocol: true });

    return urlHasProtocol ? new URL(rawLink) : new URL(`https://${rawLink}`);
};

export const isBlockedIP = (ip: string): boolean => {
    const version = isIP(ip);

    if (version === 0) return true;

    return blocked.check(ip, version === 4 ? "ipv4" : "ipv6");
};

const safeLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, options, (err, address, family) => {
        if (err) return callback(err, "", 0);

        // Get the resolved addresses from the hostname
        const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];

        // Ensure all the resolved addresses are not from blocked ranges
        if (addresses.every((ip) => !isBlockedIP(ip))) {
            return callback(null, address, family);
        }

        return callback(new Error("blocked address"), "", 0);
    });
};

// IPv6 literal can be enclosed in square brackets
const stripBrackets = (hostname: string) => hostname.replace(/^\[|\]$/g, "");
// Literal IPs skip DNS, so safeLookup never sees them and they need their own check
const isLiteralIpSafe = (hostname: string) => {
    const host = stripBrackets(hostname);

    if (isIP(host) && isBlockedIP(host)) throw new Error("blocked address");
};

const client = axios.create({
    maxRedirects: 3,
    // Handle status codes ourselves instead of passing them to catch blocks
    validateStatus: () => true,
    responseType: "stream",
    // A proxy resolves and connects on its own, bypassing safeLookup
    proxy: false,
    httpsAgent: new https.Agent({ lookup: safeLookup }),
    // Literal-IP redirect targets never reach safeLookup, so check them here
    beforeRedirect: (options) => {
        isLiteralIpSafe(options.hostname ?? "");
        if (options.protocol !== "https:") throw new Error("redirected to non-https");
    },
});

const blocked = new BlockList();

// IPv4: private and local networks
blocked.addSubnet("0.0.0.0", 8);
blocked.addSubnet("10.0.0.0", 8);
blocked.addSubnet("100.64.0.0", 10);
blocked.addSubnet("127.0.0.0", 8);
blocked.addSubnet("169.254.0.0", 16);
blocked.addSubnet("172.16.0.0", 12);
blocked.addSubnet("192.168.0.0", 16);

// IPv4: reserved, documentation and special-purpose ranges
blocked.addSubnet("192.0.0.0", 24);
blocked.addSubnet("192.0.2.0", 24);
blocked.addSubnet("192.88.99.0", 24);
blocked.addSubnet("198.18.0.0", 15);
blocked.addSubnet("198.51.100.0", 24);
blocked.addSubnet("203.0.113.0", 24);
blocked.addSubnet("224.0.0.0", 4);
blocked.addSubnet("240.0.0.0", 4);
blocked.addSubnet("3fff::", 20, "ipv6");
blocked.addSubnet("64:ff9b::", 96, "ipv6");

// IPv6: unspecified and loopback
blocked.addAddress("::", "ipv6");
blocked.addAddress("::1", "ipv6");

// IPv6: IPv4-mapped addresses
blocked.addSubnet("::ffff:0:0", 96, "ipv6");

// IPv6: special-purpose ranges
blocked.addSubnet("64:ff9b:1::", 48, "ipv6");
blocked.addSubnet("100::", 64, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");

// IPv6: private, link-local and multicast
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");
blocked.addSubnet("fec0::", 10, "ipv6");
