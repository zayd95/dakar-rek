import * as THREE from 'three';
import type { PresenceClient } from './client';
import type { RemoteAvatars } from './avatars';
import type { ChatAck, ChatMessage, Peer } from './protocol';
import { cleanChatText, bubbleText, FAILURE_LABEL, CHAT_MAX_CHARS, CHAT_NEAR_RADIUS, REPORT_REASONS, type ChatChannel, type ChatFailure, type ReportReason } from './chatRules';
import { phoneHooks } from '../ui/phoneHooks';
import { chatPlace, cityHour, quickChat } from '../i18n/lines';
import './chat.css';

/**
 * Text chat over the presence connection: proximity (bubbles above characters) and private messages.
 * History, drafts, mute, block and the report log stay on this device. Player text is shown as written
 * (only cleaned of control characters) and is never parsed: a message cannot pay, lend or trigger anything.
 */
type Status = 'sending' | 'sent' | 'failed';
type LocalFailure = ChatFailure | 'timeout' | 'network';
interface Entry {
  id: string; from: string; name: string; tag?: string; text: string; at: number; mine: boolean; channel: ChatChannel;
  status?: Status; reason?: LocalFailure; delivered?: number; distance?: number;
}
interface Pending { entry: Entry; conv: string; peerKey?: string; createdAt: number; sentAt: number }
interface Bubble { sprite: THREE.Sprite; texture: THREE.CanvasTexture; until: number; width: number; height: number }
export interface ChatDeps {
  presence: PresenceClient; avatars: RemoteAvatars; scene: THREE.Scene; storage: Storage | null; enabled: boolean;
  /** Local player position and current presence space (street, home, scene or a public interior). */
  local: () => THREE.Vector3; space: () => string;
  /** Called with true while the text field has focus (movement and camera suspended), false when it is released. */
  suspend: (on: boolean) => void;
}

const HISTORY = 50, MAX_CONVERSATIONS = 20, ACK_TIMEOUT = 8000, OFFLINE_GIVE_UP = 20000;
const REACTIONS = ['👋', '🙏', '😂', '👍', '❤️', '🔥'];
const REASON_LABEL: Record<ReportReason, string> = { insulte: 'Insultes', harcelement: 'Harcèlement', arnaque: 'Arnaque', autre: 'Autre' };
const LOCAL_FAILURE: Record<LocalFailure, string> = { ...FAILURE_LABEL, timeout: 'pas de réponse du serveur', network: 'hors ligne' };
const RETRYABLE = new Set<LocalFailure>(['rate-limited', 'offline', 'no-position', 'timeout', 'network', 'private-space']);
const peerKey = (p: { tag?: string; id: string }) => p.tag ?? `id:${p.id}`;
const clock = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

export class ChatUi {
  readonly button = el('button');
  private panel = el('div');
  private log = el('ol', 'chat-log');
  private people = el('div', 'chat-people');
  private banner = el('div', 'chat-banner');
  private peerBar = el('div', 'chat-peer');
  private form = el('form', 'chat-compose');
  private field = el('input');
  private counter = el('small', 'chat-count');
  private phrases = el('div', 'chat-phrases');
  private phraseKey = '';
  private note = el('small', 'chat-note');
  private tabs: Record<'near' | 'dm', HTMLButtonElement> = { near: el('button'), dm: el('button') };
  private conversations = new Map<string, Entry[]>();
  private names = new Map<string, string>();            // conversation peer key -> last known name
  private unread = new Map<string, number>();
  private pending = new Map<string, Pending>();
  private seen = new Set<string>();
  private muted = new Map<string, string>(); private blocked = new Map<string, string>();
  private reports: { at: number; key: string; name: string; reason: ReportReason; server: 'pending' | 'counted' | 'not-sent' }[] = [];
  private drafts: Record<string, string> = {};
  private bubbles = new Map<string, Bubble>();
  private bubbleGroup = new THREE.Group();
  private tab: 'near' | 'dm' = 'near';
  private dmPeer: string | null = null;                   // selected private conversation (peer key)
  private reportFor: string | null = null;
  private opened = false; private focused = false;
  private lastStatus = ''; private layoutT = 0; private tickT = 0; private saveT = 0;
  private dirty = true;
  /** How long a bubble stays above a character (debug builds can lengthen it for slow automated captures). */
  private bubbleSeconds = 6;

  constructor(private d: ChatDeps) {
    this.bubbleGroup.name = 'chat_bubbles'; d.scene.add(this.bubbleGroup);
    this.load();
    d.avatars.hidden = peer => this.blocked.has(peerKey(peer));
    if (!d.enabled) return;                                 // solo build: no button, no hook, nothing listens
    this.build();
    d.presence.onChat = m => this.receive(m);
    d.presence.onChatAck = a => this.ack(a);
    d.presence.onReportAck = (target, ok) => this.reportAck(target, ok);
    phoneHooks.openMessages = () => this.open('dm');
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__dakarChat = this.debugApi();
    this.refresh();
  }

  /** Presence status changed: resend pending messages (same ids) once the connection is back. */
  refresh() {
    if (!this.d.enabled) return;
    const status = this.d.presence.status;
    if (status === 'online' && this.lastStatus !== 'online') for (const p of this.pending.values()) if (p.entry.status === 'sending') p.sentAt = 0;
    this.lastStatus = status;
    this.button.dataset.state = status;
    this.dirty = true;
  }

  open(tab: 'near' | 'dm' = this.tab, peer: string | null = null) {
    if (!this.d.enabled) return;
    this.opened = true; this.tab = tab; if (tab === 'dm') this.dmPeer = peer ?? this.dmPeer; this.reportFor = null;
    this.panel.classList.add('on'); this.button.setAttribute('aria-expanded', 'true');
    this.dirty = true; this.render();
  }
  close() {
    this.opened = false; this.panel.classList.remove('on'); this.button.setAttribute('aria-expanded', 'false');
    if (document.activeElement === this.field) this.field.blur();
  }

  /** Per frame: bubbles follow characters at a constant screen size; pending messages time out. */
  update(_dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    const now = performance.now();
    if (this.d.enabled && now - this.tickT > 250) { this.tickT = now; this.tick(); }
    if (this.d.enabled && now - this.layoutT > 250) { this.layoutT = now; this.layout(); if (this.opened) this.renderPhrases(); }
    if (this.dirty && this.opened) this.render();
    this.updateBadge();
    const px = 2 / (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]);
    const t = performance.now() / 1000;
    for (const [owner, b] of this.bubbles) {
      const left = b.until - t;
      if (left <= 0) { this.dropBubble(owner); continue; }
      const anchor = owner === 'self' ? (this.d.space() === 'scene' ? null : this.d.local()) : this.d.avatars.bodyOf(owner)?.position ?? null;
      b.sprite.visible = !!anchor;
      if (!anchor) continue;
      b.sprite.position.set(anchor.x, anchor.y + 2.35, anchor.z);
      b.sprite.scale.set(b.width * px, b.height * px, 1);
      // Remote players have a 28 px name centred at 2.35 m: the bubble sits just above it.
      b.sprite.center.set(0.5, owner === 'self' ? 0 : -18 / b.height);
      b.sprite.material.opacity = Math.min(1, left / 0.8);
    }
  }

  // ---------------------------------------------------------------- network
  private send(text: string) {
    const channel: ChatChannel = this.tab === 'dm' ? 'dm' : 'near';
    if (channel === 'dm' && !this.dmPeer) return;
    const conv = channel === 'near' ? 'near' : `dm:${this.dmPeer}`;
    const cleaned = cleanChatText(text);
    if (!cleaned.ok && cleaned.reason === 'empty') return;
    const entry: Entry = { id: uuid(), from: this.d.presence.id, name: 'Toi', text: cleaned.ok ? cleaned.text : text.trim(), at: Date.now(), mine: true, channel, status: 'sending' };
    this.push(conv, entry);
    if (!cleaned.ok) { this.fail(entry, cleaned.reason); return; }
    const p: Pending = { entry, conv, peerKey: channel === 'dm' ? this.dmPeer! : undefined, createdAt: performance.now(), sentAt: 0 };
    this.pending.set(entry.id, p); this.transmit(p);
  }
  private transmit(p: Pending) {
    if (this.d.presence.status !== 'online') return;
    let to: string | undefined;
    if (p.entry.channel === 'dm') {
      const peer = this.peerByKey(p.peerKey!);
      if (!peer) { this.pending.delete(p.entry.id); this.fail(p.entry, 'offline'); return; }
      to = peer.id;
    }
    if (this.d.presence.sendChat({ type: 'chat', id: p.entry.id, channel: p.entry.channel, ...(to ? { to } : {}), text: p.entry.text })) p.sentAt = performance.now();
  }
  private tick() {
    const now = performance.now();
    for (const p of [...this.pending.values()]) {
      if (p.entry.status !== 'sending') continue;
      if (p.sentAt === 0) {
        if (this.d.presence.status === 'online') this.transmit(p);
        else if (now - p.createdAt > OFFLINE_GIVE_UP) { this.pending.delete(p.entry.id); this.fail(p.entry, 'network'); }
      } else if (now - p.sentAt > ACK_TIMEOUT) { this.pending.delete(p.entry.id); this.fail(p.entry, 'timeout'); }
    }
  }
  private ack(a: ChatAck) {
    const p = this.pending.get(a.id); if (!p) return;
    this.pending.delete(a.id);
    if (!a.ok) { this.fail(p.entry, a.reason ?? 'invalid'); return; }
    p.entry.status = 'sent'; p.entry.delivered = a.delivered ?? 0; p.entry.reason = undefined; if (a.at) p.entry.at = a.at;
    if (p.entry.channel === 'near' && !a.duplicate) this.showBubble('self', p.entry.text, true);
    this.changed();
  }
  private fail(entry: Entry, reason: LocalFailure) { entry.status = 'failed'; entry.reason = reason; this.changed(); }
  private retry(entry: Entry, conv: string) {
    entry.status = 'sending'; entry.reason = undefined;
    const p: Pending = { entry, conv, peerKey: conv.startsWith('dm:') ? conv.slice(3) : undefined, createdAt: performance.now(), sentAt: 0 };
    this.pending.set(entry.id, p); this.transmit(p); this.changed();
  }
  private receive(m: ChatMessage) {
    if (this.seen.has(m.id)) return;                       // a resend after a reconnect is shown once
    this.seen.add(m.id); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value as string);
    const key = peerKey({ tag: m.tag, id: m.from });
    if (this.blocked.has(key) || this.muted.has(key)) return;
    const conv = m.channel === 'near' ? 'near' : `dm:${key}`;
    if (m.channel === 'dm') this.names.set(key, m.name);
    const sender = this.d.presence.peers.get(m.from), me = this.d.local();
    const entry: Entry = { id: m.id, from: m.from, name: m.name, tag: m.tag, text: m.text, at: m.at, mine: false, channel: m.channel,
      distance: m.channel === 'near' && sender ? Math.round(Math.hypot(sender.x - me.x, sender.z - me.z)) : undefined };
    this.push(conv, entry);
    if (m.channel === 'near') this.showBubble(m.from, m.text, false);
    if (!(this.opened && this.activeConv() === conv)) this.unread.set(conv, (this.unread.get(conv) ?? 0) + 1);
  }
  private report(key: string, reason: ReportReason) {
    const peer = this.peerByKey(key), name = peer?.name ?? this.names.get(key) ?? 'Joueur';
    const sent = peer ? this.d.presence.sendReport({ type: 'report', target: peer.id, reason }) : false;
    this.reports.push({ at: Date.now(), key, name, reason, server: sent ? 'pending' : 'not-sent' });
    this.reports = this.reports.slice(-50);
    this.reportFor = null; this.save(); this.changed();
  }
  private reportAck(target: string, ok: boolean) {
    const peer = this.d.presence.peers.get(target); const key = peer ? peerKey(peer) : null;
    const r = [...this.reports].reverse().find(x => x.server === 'pending' && (!key || x.key === key));
    if (r) { r.server = ok ? 'counted' : 'not-sent'; this.save(); this.changed(); }
  }

  // ---------------------------------------------------------------- state
  private push(conv: string, entry: Entry) {
    const list = this.conversations.get(conv) ?? [];
    list.push(entry); if (list.length > HISTORY) list.splice(0, list.length - HISTORY);
    this.conversations.delete(conv); this.conversations.set(conv, list);     // most recent conversation last
    const dms = [...this.conversations.keys()].filter(k => k.startsWith('dm:'));
    while (dms.length > MAX_CONVERSATIONS) this.conversations.delete(dms.shift()!);
    this.changed();
  }
  private changed() { this.dirty = true; this.save(); }
  private activeConv() { return this.tab === 'near' ? 'near' : this.dmPeer ? `dm:${this.dmPeer}` : null; }
  private peerByKey(key: string): Peer | undefined { return [...this.d.presence.peers.values()].find(p => peerKey(p) === key); }
  private nameOf(key: string) { return this.peerByKey(key)?.name ?? this.names.get(key) ?? this.muted.get(key) ?? this.blocked.get(key) ?? 'Joueur'; }
  private toggle(set: Map<string, string>, key: string) {
    if (set.has(key)) set.delete(key); else set.set(key, this.nameOf(key));
    if (this.muted.has(key) || this.blocked.has(key)) { const peer = this.peerByKey(key); if (peer) this.dropBubble(peer.id); }
    this.changed();
  }
  private load() {
    try {
      const raw = this.d.storage?.getItem('dakarrek.chat.v1'); if (!raw) return;
      const s = JSON.parse(raw) as { muted?: [string, string][]; blocked?: [string, string][]; drafts?: Record<string, string>; reports?: ChatUi['reports']; history?: [string, Entry[]][]; names?: [string, string][] };
      this.muted = new Map(s.muted ?? []); this.blocked = new Map(s.blocked ?? []);
      this.drafts = typeof s.drafts === 'object' && s.drafts ? s.drafts : {};
      this.reports = Array.isArray(s.reports) ? s.reports : [];
      this.names = new Map(s.names ?? []);
      for (const [conv, list] of s.history ?? []) if (conv.startsWith('dm:') && Array.isArray(list)) {
        // Unanswered messages from a previous visit are shown as failed, never resent silently.
        for (const e of list) if (e.status === 'sending') { e.status = 'failed'; e.reason = 'network'; }
        this.conversations.set(conv, list.slice(-HISTORY));
      }
    } catch { /* private browsing or corrupt data: start empty */ }
  }
  private save() {
    clearTimeout(this.saveT);
    this.saveT = window.setTimeout(() => {
      try {
        // Proximity talk belongs to a place and a moment: only private conversations are kept between visits.
        const history = [...this.conversations].filter(([k]) => k.startsWith('dm:'));
        this.d.storage?.setItem('dakarrek.chat.v1', JSON.stringify({ muted: [...this.muted], blocked: [...this.blocked], drafts: this.drafts, reports: this.reports, history, names: [...this.names] }));
      } catch { /* storage full or unavailable: the session keeps working */ }
    }, 300);
  }

  // ---------------------------------------------------------------- bubbles
  private showBubble(owner: string, text: string, self: boolean) {
    this.dropBubble(owner);
    const shown = bubbleText(text), scale = 2, font = `600 ${15 * scale}px system-ui, sans-serif`;
    const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
    if (!c) return;
    c.font = font;
    const maxW = 236 * scale, pad = 9 * scale, lineH = 19 * scale, tail = 7 * scale;
    const lines: string[] = []; let line = '';
    for (const word of shown.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width <= maxW || !line) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length > 2) { lines.length = 2; lines[1] = `${lines[1].replace(/…$/, '')}…`; }
    for (let i = 0; i < lines.length; i++) while (c.measureText(lines[i]).width > maxW && lines[i].length > 2) lines[i] = `${[...lines[i]].slice(0, -2).join('')}…`;
    const w = Math.ceil(Math.min(maxW, Math.max(...lines.map(l => c.measureText(l).width))) + pad * 2), h = lines.length * lineH + pad * 2;
    canvas.width = w; canvas.height = h + tail;
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = self ? 'rgba(254, 243, 199, .96)' : 'rgba(255, 255, 255, .96)';
    c.beginPath(); c.roundRect(0, 0, w, h, 12 * scale); c.moveTo(w / 2 - tail, h); c.lineTo(w / 2, h + tail); c.lineTo(w / 2 + tail, h); c.fill();
    c.fillStyle = '#0f172a';
    lines.forEach((l, i) => c.fillText(l, w / 2, pad + lineH * (i + 0.5)));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
    sprite.renderOrder = 10; sprite.name = `bubble:${owner}`; sprite.visible = false;
    this.bubbleGroup.add(sprite);
    this.bubbles.set(owner, { sprite, texture, until: performance.now() / 1000 + this.bubbleSeconds, width: w / scale, height: (h + tail) / scale });
  }
  private dropBubble(owner: string) {
    const b = this.bubbles.get(owner); if (!b) return;
    b.sprite.removeFromParent(); b.sprite.material.dispose(); b.texture.dispose(); this.bubbles.delete(owner);
  }

  // ---------------------------------------------------------------- DOM
  private build() {
    const b = this.button;
    b.id = 'chatBtn'; b.className = 'card'; b.type = 'button'; b.setAttribute('aria-label', 'Discussion'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span aria-hidden="true">💬</span> Chat<i class="chat-badge"></i>';
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', () => (this.opened ? this.close() : this.open()));

    const p = this.panel; p.id = 'chatPanel'; p.className = 'card'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Discussion');
    // Touches on the panel never reach the joystick or camera drag.
    for (const type of ['pointerdown', 'touchstart', 'mousedown', 'wheel'] as const) p.addEventListener(type, e => e.stopPropagation(), { passive: true });
    const head = el('div', 'chat-head'), tabs = el('div', 'chat-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of ['near', 'dm'] as const) {
      const tb = this.tabs[t]; tb.type = 'button'; tb.dataset.tab = t; tb.setAttribute('role', 'tab');
      tb.innerHTML = t === 'near' ? `À proximité <small>${CHAT_NEAR_RADIUS} m</small><i class="chat-badge"></i>` : 'Messages privés<i class="chat-badge"></i>';
      tb.addEventListener('click', () => { this.tab = t; if (t === 'dm') this.dmPeer = null; this.reportFor = null; this.dirty = true; this.render(); });
      tabs.appendChild(tb);
    }
    const x = el('button', 'chat-close', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer la discussion'); x.addEventListener('click', () => this.close());
    head.append(tabs, x);

    const reactions = el('div', 'chat-react');
    for (const r of REACTIONS) { const rb = el('button', '', r); rb.type = 'button'; rb.setAttribute('aria-label', `Envoyer ${r}`); rb.addEventListener('click', () => this.send(r)); reactions.appendChild(rb); }
    this.renderPhrases();
    const row = el('div', 'chat-row');
    const f = this.field; f.id = 'chatInput'; f.type = 'text'; f.maxLength = CHAT_MAX_CHARS; f.autocomplete = 'off'; f.enterKeyHint = 'send';
    f.setAttribute('aria-label', 'Message'); f.spellcheck = true;
    const sendBtn = el('button', 'chat-send', 'Envoyer'); sendBtn.type = 'submit';
    row.append(f, sendBtn);
    this.form.append(reactions, this.phrases, row, this.counter, this.note);
    this.form.addEventListener('submit', e => { e.preventDefault(); const text = f.value; if (!text.trim()) return; this.send(text); f.value = ''; this.saveDraft(); });
    f.addEventListener('input', () => this.saveDraft());
    f.addEventListener('focus', () => { this.focused = true; this.d.suspend(true); });
    f.addEventListener('blur', () => { this.focused = false; this.d.suspend(false); });
    p.append(head, this.banner, this.peerBar, this.log, this.people, this.form);
    this.log.setAttribute('aria-live', 'polite');
    const ui = document.getElementById('ui') ?? document.body;
    ui.append(b, p);

    // A game menu opening on top (profile, system menu…) closes the panel; a menu already open stays usable with it.
    const modal = document.getElementById('modal');
    if (modal) {
      let was = modal.classList.contains('on');
      new MutationObserver(() => { const on = modal.classList.contains('on'); if (on && !was && this.opened) this.close(); was = on; }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
    // Escape closes the panel before the game sees it (the game would open its menu).
    addEventListener('keydown', e => { if (e.code === 'Escape' && this.opened) { e.stopPropagation(); e.preventDefault(); this.close(); } }, true);
    // Phone keyboard: keep the panel above it; closing the keyboard releases the text field.
    const vv = window.visualViewport;
    if (vv) {
      let wasOpen = false;
      const onViewport = () => {
        const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
        p.style.setProperty('--kb', `${kb}px`);
        if (wasOpen && kb < 60 && this.focused) this.field.blur();
        wasOpen = kb >= 60;
      };
      vv.addEventListener('resize', onViewport); vv.addEventListener('scroll', onViewport);
    }
  }
  private saveDraft() {
    const conv = this.activeConv(); if (!conv) return;
    const v = this.field.value; if (v) this.drafts[conv] = v; else delete this.drafts[conv];
    this.updateCounter(); this.save();
  }
  private updateCounter() { const n = [...this.field.value].length; this.counter.textContent = n > CHAT_MAX_CHARS - 40 ? `${n}/${CHAT_MAX_CHARS}` : ''; }
  private layout() {
    const presenceBtn = document.getElementById('presenceBtn');
    const top = presenceBtn ? presenceBtn.getBoundingClientRect().bottom + 8 : 66;
    if (this.button.style.top !== `${Math.round(top)}px`) this.button.style.top = `${Math.round(top)}px`;
    this.panel.style.setProperty('--chat-top', `${Math.round(this.button.getBoundingClientRect().bottom + 8)}px`);
  }
  private updateBadge() {
    let total = 0; for (const [conv, n] of this.unread) if (!(this.opened && this.activeConv() === conv)) total += n;
    const badge = this.button.querySelector('.chat-badge') as HTMLElement | null;
    if (badge) { const text = total ? String(Math.min(total, 99)) : ''; if (badge.textContent !== text) badge.textContent = text; }
  }

  private render() {
    if (!this.d.enabled) return;
    this.dirty = false;
    const conv = this.activeConv();
    if (conv) this.unread.delete(conv);
    for (const t of ['near', 'dm'] as const) {
      const tb = this.tabs[t]; tb.classList.toggle('on', this.tab === t); tb.setAttribute('aria-selected', String(this.tab === t));
      let n = 0; for (const [k, v] of this.unread) if (t === 'near' ? k === 'near' : k.startsWith('dm:')) n += v;
      (tb.querySelector('.chat-badge') as HTMLElement).textContent = n ? String(n) : '';
    }
    const online = this.d.presence.status === 'online', space = this.d.space();
    this.banner.textContent = !online ? 'Hors ligne : tes messages partiront à la reconnexion.'
      : this.tab === 'near' ? (space === 'home' || space === 'scene' ? 'Ici, personne ne t’entend : la chambre et les scènes sont privées.' : `Entendu par les joueurs à moins de ${CHAT_NEAR_RADIUS} m, dans le même lieu.`)
        : this.dmPeer ? '' : 'Joueurs de ton groupe. Un message ne peut jamais payer ni prêter d’argent.';
    this.banner.dataset.state = online ? 'online' : 'offline';
    this.banner.hidden = !this.banner.textContent;

    const listView = this.tab === 'dm' && !this.dmPeer;
    this.log.hidden = listView; this.people.hidden = !listView; this.form.hidden = listView;
    this.peerBar.hidden = !(this.tab === 'dm' && this.dmPeer);
    if (this.tab === 'dm' && this.dmPeer) this.renderPeerBar(this.dmPeer);
    if (listView) this.renderPeople(); else this.renderLog(conv!);
    const draft = conv ? this.drafts[conv] ?? '' : '';
    if (!this.focused || this.field.dataset.conv !== conv) { this.field.value = draft; this.field.dataset.conv = conv ?? ''; }
    this.field.placeholder = this.tab === 'near' ? 'Dire à proximité…' : `Message privé à ${this.dmPeer ? this.nameOf(this.dmPeer) : ''}…`;
    this.note.textContent = this.tab === 'dm' && this.dmPeer && !this.peerByKey(this.dmPeer) ? 'Hors ligne ou dans un autre groupe : le message ne partira pas.' : '';
    this.updateCounter();
  }
  /** Quick Wolof phrases for this place and hour (src/i18n/lines.ts: greeting of the hour, « Neex na » at a gargote,
   * « Ñaata la ? » at the market…), sent as written like any message; the French gloss is the tooltip. */
  private renderPhrases() {
    const space = this.d.space(), list = quickChat(space, cityHour());
    const key = list.map(q => q.wo).join('|');
    if (key === this.phraseKey) return;
    this.phraseKey = key; this.phrases.replaceChildren(); this.phrases.dataset.place = chatPlace(space);
    for (const q of list) {
      const qb = el('button', '', q.wo); qb.type = 'button'; qb.title = q.fr; qb.setAttribute('aria-label', `Envoyer « ${q.wo} » (${q.fr})`);
      qb.addEventListener('click', () => this.send(q.wo)); this.phrases.appendChild(qb);
    }
  }
  private renderLog(conv: string) {
    const list = this.conversations.get(conv) ?? [];
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.replaceChildren();
    if (!list.length) this.log.appendChild(el('li', 'chat-empty', this.tab === 'near' ? 'Personne n’a encore parlé ici.' : 'Pas encore de message.'));
    for (const e of list) {
      const li = el('li', e.mine ? 'mine' : ''); li.dataset.id = e.id; if (e.status) li.dataset.status = e.status;
      const meta = el('div', 'chat-meta');
      const who = el(e.mine ? 'b' : 'button', 'chat-author', e.mine ? 'Toi' : e.name);
      if (!e.mine && who instanceof HTMLButtonElement) { who.type = 'button'; who.title = 'Profil : message privé, muet, bloquer, signaler'; who.addEventListener('click', () => this.open('dm', peerKey({ tag: e.tag, id: e.from }))); }
      const where = e.channel === 'near' ? (e.distance !== undefined ? `à proximité · ${e.distance} m` : 'à proximité') : 'privé';
      meta.append(who, el('span', '', ` · ${where} · ${clock(e.at)}`));
      const text = el('p', 'chat-text', e.text);
      li.append(meta, text);
      if (e.mine) {
        const st = el('small', 'chat-status');
        st.textContent = e.status === 'sending' ? 'envoi…' : e.status === 'sent' ? (e.channel === 'near' && !e.delivered ? 'reçu · personne à portée' : 'reçu') : `échec · ${LOCAL_FAILURE[e.reason ?? 'invalid']}`;
        li.appendChild(st);
        if (e.status === 'failed' && RETRYABLE.has(e.reason ?? 'invalid')) {
          const r = el('button', 'chat-retry', 'Réessayer'); r.type = 'button'; r.addEventListener('click', () => this.retry(e, conv)); st.appendChild(r);
        }
      }
      this.log.appendChild(li);
    }
    if (atBottom || list.at(-1)?.mine) this.log.scrollTop = this.log.scrollHeight;
  }
  private renderPeerBar(key: string) {
    this.peerBar.replaceChildren();
    const back = el('button', 'chat-back', '‹'); back.type = 'button'; back.setAttribute('aria-label', 'Retour aux joueurs');
    back.addEventListener('click', () => { this.dmPeer = null; this.reportFor = null; this.dirty = true; this.render(); });
    const peer = this.peerByKey(key);
    const title = el('div', 'chat-peer-name'); title.append(el('b', '', this.nameOf(key)), el('small', '', peer ? 'en ligne · privé' : 'hors ligne'));
    this.peerBar.append(back, title, this.profileActions(key));
    if (this.reportFor === key) this.peerBar.appendChild(this.reportChoices(key));
  }
  private profileActions(key: string) {
    const box = el('div', 'chat-actions');
    const add = (label: string, on: boolean, act: () => void, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); b.addEventListener('click', act); box.appendChild(b); };
    add(this.muted.has(key) ? 'Muet ✓' : 'Muet', this.muted.has(key), () => this.toggle(this.muted, key), 'chat-mute');
    add(this.blocked.has(key) ? 'Bloqué ✓' : 'Bloquer', this.blocked.has(key), () => this.toggle(this.blocked, key), 'chat-block');
    const done = this.reports.some(r => r.key === key);
    add(done ? 'Signalé' : 'Signaler', done, () => { if (!done) { this.reportFor = this.reportFor === key ? null : key; this.dirty = true; this.render(); } }, 'chat-report');
    return box;
  }
  private reportChoices(key: string) {
    const box = el('div', 'chat-report-box');
    box.appendChild(el('p', '', 'Pourquoi ? Le signalement est gardé sur ton téléphone et compté par le serveur. Il n’est pas encore lu par une équipe de modération.'));
    for (const reason of REPORT_REASONS) { const b = el('button', '', REASON_LABEL[reason]); b.type = 'button'; b.addEventListener('click', () => this.report(key, reason)); box.appendChild(b); }
    return box;
  }
  private renderPeople() {
    this.people.replaceChildren();
    const online = [...this.d.presence.peers.values()].filter(p => p.id !== this.d.presence.id).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const keys = new Set(online.map(peerKey));
    const offline = [...this.conversations.keys()].filter(k => k.startsWith('dm:') && !keys.has(k.slice(3))).map(k => k.slice(3)).reverse();
    if (!online.length && !offline.length) this.people.appendChild(el('p', 'chat-empty', 'Personne d’autre dans ton groupe pour l’instant.'));
    const row = (key: string, name: string, isOnline: boolean) => {
      const r = el('div', 'chat-person'); r.dataset.key = key;
      const open = el('button', 'chat-person-open'); open.type = 'button';
      const unread = this.unread.get(`dm:${key}`) ?? 0;
      open.append(el('b', '', name), el('small', '', `${isOnline ? 'en ligne' : 'hors ligne'}${this.muted.has(key) ? ' · muet' : ''}${this.blocked.has(key) ? ' · bloqué' : ''}`));
      if (unread) open.appendChild(el('i', 'chat-badge', String(unread)));
      open.addEventListener('click', () => this.open('dm', key));
      r.appendChild(open); this.people.appendChild(r);
    };
    for (const p of online) row(peerKey(p), p.name, true);
    for (const k of offline) row(k, this.nameOf(k), false);
  }

  private debugApi() {
    return {
      state: () => ({
        status: this.d.presence.status, open: this.opened, tab: this.tab, peer: this.dmPeer, focused: this.focused,
        history: Object.fromEntries([...this.conversations].map(([k, v]) => [k, v.map(e => ({ id: e.id, name: e.name, text: e.text, mine: e.mine, status: e.status, reason: e.reason, delivered: e.delivered }))])),
        bubbles: [...this.bubbles].map(([owner, b]) => ({ owner, visible: b.sprite.visible, opacity: b.sprite.material.opacity, left: b.until - performance.now() / 1000 })),
        muted: [...this.muted.values()], blocked: [...this.blocked.values()], reports: this.reports.map(r => ({ name: r.name, reason: r.reason, server: r.server })),
        pending: this.pending.size, unread: Object.fromEntries(this.unread),
        phrases: [...this.phrases.querySelectorAll('button')].map(b => b.textContent ?? ''), place: this.phrases.dataset.place ?? '',
      }),
      open: (tab: 'near' | 'dm') => this.open(tab), close: () => this.close(),
      bubbleSeconds: (s: number) => { this.bubbleSeconds = s; },
      /** Retransmits an already sent message with the same id (simulates a resend after a lost acknowledgement). */
      resend: (id: string) => {
        for (const [conv, list] of this.conversations) { const e = list.find(x => x.id === id && x.mine); if (e) { this.retry(e, conv); return true; } }
        return false;
      },
    };
  }
}
