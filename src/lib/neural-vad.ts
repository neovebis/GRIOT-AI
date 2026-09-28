/**
 * Deteção de fala por rede neuronal (Silero VAD, WASM no browser).
 *
 * Substitui a deteção por energia: distingue voz humana de ruído, televisão,
 * teclado ou vento, e marca o fim da fala no momento certo em vez de esperar
 * por um temporizador de silêncio. Carrega de forma dinâmica — se o WASM não
 * estiver disponível, quem chama volta ao detetor por energia.
 */

export type NeuralVadEvents = {
  /** Fala começou (ainda pode ser um falso arranque). */
  onSpeechStart: () => void;
  /** Fala confirmada como real (passou do mínimo de frames). */
  onSpeechRealStart: () => void;
  /** Fim da fala: áudio completo do turno, 16 kHz mono. */
  onSpeechEnd: (audio: Float32Array) => void;
  /** Arranque falso: demasiado curto para ser um turno. */
  onMisfire: () => void;
  /** Cada frame (~32 ms): probabilidade de fala e as amostras. */
  onFrame: (probability: number, frame: Float32Array) => void;
};

export type NeuralVadHandle = {
  destroy: () => void;
};

/** Amostragem do detetor: o Silero trabalha a 16 kHz. */
export const VAD_SAMPLE_RATE = 16000;

/** Versão do onnxruntime-web instalada — o WASM vem do CDN correspondente. */
const ORT_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";

/**
 * Arranca o detetor sobre um stream de microfone já aberto.
 * Devolve null quando o modelo não carrega (sem rede, WASM bloqueado, etc.).
 */
export async function startNeuralVad(
  stream: MediaStream,
  events: NeuralVadEvents,
): Promise<NeuralVadHandle | null> {
  try {
    const { MicVAD } = await import("@ricky0123/vad-web");

    const vad = await MicVAD.new({
      model: "v5",
      // Worklet e modelo servidos da própria app; o runtime WASM vem do CDN.
      baseAssetPath: "/vad/",
      onnxWASMBasePath: ORT_WASM_BASE,
      getStream: async () => stream,
      positiveSpeechThreshold: 0.50,
      negativeSpeechThreshold: 0.35,
      // ~650 ms de silêncio natural para pausa conversacional humana sem cortar frases
      redemptionMs: 650,
      // Menos de ~180 ms de fala é ruído descartável
      minSpeechMs: 180,
      // Guarda 500 ms de áudio antes do início para garantir que nenhuma consoante ou sílaba inicial é cortada
      preSpeechPadMs: 500,
      startOnLoad: true,
      onSpeechStart: () => events.onSpeechStart(),
      onSpeechRealStart: () => events.onSpeechRealStart(),
      onSpeechEnd: (audio) => events.onSpeechEnd(audio),
      onVADMisfire: () => events.onMisfire(),
      onFrameProcessed: (probabilities, frame) => events.onFrame(probabilities.isSpeech, frame),
    });

    await vad.start().catch(() => undefined);

    return {
      destroy: () => {
        void vad.destroy().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
