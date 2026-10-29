/* Minimal, dependency-free SHA-256 for Uint8Array input, returning a lowercase hex digest.
   Used only to fingerprint input/output files in the validation-run ZIP for debugging —
   not for anything security-sensitive. Self-contained so it works with no secure-context
   requirement (unlike window.crypto.subtle, which some locked-down browser policies restrict). */
function sha256Hex(bytes) {
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var len = bytes.length;
  var withOne = len + 1;
  var padded = ((withOne + 8 + 63) >> 6) << 6;
  var buf = new Uint8Array(padded);
  buf.set(bytes);
  buf[len] = 0x80;
  var bitLenHi = Math.floor(len / 0x20000000);
  var bitLenLo = (len << 3) >>> 0;
  buf[padded - 4] = (bitLenLo >>> 24) & 0xff;
  buf[padded - 3] = (bitLenLo >>> 16) & 0xff;
  buf[padded - 2] = (bitLenLo >>> 8) & 0xff;
  buf[padded - 1] = bitLenLo & 0xff;
  buf[padded - 8] = (bitLenHi >>> 24) & 0xff;
  buf[padded - 7] = (bitLenHi >>> 16) & 0xff;
  buf[padded - 6] = (bitLenHi >>> 8) & 0xff;
  buf[padded - 5] = bitLenHi & 0xff;

  var w = new Uint32Array(64);
  var view = new DataView(buf.buffer);
  for (var offset = 0; offset < padded; offset += 64) {
    for (var i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (i = 16; i < 64; i++) {
      var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  var hex = '';
  for (i = 0; i < 8; i++) hex += ('00000000' + H[i].toString(16)).slice(-8);
  return hex;

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
}
