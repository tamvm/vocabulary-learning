/**
 * SSRF guards for the URL scraper.
 * Run: node test_assert_public_http_url.js
 */

import { assertPublicHttpUrl, isBlockedIp, UnsafeUrlError } from './src/utils/assertPublicHttpUrl.js';
import { webScrapingService } from './src/services/webScrapingService.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function expectRejected(fn, message) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${message} (expected rejection)`);
  } catch (error) {
    if (error instanceof UnsafeUrlError || /not a public|Invalid URL/i.test(error.message)) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message} (unexpected error: ${error.message})`);
    }
  }
}

function mockLookup(table) {
  return async (hostname) => {
    const key = hostname.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(table, key)) {
      const err = new Error(`ENOTFOUND ${hostname}`);
      err.code = 'ENOTFOUND';
      throw err;
    }
    return table[key];
  };
}

const publicLookup = mockLookup({
  'example.com': [{ address: '93.184.216.34', family: 4 }],
  'dual.example': [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ],
});

console.log('🧪 SSRF URL validation\n');

console.log('📝 Blocked IP literals');
assert(isBlockedIp('127.0.0.1'), 'loopback 127.0.0.1');
assert(isBlockedIp('10.1.2.3'), 'private 10/8');
assert(isBlockedIp('172.16.0.9'), 'private 172.16/12');
assert(isBlockedIp('192.168.1.1'), 'private 192.168/16');
assert(isBlockedIp('169.254.169.254'), 'link-local / metadata');
assert(isBlockedIp('100.100.100.200'), 'CGNAT / Alibaba metadata');
assert(isBlockedIp('0.0.0.0'), 'unspecified IPv4');
assert(isBlockedIp('::1'), 'loopback IPv6');
assert(isBlockedIp('::ffff:127.0.0.1'), 'IPv4-mapped loopback');
assert(isBlockedIp('::ffff:7f00:1'), 'IPv4-mapped loopback (hex)');
assert(isBlockedIp('fc00::1'), 'unique local IPv6');
assert(isBlockedIp('fe80::1'), 'link-local IPv6');
assert(!isBlockedIp('93.184.216.34'), 'public IPv4 allowed');
assert(!isBlockedIp('8.8.8.8'), 'public DNS IPv4 allowed');
assert(!isBlockedIp('2606:2800:220:1:248:1893:25c8:1946'), 'public IPv6 allowed');

console.log('\n📝 Rejected URLs');
await expectRejected(() => assertPublicHttpUrl('http://127.0.0.1/'), 'http://127.0.0.1');
await expectRejected(() => assertPublicHttpUrl('http://localhost/secret'), 'localhost');
await expectRejected(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/'), 'AWS/GCP metadata IP');
await expectRejected(() => assertPublicHttpUrl('http://10.0.0.5:8080/'), 'RFC1918 10/8');
await expectRejected(() => assertPublicHttpUrl('http://192.168.0.1/'), 'RFC1918 192.168/16');
await expectRejected(() => assertPublicHttpUrl('http://172.31.255.1/'), 'RFC1918 172.16/12');
await expectRejected(() => assertPublicHttpUrl('http://[::1]/'), 'IPv6 loopback');
await expectRejected(() => assertPublicHttpUrl('http://[::ffff:127.0.0.1]/'), 'IPv4-mapped IPv6 loopback');
await expectRejected(() => assertPublicHttpUrl('file:///etc/passwd'), 'file: protocol');
await expectRejected(() => assertPublicHttpUrl('ftp://example.com/'), 'ftp: protocol');
await expectRejected(() => assertPublicHttpUrl('http://user:pass@example.com/', { lookup: publicLookup }), 'embedded credentials');
await expectRejected(() => assertPublicHttpUrl('http://2130706433/'), 'decimal-encoded IPv4');
await expectRejected(() => assertPublicHttpUrl('http://0x7f000001/'), 'hex-encoded IPv4');
await expectRejected(() => assertPublicHttpUrl('http://127.1/'), 'short-form IPv4');
await expectRejected(() => assertPublicHttpUrl('http://0177.0.0.1/'), 'octal-form IPv4');
await expectRejected(() => assertPublicHttpUrl('http://metadata.google.internal/'), 'GCP metadata hostname');
await expectRejected(() => assertPublicHttpUrl('http://foo.localhost/'), '.localhost suffix');
await expectRejected(
  () => assertPublicHttpUrl('http://evil.example/', {
    lookup: mockLookup({ 'evil.example': [{ address: '169.254.169.254', family: 4 }] }),
  }),
  'hostname resolving to metadata IP'
);
await expectRejected(
  () => assertPublicHttpUrl('http://mixed.example/', {
    lookup: mockLookup({
      'mixed.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
    }),
  }),
  'hostname with any private address in DNS set'
);
await expectRejected(
  () => assertPublicHttpUrl('http://missing.example/', { lookup: publicLookup }),
  'unresolvable hostname'
);

console.log('\n📝 Allowed public URLs');
{
  const result = await assertPublicHttpUrl('https://example.com/path?q=1', { lookup: publicLookup });
  assert(result.urlObj.hostname === 'example.com', 'https://example.com parses');
  assert(result.addresses[0].address === '93.184.216.34', 'returns resolved public address');
}
{
  const result = await assertPublicHttpUrl('http://8.8.8.8/dns-query');
  assert(result.addresses[0].address === '8.8.8.8', 'public IP literal allowed');
}
{
  const result = await assertPublicHttpUrl('https://dual.example/', { lookup: publicLookup });
  assert(result.addresses.length === 2, 'all-public dual-stack allowed');
}

console.log('\n📝 scrapeUrl / fallback reject private targets before fetch');
{
  const result = await webScrapingService.scrapeUrl('http://127.0.0.1/');
  assert(result.success === false, 'scrapeUrl(http://127.0.0.1) fails');
  assert(/not a public/i.test(result.error), 'scrapeUrl error mentions public host');
}
{
  const result = await webScrapingService.scrapeUrl('http://169.254.169.254/latest/meta-data/');
  assert(result.success === false, 'scrapeUrl(metadata IP) fails');
}
{
  try {
    await webScrapingService.fetchHtmlContent('http://10.0.0.1/', 1000);
    failed += 1;
    console.error('  ✗ fetchHtmlContent(private IP) should throw');
  } catch (error) {
    assert(error instanceof UnsafeUrlError, 'fetchHtmlContent throws UnsafeUrlError for private IP');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
