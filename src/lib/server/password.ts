/**
 * Password hashing with PBKDF2-SHA256 (Web Crypto, built into Workers).
 * Chosen over Better Auth's default scrypt: scrypt runs in JavaScript and goes over the 10 ms CPU limit
 * of the free Workers plan; PBKDF2 runs natively. 100 000 iterations is the maximum Workers allows.
 * Stored as `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`.
 */
const ITERATIONS = 100_000;
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [scheme, iter, salt, expected] = hash.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2-sha256" || !salt || !expected || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const actual = new Uint8Array(await derive(password, unb64(salt), iterations));
  const want = unb64(expected);
  if (actual.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= actual[i] ^ want[i]; // constant time
  return diff === 0;
}
