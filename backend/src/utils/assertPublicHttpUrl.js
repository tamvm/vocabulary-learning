import { lookup as defaultDnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const BLOCKED_MESSAGE = 'Blocked URL: target is not a public HTTP(S) host.';

const blockedRanges = new BlockList();

// IPv4: this host, private, loopback, link-local, CGNAT, docs/benchmark, multicast, reserved
blockedRanges.addSubnet('0.0.0.0', 8, 'ipv4');
blockedRanges.addSubnet('10.0.0.0', 8, 'ipv4');
blockedRanges.addSubnet('100.64.0.0', 10, 'ipv4');
blockedRanges.addSubnet('127.0.0.0', 8, 'ipv4');
blockedRanges.addSubnet('169.254.0.0', 16, 'ipv4');
blockedRanges.addSubnet('172.16.0.0', 12, 'ipv4');
blockedRanges.addSubnet('192.0.0.0', 24, 'ipv4');
blockedRanges.addSubnet('192.0.2.0', 24, 'ipv4');
blockedRanges.addSubnet('192.168.0.0', 16, 'ipv4');
blockedRanges.addSubnet('198.18.0.0', 15, 'ipv4');
blockedRanges.addSubnet('198.51.100.0', 24, 'ipv4');
blockedRanges.addSubnet('203.0.113.0', 24, 'ipv4');
blockedRanges.addSubnet('224.0.0.0', 4, 'ipv4');
blockedRanges.addSubnet('240.0.0.0', 4, 'ipv4');

// IPv6: unspecified, loopback, unique-local, link-local, multicast, documentation
blockedRanges.addAddress('::', 'ipv6');
blockedRanges.addAddress('::1', 'ipv6');
blockedRanges.addSubnet('fc00::', 7, 'ipv6');
blockedRanges.addSubnet('fe80::', 10, 'ipv6');
blockedRanges.addSubnet('ff00::', 8, 'ipv6');
blockedRanges.addSubnet('2001:db8::', 32, 'ipv6');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.corp'];

export class UnsafeUrlError extends Error {
  constructor(message = BLOCKED_MESSAGE) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function normalizeIp(address) {
  if (!address) {
    return address;
  }

  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) {
      return mapped;
    }

    const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    }
  }

  return address;
}

export function isBlockedIp(address) {
  const ip = normalizeIp(address);
  const version = isIP(ip);
  if (!version) {
    return true;
  }

  const type = version === 6 ? 'ipv6' : 'ipv4';
  return blockedRanges.check(ip, type);
}

function looksLikeNonCanonicalIp(hostname) {
  if (isIP(hostname)) {
    return false;
  }

  if (/^\d+$/.test(hostname)) {
    return true;
  }

  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    return true;
  }

  if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))+$/i.test(hostname)) {
    return true;
  }

  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (!host || host === 'localhost' || BLOCKED_HOSTNAMES.has(host)) {
    return true;
  }

  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

async function resolveAddresses(hostname, lookupFn) {
  const result = await lookupFn(hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(result) ? result : [result];

  return addresses
    .map((entry) => {
      if (typeof entry === 'string') {
        return { address: entry, family: isIP(entry) };
      }
      return { address: entry.address, family: entry.family || isIP(entry.address) };
    })
    .filter((entry) => entry.address);
}

/**
 * Parse an HTTP(S) URL, resolve its hostname, and reject private, loopback,
 * link-local, metadata, and other non-public targets.
 *
 * @param {string} input
 * @param {{ lookup?: Function }} [options]
 * @returns {Promise<{ urlObj: URL, addresses: Array<{ address: string, family: number }> }>}
 */
export async function assertPublicHttpUrl(input, options = {}) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new UnsafeUrlError('Invalid URL');
  }

  let urlObj;
  try {
    urlObj = new URL(input);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new UnsafeUrlError('Invalid URL protocol. Only HTTP and HTTPS are supported.');
  }

  if (urlObj.username || urlObj.password) {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  const hostname = urlObj.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  if (isBlockedHostname(hostname) || looksLikeNonCanonicalIp(hostname)) {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  const ipVersion = isIP(hostname);
  if (ipVersion) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeUrlError(BLOCKED_MESSAGE);
    }

    return {
      urlObj,
      addresses: [{ address: hostname, family: ipVersion }],
    };
  }

  const lookupFn = options.lookup || defaultDnsLookup;
  let addresses;
  try {
    addresses = await resolveAddresses(hostname, lookupFn);
  } catch {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  if (!addresses.length) {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  if (addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new UnsafeUrlError(BLOCKED_MESSAGE);
  }

  return { urlObj, addresses };
}
