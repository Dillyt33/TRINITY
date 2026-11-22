/** Trinity's voice (speech out) and listening (speech in), using what the browser and iPhone provide for free. */

const PREFERRED = [
  'Ava (Premium)', 'Ava (Enhanced)', 'Zoe (Premium)', 'Zoe (Enhanced)', 'Samantha (Enhanced)', 'Allison (Enhanced)',
  'Ava', 'Zoe', 'Samantha', 'Allison', 'Susan', 'Serena', 'Karen', 'Moira', 'Tessa', 'Victoria', 'Kate',
  'Google US English', 'Microsoft Aria Online (Natural) - English (United States)', 'Microsoft Jenny Online (Natural) - English (United States)',
];

const PREFS_KEY = 'trinity:voice';

export interface VoicePrefs {
  name: string | null; // null = best available female voice
  speak: boolean; // read Trinity's replies aloud
  rate: number;
}

export function loadVoicePrefs(): VoicePrefs {
  try {
    return { name: null, speak: true, rate: 1, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { name: null, speak: true, rate: 1 };
  }
}

export function saveVoicePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

/** Voices load asynchronously in some browsers. */
export function whenVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve([]);
    const now = englishVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(englishVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

export function pickVoice(name: string | null): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  if (name) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  for (const want of PREFERRED) {
    const v = voices.find((x) => x.name === want);
    if (v) return v;
  }
  return voices.find((v) => /female|woman/i.test(v.name)) ?? voices[0] ?? null;
}

let unlocked = false;
/** iPhone only lets a page speak after a tap. Call this from a tap handler once. */
export function unlockSpeech() {
  if (unlocked || !canSpeak()) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

export function speak(text: string, prefs: VoicePrefs): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(prefs.name);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = prefs.rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function Recognizer(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canListen = () => !!Recognizer();

/** Listens until you pause, then resolves with what you said ('' if nothing). */
export function listen(onPartial?: (text: string) => void): { done: Promise<string>; stop: () => void } {
  const R = Recognizer();
  if (!R) return { done: Promise.resolve(''), stop: () => undefined };
  const rec = new R();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  let latest = '';
  const done = new Promise<string>((resolve) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      latest = (finalText + ' ' + interim).trim();
      onPartial?.(latest);
    };
    rec.onerror = () => resolve(latest.trim());
    rec.onend = () => resolve((finalText || latest).trim());
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}
