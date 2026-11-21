// Shadowstep sound: every effect is synthesized with WebAudio, no
// samples. A single AudioContext is created lazily on the first
// user gesture; the frozen screenshot frames never start it.
'use strict';

const ShadowAudio = (() => {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A soft cloth step; alternate feet sit a touch apart in pitch.
  let leftFoot = false;
  function step() {
    leftFoot = !leftFoot;
    tone(leftFoot ? 190 : 165, 0.05, 'triangle', 0.05);
  }

  function pickup() {
    tone(880, 0.12, 'sine', 0.22);
    tone(1174, 0.14, 'sine', 0.2, 0.07);
    tone(1568, 0.2, 'sine', 0.16, 0.14);
  }

  // A guard has caught a glimpse: one sharp, questioning note.
  function glimpse() {
    tone(1244, 0.09, 'square', 0.07);
  }

  function caught() {
    tone(392, 0.5, 'sawtooth', 0.22, 0, 196);
    tone(311, 0.6, 'sawtooth', 0.2, 0.08, 155);
  }

  function door() {
    tone(523, 0.14, 'sine', 0.18);
    tone(659, 0.14, 'sine', 0.18, 0.1);
    tone(784, 0.22, 'sine', 0.2, 0.2);
  }

  function win() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((n, i) => tone(n, 0.24, 'triangle', 0.2, i * 0.13));
  }

  // Low double-thump, called by the game loop while the alarm
  // meter runs high.
  function heartbeat() {
    tone(58, 0.1, 'sine', 0.3);
    tone(52, 0.12, 'sine', 0.22, 0.16);
  }

  return { ensure, step, pickup, glimpse, caught, door, win, heartbeat };
})();
