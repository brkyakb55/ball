'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { attach } = require('./ws-lite');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const TICK = 1 / 60;
const INDEX = path.join(__dirname, 'public', 'index.html');
let indexHtml = fs.readFileSync(INDEX);

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/health')) { res.writeHead(200); res.end('ok'); return; }
  if (process.env.NODE_ENV !== 'production') indexHtml = fs.readFileSync(INDEX);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(indexHtml);
});

const clients = new Map(); // id -> client
const rooms = new Map();   // code -> room
let nextId = 1;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanText = (s, max, fb) => {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || fb;
};
const send = (c, obj) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); };

function roomInfo(room) {
  return {
    t: 'room', code: room.code, name: room.name, state: room.state, host: room.host,
    teamSize: room.teamSize, bots: room.bots, lateJoin: room.lateJoin, private: !!room.password,
    members: [...room.members.values()].map(m => ({ id: m.id, nick: m.nick, team: m.team, spectator: !!m.spectator }))
  };
}
function broadcastRoom(room) {
  const info = roomInfo(room);
  for (const m of room.members.values()) send(m, { ...info, me: m.id });
}
function roomList() {
  return [...rooms.values()].filter(r => !r.password).map(r => ({ code: r.code, name: r.name, n: r.members.size, state: r.state, teamSize: r.teamSize, private: false }));
}
function broadcastRooms() {
  const list = { t: 'rooms', list: roomList() };
  for (const c of clients.values()) if (!c.room) send(c, list);
}
function sendRoster(room) {
  if (!room.game) return;
  const slots = room.game.players.map(p => ({ name: p.name, t: p.t, human: p.human, active: p.active }));
  for (const m of room.members.values()) send(m, { t: 'roster', slots, me: m.slot == null ? -1 : m.slot });
}

function uniqueNick(room, nick) {
  const taken = new Set([...room.members.values()].map(m => m.nick.toLowerCase()));
  if (!taken.has(nick.toLowerCase())) return nick;
  for (let i = 2; i < 99; i++) { const n = (nick.slice(0, 12) + i); if (!taken.has(n.toLowerCase())) return n; }
  return nick;
}
function humansOn(room, t) { return [...room.members.values()].filter(m => !m.spectator && m.team === t).length; }
function playerCount(room) { return [...room.members.values()].filter(m => !m.spectator).length; }
function seatAvailable(room, team) { return room.game && room.game.players.find(p => p.t === team && (!p.active || (room.bots && !p.human))); }

function joinRoom(c, room, password, spectator = false) {
  if (c.room) leaveRoom(c);
  if (room.password && String(password || '') !== room.password) { send(c, { t: 'err', msg: 'Oda şifresi yanlış.' }); return false; }
  if (room.members.size >= 20) { send(c, { t: 'err', msg: 'Oda dolu (en fazla 20 kişi, seyirciler dahil).' }); return false; }
  if (!spectator && room.state === 'lobby' && playerCount(room) >= room.teamSize * 2) { send(c, { t: 'err', msg: 'Oyuncu yerleri dolu. Seyirci olarak katılabilirsin.' }); return false; }
  let team = humansOn(room, 0) <= humansOn(room, 1) ? 0 : 1;
  if (!spectator && room.state !== 'lobby' && room.game) {
    if (!room.lateJoin) { send(c, { t: 'err', msg: 'Maç başladı. Sonraki maçı bekleyebilir veya seyirci olarak girebilirsin.' }); return false; }
    if (room.bots) {
      const free = t => room.game.players.some(p => p.t === t && p.active && !p.human);
      if (!free(team)) team = 1 - team;
      if (!free(team)) { send(c, { t: 'err', msg: 'Maçta boş oyuncu yeri yok. Seyirci olarak katılabilirsin.' }); return false; }
    } else {
      const free = t => room.game.players.some(p => p.t === t && !p.active);
      if (!free(team)) team = 1 - team;
      if (!free(team)) { send(c, { t: 'err', msg: 'Maçta boş oyuncu yeri yok. Seyirci olarak katılabilirsin.' }); return false; }
    }
  }
  c.nick = uniqueNick(room, c.nick);
  c.room = room; c.team = spectator ? null : team; c.spectator = !!spectator; c.slot = null; room.members.set(c.id, c);
  if (!c.spectator && room.state !== 'lobby' && room.game) seatInGame(room, c);
  if (!room.host) room.host = c.id;
  broadcastRoom(room); sendRoster(room); broadcastRooms();
  return true;
}
function seatInGame(room, c) {
  if (!room.game || c.spectator) return;
  let p = room.game.players.find(q => q.t === c.team && (!q.active || (room.bots && !q.human)));
  if (!p && room.lateJoin) p = room.game.players.find(q => !q.active);
  if (!p) return;
  p.active = true; p.human = true; p.id = c.id; p.name = c.nick; p.inp = { x: 0, y: 0, sp: false }; c.team = p.t; c.slot = p.slot;
}
function unseat(room, c) {
  if (room.game && c.slot != null) {
    const p = room.game.players[c.slot];
    if (p && p.id === c.id) {
      p.id = null; p.inp = { x: 0, y: 0, sp: false }; p.req = null;
      if (room.bots) { p.active = true; p.human = false; p.name = 'Bot'; }
      else { p.active = false; p.human = false; p.name = ''; if (room.game.holder === p) room.game.holder = null; }
    }
  }
  c.slot = null;
}

function leaveRoom(c) {
  const room = c.room; if (!room) return;
  unseat(room, c);
  room.members.delete(c.id); c.room = null;
  if (room.members.size === 0) { rooms.delete(room.code); }
  else {
    if (room.host === c.id) room.host = room.members.keys().next().value;
    broadcastRoom(room); sendRoster(room);
  }
  send(c, { t: 'left' });
  broadcastRooms();
}

function startMatch(room) {
  if (!room.bots && humansOn(room, 0) + humansOn(room, 1) < 1) {
    for (const m of room.members.values()) send(m, { t: 'err', msg: 'Maçı başlatmak için en az bir oyuncu olmalı.' }); return;
  }
  const slots = [];
  for (const t of [0, 1]) {
    const hs = [...room.members.values()].filter(m => !m.spectator && m.team === t).slice(0, room.teamSize);
    for (let i = 0; i < room.teamSize; i++) {
      const h = hs[i];
      slots.push(h ? { t, name: h.nick, human: true, active: true, id: h.id } : room.bots ? { t, name: 'Bot', human: false, active: true } : { t, name: '', human: false, active: false });
    }
  }
  room.game = new Game(slots); room.state = 'playing'; room.overAt = 0;
  for (const m of room.members.values()) m.slot = null;
  for (const p of room.game.players) if (p.human) { const m = room.members.get(p.id); if (m) m.slot = p.slot; }
  broadcastRoom(room); sendRoster(room); broadcastRooms();
}
function backToLobby(room) {
  room.state = 'lobby'; room.game = null; room.overAt = 0;
  for (const m of room.members.values()) m.slot = null;
  broadcastRoom(room); broadcastRooms();
}

attach(server, ws => {
  const c = { id: String(nextId++), ws, nick: 'Oyuncu', room: null, team: 0, slot: null, alive: true };
  clients.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  send(c, { t: 'hi', id: c.id }); send(c, { t: 'rooms', list: roomList() });

  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'nick': c.nick = cleanText(m.nick, 14, 'Oyuncu'); break;
      case 'create': {
        c.nick = cleanText(m.nick, 14, 'Oyuncu');
        const room = { code: newCode(), name: cleanText(m.name, 22, c.nick + ' odası'), host: null, members: new Map(), state: 'lobby', game: null, overAt: 0, teamSize: [1,2,3].includes(Number(m.teamSize)) ? Number(m.teamSize) : 1, bots: m.bots !== false, lateJoin: m.lateJoin !== false, password: cleanText(m.password, 32, '') };
        rooms.set(room.code, room); joinRoom(c, room, room.password, false); break;
      }
      case 'join': {
        c.nick = cleanText(m.nick, 14, 'Oyuncu');
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { send(c, { t: 'err', msg: 'Oda bulunamadı.' }); break; }
        joinRoom(c, room, m.password, !!m.spectator); break;
      }
      case 'leave': leaveRoom(c); break;
      case 'team': {
        const room = c.room; if (!room || room.state !== 'lobby' || c.spectator) break;
        const t = m.team === 1 ? 1 : 0;
        if (c.team !== t && humansOn(room, t) < room.teamSize) { c.team = t; broadcastRoom(room); }
        break;
      }
      case 'role': {
        const room = c.room; if (!room) break;
        if (m.spectator) { unseat(room, c); c.spectator = true; c.team = null; }
        else {
          if (room.state !== 'lobby' && !room.lateJoin) { send(c, { t: 'err', msg: 'Maç başladı; oyuncu olarak sonraki maçta katılabilirsin.' }); break; }
          if (room.state === 'lobby' && playerCount(room) >= room.teamSize * 2) { send(c, { t: 'err', msg: 'Oyuncu yerleri dolu.' }); break; }
          c.spectator = false; c.team = humansOn(room, 0) <= humansOn(room, 1) ? 0 : 1;
          if (room.state !== 'lobby' && room.game) { if (room.bots) { if (!seatAvailable(room, c.team)) c.team = 1 - c.team; if (!seatAvailable(room, c.team)) { c.spectator = true; c.team = null; send(c, { t: 'err', msg: 'Boş oyuncu yeri yok.' }); break; } } else { if (!room.game.players.some(p => p.t === c.team && !p.active)) c.team = 1 - c.team; if (!room.game.players.some(p => p.t === c.team && !p.active)) { c.spectator = true; c.team = null; send(c, { t: 'err', msg: 'Boş oyuncu yeri yok.' }); break; } } seatInGame(room, c); }
        }
        broadcastRoom(room); sendRoster(room); break;
      }
      case 'start': {
        const room = c.room; if (!room || room.host !== c.id || room.state !== 'lobby') break;
        startMatch(room); break;
      }
      case 'lobby': {
        const room = c.room; if (!room || room.host !== c.id || room.state === 'lobby') break;
        backToLobby(room); break;
      }
      case 'in': {
        const room = c.room; if (!room || !room.game || c.slot == null) break;
        const p = room.game.players[c.slot]; if (!p || p.id !== c.id) break;
        const cl = v => { v = Number(v); return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; };
        p.inp = { x: cl(m.x), y: cl(m.y), sp: !!m.sp };
        break;
      }
      case 'ev': {
        const room = c.room; if (!room || !room.game || c.slot == null) break;
        const p = room.game.players[c.slot]; if (!p || p.id !== c.id) break;
        if (m.k === 'ball' || m.k === 'fwd') p.req = m.k;
        break;
      }
    }
  });
  ws.on('close', () => { leaveRoom(c); clients.delete(c.id); });
  ws.on('error', () => {});
});

// oyun döngüsü: sabit 60 Hz adım, 30 Hz yayın
let last = Date.now(), acc = 0, tick = 0;
setInterval(() => {
  const now = Date.now(); acc += Math.min(0.25, (now - last) / 1000); last = now;
  while (acc >= TICK) {
    acc -= TICK; tick++;
    for (const room of rooms.values()) {
      if (room.state === 'lobby' || !room.game) continue;
      room.game.step(TICK);
      if (tick % 2 === 0) {
        const snap = room.game.snap(); room.game.events = [];
        for (const m of room.members.values()) {
          const p = m.slot != null ? room.game.players[m.slot] : null;
          send(m, { t: 'st', ...snap, c: p ? [Math.max(0, +(p.ecool || 0).toFixed(2)), Math.max(0, +(p.dcool || 0).toFixed(2))] : [0, 0] });
        }
      }
      if (room.game.over) {
        if (!room.overAt) { room.overAt = now; room.state = 'over'; broadcastRoom(room); broadcastRooms(); }
        else if (now - room.overAt > 12000) backToLobby(room);
      }
    }
  }
}, 1000 / 60);

// bağlantıları canlı tut (Render vb. boşta kalan bağlantıları keser)
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false; try { c.ws.ping(); } catch (e) {}
  }
}, 25000);
setInterval(broadcastRooms, 4000);

server.listen(PORT, () => console.log('Sunucu hazir: http://localhost:' + PORT));
