/**
 * Seleção estável da voz de leitura (TTS nativo do dispositivo / Google).
 *
 * A voz é escolhida uma única vez, guardada localmente e reutilizada tanto na
 * leitura em voz alta das mensagens como no chat por voz, para não mudar a
 * cada frase.
 */

const STORAGE_KEY = "griot_tts_voice_uri";
const LANG_KEY = "griot_tts_voice_lang";

function preferenceScore(voice: SpeechSynthesisVoice, lang: string): number {
  const name = voice.name.toLowerCase();
  const voiceLang = (voice.lang || "").toLowerCase().replace("_", "-");
  const base = lang.toLowerCase().split("-")[0];
  let score = 0;

  if (voiceLang === lang.toLowerCase()) score += 100;
  else if (voiceLang.startsWith(base)) score += 60;
  else return -1;

  // Prioridade absoluta para vozes neurais e naturais de estúdio gratuitas
  if (name.includes("online (natural)") || name.includes("natural")) score += 65;
  if (name.includes("neural")) score += 60;
  if (name.includes("google")) score += 45;
  if (name.includes("siri")) score += 40;
  if (name.includes("enhanced") || name.includes("premium")) score += 35;
  if (voice.localService) score += 10;
  // Penaliza vozes mecânicas/robóticas legadas
  if (name.includes("compact") || name.includes("espeak") || name.includes("robotic")) score -= 60;

  return score;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices() || [];
}

/** Espera que a lista de vozes do sistema esteja disponível. */
export function waitForVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const immediate = listVoices();
    if (immediate.length > 0) {
      resolve(immediate);
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.onvoiceschanged = null;
      resolve(listVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    window.setTimeout(finish, timeoutMs);
  });
}

export function getPreferredLang(): string {
  if (typeof window === "undefined") return "pt-PT";
  const stored = localStorage.getItem(LANG_KEY);
  if (stored) return stored;
  return navigator.language || "pt-PT";
}

export function setPreferredVoice(voice: SpeechSynthesisVoice | null) {
  if (typeof window === "undefined") return;
  if (!voice) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, voice.voiceURI);
  if (voice.lang) localStorage.setItem(LANG_KEY, voice.lang);
}

/**
 * Devolve sempre a mesma voz: a guardada, se ainda existir no dispositivo,
 * caso contrário a melhor disponível para o idioma — que passa a ser fixada.
 */
export function resolveStableVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (voices.length === 0) return null;

  if (typeof window !== "undefined") {
    const savedUri = localStorage.getItem(STORAGE_KEY);
    if (savedUri) {
      const saved = voices.find((v) => v.voiceURI === savedUri);
      if (saved) return saved;
    }
  }

  const lang = getPreferredLang();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = preferenceScore(voice, lang);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  if (!best) best = voices[0] || null;
  setPreferredVoice(best);
  return best;
}

/** Aplica a voz fixada a um enunciado antes de falar. */
export function applyStableVoice(utterance: SpeechSynthesisUtterance) {
  const voice = resolveStableVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || getPreferredLang();
  } else {
    utterance.lang = getPreferredLang();
  }
}

/** URI da voz fixada, se existir. */
export function getStoredVoiceUri(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
