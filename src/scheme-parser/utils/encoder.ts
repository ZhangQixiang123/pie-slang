// Reversible encoding of Scheme identifiers into valid JavaScript identifiers.
// Adapted from scheme-slang, where these lived in the package root; pie-slang
// keeps them here so the transpiler's encode option stays self-contained.
//
// Every character outside [a-zA-Z0-9_] (including "$", so the escape itself
// stays unambiguous) is replaced by "$" followed by its four-digit hex char
// code. decode is the exact inverse of encode.

export function encode(identifier: string): string {
  return identifier.replace(
    /[^a-zA-Z0-9_]/g,
    c => "$" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export function decode(identifier: string): string {
  return identifier.replace(/\$[0-9a-fA-F]{4}/g, s =>
    String.fromCharCode(parseInt(s.slice(1), 16)),
  );
}
