// Synthesizes short alert tones with the Web Audio API — no bundled audio
// files needed. Offscreen documents created with the AUDIO_PLAYBACK reason
// are exempt from Chrome's autoplay restrictions, so this can play
// immediately in response to a message from the background service worker.

const audioCtx = new AudioContext();

function tone({ frequency, startAt, duration, gain = 0.2 }) {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  const start = audioCtx.currentTime + startAt;
  const end = start + duration;

  // Quick fade in/out to avoid audible clicks.
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.02);
  gainNode.gain.linearRampToValueAtTime(0, end);

  oscillator.connect(gainNode).connect(audioCtx.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function playEndChime() {
  // Friendly two-note ascending chime for "phase complete".
  tone({ frequency: 587.33, startAt: 0, duration: 0.18 }); // D5
  tone({ frequency: 783.99, startAt: 0.16, duration: 0.28 }); // G5
}

function playWarningBeep() {
  // Two short, subtler beeps for the "time's almost up" warning.
  tone({ frequency: 880, startAt: 0, duration: 0.12, gain: 0.15 });
  tone({ frequency: 880, startAt: 0.18, duration: 0.12, gain: 0.15 });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "opentomato:play-sound") return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (message.kind === "warning") {
    playWarningBeep();
  } else {
    playEndChime();
  }
});
