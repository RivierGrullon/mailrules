import emailModule from 'validator/lib/isEmail.js';
import fqdnModule from 'validator/lib/isFQDN.js';

// These CommonJS subpaths export the function both directly and as `.default`.
// The explicit property also matches their NodeNext declaration-file shape.
const isEmail = emailModule.default;
const isFQDN = fqdnModule.default;

const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const urlSyntax = /[\s/@:\\?#%\[\]]/u;

/** Internal canonicalization shared by input and configuration. */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 1024 || controls.test(input)) return null;
  const domain = input.trim();
  if (!domain || urlSyntax.test(domain)) return null;

  let ascii: string;
  try {
    // WHATWG URL supplies browser-compatible IDNA conversion. Reject URL syntax
    // before parsing, then enforce DNS syntax rather than accepting arbitrary hosts.
    ascii = new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }

  if (ascii.length > 253 || !isFQDN(ascii, {
    require_tld: true, allow_numeric_tld: false,
    allow_trailing_dot: false, allow_underscores: false,
  })) return null;
  return ascii;
}

export function parseEmail(input: unknown): { email: string; domain: string } | null {
  if (typeof input !== 'string' || input.length > 1024 || controls.test(input)) return null;
  const trimmed = input.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  // This release supports ASCII mailboxes, including quoted local parts.
  if (/[^\x20-\x7e]/u.test(local)) return null;
  const rawDomain = trimmed.slice(at + 1);
  // Domain configuration may be trimmed; an address may not contain spaces here.
  if (rawDomain !== rawDomain.trim()) return null;
  const domain = normalizeDomain(rawDomain);
  if (domain === null) return null;
  const email = `${local}@${domain}`;
  if (!isEmail(email, {
    allow_utf8_local_part: false, allow_display_name: false,
    allow_ip_domain: false, require_tld: true, ignore_max_length: false,
  })) return null;
  return { email, domain };
}
