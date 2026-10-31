import { CAMPAIGN_STAGES } from './game.js';
// Canvas-native cockpit UI. No fonts, icons, or images are loaded from outside the browser.
const W = 540;
const H = 900;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const COLORS = {
  ink: "#071622",
  deep: "#091d2d",
  cyan: "#76f6eb",
  pale: "#e7f9f4",
  muted: "#83a8b1",
  gold: "#ffd98b",
  coral: "#ff775f",
  line: "rgba(135, 244, 231, .25)"
};

const glyphWidths = new Map();
function text(ctx, value, x, y, size, color, weight = 600, align = "left", spacing = 0) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = weight + " " + size + "px Arial, sans-serif";
  if (!spacing) {
    ctx.fillText(String(value), x, y);
    return;
  }
  const chars = String(value).split("");
  const widths = chars.map(c => {
    const key = ctx.font + "\0" + c;
    let width = glyphWidths.get(key);
    if (width === undefined) { width = ctx.measureText(c).width; glyphWidths.set(key, width); }
    return width;
  });
  const width = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * spacing;
  let px = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], px, y);
    px += widths[i] + spacing;
  }
}

function polygon(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function rule(ctx, x1, y1, x2, y2, color = COLORS.line, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function bracket(ctx, x, y, w, h, color = COLORS.cyan) {
  const s = 13;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y);
  ctx.moveTo(x + w - s, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + s);
  ctx.moveTo(x + w, y + h - s); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - s, y + h);
  ctx.moveTo(x + s, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - s);
  ctx.stroke();
}

function panel(ctx, x, y, w, h, alpha = 0.83) {
  polygon(ctx, [[x + 9, y], [x + w, y], [x + w, y + h - 9], [x + w - 9, y + h], [x, y + h], [x, y + 9]],
    "rgba(6, 22, 35, " + alpha + ")", COLORS.line);
  rule(ctx, x + 9, y + 1, x + 36, y + 1, COLORS.cyan, 2);
}

function iconPlane(ctx, x, y, scale, active = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = active ? 1 : 0.28;
  polygon(ctx, [[0, -10], [3, -3], [11, 0], [11, 3], [3, 2], [2, 8], [-2, 8], [-3, 2], [-11, 3], [-11, 0], [-3, -3]],
    active ? COLORS.cyan : COLORS.muted);
  ctx.restore();
}

function iconBomb(ctx, x, y, active = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = active ? 1 : 0.25;
  ctx.strokeStyle = active ? COLORS.gold : COLORS.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
  rule(ctx, -10, 0, -5, 0, ctx.strokeStyle);
  rule(ctx, 5, 0, 10, 0, ctx.strokeStyle);
  rule(ctx, 0, -10, 0, -5, ctx.strokeStyle);
  rule(ctx, 0, 5, 0, 10, ctx.strokeStyle);
  ctx.restore();
}

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.banner = "";
    this.bannerTime = 0;
    // Sector, flagship, phase and extend moments are drawn by Sequences (src/sequences.js).
    // Their banner text is still kept here for the phone flight-signal readout.
    this.bannerSequenced = false;
    this.deferSequencedBanners = true;
    this.encounterName = "";
    this.encounterTime = 0;
    this.lastMode = "";
    this.hi = 0;
    this.saveClock = 0;
    this.wakePulse = 0;
    this.wakeConverted = 0;
    this.wakeConvertTime = 0;
    this.hudClock = 0;
    this.scatterTime=0;this.recoverTime=0;this.recovered=0;this.recoveredType=null;
    this.layerReady = false;
    this.layer = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : (typeof document !== "undefined" ? document.createElement("canvas") : null);
    if (this.layer) { this.layer.width = W; this.layer.height = H; this.layerCtx = this.layer.getContext("2d"); }
    try { this.hi = Number(localStorage.getItem("2026-high-score")) || 0; } catch (_) {}
  }

  saveHighScore(score = this.hi) {
    this.hi = Math.max(this.hi, Number(score) || 0);
    try {
      this.hi = Math.max(this.hi, Number(localStorage.getItem("2026-high-score")) || 0);
      localStorage.setItem("2026-high-score", String(this.hi));
    } catch (_) {}
    this.saveClock = 0;
  }

  draw(game, dt = 1 / 60, ctx = this.canvas?.getContext("2d")) {
    if (!ctx || !game) return;
    this.time += clamp(Number(dt) || 1 / 60, 0, 0.1);
    this.saveClock += clamp(Number(dt) || 1 / 60, 0, 0.1);
    const score = Math.max(0, Math.floor(Number(game.score) || 0));
    if (!game.practiceStage && score > this.hi) this.hi = score;
    if (!game.practiceStage && this.saveClock > 2.5 && this.hi > 0) {
      this.saveHighScore();
    }
    if (game.mode !== this.lastMode) {
      this.lastMode = game.mode;
      if (game.mode === "playing" && game.stage && Number(game.stageTime || 0) < 3) {
        this.banner = "SECTOR " + String(game.stage).padStart(2, "0");
        this.bannerTime = 2.3; this.bannerSequenced = true;
      }
    }
    this.scatterTime=Math.max(0,this.scatterTime-dt);this.recoverTime=Math.max(0,this.recoverTime-dt);
    this.seenArsenalEvents ||= new WeakSet();
    for (const event of game.events || []) {
      if(!event)continue;
      const freshBatch=!this.seenArsenalEvents.has(event);
      this.seenArsenalEvents.add(event);
      if(freshBatch&&event.type==='arsenalScatter'){this.scatterTime=2;this.recovered=0;this.recoveredType=null;}
      if(freshBatch&&event.type==='salvageRecover'){this.scatterTime=0;this.recoverTime=.7;this.recovered+=Math.max(1,Number(event.amount)||1);this.recoveredType=event.value;}

      if (["stage", "bossEnter", "bossPhase", "extend", "reactorOpen", "reactorBreak", "lanceLock", "lanceCancel", "bossGuard", "bossGuardEnd"].includes(event.type)) {
        this.bannerSequenced = event.type === "stage" || event.type === "bossEnter" || event.type === "bossPhase" || event.type === "extend";
      }
      if(freshBatch&&event.type==='squadronBonus'){this.banner='SQUADRON BONUS!';this.bannerTime=1.5;this.bannerSequenced=false;}
      if (event.type === "stage" && Number(game.stageTime || 0) < 3) {
        this.banner = "SECTOR " + String(game.stage || 1).padStart(2, "0");
        this.bannerTime = 2.6;
      } else if (event.type === "bossEnter" && Number(game.boss?.age || 0) < 3) {
        this.banner = "HOSTILE FLAGSHIP";
        this.bannerTime = 2.3;
      } else if (event.type === "bossDown") {
        // Reactor, lance and armor callouts go stale once the flagship is gone.
        if (!this.bannerSequenced) this.bannerTime = 0;
      } else if (event.type === "bossPhase") {
        this.banner = "PATTERN SHIFT";
        this.bannerTime = 1.2;
      } else if(event.type==='reactorOpen'){
        this.banner=event.value<0?'LEFT REACTOR / BREAK FOR COVER':'RIGHT REACTOR / CUT SPIRAL';this.bannerTime=2.3;
      } else if(event.type==='reactorBreak'){
        this.banner=event.value<0?'LEFT COVER / 3.2s':'RIGHT SPIRAL OFFLINE';this.bannerTime=2;
      } else if(event.type==='lanceLock'){
        this.banner='LANCE LOCKED / LEAVE THE LANE';this.bannerTime=.85;
      } else if(event.type==='lanceCancel'){
        this.banner='LANCE VENTED';this.bannerTime=1;
      } else if (event.type === "bossGuard") {
        this.banner = "ARMOR CYCLING";
        this.bannerTime = 1.1;
      } else if (event.type === "bossGuardEnd") {
        this.banner = "ARMOR EXPOSED";
        this.bannerTime = 1.0;
      } else if (event.type === "lane") {
        const from = Number(event.x) || 270, to = Number(event.value) || 270;
        this.encounterName = to < from ? "CORRIDOR LEFT" : "CORRIDOR RIGHT";
        this.encounterTime = 1.9;
      } else if (event.type === "wave") {
        const names = { cross: "CROSSCURRENT", pincer: "PINCER", relay: "RELAY STRIKE", curtain: "STORM CURTAIN" };
        if (names[event.value]) { this.encounterName = names[event.value]; this.encounterTime = 1.65; }
      } else if (event.type === "extend") {
        this.banner = "SCORE EXTEND";
        this.bannerTime = 2.2;
      } else if (event.type === "wakeRoll") {
        this.wakePulse = 1;
        this.wakeConverted = 0;
      } else if (event.type === "wakeConvert") {
        this.wakePulse = Math.max(this.wakePulse, 0.55);
        this.wakeConvertTime = 1.1;
        this.wakeConverted += Math.max(1, Number(event.value) || 1);
      }
    }
    this.bannerTime = Math.max(0, this.bannerTime - (Number(dt) || 1 / 60));
    this.encounterTime = Math.max(0, this.encounterTime - (Number(dt) || 1 / 60));
    this.wakePulse = Math.max(0, this.wakePulse - (Number(dt) || 1 / 60) * 1.3);
    this.wakeConvertTime = Math.max(0, this.wakeConvertTime - (Number(dt) || 1 / 60));

    this.hudClock += clamp(Number(dt) || 1 / 60, 0, 0.1);
    // Keep the four weapon pips on the mobile boss row without adding HUD height.
    if (this.compact && typeof document !== 'undefined') {
      const host = document.getElementById('mobileBossRow');
      if (host && !this.mobileTurrets) {
        this.mobileTurrets = document.createElement('span');
        this.mobileTurrets.style.cssText = 'float:right;letter-spacing:3px;font-size:10px;line-height:inherit';
        this.mobileTurrets.setAttribute('role','img');
        host.insertBefore(this.mobileTurrets, document.getElementById('mobileBoss'));
      }
      if (this.mobileTurrets) {
        const b = game.boss, show = (b?.name === 'LEVIATHAN'||b?.name==='HALCYON') && b.phase === 1;
        this.mobileTurrets.hidden = !show;
        if (show) {
          const states = (b.turrets || b.bays || []).map(id => (game.enemies || []).some(e => e.id === id && !e.dead && e.hp > 0));
          const key = states.join('/');
          if (this.mobileTurrets.dataset.key !== key) {
            this.mobileTurrets.dataset.key = key;
            this.mobileTurrets.innerHTML = states.map(live => '<i style="font-style:normal;color:' + (live ? '#ffd98b' : '#526468') + '">▰</i>').join('');
            this.mobileTurrets.setAttribute('aria-label', states.filter(Boolean).length + (b.name==='HALCYON'?' launch bays remaining':' deck turrets remaining'));
          }
        }
      }
    }
    // Mobile readouts run every frame, even when the canvas HUD reuses its layer.
    this.salvageCount=0;
    for(const item of game.pickups||[])if(item.salvage&&!item.dead)this.salvageCount++;
    if (this.layerCtx && this.layerReady && this.hudClock < 1 / 30) { ctx.drawImage(this.layer, 0, 0); return; }
    let outputCtx = null;
    if (this.layerCtx) {
      this.hudClock = 0;
      outputCtx = ctx;
      ctx = this.layerCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = (this.canvas?.width || W) / W;
    const sy = (this.canvas?.height || H) / H;
    ctx.scale(sx, sy);
    if(!this.compact&&game.mode==='playing'&&(this.scatterTime>0||this.salvageCount||this.recoverTime>0)){
      const label=this.scatterTime>0?'ARSENAL LOST'+(this.recoverTime>0?' · +'+this.recovered:''):this.recoverTime>0?'RECOVERED +'+this.recovered:'RECOVER SALVAGE';
      const y=Number(game.player?.y)>770?716:826;
      panel(ctx,110,y-13,320,27,.9);
      text(ctx,label+'  /  '+this.salvageCount+' IN FIELD',270,y,12,this.scatterTime>0?COLORS.coral:COLORS.cyan,800,'center');
    }
    if (!this.compact&&(game.mode === "playing" || game.mode === "paused")) this.drawStatus(ctx, game);
    if(this.compact&&game.player?.empTime>0){panel(ctx,140,800,260,32,.96);text(ctx,'ESCORTS OFFLINE · '+game.player.empTime.toFixed(1)+'s',270,817,16,'#edbeff',800,'center');}
    const critical=Number(game.player?.hp||0)<=1;
    if (game.mode === "playing"&&critical)this.drawCritical(ctx,game);
    if(!this.compact&&game.mode==='playing'&&!critical){
      const deferred=this.deferSequencedBanners&&this.bannerSequenced;
      if(this.bannerTime>0&&!deferred)this.drawBanner(ctx);
      else if(this.encounterTime>0&&!game.boss)this.drawEncounter(ctx);
    }

    ctx.restore();
    if (outputCtx) { outputCtx.drawImage(this.layer, 0, 0); this.layerReady = true; }
  }

  drawStatus(ctx, game) {
    if(game.stage >= 4)return this.drawFleetStatus(ctx,game);
    const player = game.player || {};
    const boss = game.boss;
    panel(ctx, 11, 10, 518, 85, 0.94);
    text(ctx, "SCORE", 26, 27, 10, COLORS.muted, 700, "left", 2.2);
    text(ctx, String(Math.floor(game.score || 0)).padStart(8, "0"), 26, 55, 25, COLORS.pale, 700);
    text(ctx, "HI " + String(Math.floor(Math.max(game.highScore || 0, this.hi))).padStart(8, "0"), 27, 82, 10, COLORS.gold, 700, "left", 1.2);
    text(ctx,Math.max(1,Number(game.combo)||1).toFixed(1)+'× CHAIN',280,83,9,COLORS.gold,700,'center');
    rule(ctx, 225, 21, 225, 84);
    rule(ctx, 334, 21, 334, 84);
    text(ctx, game.practiceStage?"DRILL":"SECTOR", 280, 27, 10, COLORS.muted, 700, "center", 2);
    text(ctx, String(game.stage || 1).padStart(2, "0"), 280, 59, 32, COLORS.cyan, 800, "center");
    text(ctx, "LIVES", 352, 28, 10, COLORS.muted, 700, "left", 1.4);
    for (let i = 0; i < 4; i++) iconPlane(ctx, 434 + i * 24, 28, 0.75, i < (player.lives || 0));
    text(ctx, "HULL", 352, 48, 10, COLORS.muted, 700, "left", 1.1);
    const maxHull = Math.max(1, Math.min(4, Number(player.maxHp) || 3));
    const hull = clamp(Number(player.hp) || 0, 0, maxHull);
    for (let i = 0; i < maxHull; i++) {
      const x = 427 + i * 25;
      ctx.fillStyle = i < hull ? (hull <= 1 ? COLORS.coral : COLORS.cyan) : "rgba(255,119,95,.18)";
      const width=19;
      ctx.fillRect(x,45,width,6);
      if (i < hull) rule(ctx,x,44,x+width,44,"rgba(231,249,244,.7)");
    }
    text(ctx, "BOMBS", 352, 70, 10, COLORS.muted, 700, "left", 1.4);
    for (let i = 0; i < 4; i++) iconBomb(ctx, 428 + i * 25, 70, i < (player.bombs || 0));

    this.lastPower = player.power;
    this.lastCombo = game.combo;
    // Equipment stays in the same compact rail, including during flagships.
    panel(ctx,11,102,518,36,.9);
    text(ctx,'PWR '+Math.max(1,Number(player.level||player.power)||1),25,120,15,COLORS.gold,800);
    if(this.recoverTime>0&&this.recoveredType==='power')rule(ctx,25,129,82,129,'rgba(255,245,200,.8)');
    const slots=[['E',player.escorts,'#6bff95','escort'],['M',player.sidewinder,'#ff9f43','sidewinder'],['★',player.signature,'#fff2a6','signature'],['S',player.shield,'#5ce1ff','shield']];
    for(let i=0;i<slots.length;i++){
      const [glyph,value,col,type]=slots[i],x=137+i*72;
      text(ctx,glyph+' '+(value||0),x,120,12,value?col:COLORS.muted,800);
      if(this.recoverTime>0&&this.recoveredType===type)rule(ctx,x,129,x+35,129,'rgba(255,245,200,.7)');
    }
    text(ctx,'R',434,120,10,player.reflector>0?'#c3a3ff':COLORS.muted,800);
    ctx.fillStyle='rgba(195,163,255,.18)';ctx.fillRect(448,117,63,6);
    if(player.reflector>0){ctx.fillStyle=player.reflector<2?COLORS.coral:'#c3a3ff';ctx.fillRect(448,117,63*clamp(player.reflector/6,0,1),6);}
    if(this.recoverTime>0&&this.recoveredType==='reflector')rule(ctx,434,129,511,129,'rgba(255,245,200,.7)');
    if (boss && boss.hp > 0) this.drawBossMeter(ctx,boss,game);
    else this.drawProgress(ctx,game);
    this.drawBottomRail(ctx, game);
  }

  drawProgress(ctx, game) {
    const progress = clamp(Number(game.progress) || 0, 0, 1);
    ctx.fillStyle = "rgba(118,246,235,.13)";
    ctx.fillRect(11, 141, 518, 3);
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(11, 141, 518 * progress, 3);
  }

  drawFleetStatus(ctx, game) {
    // LEVIATHAN settles close to the top. Compress the cockpit so its 160 px
    // deck and child guns stay visible at their actual collision coordinates.
    const p=game.player||{};
    panel(ctx,11,10,518,52,.94);
    text(ctx,'SCORE',25,23,9,COLORS.muted,700,'left',1.2);
    text(ctx,String(Math.floor(game.score||0)).padStart(8,'0'),25,44,20,COLORS.pale,700);
    text(ctx,game.practiceStage?'DRILL':'SECTOR',210,23,9,COLORS.muted,700,'center',1);
    text(ctx,String(game.stage).padStart(2,'0'),210,43,21,COLORS.cyan,800,'center');
    text(ctx,'HULL '+(p.hp||0)+'/'+(p.maxHp||4)+'   LIVES '+(p.lives||0)+'   B '+(p.bombs||0),273,23,10,COLORS.pale,700);
    text(ctx,'P'+(p.level||1)+'  E'+(p.escorts||0)+'  M'+(p.sidewinder||0)+'  ★'+(p.signature||0)+'  S'+(p.shield||0),273,44,11,COLORS.gold,700);
    if(p.reflector>0){ctx.fillStyle='#c3a3ff';ctx.fillRect(274,54,230*clamp(p.reflector/6,0,1),2);}
    if(game.boss?.hp>0)this.drawBossMeter(ctx,game.boss,game,67);
    else{
      ctx.fillStyle=COLORS.cyan;
      ctx.fillRect(11,66,518*clamp((game.stageTime||0)/(game.stageGoal?.[game.stage]||95),0,1),2);
    }
    if(p.empTime>0){panel(ctx,155,800,230,32,.96);text(ctx,'ESCORTS OFFLINE · '+p.empTime.toFixed(1)+'s',270,817,13,'#edbeff',800,'center');}
    this.drawBottomRail(ctx,game);
  }

  drawBossMeter(ctx, boss, game, y = 148) {
    panel(ctx, 11, y, 518, 36, 0.99);
    const bossName = boss.name || (boss.type ? String(boss.type).replace(/[_-]/g, " ").toUpperCase() : "HOSTILE FLAGSHIP");
    text(ctx, bossName, 25, y + 10, 10, COLORS.coral, 800, "left", 1.2);
    const guardLeft = Math.max(0, (Number(boss.guardUntil) || 0) - (Number(boss.age) || 0));
    const leviathan = boss.name === 'LEVIATHAN';
    const liveTurrets = leviathan ? (game.enemies || []).filter(e => boss.turrets?.includes(e.id) && !e.dead && e.hp > 0).length : 0;
    const halcyon=boss.name==='HALCYON';
    const centerLabel = halcyon ? ['THREE BAYS','LATTICE','ECLIPSE PROTOCOL'][(boss.phase||1)-1] : leviathan && boss.phase === 1 ? (liveTurrets ? 'DECK ARMOR / 25% DAMAGE' : 'DECK GUNS SILENCED') : boss.guard ? "ARMOR CYCLING / " + guardLeft.toFixed(1) + "s" :
      "LV " + Math.max(0, Number(this.lastPower) || 0) + " / " + Math.max(1, Number(this.lastCombo)||1).toFixed(1) + "×";
    text(ctx, boss.name==='HALCYON'?'FLYING-WING CARRIER':centerLabel, 276, y + 10, 9, boss.guard ? COLORS.cyan : COLORS.gold, 700, "center", .5);
    text(ctx, (boss.name==='HALCYON'?['THREE BAYS','LATTICE','ECLIPSE'][(boss.phase||1)-1]:'PHASE '+String(boss.phase||1)), 512, y + 10, 9, COLORS.muted, 700, "right", 1);
    if (leviathan && boss.phase === 1) {
      for (let i = 0; i < (boss.turrets?.length || 4); i++) {
        const live = (game.enemies || []).some(e => e.id === boss.turrets?.[i] && !e.dead && e.hp > 0);
        ctx.fillStyle = live ? COLORS.gold : '#364b50';
        ctx.fillRect(441 + i * 18, y + 15, 11, 4);
      }
    }
    const ratio = clamp((boss.hp || 0) / Math.max(1, boss.maxHp || 1), 0, 1);
    ctx.fillStyle = "rgba(255,119,95,.18)";
    ctx.fillRect(25, y + 22, 487, 6);
    const segments = 27;
    for (let i = 0; i < segments; i++) {
      if (i / segments >= ratio) break;
      ctx.fillStyle = boss.guard ? (i % 3 === 0 ? COLORS.pale : COLORS.cyan) :
        i / segments > ratio - 0.12 ? COLORS.gold : COLORS.coral;
      ctx.fillRect(25 + i * 18, y + 22, 15, 6);
    }
  }

  drawBottomRail(ctx, game) {
    const y = 864;
    panel(ctx, 11, y, 518, 27, 0.84);
    const player = game.player || {};
    const wake = clamp(Number(player.wake) || 0, 0, 1);
    const charged = wake >= 0.5;
    const rollReady = Number(player.rollCooldown || 0) <= 0;
    text(ctx, "WAKE", 25, y + 14, 10, charged ? COLORS.gold : COLORS.cyan, 800, "left", 1.2);
    const bx = 91, by = y + 10, bw = 198, bh = 8;
    ctx.fillStyle = "rgba(118,246,235,.14)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.save();
    ctx.shadowColor = charged ? COLORS.gold : COLORS.cyan;
    ctx.shadowBlur = charged ? 13 + 4 * Math.sin(this.time * 8) : 5;
    ctx.fillStyle = charged ? COLORS.gold : COLORS.cyan;
    ctx.fillRect(bx, by, bw * wake, bh);
    ctx.restore();
    rule(ctx, bx + bw * 0.5, by - 3, bx + bw * 0.5, by + bh + 3, COLORS.pale, 1.5);
    if (this.wakePulse > 0) {
      ctx.fillStyle = "rgba(255,217,139," + (this.wakePulse * .3) + ")";
      ctx.fillRect(bx, by - 3, bw, bh + 6);
    }
    text(ctx, Math.floor(wake * 100) + "%", 320, y + 14, 11, charged ? COLORS.gold : COLORS.pale, 800, "right");
    let status = "GRAZE TO CHARGE";
    let color = COLORS.muted;
    if (!rollReady) { status = "ROLL RECHARGING"; color = COLORS.muted; }
    else if (charged) { status = "C: WAKE ROLL"; color = COLORS.gold; }
    if (this.wakeConvertTime > 0) {
      status = "+" + this.wakeConverted + " CONVERTED";
      color = COLORS.cyan;
    } else if (this.wakePulse > 0.2) {
      status = "WAKE BURST";
      color = COLORS.gold;
    }
    text(ctx, status, 511, y + 14, 10, color, 800, "right", 0.3);
  }

  drawEncounter(ctx) {
    const alpha = clamp(this.encounterTime * 1.5, 0, 1) * 0.9;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(7, 22, 34, .72)";
    ctx.fillRect(153, 156, 234, 26);
    rule(ctx, 153, 156, 183, 156, COLORS.gold, 1.5);
    rule(ctx, 357, 182, 387, 182, COLORS.gold, 1.5);
    text(ctx, "INBOUND / " + this.encounterName, 270, 169, 11, COLORS.gold, 800, "center", 1.25);
    ctx.restore();
  }

  drawBanner(ctx) {
    const alpha = clamp(this.bannerTime, 0, 1) * clamp((2.6 - this.bannerTime) * 4, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    const y = 148;
    const gradient = ctx.createLinearGradient(0, y, W, y);
    gradient.addColorStop(0, "rgba(6, 22, 35, 0)");
    gradient.addColorStop(.2, "rgba(6, 22, 35, .85)");
    gradient.addColorStop(.8, "rgba(6, 22, 35, .85)");
    gradient.addColorStop(1, "rgba(6, 22, 35, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, W, 26);
    rule(ctx, 76, y + 3, 464, y + 3, COLORS.cyan, 1);
    rule(ctx, 76, y + 25, 464, y + 25, COLORS.cyan, 1);
    text(ctx, this.banner, W / 2, y + 14, 12, COLORS.pale, 800, "center", 1.5);
    ctx.restore();
  }

  drawCritical(ctx, game) {
    const pulse = this.reducedEffects ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 6.5);
    const alpha = 0.11 + pulse * 0.09;
    const edge = ctx.createRadialGradient(270, 460, 240, 270, 460, 560);
    edge.addColorStop(0, "rgba(233, 88, 66, 0)");
    edge.addColorStop(1, "rgba(233, 88, 66, " + alpha + ")");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255, 114, 83, " + (0.38 + pulse * 0.44) + ")";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    if(this.compact)return;
    ctx.fillStyle = "rgba(70, 12, 17, .86)";
    ctx.fillRect(175, 148, 190, 25);
    text(ctx, "HULL CRITICAL / EVADE", 270, 161, 11, COLORS.coral, 900, "center", 1.15);
  }
  drawBackdrop(ctx, opacity = .76) {
    ctx.fillStyle = "rgba(2, 12, 21, " + opacity + ")";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(270, 355, 20, 270, 355, 450);
    glow.addColorStop(0, "rgba(55, 208, 203, .10)");
    glow.addColorStop(1, "rgba(55, 208, 203, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(120, 246, 235, .09)";
    ctx.lineWidth = 1;
    for (let x = 28; x <= W; x += 40) rule(ctx, x, 0, x, H, ctx.strokeStyle);
    for (let y = 26; y <= H; y += 40) rule(ctx, 0, y, W, y, ctx.strokeStyle);
    const sweep = (this.time * 16) % 40;
    rule(ctx, 0, sweep, W, sweep, "rgba(120,246,235,.14)");
  }

  drawEmblem(ctx, y) {
    ctx.save();
    ctx.translate(270, y);
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = "rgba(118,246,235,.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-75, -75, 150, 150);
    ctx.strokeStyle = "rgba(118,246,235,.22)";
    ctx.strokeRect(-91, -91, 182, 182);
    ctx.rotate(Math.PI / 4);
    for (let i = 0; i < 4; i++) {
      const angle = this.time * 0.28 + i * Math.PI / 2;
      rule(ctx, Math.cos(angle) * 93, Math.sin(angle) * 93, Math.cos(angle) * 108, Math.sin(angle) * 108, COLORS.gold, 2);
    }
    iconPlane(ctx, 0, 0, 3.5);
    ctx.restore();
  }

  drawTitle(ctx) {
    this.drawBackdrop(ctx, .56);
    this.drawEmblem(ctx, 310);
    text(ctx, "THE SKY IS A SYSTEM", W / 2, 95, 11, COLORS.cyan, 800, "center", 3.4);
    text(ctx, "2 0 2 6", W / 2, 487, 84, COLORS.pale, 800, "center");
    rule(ctx, 99, 547, 441, 547, COLORS.gold, 2);
    text(ctx, "AN AERIAL SYMPHONY OF FIRE", W / 2, 571, 12, COLORS.gold, 700, "center", 2.3);
    text(ctx, "TWO ACTS  /  FOUR FLAGSHIPS  /  ONE FLIGHT", W / 2, 613, 10, COLORS.muted, 700, "center", 1.2);
    panel(ctx, 53, 639, 434, 181, .86);
    text(ctx, "FLIGHT MANUAL", 77, 659, 11, COLORS.cyan, 800, "left", 2);
    rule(ctx, 77, 673, 463, 673);
    text(ctx, "WASD / ARROWS", 78, 695, 12, COLORS.pale, 700);
    text(ctx, "MOVE", 459, 695, 12, COLORS.muted, 700, "right");
    text(ctx, "SPACE / Z / LEFT CLICK", 78, 721, 12, COLORS.pale, 700);
    text(ctx, "FIRE", 459, 721, 12, COLORS.muted, 700, "right");
    text(ctx, "SHIFT  •  C  •  X", 78, 747, 12, COLORS.pale, 700);
    text(ctx, "FOCUS  •  ROLL  •  BOMB", 459, 747, 11, COLORS.muted, 700, "right");
    rule(ctx, 77, 764, 463, 764, "rgba(255,217,139,.35)");
    text(ctx, "GRAZE BULLETS TO CHARGE WAKE", W / 2, 784, 11, COLORS.gold, 800, "center", 1);
    text(ctx, "ROLL AT 50% WAKE TO CONVERT SHOTS", W / 2, 804, 10, COLORS.cyan, 700, "center", .7);
    const pulse = .55 + .45 * Math.sin(this.time * 4);
    ctx.globalAlpha = pulse;
    text(ctx, "PRESS ENTER OR TAP TO LAUNCH", W / 2, 849, 15, COLORS.gold, 800, "center", 1.7);
    ctx.globalAlpha = 1;
  }

  drawPause(ctx) {
    this.drawBackdrop(ctx, .64);
    panel(ctx, 70, 320, 400, 249, .93);
    bracket(ctx, 80, 330, 380, 229);
    text(ctx, "FLIGHT SUSPENDED", W / 2, 388, 27, COLORS.pale, 800, "center", 1.7);
    rule(ctx, 145, 421, 395, 421, COLORS.gold, 2);
    text(ctx, "BREATHE. READ THE PATTERN.", W / 2, 454, 12, COLORS.muted, 700, "center", 1.5);
    text(ctx, "P / ESC TO RESUME", W / 2, 505, 15, COLORS.cyan, 800, "center", 1.4);
    text(ctx, "SOUND BUTTON TO TOGGLE AUDIO", W / 2, 537, 11, COLORS.muted, 700, "center", 1.4);
  }

  drawEnd(ctx, game) {
    const won = game.mode === "victory";
    this.drawBackdrop(ctx, .76);
    panel(ctx, 46, 265, 448, 395, .94);
    bracket(ctx, 56, 275, 428, 375, won ? COLORS.cyan : COLORS.coral);
    text(ctx, won ? "SKY RECLAIMED" : "SIGNAL LOST", W / 2, 340, 32, won ? COLORS.cyan : COLORS.coral, 800, "center", 1.8);
    text(ctx, won ? "THE FLEET FALLS SILENT" : "ONE MORE SORTIE", W / 2, 386, 12, COLORS.muted, 700, "center", 2);
    rule(ctx, 104, 416, 436, 416, COLORS.line);
    text(ctx, "FINAL SCORE", W / 2, 454, 11, COLORS.muted, 800, "center", 2);
    text(ctx, String(Math.floor(game.score || 0)).padStart(8, "0"), W / 2, 505, 42, COLORS.pale, 800, "center");
    text(ctx, "BEST " + String(Math.floor(Math.max(this.hi, game.highScore || 0))).padStart(8, "0"), W / 2, 549, 12, COLORS.gold, 700, "center", 1.3);
    text(ctx, "PRESS ENTER OR TAP TO FLY AGAIN", W / 2, 615, 14, COLORS.cyan, 800, "center", 1.1);
  }
}
