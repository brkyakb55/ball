'use strict';
// Bağımlılıksız küçük WebSocket sunucusu (RFC 6455: metin mesajı, ping/pong, kapatma).
const crypto = require('crypto');
const EventEmitter = require('events');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 8192;

class Conn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.readyState = 1; this.buf = Buffer.alloc(0); this.parts = [];
    socket.setNoDelay(true);
    socket.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      if (this.buf.length > 65536) { this.terminate(); return; }
      this._parse();
    });
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _parse() {
    for (;;) {
      const b = this.buf;
      if (this.readyState !== 1 || b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > MAX_FRAME) { this.terminate(); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) { this._frame(0x8, Buffer.alloc(0)); this.socket.end(); this._closed(); return; }
      if (op === 0x9) { this._frame(0xA, payload); continue; }
      if (op === 0xA) { this.emit('pong'); continue; }
      if (op === 0x1 || op === 0x0) {
        this.parts.push(payload);
        if (this.parts.reduce((n, p) => n + p.length, 0) > MAX_FRAME) { this.terminate(); return; }
        if (fin) { const s = Buffer.concat(this.parts).toString('utf8'); this.parts = []; this.emit('message', s); }
      }
    }
  }
  _frame(op, payload) {
    if (this.socket.destroyed || !this.socket.writable) return;
    const n = payload.length; let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(str) { if (this.readyState === 1) this._frame(0x1, Buffer.from(String(str), 'utf8')); }
  ping() { if (this.readyState === 1) this._frame(0x9, Buffer.alloc(0)); }
  terminate() { this.socket.destroy(); this._closed(); }
  _closed() { if (this.readyState !== 3) { this.readyState = 3; this.emit('close'); } }
}

function attach(server, onConnection) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onConnection(new Conn(socket), req);
  });
}
module.exports = { attach };
