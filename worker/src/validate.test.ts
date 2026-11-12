import { describe, expect, it } from 'vitest';
import { validateTargetUrl } from './validate';

describe('validateTargetUrl', () => {
  it.each([
    'https://www.gutenberg.org/files/1342/1342-pdf.pdf',
    'http://example.com/book.pdf',
    'https://archive.org:443/download/x/x.pdf',
    'https://93.184.216.34/file.pdf',
  ])('allows %s', (url) => {
    expect(validateTargetUrl(url).href).toBeTruthy();
  });

  it.each([
    ['ftp://example.com/a.pdf', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['https://user:pw@example.com/a.pdf', 'credentials'],
    ['https://example.com:8080/a.pdf', 'port'],
    ['http://localhost/a.pdf', 'localhost'],
    ['http://printer.local/a.pdf', '.local'],
    ['http://db.internal/a.pdf', '.internal'],
    ['http://127.0.0.1/a.pdf', 'loopback'],
    ['http://10.0.0.5/a.pdf', 'private'],
    ['http://172.20.1.1/a.pdf', 'private'],
    ['http://192.168.1.1/a.pdf', 'private'],
    ['http://169.254.169.254/latest/meta-data', 'metadata'],
    ['http://0.0.0.0/', 'unspecified'],
    ['http://[::1]/a.pdf', 'ipv6 loopback'],
    ['http://[fd00::1]/a.pdf', 'ipv6 ula'],
    ['http://[::ffff:127.0.0.1]/a.pdf', 'mapped loopback'],
    ['http://2130706433/a.pdf', 'decimal ip'],
    ['http://intranet/a.pdf', 'single label'],
    ['not a url', 'garbage'],
  ])('rejects %s (%s)', (url) => {
    expect(() => validateTargetUrl(url)).toThrow();
  });
});
