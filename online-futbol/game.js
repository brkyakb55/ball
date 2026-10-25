'use strict';
// Oyun mantığı (sunucuda çalışır). Tarayıcıdan bağımsızdır.
const W = 1000, H = 600, L = 58, R = 942, T = 30, B = 570, GY1 = 225, GY2 = 375, GD = 52, PR = 17, BR = 8, CR = 88;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SLOT_X = [360, 230, 230, 640, 770, 770];
const SLOT_Y = [300, 170, 430, 300, 170, 430];
const SLOT_SY = [0, -130, 130, 0, -150, 150];
const r1 = v => Math.round(v * 10) / 10;

class Game {
  // slots: iki takımın seçilen kadro boyutuna göre sabit slotları; pasif slotlar active:false
  constructor(slots) {
    this.score = [0, 0]; this.time = 120; this.freeze = 0; this.over = false; this.banner = '';
    this.kick = { on: false, t: 0, team: 0, holder: null }; this.kickTeam = 0; this.events = [];
    this.holder = null;
    this.teamSize = slots.length / 2;
    this.players = slots.map((s, i) => {
      const t = s.t, local = i % this.teamSize;
      const xs = t === 0 ? [360, 230, 230] : [640, 770, 770];
      const ys = this.teamSize === 1 ? [300] : this.teamSize === 2 ? [230, 370] : [300, 170, 430];
      const sys = ys[local] - 300;
      return { slot: i, t, name: s.name, human: !!s.human, active: s.active !== false, id: s.id || null,
      ox: xs[local], oy: ys[local], sy: sys,
      inp: { x: 0, y: 0, sp: false }, req: null
    };
    });
    this.place();
  }

  place() {
    for (const p of this.players) {
      Object.assign(p, {
        x: p.ox, y: p.oy, vx: 0, vy: 0, face: p.t ? Math.PI : 0, cool: 0, charge: 0, hold: 0,
        dcool: 0, ecool: 0, dsh: 0, dash: 0, lunge: false, lg: 0, gt: 0, av: 0, fa: 0, turn: 0,
        pf: undefined, bCharge: 0, sCharge: 0, pt: 0, psp: false, sprev: false, dcv: 0, ba: undefined, mx: 0, my: 0
      });
      p.req = null;
    }
    this.ball = { x: 500, y: 300, vx: 0, vy: 0, z: 0, vz: 0, curve: 0 };
    this.holder = null;
    const kk = this.players.find(p => p.t === this.kickTeam && p.active) || this.players.find(p => p.active);
    if (!kk) return;
    this.kickTeam = kk.t;
    kk.x = this.kickTeam ? 526 : 474; kk.y = 300; kk.face = this.kickTeam ? Math.PI : 0; kk.ba = kk.face;
    this.holder = kk;
    this.kick = { on: true, t: 3, team: kk.t, holder: kk };
  }

  canSteal(st, h) {
    const a = Math.atan2(st.y - h.y, st.x - h.x), b = h.ba === undefined ? h.face : h.ba;
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1.25;
  }

  throwBall(p, power, hard, lob) {
    const ball = this.ball, a = p.face;
    const s = lob ? 140 + 110 * power : hard ? 170 + 430 * power : 230 + 380 * power;
    ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s; ball.curve = 0;
    if (Math.abs(p.turn || 0) > .45) ball.curve = Math.sign(p.turn) * 1.2;
    this.holder = null; p.cool = .4; p.charge = 0; p.hold = 0;
    ball.z = lob ? 1 : 0; ball.vz = lob ? 380 + 120 * power : 0;
  }

  take(p) {
    const ball = this.ball;
    ball.curve = 0; ball.z = 0; ball.vz = 0; p.ba = p.face;
    if (this.holder) this.holder.cool = .9;
    this.holder = p; p.charge = 0; p.hold = 0;
  }

  turnTo(p, ang, dt, rate) {
    const d = Math.atan2(Math.sin(ang - p.face), Math.cos(ang - p.face));
    p.face += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  ai(p, dt) {
    const ball = this.ball, players = this.players.filter(q => q.active), holder = this.holder;
    const dir = p.t ? -1 : 1, own = p.t ? R : L, goalX = p.t ? L : R;
    const mates = players.filter(q => q.t === p.t), foes = players.filter(q => q.t !== p.t);
    const gt0 = p.gt || 0; p.gt = 0;
    const chaser = mates.reduce((a, b) => dist(a, ball) <= dist(b, ball) ? a : b);
    const bs = Math.hypot(ball.vx, ball.vy);
    let tx = p.x, ty = p.y;
    if (holder === p) {
      p.hold += dt;
      const gd = Math.hypot(goalX - p.x, 300 - p.y);
      const f = foes.reduce((a, b) => dist(a, p) <= dist(b, p) ? a : b);
      const close = dist(f, p) < PR * 2 + 30;
      tx = goalX; ty = 300;
      if (dist(f, p) < 95 && dir * (f.x - p.x) > -10) ty = p.y + (p.y > f.y ? 1 : -1) * 130;
      if ((gd < 300 && Math.abs(p.y - 300) < 190) || p.hold > 3.6) {
        p.face = Math.atan2(300 + Math.sin(p.hold * 5 + p.x) * 55 - p.y, goalX - p.x);
        this.throwBall(p, .65, true); return;
      }
      if (close && p.hold > .7) {
        const q = mates.filter(m => m !== p).reduce((a, b) => dir * a.x >= dir * b.x ? a : b);
        if (q && dir * (q.x - p.x) > -60) { p.face = Math.atan2(q.y - p.y, q.x - p.x); this.throwBall(p, .5, false); return; }
      }
    } else if (holder && holder.t !== p.t) {
      if (chaser === p) {
        tx = holder.x; ty = holder.y;
        if (dist(p, holder) < PR * 2 + 6 && this.canSteal(p, holder) && p.cool <= 0 && Math.random() < dt * .9) this.take(p);
      } else { tx = own + (holder.x - own) * .5; ty = 300 + (holder.y - 300) * .6 + p.sy * .4; }
    } else if (holder) {
      tx = holder.x + dir * 130; ty = 300 + p.sy;
    } else {
      if (chaser === p) {
        tx = ball.x + ball.vx * .25; ty = ball.y + ball.vy * .25;
        if (!(ball.z > 14) && dist(p, ball) < PR + BR + (bs > 110 ? 24 : 10) && p.cool <= 0) {
          p.gt = gt0 + dt; if (p.gt >= (bs > 110 ? 0 : .3)) { this.take(p); p.gt = 0; }
        }
      } else { tx = own + (ball.x - own) * .55; ty = 300 + (ball.y - 300) * .5 + p.sy * .6; }
    }
    tx = Math.max(L + PR, Math.min(R - PR, tx)); ty = Math.max(T + PR, Math.min(B - PR, ty));
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 8) { p.mx = dx / d; p.my = dy / d; } else { p.mx = 0; p.my = 0; }
    this.turnTo(p, this.holder === p ? Math.atan2(dy, dx) : Math.atan2(ball.y - p.y, ball.x - p.x), dt, 8);
  }

  human(p, dt) {
    const ball = this.ball, inp = p.inp;
    p.mx = inp.x; p.my = inp.y;
    const m = Math.hypot(p.mx, p.my); if (m > 1) { p.mx /= m; p.my /= m; }
    if (p.mx || p.my) {
      const tf = Math.atan2(p.my, p.mx);
      let fd = Math.atan2(Math.sin(tf - p.face), Math.cos(tf - p.face)); p.fa = Math.abs(fd);
      if (Math.abs(fd) > 2.8) { const dr = Math.abs(p.av || 0) > .3 ? Math.sign(p.av) : (Math.sign(fd) || 1); if (Math.sign(fd) !== dr) fd += dr * 6.2832; }
      const tav = Math.max(-7, Math.min(7, fd * 7));
      p.av = (p.av || 0) + (tav - (p.av || 0)) * Math.min(1, dt * 9); p.face += p.av * dt;
    }
    if (!(p.mx || p.my)) { p.fa = 0; p.av = (p.av || 0) * Math.exp(-dt * 10); p.face += p.av * dt; }
    {
      const pf = p.pf === undefined ? p.face : p.pf, d = Math.atan2(Math.sin(p.face - pf), Math.cos(p.face - pf));
      p.turn = (p.turn || 0) * Math.exp(-dt * 8) + d; p.pf = p.face;
    }
    let req = p.req;
    if (req === 'fwd' && !this.holder && p.cool > -.4 && dist(p, ball) < 330) req = 'ball';
    const cdk = req === 'ball' ? 'ecool' : 'dcool';
    if (req && !(p.dash > 0) && (p[cdk] || 0) <= 0) {
      let dx = Math.cos(p.face), dy = Math.sin(p.face), dur = .17, ok = true, sp0 = 520;
      if (req === 'ball') {
        const holder = this.holder;
        const tg = holder ? (holder === p ? null : holder) : ball;
        const bs = (tg === ball) ? Math.hypot(ball.vx, ball.vy) : 0;
        if (tg && dist(p, tg) < 105 + bs * .35) {
          const tx = tg.x + (tg === ball ? ball.vx * .2 : 0), ty = tg.y + (tg === ball ? ball.vy * .2 : 0), d = Math.hypot(tx - p.x, ty - p.y) || 1;
          dx = (tx - p.x) / d; dy = (ty - p.y) / d;
          if (bs > 150) sp0 = Math.max(650, bs * 1.25);
          dur = Math.min(.6, Math.max(.12, (d - PR) / sp0 + .08)); p.lunge = true;
        } else ok = false;
      }
      if (ok) {
        p.dash = dur; p.dvx = dx * sp0; p.dvy = dy * sp0; p[cdk] = 3;
        const tn = p.turn || 0;
        p.dcv = (req === 'fwd' && Math.abs(tn) > .12) ? Math.sign(tn) * Math.min(1, Math.abs(tn) / .5) * 6 : 0;
        if (req === 'fwd' && this.holder === p) p.dsh = .8;
      }
    }
    p.req = null;
    const holder = this.holder;
    if (p.dash > 0 && p.lunge) {
      if ((!holder && !(ball.z > 14) && dist(p, ball) < PR + BR + 22) || (holder && holder.t !== p.t && dist(p, holder) < PR * 2 + 14 && this.canSteal(p, holder))) { p.dash = 0; p.lg = 1; p.gt = .3; }
    }
    if (!(p.dash > 0)) p.lunge = false;
    p.lg = (p.lg || 0) - dt;
    let near = false;
    if (p.cool <= 0 || p.lg > 0) {
      if (!this.holder && !(ball.z > 14) && dist(p, ball) < PR + BR + (Math.hypot(ball.vx, ball.vy) > 110 ? 36 : 22)) near = true;
      else if (this.holder && this.holder.t !== p.t && p.lg > 0 && dist(p, this.holder) < PR * 2 + 14 && this.canSteal(p, this.holder)) near = true;
    }
    if (near) { p.gt = (p.gt || 0) + dt; if (p.gt >= 0) { this.take(p); p.gt = 0; p.lg = 0; } } else p.gt = 0;
    const b = !!inp.sp;
    // Şut tek basışta çıkar; güç biriktirme yok.
    if (b && !p.sprev) {
      if (this.holder === p || (!this.holder && dist(p, ball) < PR + BR + 24)) {
        this.throwBall(p, .78, true);
      }
    }
    p.sprev = b;
  }

  bound(o, r) {
    let minX = L + r, maxX = R - r;
    if (o.y > GY1 + r && o.y < GY2 - r) { minX = L - GD + r; maxX = R + GD - r; }
    if (o.x < L + r || o.x > R - r) o.y = Math.max(GY1 + r, Math.min(GY2 - r, o.y));
    o.x = Math.max(minX, Math.min(maxX, o.x)); o.y = Math.max(T + r, Math.min(B - r, o.y));
  }

  goal(t) {
    this.banner = t; this.freeze = 1.6; this.ball.vx = this.ball.vy = 0; this.holder = null; this.events.push('goal');
  }

  step(dt) {
    if (this.over) return;
    if (this.freeze > 0) { this.freeze -= dt; if (this.freeze <= 0) { this.banner = ''; this.place(); } return; }
    this.time -= dt; if (this.time <= 0) { this.time = 0; this.over = true; return; }
    const players = this.players.filter(p => p.active), ball = this.ball;
    for (const p of players) {
      p.cool -= dt; p.dcool = (p.dcool || 0) - dt; p.ecool = (p.ecool || 0) - dt; p.dsh = (p.dsh || 0) - dt;
      if (p.human) this.human(p, dt); else this.ai(p, dt);
      const hp = this.holder === p;
      const sp = (p.human ? 190 : 155) * (hp ? .94 : 1) * (p.human ? 1 - .82 * Math.min(1, Math.max(0, ((p.fa || 0) - .25) / 1.65)) : 1);
      const k = Math.min(1, dt * ((p.human && (p.fa || 0) > .5) ? 18 : 9));
      if (p.dash > 0) {
        if (p.dcv) { const th = p.dcv * dt, c = Math.cos(th), sn = Math.sin(th), ox = p.dvx; p.dvx = ox * c - p.dvy * sn; p.dvy = ox * sn + p.dvy * c; }
        p.vx = p.dvx; p.vy = p.dvy; p.dash -= dt;
      } else { p.vx += (p.mx * sp - p.vx) * k; p.vy += (p.my * sp - p.vy) * k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.bound(p, PR);
    }
    const kick = this.kick;
    if (kick.on) { kick.t -= dt; if (kick.t <= 0 || this.holder !== kick.holder) kick.on = false; }
    if (kick.on) for (const p of players) if (p.t !== kick.team) {
      if (p.t === 1) p.x = Math.max(p.x, 500 + PR); else p.x = Math.min(p.x, 500 - PR);
      const cx = p.x - 500, cy = p.y - 300, cd = Math.hypot(cx, cy);
      if (cd < CR + PR) { const ux = cd > 1 ? cx / cd : (p.t === 1 ? 1 : -1), uy = cd > 1 ? cy / cd : 0; p.x = 500 + ux * (CR + PR); p.y = 300 + uy * (CR + PR); }
    }
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j], d = dist(a, b);
      if (d < PR * 2 && d > 0) { const o = (PR * 2 - d) / 2, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o; }
    }
    const holder = this.holder;
    if (holder) {
      holder.ba = holder.face;
      ball.x = holder.x + Math.cos(holder.ba) * (PR + BR + 1); ball.y = holder.y + Math.sin(holder.ba) * (PR + BR + 1);
      this.bound(ball, BR);
      const dx = holder.x - ball.x, dy = holder.y - ball.y, d = Math.hypot(dx, dy), md = PR + BR + 1;
      if (d < md && d > 0) { holder.x = ball.x + dx / d * md; holder.y = ball.y + dy / d * md; this.bound(holder, PR); }
      ball.vx = ball.vy = 0;
    } else {
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const f = Math.pow(ball.z > 0 ? .85 : .45, dt); ball.vx *= f; ball.vy *= f;
      if (ball.z > 0 || ball.vz > 0) { ball.vz -= 900 * dt; ball.z += ball.vz * dt; if (ball.z <= 0) { ball.z = 0; if (Math.abs(ball.vz) > 120) { ball.vz = -ball.vz * .35; ball.z = .01; } else ball.vz = 0; } }
      if (ball.curve) {
        if (Math.hypot(ball.vx, ball.vy) > 90) { const th = ball.curve * dt, c = Math.cos(th), sn = Math.sin(th), ovx = ball.vx; ball.vx = ovx * c - ball.vy * sn; ball.vy = ovx * sn + ball.vy * c; ball.curve *= Math.pow(.5, dt); }
        else ball.curve = 0;
      }
      for (const p of players) {
        const d = dist(p, ball);
        if (d < PR + BR && d > 0 && p.cool <= 0 && !(p.gt > 0) && !(ball.z > 14)) {
          const nx = (ball.x - p.x) / d, ny = (ball.y - p.y) / d;
          ball.x = p.x + nx * (PR + BR); ball.y = p.y + ny * (PR + BR);
          const dot = ball.vx * nx + ball.vy * ny; if (dot < 0) { ball.vx -= 1.6 * dot * nx; ball.vy -= 1.6 * dot * ny; }
          ball.vx += p.vx * .5; ball.vy += p.vy * .5;
        }
      }
      const inY = ball.y > GY1 + BR && ball.y < GY2 - BR;
      let minX = L + BR, maxX = R - BR, minY = T + BR, maxY = B - BR;
      if (inY) { minX = L - GD + BR; maxX = R + GD - BR; }
      if (ball.x < L || ball.x > R) { minY = GY1 + BR; maxY = GY2 - BR; }
      if (ball.x < minX) { ball.x = minX; ball.vx *= -.8; } if (ball.x > maxX) { ball.x = maxX; ball.vx *= -.8; }
      if (ball.y < minY) { ball.y = minY; ball.vy *= -.8; } if (ball.y > maxY) { ball.y = maxY; ball.vy *= -.8; }
    }
    if (ball.x > R + 4) { this.score[0]++; this.kickTeam = 1; this.goal('GOL! Mavi'); }
    else if (ball.x < L - 4) { this.score[1]++; this.kickTeam = 0; this.goal('GOL! Kırmızı'); }
  }

  snap() {
    const b = this.ball, k = this.kick;
    return {
      tm: Math.round(this.time * 10) / 10, s: this.score, ov: this.over ? 1 : 0, bn: this.banner,
      k: k.on ? [k.team, Math.round(k.t * 100) / 100] : 0,
      b: [r1(b.x), r1(b.y), r1(b.z || 0)],
      h: this.holder ? this.players.indexOf(this.holder) : -1,
      p: this.players.map(p => p.active ? [r1(p.x), r1(p.y), Math.round(p.face * 1000) / 1000, p.dash > 0 ? 1 : 0, Math.round(Math.max(p.bCharge || 0, p.sCharge || 0) * 100) / 100] : null),
      ev: this.events
    };
  }
}

module.exports = { Game };
